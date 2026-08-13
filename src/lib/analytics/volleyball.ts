import type {
  EventType,
  Match,
  Player,
  PlayerPosition,
  StatEvent,
} from "../types";
import { lines, defensiveScore, type PlayerLine } from "../metrics";
import { setTally } from "./general";
import {
  registerSport,
  type ComparisonMetric,
  type DistributionSeries,
  type Kpi,
  type MatchAnalytics,
  type MatchContext,
  type Performer,
  type ProgressionPoint,
  type SportModule,
  type StatTable,
  type TeamStatLine,
  type TimelineItem,
} from "./framework";

/**
 * VOLLEYBALL MODULE — the first concrete SportModule.
 *
 * Turns raw StatEvents + set scores into the normalised MatchAnalytics the
 * dashboard renders. All volleyball-specific knowledge (scoring rules,
 * side-out vs break point, position→court-zone mapping) is confined here;
 * the framework and UI stay sport-neutral.
 */

// ---------------------------------------------------------------------
// Point-sequence reconstruction — the spine of timeline & momentum.
// ---------------------------------------------------------------------

/**
 * Events that END a rally: the acting team scores.
 *
 * SPIKE_BLOCKED and BLOCK_TOOLED are absent BY DESIGN. A blocked attack and a
 * tool each log two events — one for the spiker, one for the blocker — and only
 * the winner's half is listed here or in ERR_EVENTS. Add either of them and
 * every one of those rallies scores twice, silently, everywhere downstream.
 */
const WIN_EVENTS = new Set<EventType>([
  "SPIKE_POINT",
  "SPIKE_TOOL",
  "SERVE_ACE",
  "BLOCK_WIN",
]);
/** Events that END a rally as an error: the OTHER team scores. */
const ERR_EVENTS = new Set<EventType>([
  "SPIKE_ERR",
  "SERVE_ERR",
  "RECV_ERR",
  "SET_ERR",
  "BLOCK_MISS",
  "DIG_FAIL",
]);

const EVENT_LABEL: Partial<Record<EventType, string>> = {
  // Court words, not scoresheet words. A coach shouting from the bench says
  // "spike" and "checkout"; the stored EventType keeps its original name, so
  // nothing already recorded has to be migrated to read correctly.
  SPIKE_POINT: "Spike",
  SPIKE_TOOL: "Checkout",
  SERVE_ACE: "Ace",
  BLOCK_WIN: "Block",
  SPIKE_ERR: "Attack error",
  SERVE_ERR: "Service error",
  RECV_ERR: "Reception error",
  SET_ERR: "Setting error",
  BLOCK_MISS: "Block error",
  DIG_FAIL: "Dig error",
};

export interface RallyOutcome {
  ts: number;
  setNo: number;
  scorer: "home" | "away";
  /** True when the point was won on serve (a break point). */
  breakPoint: boolean;
  /** True when the point was won by the receiving team (a side-out). */
  sideOut: boolean;
  /** True when a side-out was won on the first attack (first-ball side-out). */
  firstBall: boolean;
  type: EventType;
}

/**
 * Walk events in time order and reconstruct who won each rally, whether it
 * was a break point or a side-out, and roughly how long the point took.
 *
 * The server of the first rally of a set is unknown from events alone (it
 * comes from the toss), so we follow the FIVB alternation convention:
 * home serves the odd sets, away the even ones. Thereafter the winner of a
 * rally serves the next — which is exactly how side-out / break points fall
 * out, so the classification is correct from that assumption onward.
 */
export function rallyOutcomes(
  events: StatEvent[],
  homeTeamId: string,
): RallyOutcome[] {
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const outcomes: RallyOutcome[] = [];
  let curSet = 0;
  let server: "home" | "away" = "home";
  let firstContactWasReceive = false;

  for (const e of ordered) {
    const side: "home" | "away" = e.teamId === homeTeamId ? "home" : "away";

    if (e.setNo !== curSet) {
      curSet = e.setNo;
      // Alternate first server by set (odd → home, even → away).
      server = curSet % 2 === 1 ? "home" : "away";
      firstContactWasReceive = false;
    }

    if (e.type === "RECV_PERFECT" || e.type === "RECV_GOOD") {
      firstContactWasReceive = true;
    }

    let scorer: "home" | "away" | null = null;
    if (WIN_EVENTS.has(e.type)) scorer = side;
    else if (ERR_EVENTS.has(e.type)) scorer = side === "home" ? "away" : "home";
    if (scorer === null) continue; // rally continues

    const sideOut = scorer !== server;
    outcomes.push({
      ts: e.ts,
      setNo: e.setNo,
      scorer,
      breakPoint: scorer === server,
      sideOut,
      firstBall:
        sideOut &&
        firstContactWasReceive &&
        (e.type === "SPIKE_POINT" || e.type === "SPIKE_TOOL"),
      type: e.type,
    });
    server = scorer; // winner serves next
    firstContactWasReceive = false;
  }
  return outcomes;
}

/** Cumulative match progression for the score-timeline / momentum chart. */
export function progression(
  events: StatEvent[],
  homeTeamId: string,
): ProgressionPoint[] {
  const outcomes = rallyOutcomes(events, homeTeamId);
  let home = 0;
  let away = 0;
  return outcomes.map((o, i) => {
    if (o.scorer === "home") home++;
    else away++;
    return {
      rally: i + 1,
      setNo: o.setNo,
      home,
      away,
      margin: home - away,
      scorer: o.scorer,
      label: `${EVENT_LABEL[o.type] ?? o.type} · ${o.scorer === "home" ? "home" : "away"}`,
    };
  });
}

/** The longest unanswered scoring run by either side. */
export function biggestRun(
  outcomes: RallyOutcome[],
): { side: "home" | "away"; run: number } {
  let best = { side: "home" as "home" | "away", run: 0 };
  let curSide: "home" | "away" | null = null;
  let cur = 0;
  for (const o of outcomes) {
    if (o.scorer === curSide) cur++;
    else {
      curSide = o.scorer;
      cur = 1;
    }
    if (cur > best.run) best = { side: curSide, run: cur };
  }
  return best;
}

// ---------------------------------------------------------------------
// Raw counts & tempo
// ---------------------------------------------------------------------

function countByType(
  events: StatEvent[],
  teamId: string,
): Record<EventType, number> {
  const c = {} as Record<EventType, number>;
  for (const e of events) {
    if (e.teamId !== teamId) continue;
    c[e.type] = (c[e.type] ?? 0) + 1;
  }
  return c;
}

const num = (v: number | undefined) => v ?? 0;
const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : null;

/** Fastest / longest / average point in ms, from timestamp gaps within sets. */
function tempo(outcomes: RallyOutcome[]): {
  fastest: number | null;
  longest: number | null;
  durationMs: number | null;
} {
  const gaps: number[] = [];
  for (let i = 1; i < outcomes.length; i++) {
    if (outcomes[i].setNo !== outcomes[i - 1].setNo) continue;
    const gap = outcomes[i].ts - outcomes[i - 1].ts;
    // Guard against long stoppages (timeouts, substitutions).
    if (gap > 0 && gap < 120_000) gaps.push(gap);
  }
  const durationMs =
    outcomes.length > 1
      ? outcomes[outcomes.length - 1].ts - outcomes[0].ts
      : null;
  if (gaps.length === 0) return { fastest: null, longest: null, durationMs };
  return {
    fastest: Math.min(...gaps),
    longest: Math.max(...gaps),
    durationMs,
  };
}

// ---------------------------------------------------------------------
// Court zones — representative maps (no per-contact coordinates exist).
// ---------------------------------------------------------------------

/**
 * Each position's primary court zone (FIVB slots 1–6). Used to spread a
 * player's activity onto a representative court heatmap; this is a coaching
 * approximation from role, NOT tracked (x,y) data — the UI labels it so.
 */
const POSITION_ZONE: Record<PlayerPosition, number> = {
  OH: 4,
  OPP: 2,
  MB: 3,
  S: 2,
  L: 6,
  DS: 5,
  U: 2, // universal: attacks from the right like an opposite
};
const ZONE_LABEL: Record<number, string> = {
  1: "Zone 1 · back-right (serve)",
  2: "Zone 2 · front-right",
  3: "Zone 3 · middle",
  4: "Zone 4 · front-left",
  5: "Zone 5 · back-left",
  6: "Zone 6 · back-centre",
};

function courtZones(roster: Player[], events: StatEvent[]): DistributionSeries {
  const byPlayer = new Map<string, number>();
  for (const e of events) byPlayer.set(e.playerId, (byPlayer.get(e.playerId) ?? 0) + 1);
  const zoneCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const p of roster) {
    const zone = p.position ? POSITION_ZONE[p.position] : 6;
    zoneCounts[zone] += byPlayer.get(p.id) ?? 0;
  }
  return {
    key: "court",
    label: "Court activity heatmap",
    hint: "Representative — contacts placed by player role, not tracked coordinates.",
    shape: "court",
    data: [1, 2, 3, 4, 5, 6].map((z) => ({
      key: String(z),
      label: ZONE_LABEL[z],
      value: zoneCounts[z],
    })),
  };
}

function attackByZone(roster: Player[], events: StatEvent[]): DistributionSeries {
  // Kills grouped by the attacker's front-row zone (2/3/4).
  const zoneKills: Record<number, number> = { 2: 0, 3: 0, 4: 0 };
  const posOf = new Map(roster.map((p) => [p.id, p.position] as const));
  for (const e of events) {
    if (e.type !== "SPIKE_POINT" && e.type !== "SPIKE_TOOL") continue;
    const pos = posOf.get(e.playerId);
    const zone = pos ? POSITION_ZONE[pos] : 3;
    if (zone === 2 || zone === 3 || zone === 4) zoneKills[zone]++;
  }
  return {
    key: "attack-zone",
    label: "Attack distribution (by zone)",
    hint: "Spikes by attacking lane — representative, from hitter role.",
    shape: "bar",
    data: [
      { key: "4", label: "Zone 4 (outside)", value: zoneKills[4], tone: "accent" },
      { key: "3", label: "Zone 3 (middle)", value: zoneKills[3], tone: "azure" },
      { key: "2", label: "Zone 2 (opposite)", value: zoneKills[2], tone: "violet" },
    ],
  };
}

// ---------------------------------------------------------------------
// Team stat line
// ---------------------------------------------------------------------

function teamStatLine(
  teamId: string,
  isHome: boolean,
  match: Match,
  events: StatEvent[],
  outcomes: RallyOutcome[],
): TeamStatLine {
  const c = countByType(events, teamId);
  const tally = setTally(match);
  const setsWon = isHome ? tally.home : tally.away;
  const setsLost = isHome ? tally.away : tally.home;
  const totalPoints = match.setScores.reduce(
    (s, x) => s + (isHome ? x.homePoints : x.awayPoints),
    0,
  );

  // Attack points means spikes AND checkouts together, so the team's attack %
  // does not drop when a scorer credits the block-out. The row below is labelled
  // "Attack Points" rather than "Spikes" for exactly that reason — the narrower
  // word belongs to the SPIKE_POINT slice in the attack-outcomes pie.
  const kills = num(c.SPIKE_POINT) + num(c.SPIKE_TOOL);
  const attackErr = num(c.SPIKE_ERR) + num(c.SPIKE_BLOCKED);
  const attackAttempts = kills + num(c.SPIKE_IN) + attackErr;
  const aces = num(c.SERVE_ACE);
  const serveAttempts = aces + num(c.SERVE_IN) + num(c.SERVE_ERR);
  const serveErr = num(c.SERVE_ERR);
  const recvAttempts = num(c.RECV_PERFECT) + num(c.RECV_GOOD) + num(c.RECV_POOR) + num(c.RECV_ERR);
  const recvPositive = num(c.RECV_PERFECT) + num(c.RECV_GOOD);
  const recvErr = num(c.RECV_ERR);
  const blocks = num(c.BLOCK_WIN);
  const digs = num(c.DIG_SUPER) + num(c.DIG_SAVE);
  const assists = num(c.SET_ASSIST);

  const side: "home" | "away" = isHome ? "home" : "away";
  const mine = outcomes.filter((o) => o.scorer === side);
  const sideOuts = mine.filter((o) => o.sideOut).length;
  const sideOutChances = outcomes.filter(
    (o) => (o.scorer === side ? o.sideOut : !o.sideOut),
  ).length; // rallies this team received
  const breaks = mine.filter((o) => o.breakPoint).length;
  const serveChances = outcomes.filter(
    (o) => (o.scorer === side ? o.breakPoint : o.sideOut),
  ).length; // rallies this team served
  const firstBall = mine.filter((o) => o.firstBall).length;

  return {
    teamId,
    stats: [
      { key: "points", label: "Total Points", value: totalPoints },
      { key: "sets", label: "Sets Won / Lost", value: `${setsWon} / ${setsLost}` },
      { key: "kills", label: "Attack Points", value: kills },
      { key: "attAtt", label: "Attack Attempts", value: attackAttempts },
      { key: "attPct", label: "Attack Success", value: pct(kills, attackAttempts) ?? "—", unit: "%" },
      { key: "attErr", label: "Attack Errors", value: attackErr },
      { key: "assists", label: "Assists", value: assists },
      { key: "aces", label: "Service Aces", value: aces },
      { key: "serveErr", label: "Service Errors", value: serveErr },
      { key: "recvErr", label: "Reception Errors", value: recvErr },
      { key: "recvEff", label: "Reception Efficiency", value: pct(recvPositive, recvAttempts) ?? "—", unit: "%" },
      { key: "blocks", label: "Block Points", value: blocks },
      { key: "digs", label: "Digs", value: digs },
      { key: "sideout", label: "Side-out %", value: pct(sideOuts, sideOutChances) ?? "—", unit: "%" },
      { key: "firstball", label: "First-ball Side-out %", value: pct(firstBall, sideOutChances) ?? "—", unit: "%" },
      { key: "break", label: "Break Point %", value: pct(breaks, serveChances) ?? "—", unit: "%" },
      { key: "soloBlk", label: "Solo Blocks", value: "—", note: "Not captured courtside" },
      { key: "blkAssist", label: "Block Assists", value: "—", note: "Not captured courtside" },
      { key: "possession", label: "Ball Possession", value: "N/A", note: "Not applicable to volleyball" },
    ],
  };
}

// ---------------------------------------------------------------------
// Comparison metrics (radar + bars)
// ---------------------------------------------------------------------

function comparison(
  homeId: string,
  awayId: string,
  match: Match,
  events: StatEvent[],
): ComparisonMetric[] {
  const ch = countByType(events, homeId);
  const ca = countByType(events, awayId);
  const tally = setTally(match);

  /** Points from the attack — spikes and checkouts — over every attempt. */
  const attackPoints = (c: Record<EventType, number>) =>
    num(c.SPIKE_POINT) + num(c.SPIKE_TOOL);
  const attackPct = (c: Record<EventType, number>) => {
    const att =
      attackPoints(c) + num(c.SPIKE_IN) + num(c.SPIKE_ERR) + num(c.SPIKE_BLOCKED);
    return att ? Math.round((attackPoints(c) / att) * 100) : 0;
  };
  const recvPct = (c: Record<EventType, number>) => {
    const att = num(c.RECV_PERFECT) + num(c.RECV_GOOD) + num(c.RECV_POOR) + num(c.RECV_ERR);
    return att ? Math.round(((num(c.RECV_PERFECT) + num(c.RECV_GOOD)) / att) * 100) : 0;
  };
  const homePts = match.setScores.reduce((s, x) => s + x.homePoints, 0);
  const awayPts = match.setScores.reduce((s, x) => s + x.awayPoints, 0);

  return [
    { key: "points", label: "Points", home: homePts, away: awayPts },
    { key: "sets", label: "Sets Won", home: tally.home, away: tally.away, max: match.totalSets },
    { key: "kills", label: "Attack Points", home: attackPoints(ch), away: attackPoints(ca) },
    { key: "aces", label: "Aces", home: num(ch.SERVE_ACE), away: num(ca.SERVE_ACE) },
    { key: "blocks", label: "Blocks", home: num(ch.BLOCK_WIN), away: num(ca.BLOCK_WIN) },
    { key: "digs", label: "Digs", home: num(ch.DIG_SUPER) + num(ch.DIG_SAVE), away: num(ca.DIG_SUPER) + num(ca.DIG_SAVE) },
    { key: "attackPct", label: "Attack %", home: attackPct(ch), away: attackPct(ca), unit: "%", max: 100 },
    { key: "recvPct", label: "Reception %", home: recvPct(ch), away: recvPct(ca), unit: "%", max: 100 },
    {
      key: "errors",
      label: "Errors",
      // SPIKE_BLOCKED belongs here and BLOCK_TOOLED does not: an attack the
      // block stopped cost the point, being tooled cost nothing but the duel.
      home: num(ch.SPIKE_ERR) + num(ch.SPIKE_BLOCKED) + num(ch.SERVE_ERR) + num(ch.RECV_ERR) + num(ch.SET_ERR) + num(ch.BLOCK_MISS) + num(ch.DIG_FAIL),
      away: num(ca.SPIKE_ERR) + num(ca.SPIKE_BLOCKED) + num(ca.SERVE_ERR) + num(ca.RECV_ERR) + num(ca.SET_ERR) + num(ca.BLOCK_MISS) + num(ca.DIG_FAIL),
      higherIsBetter: false,
    },
  ];
}

// ---------------------------------------------------------------------
// Player analytics — awards + efficiency
// ---------------------------------------------------------------------

const firstName = (n: string) => n.split(" ")[0];

function setsPlayed(playerId: string, events: StatEvent[], fallback: number): number {
  const sets = new Set(events.filter((e) => e.playerId === playerId).map((e) => e.setNo));
  return sets.size || fallback;
}

export interface PlayerAnalytic extends PlayerLine {
  name: string;
  teamId: string;
  teamShort: string;
  position: PlayerPosition | null;
  pointsPerSet: number;
  errorRate: number | null; // 0..100
  contributionPct: number; // 0..100 of team's positive contribution
  efficiencyRating: number; // == contribution (weighted impact index)
}

export function playerAnalytics(ctx: MatchContext): PlayerAnalytic[] {
  const { events, homeRoster, awayRoster, homeTeam, awayTeam, match } = ctx;
  const roster = [...homeRoster, ...awayRoster];
  const meta = new Map<string, { name: string; teamId: string; teamShort: string; position: PlayerPosition | null }>();
  for (const p of homeRoster) meta.set(p.id, { name: p.fullName, teamId: homeTeam.id, teamShort: homeTeam.shortName, position: p.position });
  for (const p of awayRoster) meta.set(p.id, { name: p.fullName, teamId: awayTeam.id, teamShort: awayTeam.shortName, position: p.position });

  const ls = lines(roster, events);
  const setCount = match.setScores.length || 1;

  // Team positive-contribution totals for contribution %.
  const teamContribTotal = new Map<string, number>();
  for (const l of ls) {
    const m = meta.get(l.playerId);
    if (!m) continue;
    if (l.contribution > 0)
      teamContribTotal.set(m.teamId, (teamContribTotal.get(m.teamId) ?? 0) + l.contribution);
  }

  return ls.map((l) => {
    const m = meta.get(l.playerId)!;
    const totalActions =
      l.spikeAttempts + l.serveAttempts + l.receiveAttempts + l.setAttempts + l.blockAttempts + l.digAttempts;
    const sp = setsPlayed(l.playerId, events, setCount);
    return {
      ...l,
      name: m.name,
      teamId: m.teamId,
      teamShort: m.teamShort,
      position: m.position,
      pointsPerSet: sp ? Math.round((l.points / sp) * 10) / 10 : 0,
      errorRate: totalActions ? Math.round((l.errors / totalActions) * 1000) / 10 : null,
      contributionPct: (() => {
        const total = teamContribTotal.get(m.teamId) ?? 0;
        return total > 0 && l.contribution > 0
          ? Math.round((l.contribution / total) * 1000) / 10
          : 0;
      })(),
      efficiencyRating: l.contribution,
    };
  });
}

function performers(analytics: PlayerAnalytic[]): Performer[] {
  const active = analytics.filter(
    (a) => a.points + a.aces + a.blocks + a.assists + a.saves > 0,
  );
  if (active.length === 0) return [];
  const to = (a: PlayerAnalytic, award: string, value: number | string, unit: string, detail?: string): Performer => ({
    playerId: a.playerId,
    name: a.name,
    teamId: a.teamId,
    teamShort: a.teamShort,
    award,
    value,
    unit,
    detail,
  });
  const top = <T>(arr: PlayerAnalytic[], score: (a: PlayerAnalytic) => number) =>
    [...arr].sort((x, y) => score(y) - score(x))[0];

  const out: Performer[] = [];
  const mvp = top(active, (a) => a.contribution);
  if (mvp) out.push(to(mvp, "MVP", Math.round(mvp.contribution), "impact", `${mvp.points} pts · ${mvp.teamShort}`));
  const server = top(active, (a) => a.aces * 10 + (a.serveAttempts - a.serveErrors));
  if (server && server.aces > 0) out.push(to(server, "Best Server", server.aces, "aces"));
  const attacker = top(active, (a) => a.points);
  if (attacker && attacker.points > 0) out.push(to(attacker, "Best Attacker", attacker.points, "attack pts", attacker.successRate != null ? `${attacker.successRate}%` : undefined));
  const blocker = top(active, (a) => a.blocks);
  if (blocker && blocker.blocks > 0) out.push(to(blocker, "Best Blocker", blocker.blocks, "blocks"));
  const defender = top(active, (a) => defensiveScore(a));
  if (defender && defensiveScore(defender) > 0) out.push(to(defender, "Best Defender", Math.round(defensiveScore(defender)), "def. score", `${defender.saves} digs`));
  const setter = top(active, (a) => a.assists);
  if (setter && setter.assists > 0) out.push(to(setter, "Best Setter", setter.assists, "assists"));
  return out;
}

function boxScore(analytics: PlayerAnalytic[]): StatTable {
  const rows = analytics
    .filter((a) => a.points + a.aces + a.blocks + a.assists + a.saves + a.errors > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .map((a) => ({
      player: a.name,
      team: a.teamShort,
      pts: a.points,
      k: a.spikeSuccesses,
      ace: a.aces,
      blk: a.blocks,
      ast: a.assists,
      dig: a.saves,
      err: a.errors,
      eff: a.successRate ?? "—",
      pps: a.pointsPerSet,
    }));
  return {
    title: "Box score",
    columns: [
      { key: "player", label: "Player", align: "left" },
      { key: "team", label: "Team", align: "left" },
      { key: "pts", label: "Pts", align: "right" },
      { key: "ace", label: "Aces", align: "right" },
      { key: "blk", label: "Blk", align: "right" },
      { key: "ast", label: "Ast", align: "right" },
      { key: "dig", label: "Dig", align: "right" },
      { key: "err", label: "Err", align: "right" },
      { key: "eff", label: "Eff%", align: "right" },
      { key: "pps", label: "P/Set", align: "right" },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------

function buildTimeline(match: Match, outcomes: RallyOutcome[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const bySet = new Map<number, RallyOutcome[]>();
  for (const o of outcomes) {
    const arr = bySet.get(o.setNo) ?? [];
    arr.push(o);
    bySet.set(o.setNo, arr);
  }
  for (const s of match.setScores) {
    const homeWon = s.homePoints > s.awayPoints;
    items.push({
      ts: bySet.get(s.setNo)?.[bySet.get(s.setNo)!.length - 1]?.ts ?? 0,
      setNo: s.setNo,
      side: homeWon ? "home" : "away",
      kind: "SET_END",
      title: `Set ${s.setNo} — ${s.homePoints}–${s.awayPoints}`,
      detail: `${homeWon ? "Home" : "Away"} takes it`,
    });
  }
  return items.sort((a, b) => a.setNo - b.setNo);
}

// ---------------------------------------------------------------------
// Headline KPIs
// ---------------------------------------------------------------------

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ---------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------

function analyzeMatch(ctx: MatchContext): MatchAnalytics {
  const { match, homeTeam, awayTeam, events } = ctx;
  const outcomes = rallyOutcomes(events, homeTeam.id);
  const prog = progression(events, homeTeam.id);
  const tally = setTally(match);
  const t = tempo(outcomes);
  const run = biggestRun(outcomes);
  const analytics = playerAnalytics(ctx);

  const winner =
    match.winnerTeamId === homeTeam.id
      ? "home"
      : match.winnerTeamId === awayTeam.id
        ? "away"
        : tally.home === tally.away
          ? null
          : tally.home > tally.away
            ? "home"
            : "away";

  const homePts = match.setScores.reduce((s, x) => s + x.homePoints, 0);
  const awayPts = match.setScores.reduce((s, x) => s + x.awayPoints, 0);
  const mvp = [...analytics].sort((a, b) => b.contribution - a.contribution)[0];

  const headline: Kpi[] = [
    { key: "winner", label: "Winner", value: winner === "home" ? homeTeam.name : winner === "away" ? awayTeam.name : "—", tone: "accent" },
    { key: "score", label: "Sets", value: `${tally.home}–${tally.away}`, tone: "azure" },
    { key: "points", label: "Total Points", value: homePts + awayPts },
    { key: "duration", label: "Duration", value: fmtDuration(t.durationMs), hint: "From first to last logged rally" },
    { key: "rallies", label: "Rallies", value: outcomes.length },
    { key: "run", label: "Biggest Run", value: run.run, unit: "pts", hint: `${run.side === "home" ? homeTeam.shortName : awayTeam.shortName}`, tone: "violet" },
    { key: "mvp", label: "MVP", value: mvp ? firstName(mvp.name) : "—", hint: mvp ? `${Math.round(mvp.contribution)} impact` : undefined, tone: "ok" },
    { key: "fastest", label: "Fastest Point", value: t.fastest != null ? `${(t.fastest / 1000).toFixed(1)}s` : "—" },
  ];

  return {
    sport: "volleyball",
    matchId: match.id,
    result: {
      homeSetsWon: tally.home,
      awaySetsWon: tally.away,
      winner,
      scoreline: `${tally.home}–${tally.away}`,
    },
    headline,
    comparison: comparison(homeTeam.id, awayTeam.id, match, events),
    teamStats: {
      home: teamStatLine(homeTeam.id, true, match, events, outcomes),
      away: teamStatLine(awayTeam.id, false, match, events, outcomes),
    },
    performers: performers(analytics),
    boxScore: boxScore(analytics),
    progression: prog,
    timeline: buildTimeline(match, outcomes),
    distributions: [
      attackOutcomes(homeTeam.id, awayTeam.id, events, homeTeam.shortName, awayTeam.shortName),
      serveOutcomes(homeTeam.id, awayTeam.id, events, homeTeam.shortName, awayTeam.shortName),
      attackByZone(ctx.homeRoster, events.filter((e) => e.teamId === homeTeam.id)),
      courtZones([...ctx.homeRoster, ...ctx.awayRoster], events),
    ],
    durationMs: t.durationMs,
  };
}

function attackOutcomes(
  homeId: string,
  awayId: string,
  events: StatEvent[],
  homeShort: string,
  awayShort: string,
): DistributionSeries {
  const ch = countByType(events, homeId);
  const ca = countByType(events, awayId);
  void homeShort;
  void awayShort;
  return {
    key: "attack-outcomes",
    label: "Attack outcomes",
    hint: "Every attack, resolved: spike, checkout, kept in play, blocked, or error.",
    shape: "pie",
    // Five slices rather than three: the two that only the ✓/✗ sub-options can
    // tell apart are worth their own colour, and both are zero for a match
    // collected before they existed, so the chart simply reads as it always did.
    data: [
      { key: "kill", label: "Spikes", value: num(ch.SPIKE_POINT) + num(ca.SPIKE_POINT), tone: "ok" },
      { key: "tool", label: "Checkouts", value: num(ch.SPIKE_TOOL) + num(ca.SPIKE_TOOL), tone: "violet" },
      { key: "in", label: "In play", value: num(ch.SPIKE_IN) + num(ca.SPIKE_IN), tone: "azure" },
      { key: "blocked", label: "Blocked", value: num(ch.SPIKE_BLOCKED) + num(ca.SPIKE_BLOCKED), tone: "dim" },
      { key: "err", label: "Errors", value: num(ch.SPIKE_ERR) + num(ca.SPIKE_ERR), tone: "err" },
    ],
  };
}

function serveOutcomes(
  homeId: string,
  awayId: string,
  events: StatEvent[],
  homeShort: string,
  awayShort: string,
): DistributionSeries {
  const ch = countByType(events, homeId);
  const ca = countByType(events, awayId);
  void homeShort;
  void awayShort;
  return {
    key: "serve-outcomes",
    label: "Serve outcomes",
    hint: "Aces, serves in play, and service errors.",
    shape: "pie",
    data: [
      { key: "ace", label: "Aces", value: num(ch.SERVE_ACE) + num(ca.SERVE_ACE), tone: "accent" },
      { key: "in", label: "In play", value: num(ch.SERVE_IN) + num(ca.SERVE_IN), tone: "azure" },
      { key: "err", label: "Errors", value: num(ch.SERVE_ERR) + num(ca.SERVE_ERR), tone: "err" },
    ],
  };
}

export const volleyballModule: SportModule = {
  id: "volleyball",
  label: "Volleyball",
  icon: "🏐",
  analyzeMatch,
};

registerSport(volleyballModule);
