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
  firstServerForSet,
  isDecidingSet,
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
    setScores: [],
    rally: openRally(servingFromToss(toss)),
    current: [],
    history: [],
  };
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

  // Resume mid-match after a reload. Keyed on the route id, not the match
  // object — useMatch returns a fresh object on every db change, so keying on
  // it would re-read storage after each logged event and fight its own writes.
  useEffect(() => {
    if (!store.ready) return;
    try {
      const raw = window.localStorage.getItem(STATE_KEY(id));
      if (raw) {
        const parsed = JSON.parse(raw) as FreeMatchState;
        if (parsed.usLineup && parsed.oppLineup && parsed.rally) setState(parsed);
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
        onReady={({ us, opp, toss }) => persist(initialState(us, opp, toss))}
      />
    );
  }

  const teamIdFor = (side: Side) => (side === "US" ? homeTeam.id : awayTeam.id);
  const currentServerId = serverId(
    state.rally.serving === "US" ? state.usLineup : state.oppLineup,
  );

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
      eventIds,
    };
    const { nextServing, rotateWinner } = resolvePoint(s.rally.serving, winner);
    const usLineup = rotateWinner && winner === "US" ? rotate(s.usLineup) : s.usLineup;
    const oppLineup = rotateWinner && winner === "OPP" ? rotate(s.oppLineup) : s.oppLineup;
    return {
      ...s,
      usScore: winner === "US" ? s.usScore + 1 : s.usScore,
      oppScore: winner === "OPP" ? s.oppScore + 1 : s.oppScore,
      usLineup,
      oppLineup,
      rally: openRally(nextServing),
      current: [],
      history: [...s.history, snapshot],
    };
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
    persist({
      ...state,
      usScore: prev.usScore,
      oppScore: prev.oppScore,
      usLineup: prev.usLineup,
      oppLineup: prev.oppLineup,
      // Back to the START of that rally, so the serve slot reopens — its taps
      // were just deleted, and the first of them may have been the serve.
      rally: openRally(prev.serving),
      current: [],
      history: state.history.slice(0, -1),
    });
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
    persist({
      ...state,
      set: nextSet,
      usScore: 0,
      oppScore: 0,
      usSets,
      oppSets,
      setScores: [...state.setScores, { us: state.usScore, opp: state.oppScore }],
      usLineup: state.setup.us.lineup,
      oppLineup: state.setup.opp.lineup,
      rally: openRally(nextServer ?? state.rally.serving),
      current: [],
      history: [],
    });
  };

  const target = isDecidingSet(state.set, match.totalSets) ? 15 : 25;
  const setOver = setPointReached(state.usScore, state.oppScore, target);
  const allPlayers = [...homeRoster, ...awayRoster];

  // Total points across banked sets plus the set in progress.
  const usTotal = state.setScores.reduce((n, s) => n + s.us, 0) + state.usScore;
  const oppTotal = state.setScores.reduce((n, s) => n + s.opp, 0) + state.oppScore;

  /**
   * Whoever has the most points at the moment the match is ended wins it.
   * Sets are recorded but do not decide the result — a deliberate product
   * choice so a match can be stopped at any point and still resolve.
   */
  const leader: Side | null =
    usTotal === oppTotal ? null : usTotal > oppTotal ? "US" : "OPP";

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
            <span className="text-accent">{homeTeam.shortName} {usTotal}</span>
            <span className="mx-3 text-dim">–</span>
            <span className="text-azure">{oppTotal} {awayTeam.shortName}</span>
          </p>
          <p className="mt-1 text-xs text-dim">total points</p>
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
      persist({
        ...state,
        decidingToss: toss,
        rally: openRally(servingFromToss(toss)),
      });
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
          {setOver && <Button onClick={onBankSet}>Bank set {state.set}</Button>}
          <Button variant="ghost" onClick={() => setEnding(true)}>
            End match
          </Button>
          <LinkButton href="/console" variant="ghost">
            Console
          </LinkButton>
        </div>

        {ending && (
          <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-center">
            <p className="text-sm text-ink">
              End the match now?{" "}
              {leader === null ? (
                <span className="font-semibold">
                  Level at {usTotal}–{oppTotal} — no winner recorded.
                </span>
              ) : (
                <>
                  <span className="font-semibold">
                    {leader === "US" ? homeTeam.name : awayTeam.name}
                  </span>{" "}
                  wins {Math.max(usTotal, oppTotal)}–{Math.min(usTotal, oppTotal)} on
                  points.
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
          ...(state.setup.us.liberoId
            ? [{ side: "US" as Side, playerId: state.setup.us.liberoId, enabled: true }]
            : []),
          ...(state.setup.opp.liberoId
            ? [{ side: "OPP" as Side, playerId: state.setup.opp.liberoId, enabled: true }]
            : []),
        ]}
      />

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
