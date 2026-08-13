import type { EventType } from "./types";
import type { LiberoState, SubCount } from "./substitution";

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

/** Both sides' starting rotations for one set. */
export interface MatchSetup {
  us: TeamSetup;
  opp: TeamSetup;
}

/**
 * Starting rotations recorded per set, keyed by set number.
 *
 * Only sets whose rotation was ENTERED appear here. A missing set means "same
 * as the last one entered" (see `setupForSet`), which is both the volleyball
 * default and what makes an old session — recorded before rotation could change
 * between sets — behave exactly as it always did.
 */
export type SetSetups = Record<number, MatchSetup>;

/**
 * The rotations `set` starts from: the one entered for it, else the most recent
 * one entered before it, else the match setup (which is always set 1's).
 *
 * Carrying the last entered rotation forward rather than snapping back to set 1
 * is the honest reading of a coach's edit — it stands until they change it
 * again, exactly like a substitution stands until the next one.
 */
export function setupForSet(
  set: number,
  matchSetup: MatchSetup,
  setSetups?: SetSetups,
): MatchSetup {
  if (setSetups) {
    for (let s = set; s >= 1; s--) {
      const entered = setSetups[s];
      if (entered) return entered;
    }
  }
  return matchSetup;
}

/** Record `setup` as the starting rotation for `set`, leaving other sets alone. */
export function withSetSetup(
  setSetups: SetSetups | undefined,
  set: number,
  setup: MatchSetup,
): SetSetups {
  return { ...(setSetups ?? {}), [set]: setup };
}

/**
 * The court fields opening a set resets — the same five in both trackers, so
 * neither can drift from the other on what "a fresh set" means.
 */
export interface SetOpening {
  usLineup: Lineup;
  oppLineup: Lineup;
  usLibero: LiberoState;
  oppLibero: LiberoState;
  subs: SubCount;
}

/**
 * Open a set from `setup`: both teams on their starting rotation, both liberos
 * on the bench, both substitution counters at zero. The caller then syncs the
 * court for the new server (ordering contract in substitution.ts).
 *
 * The libero and sub constants are written out rather than imported from
 * substitution.ts because this file must stay free of RUNTIME imports — see the
 * header note on the type-stripping test runner.
 */
export function openSetCourt(setup: MatchSetup): SetOpening {
  return {
    usLineup: setup.us.lineup,
    oppLineup: setup.opp.lineup,
    usLibero: { onCourt: false, replacedId: null },
    oppLibero: { onCourt: false, replacedId: null },
    subs: { us: 0, opp: 0 },
  };
}

/**
 * Is a part-filled starting six ready to play? Six slots, six DIFFERENT people
 * — the duplicate check is the one a tap-to-place picker cannot make for
 * itself once a lineup is being edited rather than built from empty.
 */
export function lineupComplete(slots: Partial<Record<Position, string>>): boolean {
  const ids: string[] = [];
  for (const p of POSITIONS) {
    const id = slots[p];
    if (!id) return false;
    ids.push(id);
  }
  return new Set(ids).size === 6;
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
 * Is this set the deciding set? FIVB Rule 6.3.1/6.3.2: the match is best of
 * `totalSets` (5 or 3); the deciding set is the last one - played to 15.
 */
export function isDecidingSet(set: number, totalSets: number): boolean {
  return set === totalSets;
}

/**
 * First server of a NON-deciding set.
 *
 * FIVB Rule 7.1 only fixes the first service of SET 1 (from the pre-match
 * toss) and of the DECIDING SET (from a NEW toss - see `firstServerForSet`).
 * The Rules are SILENT on sets 2..(totalSets-1). VolleyVerse follows the
 * near-universal competition convention that first service alternates from
 * the set-1 server. This is a STATED ASSUMPTION, not a rule in the uploaded
 * FIVB document - surfaced here rather than hidden.
 *
 * Do NOT use this for the deciding set: Rule 6.3.2/7.1 require a fresh toss.
 */
export function servingForSet(toss: Toss, set: number): Side {
  const first = servingFromToss(toss);
  return set % 2 === 1 ? first : other(first);
}

/**
 * FIVB Rule 7.1 - who serves first in `set`, resolved correctly:
 *  - Set 1: the pre-match `toss`.
 *  - Deciding set: a NEW toss (`decidingToss`). Returns `null` when that toss
 *    has not been taken yet, so the caller MUST run it before play - the app
 *    can never silently alternate into the deciding set.
 *  - Other sets: the alternation convention (see `servingForSet`).
 */
export function firstServerForSet(
  set: number,
  totalSets: number,
  toss: Toss,
  decidingToss: Toss | null,
): Side | null {
  if (isDecidingSet(set, totalSets)) {
    return decidingToss ? servingFromToss(decidingToss) : null;
  }
  return servingForSet(toss, set);
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
  /**
   * Libero placement at the START of the rally. Undo restores the whole court,
   * so a libero swap (and any substitution made mid-rally) rewinds with it.
   */
  usLibero?: LiberoState;
  oppLibero?: LiberoState;
  /** Substitution counters at the start of the rally — restored with the court. */
  subs?: SubCount;
  /** StatEvent ids emitted by the rally — removed on rally-undo. */
  eventIds: string[];
  /** Was the assist upgrade applied (for accurate undo). */
  assistUpgradeEventId: string | null;
}

export interface MatchState {
  /** Set 1's starting rotations. Later sets may differ — see `setSetups`. */
  setup: MatchSetup;
  /**
   * Starting rotations entered for later sets. Absent on a session saved before
   * rotation could change between sets, which `setupForSet` reads as "every set
   * starts from `setup`" — the old behaviour, exactly.
   */
  setSetups?: SetSetups;
  /**
   * True while a set has been banked and the next one is waiting for its
   * starting rotation to be confirmed. The court below already holds the
   * carried-forward rotation, so the state is playable either way — this only
   * says the screen owes the collector a chance to change it before the serve.
   */
  awaitingSetStart?: boolean;
  /** Pre-match toss (FIVB 7.1) - decides set-1 first service. */
  toss: Toss;
  /**
   * FIVB 6.3.2/7.1: a NEW toss taken before the deciding set. `null` until it
   * is run (or when no deciding set is in play). While the match sits in the
   * deciding set with this still `null`, scoring is blocked until the toss is
   * entered - the engine never alternates into the deciding set.
   */
  decidingToss: Toss | null;
  set: number;
  usScore: number;
  oppScore: number;
  usSets: number;
  oppSets: number;
  /** Current on-court rotations — BOTH teams, auto-rotated on side-outs. */
  usLineup: Lineup;
  oppLineup: Lineup;
  /**
   * Libero placement per side (substitution.ts). The lineups above stay the
   * single truth of "who is where" — while a libero is on court they simply
   * occupy the Middle Blocker's slot, so rotation needs no special case. These
   * only record whether the swap is active and who comes back.
   */
  usLibero: LiberoState;
  oppLibero: LiberoState;
  /** Regular substitutions used this set, per side. Libero swaps never count. */
  subs: SubCount;
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
    setSetups: {},
    // Set 1's rotation is entered by the setup wizard, so it is never owed.
    awaitingSetStart: false,
    toss,
    decidingToss: null,
    set: 1,
    usScore: 0,
    oppScore: 0,
    usSets: 0,
    oppSets: 0,
    // Liberos start on the bench; the caller runs `syncBothLiberos` straight
    // away, which walks the receiving side's libero on before the first serve.
    ...openSetCourt({ us, opp }),
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

/** Has a side reached `target` with a two-point cushion? */
export function setPointReached(us: number, opp: number, target = 25): boolean {
  return (us >= target || opp >= target) && Math.abs(us - opp) >= 2;
}

/**
 * Points that take a set — every set, the deciding one included.
 *
 * `isDecidingSet` still matters, but only for the fresh toss FIVB 6.3.2 calls
 * for. It has no say in the target any more.
 */
export const SET_TARGET = 15;

/** Sets a side must take to win a match of `totalSets`. */
export function matchTarget(totalSets: number): number {
  return Math.floor(totalSets / 2) + 1;
}

/**
 * The side that has won the match, or null while it is still live.
 *
 * Derived from `totalSets` rather than a hard 3, so a best-of-three chosen at
 * match creation ends on its second set instead of running forever.
 */
export function matchWinner(
  usSets: number,
  oppSets: number,
  totalSets: number,
): Side | null {
  const need = matchTarget(totalSets);
  if (usSets >= need) return "US";
  if (oppSets >= need) return "OPP";
  return null;
}
