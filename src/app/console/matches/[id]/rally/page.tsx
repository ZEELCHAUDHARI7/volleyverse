"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatch, useStore } from "@/lib/store";
import { pushLiveState } from "@/lib/providers/live-state";
import { breaksRecord, lines } from "@/lib/metrics";
import type { Match, Player, Team } from "@/lib/types";
import {
  BACK_ROW,
  FRONT_ROW,
  POSITIONS,
  type ActionKind,
  type LoggedAction,
  type MatchState,
  type Phase,
  type RallySnapshot,
  type Side,
  type Toss,
  type Trio,
  firstServerForSet,
  inferAction,
  initialMatchState,
  isDecidingSet,
  isFrontRow,
  openingRally,
  resolvePoint,
  resolveTrio,
  rotate,
  serverId,
  servingFromToss,
  setPointReached,
  skipPhase,
} from "@/lib/rally";
import { CourtBoard, type CourtPlayer } from "@/components/court-board";
import { SetupWizard } from "@/components/court-setup";

/**
 * RALLY TRACKER v3 — the live courtside engine, two real teams.
 *
 * Two screens behind one route: the SETUP WIZARD (toss → home starting
 * six → away starting six → court view), then the LIVE tracker.
 *
 * Side mapping: the pure rally engine models sides as "US"/"OPP";
 * here US = the HOME team, OPP = the AWAY team. Every StatEvent is
 * written with the acting team's real id.
 *
 * Live contract (the "three buttons" design):
 *   · the COURT never leaves the screen — both teams, net in the middle
 *   · tap the player who acted → everyone else fades → ✓ O ✗ appear
 *   · WHAT happened (serve/spike/block/dig…) is inferred from the rally
 *     phase + who was tapped — never asked
 *   · ✓/✗ end the rally: score, serve and rotation update automatically
 *   · O advances the rally flow to the next expected contact
 *   · one always-visible Undo; every tap persists locally within a frame
 */

const RALLY_KEY = (matchId: string) => `volleyverse:rally:${matchId}`;


export default function RallyTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster } = useMatch(id);
  const store = useStore();
  const ready = store.ready;

  const [state, setState] = useState<MatchState | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Resume an in-progress match from localStorage (offline-safe).
  useEffect(() => {
    if (!ready || !match) return;
    try {
      const raw = window.localStorage.getItem(RALLY_KEY(match.id));
      if (raw) {
        const parsed = JSON.parse(raw) as MatchState;
        if (parsed.oppLineup && parsed.usLineup) setState(parsed);
      }
    } catch {
      // corrupted → start fresh at setup
    }
    setLoaded(true);
  }, [ready, match]);

  // Auto-save after every change — never lose data mid-match.
  const persist = useCallback(
    (next: MatchState | null) => {
      if (!match) return;
      setState(next);
      try {
        if (next) window.localStorage.setItem(RALLY_KEY(match.id), JSON.stringify(next));
        else window.localStorage.removeItem(RALLY_KEY(match.id));
      } catch {
        // storage unavailable — state stays in memory for the session
      }
      // Broadcast to every other user/device watching this match (no-op
      // when Supabase isn't configured — localStorage above still syncs tabs).
      pushLiveState(match.id, next);
    },
    [match],
  );

  // Shared, live resume (the "Google-Docs" behaviour): the in-progress session
  // is saved to a per-match key that EVERY console tab reads. localStorage fires
  // `storage` in all OTHER tabs of this browser, so if a second collector opens
  // the same match they follow along and can continue from the exact last tap.
  // We apply remote updates with the raw setter (no re-persist) to avoid loops.
  // NOTE: this syncs across tabs on one machine — the app's existing free
  // stand-in for realtime. True cross-device sync plugs into SupabaseProvider.
  useEffect(() => {
    if (!match) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== RALLY_KEY(match.id)) return;
      if (e.newValue == null) {
        setState(null);
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue) as MatchState;
        if (parsed.oppLineup && parsed.usLineup) setState(parsed);
      } catch {
        // partial write / corrupt payload — keep current state
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [match]);

  if (!ready || !loaded) return null;
  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-dim">Match not found.</p>
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
        onReady={({ us, opp, toss }) => persist(initialMatchState(us, opp, toss))}
      />
    );
  }

  return (
    <LiveScreen
      match={match}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homeRoster={homeRoster}
      awayRoster={awayRoster}
      state={state}
      setState={persist}
      store={store}
    />
  );
}



// =====================================================================
// LIVE — court + ✓ O ✗
// =====================================================================

const PHASE_LABEL: Record<Exclude<Phase, "OVER">, string> = {
  SERVE: "Serve",
  RECEIVE: "Receive",
  SET: "Set",
  ATTACK: "Attack",
  DEFEND: "Block / Dig",
  DIG: "Dig it up",
};

const ACTION_LABEL: Record<ActionKind, string> = {
  SERVE: "Serve",
  RECEIVE: "Receive",
  SET: "Set",
  ATTACK: "Spike",
  BLOCK: "Block",
  DIG: "Dig",
};

const TRIO_META: { trio: Trio; glyph: string; label: string; cls: string }[] = [
  { trio: "WIN", glyph: "✓", label: "Success", cls: "bg-ok/15 text-ok border-ok/40" },
  { trio: "CONT", glyph: "O", label: "Rally on", cls: "bg-azure/15 text-azure border-azure/40" },
  { trio: "LOSE", glyph: "✗", label: "Fail", cls: "bg-err/15 text-err border-err/40" },
];

function LiveScreen({
  match,
  homeTeam,
  awayTeam,
  homeRoster,
  awayRoster,
  state,
  setState,
  store,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  homeRoster: Player[];
  awayRoster: Player[];
  state: MatchState;
  setState: (m: MatchState | null) => void;
  store: ReturnType<typeof useStore>;
}) {
  const router = useRouter();
  const matchId = match.id;
  const allRoster = useMemo(
    () => [...homeRoster, ...awayRoster],
    [homeRoster, awayRoster],
  );

  // One lookup for everyone on court.
  const players = useMemo(() => {
    const m = new Map<string, CourtPlayer>();
    for (const p of homeRoster)
      m.set(p.id, { id: p.id, name: p.fullName.split(" ")[0], jersey: p.jerseyNo ?? undefined, side: "US" });
    for (const p of awayRoster)
      m.set(p.id, { id: p.id, name: p.fullName.split(" ")[0], jersey: p.jerseyNo ?? undefined, side: "OPP" });
    return m;
  }, [homeRoster, awayRoster]);

  const { rally, usLineup, oppLineup } = state;
  const phase = rally.phase;
  const side = rally.side; // team performing the current phase
  const lineupOf = (s: Side) => (s === "US" ? usLineup : oppLineup);
  const liberoOf = (s: Side) => state.setup[s === "US" ? "us" : "opp"].liberoId;
  const teamName = (s: Side) => (s === "US" ? homeTeam.name : awayTeam.name);
  const teamIdOf = (s: Side) => (s === "US" ? match.homeTeamId : match.awayTeamId);
  const rosterOf = (s: Side) => (s === "US" ? homeRoster : awayRoster);
  // Which side a tapped player belongs to. With the whole court open, the actor
  // is decided by WHO was tapped — not by the phase's expected side. The ball
  // can cross the net at any moment, so we trust the collector's tap.
  const sideOf = (pid: string | null): Side => players.get(pid ?? "")?.side ?? side;

  const [armed, setArmed] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; big?: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Deciding-set toss (FIVB 6.3.2/7.1) - selections for the fresh toss prompt.
  const [dToss, setDToss] = useState<{ winner: Side | null; choice: Toss["choice"] | null }>({
    winner: null,
    choice: null,
  });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-arm the unambiguous actor so the common case is a single tap:
  // the server on SERVE, and a side's lone on-court setter on SET.
  useEffect(() => {
    if (phase === "OVER") return;
    if (phase === "SERVE") {
      setArmed(serverId(lineupOf(side)));
    } else if (phase === "SET") {
      const roster = rosterOf(side);
      const setters = POSITIONS.map((p) => lineupOf(side)[p]).filter(
        (pid) => roster.find((r) => r.id === pid)?.position === "S",
      );
      setArmed(setters.length === 1 ? setters[0] : null);
    } else {
      setArmed(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, side, rally.serving, state.set, usLineup, oppLineup]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const showFlash = (text: string, big = false) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ text, big });
    flashTimer.current = setTimeout(() => setFlash(null), big ? 6000 : 2800);
  };

  // Season-record + milestone detection (both teams — everyone is real).
  const perMatchCount = (pid: string, ev: "SERVE_ACE" | "DIG_SUPER") =>
    store.db.events.filter((e) => e.matchId === matchId && e.playerId === pid && e.type === ev)
      .length;

  // What would the armed tap mean right now? The action type comes from the
  // current phase; block-vs-dig is resolved by the tapped player's own row on
  // THEIR side — so a surprise touch by either team is logged correctly.
  const armedAction: ActionKind | null = useMemo(() => {
    if (!armed || phase === "OVER") return null;
    const aSide = sideOf(armed);
    const lib = liberoOf(aSide);
    const front = armed !== lib && isFrontRow(lineupOf(aSide), armed);
    return inferAction(phase, front);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, phase, side, usLineup, oppLineup]);

  // ---- Core: one of the three buttons for the armed player ----
  const commit = (trio: Trio) => {
    if (phase === "OVER" || !armed || !armedAction) return;
    // The acting side is whoever was tapped — the court is fully open, so this
    // may differ from the phase's expected side (an unexpected touch or tip).
    const aSide = sideOf(armed);
    const res = resolveTrio(armedAction, aSide, trio);
    const teamId = teamIdOf(aSide);

    let eventId: string | null = null;
    let assistUpgradeEventId: string | null = null;

    if (res.event) {
      const e = store.addEvent(matchId, teamId, armed, state.set, res.event);
      eventId = e.id;

      // Assist attribution: a kill upgrades that side's preceding set.
      if (res.event === "SPIKE_POINT") {
        const priorSet = [...rally.current]
          .reverse()
          .find((a) => a.action === "SET" && a.side === aSide && a.eventId);
        if (priorSet?.eventId && priorSet.playerId) {
          store.removeEvent(priorSet.eventId);
          const up = store.addEvent(matchId, teamId, priorSet.playerId, state.set, "SET_ASSIST");
          assistUpgradeEventId = up.id;
          priorSet.eventId = up.id; // keep current-rally log consistent for undo
        }
      }

      // Milestone flashes — flag at 3/5/7, record breaks league-wide.
      if (res.event === "SERVE_ACE" || res.event === "DIG_SUPER") {
        const isAce = res.event === "SERVE_ACE";
        const n = perMatchCount(armed, res.event); // includes the one just added
        const broke = breaksRecord(
          isAce ? "aces" : "superDigs",
          store.db.events.filter((e) => e.id !== eventId),
          matchId,
          armed,
        );
        const first = players.get(armed)?.name ?? "Player";
        if (broke) showFlash(`🏆 SEASON RECORD · ${first}: ${n} ${isAce ? "aces" : "super digs"}!`, true);
        else if ([3, 5, 7].includes(n)) showFlash(`🔥 ${first}: ${n} ${isAce ? "aces" : "super digs"} this match`, true);
      }
    }

    const logged: LoggedAction = {
      eventId,
      playerId: armed,
      side: aSide,
      action: armedAction,
      phase,
    };
    const nextCurrent = [...rally.current, logged];

    if (res.pointTo) {
      endRally(res.pointTo, nextCurrent, assistUpgradeEventId);
    } else {
      setState({
        ...state,
        rally: { ...rally, phase: res.nextPhase, side: res.nextSide, current: nextCurrent },
      });
      setArmed(null);
    }
  };

  // ---- Scorer missed a contact: advance the flow, log nothing ----
  const skip = () => {
    if (phase === "OVER") return;
    const { nextPhase, nextSide } = skipPhase(phase, side);
    const logged: LoggedAction = { eventId: null, playerId: null, side, action: null, phase };
    setState({
      ...state,
      rally: { ...rally, phase: nextPhase, side: nextSide, current: [...rally.current, logged] },
    });
    setArmed(null);
  };

  // ---- Resolve a rally: score, rotate the winner on side-out ----
  const endRally = (winner: Side, current: LoggedAction[], assistUpgradeEventId: string | null) => {
    const { nextServing, rotateWinner } = resolvePoint(rally.serving, winner);
    const usScore = state.usScore + (winner === "US" ? 1 : 0);
    const oppScore = state.oppScore + (winner === "OPP" ? 1 : 0);

    const snapshot: RallySnapshot = {
      usScore: state.usScore,
      oppScore: state.oppScore,
      serving: rally.serving,
      usLineup,
      oppLineup,
      eventIds: current.map((a) => a.eventId).filter((x): x is string => !!x),
      assistUpgradeEventId,
    };

    setState({
      ...state,
      usScore,
      oppScore,
      usLineup: rotateWinner && winner === "US" ? rotate(usLineup) : usLineup,
      oppLineup: rotateWinner && winner === "OPP" ? rotate(oppLineup) : oppLineup,
      rally: openingRally(nextServing),
      history: [...state.history, snapshot],
    });
    setArmed(null);
    showFlash(`Point · ${teamName(winner)}${rotateWinner ? " · rotate ↻" : ""}`);
  };

  // ---- Undo: last action within a rally, else the last completed rally ----
  const undo = () => {
    if (rally.current.length > 0) {
      const last = rally.current[rally.current.length - 1];
      if (last.eventId) store.removeEvent(last.eventId);
      setState({
        ...state,
        rally: {
          ...rally,
          phase: last.phase,
          side: last.side,
          current: rally.current.slice(0, -1),
        },
      });
      setArmed(null);
      return;
    }
    const prev = state.history[state.history.length - 1];
    if (!prev) return;
    for (const eid of prev.eventIds) store.removeEvent(eid);
    if (prev.assistUpgradeEventId) store.removeEvent(prev.assistUpgradeEventId);
    setState({
      ...state,
      usScore: prev.usScore,
      oppScore: prev.oppScore,
      usLineup: prev.usLineup,
      oppLineup: prev.oppLineup,
      rally: openingRally(prev.serving),
      history: state.history.slice(0, -1),
    });
    setArmed(null);
    showFlash("Undone");
  };

  // ---- Back: undo exactly one step (a mis-tap) without losing the match ----
  // Same engine as Undo, surfaced as an always-present, unmissable control so a
  // wrong tap is one press away from being fixed.
  const canGoBack = rally.current.length > 0 || state.history.length > 0;

  // ---- Save: force-write the shared session so a second collector can pick up
  // exactly here. Data already auto-saves on every tap; this is the explicit,
  // reassuring checkpoint for "pause the video, hand off, resume later".
  const save = () => {
    setState({ ...state }); // re-persist to the per-match shared key
    setSavedAt(Date.now());
    showFlash("✓ Saved — anyone who opens this match can resume from here", true);
  };

  // ---- Set / match banking ----
  const deciding = state.set === match.totalSets;
  const target = deciding ? 15 : 25;
  const setDone = setPointReached(state.usScore, state.oppScore, target);
  const setWinner: Side | null = setDone ? (state.usScore > state.oppScore ? "US" : "OPP") : null;

  // FIVB 6.3.2/7.1 - the deciding set requires a NEW toss. It is only reached
  // at a genuine set tie (2-2 in best-of-5, 1-1 in best-of-3). Until that toss
  // is entered, scoring is blocked and a toss prompt is shown.
  const setsToWin = Math.ceil(match.totalSets / 2);
  const decidingTie = state.usSets === setsToWin - 1 && state.oppSets === setsToWin - 1;
  const needsDecidingToss = deciding && decidingTie && !state.decidingToss;

  /** Record the fresh deciding-set toss and open the set with its result. */
  const confirmDecidingToss = () => {
    if (!dToss.winner || !dToss.choice) return;
    const toss: Toss = { winner: dToss.winner, choice: dToss.choice };
    setState({
      ...state,
      decidingToss: toss,
      usLineup: state.setup.us.lineup,
      oppLineup: state.setup.opp.lineup,
      rally: openingRally(servingFromToss(toss)),
      history: [],
    });
    setDToss({ winner: null, choice: null });
    showFlash(`Deciding set - ${teamName(servingFromToss(toss))} serve`, true);
  };

  const bankSet = () => {
    if (!setWinner) return;
    // Persist the finished set's score — the match_sets row standings use.
    store.recordSetScore(matchId, {
      setNo: state.set,
      homePoints: state.usScore,
      awayPoints: state.oppScore,
    });
    const nextSet = Math.min(state.set + 1, match.totalSets);
    // FIVB 6.3.2/7.1: the deciding set needs a NEW toss. Entering it, we clear
    // any prior deciding toss so the UI prompts for a fresh one; firstServer
    // returns null until it is taken, so we hold the previous server as a
    // harmless placeholder - scoring is blocked until the toss is entered.
    const enteringDeciding = isDecidingSet(nextSet, match.totalSets);
    const nextDecidingToss = enteringDeciding ? null : state.decidingToss;
    const serving =
      firstServerForSet(nextSet, match.totalSets, state.toss, nextDecidingToss) ??
      state.rally.serving;
    setState({
      ...state,
      usSets: state.usSets + (setWinner === "US" ? 1 : 0),
      oppSets: state.oppSets + (setWinner === "OPP" ? 1 : 0),
      set: nextSet,
      decidingToss: nextDecidingToss,
      setScores: [...(state.setScores ?? []), { us: state.usScore, opp: state.oppScore }],
      usScore: 0,
      oppScore: 0,
      // Fresh set: both teams return to their starting rotations.
      usLineup: state.setup.us.lineup,
      oppLineup: state.setup.opp.lineup,
      rally: openingRally(serving),
      history: [],
    });
    showFlash(`Set ${state.set}: ${teamName(setWinner)}`, true);
  };

  const endMatch = () => {
    const winnerTeamId =
      state.usSets === state.oppSets
        ? null
        : state.usSets > state.oppSets
          ? match.homeTeamId
          : match.awayTeamId;
    store.completeMatch(matchId, winnerTeamId);
    setState(null); // clear the resumable rally session
    router.push(`/console/matches/${matchId}/review`);
  };

  // ---- Live top performers (this match, both rosters) ----
  const matchEvents = store.db.events.filter((e) => e.matchId === matchId);
  const ls = lines(allRoster, matchEvents);
  const topScorer = [...ls].sort((a, b) => b.points - a.points)[0];
  const topServer = [...ls].sort((a, b) => b.aces - a.aces)[0];
  const topDef = [...ls].sort((a, b) => b.superDigs + b.blocks - (a.superDigs + a.blocks))[0];
  const nm = (pid?: string) => players.get(pid ?? "")?.name ?? "TBD";

  // Serve locks the court to the server alone (Fix 1). Once the ball is live
  // the whole court is open — all 12 players tappable on both sides (Fix 2):
  // in volleyball the ball can go anywhere, so the collector must never be
  // restricted to a single side.
  const serveLock = phase === "SERVE" ? new Set([serverId(lineupOf(rally.serving))]) : null;
  const tappableIds: Set<string> | null = phase === "OVER" ? new Set() : serveLock;

  // Liberos are tappable on either side during any live (non-serve) phase — a
  // libero can dig or receive a surprise ball regardless of whose "turn" it is.
  const liberos = (["US", "OPP"] as Side[])
    .map((s) => ({
      side: s,
      playerId: liberoOf(s) ?? "",
      enabled: phase !== "SERVE" && phase !== "OVER",
    }))
    .filter((l) => l.playerId);

  const armedName = armed ? players.get(armed)?.name : null;

  const dTossReady = Boolean(dToss.winner && dToss.choice);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-3 pb-4 pt-3">
      {/* Deciding-set toss (FIVB 6.3.2/7.1) - blocks scoring until taken. */}
      {needsDecidingToss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 px-4 backdrop-blur">
          <div className="card-premium w-full max-w-md rounded-3xl p-6">
            <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
              Deciding set &middot; new toss required
            </p>
            <p className="mb-5 text-center text-xs text-dim">
              FIVB Rule 6.3.2 / 7.1: a fresh toss is taken before the deciding set.
            </p>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">Who won the toss?</p>
            <div className="mb-5 flex gap-2">
              {(["US", "OPP"] as Side[]).map((sd) => (
                <button
                  key={sd}
                  type="button"
                  onClick={() => setDToss((d) => ({ ...d, winner: sd }))}
                  className={`flex min-h-14 flex-1 items-center justify-center rounded-2xl border px-3 text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                    dToss.winner === sd ? "border-accent bg-accent/10 text-accent" : "border-line text-ink"
                  }`}
                >
                  {teamName(sd)}
                </button>
              ))}
            </div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">What did they choose?</p>
            <div className="mb-6 flex gap-2">
              {(["SERVE", "RECEIVE"] as Toss["choice"][]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDToss((d) => ({ ...d, choice: c }))}
                  className={`flex min-h-14 flex-1 items-center justify-center rounded-2xl border px-3 text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                    dToss.choice === c ? "border-accent bg-accent/10 text-accent" : "border-line text-ink"
                  }`}
                >
                  {c === "SERVE" ? "Serve" : "Receive"}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!dTossReady}
              onClick={confirmDecidingToss}
              className="btn-glow flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent text-sm font-extrabold uppercase tracking-wide text-accent-ink disabled:opacity-30"
            >
              Start deciding set
            </button>
          </div>
        </div>
      )}
      {/* Scoreboard */}
      <header className="mb-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={endMatch}
            className="flex min-h-11 items-center rounded-xl border border-line px-3 text-xs font-semibold text-dim"
          >
            End match
          </button>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-err">
            <span className="live-ring inline-block h-1.5 w-1.5 rounded-full bg-err" />
            Set {state.set} · {deciding ? "to 15" : "to 25"}
          </span>
          <span className="tnum rounded-xl border border-line px-3 py-2 text-xs text-dim">
            Sets {state.usSets}–{state.oppSets}
          </span>
        </div>
        <div className="card-premium grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl px-4 py-2.5">
          <p className="stat-display text-left text-sm font-bold uppercase leading-tight">
            {homeTeam.shortName}
          </p>
          <p className="stat-display tnum text-3xl font-extrabold">
            <span className={rally.serving === "US" ? "text-accent" : ""}>{state.usScore}</span>
            <span className="mx-2 text-dim">–</span>
            <span className={rally.serving === "OPP" ? "text-accent" : ""}>{state.oppScore}</span>
          </p>
          <p className="stat-display text-right text-sm font-bold uppercase leading-tight">
            {awayTeam.shortName}
          </p>
        </div>
      </header>

      {/* Set-won banner */}
      {setWinner && (
        <button
          type="button"
          onClick={bankSet}
          className="btn-glow mb-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent text-sm font-extrabold uppercase tracking-wide text-accent-ink"
        >
          Set point: bank set for {teamName(setWinner)} →
        </button>
      )}

      {/* Phase banner */}
      <div className="mb-2 flex min-h-6 items-center justify-between">
        <p className="stat-display text-sm font-bold uppercase tracking-wide text-accent">
          {phase !== "OVER" ? `${PHASE_LABEL[phase]} · ${teamName(side)}` : ""}
        </p>
        {phase !== "OVER" && (
          <button type="button" onClick={skip} className="min-h-6 text-[11px] font-semibold text-dim underline-offset-2 hover:underline">
            skip contact →
          </button>
        )}
      </div>

      {/* THE COURT — always on screen */}
      <CourtBoard
        homeName={homeTeam.name}
        awayName={awayTeam.name}
        usLineup={usLineup}
        oppLineup={oppLineup}
        players={players}
        serving={rally.serving}
        armedId={armed}
        tappableIds={tappableIds}
        onTap={(pid) => setArmed((a) => (a === pid ? null : pid))}
        liberos={liberos}
      />

      {/* ✓ O ✗ — the whole input system */}
      <div className="mt-3 flex-1">
        <p className="mb-1.5 min-h-4 text-center text-xs text-dim">
          {armed && armedAction
            ? `${armedName} · ${ACTION_LABEL[armedAction]}`
            : phase === "SERVE"
              ? `Tap the server to start`
              : phase !== "OVER"
                ? `Tap whoever touched the ball — any player, either side`
                : ""}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {TRIO_META.map((m) => (
            <button
              key={m.trio}
              type="button"
              disabled={!armed || phase === "OVER"}
              onClick={() => commit(m.trio)}
              className={`flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-2xl border text-center transition-all active:scale-[0.97] disabled:opacity-25 ${m.cls}`}
            >
              <span className="stat-display text-3xl font-extrabold leading-none">{m.glyph}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-80">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Top performers strip */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Top scorer" name={nm(topScorer?.playerId)} value={`${topScorer?.points ?? 0} pts`} />
        <MiniStat label="Aces" name={nm(topServer?.playerId)} value={`${topServer?.aces ?? 0}`} />
        <MiniStat label="Defence" name={nm(topDef?.playerId)} value={`${(topDef?.blocks ?? 0) + (topDef?.superDigs ?? 0)}`} />
      </div>

      {/* Back + Save — always visible. Back fixes a mis-tap one step at a time;
          Save checkpoints the shared session for hand-off / video analysis. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!canGoBack}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface2 text-sm font-bold text-ink disabled:opacity-30"
        >
          ← Back {rally.current.length > 0 ? "(action)" : state.history.length > 0 ? "(point)" : ""}
        </button>
        <button
          type="button"
          onClick={save}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 text-sm font-bold text-accent"
        >
          💾 Save
        </button>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-dim">
        {savedAt
          ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · shared with anyone on this console`
          : "Auto-saving every tap · Save to checkpoint for hand-off"}
      </p>

      {/* Flash toast */}
      {flash && (
        <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div
            className={`rounded-2xl border px-5 py-2.5 text-center text-sm font-bold shadow-lg ${
              flash.big ? "vv-pulse border-accent bg-accent text-accent-ink" : "border-line bg-surface2 text-ink"
            }`}
          >
            {flash.text}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="card-premium rounded-xl px-3 py-2 text-center">
      <p className="text-[9px] uppercase tracking-wider text-dim">{label}</p>
      <p className="stat-display truncate text-sm font-bold">{name}</p>
      <p className="tnum text-xs text-accent">{value}</p>
    </div>
  );
}
