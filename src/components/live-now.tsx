"use client";

import Link from "next/link";
import {
  LiveLeaders,
  useAttackLeaders,
  useLiveMatch,
  useMatchContext,
} from "@/components/live-match";

/**
 * LIVE NOW — the fan-facing broadcast strip on the showcase home.
 * A teaser for the full /live Match Centre; all sync and derivation comes
 * from the shared live-match module (no duplicated logic here).
 *
 * There is no scoreboard: the courtside tracker records spike attempts and
 * their outcomes, not the referee's score, so a running total here would be
 * a number nobody entered.
 */
export function LiveNow() {
  const { ready, match, events, started } = useLiveMatch();
  const { homeTeam, awayTeam, venue } = useMatchContext(match);
  const leaders = useAttackLeaders(match, events, 5);

  if (!ready || !match) return null;

  const homeName = homeTeam?.name ?? "Home";
  const awayName = awayTeam?.name ?? "Away";
  const attempts = leaders.reduce((n, r) => n + r.attempts, 0);

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
            {started ? `${attempts} attacks tracked` : "warming up"}
            {venue ? ` · ${venue.name}` : ""}
          </p>
        </div>

        <div className="mt-8 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="hero-type text-4xl leading-[0.9] sm:text-6xl">
              {homeName}
              <span className="mx-3 align-middle text-2xl text-dim sm:text-3xl">vs</span>
              <span className="block text-accent sm:inline">{awayName}</span>
            </h2>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div className="lower-third px-5 py-3 pr-8">
                <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                  Top attacker
                </p>
                <p className="stat-display text-lg font-bold uppercase">
                  {leaders[0]?.name ?? "—"}
                </p>
              </div>
              <p className="max-w-xs text-sm text-dim">
                Every attack logged from the courtside tracker, swing by swing.
              </p>
            </div>
          </div>

          <LiveLeaders rows={leaders} homeName={homeName} awayName={awayName} />
        </div>

        <div className="mt-8">
          <Link
            href="/live"
            className="data-type text-[11px] font-semibold uppercase tracking-[0.25em] text-accent"
          >
            Full live statistics →
          </Link>
        </div>
      </div>
    </section>
  );
}
