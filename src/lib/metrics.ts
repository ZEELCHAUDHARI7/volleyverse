import type { EventType, Player, Role, StatEvent } from "./types";

/**
 * Derived metrics — pure functions, no storage (FR5).
 *
 * OPEN CLIENT QUESTION (planning Phase 5): the reference Excel's
 * "Game Impact %" formula is undefined (values exceed 100%).
 * Until the client signs off a formula, we ship a documented
 * Contribution Index instead — see contribution() below.
 */

export interface PlayerLine {
  playerId: string;
  // Spiker
  spikeAttempts: number;
  spikeSuccesses: number; // POINT + IN
  points: number; // POINT
  // Setter
  setAttempts: number;
  setSuccesses: number; // ASSIST + GOOD
  assists: number; // ASSIST
  // Centre
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
  /** Role-appropriate success rate, 0–100, null when no attempts. */
  successRate: number | null;
  /** Contribution Index — documented placeholder for "Game Impact". */
  contribution: number;
}

const zero = (playerId: string): PlayerLine => ({
  playerId,
  spikeAttempts: 0,
  spikeSuccesses: 0,
  points: 0,
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
  SPIKE_IN: (l) => {
    l.spikeAttempts++;
    l.spikeSuccesses++;
  },
  SPIKE_ERR: (l) => {
    l.spikeAttempts++;
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
};

function finalize(line: PlayerLine, role: Role): PlayerLine {
  const rate =
    role === "SPIKER"
      ? line.spikeAttempts > 0
        ? (line.spikeSuccesses / line.spikeAttempts) * 100
        : null
      : role === "SETTER"
        ? line.setAttempts > 0
          ? (line.setSuccesses / line.setAttempts) * 100
          : null
        : line.blockAttempts > 0
          ? (line.blocks / line.blockAttempts) * 100
          : null;

  // Contribution Index: direct points weighted highest; creation and
  // prevention valued; errors subtract. Pending client formula sign-off.
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
  return finalize(line, player.role);
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
// Season records engine (Suggestion 1 & 2): single-match highs, computed
// live from events so a record "breaks" the moment it happens courtside.
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
  points: ["SPIKE_POINT"],
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
