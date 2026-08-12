import type { EventType, Match, Player, PlayerPosition, StatEvent } from "./types";

/**
 * Derived metrics — pure functions, no storage.
 *
 * Everything here computes from StatEvents and Match set scores; nothing
 * is stored by hand. In PostgreSQL these become SQL views over
 * stat_events + match_sets (see supabase/schema.sql).
 *
 * OPEN PRODUCT QUESTION: the Contribution Index below is a documented
 * placeholder weighting, pending a signed-off impact formula.
 */

export interface PlayerLine {
  playerId: string;
  // Attack
  spikeAttempts: number;
  spikeSuccesses: number; // POINT + IN
  points: number; // POINT
  // Receive (universal)
  receiveAttempts: number;
  receivesPerfect: number; // RECV_PERFECT only — pass-quality highlight
  receivesGood: number; // RECV_PERFECT + RECV_GOOD (positive passes)
  receiveErrors: number;
  // Setting
  setAttempts: number;
  setSuccesses: number; // ASSIST + GOOD
  assists: number; // ASSIST
  // Blocking
  blockAttempts: number;
  blocks: number; // WIN
  // Serve (universal)
  serveAttempts: number;
  aces: number;
  serveErrors: number;
  // Defence (universal)
  digAttempts: number;
  saves: number; // DIG_SAVE + DIG_SUPER (all successful digs)
  superDigs: number; // DIG_SUPER only — the highlight stat
  digFails: number;
  // Cross-role
  errors: number;
  /** Position-appropriate success rate, 0–100, null when no attempts. */
  successRate: number | null;
  /** Contribution Index — documented placeholder for impact. */
  contribution: number;
}

const zero = (playerId: string): PlayerLine => ({
  playerId,
  spikeAttempts: 0,
  spikeSuccesses: 0,
  points: 0,
  receiveAttempts: 0,
  receivesPerfect: 0,
  receivesGood: 0,
  receiveErrors: 0,
  setAttempts: 0,
  setSuccesses: 0,
  assists: 0,
  blockAttempts: 0,
  blocks: 0,
  serveAttempts: 0,
  aces: 0,
  serveErrors: 0,
  digAttempts: 0,
  saves: 0,
  superDigs: 0,
  digFails: 0,
  errors: 0,
  successRate: null,
  contribution: 0,
});

const COUNTERS: Record<EventType, (l: PlayerLine) => void> = {
  SPIKE_POINT: (l) => {
    l.spikeAttempts++;
    l.spikeSuccesses++;
    l.points++;
  },
  // A tool is a point exactly like a kill — the ball came off the block and
  // stayed out. `points` and `spikeSuccesses` cannot tell them apart on
  // purpose: every rate built on them (attack %, contribution) would otherwise
  // fall the moment collectors started saying WHICH kind of point it was.
  SPIKE_TOOL: (l) => {
    l.spikeAttempts++;
    l.spikeSuccesses++;
    l.points++;
  },
  SPIKE_IN: (l) => {
    l.spikeAttempts++;
    l.spikeSuccesses++;
  },
  SPIKE_ERR: (l) => {
    l.spikeAttempts++;
    l.errors++;
  },
  // Blocked is an attack error in the same sense SPIKE_ERR is: an attempt that
  // conceded the point. Which of the two it was lives in spikes.ts, where the
  // spiker screen needs the distinction; the league box score does not.
  SPIKE_BLOCKED: (l) => {
    l.spikeAttempts++;
    l.errors++;
  },
  RECV_PERFECT: (l) => {
    l.receiveAttempts++;
    l.receivesPerfect++;
    l.receivesGood++;
  },
  RECV_GOOD: (l) => {
    l.receiveAttempts++;
    l.receivesGood++;
  },
  RECV_POOR: (l) => {
    l.receiveAttempts++;
  },
  RECV_ERR: (l) => {
    l.receiveAttempts++;
    l.receiveErrors++;
    l.errors++;
  },
  SET_ASSIST: (l) => {
    l.setAttempts++;
    l.setSuccesses++;
    l.assists++;
  },
  SET_GOOD: (l) => {
    l.setAttempts++;
    l.setSuccesses++;
  },
  SET_ERR: (l) => {
    l.setAttempts++;
    l.errors++;
  },
  BLOCK_WIN: (l) => {
    l.blockAttempts++;
    l.blocks++;
  },
  BLOCK_MISS: (l) => {
    l.blockAttempts++;
    l.errors++;
  },
  // Deliberately NOT an error. Getting tooled is a duel lost, not a fault —
  // the attacker earned that point, and no scoresheet in the sport charges the
  // blocker for it. It grows the block denominator and nothing else.
  BLOCK_TOOLED: (l) => {
    l.blockAttempts++;
  },
  SERVE_ACE: (l) => {
    l.serveAttempts++;
    l.aces++;
  },
  SERVE_IN: (l) => {
    l.serveAttempts++;
  },
  SERVE_ERR: (l) => {
    l.serveAttempts++;
    l.serveErrors++;
    l.errors++;
  },
  DIG_SUPER: (l) => {
    l.digAttempts++;
    l.saves++;
    l.superDigs++;
  },
  DIG_SAVE: (l) => {
    l.digAttempts++;
    l.saves++;
  },
  DIG_FAIL: (l) => {
    l.digAttempts++;
    l.digFails++;
    l.errors++;
  },
  // Faults cost the team a point but belong to no skill line — they count
  // as errors and nothing else, so spike and serve percentages stay clean.
  FAULT_NET: (l) => {
    l.errors++;
  },
  FAULT_FOUR_HITS: (l) => {
    l.errors++;
  },
  FAULT_DOUBLE: (l) => {
    l.errors++;
  },
  FAULT_ROTATION: (l) => {
    l.errors++;
  },
};

/** The headline rate depends on what the position is on court to do. */
function positionRate(line: PlayerLine, position: PlayerPosition | null): number | null {
  if (position === null) return null; // no listed position → no headline rate
  const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  switch (position) {
    case "OH":
    case "OPP":
    case "U":
      // A Universal is judged on the attack like the other hitters: it is the
      // one job every club that uses the label agrees the role does.
      return pct(line.spikeSuccesses, line.spikeAttempts);
    case "S":
      return pct(line.setSuccesses, line.setAttempts);
    case "MB":
      return pct(line.blocks, line.blockAttempts);
    case "L":
    case "DS":
      // Positive first contacts: good passes + successful digs.
      return pct(
        line.receivesGood + line.saves,
        line.receiveAttempts + line.digAttempts,
      );
  }
}

function finalize(line: PlayerLine, position: PlayerPosition | null): PlayerLine {
  const rate = positionRate(line, position);

  // Contribution Index: direct points weighted highest; creation and
  // prevention valued; errors subtract. Pending product sign-off.
  const contribution =
    line.points * 2 +
    line.assists * 1.5 +
    line.blocks * 2 +
    line.aces * 2 + // instant point, same weight as a kill/block
    line.superDigs * 2.5 + // rarest act in the game — weighted accordingly
    (line.saves - line.superDigs) * 1 +
    (line.spikeSuccesses - line.points) * 0.5 +
    (line.setSuccesses - line.assists) * 0.5 -
    line.errors;

  return {
    ...line,
    successRate: rate === null ? null : Math.round(rate * 10) / 10,
    contribution: Math.round(contribution * 10) / 10,
  };
}

/** Aggregate one player's events (already filtered to a match/season scope). */
export function playerLine(
  player: Player,
  events: StatEvent[],
): PlayerLine {
  const line = zero(player.id);
  for (const e of events) {
    if (e.playerId === player.id) COUNTERS[e.type](line);
  }
  return finalize(line, player.position);
}

/** Aggregate all players for a scope of events. */
export function lines(players: Player[], events: StatEvent[]): PlayerLine[] {
  return players.map((p) => playerLine(p, events));
}

export interface TeamTotals {
  points: number;
  assists: number;
  blocks: number;
  aces: number;
  saves: number;
  superDigs: number;
  errors: number;
  spikeRate: number | null;
}

export function teamTotals(players: Player[], events: StatEvent[]): TeamTotals {
  const ls = lines(players, events);
  const attempts = ls.reduce((s, l) => s + l.spikeAttempts, 0);
  const successes = ls.reduce((s, l) => s + l.spikeSuccesses, 0);
  return {
    points: ls.reduce((s, l) => s + l.points, 0),
    assists: ls.reduce((s, l) => s + l.assists, 0),
    blocks: ls.reduce((s, l) => s + l.blocks, 0),
    aces: ls.reduce((s, l) => s + l.aces, 0),
    saves: ls.reduce((s, l) => s + l.saves, 0),
    superDigs: ls.reduce((s, l) => s + l.superDigs, 0),
    errors: ls.reduce((s, l) => s + l.errors, 0),
    spikeRate:
      attempts > 0 ? Math.round((successes / attempts) * 1000) / 10 : null,
  };
}

/**
 * Team-level aggregate for ONE side of a match, straight from events.
 * Powers the head-to-head stat bars. Percentages are null until the
 * first attempt exists, so the UI can render placeholders.
 */
export interface SideTotals {
  /** Points earned by own action: kills + aces + block wins. */
  earned: number;
  kills: number;
  spikeAttempts: number;
  /** Kill percentage. */
  attackPct: number | null;
  aces: number;
  serveAttempts: number;
  /** Serves that stayed in play (incl. aces). */
  servePct: number | null;
  recvPositive: number;
  recvAttempts: number;
  /** Positive-pass percentage. */
  recvPct: number | null;
  blocks: number;
  blockAttempts: number;
  blockPct: number | null;
  saves: number;
  superDigs: number;
  assists: number;
  errors: number;
}

export function sideTotals(events: StatEvent[], teamId: string): SideTotals {
  const t: SideTotals = {
    earned: 0,
    kills: 0,
    spikeAttempts: 0,
    attackPct: null,
    aces: 0,
    serveAttempts: 0,
    servePct: null,
    recvPositive: 0,
    recvAttempts: 0,
    recvPct: null,
    blocks: 0,
    blockAttempts: 0,
    blockPct: null,
    saves: 0,
    superDigs: 0,
    assists: 0,
    errors: 0,
  };
  let serveErrors = 0;
  for (const e of events) {
    if (e.teamId !== teamId) continue;
    switch (e.type) {
      case "SPIKE_POINT":
      case "SPIKE_TOOL":
        t.kills++;
        t.spikeAttempts++;
        t.earned++;
        break;
      case "SPIKE_IN":
        t.spikeAttempts++;
        break;
      case "SPIKE_ERR":
      case "SPIKE_BLOCKED":
        t.spikeAttempts++;
        t.errors++;
        break;
      case "SERVE_ACE":
        t.aces++;
        t.serveAttempts++;
        t.earned++;
        break;
      case "SERVE_IN":
        t.serveAttempts++;
        break;
      case "SERVE_ERR":
        t.serveAttempts++;
        serveErrors++;
        t.errors++;
        break;
      case "RECV_PERFECT":
      case "RECV_GOOD":
        t.recvAttempts++;
        t.recvPositive++;
        break;
      case "RECV_POOR":
        t.recvAttempts++;
        break;
      case "RECV_ERR":
        t.recvAttempts++;
        t.errors++;
        break;
      case "BLOCK_WIN":
        t.blocks++;
        t.blockAttempts++;
        t.earned++;
        break;
      case "BLOCK_MISS":
        t.blockAttempts++;
        t.errors++;
        break;
      // A beaten block, but not an error — see the COUNTERS note above.
      case "BLOCK_TOOLED":
        t.blockAttempts++;
        break;
      case "DIG_SUPER":
        t.saves++;
        t.superDigs++;
        break;
      case "DIG_SAVE":
        t.saves++;
        break;
      case "DIG_FAIL":
        t.errors++;
        break;
      case "SET_ASSIST":
        t.assists++;
        break;
      case "SET_GOOD":
        break;
      case "SET_ERR":
        t.errors++;
        break;
    }
  }
  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;
  t.attackPct = pct(t.kills, t.spikeAttempts);
  t.servePct = pct(t.serveAttempts - serveErrors, t.serveAttempts);
  t.recvPct = pct(t.recvPositive, t.recvAttempts);
  t.blockPct = pct(t.blocks, t.blockAttempts);
  return t;
}

/** Best performer helpers for the Match Dashboard. */
export function topBy(
  ls: PlayerLine[],
  key: keyof Pick<PlayerLine, "points" | "assists" | "contribution">,
): PlayerLine | undefined {
  return [...ls].sort((a, b) => (b[key] as number) - (a[key] as number))[0];
}

/** Defensive score: blocks + digs, super digs weighted (the hero stat). */
export function defensiveScore(l: PlayerLine): number {
  return l.blocks * 2 + (l.saves - l.superDigs) + l.superDigs * 2.5;
}

export function topDefender(ls: PlayerLine[]): PlayerLine | undefined {
  return [...ls].sort((a, b) => defensiveScore(b) - defensiveScore(a))[0];
}

// ---------------------------------------------------------------------
// Season records engine: single-match highs, computed live from events
// so a record "breaks" the moment it happens courtside.
// ---------------------------------------------------------------------

export type RecordStat = "aces" | "superDigs" | "points" | "blocks";

export interface SeasonRecord {
  stat: RecordStat;
  playerId: string;
  matchId: string;
  value: number;
}

const RECORD_EVENT: Record<RecordStat, EventType[]> = {
  aces: ["SERVE_ACE"],
  superDigs: ["DIG_SUPER"],
  // Tools count towards the points record: they are points, and a night of
  // clever hitting is as much a record as a night of powerful hitting.
  points: ["SPIKE_POINT", "SPIKE_TOOL"],
  blocks: ["BLOCK_WIN"],
};

/** Best single-match value for a stat across a set of events. */
export function seasonRecord(
  stat: RecordStat,
  events: StatEvent[],
): SeasonRecord | null {
  const counts = new Map<string, number>(); // `${matchId}|${playerId}` → n
  const types = new Set(RECORD_EVENT[stat]);
  for (const e of events) {
    if (!types.has(e.type)) continue;
    const key = `${e.matchId}|${e.playerId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: SeasonRecord | null = null;
  for (const [key, value] of counts) {
    if (!best || value > best.value) {
      const [matchId, playerId] = key.split("|");
      best = { stat, playerId, matchId, value };
    }
  }
  return best;
}

/**
 * Live record check: given all events BEFORE a new entry, did adding one
 * `type` event for this player in this match just break the season high?
 */
export function breaksRecord(
  stat: RecordStat,
  events: StatEvent[],
  matchId: string,
  playerId: string,
): boolean {
  const prior = seasonRecord(stat, events);
  const types = new Set(RECORD_EVENT[stat]);
  const mine = events.filter(
    (e) => e.matchId === matchId && e.playerId === playerId && types.has(e.type),
  ).length;
  // +1 for the event just tapped; a record only "breaks" if one existed
  return prior !== null && prior.value >= 2 && mine + 1 > prior.value;
}

// ---------------------------------------------------------------------
// Standings — derived per tournament (or group) from completed matches.
// In PostgreSQL this is the `standings` view; identical math.
// ---------------------------------------------------------------------

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** League points: 3–0/3–1 win = 3, 3–2 win = 2, 2–3 loss = 1, else 0. */
  points: number;
  rank: number;
}

export function standings(matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const row = (teamId: string): StandingRow => {
    let r = rows.get(teamId);
    if (!r) {
      r = {
        teamId,
        played: 0,
        won: 0,
        lost: 0,
        setsWon: 0,
        setsLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        points: 0,
        rank: 0,
      };
      rows.set(teamId, r);
    }
    return r;
  };

  for (const m of matches) {
    if (m.status !== "completed" || m.setScores.length === 0) continue;
    const home = row(m.homeTeamId);
    const away = row(m.awayTeamId);
    let homeSets = 0;
    let awaySets = 0;
    for (const s of m.setScores) {
      if (s.homePoints > s.awayPoints) homeSets++;
      else if (s.awayPoints > s.homePoints) awaySets++;
      home.pointsFor += s.homePoints;
      home.pointsAgainst += s.awayPoints;
      away.pointsFor += s.awayPoints;
      away.pointsAgainst += s.homePoints;
    }
    home.played++;
    away.played++;
    home.setsWon += homeSets;
    home.setsLost += awaySets;
    away.setsWon += awaySets;
    away.setsLost += homeSets;
    const homeWon = m.winnerTeamId
      ? m.winnerTeamId === m.homeTeamId
      : homeSets > awaySets;
    const [w, l, wSets, lSets] = homeWon
      ? [home, away, homeSets, awaySets]
      : [away, home, awaySets, homeSets];
    w.won++;
    l.lost++;
    // FIVB-style points split.
    if (wSets - lSets >= 2) {
      w.points += 3;
    } else {
      w.points += 2;
      l.points += 1;
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.won - a.won ||
      b.setsWon / Math.max(1, b.setsLost) - a.setsWon / Math.max(1, a.setsLost) ||
      b.pointsFor / Math.max(1, b.pointsAgainst) -
        a.pointsFor / Math.max(1, a.pointsAgainst),
  );
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}
