"use client";

import { useMemo, useState } from "react";
import type { Player, Team } from "@/lib/types";
import {
  POSITIONS,
  type Lineup,
  type MatchSetup,
  type Side,
  type TeamSetup,
  lineupComplete,
} from "@/lib/rally";
import { SixPicker, type SixState } from "@/components/court-setup";
import { CourtBoard, type CourtPlayer } from "@/components/court-board";

/**
 * BETWEEN-SETS ROTATION — the one screen a set boundary owes the collector.
 *
 * A set is not a new match. Teams rotate differently for set 2 than they did
 * for set 1, and before this screen existed the only way to record that was to
 * log the set as a separate match — which split one match's stats across
 * several and made a scoresheet impossible to read back.
 *
 * So: bank the set, then STOP here. Both sixes arrive pre-filled with the
 * rotation the last set started from, so a team that has not changed anything
 * is one tap from playing. A team that has is two taps from saying so.
 *
 * Nothing on this screen can lose data. It runs after the set score is banked
 * and after every event has been written with its own `setNo`; the only thing
 * it decides is where the players stand when the next serve goes up.
 */

type EditView = "REVIEW" | "US" | "OPP";

const toSix = (setup: TeamSetup): SixState => ({
  slots: { ...setup.lineup },
  liberoId: setup.liberoId,
});

export function SetRotationGate({
  set,
  homeTeam,
  awayTeam,
  homeRoster,
  awayRoster,
  current,
  serving,
  onStart,
}: {
  /** The set about to be played. */
  set: number;
  homeTeam: Team;
  awayTeam: Team;
  homeRoster: Player[];
  awayRoster: Player[];
  /** Rotation carried forward from the last set — the starting point. */
  current: MatchSetup;
  /** Who serves first this set, for the court preview. */
  serving: Side;
  onStart: (setup: MatchSetup) => void;
}) {
  const [view, setView] = useState<EditView>("REVIEW");
  const [us, setUs] = useState<SixState>(() => toSix(current.us));
  const [opp, setOpp] = useState<SixState>(() => toSix(current.opp));

  const players = useMemo(
    () =>
      new Map<string, CourtPlayer>([
        ...homeRoster.map((p): [string, CourtPlayer] => [
          p.id,
          {
            id: p.id,
            name: p.fullName.split(" ")[0],
            jersey: p.jerseyNo ?? undefined,
            side: "US",
          },
        ]),
        ...awayRoster.map((p): [string, CourtPlayer] => [
          p.id,
          {
            id: p.id,
            name: p.fullName.split(" ")[0],
            jersey: p.jerseyNo ?? undefined,
            side: "OPP",
          },
        ]),
      ]),
    [homeRoster, awayRoster],
  );

  const usReady = lineupComplete(us.slots);
  const oppReady = lineupComplete(opp.slots);

  const changed = (six: SixState, from: TeamSetup) =>
    POSITIONS.some((p) => six.slots[p] !== from.lineup[p]) ||
    six.liberoId !== from.liberoId;
  const anyChange = changed(us, current.us) || changed(opp, current.opp);

  const start = () => {
    if (!usReady || !oppReady) return;
    onStart({
      us: { lineup: us.slots as Lineup, liberoId: us.liberoId },
      opp: { lineup: opp.slots as Lineup, liberoId: opp.liberoId },
    });
  };

  // ---- Editing one side ------------------------------------------------
  if (view !== "REVIEW") {
    const isUs = view === "US";
    const team = isUs ? homeTeam : awayTeam;
    const roster = isUs ? homeRoster : awayRoster;
    const six = isUs ? us : opp;
    const setSix = isUs ? setUs : setOpp;
    const ready = isUs ? usReady : oppReady;
    const filled = POSITIONS.filter((p) => six.slots[p]).length;

    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-32 pt-4">
        <header className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
            Set {set} · starting rotation
          </p>
          <p className="stat-display text-xl font-extrabold uppercase text-ink">
            {team.name}
          </p>
          <p className="text-xs text-dim">
            Tap a player to take them off a slot, then tap whoever takes it. P1
            serves first.
          </p>
        </header>

        <SixPicker roster={roster} six={six} setSix={setSix} />

        <div className="glass fixed inset-x-0 bottom-0 z-40 flex justify-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              // Back out cleanly: the six returns to what it was on arrival,
              // so a half-finished edit can never reach the court.
              setSix(toSix(isUs ? current.us : current.opp));
              setView("REVIEW");
            }}
            className="flex min-h-14 items-center rounded-2xl border border-line px-5 text-sm font-bold text-dim"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setSix({ slots: {}, liberoId: six.liberoId })}
            className="flex min-h-14 items-center rounded-2xl border border-line px-5 text-sm font-bold text-dim"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => setView("REVIEW")}
            className="btn-glow flex min-h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-accent text-base font-extrabold uppercase tracking-wide text-accent-ink disabled:opacity-40"
          >
            {ready ? "Done" : `Pick ${6 - filled} more`}
          </button>
        </div>
      </div>
    );
  }

  // ---- Review: confirm or edit ----------------------------------------
  const preview = (six: SixState, fallback: Lineup): Lineup =>
    lineupComplete(six.slots) ? (six.slots as Lineup) : fallback;
  const usPreview = preview(us, current.us.lineup);
  const oppPreview = preview(opp, current.opp.lineup);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-32 pt-6">
      <header className="mb-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
          Set {set} · starting rotation
        </p>
        <h1 className="stat-display text-2xl font-extrabold uppercase tracking-wide text-ink">
          Line up for set {set}
        </h1>
        <p className="mt-1 text-xs text-dim">
          {anyChange
            ? "Rotation updated for this set. The match and every set before it are untouched."
            : "Carried over from the last set. Change either side if it rotated differently."}
        </p>
      </header>

      <CourtBoard
        homeName={homeTeam.name}
        awayName={awayTeam.name}
        usLineup={usPreview}
        oppLineup={oppPreview}
        players={players}
        serving={serving}
        highlightId={(serving === "US" ? usPreview : oppPreview)[1]}
      />

      <p className="mt-4 text-center text-xs text-dim">
        {(serving === "US" ? homeTeam : awayTeam).name} serve first · P1
        highlighted
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <RotationCard
          label={homeTeam.name}
          edited={changed(us, current.us)}
          ready={usReady}
          onEdit={() => setView("US")}
        />
        <RotationCard
          label={awayTeam.name}
          edited={changed(opp, current.opp)}
          ready={oppReady}
          onEdit={() => setView("OPP")}
        />
      </div>

      <div className="glass fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 py-3">
        <button
          type="button"
          disabled={!usReady || !oppReady}
          onClick={start}
          className="btn-glow flex min-h-14 w-full max-w-md items-center justify-center rounded-2xl bg-accent text-base font-extrabold uppercase tracking-wide text-accent-ink disabled:opacity-40"
        >
          {usReady && oppReady ? `Start set ${set} →` : "Both sixes needed"}
        </button>
      </div>
    </div>
  );
}

function RotationCard({
  label,
  edited,
  ready,
  onEdit,
}: {
  label: string;
  edited: boolean;
  ready: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className={`card-premium flex min-h-16 flex-col items-center justify-center rounded-2xl px-3 py-3 text-center active:scale-[0.98] ${
        !ready ? "ring-2 ring-err" : edited ? "ring-2 ring-accent" : ""
      }`}
    >
      <span className="stat-display truncate text-sm font-extrabold uppercase text-ink">
        {label}
      </span>
      <span
        className={`mt-0.5 text-[11px] font-bold uppercase tracking-wider ${
          !ready ? "text-err" : edited ? "text-accent" : "text-dim"
        }`}
      >
        {!ready ? "Incomplete · tap to fix" : edited ? "Changed · tap to edit" : "Unchanged · tap to edit"}
      </span>
    </button>
  );
}
