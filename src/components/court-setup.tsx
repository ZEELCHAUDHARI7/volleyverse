"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Match, Player, Team } from "@/lib/types";
import type { useStore } from "@/lib/store";
import {
  BACK_ROW,
  FRONT_ROW,
  POSITIONS,
  type Lineup,
  type Position,
  type Side,
  type TeamSetup,
  type Toss,
  servingFromToss,
} from "@/lib/rally";
import { PositionTag } from "@/components/ui";
import { CourtBoard, type CourtPlayer } from "@/components/court-board";

// =====================================================================
// SETUP WIZARD — Toss → Home six → Away six → Court view
// =====================================================================

type WizardStep = "TOSS" | "HOME_SIX" | "AWAY_SIX" | "COURT";

/**
 * A starting six being built or edited. Slots are partial because a six is
 * incomplete while it is being filled in — `lineupComplete` is the gate.
 * Exported alongside `SixPicker` so the between-sets rotation screen
 * (set-rotation.tsx) edits a six with the same control the wizard builds one
 * with, rather than growing a second picker that can drift from this one.
 */
export interface SixState {
  slots: Partial<Record<Position, string>>;
  liberoId: string | null;
}

export function SetupWizard({
  match,
  homeTeam,
  awayTeam,
  homeRoster,
  awayRoster,
  store,
  onReady,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  homeRoster: Player[];
  awayRoster: Player[];
  store: ReturnType<typeof useStore>;
  onReady: (setup: { us: TeamSetup; opp: TeamSetup; toss: Toss }) => void;
}) {
  const [step, setStep] = useState<WizardStep>("TOSS");

  // Step 1 — toss
  const [tossWinner, setTossWinner] = useState<Side | null>(null);
  const [tossChoice, setTossChoice] = useState<Toss["choice"] | null>(null);

  // Steps 2 & 3 — starting six + libero per side (tap to place, P1 first)
  const [home, setHome] = useState<SixState>({ slots: {}, liberoId: null });
  const [away, setAway] = useState<SixState>({ slots: {}, liberoId: null });

  const toss: Toss | null =
    tossWinner && tossChoice ? { winner: tossWinner, choice: tossChoice } : null;

  const sixReady = (s: SixState) => POSITIONS.every((p) => s.slots[p]);
  const homeReady = sixReady(home);
  const awayReady = sixReady(away);

  const allPlayers = useMemo(
    () =>
      new Map<string, CourtPlayer>([
        ...homeRoster.map((p): [string, CourtPlayer] => [
          p.id,
          { id: p.id, name: p.fullName.split(" ")[0], jersey: p.jerseyNo ?? undefined, side: "US" },
        ]),
        ...awayRoster.map((p): [string, CourtPlayer] => [
          p.id,
          { id: p.id, name: p.fullName.split(" ")[0], jersey: p.jerseyNo ?? undefined, side: "OPP" },
        ]),
      ]),
    [homeRoster, awayRoster],
  );

  const start = () => {
    if (!homeReady || !awayReady || !toss) return;
    const us: TeamSetup = { lineup: home.slots as Lineup, liberoId: home.liberoId };
    const opp: TeamSetup = { lineup: away.slots as Lineup, liberoId: away.liberoId };

    // Persist scoresheet detail: starters + liberos on the match roster.
    const starters = new Set([
      ...Object.values(home.slots),
      ...Object.values(away.slots),
    ]);
    store.setRosters(
      match.id,
      match.rosters.map((r) => ({
        ...r,
        isStarter: starters.has(r.playerId),
        isLibero: r.playerId === home.liberoId || r.playerId === away.liberoId,
      })),
    );
    if (match.status === "scheduled") store.startMatch(match.id);
    onReady({ us, opp, toss });
  };

  const stepIndex = { TOSS: 1, HOME_SIX: 2, AWAY_SIX: 3, COURT: 4 }[step];

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
        <p className="stat-display text-base font-bold uppercase">
          {homeTeam.shortName} vs {awayTeam.shortName}
        </p>
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
              {homeTeam.name}
            </button>
            <button type="button" onClick={() => setTossWinner("OPP")} className={bigChoice(tossWinner === "OPP")}>
              {awayTeam.name}
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
              → {servingFromToss(toss) === "US" ? homeTeam.name : awayTeam.name} serve first
            </p>
          )}
          <WizardNext
            label={`Next · ${homeTeam.shortName} line-up`}
            disabled={!toss}
            onClick={() => setStep("HOME_SIX")}
          />
        </>
      )}

      {step === "HOME_SIX" && (
        <>
          <StepTitle
            n={2}
            title={`${homeTeam.name} starting six`}
            sub="Tap to place. P1 serves first. Libero optional."
          />
          <SixPicker roster={homeRoster} six={home} setSix={setHome} />
          <WizardNext
            label={
              homeReady
                ? `Next · ${awayTeam.shortName} line-up`
                : `Pick ${6 - Object.keys(home.slots).length} more`
            }
            disabled={!homeReady}
            onClick={() => setStep("AWAY_SIX")}
            onBack={() => setStep("TOSS")}
          />
        </>
      )}

      {step === "AWAY_SIX" && (
        <>
          <StepTitle
            n={3}
            title={`${awayTeam.name} starting six`}
            sub="Tap to place. P1 serves first. Libero optional."
          />
          <SixPicker roster={awayRoster} six={away} setSix={setAway} />
          <WizardNext
            label={
              awayReady
                ? "Next · Court view"
                : `Pick ${6 - Object.keys(away.slots).length} more`
            }
            disabled={!awayReady}
            onClick={() => setStep("COURT")}
            onBack={() => setStep("HOME_SIX")}
          />
        </>
      )}

      {step === "COURT" && toss && homeReady && awayReady && (
        <>
          <StepTitle
            n={4}
            title="Court view"
            sub={`${servingFromToss(toss) === "US" ? homeTeam.name : awayTeam.name} serve. Server highlighted.`}
          />
          <CourtBoard
            homeName={homeTeam.name}
            awayName={awayTeam.name}
            usLineup={home.slots as Lineup}
            oppLineup={away.slots as Lineup}
            players={allPlayers}
            highlightId={
              servingFromToss(toss) === "US"
                ? (home.slots as Lineup)[1]
                : (away.slots as Lineup)[1]
            }
            serving={servingFromToss(toss)}
          />
          <WizardNext label="Start match →" onClick={start} onBack={() => setStep("AWAY_SIX")} />
        </>
      )}
    </div>
  );
}

/** Tap-to-place starting-six picker — used for both sides, and between sets. */
export function SixPicker({
  roster,
  six,
  setSix,
}: {
  roster: Player[];
  six: SixState;
  setSix: (s: SixState) => void;
}) {
  const { slots, liberoId } = six;
  const placed = new Set(Object.values(slots));
  const nextPos = POSITIONS.find((p) => !slots[p]);
  const playerAt = (pid?: string) => roster.find((p) => p.id === pid);
  const nameOf = (pid?: string) => playerAt(pid)?.fullName.split(" ")[0] ?? "";
  const jerseyOf = (pid?: string) => playerAt(pid)?.jerseyNo ?? null;

  const tapPlayer = (playerId: string) => {
    const existing = POSITIONS.find((p) => slots[p] === playerId);
    if (existing) {
      const n = { ...slots };
      delete n[existing];
      setSix({ ...six, slots: n });
      return;
    }
    if (liberoId === playerId || !nextPos) return;
    setSix({ ...six, slots: { ...slots, [nextPos]: playerId } });
  };

  return (
    <>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
        On court <span className="text-accent">{Object.keys(slots).length}/6</span> · position 1 serves
      </p>
      <div className="card-premium mb-5 rounded-2xl p-4">
        <p className="mb-2 text-center text-[10px] uppercase tracking-widest text-dim">← net →</p>
        <div className="grid grid-cols-3 gap-2">
          {[...FRONT_ROW, ...BACK_ROW].map((p) => (
            <MiniSlot
              key={p}
              pos={p}
              name={nameOf(slots[p])}
              jersey={jerseyOf(slots[p])}
              filled={Boolean(slots[p])}
              active={p === nextPos}
            />
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
              {/* Number first: it is what the collector can actually read on
                  the court. The name underneath confirms the tap. */}
              <span className="min-w-0">
                {p.jerseyNo !== null ? (
                  <>
                    <span className="stat-display tnum block text-xl font-extrabold leading-none">
                      #{p.jerseyNo}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-tight text-dim">
                      {p.fullName.split(" ")[0]}
                    </span>
                  </>
                ) : (
                  <span className="block truncate text-sm font-bold leading-tight">
                    {p.fullName.split(" ")[0]}
                  </span>
                )}
              </span>
              {pos ? (
                <span className="stat-display tnum text-lg font-extrabold text-accent">P{pos}</span>
              ) : (
                <PositionTag position={p.position} short />
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
              onClick={() => setSix({ ...six, liberoId: active ? null : p.id })}
              className={`min-h-10 rounded-full px-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-violet text-white"
                  : disabled
                    ? "border border-line text-dim/40"
                    : "border border-line text-dim"
              }`}
            >
              {p.jerseyNo !== null && (
                <span className="tnum mr-1.5 text-sm font-extrabold">#{p.jerseyNo}</span>
              )}
              {p.fullName.split(" ")[0]}
            </button>
          );
        })}
      </div>
    </>
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

function MiniSlot({
  pos,
  name,
  jersey,
  filled,
  active,
}: {
  pos: Position;
  name: string;
  jersey: number | null;
  filled: boolean;
  active: boolean;
}) {
  return (
    <div
      className={`flex min-h-16 flex-col items-center justify-center rounded-xl border text-center ${
        filled
          ? "border-accent/40 bg-accent/5"
          : active
            ? "border-accent border-dashed"
            : "border-line border-dashed"
      }`}
    >
      <span className="tnum text-[10px] text-dim">P{pos}</span>
      {!filled ? (
        <span className="stat-display text-lg font-extrabold leading-none">Open</span>
      ) : jersey !== null ? (
        <>
          <span className="stat-display tnum text-lg font-extrabold leading-none">#{jersey}</span>
          <span className="max-w-full truncate px-1 text-[10px] leading-tight text-dim">
            {name}
          </span>
        </>
      ) : (
        <span className="max-w-full truncate px-1 text-sm font-bold leading-tight">{name}</span>
      )}
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
