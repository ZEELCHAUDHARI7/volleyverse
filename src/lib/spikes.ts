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
  /** Points from the attack: kills AND tools. */
  pointsWon: number;
  rallyContinued: number; // SPIKE_IN
  /** Attacks that cost the point: own errors AND getting blocked. */
  failed: number;
  // The four ways an attack can end, kept apart. pointsWon = kills + tools and
  // failed = errors + blocked, so the two rates below mean what they always
  // meant — the split adds detail without moving any existing number.
  kills: number; // SPIKE_POINT
  tools: number; // SPIKE_TOOL — used the blocker to score
  errors: number; // SPIKE_ERR — into the net or out
  blocked: number; // SPIKE_BLOCKED — stopped at the net
  /** pointsWon / attempts as whole percent. null when attempts === 0. */
  successRate: number | null;
  /** failed / attempts as whole percent. null when attempts === 0. */
  errorRate: number | null;
}

/** null rather than 0 for "no attempts" — charts drop them instead of drawing 0% bars. */
const rate = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 100);

export function spikeLine(playerId: string, events: StatEvent[]): SpikeLine {
  let kills = 0;
  let tools = 0;
  let rallyContinued = 0;
  let errors = 0;
  let blocked = 0;

  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.type === "SPIKE_POINT") kills++;
    else if (e.type === "SPIKE_TOOL") tools++;
    else if (e.type === "SPIKE_IN") rallyContinued++;
    else if (e.type === "SPIKE_ERR") errors++;
    else if (e.type === "SPIKE_BLOCKED") blocked++;
  }

  const pointsWon = kills + tools;
  const failed = errors + blocked;
  const attempts = pointsWon + rallyContinued + failed;
  return {
    playerId,
    attempts,
    pointsWon,
    rallyContinued,
    failed,
    kills,
    tools,
    errors,
    blocked,
    successRate: rate(pointsWon, attempts),
    errorRate: rate(failed, attempts),
  };
}

export function spikeLines(playerIds: string[], events: StatEvent[]): SpikeLine[] {
  return playerIds.map((id) => spikeLine(id, events));
}
