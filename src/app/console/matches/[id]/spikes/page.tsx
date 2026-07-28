"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import { SpikeChartGrid } from "@/components/spike-charts";
import { Button, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import {
  addPoint,
  endSet,
  newSession,
  recordEvent,
  undo,
  type ScoreSide,
  type SpikeSession,
} from "@/lib/spike-session";
import type { EventType, Player } from "@/lib/types";

/**
 * SPIKE TRACKER — the whole demo on one screen.
 *
 * Tap a player, tap one of three outcomes, done. No receiver, no setter,
 * no phase model: real rallies do not follow a fixed touch sequence, and
 * the same attacker can spike twice in one rally. Every tap is exactly one
 * attempt.
 *
 * The scoreboard is manual and independent of the taps, because only
 * spikes are logged — points from aces, blocks and opponent errors would
 * otherwise never appear.
 */

const SESSION_KEY = (matchId: string) => `volleyverse:spikes:${matchId}`;

const OUTCOMES: {
  type: EventType;
  glyph: string;
  label: string;
  sub: string;
  cls: string;
}[] = [
  {
    type: "SPIKE_POINT",
    glyph: "✓",
    label: "Point won",
    sub: "The spike landed",
    cls: "border-ok/40 bg-ok/10 text-ok hover:border-ok",
  },
  {
    type: "SPIKE_IN",
    glyph: "O",
    label: "Rally continues",
    sub: "They defended it",
    cls: "border-azure/40 bg-azure/10 text-azure hover:border-azure",
  },
  {
    type: "SPIKE_ERR",
    glyph: "✗",
    label: "Failed",
    sub: "Net or out",
    cls: "border-err/40 bg-err/10 text-err hover:border-err",
  },
];

export default function SpikeTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } = useMatch(id);
  const store = useStore();

  const [session, setSession] = useState<SpikeSession>(newSession);
  const [loaded, setLoaded] = useState(false);
  const [armed, setArmed] = useState<Player | null>(null);

  // Resume mid-match after a reload: score, set number and undo stack.
  // Keyed on the route id, not the match object — `useMatch` hands back a
  // fresh object every time the db changes, and re-reading storage on every
  // logged event would fight the writes below.
  useEffect(() => {
    if (!store.ready) return;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY(id));
      if (raw) {
        const parsed = JSON.parse(raw) as SpikeSession;
        if (typeof parsed.setNo === "number" && Array.isArray(parsed.undoStack)) {
          setSession(parsed);
        }
      }
    } catch {
      // corrupted payload — start a fresh session
    }
    setLoaded(true); // unconditional, so a missing match reaches its empty state
  }, [store.ready, id]);

  const persist = useCallback(
    (next: SpikeSession) => {
      setSession(next);
      try {
        window.localStorage.setItem(SESSION_KEY(id), JSON.stringify(next));
      } catch {
        // storage unavailable — state stays in memory for this session
      }
    },
    [id],
  );

  /** A match becomes live on its first recorded action, not on a setup wizard. */
  const ensureStarted = useCallback(() => {
    if (match && match.status === "scheduled") store.startMatch(match.id);
  }, [match, store]);

  const onOutcome = (player: Player, type: EventType) => {
    if (!match) return;
    ensureStarted();
    const e = store.addEvent(match.id, player.teamId, player.id, session.setNo, type);
    persist(recordEvent(session, e.id));
    setArmed(null);
  };

  const onPoint = (side: ScoreSide) => {
    ensureStarted();
    persist(addPoint(session, side));
  };

  const onUndo = () => {
    const { session: next, undone } = undo(session);
    if (!undone) return;
    if (undone.kind === "EVENT") store.removeEvent(undone.eventId);
    persist(next);
    setArmed(null);
  };

  const onEndSet = () => {
    if (!match) return;
    store.recordSetScore(match.id, {
      setNo: session.setNo,
      homePoints: session.homePoints,
      awayPoints: session.awayPoints,
    });
    persist(endSet(session));
    setArmed(null);
  };

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

  const allPlayers = [...homeRoster, ...awayRoster];

  return (
    <div className="space-y-5">
      {/* Scoreboard — manual, independent of the spike taps */}
      <header className="card-premium rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right">
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {homeTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-accent">
              {session.homePoints}
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-dim">
            Set {session.setNo}
          </p>
          <div>
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {awayTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-azure">
              {session.awayPoints}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-line/60 pt-3">
          <Button onClick={() => onPoint("home")}>+1 {homeTeam.shortName}</Button>
          <Button onClick={() => onPoint("away")}>+1 {awayTeam.shortName}</Button>
          <Button variant="ghost" onClick={onEndSet}>
            End set
          </Button>
          <Button
            variant="ghost"
            onClick={onUndo}
            disabled={session.undoStack.length === 0}
          >
            ↶ Undo
          </Button>
          <LinkButton href="/console" variant="ghost">
            Console
          </LinkButton>
        </div>
      </header>

      {/* Outcome buttons for the armed player */}
      {armed && (
        <div className="card-premium sticky top-2 z-10 rounded-2xl border-accent/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="stat-display text-lg font-extrabold uppercase text-ink">
              {armed.jerseyNo !== null ? `#${armed.jerseyNo} ` : ""}
              {armed.fullName}
            </p>
            <Button variant="ghost" onClick={() => setArmed(null)}>
              Cancel
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => onOutcome(armed, o.type)}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border transition-all duration-200 ${o.cls}`}
              >
                <span className="stat-display text-3xl font-extrabold">{o.glyph}</span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {o.label}
                </span>
                <span className="text-[10px] text-dim">{o.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Both rosters, always visible */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RosterPanel
          label={homeTeam.name}
          players={homeRoster}
          armedId={armed?.id ?? null}
          onPick={setArmed}
          tone="accent"
        />
        <RosterPanel
          label={awayTeam.name}
          players={awayRoster}
          armedId={armed?.id ?? null}
          onPick={setArmed}
          tone="azure"
        />
      </div>

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

function RosterPanel({
  label,
  players,
  armedId,
  onPick,
  tone,
}: {
  label: string;
  players: Player[];
  armedId: string | null;
  onPick: (p: Player | null) => void;
  tone: "accent" | "azure";
}) {
  const ring = tone === "accent" ? "border-accent bg-accent/10" : "border-azure bg-azure/10";
  return (
    <div className="card-premium rounded-2xl p-4">
      <h2 className="stat-display mb-3 text-sm font-bold uppercase tracking-wide text-dim">
        {label}
      </h2>
      {players.length === 0 ? (
        <p className="text-xs text-dim">
          No players registered for this team. Add them in League Setup.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((p) => {
            const active = p.id === armedId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPick(active ? null : p)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-all duration-200 ${
                  active ? ring : "border-line bg-surface2 hover:border-accent/40"
                }`}
              >
                <span className="stat-display tnum text-lg font-extrabold text-ink">
                  {p.jerseyNo ?? "–"}
                </span>
                <span className="truncate text-[11px] text-dim">
                  {p.fullName.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
