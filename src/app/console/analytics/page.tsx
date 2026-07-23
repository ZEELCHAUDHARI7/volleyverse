"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  PageSkeleton,
  SectionHeading,
  StatusChip,
} from "@/components/ui";
import {
  FormStrip,
  KpiGrid,
  PeriodTrend,
  RankingBars,
} from "@/components/analytics";
import { RecordsStrip, DefendersLeaderboard } from "@/components/charts";
import {
  exportTableCsv,
  headToHead,
  outcomeFor,
  periodPerformance,
  seasonSummary,
  setTally,
  teamMatches,
  teamRecord,
  tournamentPerformance,
  type Kpi,
} from "@/lib/analytics";
import type { Match } from "@/lib/types";

/**
 * SEASON & HISTORICAL ANALYTICS HUB.
 *
 * The macro view across every completed match: season totals, per-team
 * records, form, streaks, home/away splits, performance over time,
 * tournament performance, head-to-head, season records and the full match
 * history. Sport-neutral maths (general.ts) drives the records; the
 * volleyball charts add the event-level leaderboards.
 */
export default function SeasonAnalytics() {
  const { ready, db } = useStore();
  const completed = useMemo(
    () => db.matches.filter((m) => m.status === "completed"),
    [db.matches],
  );

  const [teamId, setTeamId] = useState<string>("");
  const [oppId, setOppId] = useState<string>("");

  const focusTeam = teamId || db.teams[0]?.id || "";

  const record = useMemo(
    () => (focusTeam ? teamRecord(db.matches, focusTeam) : null),
    [db.matches, focusTeam],
  );
  const monthly = useMemo(
    () => (focusTeam ? periodPerformance(db.matches, focusTeam, "month") : []),
    [db.matches, focusTeam],
  );
  const tourns = useMemo(
    () => (focusTeam ? tournamentPerformance(db.matches, db.tournaments, focusTeam) : []),
    [db.matches, db.tournaments, focusTeam],
  );
  const summary = useMemo(() => seasonSummary(db.matches), [db.matches]);

  const ranking = useMemo(
    () =>
      db.teams
        .map((t) => ({ name: t.shortName, value: teamRecord(db.matches, t.id).winPct }))
        .filter((r) => teamMatches(db.matches, db.teams.find((t) => t.shortName === r.name)!.id).length > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [db.teams, db.matches],
  );

  const h2h = useMemo(
    () => (focusTeam && oppId ? headToHead(db.matches, focusTeam, oppId) : null),
    [db.matches, focusTeam, oppId],
  );

  if (!ready) return <PageSkeleton />;

  const teamName = (id: string) => db.teams.find((t) => t.id === id)?.name ?? "—";
  const teamShort = (id: string | null) => db.teams.find((t) => t.id === id)?.shortName ?? "TBD";

  if (completed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Season Analytics" subtitle="Historical performance across every completed match." />
        <EmptyState
          title="No completed matches yet"
          hint="Run a match to completion in the Rally Tracker, then this dashboard fills with records, trends and head-to-head history."
          action={<LinkButton href="/console">Back to console</LinkButton>}
        />
      </div>
    );
  }

  const seasonKpis: Kpi[] = [
    { key: "played", label: "Matches Played", value: summary.matchesPlayed, tone: "accent" },
    { key: "sets", label: "Sets Contested", value: summary.totalSets, tone: "azure" },
    { key: "points", label: "Points Scored", value: summary.totalPoints },
    { key: "avg", label: "Avg Points / Set", value: summary.avgPointsPerSet },
    { key: "sweeps", label: "Straight-set Sweeps", value: summary.sweeps, tone: "ok" },
    { key: "five", label: "Five-setters", value: summary.fiveSetters, tone: "violet" },
  ];

  const recordKpis: Kpi[] = record
    ? [
        { key: "played", label: "Played", value: record.played },
        { key: "won", label: "Won", value: record.won, tone: "ok" },
        { key: "lost", label: "Lost", value: record.lost, tone: "err" },
        { key: "pct", label: "Win %", value: record.winPct, unit: "%", tone: "accent" },
        { key: "avgf", label: "Avg Pts For", value: record.avgPointsFor },
        { key: "avga", label: "Avg Pts Against", value: record.avgPointsAgainst },
        { key: "wstreak", label: "Longest Win Streak", value: record.longestWinStreak, tone: "ok" },
        { key: "lstreak", label: "Longest Loss Streak", value: record.longestLossStreak, tone: "err" },
      ]
    : [];

  const exportHistory = () => {
    exportTableCsv(
      "match_history.csv",
      ["Date", "Home", "Away", "Result", "Winner"],
      [...completed]
        .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
        .map((m) => {
          const t = setTally(m);
          return [
            m.dateISO,
            teamName(m.homeTeamId),
            teamName(m.awayTeamId),
            `${t.home}-${t.away}`,
            m.winnerTeamId ? teamName(m.winnerTeamId) : "—",
          ];
        }),
    );
  };

  return (
    <div className="analytics-doc space-y-8">
      <PageHeader
        title="Season Analytics"
        subtitle="Historical performance across every completed match."
        action={
          <div className="no-print flex gap-2">
            <Button variant="ghost" onClick={exportHistory}>⬇ Export CSV</Button>
            <LinkButton href="/console">Console</LinkButton>
          </div>
        }
      />

      {/* Season overview */}
      <section className="space-y-3">
        <SectionHeading icon="📊" title="Season Overview" />
        <KpiGrid kpis={seasonKpis} />
      </section>

      {/* Team leaderboard */}
      <section className="space-y-3">
        <SectionHeading icon="🥇" title="Team Rankings" hint="By win percentage across all completed matches." />
        <RankingBars title="Win Percentage" data={ranking} unit="%" />
      </section>

      {/* Season records + defenders */}
      <section className="space-y-3">
        <SectionHeading icon="🏆" title="Season Records" hint="Single-match highs across the league." />
        <RecordsStrip
          players={db.players}
          matches={db.matches}
          teams={db.teams}
          events={db.events}
          stats={["points", "aces", "blocks", "superDigs"]}
        />
        <DefendersLeaderboard players={db.players} events={db.events} limit={5} />
      </section>

      {/* Team deep-dive */}
      <section className="space-y-4">
        <SectionHeading
          icon="🛡️"
          title="Team Deep-dive"
          trailing={
            <select
              className="min-h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink focus:border-accent focus:outline-none"
              value={focusTeam}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {db.teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          }
        />
        {record && record.played > 0 ? (
          <>
            <KpiGrid kpis={recordKpis} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="stat-display text-lg font-bold uppercase tracking-wide">Recent Form</h3>
                  <FormStrip form={record.form} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface2/50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-dim">Home</p>
                    <p className="stat-display mt-1 text-2xl font-extrabold">
                      {record.home.won}<span className="text-dim">–</span>{record.home.lost}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface2/50 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-dim">Away</p>
                    <p className="stat-display mt-1 text-2xl font-extrabold">
                      {record.away.won}<span className="text-dim">–</span>{record.away.lost}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-surface2/50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-dim">Current streak</p>
                  <p className={`stat-display mt-1 text-2xl font-extrabold ${record.currentStreak >= 0 ? "text-ok" : "text-err"}`}>
                    {record.currentStreak > 0 ? `${record.currentStreak}W` : record.currentStreak < 0 ? `${-record.currentStreak}L` : "—"}
                  </p>
                </div>
              </Card>
              {monthly.length > 0 ? (
                <PeriodTrend data={monthly} />
              ) : (
                <Card><p className="text-sm text-dim">Not enough matches for a trend yet.</p></Card>
              )}
            </div>

            {/* Tournament performance */}
            {tourns.length > 0 && (
              <Card className="overflow-x-auto">
                <h3 className="stat-display mb-3 text-lg font-bold uppercase tracking-wide">Tournament Performance</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-dim">
                      <th className="py-1 pr-2">Tournament</th>
                      <th className="py-1 pr-2 text-right">P</th>
                      <th className="py-1 pr-2 text-right">W</th>
                      <th className="py-1 pr-2 text-right">L</th>
                      <th className="py-1 text-right">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tourns.map((t) => (
                      <tr key={t.tournamentId} className="border-t border-line/60">
                        <td className="py-1.5 pr-2 font-semibold">{t.name}</td>
                        <td className="tnum py-1.5 pr-2 text-right">{t.played}</td>
                        <td className="tnum py-1.5 pr-2 text-right text-ok">{t.won}</td>
                        <td className="tnum py-1.5 pr-2 text-right text-err">{t.lost}</td>
                        <td className="tnum py-1.5 text-right font-bold">{t.winPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        ) : (
          <Card><p className="text-sm text-dim">{teamName(focusTeam)} has no completed matches yet.</p></Card>
        )}
      </section>

      {/* Head to head */}
      <section className="space-y-3">
        <SectionHeading
          icon="⚔️"
          title="Head to Head"
          trailing={
            <select
              className="min-h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink focus:border-accent focus:outline-none"
              value={oppId}
              onChange={(e) => setOppId(e.target.value)}
            >
              <option value="">Pick opponent…</option>
              {db.teams.filter((t) => t.id !== focusTeam).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          }
        />
        <Card>
          {!oppId ? (
            <p className="text-sm text-dim">Select an opponent to see the head-to-head history against {teamName(focusTeam)}.</p>
          ) : h2h && h2h.played > 0 ? (
            <>
              <div className="grid grid-cols-3 items-center text-center">
                <div>
                  <div className="stat-display text-4xl font-extrabold text-accent">{h2h.aWins}</div>
                  <div className="text-[11px] uppercase tracking-wider text-dim">{teamShort(focusTeam)}</div>
                </div>
                <div className="text-xs text-dim">{h2h.played} meetings<br />{h2h.aSets}–{h2h.bSets} sets</div>
                <div>
                  <div className="stat-display text-4xl font-extrabold text-azure">{h2h.bWins}</div>
                  <div className="text-[11px] uppercase tracking-wider text-dim">{teamShort(oppId)}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                {h2h.matches.map((m) => {
                  const t = setTally(m);
                  return (
                    <Link key={m.id} href={`/console/matches/${m.id}/analytics`} className="flex items-center justify-between rounded-xl border border-line bg-surface2/40 px-3 py-2 text-sm hover:border-accent/40">
                      <span className="text-dim">{m.dateISO}</span>
                      <span className="tnum font-bold">{teamShort(m.homeTeamId)} {t.home}–{t.away} {teamShort(m.awayTeamId)}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-dim">{teamName(focusTeam)} and {teamName(oppId)} have not met in a completed match yet.</p>
          )}
        </Card>
      </section>

      {/* Match history */}
      <section className="space-y-3">
        <SectionHeading icon="🗂️" title="Match History" trailing={<StatusChip tone="dim">{completed.length} matches</StatusChip>} />
        <div className="space-y-2">
          {[...completed].sort((a, b) => b.dateISO.localeCompare(a.dateISO)).map((m) => (
            <MatchHistoryRow key={m.id} match={m} teamName={teamName} teamShort={teamShort} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MatchHistoryRow({
  match,
  teamName,
  teamShort,
}: {
  match: Match;
  teamName: (id: string) => string;
  teamShort: (id: string | null) => string;
}) {
  const t = setTally(match);
  const winner = match.winnerTeamId
    ? teamName(match.winnerTeamId)
    : t.home === t.away
      ? null
      : teamName(t.home > t.away ? match.homeTeamId : match.awayTeamId);
  void outcomeFor;
  return (
    <Link
      href={`/console/matches/${match.id}/analytics`}
      className="card-premium flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl p-4 transition-colors hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {teamName(match.homeTeamId)} <span className="text-dim">vs</span> {teamName(match.awayTeamId)}
        </p>
        <p className="mt-0.5 text-xs text-dim">{match.dateISO}{winner && ` · ${winner} won`}</p>
      </div>
      <span className="stat-display tnum text-xl font-extrabold">
        {t.home}<span className="text-dim">–</span>{t.away}
      </span>
      <span className="text-xs text-accent">Analytics →</span>
    </Link>
  );
}
