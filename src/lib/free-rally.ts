import type { EventType } from "./types";
import type { Side } from "./rally";

/**
 * FREE RALLY — what a tap means when there is no phase model.
 *
 * The rally tracker infers the action from a fixed serve → receive → set →
 * attack sequence, which real rallies do not follow: a team may send the ball
 * back on one touch, and the same attacker can spike twice in one rally. This
 * engine drops the sequence and keeps exactly one inference, the only one that
 * is always safe:
 *
 *   rotation decides who serves, so the serving side's P1 is known. A tap on
 *   that player, before anything else in the rally, is a serve. Everything
 *   else is a spike.
 *
 * Scoring is not decided here — this returns which side won the point, and the
 * screen applies it with resolvePoint and rotate from rally.ts.
 *
 * Pure: no React, no storage, no DOM, and no runtime imports at all, so the
 * Node type-stripping test runner loads this file without resolving anything
 * else. Both imports above are type-only and are erased.
 */

/** The three buttons. WIN = ✓, CONT = O, LOSE = ✗. */
export type Outcome = "WIN" | "CONT" | "LOSE";

/** Faults a scorer can attribute — a point conceded with no serve or spike. */
export type FaultKind = "NET" | "FOUR_HITS" | "DOUBLE" | "ROTATION";

export const FAULT_EVENT: Record<FaultKind, EventType> = {
  NET: "FAULT_NET",
  FOUR_HITS: "FAULT_FOUR_HITS",
  DOUBLE: "FAULT_DOUBLE",
  ROTATION: "FAULT_ROTATION",
};

/**
 * HOW A ✓ OR ✗ FINISHED — the second half of an attack tap.
 *
 * ✓ and ✗ say who won the point; these say what actually happened, which is a
 * different question and the one a coach asks. KILL and ERROR are one-sided:
 * nobody else was involved. TOOL and BLOCKED are duels — the ball went through
 * a named opponent's hands — so they name that opponent too.
 *
 * `undefined` is a legal answer everywhere: an unrefined ✓ is a kill and an
 * unrefined ✗ is an error, which is exactly what every tap logged before this
 * existed meant. Nothing recorded before this change has to be re-read.
 *
 * The screen calls these SPIKE and CHECKOUT, which is what a coach shouts. The
 * names here — and the EventTypes they resolve to — are deliberately left
 * alone: renaming them would rewrite the stored vocabulary of every match
 * already collected to change two words on a button.
 */
export type AttackKind = "KILL" | "TOOL";
export type FailKind = "BLOCKED" | "ERROR";
export type TapKind = AttackKind | FailKind;

/** The two kinds that involve an opponent, and therefore need one named. */
export type DuelKind = "TOOL" | "BLOCKED";

export const isDuel = (kind: TapKind): kind is DuelKind =>
  kind === "TOOL" || kind === "BLOCKED";

export interface FreeRallyState {
  serving: Side;
  /** True until the first tap of this rally; while true, serving P1 = serve. */
  serveOpen: boolean;
}

export interface TapResolution {
  event: EventType;
  /** Side that won the point. null = the rally continues. */
  pointTo: Side | null;
}

/** Narrower than TapResolution: a fault always ends the rally. */
export interface FaultResolution {
  event: EventType;
  pointTo: Side;
}

/**
 * Local rather than imported from rally.ts: a runtime import would make the
 * type-stripping test runner resolve an extensionless path, which it cannot do.
 */
const other = (side: Side): Side => (side === "US" ? "OPP" : "US");

export function openRally(serving: Side): FreeRallyState {
  return { serving, serveOpen: true };
}

/** A serve is the serving side's P1, tapped before anything else this rally. */
export function isServeTap(
  state: FreeRallyState,
  tappedSide: Side,
  isServer: boolean,
): boolean {
  return state.serveOpen && isServer && tappedSide === state.serving;
}

export function resolveTap(
  state: FreeRallyState,
  tappedSide: Side,
  isServer: boolean,
  outcome: Outcome,
  kind?: TapKind,
): TapResolution {
  if (isServeTap(state, tappedSide, isServer)) {
    // A serve has no blocker on the other end, so the refinement is ignored
    // rather than trusted: the screen must not be able to turn an ace into a
    // tool by leaving a stale selection behind.
    if (outcome === "WIN") return { event: "SERVE_ACE", pointTo: tappedSide };
    if (outcome === "LOSE") return { event: "SERVE_ERR", pointTo: other(tappedSide) };
    return { event: "SERVE_IN", pointTo: null };
  }
  // ✓ always awards to the tapped player's own team, whichever side of the net
  // they are on — that is what makes a return rally work with no special case.
  if (outcome === "WIN")
    return { event: kind === "TOOL" ? "SPIKE_TOOL" : "SPIKE_POINT", pointTo: tappedSide };
  if (outcome === "LOSE")
    return {
      // SPIKE_BLOCKED, not SPIKE_ERR: both cost the spiker's team the point and
      // both are attack attempts, but only one of them is the spiker's mistake.
      event: kind === "BLOCKED" ? "SPIKE_BLOCKED" : "SPIKE_ERR",
      pointTo: other(tappedSide),
    };
  return { event: "SPIKE_IN", pointTo: null };
}

/**
 * The blocker's half of a duel.
 *
 * Two events are logged for one rally — the spiker's and the blocker's — and
 * EXACTLY ONE of them is the rally-ender the analytics reconstruction counts
 * (rallyOutcomes in analytics/volleyball.ts walks events and scores every
 * rally-ending one). BLOCKED ends on the blocker's BLOCK_WIN, so the spiker's
 * SPIKE_BLOCKED is deliberately not a scoring event; TOOL ends on the spiker's
 * SPIKE_TOOL, so the blocker's BLOCK_TOOLED is not either. Get that wrong and
 * every score derived from events reads double.
 */
export function blockerEvent(kind: DuelKind): EventType {
  return kind === "BLOCKED" ? "BLOCK_WIN" : "BLOCK_TOOLED";
}

/** A fault always ends the rally against the player who committed it. */
export function resolveFault(tappedSide: Side, kind: FaultKind): FaultResolution {
  return { event: FAULT_EVENT[kind], pointTo: other(tappedSide) };
}

/** After any tap the serve slot closes for the rest of the rally. */
export function closeServe(state: FreeRallyState): FreeRallyState {
  return state.serveOpen ? { ...state, serveOpen: false } : state;
}
