"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { playerLine } from "@/lib/metrics";
import { BigStat, Card, PageHeader, PageSkeleton, Pill, RoleTag } from "@/components/ui";
import { TrendAcrossMatches } from "@/components/charts";

/** Player profile: season stats, per-match table, improvement trend. */
export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const { ready, db } = useStore();
  const [metric, setMetric] = useState<"points" | "successRate" | "contribution">("points");

  if (!ready) return <PageSkeleton />;
  const player = db.players.find((p) => p.id === id);
  if (!player) return <p className="text-dim">Player not found.</p>;

  const season = playerLine(player, db.events);
  const completed = [...db.matches]
    .filter((m) => m.status === "completed" && m.roster.includes(player.id))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const seasonCells =
    player.role === "SPIKER"
      ? [
          { label: "Points", value: season.points, accent: true },
          { label: "Attempts", value: season.spikeAttempts },
          { label: "Success", value: season.successRate === null ? "N/A" : `${season.successRate}%` },
          { label: "Errors", value: season.errors },
        ]
      : player.role === "SETTER"
        ? [
            { label: "Assists", value: season.assists, accent: true },
            { label: "Set attempts", value: season.setAttempts },
            { label: "Accuracy", value: season.successRate === null ? "N/A" : `${season.successRate}%` },
            { label: "Errors", value: season.errors },
          ]
        : [
            { label: "Blocks", value: season.blocks, accent: true },
            { label: "Attempts", value: season.blockAttempts },
            { label: "Block rate", value: season.successRate === null ? "N/A" : `${season.successRate}%` },
            { label: "Saves", value: season.saves },
          ];

  const METRICS = [
    { key: "points" as const, label: "Points" },
    { key: "successRate" as const, label: "Success %" },
    { key: "contribution" as const, label: "Contribution" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={player.name}
        subtitle={`#${player.jersey} · ${player.heightM.toFixed(2)}m · reach ${player.reachM.toFixed(2)}m`}
        action={<RoleTag role={player.role} />}
      />

      <Card className="tile-texture">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {seasonCells.map((c) => (
            <BigStat key={c.label} label={c.label} value={c.value} accent={"accent" in c && !!c.accent} />
          ))}
        </div>
        <p className="tnum mt-3 text-xs text-dim">
          Season contribution index: {season.contribution} ·{" "}
          <span className="text-accent">{season.aces} aces</span> ·{" "}
          <span className="text-ok">{season.superDigs} super digs</span>
        </p>
      </Card>

      <div>
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Select metric">
          {METRICS.map((m) => (
            <Pill key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>
              {m.label}
            </Pill>
          ))}
        </div>
        <TrendAcrossMatches
          player={player}
          matches={db.matches}
          events={db.events}
          metric={metric}
        />
      </div>

      <Card>
        <h2 className="stat-display mb-3 text-lg font-bold uppercase tracking-wide">
          Match by Match
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-dim">
                <th className="py-2 pr-4">Match</th>
                <th className="tnum py-2 pr-4 text-right">Pts</th>
                <th className="tnum py-2 pr-4 text-right">Ast</th>
                <th className="tnum py-2 pr-4 text-right">Blk</th>
                <th className="tnum py-2 pr-4 text-right">Success</th>
                <th className="tnum py-2 text-right">Contrib</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((m) => {
                const l = playerLine(
                  player,
                  db.events.filter((e) => e.matchId === m.id),
                );
                return (
                  <tr key={m.id} className="border-b border-line/50">
                    <td className="py-2 pr-4">
                      vs {m.opponent}
                      <span className="ml-2 text-[11px] text-dim">{m.dateISO}</span>
                    </td>
                    <td className="tnum py-2 pr-4 text-right">{l.points}</td>
                    <td className="tnum py-2 pr-4 text-right">{l.assists}</td>
                    <td className="tnum py-2 pr-4 text-right">{l.blocks}</td>
                    <td className="tnum py-2 pr-4 text-right">
                      {l.successRate === null ? "N/A" : `${l.successRate}%`}
                    </td>
                    <td className="tnum py-2 text-right">{l.contribution}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
