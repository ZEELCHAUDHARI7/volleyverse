import type { Lineup, Position, Side } from "./rally";

/**
 * SUBSTITUTIONS & THE LIBERO — the two ways a court changes without a rally.
 *
 * Two mechanisms, deliberately separated:
 *
 *  · REGULAR SUBSTITUTION (coach-driven). A bench player takes the EXACT
 *    rotation slot of the player leaving. Rotation then continues from that
 *    slot as if nothing happened — the slot is the identity, not the player.
 *
 *  · LIBERO SWAP (system-driven). Nobody presses anything. Whoever holds the
 *    serve decides who is on court:
 *      serving   → Middle Blocker on court, libero on the bench
 *      receiving → libero on court, Middle Blocker on the bench
 *    The libero takes the MB's slot and inherits their place in the rotation;
 *    when the serve comes back the MB returns to whatever slot the libero has
 *    rotated into. A libero swap is NOT a substitution and never counts as one.
 *
 * ORDERING CONTRACT (the one thing a caller can get wrong): on a side-out,
 * ROTATE FIRST, THEN sync the liberos. Rotating first carries the libero (who
 * is holding the MB's slot) one place clockwise, so the returning MB lands
 * exactly where the rotation says they should. Syncing first would return the
 * MB to the pre-rotation slot and then rotate them again — the same player in
 * the wrong place. `syncBothLiberos` is idempotent, so calling it after every
 * point, set start and toss is always safe.
 *
 * Pure: no React, no storage, no DOM, and no RUNTIME imports — the import
 * above is type-only and is erased, so node's type-stripping test runner loads
 * this file without resolving anything else (same constraint as free-rally.ts).
 */

// ---------------------------------------------------------------------
// Court reading
// ---------------------------------------------------------------------

/**
 * Back-row slots, deepest first. Local copy rather than an import from
 * rally.ts for the type-stripping reason in the header note.
 *
 * FIVB Rule 19.3.2.1: a libero may only replace a player in the BACK row.
 * This list is also the search order when a side somehow has two Middle
 * Blockers behind the attack line (impossible in a standard rotation, where
 * the two MBs sit three slots apart and exactly one is in the back row).
 */
export const LIBERO_SLOTS: Position[] = [5, 6, 1];

const ALL_SLOTS: Position[] = [1, 2, 3, 4, 5, 6];

/** Which slot a player occupies right now, or null when they are off court. */
export function positionOf(lineup: Lineup, playerId: string): Position | null {
  for (const p of ALL_SLOTS) if (lineup[p] === playerId) return p;
  return null;
}

export function isOnCourt(lineup: Lineup, playerId: string): boolean {
  return positionOf(lineup, playerId) !== null;
}

// ---------------------------------------------------------------------
// Libero state — carried per side, alongside that side's lineup
// ---------------------------------------------------------------------

export interface LiberoState {
  /** True while the libero occupies a court slot. */
  onCourt: boolean;
  /**
   * The Middle Blocker the libero replaced. They are off court but still
   * "hold" the slot: they come back the moment the serve returns. A regular
   * substitution may replace THIS player — the incoming player then inherits
   * the return.
   */
  replacedId: string | null;
}

export const LIBERO_OFF: LiberoState = { onCourt: false, replacedId: null };

/**
 * Read a LiberoState out of an unknown value (a match session saved before
 * this feature existed). Never throws — an unrecognised shape means "libero
 * on the bench", which is the correct starting point for a serving side and is
 * corrected by the first `syncBothLiberos` call either way.
 */
export function liberoStateFrom(value: unknown): LiberoState {
  if (!value || typeof value !== "object") return LIBERO_OFF;
  const v = value as { onCourt?: unknown; replacedId?: unknown };
  return {
    onCourt: v.onCourt === true,
    replacedId: typeof v.replacedId === "string" ? v.replacedId : null,
  };
}

/** Per-set regular-substitution counters. Libero swaps never touch these. */
export interface SubCount {
  us: number;
  opp: number;
}

export const NO_SUBS: SubCount = { us: 0, opp: 0 };

export function subCountFrom(value: unknown): SubCount {
  if (!value || typeof value !== "object") return NO_SUBS;
  const v = value as { us?: unknown; opp?: unknown };
  return {
    us: typeof v.us === "number" ? v.us : 0,
    opp: typeof v.opp === "number" ? v.opp : 0,
  };
}

// ---------------------------------------------------------------------
// What the SUB sheet may offer
// ---------------------------------------------------------------------

export interface CourtSlot {
  position: Position;
  playerId: string;
  /** True for the slot the libero is currently holding — not substitutable. */
  isLibero: boolean;
}

export interface SubOptions {
  /** The six on court, slot order 1..6. */
  onCourt: CourtSlot[];
  /**
   * The Middle Blocker temporarily off court for the libero, or null. They ARE
   * substitutable: swapping them changes who returns when the serve comes back.
   */
  liberoHeld: string | null;
  /** Bench players who may come on. */
  bench: string[];
}

/**
 * Everything the SUB sheet needs for one side. The designated libero is never
 * offered as an incoming player and their slot is never offered as an outgoing
 * one — the libero is the system's business, not the coach's.
 */
export function subOptions(
  rosterIds: string[],
  lineup: Lineup,
  liberoId: string | null,
  libero: LiberoState,
): SubOptions {
  const onCourt: CourtSlot[] = ALL_SLOTS.map((position) => ({
    position,
    playerId: lineup[position],
    isLibero: !!liberoId && lineup[position] === liberoId,
  }));
  const placed = new Set(onCourt.map((s) => s.playerId));
  const liberoHeld = libero.onCourt ? libero.replacedId : null;
  const bench = rosterIds.filter(
    (id) => !placed.has(id) && id !== liberoId && id !== liberoHeld,
  );
  return { onCourt, liberoHeld, bench };
}

// ---------------------------------------------------------------------
// Regular substitution
// ---------------------------------------------------------------------

export interface SubResult {
  lineup: Lineup;
  libero: LiberoState;
  /** False when the swap was not applicable — nothing changed. */
  ok: boolean;
}

/**
 * Put `inId` on for `outId`, in `outId`'s exact rotation slot.
 *
 * Refused (ok: false, state untouched) when the swap would corrupt the court:
 * same player both ways, an incoming player who is already on, or an outgoing
 * player who is neither on court nor held off for the libero. Refusing the
 * on-court libero is the rule from PART 1: the SUB button is for regular
 * substitutions only.
 */
export function applySub(args: {
  lineup: Lineup;
  libero: LiberoState;
  liberoId: string | null;
  outId: string;
  inId: string;
}): SubResult {
  const { lineup, libero, liberoId, outId, inId } = args;
  const refuse: SubResult = { lineup, libero, ok: false };

  if (!outId || !inId || outId === inId) return refuse;
  if (isOnCourt(lineup, inId)) return refuse;
  if (inId === liberoId) return refuse; // libero enters automatically, never here
  if (liberoId && outId === liberoId) return refuse; // libero leaves automatically
  // The MB held off court for the libero is NOT free to come on elsewhere: they
  // already own a slot and would end up on court twice the moment the serve
  // came back. Substitute them (as `outId`) to hand that slot over instead.
  if (libero.onCourt && libero.replacedId === inId) return refuse;

  // The MB held off court for the libero: the incoming player inherits the
  // return, so when the serve comes back THEY take the slot, not the MB.
  if (libero.onCourt && libero.replacedId === outId) {
    return { lineup, libero: { ...libero, replacedId: inId }, ok: true };
  }

  const pos = positionOf(lineup, outId);
  if (pos === null) return refuse;
  return { lineup: { ...lineup, [pos]: inId }, libero, ok: true };
}

// ---------------------------------------------------------------------
// Libero auto-swap
// ---------------------------------------------------------------------

/**
 * The slot the libero should enter: the Middle Blocker standing in the back
 * row. Returns null when no MB is behind the attack line — the swap is then
 * skipped rather than made illegal (FIVB 19.3.2.1).
 */
export function liberoTargetPosition(
  lineup: Lineup,
  isMiddleBlocker: (playerId: string) => boolean,
): Position | null {
  for (const p of LIBERO_SLOTS) if (isMiddleBlocker(lineup[p])) return p;
  return null;
}

/** What the system just did, for the court flash. */
export type LiberoChange = "IN" | "OUT";

export interface LiberoEvent {
  side: Side;
  change: LiberoChange;
  /** Player coming on. */
  inId: string;
  /** Player going off. */
  outId: string;
  position: Position;
}

export interface LiberoSync {
  lineup: Lineup;
  libero: LiberoState;
  /** null when the court was already correct — the common case. */
  event: Omit<LiberoEvent, "side"> | null;
}

/**
 * Bring one side's court in line with who holds the serve.
 *
 *   serving   → MB on court, libero off
 *   receiving → libero on court in the back-row MB's slot
 *
 * Idempotent: call it after every point, set start and toss. When the court is
 * already right it returns the same objects and a null event.
 */
export function syncLibero(args: {
  /** The side being synced. */
  side: Side;
  /** Side holding the serve right now. */
  serving: Side;
  liberoId: string | null;
  lineup: Lineup;
  libero: LiberoState;
  isMiddleBlocker: (playerId: string) => boolean;
}): LiberoSync {
  const { side, serving, liberoId, lineup, libero, isMiddleBlocker } = args;

  // No libero designated: nothing to swap, and no state worth keeping.
  if (!liberoId) {
    return { lineup, libero: libero.onCourt ? LIBERO_OFF : libero, event: null };
  }

  const wantOnCourt = serving !== side; // receiving → libero plays
  const actuallyOn = isOnCourt(lineup, liberoId);

  // Trust the lineup over the flag: a restored session or a hand-edited court
  // can disagree, and the lineup is the one the screen draws.
  if (wantOnCourt === actuallyOn) {
    const repaired: LiberoState = { onCourt: actuallyOn, replacedId: libero.replacedId };
    const same =
      repaired.onCourt === libero.onCourt && repaired.replacedId === libero.replacedId;
    return { lineup, libero: same ? libero : repaired, event: null };
  }

  if (wantOnCourt) {
    const position = liberoTargetPosition(lineup, isMiddleBlocker);
    if (position === null) return { lineup, libero, event: null }; // no back-row MB
    const outId = lineup[position];
    return {
      lineup: { ...lineup, [position]: liberoId },
      libero: { onCourt: true, replacedId: outId },
      event: { change: "IN", inId: liberoId, outId, position },
    };
  }

  // Libero off: the held player returns to whatever slot the libero rotated
  // into, which is exactly the slot the rotation gives them.
  const position = positionOf(lineup, liberoId);
  const returning = libero.replacedId;
  if (position === null) {
    // The flag claimed "on court" but the lineup disagrees. The lineup is what
    // the screen draws, so it wins.
    return { lineup, libero: LIBERO_OFF, event: null };
  }
  if (!returning) {
    // Corrupt state: the libero holds a slot with nobody recorded as owed it.
    // Leave them standing there rather than blanking a slot, and make the flag
    // agree with the court — a state that disagrees with itself would keep
    // asking to be re-synced forever.
    return {
      lineup,
      libero: libero.onCourt ? libero : { onCourt: true, replacedId: null },
      event: null,
    };
  }
  return {
    lineup: { ...lineup, [position]: returning },
    libero: LIBERO_OFF,
    event: { change: "OUT", inId: returning, outId: liberoId, position },
  };
}

export interface BothLiberos {
  usLineup: Lineup;
  oppLineup: Lineup;
  usLibero: LiberoState;
  oppLibero: LiberoState;
  /** Swaps that just happened — empty on the vast majority of calls. */
  events: LiberoEvent[];
}

/**
 * Sync BOTH sides in one call — the single line a live screen needs after a
 * point is resolved, a set is opened or a toss is entered. Remember the
 * ordering contract in the header: rotate first, sync second.
 */
export function syncBothLiberos(args: {
  serving: Side;
  usLineup: Lineup;
  oppLineup: Lineup;
  usLibero: LiberoState;
  oppLibero: LiberoState;
  usLiberoId: string | null;
  oppLiberoId: string | null;
  isMiddleBlocker: (playerId: string) => boolean;
}): BothLiberos {
  const us = syncLibero({
    side: "US",
    serving: args.serving,
    liberoId: args.usLiberoId,
    lineup: args.usLineup,
    libero: args.usLibero,
    isMiddleBlocker: args.isMiddleBlocker,
  });
  const opp = syncLibero({
    side: "OPP",
    serving: args.serving,
    liberoId: args.oppLiberoId,
    lineup: args.oppLineup,
    libero: args.oppLibero,
    isMiddleBlocker: args.isMiddleBlocker,
  });
  const events: LiberoEvent[] = [];
  if (us.event) events.push({ side: "US", ...us.event });
  if (opp.event) events.push({ side: "OPP", ...opp.event });
  return {
    usLineup: us.lineup,
    oppLineup: opp.lineup,
    usLibero: us.libero,
    oppLibero: opp.libero,
    events,
  };
}

// ---------------------------------------------------------------------
// The one call a live screen makes
// ---------------------------------------------------------------------

/** The court fields every live match state carries, whichever tracker owns it. */
export interface CourtSides {
  usLineup: Lineup;
  oppLineup: Lineup;
  usLibero: LiberoState;
  oppLibero: LiberoState;
}

/**
 * Bring a whole match state's court in line with who holds the serve, and hand
 * back the swaps that happened so the screen can say so.
 *
 * Both trackers (the phase-based rally tracker and the free-rally spike
 * tracker) keep the serve in `state.rally.serving`, so one signature serves
 * both. Call it after a point is resolved (AFTER rotating), when a set opens
 * and when a toss is entered — it is idempotent, so an extra call is free.
 */
export function syncCourt<S extends CourtSides & { rally: { serving: Side } }>(
  state: S,
  liberoIds: { us: string | null; opp: string | null },
  isMiddleBlocker: (playerId: string) => boolean,
): { state: S; events: LiberoEvent[] } {
  const synced = syncBothLiberos({
    serving: state.rally.serving,
    usLineup: state.usLineup,
    oppLineup: state.oppLineup,
    usLibero: state.usLibero,
    oppLibero: state.oppLibero,
    usLiberoId: liberoIds.us,
    oppLiberoId: liberoIds.opp,
    isMiddleBlocker,
  });
  const unchanged =
    synced.usLineup === state.usLineup &&
    synced.oppLineup === state.oppLineup &&
    synced.usLibero === state.usLibero &&
    synced.oppLibero === state.oppLibero;
  if (unchanged) {
    // Nothing moved: hand back the SAME object so callers can rely on identity.
    // Checked by identity rather than by `events`, because a restored session
    // can need its libero FLAG repaired without any player moving.
    return { state, events: synced.events };
  }
  return {
    state: {
      ...state,
      usLineup: synced.usLineup,
      oppLineup: synced.oppLineup,
      usLibero: synced.usLibero,
      oppLibero: synced.oppLibero,
    },
    events: synced.events,
  };
}
