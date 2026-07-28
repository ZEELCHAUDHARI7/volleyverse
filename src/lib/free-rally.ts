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
): TapResolution {
  if (isServeTap(state, tappedSide, isServer)) {
    if (outcome === "WIN") return { event: "SERVE_ACE", pointTo: tappedSide };
    if (outcome === "LOSE") return { event: "SERVE_ERR", pointTo: other(tappedSide) };
    return { event: "SERVE_IN", pointTo: null };
  }
  // ✓ always awards to the tapped player's own team, whichever side of the net
  // they are on — that is what makes a return rally work with no special case.
  if (outcome === "WIN") return { event: "SPIKE_POINT", pointTo: tappedSide };
  if (outcome === "LOSE") return { event: "SPIKE_ERR", pointTo: other(tappedSide) };
  return { event: "SPIKE_IN", pointTo: null };
}

/** A fault always ends the rally against the player who committed it. */
export function resolveFault(tappedSide: Side, kind: FaultKind): FaultResolution {
  return { event: FAULT_EVENT[kind], pointTo: other(tappedSide) };
}

/** After any tap the serve slot closes for the rest of the rally. */
export function closeServe(state: FreeRallyState): FreeRallyState {
  return state.serveOpen ? { ...state, serveOpen: false } : state;
}
