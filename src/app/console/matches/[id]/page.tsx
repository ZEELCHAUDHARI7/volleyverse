"use client";

import { useParams } from "next/navigation";
import { useStore, useMatch } from "@/lib/store";
import { lines, teamTotals, topBy, topDefender } from "@/lib/metrics";
import {
  BigStat,
  Card,
  LinkButton,
  PageHeader,
  PageSkeleton,
  PublishBadge,
  Button,
} from "@/components/ui";
import {
  AcesByPlayer,
  PointsBySpiker,
  ReachVsSuccess,
  SetterAccuracyVsAssists,
  SpikeSuccessRate,
  SuperDigsByPlayer,
} from "@/components/charts";

/** Match Dashboard — the brief's one-page summary after each match. */
export default function MatchDashboard() {
  const { id } = useParams<{ id: string }>();
  const { ready, db, setPublished } = useStore();
  const { match, roster, events } = useMatch(id);

  if (!ready) return <PageSkeleton />;
  if (!match) return <p className="text-dim">Match not found.</p>;

  const ls = lines(roster, events);
  const totals = teamTotals(roster, events);
  const scorer = topBy(ls, "points");
  const setter = topBy(ls, "assists");
  const defender = topDefender(ls);
  const name = (pid?: string) =>
    pid ? (db.players.find((p) => p.id === pid)?.name.split(" ")[0] ?? "N/A") : "N/A";

  // Team vs previous completed match
  const completed = [...db.matches]
    .filter((m) => m.status === "completed")
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const idx = completed.findIndex((m) => m.id === match.id);
  const prev = idx > 0 ? completed[idx - 1] : undefined;
  const prevTotals = prev
    ? teamTotals(
        db.players.filter((p) => prev.roster.includes(p.id)),
        db.events.filter((e) => e.matchId === prev.id),
      )
    : null;

  const delta = (a: number, b: number) => {
    const d = a - b;
    return d === 0 ? "±0" : d > 0 ? `+${d}` : `${d}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`vs ${match.opponent}`}
        subtitle={`${match.dateISO} · ${match.venue} · ${match.status === "live" ? "LIVE" : "Final"}`}
        action={
          <div className="flex items-center gap-2">
            <PublishBadge published={match.published} />
            {match.status === "live" ? (
              <LinkButton href={`/console/matches/${match.id}/rally`}>
                Rally Tracker
              </LinkButton>
            ) : (
              <LinkButton href={`/console/matches/${match.id}/review`} variant="ghost">
                Review / Corrections
              </LinkButton>
            )}
          </div>
        }
      />

      {/* MVP strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="tile-texture">
          <BigStat label="Top scorer" value={name(scorer?.playerId)} accent />
          <p className="tnum mt-1 text-sm text-dim">{scorer?.points ?? 0} points</p>
        </Card>
        <Card className="tile-texture">
          <BigStat label="Best setter" value={name(setter?.playerId)} accent />
          <p className="tnum mt-1 text-sm text-dim">{setter?.assists ?? 0} assists</p>
        </Card>
        <Card className="tile-texture">
          <BigStat label="Strongest defender" value={name(defender?.playerId)} accent />
          <p className="tnum mt-1 text-sm text-dim">
            {defender?.blocks ?? 0} blocks · {defender?.superDigs ?? 0} super digs
          </p>
        </Card>
      </div>

      {/* Team vs previous match */}
      <Card>
        <h2 className="stat-display mb-3 text-lg font-bold uppercase tracking-wide">
          Team Performance{prev ? ` · vs previous (${prev.opponent})` : ""}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <BigStat label="Points" value={totals.points} accent />
          <BigStat
            label="Spike %"
            value={totals.spikeRate === null ? "N/A" : `${totals.spikeRate}%`}
          />
          <BigStat label="Assists" value={totals.assists} />
          <BigStat label="Blocks" value={totals.blocks} />
          <BigStat label="Aces" value={totals.aces} />
          <BigStat label="Super digs" value={totals.superDigs} />
          <BigStat label="Errors" value={totals.errors} />
        </div>
        {prevTotals && (
          <p className="tnum mt-3 text-xs text-dim">
            vs previous: points {delta(totals.points, prevTotals.points)} · assists{" "}
            {delta(totals.assists, prevTotals.assists)} · blocks{" "}
            {delta(totals.blocks, prevTotals.blocks)} · aces{" "}
            {delta(totals.aces, prevTotals.aces)} · super digs{" "}
            {delta(totals.superDigs, prevTotals.superDigs)} · errors{" "}
            {delta(totals.errors, prevTotals.errors)}
          </p>
        )}
      </Card>

      {/* The charts — auto-update as events land */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PointsBySpiker players={roster} events={events} />
        <SpikeSuccessRate players={roster} events={events} />
        <AcesByPlayer players={roster} events={events} />
        <SuperDigsByPlayer players={roster} events={events} />
        <SetterAccuracyVsAssists players={roster} events={events} />
        <ReachVsSuccess players={roster} events={events} />
      </div>

      {/* Publish boundary (FR4): explicit, deliberate, reversible */}
      {match.status === "completed" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              {match.published ? "This match is public." : "This match is private."}
            </p>
            <p className="text-xs text-dim">
              Nothing is publicly visible until you publish. You can unpublish anytime.
            </p>
          </div>
          <Button
            variant={match.published ? "ghost" : "primary"}
            onClick={() => setPublished(match.id, !match.published)}
          >
            {match.published ? "Unpublish" : "Publish match"}
          </Button>
        </Card>
      )}
    </div>
  );
}
