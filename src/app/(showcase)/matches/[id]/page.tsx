"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { lines, teamTotals, topBy, topDefender } from "@/lib/metrics";
import { plural } from "@/lib/format";
import { byShirtNumber } from "@/lib/squad";
import {
  Aurora,
  CountUp,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { SpikeChartGrid } from "@/components/spike-charts";
import { BlockerCards, BlockChartGrid } from "@/components/block-charts";
import { SetNavigator, scopeLabel, setEntries, type SetScope } from "@/components/set-strip";
import { Card, SectionHeading, StatusChip, Button } from "@/components/ui";
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
} from "@/lib/analytics";

/**
 * Public match summary — the published cut of the Match Dashboard.
 * Guarded by the publish boundary: unpublished matches don't exist here.
 */
export default function PublicMatchReport() {
  const { id } = useParams<{ id: string }>();
  const { ready, db, matches, events: publishedEvents } = usePublished();
  const [scope, setScope] = useState<SetScope>("ALL");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  if (!ready) return <ShowcaseSkeleton />;

  const match = matches.find((m) => m.id === id);
  if (!match) {
    // Either doesn't exist or isn't published — same answer publicly.
    return (
      <div className="mx-auto max-w-6xl px-4 py-28 text-center md:px-8">
        <p aria-hidden className="stat-display text-outline text-7xl font-extrabold">
          404
        </p>
        <p className="stat-display mt-4 text-2xl font-bold uppercase">
          This match report isn&apos;t available.
        </p>
        <p className="mt-2 text-sm text-dim">It may not have been published yet.</p>
        <Link
          href="/matches"
          className="mt-6 inline-block text-sm font-semibold text-accent"
        >
          ← All match reports
        </Link>
      </div>
    );
  }

  const rosterIds = new Set(match.rosters.map((r) => r.playerId));
  const roster =
    rosterIds.size > 0
      ? db.players.filter((p) => rosterIds.has(p.id))
      : db.players.filter(
          (p) => p.teamId === match.homeTeamId || p.teamId === match.awayTeamId,
        );
  const events = db.events.filter((e) => e.matchId === match.id);
  // Every event carries its setNo, so a set stays inspectable after it banks.
  const inScope = (evs: typeof events) =>
    scope === "ALL" ? evs : evs.filter((e) => e.setNo === scope);
  const ls = lines(roster, events);
  const totals = teamTotals(roster, events);
  const scorer = topBy(ls, "points");
  const setter = topBy(ls, "assists");
  const defender = topDefender(ls);
  const name = (pid?: string) =>
    pid ? (db.players.find((p) => p.id === pid)?.fullName ?? "N/A") : "N/A";
  const teamName = (id2: string) => db.teams.find((t) => t.id === id2)?.name ?? "TBD";
  const teamShort = (id2: string) => db.teams.find((t) => t.id === id2)?.shortName ?? "TBD";
  const venue = db.venues.find((v) => v.id === match.venueId);
  const homeTeam = db.teams.find((t) => t.id === match.homeTeamId);
  const awayTeam = db.teams.find((t) => t.id === match.awayTeamId);
  const rosterFor = (teamId: string) =>
    db.players.filter((p) => p.teamId === teamId).sort(byShirtNumber);
  const homeRoster = rosterFor(match.homeTeamId);
  const awayRoster = rosterFor(match.awayTeamId);
  // The published-only cut of the sport analytics module — same engine the
  // console's Match Analytics page runs, on data limited to published matches.
  const sport = homeTeam && awayTeam ? getSport(resolveSport(match)) : undefined;
  const analytics =
    sport && homeTeam && awayTeam
      ? sport.analyzeMatch({ match, homeTeam, awayTeam, homeRoster, awayRoster, events })
      : null;
  const names = homeTeam && awayTeam ? { home: homeTeam.name, away: awayTeam.name } : null;
  const summary = analytics && names ? generateSummary(analytics, names) : null;
  const insights = analytics && names ? generateInsights(analytics, names) : [];
  const h2h = homeTeam && awayTeam ? headToHead(matches, homeTeam.id, awayTeam.id) : null;
  const difficulty =
    homeTeam && awayTeam && analytics?.result.winner
      ? matchDifficulty(
          matches,
          match,
          analytics.result.winner === "home" ? homeTeam.id : awayTeam.id,
        )
      : null;
  let homeSets = 0;
  let awaySets = 0;
  for (const s of match.setScores) {
    if (s.homePoints > s.awayPoints) homeSets++;
    else if (s.awayPoints > s.homePoints) awaySets++;
  }

  // topBy/topDefender name nobody when nobody has the stat; say so plainly.
  const heroes = [
    scorer
      ? { label: "Top scorer", value: name(scorer.playerId), stat: plural(scorer.points, "point") }
      : { label: "Top scorer", value: "—", stat: "No points recorded" },
    setter
      ? { label: "Best setter", value: name(setter.playerId), stat: plural(setter.assists, "assist") }
      : { label: "Best setter", value: "—", stat: "No assists recorded" },
    defender
      ? {
          label: "Wall of the match",
          value: name(defender.playerId),
          stat: `${plural(defender.blocks, "block")} · ${plural(defender.saves, "save")}`,
        }
      : { label: "Wall of the match", value: "—", stat: "No blocks or saves recorded" },
  ];
  // Every point of the match, from the set scores. The player lines only
  // hold attack points, which is what this tile used to show.
  const pointsPlayed = match.setScores.reduce((n, s) => n + s.homePoints + s.awayPoints, 0);

  const onShare = async () => {
    if (!analytics || !names) return;
    const r = await shareAnalytics(analytics, names);
    setShareMsg(r === "shared" ? "Shared" : r === "copied" ? "Copied to clipboard" : "Sharing unavailable");
    setTimeout(() => setShareMsg(null), 2500);
  };

  return (
    <div>
      <section className="grain relative overflow-hidden border-b border-line">
        <Aurora />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-8">
          <Reveal>
            <SectionLabel>Match Report · {match.dateISO}</SectionLabel>
            <h1 className="stat-display text-5xl font-extrabold uppercase leading-[0.95] sm:text-7xl">
              {teamName(match.homeTeamId)}{" "}
              <span className="text-outline tnum">
                {homeSets}–{awaySets}
              </span>
              <br />
              <span className="text-gradient">{teamName(match.awayTeamId)}</span>
            </h1>
            <p className="mt-3 text-sm uppercase tracking-wider text-dim">
              {venue ? venue.name : ""}
              {match.setScores.length > 0 &&
                ` · ${match.setScores
                  .map((s) => `${s.homePoints}–${s.awayPoints}`)
                  .join(" · ")}`}
            </p>
            {match.setScores.length > 0 && (
              <div className="mt-4">
                <SetNavigator
                  sets={setEntries(match.setScores, null)}
                  scope={scope}
                  onScope={setScope}
                  homeShort={teamShort(match.homeTeamId)}
                  awayShort={teamShort(match.awayTeamId)}
                />
              </div>
            )}
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-12 flex flex-wrap gap-12">
              <div>
                <p className="stat-display tnum text-6xl font-extrabold text-accent sm:text-7xl">
                  <CountUp value={pointsPlayed} />
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                  Points played
                </p>
              </div>
              <div>
                <p className="stat-display tnum text-6xl font-extrabold sm:text-7xl">
                  {totals.spikeRate === null ? (
                    "N/A"
                  ) : (
                    <CountUp value={Math.round(totals.spikeRate)} suffix="%" />
                  )}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                  Spike success
                </p>
              </div>
              <div>
                <p className="stat-display tnum text-6xl font-extrabold sm:text-7xl">
                  <CountUp value={totals.blocks} />
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                  Blocks
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-8 px-4 py-14 md:px-8">
        {analytics && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                homeTeam &&
                awayTeam &&
                exportMatchCsv(analytics, { home: homeTeam.name, away: awayTeam.name, date: match.dateISO })
              }
            >
              ⬇ CSV
            </Button>
            <Button variant="ghost" onClick={exportPdf}>
              🖨 PDF
            </Button>
            <Button variant="ghost" onClick={onShare}>
              {shareMsg ?? "↗ Share"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {heroes.map((h, i) => (
            <Reveal key={h.label} delay={i * 110} from="scale">
              <div className="card-premium card-lift rounded-2xl p-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-dim">
                  {h.label}
                </p>
                <p className="stat-display mt-2 text-2xl font-extrabold uppercase text-accent">
                  {h.value}
                </p>
                <p className="tnum mt-1 text-xs text-dim">{h.stat}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {analytics && names && homeTeam && awayTeam && (
          <>
            <div>
              <KpiGrid kpis={analytics.headline} />
            </div>

            <div className="space-y-3">
              <SectionHeading icon="🤖" title="AI Match Summary" hint="Auto-generated from the match data." trailing={<StatusChip tone="violet">Auto-generated</StatusChip>} />
              <Card>
                <p className="text-[15px] leading-relaxed text-ink">{summary}</p>
              </Card>
              <InsightCards insights={insights} />
            </div>

            <div className="space-y-3">
              <SectionHeading icon="📈" title="Flow of the Match" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ScoreTimeline progression={analytics.progression} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
                <MomentumChart progression={analytics.progression} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeading icon="⚔️" title="Team Comparison" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ComparisonRadar metrics={analytics.comparison} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
                <ComparisonBars metrics={analytics.comparison} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeading icon="🏅" title="Top Performers" />
              <PerformerCards performers={analytics.performers} />
            </div>
          </>
        )}

        <div>
          <h2 className="stat-display text-lg font-bold uppercase tracking-wide">
            Spiker performance
            <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
              {scopeLabel(scope)}
            </span>
          </h2>
          <Reveal from="left">
            <div className="mt-3">
              <SpikeChartGrid
                players={roster}
                events={inScope(events)}
                homeTeamId={match.homeTeamId}
                homeLabel={teamName(match.homeTeamId)}
                awayLabel={teamName(match.awayTeamId)}
              />
            </div>
          </Reveal>
        </div>

        <div>
          <h2 className="stat-display text-lg font-bold uppercase tracking-wide">
            Blocking
            <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-dim">
              {scopeLabel(scope)}
            </span>
          </h2>
          <Reveal delay={120} from="right">
            <div className="mt-3 space-y-4">
              <BlockerCards
                players={roster}
                events={inScope(events)}
                homeTeamId={match.homeTeamId}
                seasonEvents={publishedEvents}
              />
              <BlockChartGrid
                players={roster}
                events={inScope(events)}
                homeTeamId={match.homeTeamId}
                homeLabel={teamName(match.homeTeamId)}
                awayLabel={teamName(match.awayTeamId)}
              />
            </div>
          </Reveal>
        </div>

        {analytics && homeTeam && awayTeam && (
          <>
            <div className="space-y-3">
              <SectionHeading icon="🏐" title="Team Statistics" hint="Full volleyball stat sheet, both sides." />
              <TeamStatSheet home={analytics.teamStats.home} away={analytics.teamStats.away} homeLabel={homeTeam.shortName} awayLabel={awayTeam.shortName} />
            </div>

            <div className="space-y-3">
              <SectionHeading icon="🎨" title="Visual Analytics" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {analytics.distributions.map((d) => (
                  <DistributionCard key={d.key} series={d} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeading icon="📋" title="Box Score" />
              <BoxScoreTable table={analytics.boxScore} />
            </div>

            <div className="space-y-3">
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
            </div>
          </>
        )}
      </section>
    </div>
  );
}
