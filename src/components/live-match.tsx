"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { spikeLines } from "@/lib/spikes";
import type { Match, Player, StatEvent, Team, Venue } from "@/lib/types";

/**
 * SHARED LIVE-MATCH PLUMBING for the fan-facing showcase.
 *
 * One hook plus a few small display pieces, used by both the home-page
 * Live Now strip and the /live Match Centre — the sync logic exists once.
 *
 * Sync model (local-first): the tracker writes a StatEvent per tap through
 * the store, and the store broadcasts DB writes via the cross-tab `storage`
 * event. Everything a fan sees is DERIVED from those events — there is no
 * separate courtside state document to keep in step, because the tracker no
 * longer models rotation, serve order or a rally sequence.
 *
 * Publish boundary: these components render TEAM-level aggregates and
 * attack leaders — broadcast content, public the way the gym scoreboard is.
 * Full per-player stat tables stay gated behind `match.published` elsewhere
 * in the showcase.
 */

export interface LiveMatchData {
  ready: boolean;
  /** The match currently marked live in the console, if any. */
  match: Match | null;
  /** This match's StatEvents (both sides), live via cross-tab sync. */
  events: StatEvent[];
  /** True once at least one attempt has been logged. */
  started: boolean;
}

export function useLiveMatch(): LiveMatchData {
  const { ready, db } = useStore();
  const match = useMemo(
    () => db.matches.find((m) => m.status === "live") ?? null,
    [db.matches],
  );

  const events = useMemo(
    () => (match ? db.events.filter((e) => e.matchId === match.id) : []),
    [db.events, match],
  );

  return { ready, match, events, started: events.length > 0 };
}

/** Resolve any player id to a display name. */
export function useNameOf(): (pid: string) => string {
  const { db } = useStore();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of db.players) m.set(p.id, p.fullName.split(" ")[0]);
    return (pid: string) => m.get(pid) ?? "TBD";
  }, [db.players]);
}

/** Home/away teams and venue of a match — the display context. */
export function useMatchContext(match: Match | null): {
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  venue: Venue | undefined;
} {
  const { db } = useStore();
  return {
    homeTeam: db.teams.find((t) => t.id === match?.homeTeamId),
    awayTeam: db.teams.find((t) => t.id === match?.awayTeamId),
    venue: db.venues.find((v) => v.id === match?.venueId),
  };
}

/** Minutes since the first logged event of the match (the "match timer"). */
export function useElapsedMinutes(events: StatEvent[]): number | null {
  const first = events.length ? Math.min(...events.map((e) => e.ts)) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  return first === null ? null : Math.max(0, Math.floor((now - first) / 60_000));
}

// ---------------------------------------------------------------------
// Attack leaders — what replaced the on-court six
// ---------------------------------------------------------------------

export interface LeaderRow {
  playerId: string;
  name: string;
  home: boolean;
  attempts: number;
  pointsWon: number;
  successRate: number | null;
}

/**
 * Both teams' attackers, best first. Ranked on points won, then on the
 * lower attempt count — one kill from one swing beats one kill from four.
 */
export function useAttackLeaders(
  match: Match | null,
  events: StatEvent[],
  limit = 6,
): LeaderRow[] {
  const { db } = useStore();
  return useMemo(() => {
    if (!match) return [];
    const roster: Player[] = db.players.filter(
      (p) => p.teamId === match.homeTeamId || p.teamId === match.awayTeamId,
    );
    const byId = new Map(roster.map((p) => [p.id, p]));
    return spikeLines(
      roster.map((p) => p.id),
      events,
    )
      .filter((l) => l.attempts > 0)
      .map((l) => {
        const p = byId.get(l.playerId)!;
        return {
          playerId: l.playerId,
          name: p.fullName,
          home: p.teamId === match.homeTeamId,
          attempts: l.attempts,
          pointsWon: l.pointsWon,
          successRate: l.successRate,
        };
      })
      .sort((a, b) => b.pointsWon - a.pointsWon || a.attempts - b.attempts)
      .slice(0, limit);
  }, [db.players, events, match, limit]);
}

/** Read-only attack leaderboard, fan styling. */
export function LiveLeaders({
  rows,
  homeName,
  awayName,
}: {
  rows: LeaderRow[];
  homeName: string;
  awayName: string;
}) {
  return (
    <div className="card-premium rounded-3xl p-4">
      <p className="data-type mb-3 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.3em] text-dim">
        <span>Attack leaders</span>
        <span>pts / att</span>
      </p>

      {rows.length === 0 ? (
        <p className="px-1 py-8 text-center text-xs text-dim">
          The board fills in from the first spike.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.playerId}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface2/40 px-2.5 py-2"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  r.home ? "bg-accent" : "bg-azure"
                }`}
                title={r.home ? homeName : awayName}
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-ink">
                {r.name}
              </span>
              <span className="stat-display tnum text-sm font-extrabold">
                {r.pointsWon}
                <span className="text-dim">/{r.attempts}</span>
              </span>
              <span className="tnum w-9 text-right text-[10px] text-dim">
                {r.successRate ?? 0}%
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="data-type mt-3 flex items-center gap-3 text-[9px] uppercase tracking-[0.25em] text-dim">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {homeName}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-azure" />
          {awayName}
        </span>
      </p>
    </div>
  );
}
