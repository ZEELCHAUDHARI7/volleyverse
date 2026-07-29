import type { EventType, StatEvent } from "./types";

/**
 * SPIKES — the whole tracking model.
 *
 * There is no rally phase model, no serve/receive/set sequence, no rotation
 * and no touch count. Real rallies do not follow a fixed pattern: a team may
 * send the ball back on one touch, the same attacker can swing twice in one
 * rally, and a dig can cross the net with no setter involved. Asking the
 * scorer to name a receiver and a setter on every point made the app
 * unusable courtside, so none of that is modelled any more.
 *
 * One interaction: tap the player who spiked, then say what happened.
 *
 *   ✓  won the point      → SPIKE_POINT
 *   O  rally continues    → SPIKE_IN
 *   ✗  failed (net/out)   → SPIKE_ERR
 *
 * Every tap is one attempt. A rally with three swings in it is three taps,
 * which is exactly the point: a spiker who needs two attempts to win a rally
 * is 1-for-2, and that is the number the charts exist to show.
 *
 * Callers must pass events already scoped to a single match — spikeLine and
 * spikeLines filter by playerId only, never by matchId.
 *
 * Pure: no React, no storage, no DOM. Type-only import so the Node
 * type-stripping test runner can load this file directly.
 */

/** The three buttons. */
export type Outcome = "WIN" | "CONT" | "LOSE";

export const OUTCOMES: Outcome[] = ["WIN", "CONT", "LOSE"];

/** What each button records. The entire inference the app performs. */
export const OUTCOME_EVENT: Record<Outcome, EventType> = {
  WIN: "SPIKE_POINT",
  CONT: "SPIKE_IN",
  LOSE: "SPIKE_ERR",
};

/** The three event types a tap can produce — used to filter a match's log. */
export const SPIKE_EVENTS: EventType[] = ["SPIKE_POINT", "SPIKE_IN", "SPIKE_ERR"];

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

/**
 * The taps of a match, oldest first — what Undo pops and the feed renders.
 * Only spike events: anything else in the log came from an older tracker.
 */
export function spikeLog(events: StatEvent[]): StatEvent[] {
  return events
    .filter((e) => e.type === "SPIKE_POINT" || e.type === "SPIKE_IN" || e.type === "SPIKE_ERR")
    .sort((a, b) => a.ts - b.ts);
}
