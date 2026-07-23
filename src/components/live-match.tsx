"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { subscribeLiveState } from "@/lib/providers/live-state";
import type { Match, StatEvent, Team, Venue } from "@/lib/types";
import type { Lineup, MatchState, Position, Side } from "@/lib/rally";

/**
 * SHARED LIVE-MATCH PLUMBING for the fan-facing showcase.
 *
 * One hook + one court component, used by both the home-page Live Now
 * strip and the /live Match Centre — the sync logic exists exactly once.
 *
 * Sync model (local-first): the Rally Tracker persists MatchState to
 * localStorage on every tap; the store broadcasts DB writes via the
 * cross-tab `storage` event. This hook layers a 2s poll on top as a
 * same-tab / missed-event fallback. Swapping to Supabase realtime later
 * replaces the body of useLiveMatch only — every consumer is unchanged.
 *
 * Side mapping: the pure rally engine models sides as "US"/"OPP";
 * on the platform, US = the HOME team and OPP = the AWAY team.
 *
 * Publish boundary: fan components render the scoreboard, the
 * on-court six and TEAM-level aggregates — broadcast content, public the
 * way the gym scoreboard is. Full per-player stat tables stay gated
 * behind `match.published` elsewhere in the showcase.
 */

const RALLY_KEY = (matchId: string) => `volleyverse:rally:${matchId}`;

export interface LiveMatchData {
  ready: boolean;
  /** The match currently marked live in the console, if any. */
  match: Match | null;
  /** Courtside state — null until the setup wizard completes. */
  state: MatchState | null;
  /** This match's StatEvents (both sides), live via cross-tab sync. */
  events: StatEvent[];
  /** True when the last storage read threw — show a soft warning. */
  degraded: boolean;
}

export function useLiveMatch(): LiveMatchData {
  const { ready, db } = useStore();
  const match = useMemo(
    () => db.matches.find((m) => m.status === "live") ?? null,
    [db.matches],
  );
  const [state, setState] = useState<MatchState | null>(null);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    if (!match) {
      setState(null);
      return;
    }
    const key = RALLY_KEY(match.id);
    const read = () => {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as MatchState) : null;
        // Ignore pre-redesign (single-lineup) sessions.
        setState(parsed && parsed.usLineup && parsed.oppLineup ? parsed : null);
        setDegraded(false);
      } catch {
        setDegraded(true); // keep last good state on screen
      }
    };
    read();
    const iv = setInterval(read, 2000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener("storage", onStorage);
    // Cross-user realtime: when Supabase is configured, remote score
    // updates arrive here and also refresh the local cache so the poll and
    // other tabs stay consistent. No-op in local-only mode.
    const unsubscribe = subscribeLiveState(match.id, (remote) => {
      if (remote && remote.usLineup && remote.oppLineup) {
        setState(remote);
        setDegraded(false);
        try {
          window.localStorage.setItem(key, JSON.stringify(remote));
        } catch {
          /* cache write failed — remote state is still shown */
        }
      } else if (remote === null) {
        setState(null);
      }
    });
    return () => {
      clearInterval(iv);
      window.removeEventListener("storage", onStorage);
      unsubscribe();
    };
  }, [match]);

  const events = useMemo(
    () => (match ? db.events.filter((e) => e.matchId === match.id) : []),
    [db.events, match],
  );

  return { ready, match, state, events, degraded };
}

/** Resolve any on-court player id to a display name. */
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
// The court — both teams, net in the middle (read-only, fan styling)
// ---------------------------------------------------------------------

/** Screen rows mirror a real court seen from the home bench. */
const OPP_ROWS: Position[][] = [
  [1, 6, 5],
  [2, 3, 4],
];
const US_ROWS: Position[][] = [
  [4, 3, 2],
  [5, 6, 1],
];

export function LiveCourt({
  match,
  state,
  nameOf,
}: {
  match: Match;
  state: MatchState;
  nameOf: (pid: string) => string;
}) {
  const { homeTeam, awayTeam } = useMatchContext(match);
  const rows = (lineup: Lineup, rowDefs: Position[][], side: Side) =>
    rowDefs.map((row, i) => (
      <div key={`${side}${i}`} className="grid grid-cols-3 gap-1.5">
        {row.map((pos) => {
          const isServer = pos === 1 && side === state.rally.serving;
          return (
            <div
              key={pos}
              className={`relative rounded-lg border px-1 py-2 text-center ${
                isServer
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-line bg-surface2/40"
              }`}
            >
              <p className="max-w-full truncate text-[11px] font-bold leading-tight">
                {nameOf(lineup[pos])}
              </p>
              {isServer && (
                <span className="live-ring absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </div>
          );
        })}
      </div>
    ));

  return (
    <div className="card-premium rounded-3xl p-4">
      <p className="data-type mb-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.3em] text-dim">
        <span>{awayTeam?.name ?? "Away"}</span>
        {state.rally.serving === "OPP" && <span className="text-accent">serving</span>}
      </p>
      <div className="space-y-1.5">{rows(state.oppLineup, OPP_ROWS, "OPP")}</div>
      <div className="relative my-3 flex items-center" aria-hidden>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
        <span className="data-type px-2 text-[8px] font-bold uppercase tracking-[0.3em] text-dim">
          net
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
      </div>
      <div className="space-y-1.5">{rows(state.usLineup, US_ROWS, "US")}</div>
      <p className="data-type mt-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.3em] text-dim">
        <span>{homeTeam?.name ?? "Home"}</span>
        {state.rally.serving === "US" && <span className="text-accent">serving</span>}
      </p>
    </div>
  );
}
