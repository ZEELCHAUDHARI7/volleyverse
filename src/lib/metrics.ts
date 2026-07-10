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
  saves: number; // DIG_SAVE
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
  saves: 0,
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
  DIG_SAVE: (l) => {
    l.saves++;
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
    line.saves * 1 +
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
  saves: number;
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
    saves: ls.reduce((s, l) => s + l.saves, 0),
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

export function topDefender(ls: PlayerLine[]): PlayerLine | undefined {
  return [...ls].sort(
    (a, b) => b.blocks * 2 + b.saves - (a.blocks * 2 + a.saves),
  )[0];
}
