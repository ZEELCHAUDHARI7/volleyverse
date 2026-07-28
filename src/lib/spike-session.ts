/**
 * SPIKE SESSION — everything the spiker screen holds that is not a StatEvent:
 * the manual scoreboard, the current set number, and one undo stack covering
 * both spike taps and score taps.
 *
 * The scoreboard is manual on purpose. A volleyball point can come from a
 * kill, an ace, a block or the opponent's error; the screen only logs spikes,
 * so a score derived from events alone would be wrong. Tapping +1 keeps the
 * scoreboard truthful without reintroducing the phase model.
 *
 * Pure: no React, no storage, no DOM. Every function returns a new value.
 */

export type ScoreSide = "home" | "away";

export type SpikeAction =
  | { kind: "EVENT"; eventId: string }
  | { kind: "POINT"; side: ScoreSide };

export interface SpikeSession {
  setNo: number;
  homePoints: number;
  awayPoints: number;
  /** Most recent action last. */
  undoStack: SpikeAction[];
}

export function newSession(): SpikeSession {
  return { setNo: 1, homePoints: 0, awayPoints: 0, undoStack: [] };
}

/** Remember a written StatEvent so undo can delete it again. */
export function recordEvent(s: SpikeSession, eventId: string): SpikeSession {
  return { ...s, undoStack: [...s.undoStack, { kind: "EVENT", eventId }] };
}

export function addPoint(s: SpikeSession, side: ScoreSide): SpikeSession {
  return {
    ...s,
    homePoints: side === "home" ? s.homePoints + 1 : s.homePoints,
    awayPoints: side === "away" ? s.awayPoints + 1 : s.awayPoints,
    undoStack: [...s.undoStack, { kind: "POINT", side }],
  };
}

/**
 * Reverse the most recent action. A POINT is reversed here; an EVENT is
 * returned so the caller can delete the StatEvent it created. `undone` is
 * null when there is nothing left to undo.
 */
export function undo(s: SpikeSession): {
  session: SpikeSession;
  undone: SpikeAction | null;
} {
  const last = s.undoStack[s.undoStack.length - 1];
  if (!last) return { session: s, undone: null };

  const undoStack = s.undoStack.slice(0, -1);
  if (last.kind === "POINT") {
    return {
      session: {
        ...s,
        homePoints: last.side === "home" ? s.homePoints - 1 : s.homePoints,
        awayPoints: last.side === "away" ? s.awayPoints - 1 : s.awayPoints,
        undoStack,
      },
      undone: last,
    };
  }
  return { session: { ...s, undoStack }, undone: last };
}

/**
 * Bank the set. Scores reset, the set number advances, and the undo stack is
 * cleared — undo must not reach back past a banked set, or it would decrement
 * a fresh 0-0 into negative points.
 */
export function endSet(s: SpikeSession): SpikeSession {
  return { setNo: s.setNo + 1, homePoints: 0, awayPoints: 0, undoStack: [] };
}
