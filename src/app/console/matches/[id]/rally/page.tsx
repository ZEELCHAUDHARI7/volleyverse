"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatch, useStore } from "@/lib/store";
import { breaksRecord, lines } from "@/lib/metrics";
import type { Match, OppPlayer, Player } from "@/lib/types";
import {
  BACK_ROW,
  FRONT_ROW,
  POSITIONS,
  type ActionKind,
  type Lineup,
  type LoggedAction,
  type MatchState,
  type Phase,
  type Position,
  type RallySnapshot,
  type Side,
  type TeamSetup,
  type Toss,
  type Trio,
  inferAction,
  initialMatchState,
  isFrontRow,
  openingRally,
  other,
  resolvePoint,
  resolveTrio,
  rotate,
  serverId,
  servingForSet,
  servingFromToss,
  setPointReached,
  skipPhase,
} from "@/lib/rally";
import { RoleTag } from "@/components/ui";

/**
 * RALLY TRACKER v2 — the live courtside engine.
 *
 * Two screens behind one route: the SETUP WIZARD (toss → starting six →
 * opponent six → court view), then the LIVE tracker.
 *
 * Live contract (the "three buttons" redesign):
 *   · the COURT never leaves the screen — both teams, net in the middle
 *   · tap the player who acted → everyone else fades → ✓ O ✗ appear
 *   · WHAT happened (serve/spike/block/dig…) is inferred from the rally
 *     phase + who was tapped — never asked
 *   · ✓/✗ end the rally: score, serve and rotation update automatically
 *   · O advances the rally flow to the next expected contact
 *   · one always-visible Undo; every tap persists locally within a frame
 */

const RALLY_KEY = (matchId: string) => `volleyverse:rally:${matchId}`;

/** Display metadata for anyone on court — Guardians or opponent. */
interface CourtPlayer {
  id: string;
  name: string;
  jersey?: number;
  side: Side;
}

export default function RallyTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, roster } = useMatch(id);
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
        // v1 states (single-lineup schema) can't drive the two-sided court.
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
    },
    [match],
  );

  if (!ready || !loaded) return null;
  if (!match) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-dim">Match not found.</p>
      </div>
    );
  }

  if (!state) {
    return <SetupWizard match={match} roster={roster} store={store} onStart={persist} />;
  }

  return (
    <LiveScreen
      match={match}
      roster={roster}
      state={state}
      setState={persist}
      store={store}
    />
  );
}

// =====================================================================
// SETUP WIZARD — Toss → Guardians six → Opponent six → Court view
// =====================================================================

type WizardStep = "TOSS" | "US_SIX" | "OPP_SIX" | "COURT";

function SetupWizard({
  match,
  roster,
  store,
  onStart,
}: {
  match: Match;
  roster: Player[];
  store: ReturnType<typeof useStore>;
  onStart: (m: MatchState) => void;
}) {
  const [step, setStep] = useState<WizardStep>("TOSS");

  // Step 1 — toss
  const [tossWinner, setTossWinner] = useState<Side | null>(null);
  const [tossChoice, setTossChoice] = useState<Toss["choice"] | null>(null);

  // Step 2 — our starting six + libero (tap to place, P1 first)
  const [slots, setSlots] = useState<Partial<Record<Position, string>>>({});
  const [liberoId, setLiberoId] = useState<string | null>(null);

  // Step 3 — opponent players (manual entry, position order)
  const [oppNames, setOppNames] = useState<string[]>(Array(6).fill(""));
  const [oppLibero, setOppLibero] = useState("");

  const toss: Toss | null =
    tossWinner && tossChoice ? { winner: tossWinner, choice: tossChoice } : null;
  const placed = useMemo(() => new Set(Object.values(slots)), [slots]);
  const nextPos = POSITIONS.find((p) => !slots[p]);
  const sixReady = POSITIONS.every((p) => slots[p]);

  const tapPlayer = (playerId: string) => {
    const existing = POSITIONS.find((p) => slots[p] === playerId);
    if (existing) {
      setSlots((s) => {
        const n = { ...s };
        delete n[existing];
        return n;
      });
      return;
    }
    if (liberoId === playerId || !nextPos) return;
    setSlots((s) => ({ ...s, [nextPos]: playerId }));
  };

  // Opponent ids are stable per match — StatEvents reference them forever.
  const oppPlayers: OppPlayer[] = useMemo(() => {
    const six = oppNames.map((n, i) => ({
      id: `${match.id}_opp${i + 1}`,
      name: n.trim() || `${match.opponent.split(" ")[0]} ${i + 1}`,
    }));
    return oppLibero.trim()
      ? [...six, { id: `${match.id}_opp7`, name: oppLibero.trim() }]
      : six;
  }, [oppNames, oppLibero, match.id, match.opponent]);

  const start = () => {
    if (!sixReady || !toss) return;
    const us: TeamSetup = { lineup: slots as Lineup, liberoId };
    const oppLineup = Object.fromEntries(
      POSITIONS.map((p, i) => [p, oppPlayers[i].id]),
    ) as unknown as Lineup;
    const opp: TeamSetup = {
      lineup: oppLineup,
      liberoId: oppLibero.trim() ? `${match.id}_opp7` : null,
    };
    store.setOppPlayers(match.id, oppPlayers);
    onStart(initialMatchState(us, opp, toss));
  };

  const nameOf = (pid?: string) => roster.find((p) => p.id === pid)?.name.split(" ")[0] ?? "";
  const stepIndex = { TOSS: 1, US_SIX: 2, OPP_SIX: 3, COURT: 4 }[step];

  const bigChoice = (active: boolean) =>
    `card-premium flex min-h-16 flex-1 items-center justify-center rounded-2xl px-3 text-center text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
      active ? "ring-2 ring-accent bg-accent/10 text-accent" : "text-ink"
    }`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-32 pt-4">
      <header className="mb-5 flex items-center justify-between">
        <Link
          href={`/console/matches/${match.id}`}
          className="flex min-h-12 items-center rounded-xl border border-line px-4 text-sm font-semibold text-dim"
        >
          ← Exit
        </Link>
        <p className="stat-display text-base font-bold uppercase">vs {match.opponent}</p>
        <span className="tnum text-xs text-dim">Step {stepIndex}/4</span>
      </header>

      {step === "TOSS" && (
        <>
          <StepTitle n={1} title="Toss" sub="One decision sets everything up." />
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
            Who won the toss?
          </p>
          <div className="mb-6 flex gap-2">
            <button type="button" onClick={() => setTossWinner("US")} className={bigChoice(tossWinner === "US")}>
              Goa Guardians
            </button>
            <button type="button" onClick={() => setTossWinner("OPP")} className={bigChoice(tossWinner === "OPP")}>
              {match.opponent}
            </button>
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
            What did they choose?
          </p>
          <div className="mb-6 flex gap-2">
            <button type="button" onClick={() => setTossChoice("SERVE")} className={bigChoice(tossChoice === "SERVE")}>
              Serve
            </button>
            <button type="button" onClick={() => setTossChoice("RECEIVE")} className={bigChoice(tossChoice === "RECEIVE")}>
              Receive
            </button>
          </div>
          {toss && (
            <p className="mb-4 text-center text-sm font-bold text-accent">
              → {servingFromToss(toss) === "US" ? "Goa Guardians" : match.opponent} serve first
            </p>
          )}
          <WizardNext label="Next · Guardians line-up" disabled={!toss} onClick={() => setStep("US_SIX")} />
        </>
      )}

      {step === "US_SIX" && (
        <>
          <StepTitle n={2} title="Guardians starting six" sub="Tap to place — P1 serves first. Libero optional." />
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
            On court <span className="text-accent">{Object.keys(slots).length}/6</span> · position 1 serves
          </p>
          <div className="card-premium mb-5 rounded-2xl p-4">
            <p className="mb-2 text-center text-[10px] uppercase tracking-widest text-dim">← net →</p>
            <div className="grid grid-cols-3 gap-2">
              {[...FRONT_ROW, ...BACK_ROW].map((p) => (
                <MiniSlot key={p} pos={p} name={nameOf(slots[p])} active={p === nextPos} />
              ))}
            </div>
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
            Tap to place · tap again to remove
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roster.map((p) => {
              const pos = POSITIONS.find((x) => slots[x] === p.id);
              const isLibero = liberoId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => tapPlayer(p.id)}
                  className={`card-premium flex min-h-16 items-center justify-between rounded-2xl px-3 py-2.5 text-left active:scale-[0.98] ${
                    pos ? "ring-2 ring-accent" : isLibero ? "opacity-40" : ""
                  }`}
                >
                  <span>
                    <span className="block text-sm font-bold leading-tight">{p.name.split(" ")[0]}</span>
                    <span className="tnum text-[11px] text-dim">#{p.jersey}</span>
                  </span>
                  {pos ? (
                    <span className="stat-display tnum text-lg font-extrabold text-accent">P{pos}</span>
                  ) : (
                    <RoleTag role={p.role} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
            Libero <span className="text-dim/60">(optional · defensive specialist)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {roster.map((p) => {
              const disabled = placed.has(p.id);
              const active = liberoId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setLiberoId(active ? null : p.id)}
                  className={`min-h-10 rounded-full px-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                    active
                      ? "bg-violet text-white"
                      : disabled
                        ? "border border-line text-dim/40"
                        : "border border-line text-dim"
                  }`}
                >
                  {p.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <WizardNext
            label={sixReady ? `Next · ${match.opponent} line-up` : `Pick ${6 - Object.keys(slots).length} more`}
            disabled={!sixReady}
            onClick={() => setStep("OPP_SIX")}
            onBack={() => setStep("TOSS")}
          />
        </>
      )}

      {step === "OPP_SIX" && (
        <>
          <StepTitle
            n={3}
            title={`${match.opponent} players`}
            sub="Enter their six in serving order — P1 serves first. Blank = auto name."
          />
          <div className="space-y-2">
            {POSITIONS.map((p, i) => (
              <label key={p} className="flex items-center gap-3">
                <span className="stat-display tnum w-9 text-right text-sm font-extrabold text-dim">
                  P{p}
                </span>
                <input
                  className="min-h-12 w-full rounded-xl border border-line bg-surface2 px-4 text-sm text-ink placeholder:text-dim focus:border-accent focus:outline-none"
                  placeholder={`Player ${i + 1}${p === 1 ? " · serves first" : ""}`}
                  value={oppNames[i]}
                  onChange={(e) =>
                    setOppNames((ns) => ns.map((n, j) => (j === i ? e.target.value : n)))
                  }
                />
              </label>
            ))}
            <label className="flex items-center gap-3 pt-2">
              <span className="w-9 text-right text-[10px] font-bold uppercase tracking-wider text-violet">
                Lib
              </span>
              <input
                className="min-h-12 w-full rounded-xl border border-violet/40 bg-surface2 px-4 text-sm text-ink placeholder:text-dim focus:border-violet focus:outline-none"
                placeholder="Libero (optional)"
                value={oppLibero}
                onChange={(e) => setOppLibero(e.target.value)}
              />
            </label>
          </div>
          <WizardNext label="Next · Court view" onClick={() => setStep("COURT")} onBack={() => setStep("US_SIX")} />
        </>
      )}

      {step === "COURT" && toss && sixReady && (
        <>
          <StepTitle
            n={4}
            title="Court view"
            sub={`${servingFromToss(toss) === "US" ? "Goa Guardians" : match.opponent} serve — server highlighted.`}
          />
          <CourtBoard
            opponent={match.opponent}
            usLineup={slots as Lineup}
            oppLineup={
              Object.fromEntries(POSITIONS.map((p, i) => [p, oppPlayers[i].id])) as unknown as Lineup
            }
            players={
              new Map<string, CourtPlayer>([
                ...roster.map((p): [string, CourtPlayer] => [
                  p.id,
                  { id: p.id, name: p.name.split(" ")[0], jersey: p.jersey, side: "US" },
                ]),
                ...oppPlayers.map((p): [string, CourtPlayer] => [
                  p.id,
                  { id: p.id, name: p.name, side: "OPP" },
                ]),
              ])
            }
            highlightId={
              servingFromToss(toss) === "US"
                ? (slots as Lineup)[1]
                : oppPlayers[0].id
            }
            serving={servingFromToss(toss)}
          />
          <WizardNext label="Start match →" onClick={start} onBack={() => setStep("OPP_SIX")} />
        </>
      )}
    </div>
  );
}

function StepTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-5">
      <p className="stat-display text-xl font-extrabold uppercase">
        <span className="text-accent">{n}.</span> {title}
      </p>
      <p className="text-xs text-dim">{sub}</p>
    </div>
  );
}

function MiniSlot({ pos, name, active }: { pos: Position; name: string; active: boolean }) {
  return (
    <div
      className={`flex min-h-16 flex-col items-center justify-center rounded-xl border text-center ${
        name
          ? "border-accent/40 bg-accent/5"
          : active
            ? "border-accent border-dashed"
            : "border-line border-dashed"
      }`}
    >
      <span className="tnum text-[10px] text-dim">P{pos}</span>
      <span className="text-sm font-bold leading-tight">{name || "—"}</span>
    </div>
  );
}

function WizardNext({
  label,
  disabled = false,
  onClick,
  onBack,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 flex justify-center gap-2 px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-14 items-center rounded-2xl border border-line px-5 text-sm font-bold text-dim"
        >
          ← Back
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="btn-glow flex min-h-14 w-full max-w-md items-center justify-center rounded-2xl bg-accent text-base font-extrabold uppercase tracking-wide text-accent-ink disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}

// =====================================================================
// COURT BOARD — both teams, net in the middle. Shared by wizard + live.
// =====================================================================

/**
 * Screen layout mirrors a real court seen from our bench:
 *   opponent back row  (their P1 = server, top-left)
 *   opponent front row
 *   ───── net ─────
 *   our front row      (P4 P3 P2)
 *   our back row       (P5 P6 P1 — P1 = server, bottom-right)
 */
const OPP_ROWS: Position[][] = [
  [1, 6, 5],
  [2, 3, 4],
];
const US_ROWS: Position[][] = [FRONT_ROW, BACK_ROW];

function CourtBoard({
  opponent,
  usLineup,
  oppLineup,
  players,
  serving,
  highlightId = null,
  armedId = null,
  tappableSide = null,
  onTap,
  liberos,
}: {
  opponent: string;
  usLineup: Lineup;
  oppLineup: Lineup;
  players: Map<string, CourtPlayer>;
  serving: Side;
  /** Static highlight (wizard preview: the first server). */
  highlightId?: string | null;
  /** Armed player (live): everyone else fades. */
  armedId?: string | null;
  /** Which side may be tapped right now (null = read-only board). */
  tappableSide?: Side | null;
  onTap?: (playerId: string, side: Side) => void;
  /** Optional libero chips: [side, playerId, enabled][] rendered per side. */
  liberos?: { side: Side; playerId: string; enabled: boolean }[];
}) {
  const tile = (pos: Position, side: Side) => {
    const lineup = side === "US" ? usLineup : oppLineup;
    const pid = lineup[pos];
    const p = players.get(pid);
    const isServer = pos === 1 && side === serving;
    const isArmed = armedId === pid;
    const tappable = !!onTap && tappableSide === side;
    const faded = armedId ? !isArmed : tappableSide ? !tappable : false;

    return (
      <button
        key={`${side}${pos}`}
        type="button"
        disabled={!tappable}
        onClick={() => onTap?.(pid, side)}
        className={`relative flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 text-center transition-all duration-200 active:scale-[0.97] ${
          isArmed || highlightId === pid
            ? "border-accent bg-accent/15 ring-2 ring-accent"
            : faded
              ? "border-line/50 bg-surface2/20 opacity-30"
              : "border-line bg-surface2/40"
        }`}
      >
        <span className="tnum text-[9px] text-dim">
          P{pos}
          {isServer ? " · serve" : ""}
        </span>
        <span className="max-w-full truncate text-[13px] font-bold leading-tight">
          {p?.name ?? "—"}
        </span>
        {p?.jersey !== undefined && <span className="tnum text-[9px] text-dim">#{p.jersey}</span>}
        {isServer && (
          <span className="live-ring absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        )}
      </button>
    );
  };

  const liberoChip = (side: Side) => {
    const lib = liberos?.find((l) => l.side === side);
    if (!lib) return null;
    const p = players.get(lib.playerId);
    const isArmed = armedId === lib.playerId;
    const faded = armedId ? !isArmed : !lib.enabled;
    return (
      <button
        type="button"
        disabled={!lib.enabled || !onTap}
        onClick={() => onTap?.(lib.playerId, side)}
        className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all ${
          isArmed
            ? "border-violet bg-violet/15 ring-2 ring-violet"
            : faded
              ? "border-violet/20 opacity-30"
              : "border-violet/40"
        }`}
      >
        <span className="rounded bg-violet/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-violet">
          Libero
        </span>
        {p?.name}
      </button>
    );
  };

  return (
    <div className="card-premium rounded-2xl p-3">
      <p className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
        <span>{opponent}</span>
        {serving === "OPP" && <span className="text-accent">serving</span>}
      </p>
      {liberoChip("OPP")}
      <div className="mt-1.5 space-y-1.5">
        {OPP_ROWS.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map((pos) => tile(pos, "OPP"))}
          </div>
        ))}
      </div>

      {/* The net */}
      <div className="relative my-2.5 flex items-center">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
        <span className="px-2 text-[9px] font-bold uppercase tracking-[0.3em] text-dim">net</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
      </div>

      <div className="space-y-1.5">
        {US_ROWS.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map((pos) => tile(pos, "US"))}
          </div>
        ))}
      </div>
      <div className="mt-1.5">{liberoChip("US")}</div>
      <p className="mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
        <span>Goa Guardians</span>
        {serving === "US" && <span className="text-accent">serving</span>}
      </p>
    </div>
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
  roster,
  state,
  setState,
  store,
}: {
  match: Match;
  roster: Player[];
  state: MatchState;
  setState: (m: MatchState | null) => void;
  store: ReturnType<typeof useStore>;
}) {
  const router = useRouter();
  const matchId = match.id;
  const opponent = match.opponent;

  // One lookup for everyone on court — Guardians + opponent.
  const players = useMemo(() => {
    const m = new Map<string, CourtPlayer>();
    for (const p of roster)
      m.set(p.id, { id: p.id, name: p.name.split(" ")[0], jersey: p.jersey, side: "US" });
    for (const p of match.oppPlayers ?? [])
      m.set(p.id, { id: p.id, name: p.name, side: "OPP" });
    return m;
  }, [roster, match.oppPlayers]);

  const { rally, usLineup, oppLineup } = state;
  const phase = rally.phase;
  const side = rally.side; // team performing the current phase
  const lineupOf = (s: Side) => (s === "US" ? usLineup : oppLineup);
  const liberoOf = (s: Side) => state.setup[s === "US" ? "us" : "opp"].liberoId;
  const teamName = (s: Side) => (s === "US" ? "Guardians" : opponent);

  const [armed, setArmed] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; big?: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-arm the unambiguous actor so the common case is a single tap:
  // the server on SERVE, and our lone setter on our SET.
  useEffect(() => {
    if (phase === "OVER") return;
    if (phase === "SERVE") {
      setArmed(serverId(lineupOf(side)));
    } else if (phase === "SET" && side === "US") {
      const setters = POSITIONS.map((p) => usLineup[p]).filter(
        (pid) => roster.find((r) => r.id === pid)?.role === "SETTER",
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

  // Season-record + milestone detection (Guardians only).
  const perMatchCount = (pid: string, ev: "SERVE_ACE" | "DIG_SUPER") =>
    store.db.events.filter((e) => e.matchId === matchId && e.playerId === pid && e.type === ev)
      .length;

  // What would the armed tap mean right now?
  const armedAction: ActionKind | null = useMemo(() => {
    if (!armed || phase === "OVER") return null;
    const lib = liberoOf(side);
    const front = armed !== lib && isFrontRow(lineupOf(side), armed);
    return inferAction(phase, front);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, phase, side, usLineup, oppLineup]);

  // ---- Core: one of the three buttons for the armed player ----
  const commit = (trio: Trio) => {
    if (phase === "OVER" || !armed || !armedAction) return;
    const res = resolveTrio(armedAction, side, trio);
    const isOpp = side === "OPP";

    let eventId: string | null = null;
    let assistUpgradeEventId: string | null = null;

    if (res.event) {
      const e = store.addEvent(matchId, armed, state.set, res.event, isOpp);
      eventId = e.id;

      // Assist attribution: a kill upgrades that side's preceding set.
      if (res.event === "SPIKE_POINT") {
        const priorSet = [...rally.current]
          .reverse()
          .find((a) => a.action === "SET" && a.side === side && a.eventId);
        if (priorSet?.eventId && priorSet.playerId) {
          store.removeEvent(priorSet.eventId);
          const up = store.addEvent(matchId, priorSet.playerId, state.set, "SET_ASSIST", isOpp);
          assistUpgradeEventId = up.id;
          priorSet.eventId = up.id; // keep current-rally log consistent for undo
        }
      }

      // Milestone flashes — Guardians only (spec: flag at 3/5/7).
      if (!isOpp && (res.event === "SERVE_ACE" || res.event === "DIG_SUPER")) {
        const isAce = res.event === "SERVE_ACE";
        const n = perMatchCount(armed, res.event); // includes the one just added
        const broke = breaksRecord(
          isAce ? "aces" : "superDigs",
          store.db.events.filter((e) => e.id !== eventId),
          matchId,
          armed,
        );
        const first = players.get(armed)?.name ?? "Player";
        if (broke) showFlash(`🏆 SEASON RECORD — ${first}: ${n} ${isAce ? "aces" : "super digs"}!`, true);
        else if ([3, 5, 7].includes(n)) showFlash(`🔥 ${first} — ${n} ${isAce ? "aces" : "super digs"} this match`, true);
      }
    }

    const logged: LoggedAction = {
      eventId,
      playerId: armed,
      side,
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

  // ---- Set / match banking ----
  const deciding = state.set === match.totalSets;
  const target = deciding ? 15 : 25;
  const setDone = setPointReached(state.usScore, state.oppScore, target);
  const setWinner: Side | null = setDone ? (state.usScore > state.oppScore ? "US" : "OPP") : null;

  const bankSet = () => {
    if (!setWinner) return;
    const nextSet = Math.min(state.set + 1, match.totalSets);
    const serving = servingForSet(state.toss, nextSet); // first serve alternates
    setState({
      ...state,
      usSets: state.usSets + (setWinner === "US" ? 1 : 0),
      oppSets: state.oppSets + (setWinner === "OPP" ? 1 : 0),
      set: nextSet,
      setScores: [...(state.setScores ?? []), { us: state.usScore, opp: state.oppScore }],
      usScore: 0,
      oppScore: 0,
      // Fresh set: both teams return to their starting rotations.
      usLineup: state.setup.us.lineup,
      oppLineup: state.setup.opp.lineup,
      rally: openingRally(serving),
      history: [],
    });
    showFlash(`Set ${state.set} — ${teamName(setWinner)}`, true);
  };

  const endMatch = () => {
    store.completeMatch(matchId);
    setState(null); // clear the resumable rally session
    router.push(`/console/matches/${matchId}/review`);
  };

  // ---- Live top performers (this match, our roster) ----
  const matchEvents = store.db.events.filter((e) => e.matchId === matchId);
  const ls = lines(roster, matchEvents);
  const topScorer = [...ls].sort((a, b) => b.points - a.points)[0];
  const topServer = [...ls].sort((a, b) => b.aces - a.aces)[0];
  const topDef = [...ls].sort((a, b) => b.superDigs + b.blocks - (a.superDigs + a.blocks))[0];
  const nm = (pid?: string) => players.get(pid ?? "")?.name ?? "—";

  // Libero taps mean dig/receive — never serve, attack or (front-row) block.
  const liberoEnabled = phase === "RECEIVE" || phase === "DEFEND" || phase === "DIG" || phase === "SET";
  const liberos = (["US", "OPP"] as Side[])
    .map((s) => ({ side: s, playerId: liberoOf(s) ?? "", enabled: s === side && liberoEnabled }))
    .filter((l) => l.playerId);

  const armedName = armed ? players.get(armed)?.name : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-3 pb-4 pt-3">
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
          <p className="stat-display text-left text-sm font-bold uppercase leading-tight">Guardians</p>
          <p className="stat-display tnum text-3xl font-extrabold">
            <span className={rally.serving === "US" ? "text-accent" : ""}>{state.usScore}</span>
            <span className="mx-2 text-dim">–</span>
            <span className={rally.serving === "OPP" ? "text-accent" : ""}>{state.oppScore}</span>
          </p>
          <p className="stat-display text-right text-sm font-bold uppercase leading-tight">{opponent}</p>
        </div>
      </header>

      {/* Set-won banner */}
      {setWinner && (
        <button
          type="button"
          onClick={bankSet}
          className="btn-glow mb-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent text-sm font-extrabold uppercase tracking-wide text-accent-ink"
        >
          Set point — bank set for {teamName(setWinner)} →
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
        opponent={opponent}
        usLineup={usLineup}
        oppLineup={oppLineup}
        players={players}
        serving={rally.serving}
        armedId={armed}
        tappableSide={phase === "OVER" ? null : side}
        onTap={(pid) => setArmed((a) => (a === pid ? null : pid))}
        liberos={liberos}
      />

      {/* ✓ O ✗ — the whole input system */}
      <div className="mt-3 flex-1">
        <p className="mb-1.5 min-h-4 text-center text-xs text-dim">
          {armed && armedAction
            ? `${armedName} · ${ACTION_LABEL[armedAction]}`
            : phase !== "OVER"
              ? `Tap the ${teamName(side)} player who acted`
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

      {/* Undo — always visible */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={undo}
          disabled={rally.current.length === 0 && state.history.length === 0}
          className="flex min-h-12 w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-line bg-surface2 text-sm font-bold text-ink disabled:opacity-30"
        >
          ↺ Undo last {rally.current.length > 0 ? "action" : "point"}
        </button>
      </div>

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
