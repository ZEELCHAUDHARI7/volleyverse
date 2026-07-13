import type { EventType } from "./types";

/**
 * RALLY ENGINE — the courtside state machine (v2: two-sided ✓ O ✗).
 *
 * Architecture note: this file is 100% pure (no React, no storage, no
 * DOM). The UI drives it; every transition is a value in → value out.
 * That keeps the hardest logic in the product — rotation for BOTH teams,
 * scoring, side-out, toss, action inference, assist attribution —
 * unit-testable in isolation (rally.test.mjs) and the courtside screen a
 * thin renderer that cannot accumulate bugs in the rules of volleyball.
 *
 * v2 design principle ("the logic behind three buttons"): every contact
 * in volleyball ends one of three ways — point won (✓), point lost (✗),
 * rally continues (O). The trio is universal; WHAT was won/lost/continued
 * is inferred from the rally phase + who was tapped, never asked.
 */

// ---------------------------------------------------------------------
// Court model
// ---------------------------------------------------------------------

export type Side = "US" | "OPP";

export function other(side: Side): Side {
  return side === "US" ? "OPP" : "US";
}

/** The six court slots. Position 1 = back-right = the serving slot. */
export type Position = 1 | 2 | 3 | 4 | 5 | 6;
export const POSITIONS: Position[] = [1, 2, 3, 4, 5, 6];

/** Front row does the blocking; back row (1,5,6) does most of the defence. */
export const FRONT_ROW: Position[] = [4, 3, 2];
export const BACK_ROW: Position[] = [5, 6, 1];

/** playerId keyed by court position. The single truth of "who is where". */
export type Lineup = Record<Position, string>;

export interface TeamSetup {
  /** Starting six, keyed by position. */
  lineup: Lineup;
  /** Defensive specialist — free to enter for a back-row player. */
  liberoId: string | null;
}

/**
 * Rotate clockwise one slot. Real volleyball: on winning back the serve
 * (a side-out) the team rotates — everyone shifts one position clockwise
 * and a new player arrives in the serving slot (P1).
 *
 * Clockwise means P2→P1, P3→P2, P4→P3, P5→P4, P6→P5, P1→P6.
 */
export function rotate(lineup: Lineup): Lineup {
  return {
    1: lineup[2],
    2: lineup[3],
    3: lineup[4],
    4: lineup[5],
    5: lineup[6],
    6: lineup[1],
  };
}

/** Who is serving right now = whoever sits in position 1. */
export function serverId(lineup: Lineup): string {
  return lineup[1];
}

export function isFrontRow(lineup: Lineup, playerId: string): boolean {
  return FRONT_ROW.some((p) => lineup[p] === playerId);
}

// ---------------------------------------------------------------------
// Toss — one decision sets up the whole match
// ---------------------------------------------------------------------

export interface Toss {
  winner: Side;
  choice: "SERVE" | "RECEIVE";
}

/** Who serves first, straight from the toss. */
export function servingFromToss(toss: Toss): Side {
  return toss.choice === "SERVE" ? toss.winner : other(toss.winner);
}

/**
 * First server of a given set. Sets alternate first serve, starting from
 * the toss result in set 1 (standard FIVB alternation).
 */
export function servingForSet(toss: Toss, set: number): Side {
  const first = servingFromToss(toss);
  return set % 2 === 1 ? first : other(first);
}

// ---------------------------------------------------------------------
// Rally phases + the universal ✓ O ✗ trio
// ---------------------------------------------------------------------

/**
 * Phases are side-neutral; RallyState carries WHICH team is acting.
 * DEFEND is the first touch after an opposing attack — tapping a
 * front-row player means block, a back-row player or libero means dig.
 * DIG follows a block touch (any player may dig it up).
 */
export type Phase =
  | "SERVE"
  | "RECEIVE"
  | "SET"
  | "ATTACK"
  | "DEFEND"
  | "DIG"
  | "OVER";

/** The three buttons. WIN = ✓, CONT = O, LOSE = ✗. */
export type Trio = "WIN" | "CONT" | "LOSE";
export const TRIOS: Trio[] = ["WIN", "CONT", "LOSE"];

/** What a tap actually was, inferred — never asked. */
export type ActionKind =
  | "SERVE"
  | "RECEIVE"
  | "SET"
  | "ATTACK"
  | "BLOCK"
  | "DIG";

/**
 * Infer the action from phase + court row of the tapped player.
 * The only genuine ambiguity in volleyball's flow is the first touch
 * after an opposing attack (block vs dig) — position resolves it.
 */
export function inferAction(
  phase: Exclude<Phase, "OVER">,
  frontRow: boolean,
): ActionKind {
  if (phase === "DEFEND") return frontRow ? "BLOCK" : "DIG";
  if (phase === "DIG") return "DIG";
  return phase; // SERVE / RECEIVE / SET / ATTACK map 1:1
}

export interface Resolution {
  /** StatEvent for the tapped player (null = block touch — no stat). */
  event: EventType | null;
  /** Point result; null = rally continues. */
  pointTo: Side | null;
  nextPhase: Phase;
  /** Team acting in nextPhase. */
  nextSide: Side;
}

/**
 * THE core table: action × trio → what happened.
 * ✓ on serve/attack/block ends the rally with a point; ✓ on
 * receive/set/dig is a perfect contact that keeps the rally alive
 * (a "super dig" saves a point — it cannot win one).
 */
export function resolveTrio(
  action: ActionKind,
  side: Side,
  trio: Trio,
): Resolution {
  const o = other(side);
  const win = (event: EventType): Resolution => ({ event, pointTo: side, nextPhase: "OVER", nextSide: side });
  const lose = (event: EventType): Resolution => ({ event, pointTo: o, nextPhase: "OVER", nextSide: o });
  const cont = (event: EventType | null, nextPhase: Phase, nextSide: Side): Resolution => ({ event, pointTo: null, nextPhase, nextSide });

  switch (action) {
    case "SERVE":
      if (trio === "WIN") return win("SERVE_ACE");
      if (trio === "LOSE") return lose("SERVE_ERR");
      return cont("SERVE_IN", "RECEIVE", o);
    case "RECEIVE":
      if (trio === "WIN") return cont("RECV_PERFECT", "SET", side);
      if (trio === "LOSE") return lose("RECV_ERR");
      return cont("RECV_GOOD", "SET", side);
    case "SET":
      if (trio === "LOSE") return lose("SET_ERR");
      // ✓ and O are both a playable set; a kill later upgrades it to an assist.
      return cont("SET_GOOD", "ATTACK", side);
    case "ATTACK":
      if (trio === "WIN") return win("SPIKE_POINT");
      if (trio === "LOSE") return lose("SPIKE_ERR");
      return cont("SPIKE_IN", "DEFEND", o);
    case "BLOCK":
      if (trio === "WIN") return win("BLOCK_WIN");
      if (trio === "LOSE") return lose("BLOCK_MISS");
      return cont(null, "DIG", side); // touch — slowed, dig it up
    case "DIG":
      if (trio === "WIN") return cont("DIG_SUPER", "SET", side);
      if (trio === "LOSE") return lose("DIG_FAIL");
      return cont("DIG_SAVE", "SET", side);
  }
}

/**
 * Courtside reality: scorers miss contacts. Skip advances the flow
 * without logging anything (e.g. straight to the opponent's attack).
 */
export function skipPhase(
  phase: Exclude<Phase, "OVER">,
  side: Side,
): { nextPhase: Phase; nextSide: Side } {
  switch (phase) {
    case "SERVE":
      return { nextPhase: "RECEIVE", nextSide: other(side) };
    case "RECEIVE":
      return { nextPhase: "SET", nextSide: side };
    case "SET":
      return { nextPhase: "ATTACK", nextSide: side };
    case "ATTACK":
      return { nextPhase: "DEFEND", nextSide: other(side) };
    case "DEFEND":
    case "DIG":
      return { nextPhase: "SET", nextSide: side };
  }
}

// ---------------------------------------------------------------------
// Live match state (owned by the page, persisted per match)
// ---------------------------------------------------------------------

export interface LoggedAction {
  /** null for no-stat contacts (block touch) or skipped phases. */
  eventId: string | null;
  playerId: string | null;
  side: Side;
  action: ActionKind | null; // null = skip
  /** Phase (and side) at the moment of the tap — restored on undo. */
  phase: Phase;
}

export interface RallyState {
  serving: Side;
  phase: Phase;
  /** Team performing the current phase. */
  side: Side;
  /** Actions logged in the CURRENT (in-progress) rally, for action-undo. */
  current: LoggedAction[];
}

/** Every rally starts with a serve — by whichever side holds it. */
export function openingRally(serving: Side): RallyState {
  return { serving, phase: "SERVE", side: serving, current: [] };
}

export interface RallySnapshot {
  usScore: number;
  oppScore: number;
  serving: Side;
  usLineup: Lineup;
  oppLineup: Lineup;
  /** StatEvent ids emitted by the rally — removed on rally-undo. */
  eventIds: string[];
  /** Was the assist upgrade applied (for accurate undo). */
  assistUpgradeEventId: string | null;
}

export interface MatchState {
  setup: { us: TeamSetup; opp: TeamSetup };
  toss: Toss;
  set: number;
  usScore: number;
  oppScore: number;
  usSets: number;
  oppSets: number;
  /** Current on-court rotations — BOTH teams, auto-rotated on side-outs. */
  usLineup: Lineup;
  oppLineup: Lineup;
  /** Final scores of completed sets, oldest first — fan scoreboard data. */
  setScores: { us: number; opp: number }[];
  rally: RallyState;
  /** Completed rallies this set, newest last — powers rally-level undo. */
  history: RallySnapshot[];
}

export function initialMatchState(
  us: TeamSetup,
  opp: TeamSetup,
  toss: Toss,
): MatchState {
  return {
    setup: { us, opp },
    toss,
    set: 1,
    usScore: 0,
    oppScore: 0,
    usSets: 0,
    oppSets: 0,
    usLineup: us.lineup,
    oppLineup: opp.lineup,
    setScores: [],
    rally: openingRally(servingFromToss(toss)),
    history: [],
  };
}

/**
 * Resolve a point: the winner always serves next, and the winner rotates
 * one position clockwise IF they were receiving (a side-out earns the
 * serve). Both teams are modelled — the caller rotates the winner's lineup.
 */
export function resolvePoint(
  serving: Side,
  winner: Side,
): { nextServing: Side; rotateWinner: boolean } {
  return { nextServing: winner, rotateWinner: winner !== serving };
}

/** Standard set target: 25, win by 2 (deciding set is 15 — caller decides). */
export function setPointReached(us: number, opp: number, target = 25): boolean {
  return (us >= target || opp >= target) && Math.abs(us - opp) >= 2;
}
