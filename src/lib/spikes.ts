import type { StatEvent } from "./types";

/**
 * SPIKE TALLIES — the only statistics the spiker demo derives.
 *
 * Deliberately separate from metrics.ts. PlayerLine.spikeSuccesses counts
 * SPIKE_IN as a success, so PlayerLine.successRate reads 100% for the
 * one-O-then-one-✓ case the product defines as 50%. Several existing
 * charts read that field, so it is left untouched and the definitions
 * the spiker screen needs live here.
 *
 * Callers must pass events already scoped to a single match — spikeLine
 * and spikeLines filter by playerId only, never by matchId.
 *
 * Pure: no React, no storage, no DOM. Type-only import so the Node
 * type-stripping test runner can load this file directly.
 */

export interface SpikeLine {
  playerId: string;
  /** Every tap: point + rally-continued + failed. */
  attempts: number;
  pointsWon: number; // SPIKE_POINT
  rallyContinued: number; // SPIKE_IN
  failed: number; // SPIKE_ERR
  /** pointsWon / attempts as whole percent. null when attempts === 0. */
  successRate: number | null;
  /** failed / attempts as whole percent. null when attempts === 0. */
  errorRate: number | null;
}

/** null rather than 0 for "no attempts" — charts drop them instead of drawing 0% bars. */
const rate = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 100);

export function spikeLine(playerId: string, events: StatEvent[]): SpikeLine {
  let pointsWon = 0;
  let rallyContinued = 0;
  let failed = 0;

  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.type === "SPIKE_POINT") pointsWon++;
    else if (e.type === "SPIKE_IN") rallyContinued++;
    else if (e.type === "SPIKE_ERR") failed++;
  }

  const attempts = pointsWon + rallyContinued + failed;
  return {
    playerId,
    attempts,
    pointsWon,
    rallyContinued,
    failed,
    successRate: rate(pointsWon, attempts),
    errorRate: rate(failed, attempts),
  };
}

export function spikeLines(playerIds: string[], events: StatEvent[]): SpikeLine[] {
  return playerIds.map((id) => spikeLine(id, events));
}
