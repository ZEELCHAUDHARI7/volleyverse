"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Card, PageHeader, PageSkeleton, Pill } from "@/components/ui";
import {
  AcesByPlayer,
  DefendersLeaderboard,
  PointsBySpiker,
  ReachVsSuccess,
  RecordsStrip,
  SetterAccuracyVsAssists,
  SpikeSuccessRate,
  SuperDigsByPlayer,
  TrendAcrossMatches,
} from "@/components/charts";

/** Season Analytics — all five brief charts over the whole season. */
export default function SeasonAnalytics() {
  const { ready, db, resetDemoData } = useStore();
  const [trendPlayerId, setTrendPlayerId] = useState<string | null>(null);

  if (!ready) return <PageSkeleton />;

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

      {/* Season records — auto-flagged the moment they're broken courtside */}
      <RecordsStrip
        players={db.players}
        matches={db.matches}
        events={events}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PointsBySpiker players={db.players} events={events} />
        <SpikeSuccessRate players={db.players} events={events} />
        <AcesByPlayer players={db.players} events={events} />
        <SuperDigsByPlayer players={db.players} events={events} />
        <SetterAccuracyVsAssists players={db.players} events={events} />
        <ReachVsSuccess players={db.players} events={events} />
      </div>

      {/* Full-season defender rankings — every player with a defensive act,
          not just the homepage top-3 teaser */}
      <DefendersLeaderboard
        players={db.players}
        events={events}
        limit={db.players.length}
      />

      {trendPlayer && (
        <div>
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Select player">
            {db.players.map((p) => (
              <Pill
                key={p.id}
                active={trendPlayer.id === p.id}
                onClick={() => setTrendPlayerId(p.id)}
              >
                {p.name.split(" ")[0]}
              </Pill>
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
