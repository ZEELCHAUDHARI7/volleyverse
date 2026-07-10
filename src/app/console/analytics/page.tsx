"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Card, PageHeader } from "@/components/ui";
import {
  PointsBySpiker,
  ReachVsSuccess,
  SetterAccuracyVsAssists,
  SpikeSuccessRate,
  TrendAcrossMatches,
} from "@/components/charts";

/** Season Analytics — all five brief charts over the whole season. */
export default function SeasonAnalytics() {
  const { ready, db, resetDemoData } = useStore();
  const [trendPlayerId, setTrendPlayerId] = useState<string | null>(null);

  if (!ready) return null;

  const completedIds = new Set(
    db.matches.filter((m) => m.status === "completed").map((m) => m.id),
  );
  const events = db.events.filter((e) => completedIds.has(e.matchId));
  const spikers = db.players.filter((p) => p.role === "SPIKER");
  const trendPlayer =
    db.players.find((p) => p.id === trendPlayerId) ?? spikers[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Season Analytics"
        subtitle={`${completedIds.size} completed matches · every number derived from courtside entries`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PointsBySpiker players={db.players} events={events} />
        <SpikeSuccessRate players={db.players} events={events} />
        <SetterAccuracyVsAssists players={db.players} events={events} />
        <ReachVsSuccess players={db.players} events={events} />
      </div>

      {trendPlayer && (
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {db.players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTrendPlayerId(p.id)}
                className={`min-h-10 rounded-xl px-3 text-xs font-bold transition-colors ${
                  trendPlayer.id === p.id
                    ? "bg-accent text-accent-ink"
                    : "border border-line text-dim"
                }`}
              >
                {p.name.split(" ")[0]}
              </button>
            ))}
          </div>
          <TrendAcrossMatches
            player={trendPlayer}
            matches={db.matches}
            events={db.events}
            metric="contribution"
          />
        </div>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Demo data</p>
          <p className="text-xs text-dim">
            Reset restores the seeded three-match season (derived from the
            client&apos;s reference Excel). Your own entries will be removed.
          </p>
        </div>
        <Button variant="danger" onClick={resetDemoData}>
          Reset demo data
        </Button>
      </Card>
    </div>
  );
}
