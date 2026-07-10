"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { playerLine } from "@/lib/metrics";
import { PageHeader, RoleTag } from "@/components/ui";
import type { Role } from "@/lib/types";
import { useState } from "react";

const FILTERS: (Role | "ALL")[] = ["ALL", "SPIKER", "SETTER", "CENTRE"];

export default function PlayersPage() {
  const { ready, db } = useStore();
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  if (!ready) return null;

  const players = db.players.filter((p) => filter === "ALL" || p.role === filter);

  return (
    <div className="space-y-6">
      <PageHeader title="Players" subtitle="Season stats across all recorded matches." />

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-10 rounded-xl px-4 text-xs font-bold uppercase tracking-wider transition-colors ${
              filter === f ? "bg-accent text-accent-ink" : "border border-line text-dim"
            }`}
          >
            {f === "ALL" ? "All" : `${f.charAt(0)}${f.slice(1).toLowerCase()}s`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {players.map((p) => {
          const l = playerLine(p, db.events);
          const headline =
            p.role === "SPIKER"
              ? `${l.points} pts`
              : p.role === "SETTER"
                ? `${l.assists} ast`
                : `${l.blocks} blk`;
          return (
            <Link
              key={p.id}
              href={`/console/players/${p.id}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface2"
            >
              <div className="flex items-center gap-3">
                <span className="stat-display tnum w-9 text-center text-lg font-extrabold text-dim">
                  {p.jersey}
                </span>
                <div>
                  <p className="font-semibold leading-tight">{p.name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <RoleTag role={p.role} />
                    <span className="tnum text-[11px] text-dim">
                      {p.heightM.toFixed(2)}m · reach {p.reachM.toFixed(2)}m
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="stat-display tnum text-xl font-extrabold text-accent">
                  {headline}
                </p>
                <p className="tnum text-[11px] text-dim">
                  {l.successRate === null ? "—" : `${l.successRate}%`} season
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
