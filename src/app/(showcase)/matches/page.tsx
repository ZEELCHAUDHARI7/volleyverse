"use client";

import Link from "next/link";
import { lines, topBy } from "@/lib/metrics";
import {
  Aurora,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";

export default function MatchesPage() {
  const { ready, db, matches, events } = usePublished();
  if (!ready) return <ShowcaseSkeleton />;

  return (
    <div className="relative overflow-hidden">
      <Aurora subtle />
      <div className="relative mx-auto max-w-6xl px-4 py-14 md:px-8">
        <Reveal>
          <SectionLabel>Results</SectionLabel>
          <h1 className="stat-display text-5xl font-extrabold uppercase sm:text-7xl">
            Match <span className="text-gradient">Reports</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-dim sm:text-base">
            Every published match, with the numbers that decided it.
          </p>
        </Reveal>

        <div className="mt-10 space-y-3">
          {matches.length === 0 && (
            <Reveal>
              <div className="card-premium relative overflow-hidden rounded-2xl p-10 text-center">
                <div className="court-lines absolute inset-0" aria-hidden />
                <p className="stat-display relative text-xl font-bold uppercase">
                  No match reports yet
                </p>
                <p className="relative mt-2 text-sm text-dim">
                  Check back after the next game.
                </p>
              </div>
            </Reveal>
          )}
          {matches.map((m, i) => {
            const ls = lines(
              db.players,
              events.filter((e) => e.matchId === m.id),
            );
            const top = topBy(ls, "points");
            const topPlayer = top && db.players.find((p) => p.id === top.playerId);
            return (
              <Reveal key={m.id} delay={i * 90}>
                <Link
                  href={`/matches/${m.id}`}
                  className="card-premium shine group flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-5"
                >
                  <div className="flex items-center gap-5">
                    <span
                      aria-hidden
                      className="stat-display text-outline hidden text-4xl font-extrabold sm:block"
                    >
                      {String(matches.length - i).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="stat-display text-xl font-extrabold uppercase sm:text-2xl">
                        Guardians <span className="text-dim">vs</span> {m.opponent}
                      </p>
                      <p className="mt-0.5 text-xs uppercase tracking-wider text-dim">
                        {m.dateISO} · {m.venue}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {topPlayer && top && (
                      <p className="text-sm text-dim">
                        Top scorer{" "}
                        <span className="font-semibold text-ink">{topPlayer.name}</span>
                        <span className="stat-display tnum ml-2 font-extrabold text-accent">
                          {top.points} pts
                        </span>
                      </p>
                    )}
                    <span
                      aria-hidden
                      className="translate-x-0 text-accent opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                    >
                      →
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}
