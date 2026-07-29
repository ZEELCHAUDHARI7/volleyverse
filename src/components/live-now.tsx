"use client";

import Link from "next/link";
import {
  LiveCourt,
  useLiveMatch,
  useMatchContext,
  useNameOf,
} from "@/components/live-match";

/**
 * LIVE NOW — the fan-facing broadcast strip on the showcase home.
 * A teaser for the full /live Match Centre; all sync + court rendering
 * comes from the shared live-match module (no duplicated logic here).
 */
export function LiveNow() {
  const { ready, match, state } = useLiveMatch();
  const { homeTeam, awayTeam, venue } = useMatchContext(match);
  const nameOf = useNameOf();

  if (!ready || !match || !state) return null;

  const homeName = homeTeam?.name ?? "Home";
  const awayName = awayTeam?.name ?? "Away";
  const servingName = state.rally.serving === "US" ? homeName : awayName;

  return (
    <section className="relative overflow-hidden border-b border-line bg-raise">
      <div className="court-floor" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 py-16 md:px-8">
        {/* broadcast strip header */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="live-ring inline-block h-2 w-2 rounded-full bg-err" />
          <p className="data-type text-[11px] font-bold uppercase tracking-[0.4em] text-err">
            Live now
          </p>
          <p className="data-type text-[11px] uppercase tracking-[0.25em] text-dim">
            Set {state.set} · sets {state.usSets}–{state.oppSets}
            {venue ? ` · ${venue.name}` : ""}
          </p>
        </div>

        <div className="mt-8 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          {/* score */}
          <div>
            <h2 className="hero-type text-4xl leading-[0.9] sm:text-6xl">
              {homeName}
              <span className="mx-3 align-middle text-2xl text-dim sm:text-3xl">vs</span>
              <span className="block text-accent sm:inline">{awayName}</span>
            </h2>
            <p className="led mt-6 text-7xl font-semibold sm:text-8xl">
              <span className={state.rally.serving === "US" ? "text-accent" : ""}>
                {state.usScore}
              </span>
              <span className="mx-4 text-dim">–</span>
              <span className={state.rally.serving === "OPP" ? "text-accent" : ""}>
                {state.oppScore}
              </span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div className="lower-third px-5 py-3 pr-8">
                <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                  Serving
                </p>
                <p className="stat-display text-lg font-bold uppercase">{servingName}</p>
              </div>
              <p className="max-w-xs text-sm text-dim">
                Followed point by point from the courtside tracker.
              </p>
            </div>
          </div>

          {/* on-court six, both sides of the net */}
          <LiveCourt match={match} state={state} nameOf={nameOf} />
        </div>

        <div className="mt-8">
          <Link
            href="/live"
            className="data-type text-[11px] font-semibold uppercase tracking-[0.25em] text-accent"
          >
            Full live scoreboard & statistics →
          </Link>
        </div>
      </div>
    </section>
  );
}
