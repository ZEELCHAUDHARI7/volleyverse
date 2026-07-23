"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useMatch, useStore } from "@/lib/store";
import { lines } from "@/lib/metrics";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  PageSkeleton,
  StatusChip,
} from "@/components/ui";

/**
 * MATCH REVIEW - the post-match summary the Rally Tracker lands on after
 * "End match". Everything shown is DERIVED from persisted data (match set
 * scores + StatEvents via metrics.ts); nothing is invented. When a match
 * ended with little data recorded, the page degrades gracefully instead of
 * showing a dead end.
 */
export default function MatchReview() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } =
    useMatch(id);

  const allRoster = useMemo(
    () => [...homeRoster, ...awayRoster],
    [homeRoster, awayRoster],
  );
  const ls = useMemo(() => lines(allRoster, events), [allRoster, events]);

  // playerId -> display name + team short code, for the box score.
  const meta = useMemo(() => {
    const m = new Map<string, { name: string; team: string }>();
    for (const p of homeRoster)
      m.set(p.id, { name: p.fullName, team: homeTeam?.shortName ?? "" });
    for (const p of awayRoster)
      m.set(p.id, { name: p.fullName, team: awayTeam?.shortName ?? "" });
    return m;
  }, [homeRoster, awayRoster, homeTeam, awayTeam]);

  if (!store.ready) return <PageSkeleton />;

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="Match not found"
          hint="This match may have been removed, or the link is out of date."
          action={
            <LinkButton href="/console" variant="primary">
              Back to console
            </LinkButton>
          }
        />
      </div>
    );
  }

  const sets = match.setScores ?? [];
  const homeSetWins = sets.filter((s) => s.homePoints > s.awayPoints).length;
  const awaySetWins = sets.filter((s) => s.awayPoints > s.homePoints).length;

  const winnerName =
    match.winnerTeamId === homeTeam.id
      ? homeTeam.name
      : match.winnerTeamId === awayTeam.id
        ? awayTeam.name
        : null;

  // Box score: everyone who recorded at least one contact, best scorers first.
  const contributors = [...ls]
    .filter(
      (l) =>
        l.points > 0 ||
        l.aces > 0 ||
        l.blocks > 0 ||
        l.saves > 0 ||
        l.assists > 0,
    )
    .sort((a, b) => b.points - a.points);

  const nameOf = (pid: string) => meta.get(pid)?.name ?? "Unknown";
  const teamOf = (pid: string) => meta.get(pid)?.team ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Match review"
        subtitle={`${homeTeam.name} vs ${awayTeam.name}`}
        action={
          <div className="flex gap-2">
            <LinkButton href="/console" variant="ghost">
              Console
            </LinkButton>
            <LinkButton href="/console/matches/new" variant="primary">
              New match
            </LinkButton>
          </div>
        }
      />

      {/* Result banner */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <StatusChip tone={match.status === "completed" ? "ok" : "dim"}>
            {match.status}
          </StatusChip>
          {winnerName ? (
            <StatusChip tone="accent">Winner: {winnerName}</StatusChip>
          ) : (
            <StatusChip tone="dim">No winner recorded</StatusChip>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <p className="stat-display text-right text-lg font-extrabold uppercase leading-tight">
            {homeTeam.name}
          </p>
          <p className="stat-display tnum text-4xl font-extrabold">
            <span className={homeSetWins > awaySetWins ? "text-accent" : ""}>
              {homeSetWins}
            </span>
            <span className="mx-2 text-dim">-</span>
            <span className={awaySetWins > homeSetWins ? "text-accent" : ""}>
              {awaySetWins}
            </span>
          </p>
          <p className="stat-display text-left text-lg font-extrabold uppercase leading-tight">
            {awayTeam.name}
          </p>
        </div>
        <p className="mt-2 text-center text-xs text-dim">
          Best of {match.totalSets}
        </p>
      </Card>

      {/* Set-by-set scores */}
      <Card className="mb-4">
        <h2 className="stat-display mb-3 text-sm font-bold uppercase tracking-wide text-accent">
          Sets
        </h2>
        {sets.length === 0 ? (
          <p className="text-sm text-dim">
            No set scores were recorded for this match. If it ended before any
            set was banked, there is nothing to show here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sets.map((s) => {
              const homeWon = s.homePoints > s.awayPoints;
              return (
                <div
                  key={s.setNo}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface2/40 px-3 py-2 text-sm"
                >
                  <span className="text-dim">Set {s.setNo}</span>
                  <span className="tnum font-bold">
                    <span className={homeWon ? "text-accent" : ""}>
                      {s.homePoints}
                    </span>
                    <span className="mx-2 text-dim">-</span>
                    <span className={!homeWon ? "text-accent" : ""}>
                      {s.awayPoints}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Player box score */}
      <Card>
        <h2 className="stat-display mb-3 text-sm font-bold uppercase tracking-wide text-accent">
          Box score
        </h2>
        {contributors.length === 0 ? (
          <p className="text-sm text-dim">
            No player statistics were recorded for this match.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-dim">
                  <th className="py-1 pr-2">Player</th>
                  <th className="py-1 pr-2">Team</th>
                  <th className="py-1 pr-2 text-right">Pts</th>
                  <th className="py-1 pr-2 text-right">Aces</th>
                  <th className="py-1 pr-2 text-right">Blk</th>
                  <th className="py-1 pr-2 text-right">Ast</th>
                  <th className="py-1 text-right">Digs</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((l) => (
                  <tr key={l.playerId} className="border-t border-line/60">
                    <td className="py-1.5 pr-2 font-semibold">
                      {nameOf(l.playerId)}
                    </td>
                    <td className="py-1.5 pr-2 text-dim">
                      {teamOf(l.playerId)}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right font-bold">
                      {l.points}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right">{l.aces}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{l.blocks}</td>
                    <td className="tnum py-1.5 pr-2 text-right">{l.assists}</td>
                    <td className="tnum py-1.5 text-right">{l.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
