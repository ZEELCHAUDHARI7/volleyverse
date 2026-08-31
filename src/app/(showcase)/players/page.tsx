"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Aurora,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { PositionTag } from "@/components/ui";

/**
 * Public Players Directory page listing all players with position filters.
 */
export default function PlayersDirectoryPage() {
  const { ready, db } = usePublished();
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");

  if (!ready) return <ShowcaseSkeleton />;

  const filteredPlayers = db.players.filter((p) => {
    const matchesSearch = p.fullName.toLowerCase().includes(search.toLowerCase());
    const matchesPos = posFilter === "ALL" || p.position === posFilter;
    return matchesSearch && matchesPos;
  });

  return (
    <div className="min-h-screen bg-[#080d1a] text-[#f2f6fc] pb-24">
      {/* Hero Header */}
      <section className="grain relative border-b border-[#1c2e54] overflow-hidden py-16 px-4 md:px-8">
        <Aurora />
        <div className="relative mx-auto max-w-6xl text-center">
          <SectionLabel>VolleyVerse League</SectionLabel>
          <h1 className="stat-display text-5xl font-black uppercase tracking-wider text-white sm:text-7xl">
            Player <span className="text-gradient">Directory</span>
          </h1>
          <p className="mt-3 text-sm text-dim max-w-xl mx-auto">
            Inspect individual athlete performance, skill radars, heatmaps, and career stats.
          </p>

          {/* Search & Filter Controls */}
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <input
              type="text"
              placeholder="Search player name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-72 rounded-xl border border-[#1c2e54] bg-[#0c1730] px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5 justify-center">
              {["ALL", "OH", "OPP", "MB", "S", "L", "DS", "U"].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                    posFilter === pos
                      ? "bg-blue-600 text-white"
                      : "bg-[#0c1730] text-slate-400 hover:text-white border border-[#1c2e54]"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Players Grid */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPlayers.map((p, i) => {
            const team = db.teams.find((t) => t.id === p.teamId);
            return (
              <Reveal key={p.id} delay={i * 30}>
                <Link
                  href={`/players/${p.id}`}
                  className="group card-premium relative flex items-center justify-between rounded-2xl border border-[#1c2e54] bg-[#0c1730] p-4 transition-all hover:border-blue-500/50 hover:scale-[1.02]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-lg font-black text-blue-400 border border-blue-500/30">
                      {p.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="stat-display text-base font-bold uppercase text-white group-hover:text-blue-400 transition-colors">
                        {p.fullName}
                      </h3>
                      <p className="text-xs text-dim">{team?.name ?? "Free Agent"}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <PositionTag position={p.position} />
                        {p.isCaptain && (
                          <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400 border border-amber-500/30">
                            C
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="stat-display text-2xl font-black text-slate-700 font-mono">
                      #{p.jerseyNo ?? "—"}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      View Profile →
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>

        {filteredPlayers.length === 0 && (
          <div className="py-20 text-center text-dim">
            No players found matching your search.
          </div>
        )}
      </section>
    </div>
  );
}
