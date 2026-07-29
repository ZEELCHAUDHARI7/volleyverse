"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import { SpikeChartGrid } from "@/components/spike-charts";
import { Button, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import { OUTCOME_EVENT, spikeLine, spikeLog, type Outcome } from "@/lib/spikes";
import type { Player, StatEvent } from "@/lib/types";

/**
 * SPIKE TRACKER — tap a player, say what happened, done.
 *
 * The previous tracker walked a fixed serve → receive → set → spike
 * sequence and made the scorer name a receiver and a setter on every point.
 * Rallies do not work that way, so the sequence is gone along with the
 * court, the rotation, the toss and the automatic scoreboard.
 *
 * What is left is the thing that actually gets recorded courtside:
 *
 *   every player on both rosters is on screen, all the time
 *   tap whoever spiked → ✓ won / O rally continues / ✗ failed
 *   one tap = one attempt, and the charts redraw immediately
 *
 * Nothing is inferred. The app never asks who received or who set, and it
 * never asks the scorer to keep a rally's touch count in their head. A
 * rally with three swings in it is three taps, which is the whole reason O
 * exists: it is what makes "two attempts, one point" come out as 50%.
 *
 * There is no local session state to persist — every tap is a StatEvent in
 * the store, so a reload picks up exactly where it left off.
 */

const OUTCOME_UI: {
  outcome: Outcome;
  glyph: string;
  label: string;
  hint: string;
  cls: string;
}[] = [
  {
    outcome: "WIN",
    glyph: "✓",
    label: "Won the point",
    hint: "kill",
    cls: "border-ok/40 bg-ok/10 text-ok hover:border-ok active:bg-ok/20",
  },
  {
    outcome: "CONT",
    glyph: "O",
    label: "Rally continues",
    hint: "dug up / still live",
    cls: "border-azure/40 bg-azure/10 text-azure hover:border-azure active:bg-azure/20",
  },
  {
    outcome: "LOSE",
    glyph: "✗",
    label: "Failed",
    hint: "net or out",
    cls: "border-err/40 bg-err/10 text-err hover:border-err active:bg-err/20",
  },
];

const GLYPH_OF: Record<string, string> = {
  SPIKE_POINT: "✓",
  SPIKE_IN: "O",
  SPIKE_ERR: "✗",
};

export default function SpikeTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } = useMatch(id);
  const store = useStore();

  const [armed, setArmed] = useState<Player | null>(null);
  const [setNo, setSetNo] = useState(1);
  const [ending, setEnding] = useState(false);

  const log = useMemo(() => spikeLog(events), [events]);
  const allPlayers = useMemo(
    () => [...homeRoster, ...awayRoster],
    [homeRoster, awayRoster],
  );
  const nameOf = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p.fullName])),
    [allPlayers],
  );

  if (!store.ready) return <PageSkeleton />;

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

  const logOutcome = (outcome: Outcome) => {
    if (!armed) return;
    // There is no setup wizard to open the match any more, so the first tap
    // is what puts it on the board as live.
    if (match.status === "scheduled") store.startMatch(match.id);
    store.addEvent(match.id, armed.teamId, armed.id, setNo, OUTCOME_EVENT[outcome]);
    setArmed(null);
  };

  /** Pop the most recent tap of the match, whoever made it. */
  const undo = () => {
    const last = log[log.length - 1];
    if (last) store.removeEvent(last.id);
    setArmed(null);
  };

  const endMatch = () => {
    store.completeMatch(match.id, null);
    setEnding(false);
    setArmed(null);
  };

  // Completed match: the charts, in full, and nothing to tap.
  if (match.status === "completed") {
    return (
      <div className="mx-auto max-w-5xl space-y-5 px-4 pb-24 pt-6">
        <header className="card-premium rounded-2xl p-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
            Match complete
          </p>
          <p className="stat-display mt-2 text-2xl font-extrabold uppercase text-ink">
            {homeTeam.name} <span className="text-dim">vs</span> {awayTeam.name}
          </p>
          <p className="mt-1 text-xs text-dim">
            {log.length} spike {log.length === 1 ? "attempt" : "attempts"} recorded
          </p>
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

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pb-40 pt-4">
      <header className="card-premium rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <p className="stat-display text-sm font-extrabold uppercase text-accent">
            {homeTeam.name}
          </p>
          <span className="text-xs text-dim">vs</span>
          <p className="stat-display text-sm font-extrabold uppercase text-azure">
            {awayTeam.name}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-line/60 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-dim">
              Set
            </span>
            <Button
              variant="ghost"
              onClick={() => setSetNo((n) => Math.max(1, n - 1))}
              disabled={setNo === 1}
            >
              −
            </Button>
            <span className="stat-display tnum min-w-6 text-center text-xl font-extrabold text-ink">
              {setNo}
            </span>
            <Button
              variant="ghost"
              onClick={() => setSetNo((n) => Math.min(match.totalSets, n + 1))}
              disabled={setNo >= match.totalSets}
            >
              +
            </Button>
          </div>
          <Button variant="ghost" onClick={undo} disabled={log.length === 0}>
            ↶ Undo
          </Button>
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
              End the match and close tracking? The {log.length} recorded{" "}
              {log.length === 1 ? "attempt" : "attempts"} are kept.
            </p>
            <div className="mt-2 flex justify-center gap-2">
              <Button onClick={endMatch}>Confirm</Button>
              <Button variant="ghost" onClick={() => setEnding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <RosterPanel
          label={homeTeam.name}
          tone="accent"
          players={homeRoster}
          events={events}
          armedId={armed?.id ?? null}
          onTap={(p) => setArmed((cur) => (cur?.id === p.id ? null : p))}
        />
        <RosterPanel
          label={awayTeam.name}
          tone="azure"
          players={awayRoster}
          events={events}
          armedId={armed?.id ?? null}
          onTap={(p) => setArmed((cur) => (cur?.id === p.id ? null : p))}
        />
      </div>

      <RecentTaps log={log} nameOf={nameOf} />

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

      {/* The three buttons. Sticky, so the roster never has to scroll away. */}
      {armed && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto max-w-5xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="stat-display text-lg font-extrabold uppercase text-ink">
                {armed.jerseyNo !== null ? `#${armed.jerseyNo} ` : ""}
                {armed.fullName}
              </p>
              <Button variant="ghost" onClick={() => setArmed(null)}>
                Cancel
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {OUTCOME_UI.map((o) => (
                <button
                  key={o.outcome}
                  type="button"
                  onClick={() => logOutcome(o.outcome)}
                  className={`flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-all duration-150 ${o.cls}`}
                >
                  <span className="stat-display text-3xl font-extrabold">{o.glyph}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {o.label}
                  </span>
                  <span className="text-[10px] opacity-70">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One team's whole roster, always visible. Each tile carries that player's
 * running line so the scorer can sanity-check a tally without leaving the
 * tapping surface.
 */
function RosterPanel({
  label,
  tone,
  players,
  events,
  armedId,
  onTap,
}: {
  label: string;
  tone: "accent" | "azure";
  players: Player[];
  events: StatEvent[];
  armedId: string | null;
  onTap: (p: Player) => void;
}) {
  const ring = tone === "accent" ? "border-accent bg-accent/15" : "border-azure bg-azure/15";
  const dot = tone === "accent" ? "bg-accent" : "bg-azure";

  return (
    <section className="card-premium rounded-2xl p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </p>

      {players.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-dim">
          No players on this roster yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((p) => {
            const l = spikeLine(p.id, events);
            const on = armedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onTap(p)}
                className={`flex min-h-16 flex-col justify-center rounded-xl border px-2 py-2 text-left transition-all duration-150 ${
                  on ? ring : "border-line bg-surface2/40 hover:border-line/80"
                }`}
              >
                <span className="truncate text-xs font-bold text-ink">
                  {p.jerseyNo !== null && (
                    <span className="tnum mr-1 text-dim">{p.jerseyNo}</span>
                  )}
                  {p.fullName.split(" ")[0]}
                </span>
                <span className="tnum mt-0.5 text-[10px] text-dim">
                  {l.attempts === 0
                    ? "no attempts"
                    : `${l.attempts} att · ${l.pointsWon}✓ · ${l.successRate}%`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** The last few taps, newest first — the scorer's proof that it registered. */
function RecentTaps({
  log,
  nameOf,
}: {
  log: StatEvent[];
  nameOf: Map<string, string>;
}) {
  if (log.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-dim">
        Tap a player above, then ✓, O or ✗. Nothing else to fill in.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-dim">
        Last taps
      </span>
      {log
        .slice(-8)
        .reverse()
        .map((e) => (
          <span
            key={e.id}
            className="rounded-lg border border-line bg-surface2/50 px-2 py-1 text-[11px] text-dim"
          >
            {GLYPH_OF[e.type]}{" "}
            <span className="font-semibold text-ink">
              {(nameOf.get(e.playerId) ?? "Unknown").split(" ")[0]}
            </span>
            <span className="ml-1 opacity-60">S{e.setNo}</span>
          </span>
        ))}
    </div>
  );
}
