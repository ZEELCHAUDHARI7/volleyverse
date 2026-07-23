"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMatch, useStore } from "@/lib/store";
import {
  Card,
  EmptyState,
  LinkButton,
  Button,
  PageHeader,
  PageSkeleton,
  SectionHeading,
  StatusChip,
} from "@/components/ui";
import {
  BoxScoreTable,
  ComparisonBars,
  ComparisonRadar,
  DistributionCard,
  InsightCards,
  KpiGrid,
  MomentumChart,
  PerformerCards,
  ScoreTimeline,
  TeamStatSheet,
} from "@/components/analytics";
import {
  exportMatchCsv,
  exportPdf,
  generateInsights,
  generateSummary,
  getSport,
  headToHead,
  matchDifficulty,
  resolveSport,
  shareAnalytics,
  type MatchAnalytics,
  type MatchContext,
} from "@/lib/analytics";

/**
 * PER-MATCH ADVANCED ANALYTICS.
 *
 * The full break-down of one completed match: summary, timeline, momentum,
 * team comparison, volleyball deep-dive, visual analytics, auto-generated
 * insights, historical context, and export/share. Everything derives from
 * the sport module (sport-neutral), so this page renders any sport without
 * change once its module is registered.
 */
export default function MatchAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const { db } = store;
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } = useMatch(id);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const analytics: MatchAnalytics | null = useMemo(() => {
    if (!match || !homeTeam || !awayTeam) return null;
    const sport = getSport(resolveSport(match));
    if (!sport) return null;
    const ctx: MatchContext = { match, homeTeam, awayTeam, homeRoster, awayRoster, events };
    return sport.analyzeMatch(ctx);
  }, [match, homeTeam, awayTeam, homeRoster, awayRoster, events]);

  const h2h = useMemo(
    () =>
      match && homeTeam && awayTeam
        ? headToHead(db.matches, homeTeam.id, awayTeam.id)
        : null,
    [db.matches, match, homeTeam, awayTeam],
  );
  const difficulty = useMemo(
    () =>
      match && homeTeam && analytics?.result.winner
        ? matchDifficulty(
            db.matches,
            match,
            analytics.result.winner === "home" ? homeTeam.id : awayTeam!.id,
          )
        : null,
    [db.matches, match, homeTeam, awayTeam, analytics],
  );

  if (!store.ready) return <PageSkeleton />;

  if (!match || !homeTeam || !awayTeam || !analytics) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="Match analytics unavailable"
          hint="This match may have been deleted, or the link is out of date."
          action={<LinkButton href="/console">Back to console</LinkButton>}
        />
      </div>
    );
  }

  const names = { home: homeTeam.name, away: awayTeam.name };
  const summary = generateSummary(analytics, names);
  const insights = generateInsights(analytics, names);
  const winnerName =
    analytics.result.winner === "home"
      ? homeTeam.name
      : analytics.result.winner === "away"
        ? awayTeam.name
        : null;

  const onShare = async () => {
    const r = await shareAnalytics(analytics, names);
    setShareMsg(r === "shared" ? "Shared" : r === "copied" ? "Copied to clipboard" : "Sharing unavailable");
    setTimeout(() => setShareMsg(null), 2500);
  };

  return (
    <div className="analytics-doc space-y-8">
      <PageHeader
        title="Match Analytics"
        subtitle={`${homeTeam.name} vs ${awayTeam.name} · ${match.dateISO}`}
        action={
          <div className="no-print flex flex-wrap gap-2">
            <LinkButton href="/console/analytics" variant="ghost">
              Season analytics
            </LinkButton>
            <Button variant="ghost" onClick={() => exportMatchCsv(analytics, { home: homeTeam.name, away: awayTeam.name, date: match.dateISO })}>
              ⬇ CSV
            </Button>
            <Button variant="ghost" onClick={exportPdf}>
              🖨 PDF
            </Button>
            <Button variant="ghost" onClick={onShare}>
              {shareMsg ?? "↗ Share"}
            </Button>
            <LinkButton href="/console">Console</LinkButton>
          </div>
        }
      />

      {/* Result banner */}
      <Card className="relative overflow-hidden">
        <div className="court-lines absolute inset-0" aria-hidden />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between">
            <StatusChip tone="ok">Completed</StatusChip>
            {winnerName ? (
              <StatusChip tone="accent">🏆 {winnerName}</StatusChip>
            ) : (
              <StatusChip tone="dim">No winner recorded</StatusChip>
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <p className="stat-display text-right text-xl font-extrabold uppercase leading-tight">{homeTeam.name}</p>
            <p className="stat-display tnum text-5xl font-extrabold">
              <span className={analytics.result.winner === "home" ? "text-accent" : ""}>{analytics.result.homeSetsWon}</span>
              <span className="mx-2 text-dim">–</span>
              <span className={analytics.result.winner === "away" ? "text-accent" : ""}>{analytics.result.awaySetsWon}</span>
            </p>
            <p className="stat-display text-left text-xl font-extrabold uppercase leading-tight">{awayTeam.name}</p>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {match.setScores.map((s) => (
              <span key={s.setNo} className="tnum rounded-lg border border-line bg-surface2/50 px-2.5 py-1 text-xs">
                <span className={s.homePoints > s.awayPoints ? "font-bold text-accent" : "text-dim"}>{s.homePoints}</span>
                <span className="mx-1 text-dim">–</span>
                <span className={s.awayPoints > s.homePoints ? "font-bold text-accent" : "text-dim"}>{s.awayPoints}</span>
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <KpiGrid kpis={analytics.headline} />

      {/* AI summary + insights */}
      <section className="space-y-3">
        <SectionHeading icon="🤖" title="AI Match Summary" hint="Auto-generated from the match data." trailing={<StatusChip tone="violet">Auto-generated</StatusChip>} />
        <Card>
          <p className="text-[15px] leading-relaxed text-ink">{summary}</p>
        </Card>
        <InsightCards insights={insights} />
      </section>

      {/* Timeline + momentum */}
      <section className="space-y-3">
        <SectionHeading icon="📈" title="Flow of the Match" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ScoreTimeline progression={analytics.progression} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
          <MomentumChart progression={analytics.progression} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
        </div>
      </section>

      {/* Team comparison */}
      <section className="space-y-3">
        <SectionHeading icon="⚔️" title="Team Comparison" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ComparisonRadar metrics={analytics.comparison} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
          <ComparisonBars metrics={analytics.comparison} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
        </div>
      </section>

      {/* Top performers */}
      <section className="space-y-3">
        <SectionHeading icon="🏅" title="Top Performers" />
        <PerformerCards performers={analytics.performers} />
      </section>

      {/* Volleyball team stat deep-dive */}
      <section className="space-y-3">
        <SectionHeading icon="🏐" title="Team Statistics" hint="Full volleyball stat sheet, both sides." />
        <TeamStatSheet home={analytics.teamStats.home} away={analytics.teamStats.away} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
      </section>

      {/* Visual analytics */}
      <section className="space-y-3">
        <SectionHeading icon="🎨" title="Visual Analytics" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {analytics.distributions.map((d) => (
            <DistributionCard key={d.key} series={d} />
          ))}
        </div>
      </section>

      {/* Box score */}
      <section className="space-y-3">
        <SectionHeading icon="📋" title="Box Score" />
        <BoxScoreTable table={analytics.boxScore} />
      </section>

      {/* Historical context */}
      <section className="space-y-3">
        <SectionHeading icon="🕰️" title="Historical Context" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="stat-display text-lg font-bold uppercase tracking-wide">Head to Head</h3>
            {h2h && h2h.played > 0 ? (
              <>
                <div className="mt-3 grid grid-cols-3 items-center text-center">
                  <div>
                    <div className="stat-display text-3xl font-extrabold text-accent">{h2h.aWins}</div>
                    <div className="text-[11px] uppercase tracking-wider text-dim">{homeTeam.shortName}</div>
                  </div>
                  <div className="text-xs text-dim">{h2h.played} met</div>
                  <div>
                    <div className="stat-display text-3xl font-extrabold text-azure">{h2h.bWins}</div>
                    <div className="text-[11px] uppercase tracking-wider text-dim">{awayTeam.shortName}</div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-dim">
                  Sets across all meetings: {h2h.aSets}–{h2h.bSets}.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-dim">First recorded meeting between these teams.</p>
            )}
          </Card>
          <Card>
            <h3 className="stat-display text-lg font-bold uppercase tracking-wide">Match Difficulty</h3>
            {difficulty ? (
              <>
                <div className="mt-3 flex items-end gap-3">
                  <span className="stat-display text-4xl font-extrabold text-ink">{difficulty.rating}</span>
                  <StatusChip tone={difficulty.rating >= 55 ? "err" : "ok"}>{difficulty.label}</StatusChip>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${difficulty.rating}%` }} />
                </div>
                <p className="mt-3 text-xs text-dim">
                  Blends opponent strength (opponent win rate {difficulty.oppWinPct}%) with how close the match was (closeness {difficulty.closeness}%).
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-dim">Not enough history to rate difficulty.</p>
            )}
          </Card>
        </div>
      </section>

      <p className="no-print pb-6 text-center text-[11px] text-dim/60">
        All figures derive from event-sourced match data. Court zone maps are representative (placed by player role), not tracked coordinates.
      </p>
    </div>
  );
}
