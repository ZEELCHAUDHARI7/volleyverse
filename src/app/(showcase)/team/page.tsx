"use client";

import { useState } from "react";
import type { PlayerPosition } from "@/lib/types";
import { standings } from "@/lib/metrics";
import {
  Aurora,
  PlayerCard,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { Pill } from "@/components/ui";

const POSITION_FILTERS: { key: PlayerPosition | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "OH", label: "Outside" },
  { key: "OPP", label: "Opposite" },
  { key: "MB", label: "Middle" },
  { key: "S", label: "Setters" },
  { key: "L", label: "Liberos" },
  { key: "DS", label: "Def. Spec." },
];

export default function TeamsPage() {
  const { ready, db, matches, events } = usePublished();
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [posFilter, setPosFilter] = useState<PlayerPosition | "ALL">("ALL");
  if (!ready) return <ShowcaseSkeleton />;

  const table = standings(matches);
  const recordFor = (teamId: string) => {
    const r = table.find((row) => row.teamId === teamId);
    return r ? `${r.won}W – ${r.lost}L` : "No results yet";
  };

  const players = db.players.filter(
    (p) =>
      (teamFilter === "ALL" || p.teamId === teamFilter) &&
      (posFilter === "ALL" || p.position === posFilter),
  );

  return (
    <div className="relative overflow-hidden">
      <Aurora subtle />
      <div className="relative mx-auto max-w-6xl px-4 py-14 md:px-8">
        <Reveal>
          <SectionLabel>The Teams</SectionLabel>
          <h1 className="stat-display text-5xl font-extrabold uppercase sm:text-7xl">
            Squads &amp; <span className="text-gradient">Rosters</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-dim sm:text-base">
            Season numbers from every published match, updated the moment a
            report is published.
          </p>
        </Reveal>

        {db.teams.length === 0 && (
          <Reveal delay={120}>
            <div className="card-premium relative mt-10 overflow-hidden rounded-2xl p-10 text-center">
              <div className="court-lines absolute inset-0" aria-hidden />
              <p className="stat-display relative text-xl font-bold uppercase">
                No teams yet
              </p>
              <p className="relative mt-2 text-sm text-dim">
                Teams appear here once they are registered in the console.
              </p>
            </div>
          </Reveal>
        )}

        {/* Team cards */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {db.teams.map((t, i) => (
            <Reveal key={t.id} delay={(i % 3) * 90}>
              <button
                type="button"
                onClick={() => setTeamFilter(teamFilter === t.id ? "ALL" : t.id)}
                aria-pressed={teamFilter === t.id}
                className={`card-premium shine group block w-full overflow-hidden rounded-2xl p-5 text-left transition-colors ${
                  teamFilter === t.id ? "border-accent/50" : ""
                }`}
              >
                <p className="stat-display text-2xl font-extrabold uppercase leading-none">
                  {t.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wider text-dim">
                  {t.city ?? ""}
                  {t.founded ? ` · est. ${t.founded}` : ""}
                </p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="stat-display tnum text-xl font-extrabold text-accent">
                      {recordFor(t.id)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-dim">
                      This season
                    </p>
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-dim">
                    {db.players.filter((p) => p.teamId === t.id).length} players
                  </p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>

        {/* Position filter + roster */}
        {db.players.length > 0 && (
          <>
            <Reveal delay={150}>
              <div
                className="mt-12 flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by position"
              >
                {POSITION_FILTERS.map((f) => (
                  <Pill
                    key={f.key}
                    active={posFilter === f.key}
                    onClick={() => setPosFilter(f.key)}
                  >
                    {f.label}
                  </Pill>
                ))}
              </div>
            </Reveal>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((p, i) => (
                <PlayerCard key={p.id} player={p} events={events} delay={(i % 3) * 90} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
