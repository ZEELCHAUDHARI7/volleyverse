"use client";

import { useState } from "react";
import type { Role } from "@/lib/types";
import {
  Aurora,
  PlayerCard,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { Pill } from "@/components/ui";

const FILTERS: { key: Role | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SPIKER", label: "Spikers" },
  { key: "SETTER", label: "Setters" },
  { key: "CENTRE", label: "Centres" },
];

export default function TeamPage() {
  const { ready, db, events } = usePublished();
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  if (!ready) return <ShowcaseSkeleton />;

  const players = db.players.filter(
    (p) => filter === "ALL" || p.role === filter,
  );

  return (
    <div className="relative overflow-hidden">
      <Aurora subtle />
      <div className="relative mx-auto max-w-6xl px-4 py-14 md:px-8">
        <Reveal>
          <SectionLabel>The Squad</SectionLabel>
          <h1 className="stat-display text-5xl font-extrabold uppercase sm:text-7xl">
            Guardians <span className="text-gradient">Roster</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-dim sm:text-base">
            Season numbers from every published match, updated the moment the
            coaching staff publishes a report.
          </p>
        </Reveal>

        <Reveal delay={150}>
          <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by role">
            {FILTERS.map((f) => (
              <Pill
                key={f.key}
                active={filter === f.key}
                onClick={() => setFilter(f.key)}
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
      </div>
    </div>
  );
}
