"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import { CourtBoard, type CourtPlayer } from "@/components/court-board";
import { SetupWizard } from "@/components/court-setup";
import { SpikeChartGrid } from "@/components/spike-charts";
import { Button, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import {
  type Lineup,
  type Side,
  type TeamSetup,
  type Toss,
  SET_TARGET,
  firstServerForSet,
  isDecidingSet,
  matchWinner,
  resolvePoint,
  rotate,
  serverId,
  servingFromToss,
  setPointReached,
} from "@/lib/rally";
import {
  type FaultKind,
  type FreeRallyState,
  type Outcome,
  closeServe,
  openRally,
  resolveFault,
  resolveTap,
} from "@/lib/free-rally";
import {
  type LiberoEvent,
  type LiberoState,
  type SubCount,
  LIBERO_OFF,
  NO_SUBS,
  applySub,
  liberoStateFrom,
  subCountFrom,
  syncCourt,
} from "@/lib/substitution";
import { SubControl } from "@/components/sub-sheet";
import type { Player } from "@/lib/types";

/**
 * FREE-RALLY TRACKER — the court, without the fixed touch sequence.
 *
 * Tap whoever touched the ball, in any order, as many times as it happened.
 * The only thing the app infers is the serve, and it does that from rotation:
 * the serving side's P1 tapped before anything else in a rally is a serve.
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
  setup: { us: TeamSetup; opp: TeamSetup };
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
    toss,
    decidingToss: null,
    set: 1,
    usScore: 0,
    oppScore: 0,
    usSets: 0,
    oppSets: 0,
    usLineup: us.lineup,
    oppLineup: opp.lineup,
    usLibero: LIBERO_OFF,
    oppLibero: LIBERO_OFF,
    subs: NO_SUBS,
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
  const [ending, setEnding] = useState(false);
  /** Last automatic libero swap, shown under the court until the next point. */
  const [notice, setNotice] = useState<string | null>(null);

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
    const r = syncCourt(
      state,
      { us: state.setup.us.liberoId, opp: state.setup.opp.liberoId },
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

  const liberoIds = {
    us: state.setup.us.liberoId,
    opp: state.setup.opp.liberoId,
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
    setArmed(null);
  };

  const onOutcome = (outcome: Outcome) => {
    if (!armed) return;
    const { player, side } = armed;
    const isServer = player.id === currentServerId;
    const res = resolveTap(state.rally, side, isServer, outcome);
    const e = store.addEvent(match.id, teamIdFor(side), player.id, state.set, res.event);
    const ids = [...state.current, e.id];

    persist(
      res.pointTo
        ? applyPoint(state, res.pointTo, ids)
        : { ...state, rally: closeServe(state.rally), current: ids },
    );
    setArmed(null);
    setFaulting(false);
  };

  const onFault = (kind: FaultKind) => {
    if (!armed) return;
    const { player, side } = armed;
    const res = resolveFault(side, kind);
    const e = store.addEvent(match.id, teamIdFor(side), player.id, state.set, res.event);
    persist(applyPoint(state, res.pointTo, [...state.current, e.id]));
    setArmed(null);
    setFaulting(false);
  };

  /** Undo the last tap in the rally in progress, else the last whole rally. */
  const onUndo = () => {
    if (state.current.length > 0) {
      const ids = [...state.current];
      const last = ids.pop()!;
      store.removeEvent(last);
      persist({
        ...state,
        current: ids,
        rally: ids.length === 0 ? openRally(state.rally.serving) : state.rally,
      });
      setArmed(null);
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
    setArmed(null);
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
      setArmed(null);
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
    persist(
      // Fresh set: starting rotations, liberos back on the bench and the
      // per-set substitution counters cleared — then sync for the new server.
      syncLiberos({
        ...state,
        set: nextSet,
        usScore: 0,
        oppScore: 0,
        usSets,
        oppSets,
        setScores: [...state.setScores, { us: state.usScore, opp: state.oppScore }],
        usLineup: state.setup.us.lineup,
        oppLineup: state.setup.opp.lineup,
        usLibero: LIBERO_OFF,
        oppLibero: LIBERO_OFF,
        subs: NO_SUBS,
        rally: openRally(nextServer ?? state.rally.serving),
        current: [],
        history: [],
      }),
    );
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
    setArmed(null);
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
          {match.setScores.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {match.setScores.map((s) => (
                <span
                  key={s.setNo}
                  className="tnum rounded-lg border border-line bg-surface2/50 px-2.5 py-1 text-xs"
                >
                  {s.homePoints}–{s.awayPoints}
                </span>
              ))}
            </div>
          )}
          <div className="mt-5">
            <LinkButton href="/console">Back to console</LinkButton>
          </div>
        </header>

        <h2 className="stat-display text-lg font-bold uppercase tracking-wide text-ink">
          Spiker performance
        </h2>
        <SpikeChartGrid
          players={allPlayers}
          events={events}
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
                {decidesMatch ? "Finish match" : `Start set ${state.set + 1}`}
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
        onTap={(playerId, side) => {
          const p = byId.get(playerId);
          if (!p) return;
          if (armed?.player.id === playerId) {
            setArmed(null);
            setFaulting(false);
            return;
          }
          setArmed({ player: p, side });
          setFaulting(false);
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

      {armed && (
        <div className="card-premium sticky bottom-2 z-10 rounded-2xl border-accent/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="stat-display text-lg font-extrabold uppercase text-ink">
              {armed.player.jerseyNo !== null ? `#${armed.player.jerseyNo} ` : ""}
              {armed.player.fullName}
              {armed.player.id === currentServerId && state.rally.serveOpen && (
                <span className="ml-2 text-xs font-bold uppercase tracking-wider text-accent">
                  serving
                </span>
              )}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setArmed(null);
                setFaulting(false);
              }}
            >
              Cancel
            </Button>
          </div>

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
        </div>
      )}

      <h2 className="stat-display pt-2 text-lg font-bold uppercase tracking-wide text-ink">
        Spiker performance
        <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
          updates on every tap
        </span>
      </h2>
      <SpikeChartGrid
        players={allPlayers}
        events={events}
        homeTeamId={homeTeam.id}
        homeLabel={homeTeam.name}
        awayLabel={awayTeam.name}
      />
    </div>
  );
}
