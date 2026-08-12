"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import {
  CourtBoard,
  type CourtPlayer,
  type DragAnswer,
  type DragMenu,
} from "@/components/court-board";
import { SetupWizard } from "@/components/court-setup";
import { SpikeChartGrid } from "@/components/spike-charts";
import { BlockChartGrid, BlockerCards } from "@/components/block-charts";
import { Button, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import {
  type Lineup,
  type MatchSetup,
  type SetSetups,
  type Side,
  type TeamSetup,
  type Toss,
  FRONT_ROW,
  SET_TARGET,
  firstServerForSet,
  isDecidingSet,
  matchWinner,
  openSetCourt,
  other,
  resolvePoint,
  rotate,
  serverId,
  servingFromToss,
  setPointReached,
  setupForSet,
  withSetSetup,
} from "@/lib/rally";
import { SetRotationGate } from "@/components/set-rotation";
import {
  type DuelKind,
  type FaultKind,
  type FreeRallyState,
  type Outcome,
  type TapKind,
  blockerEvent,
  closeServe,
  isDuel,
  isServeTap,
  openRally,
  resolveFault,
  resolveTap,
} from "@/lib/free-rally";
import {
  type LiberoEvent,
  type LiberoState,
  type SubCount,
  applySub,
  liberoStateFrom,
  subCountFrom,
  syncCourt,
} from "@/lib/substitution";
import { SubControl } from "@/components/sub-sheet";
import {
  type SetScope,
  SetNavigator,
  scopeLabel,
  setEntries,
} from "@/components/set-strip";
import type { EventType, Player, StatEvent } from "@/lib/types";

/**
 * FREE-RALLY TRACKER — the court, without the fixed touch sequence.
 *
 * Hold whoever touched the ball and flick — left for a point won, right for a
 * failure, up to keep the rally going — in any order, as many times as it
 * happened. The only thing the app infers is the serve, and it does that from
 * rotation: the serving side's P1 acted on before anything else in a rally is a
 * serve. A plain tap still opens the old panel, which is where faults live and
 * where a mouse ends up.
 *
 * Score, serve order and rotation all follow from ✓ and ✗ — there is no
 * manual scoreboard, because every rally-ending event has a tap behind it.
 */

const STATE_KEY = (matchId: string) => `volleyverse:free:${matchId}`;

interface Snapshot {
  usScore: number;
  oppScore: number;
  serving: Side;
  usLineup: Lineup;
  oppLineup: Lineup;
  /** Libero placement at the start of the rally — undo rewinds the court too. */
  usLibero?: LiberoState;
  oppLibero?: LiberoState;
  /** Substitution counters at the start of the rally, restored with the court. */
  subs?: SubCount;
  eventIds: string[];
}

interface FreeMatchState {
  /** Set 1's starting rotations. Later sets may differ — see `setSetups`. */
  setup: MatchSetup;
  /** Starting rotations entered for later sets, keyed by set number. */
  setSetups?: SetSetups;
  /** True while the next set is waiting for its rotation to be confirmed. */
  awaitingSetStart?: boolean;
  toss: Toss;
  /** FIVB 6.3.2/7.1 — the deciding set takes a fresh toss. null until taken. */
  decidingToss: Toss | null;
  set: number;
  usScore: number;
  oppScore: number;
  usSets: number;
  oppSets: number;
  usLineup: Lineup;
  oppLineup: Lineup;
  /** Libero placement per side — the swap is automatic (substitution.ts). */
  usLibero: LiberoState;
  oppLibero: LiberoState;
  /** Regular substitutions used this set. Libero swaps never count. */
  subs: SubCount;
  setScores: { us: number; opp: number }[];
  rally: FreeRallyState;
  /** Event ids logged in the rally in progress — tap-level undo. */
  current: string[];
  /** Completed rallies this set, newest last — rally-level undo. */
  history: Snapshot[];
}

function initialState(us: TeamSetup, opp: TeamSetup, toss: Toss): FreeMatchState {
  return {
    setup: { us, opp },
    setSetups: {},
    // Set 1's rotation comes from the wizard, so no set start is ever owed.
    awaitingSetStart: false,
    toss,
    decidingToss: null,
    set: 1,
    usScore: 0,
    oppScore: 0,
    usSets: 0,
    oppSets: 0,
    ...openSetCourt({ us, opp }),
    setScores: [],
    rally: openRally(servingFromToss(toss)),
    current: [],
    history: [],
  };
}

/**
 * A session saved before substitutions existed has no libero or sub fields —
 * and, in that old model, a libero was never in a lineup, so "both liberos on
 * the bench" is exactly right. The first sync then walks the receiving side's
 * libero on.
 */
function hydrate(s: FreeMatchState): FreeMatchState {
  return {
    ...s,
    usLibero: liberoStateFrom(s.usLibero),
    oppLibero: liberoStateFrom(s.oppLibero),
    subs: subCountFrom(s.subs),
    // A session saved before rotation could change between sets has neither
    // field. Empty + false is exactly the old behaviour: every set starts from
    // `setup`, and no set start is owed — so resuming one never traps the
    // collector behind a rotation screen for a set already in progress.
    setSetups: s.setSetups ?? {},
    awaitingSetStart: s.awaitingSetStart === true,
  };
}

/** One line for the court flash: what the system just did, and to whom. */
function liberoNote(events: LiberoEvent[], nameOf: (id: string) => string): string | null {
  if (events.length === 0) return null;
  return events
    .map(
      (e) =>
        `⇄ Libero ${e.change === "IN" ? "in" : "out"} · ${nameOf(e.inId)} for ${nameOf(
          e.outId,
        )} · P${e.position}`,
    )
    .join("   ");
}

const OUTCOMES: { outcome: Outcome; glyph: string; label: string; cls: string }[] = [
  {
    outcome: "WIN",
    glyph: "✓",
    label: "Point won",
    cls: "border-ok/40 bg-ok/10 text-ok hover:border-ok",
  },
  {
    outcome: "CONT",
    glyph: "O",
    label: "Rally continues",
    cls: "border-azure/40 bg-azure/10 text-azure hover:border-azure",
  },
  {
    outcome: "LOSE",
    glyph: "✗",
    label: "Failed",
    cls: "border-err/40 bg-err/10 text-err hover:border-err",
  },
];

/**
 * HOW A ✓ OR ✗ FINISHED — the second question, asked only when it has an answer
 * worth having.
 *
 * A spike and a checkout are both points; a block and a net error both cost
 * one. The pairs are worth separating because they are different skills and,
 * for the two duels, because they name a player on the other side of the net
 * who never otherwise gets credited for anything.
 *
 * The words are the ones shouted on court, not the ones on a scoresheet — a
 * coach reading SPIKE and CHECKOUT needs no translation, and the stored
 * EventType keeps its original name so nothing recorded has to be migrated.
 */
const WIN_KINDS: { kind: TapKind; glyph: string; label: string; hint: string }[] = [
  {
    kind: "KILL",
    glyph: "🔨",
    label: "Spike",
    hint: "Ball landed directly in opponent court",
  },
  {
    kind: "TOOL",
    glyph: "🎯",
    label: "Checkout",
    hint: "Off the blocker and out",
  },
];

const LOSE_KINDS: { kind: TapKind; glyph: string; label: string; hint: string }[] = [
  {
    kind: "BLOCKED",
    glyph: "🚫",
    label: "Blocked",
    hint: "Stopped at the net — name who",
  },
  {
    kind: "ERROR",
    glyph: "❌",
    label: "Error",
    hint: "Into the net or out",
  },
];

/**
 * What the undo bar says just happened.
 *
 * Read off the RESOLVED event rather than the button pressed, so the line is
 * true for the serve too: ← on the server is an ace, not "point won", and a
 * scorer who flicked the wrong way needs to recognise the mistake at a glance.
 */
const EVENT_WORD: Partial<Record<EventType, string>> = {
  SERVE_ACE: "Ace",
  SERVE_IN: "Serve in",
  SERVE_ERR: "Service error",
  SPIKE_POINT: "Spike",
  SPIKE_TOOL: "Checkout",
  SPIKE_IN: "Rally continues",
  SPIKE_ERR: "Attack error",
  SPIKE_BLOCKED: "Blocked",
};

const FAULTS: { kind: FaultKind; label: string }[] = [
  { kind: "NET", label: "Net touch" },
  { kind: "FOUR_HITS", label: "Four hits" },
  { kind: "DOUBLE", label: "Double" },
  { kind: "ROTATION", label: "Rotation" },
];

export default function FreeRallyTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } = useMatch(id);
  const store = useStore();

  const [state, setState] = useState<FreeMatchState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [armed, setArmed] = useState<{ player: Player; side: Side } | null>(null);
  const [faulting, setFaulting] = useState(false);
  /**
   * The half-answered tap: which of ✓ / ✗ was pressed, and — once Blocked or
   * Tool is chosen — which duel is waiting for a blocker to be named. Nothing
   * is logged until the answer is complete, so backing out costs no undo.
   */
  const [asking, setAsking] = useState<Outcome | null>(null);
  const [duel, setDuel] = useState<DuelKind | null>(null);
  const [ending, setEnding] = useState(false);
  /** Last automatic libero swap, shown under the court until the next point. */
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * What the last gesture recorded, shown with an Undo beside it.
   *
   * A drag commits on release, so the wrong flick writes an event with no
   * confirmation step in front of it. This is the confirmation step, moved to
   * after the fact: the way out has to already be on screen when the scorer
   * realises, not one scroll up in the header.
   */
  const [lastAction, setLastAction] = useState<string | null>(null);
  /**
   * Which set the stats below are showing. "ALL" is the running match total;
   * a number narrows every chart to that set's events alone. Set scores and
   * `setNo`-tagged events are kept for the whole match, so a banked set stays
   * fully readable — this is what selects it.
   */
  const [scope, setScope] = useState<SetScope>("ALL");

  // Resume mid-match after a reload. Keyed on the route id, not the match
  // object — useMatch returns a fresh object on every db change, so keying on
  // it would re-read storage after each logged event and fight its own writes.
  useEffect(() => {
    if (!store.ready) return;
    try {
      const raw = window.localStorage.getItem(STATE_KEY(id));
      if (raw) {
        const parsed = JSON.parse(raw) as FreeMatchState;
        if (parsed.usLineup && parsed.oppLineup && parsed.rally) setState(hydrate(parsed));
      }
    } catch {
      // corrupted payload — fall back to the setup wizard
    }
    setLoaded(true); // unconditional, so a missing match reaches its empty state
  }, [store.ready, id]);

  const persist = useCallback(
    (next: FreeMatchState) => {
      setState(next);
      try {
        window.localStorage.setItem(STATE_KEY(id), JSON.stringify(next));
      } catch {
        // storage unavailable — state stays in memory for this session
      }
    },
    [id],
  );

  // Self-healing libero sync. Every path that changes the serve syncs the court
  // itself; this is the backstop for the paths that arrive from OUTSIDE a
  // handler — a session resumed from storage (including one saved before this
  // feature existed) or a roster whose positions were only just filled in.
  // syncCourt is idempotent and returns the SAME object when the court is
  // already right, so this settles in one pass and cannot loop.
  useEffect(() => {
    if (!state) return;
    // Never mid-rally: the court a rally is being scored on must not move under
    // the collector. A resumed session that needs a swap gets it at the next
    // dead ball, which is the only moment a swap is legal anyway.
    if (state.current.length > 0) return;
    const isMB = (pid: string) =>
      [...homeRoster, ...awayRoster].find((p) => p.id === pid)?.position === "MB";
    // The libero is read from the rotation THIS set started from, not the
    // match's: a side may designate a different libero for a later set.
    const active = setupForSet(state.set, state.setup, state.setSetups);
    const r = syncCourt(
      state,
      { us: active.us.liberoId, opp: active.opp.liberoId },
      isMB,
    );
    if (r.state !== state) persist(r.state);
  }, [state, homeRoster, awayRoster, persist]);

  const players = useMemo(() => {
    const map = new Map<string, CourtPlayer>();
    for (const p of homeRoster)
      map.set(p.id, {
        id: p.id,
        name: p.fullName.split(" ")[0],
        jersey: p.jerseyNo ?? undefined,
        side: "US",
      });
    for (const p of awayRoster)
      map.set(p.id, {
        id: p.id,
        name: p.fullName.split(" ")[0],
        jersey: p.jerseyNo ?? undefined,
        side: "OPP",
      });
    return map;
  }, [homeRoster, awayRoster]);

  const byId = useMemo(
    () => new Map([...homeRoster, ...awayRoster].map((p) => [p.id, p])),
    [homeRoster, awayRoster],
  );

  /** The libero replaces a Middle Blocker — this is how the engine spots one. */
  const isMiddleBlocker = (playerId: string) => byId.get(playerId)?.position === "MB";

  /**
   * Narrow events to the selected set. Every event carries its `setNo`, so a
   * banked set's stats are one filter away rather than gone.
   */
  const inScope = (evs: StatEvent[]) =>
    scope === "ALL" ? evs : evs.filter((e) => e.setNo === scope);

  if (!store.ready || !loaded) return <PageSkeleton />;

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="Match not found"
          hint="It may have been deleted, or the link is out of date."
          action={<LinkButton href="/console">Back to console</LinkButton>}
        />
      </div>
    );
  }

  if (!state) {
    return (
      <SetupWizard
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        store={store}
        onReady={({ us, opp, toss }) =>
          // Sync straight away: the receiving side's libero is on court before
          // the first serve, without anyone pressing anything.
          persist(
            syncCourt(
              initialState(us, opp, toss),
              { us: us.liberoId, opp: opp.liberoId },
              isMiddleBlocker,
            ).state,
          )
        }
      />
    );
  }

  const teamIdFor = (side: Side) => (side === "US" ? homeTeam.id : awayTeam.id);
  const currentServerId = serverId(
    state.rally.serving === "US" ? state.usLineup : state.oppLineup,
  );

  /** The rotation the set in progress started from — set 1's unless changed. */
  const activeSetup = setupForSet(state.set, state.setup, state.setSetups);
  const liberoIds = {
    us: activeSetup.us.liberoId,
    opp: activeSetup.opp.liberoId,
  };
  const nameOf = (pid: string) => players.get(pid)?.name ?? "Player";

  /**
   * Put the liberos where the serve says they belong, and report it on screen.
   * Called after every point, set start and toss — never by the user.
   */
  const syncLiberos = (s: FreeMatchState): FreeMatchState => {
    const r = syncCourt(s, liberoIds, isMiddleBlocker);
    setNotice(liberoNote(r.events, nameOf));
    return r.state;
  };

  /** Apply a point: score, serve, rotation — all from resolvePoint. */
  const applyPoint = (
    s: FreeMatchState,
    winner: Side,
    eventIds: string[],
  ): FreeMatchState => {
    const snapshot: Snapshot = {
      usScore: s.usScore,
      oppScore: s.oppScore,
      serving: s.rally.serving,
      usLineup: s.usLineup,
      oppLineup: s.oppLineup,
      usLibero: s.usLibero,
      oppLibero: s.oppLibero,
      subs: s.subs,
      eventIds,
    };
    const { nextServing, rotateWinner } = resolvePoint(s.rally.serving, winner);
    const usLineup = rotateWinner && winner === "US" ? rotate(s.usLineup) : s.usLineup;
    const oppLineup = rotateWinner && winner === "OPP" ? rotate(s.oppLineup) : s.oppLineup;
    // ROTATE FIRST, THEN sync (substitution.ts ordering contract): rotation
    // carries the libero one slot clockwise, so the returning Middle Blocker
    // lands exactly where the rotation puts them.
    return syncLiberos({
      ...s,
      usScore: winner === "US" ? s.usScore + 1 : s.usScore,
      oppScore: winner === "OPP" ? s.oppScore + 1 : s.oppScore,
      usLineup,
      oppLineup,
      rally: openRally(nextServing),
      current: [],
      history: [...s.history, snapshot],
    });
  };

  /** A coach substitution: the incoming player takes the exact slot. */
  const onSub = (side: Side, outId: string, inId: string) => {
    const lineup = side === "US" ? state.usLineup : state.oppLineup;
    const libero = side === "US" ? state.usLibero : state.oppLibero;
    const res = applySub({
      lineup,
      libero,
      liberoId: side === "US" ? liberoIds.us : liberoIds.opp,
      outId,
      inId,
    });
    if (!res.ok) return;
    const next: FreeMatchState =
      side === "US"
        ? { ...state, usLineup: res.lineup, usLibero: res.libero }
        : { ...state, oppLineup: res.lineup, oppLibero: res.libero };
    // Re-sync: a substitution can change WHICH middle blocker is in the back
    // row, so the libero may now be owed the court (or owed the bench).
    const synced = syncCourt(
      {
        ...next,
        subs: {
          us: next.subs.us + (side === "US" ? 1 : 0),
          opp: next.subs.opp + (side === "OPP" ? 1 : 0),
        },
      },
      liberoIds,
      isMiddleBlocker,
    );
    persist(synced.state);
    setNotice(
      [`⇄ Sub · ${nameOf(inId)} on for ${nameOf(outId)}`, liberoNote(synced.events, nameOf)]
        .filter(Boolean)
        .join("   "),
    );
    disarm();
  };

  /** Put the panel away, with every half-answered question dropped with it. */
  const disarm = () => {
    setArmed(null);
    setFaulting(false);
    setAsking(null);
    setDuel(null);
  };

  /** Is this the serve? A serve has no spike/checkout or blocked/error split. */
  const armedIsServe =
    armed !== null &&
    isServeTap(state.rally, armed.side, armed.player.id === currentServerId);

  /**
   * Who could legally have blocked that attack: the three front-row players of
   * the side the ball was hit at, read off the live lineup so a rotation or a
   * substitution changes the choices with no extra step.
   *
   * The libero cannot appear here, and not because they are filtered out —
   * syncCourt only ever places a libero in a back-row slot, so the front row is
   * three eligible blockers by construction.
   */
  const blockerChoices: Player[] =
    armed === null
      ? []
      : FRONT_ROW.map(
          (pos) => (armed.side === "US" ? state.oppLineup : state.usLineup)[pos],
        )
          .map((pid) => byId.get(pid))
          .filter((p): p is Player => p !== undefined);

  /**
   * Log a finished tap. `kind` refines ✓ and ✗; `blockerId` is required by the
   * two kinds that are duels, and a duel logs TWO events for one rally — the
   * spiker's and the blocker's — each naming the other in `vsPlayerId`.
   *
   * Both ids go into `current`, so one Undo takes the whole duel back rather
   * than leaving a blocker credited for a block that no longer happened.
   */
  const logTapFor = (
    target: { player: Player; side: Side },
    outcome: Outcome,
    kind?: TapKind,
    blockerId?: string,
  ) => {
    const { player, side } = target;
    const isServer = player.id === currentServerId;
    const res = resolveTap(state.rally, side, isServer, outcome, kind);
    const spike = store.addEvent(
      match.id,
      teamIdFor(side),
      player.id,
      state.set,
      res.event,
      blockerId ?? null,
    );
    const ids = [...state.current, spike.id];

    if (kind && isDuel(kind) && blockerId) {
      const block = store.addEvent(
        match.id,
        teamIdFor(other(side)),
        blockerId,
        state.set,
        blockerEvent(kind),
        player.id,
      );
      ids.push(block.id);
    }

    persist(
      res.pointTo
        ? applyPoint(state, res.pointTo, ids)
        : { ...state, rally: closeServe(state.rally), current: ids },
    );
    setLastAction(
      `${EVENT_WORD[res.event] ?? "Logged"} · ${player.fullName.split(" ")[0]}`,
    );
    disarm();
  };

  /** The panel's path in: the armed player is the target. */
  const logTap = (outcome: Outcome, kind?: TapKind, blockerId?: string) => {
    if (armed) logTapFor(armed, outcome, kind, blockerId);
  };

  /**
   * ✓ or ✗ pressed. O and the serve have nothing to refine, so they log on the
   * spot and the collector never sees a second screen for them.
   */
  const onOutcome = (outcome: Outcome) => {
    if (!armed) return;
    if (outcome === "CONT" || armedIsServe) {
      logTap(outcome);
      return;
    }
    setAsking(outcome);
    setFaulting(false);
  };

  /**
   * The three directions, for whoever is being held.
   *
   * Unlike the phase-based tracker this engine asks the same question of
   * everyone — it infers only the serve — so the labels vary in exactly one
   * place, and it is the place where a scorer would otherwise be told they had
   * won a point when what they recorded was an ace.
   */
  const dragMenuFor = (playerId: string, side: Side): DragMenu => {
    const serve = isServeTap(state.rally, side, playerId === currentServerId);
    return {
      left: { glyph: "✓", label: serve ? "Ace" : "Point won", tone: "ok" },
      up: { glyph: "O", label: serve ? "Serve in" : "Rally on", tone: "azure" },
      right: { glyph: "✗", label: serve ? "Service error" : "Failed", tone: "err" },
    };
  };

  /**
   * A drag released. One gesture is the whole action wherever there is nothing
   * left to ask — ↑ always, and ← / → on the serve, which has no spike/checkout
   * or blocked/error split. Everywhere else the release arms the player and
   * opens the sub-menu it chose, so the second question is one tap away rather
   * than two, and nothing is written until it is answered.
   */
  const onDrag = (playerId: string, side: Side, answer: DragAnswer) => {
    const player = byId.get(playerId);
    if (!player) return;
    const target = { player, side };
    if (answer === "UP") {
      logTapFor(target, "CONT");
      return;
    }
    const outcome: Outcome = answer === "LEFT" ? "WIN" : "LOSE";
    if (isServeTap(state.rally, side, playerId === currentServerId)) {
      logTapFor(target, outcome);
      return;
    }
    setArmed(target);
    setFaulting(false);
    setDuel(null);
    setAsking(outcome);
  };

  /** Spike / Checkout / Blocked / Error pressed. A duel still owes us a blocker. */
  const onKind = (kind: TapKind) => {
    if (!asking) return;
    if (isDuel(kind)) {
      setDuel(kind);
      return;
    }
    logTap(asking, kind);
  };

  const onBlocker = (blockerId: string) => {
    if (!asking || !duel) return;
    logTap(asking, duel, blockerId);
  };

  const onFault = (kind: FaultKind) => {
    if (!armed) return;
    const { player, side } = armed;
    const res = resolveFault(side, kind);
    const e = store.addEvent(match.id, teamIdFor(side), player.id, state.set, res.event);
    persist(applyPoint(state, res.pointTo, [...state.current, e.id]));
    setLastAction(
      `${FAULTS.find((f) => f.kind === kind)?.label ?? "Fault"} · ${player.fullName.split(" ")[0]}`,
    );
    disarm();
  };

  /** Undo the last tap in the rally in progress, else the last whole rally. */
  const onUndo = () => {
    // The bar describes one specific event. Once anything is rolled back it is
    // describing something that may no longer be the last thing that happened.
    setLastAction(null);
    if (state.current.length > 0) {
      const ids = [...state.current];
      const last = ids.pop()!;
      store.removeEvent(last);
      persist({
        ...state,
        current: ids,
        rally: ids.length === 0 ? openRally(state.rally.serving) : state.rally,
      });
      disarm();
      return;
    }
    const prev = state.history[state.history.length - 1];
    if (!prev) return;
    for (const eid of prev.eventIds) store.removeEvent(eid);
    // The court rewinds whole: lineups AND libero placement. A substitution made
    // during the undone rally rewinds with it, which is the honest reading of
    // "undo that rally".
    persist(
      syncLiberos({
        ...state,
        usScore: prev.usScore,
        oppScore: prev.oppScore,
        usLineup: prev.usLineup,
        oppLineup: prev.oppLineup,
        usLibero: liberoStateFrom(prev.usLibero),
        oppLibero: liberoStateFrom(prev.oppLibero),
        subs: subCountFrom(prev.subs),
        // Back to the START of that rally, so the serve slot reopens — its taps
        // were just deleted, and the first of them may have been the serve.
        rally: openRally(prev.serving),
        current: [],
        history: state.history.slice(0, -1),
      }),
    );
    disarm();
  };

  /** Bank the set once it is won and move to the next. */
  const onBankSet = () => {
    store.recordSetScore(match.id, {
      setNo: state.set,
      homePoints: state.usScore,
      awayPoints: state.oppScore,
    });
    const usSets = state.usScore > state.oppScore ? state.usSets + 1 : state.usSets;
    const oppSets = state.oppScore > state.usScore ? state.oppSets + 1 : state.oppSets;

    // The set just banked may have taken the match. Best-of-N ends the moment a
    // side has the majority, so sets 4 and 5 are never played at 3-0 or 3-1.
    const decided = matchWinner(usSets, oppSets, match.totalSets);
    if (decided) {
      store.completeMatch(
        match.id,
        decided === "US" ? homeTeam.id : awayTeam.id,
      );
      disarm();
      return;
    }

    const nextSet = state.set + 1;
    // First service alternates by set, and the deciding set takes a fresh toss.
    // firstServerForSet returns null in that case rather than guessing; the
    // render below then blocks play until the toss is entered.
    const nextServer = firstServerForSet(
      nextSet,
      match.totalSets,
      state.toss,
      state.decidingToss,
    );
    // Open the set on the rotation carried forward from the last one, then
    // pause: `awaitingSetStart` puts the rotation screen in front of the court
    // so the collector can change the six before the first serve. The court
    // underneath is already coherent, so a session resumed at this point is
    // playable whatever happens to the screen.
    const nextSetup = setupForSet(nextSet, state.setup, state.setSetups);
    const opened = syncCourt(
      {
        ...state,
        set: nextSet,
        awaitingSetStart: true,
        usScore: 0,
        oppScore: 0,
        usSets,
        oppSets,
        setScores: [...state.setScores, { us: state.usScore, opp: state.oppScore }],
        ...openSetCourt(nextSetup),
        rally: openRally(nextServer ?? state.rally.serving),
        current: [],
        history: [],
      },
      // The carried rotation's liberos, not the match's: sync must not reach
      // for a libero the incoming set no longer designates.
      { us: nextSetup.us.liberoId, opp: nextSetup.opp.liberoId },
      isMiddleBlocker,
    );
    setNotice(liberoNote(opened.events, nameOf));
    persist(opened.state);
  };

  /**
   * The rotation for this set is confirmed — record it and let play begin.
   *
   * Recorded against THIS set only, so every set before it keeps the rotation
   * it was actually played with, and every set after it inherits this one until
   * someone changes it again.
   */
  const onStartSet = (setup: MatchSetup) => {
    const six = new Set([
      ...Object.values(setup.us.lineup),
      ...Object.values(setup.opp.lineup),
    ]);
    // Scoresheet detail: anyone who has started a set is a starter for the
    // match. Set 1's starters keep the flag — a player benched for set 2 still
    // started the match.
    store.setRosters(
      match.id,
      match.rosters.map((r) => ({
        ...r,
        isStarter: r.isStarter || six.has(r.playerId),
        isLibero:
          r.isLibero ||
          r.playerId === setup.us.liberoId ||
          r.playerId === setup.opp.liberoId,
      })),
    );
    const started = syncCourt(
      {
        ...state,
        setSetups: withSetSetup(state.setSetups, state.set, setup),
        awaitingSetStart: false,
        ...openSetCourt(setup),
      },
      { us: setup.us.liberoId, opp: setup.opp.liberoId },
      isMiddleBlocker,
    );
    setNotice(liberoNote(started.events, nameOf));
    persist(started.state);
    disarm();
  };

  const setOver = setPointReached(state.usScore, state.oppScore, SET_TARGET);

  // Where the set counts land if the set in progress is banked as it stands —
  // drives both the prompt's tally and whether it offers set N+1 or the match.
  const setsAfterThis = {
    us: state.usSets + (state.usScore > state.oppScore ? 1 : 0),
    opp: state.oppSets + (state.oppScore > state.usScore ? 1 : 0),
  };
  const decidesMatch =
    matchWinner(setsAfterThis.us, setsAfterThis.opp, match.totalSets) !== null;

  const allPlayers = [...homeRoster, ...awayRoster];

  /**
   * Who a match abandoned right now would be awarded to. Sets decide it, so a
   * side ahead on points but level on sets takes nothing — the set in progress
   * is unfinished and cannot count.
   */
  const leader: Side | null =
    state.usSets === state.oppSets
      ? null
      : state.usSets > state.oppSets
        ? "US"
        : "OPP";

  const onEndMatch = () => {
    // Bank the set in progress so its points are not lost from the record.
    if (state.usScore > 0 || state.oppScore > 0) {
      store.recordSetScore(match.id, {
        setNo: state.set,
        homePoints: state.usScore,
        awayPoints: state.oppScore,
      });
    }
    store.completeMatch(
      match.id,
      leader === null ? null : leader === "US" ? homeTeam.id : awayTeam.id,
    );
    setEnding(false);
    disarm();
  };

  // Finished match: the winner, the set scores, and the four charts in full.
  if (match.status === "completed") {
    const winner = match.winnerTeamId
      ? match.winnerTeamId === homeTeam.id
        ? homeTeam.name
        : awayTeam.name
      : null;
    // Sets taken, read back off the recorded set scores rather than live state,
    // so the report is right even when reopened in another browser.
    const setsWon = match.setScores.reduce(
      (n, s) => ({
        us: n.us + (s.homePoints > s.awayPoints ? 1 : 0),
        opp: n.opp + (s.awayPoints > s.homePoints ? 1 : 0),
      }),
      { us: 0, opp: 0 },
    );
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 pb-24 pt-6">
        <header className="card-premium rounded-2xl p-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
            Match complete
          </p>
          <p className="stat-display mt-2 text-3xl font-extrabold uppercase text-ink">
            {winner ? `🏆 ${winner}` : "Drawn"}
          </p>
          <p className="stat-display tnum mt-3 text-2xl font-extrabold">
            <span className="text-accent">{homeTeam.shortName} {setsWon.us}</span>
            <span className="mx-3 text-dim">–</span>
            <span className="text-azure">{setsWon.opp} {awayTeam.shortName}</span>
          </p>
          <p className="mt-1 text-xs text-dim">sets</p>
          {/* Tap a set to read the match one set at a time. */}
          <div className="mt-4 flex justify-center">
            <SetNavigator
              sets={setEntries(match.setScores, null)}
              scope={scope}
              onScope={setScope}
              homeShort={homeTeam.shortName}
              awayShort={awayTeam.shortName}
            />
          </div>
          <div className="mt-5">
            <LinkButton href="/console">Back to console</LinkButton>
          </div>
        </header>

        <h2 className="stat-display text-lg font-bold uppercase tracking-wide text-ink">
          Spiker performance
          <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
            {scopeLabel(scope)}
          </span>
        </h2>
        <SpikeChartGrid
          players={allPlayers}
          events={inScope(events)}
          homeTeamId={homeTeam.id}
          homeLabel={homeTeam.name}
          awayLabel={awayTeam.name}
        />

        <h2 className="stat-display text-lg font-bold uppercase tracking-wide text-ink">
          Blocking
          <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
            {scopeLabel(scope)}
          </span>
        </h2>
        <BlockerCards
          players={allPlayers}
          events={inScope(events)}
          homeTeamId={homeTeam.id}
          seasonEvents={store.db.events}
        />
        <BlockChartGrid
          players={allPlayers}
          events={inScope(events)}
          homeTeamId={homeTeam.id}
          homeLabel={homeTeam.name}
          awayLabel={awayTeam.name}
        />
      </div>
    );
  }

  // FIVB 6.3.2/7.1: the deciding set needs its own toss. Play is blocked until
  // it is entered rather than silently carrying the previous set's server over.
  if (isDecidingSet(state.set, match.totalSets) && state.decidingToss === null) {
    const choose = (winner: Side, choice: Toss["choice"]) => {
      const toss: Toss = { winner, choice };
      persist(
        syncLiberos({
          ...state,
          decidingToss: toss,
          rally: openRally(servingFromToss(toss)),
        }),
      );
    };
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
          Set {state.set} · deciding set
        </p>
        <h1 className="stat-display text-2xl font-extrabold uppercase tracking-wide text-ink">
          New toss
        </h1>
        <p className="text-sm text-dim">
          The deciding set takes a fresh toss. Who won it, and what did they take?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => choose("US", "SERVE")}>
            {homeTeam.shortName} · serve
          </Button>
          <Button onClick={() => choose("US", "RECEIVE")}>
            {homeTeam.shortName} · receive
          </Button>
          <Button onClick={() => choose("OPP", "SERVE")}>
            {awayTeam.shortName} · serve
          </Button>
          <Button onClick={() => choose("OPP", "RECEIVE")}>
            {awayTeam.shortName} · receive
          </Button>
        </div>
      </div>
    );
  }

  // A set has been banked and the next one has not been lined up yet. Rotation
  // changes between sets, so this is the moment to say how — it runs AFTER the
  // deciding-set toss above, because who serves first decides which libero
  // walks on, and after the set score is banked, so nothing is at risk here.
  if (state.awaitingSetStart) {
    return (
      <SetRotationGate
        set={state.set}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        current={activeSetup}
        serving={state.rally.serving}
        onStart={onStartSet}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-4">
      <header className="card-premium rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right">
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {homeTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-accent">
              {state.usScore}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.25em] text-dim">
              Set {state.set}
            </p>
            <p className="tnum text-xs text-dim">
              {state.usSets}–{state.oppSets}
            </p>
          </div>

          <div>
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {awayTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-azure">
              {state.oppScore}
            </p>
          </div>
        </div>
        {/* Every set of the match, banked ones included — tap one to read the
            stats below for that set alone. A finished set never leaves the
            screen again. */}
        <div className="mt-3 flex justify-center border-t border-line/60 pt-3">
          <SetNavigator
            sets={setEntries(match.setScores, {
              setNo: state.set,
              homePoints: state.usScore,
              awayPoints: state.oppScore,
            })}
            scope={scope}
            onScope={setScope}
            homeShort={homeTeam.shortName}
            awayShort={awayTeam.shortName}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-line/60 pt-3">
          <Button
            variant="ghost"
            onClick={onUndo}
            disabled={state.current.length === 0 && state.history.length === 0}
          >
            ↶ Undo
          </Button>
          <Button variant="ghost" onClick={() => setEnding(true)}>
            End match
          </Button>
          <LinkButton href="/console" variant="ghost">
            Console
          </LinkButton>
        </div>

        {setOver && (
          <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-accent">
              Set {state.set} complete
            </p>
            <p className="stat-display tnum mt-1 text-lg font-extrabold text-ink">
              {(state.usScore > state.oppScore ? homeTeam : awayTeam).name} win{" "}
              {Math.max(state.usScore, state.oppScore)}–
              {Math.min(state.usScore, state.oppScore)}
            </p>
            <p className="tnum mt-0.5 text-xs text-dim">
              Sets {setsAfterThis.us}–{setsAfterThis.opp}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              <Button onClick={onBankSet}>
                {decidesMatch ? "Finish match" : `Line up set ${state.set + 1} →`}
              </Button>
              <Button
                variant="ghost"
                onClick={onUndo}
                disabled={state.current.length === 0 && state.history.length === 0}
              >
                ↶ Undo
              </Button>
            </div>
          </div>
        )}

        {ending && (
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-center">
            <p className="text-sm text-ink">
              End the match now?{" "}
              {leader === null ? (
                <span className="font-semibold">
                  Level at {state.usSets}–{state.oppSets} on sets — no winner
                  recorded.
                </span>
              ) : (
                <>
                  <span className="font-semibold">
                    {leader === "US" ? homeTeam.name : awayTeam.name}
                  </span>{" "}
                  wins {Math.max(state.usSets, state.oppSets)}–
                  {Math.min(state.usSets, state.oppSets)} on sets.
                </>
              )}
            </p>
            <div className="mt-2 flex justify-center gap-2">
              <Button onClick={onEndMatch}>Confirm</Button>
              <Button variant="ghost" onClick={() => setEnding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </header>

      <CourtBoard
        homeName={homeTeam.name}
        awayName={awayTeam.name}
        usLineup={state.usLineup}
        oppLineup={state.oppLineup}
        players={players}
        serving={state.rally.serving}
        armedId={armed?.player.id ?? null}
        tappableIds={null}
        onDrag={onDrag}
        dragActions={dragMenuFor}
        onTap={(playerId, side) => {
          const p = byId.get(playerId);
          if (!p) return;
          if (armed?.player.id === playerId) {
            disarm();
            return;
          }
          disarm();
          setArmed({ player: p, side });
        }}
        liberos={[
          ...(liberoIds.us
            ? [
                {
                  side: "US" as Side,
                  playerId: liberoIds.us,
                  // Off court means their team is serving — they cannot play.
                  enabled: false,
                  onCourt: state.usLibero.onCourt,
                },
              ]
            : []),
          ...(liberoIds.opp
            ? [
                {
                  side: "OPP" as Side,
                  playerId: liberoIds.opp,
                  enabled: false,
                  onCourt: state.oppLibero.onCourt,
                },
              ]
            : []),
        ]}
      />

      {/* Player management: SUB is the coach's; the libero is the system's. */}
      <div className="flex flex-wrap items-center gap-2">
        <SubControl
          // FIVB 15.2.1: a substitution is requested with the ball out of play.
          // Holding to that is also what keeps Undo honest — the court a rally
          // was played with never changes halfway through it.
          disabled={state.current.length > 0}
          disabledReason="Ball is live — substitute when the rally ends"
          homeName={homeTeam.name}
          awayName={awayTeam.name}
          usLineup={state.usLineup}
          oppLineup={state.oppLineup}
          usLibero={state.usLibero}
          oppLibero={state.oppLibero}
          usLiberoId={liberoIds.us}
          oppLiberoId={liberoIds.opp}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          subs={state.subs}
          onSub={onSub}
        />
        <p className="min-w-0 flex-1 truncate text-xs text-dim">
          {state.current.length > 0
            ? "Ball is live — substitute when the rally ends."
            : (notice ?? "Libero swaps run automatically on every change of serve.")}
        </p>
      </div>

      {/* Committed by a flick, so the way back has to be here already — see
          lastAction. It stands down the moment a player is armed, because the
          panel below carries its own ← Back. */}
      {!armed && lastAction && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface2/95 px-3 py-2 backdrop-blur">
          <p className="min-w-0 truncate text-xs font-bold text-ink">
            <span className="text-accent">✓ Logged</span>{" "}
            <span className="font-normal text-dim">{lastAction}</span>
          </p>
          <Button
            variant="ghost"
            onClick={onUndo}
            disabled={state.current.length === 0 && state.history.length === 0}
          >
            ↶ Undo
          </Button>
        </div>
      )}

      {armed && (
        <div className="card-premium sticky bottom-2 z-10 rounded-2xl border-accent/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-baseline gap-2 text-ink">
              {armed.player.jerseyNo !== null && (
                <span className="stat-display tnum text-2xl font-extrabold text-accent">
                  #{armed.player.jerseyNo}
                </span>
              )}
              <span className="stat-display text-lg font-extrabold uppercase">
                {armed.player.fullName}
              </span>
              {armed.player.id === currentServerId && state.rally.serveOpen && (
                <span className="ml-2 text-xs font-bold uppercase tracking-wider text-accent">
                  serving
                </span>
              )}
            </p>
            <Button
              variant="ghost"
              onClick={disarm}
            >
              Cancel
            </Button>
          </div>

          {/* Three panels, one at a time: the outcome, how it finished, and —
              only for a duel — which blocker was involved. Nothing is written
              until the last of them is answered, so ← Back costs no undo. */}
          {duel ? (
            <div>
              <p className="mb-2 text-xs text-dim">
                {duel === "BLOCKED"
                  ? "Who blocked it? Front row only — nobody else can block."
                  : "Whose block did they use? Front row only."}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {blockerChoices.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onBlocker(p.id)}
                    className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-azure/40 bg-azure/10 px-2 text-azure transition-all duration-200 hover:border-azure"
                  >
                    <span className="stat-display tnum text-2xl font-extrabold">
                      {p.jerseyNo !== null ? `#${p.jerseyNo}` : "—"}
                    </span>
                    <span className="w-full truncate text-center text-[11px] font-bold uppercase tracking-wider">
                      {p.fullName.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDuel(null)}
                className="mt-2 min-h-10 w-full rounded-xl border border-line text-[11px] font-bold uppercase tracking-wider text-dim hover:border-accent/40 hover:text-accent"
              >
                ← Back
              </button>
            </div>
          ) : asking ? (
            <div>
              <p className="mb-2 text-xs text-dim">
                {asking === "WIN" ? "How did it score?" : "What went wrong?"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(asking === "WIN" ? WIN_KINDS : LOSE_KINDS).map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => onKind(k.kind)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 transition-all duration-200 ${
                      asking === "WIN"
                        ? "border-ok/40 bg-ok/10 text-ok hover:border-ok"
                        : "border-err/40 bg-err/10 text-err hover:border-err"
                    }`}
                  >
                    <span className="text-2xl leading-none">{k.glyph}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      {k.label}
                    </span>
                    <span className="text-center text-[10px] leading-tight opacity-70">
                      {k.hint}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAsking(null)}
                className="mt-2 min-h-10 w-full rounded-xl border border-line text-[11px] font-bold uppercase tracking-wider text-dim hover:border-accent/40 hover:text-accent"
              >
                ← Back
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.outcome}
                    type="button"
                    onClick={() => onOutcome(o.outcome)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border transition-all duration-200 ${o.cls}`}
                  >
                    <span className="stat-display text-3xl font-extrabold">{o.glyph}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      {o.label}
                    </span>
                  </button>
                ))}
              </div>

              {faulting ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FAULTS.map((f) => (
                    <button
                      key={f.kind}
                      type="button"
                      onClick={() => onFault(f.kind)}
                      className="min-h-12 rounded-xl border border-violet/40 bg-violet/10 text-xs font-bold uppercase tracking-wider text-violet"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setFaulting(true)}
                  className="mt-2 min-h-10 w-full rounded-xl border border-line text-[11px] font-bold uppercase tracking-wider text-dim hover:border-violet/40 hover:text-violet"
                >
                  ⚠ Fault — point to the other team
                </button>
              )}
            </>
          )}
        </div>
      )}

      <h2 className="stat-display pt-2 text-lg font-bold uppercase tracking-wide text-ink">
        Spiker performance
        <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
          {scope === "ALL" ? "all sets · updates on every tap" : `${scopeLabel(scope)} only`}
        </span>
      </h2>
      <SpikeChartGrid
        players={allPlayers}
        events={inScope(events)}
        homeTeamId={homeTeam.id}
        homeLabel={homeTeam.name}
        awayLabel={awayTeam.name}
      />

      {/* Blocking, from the same taps. Nothing below was collected separately:
          naming the blocker on a ✗ → Blocked (or a ✓ → Checkout) is the whole
          input, and the season column comes from the store rather than this
          match, so a blocker's running total is on screen courtside. */}
      <h2 className="stat-display pt-2 text-lg font-bold uppercase tracking-wide text-ink">
        Blocking
        <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
          {scope === "ALL" ? "all sets · no extra taps" : `${scopeLabel(scope)} only`}
        </span>
      </h2>
      <BlockerCards
        players={allPlayers}
        events={inScope(events)}
        homeTeamId={homeTeam.id}
        seasonEvents={store.db.events}
      />
      <BlockChartGrid
        players={allPlayers}
        events={inScope(events)}
        homeTeamId={homeTeam.id}
        homeLabel={homeTeam.name}
        awayLabel={awayTeam.name}
      />
    </div>
  );
}
