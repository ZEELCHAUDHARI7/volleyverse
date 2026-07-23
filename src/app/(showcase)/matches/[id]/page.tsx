"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { lines, teamTotals, topBy, topDefender } from "@/lib/metrics";
import {
  Aurora,
  CountUp,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { PointsBySpiker, SpikeSuccessRate } from "@/components/charts";

/**
 * Public match summary — the published cut of the Match Dashboard.
 * Guarded by the publish boundary: unpublished matches don't exist here.
 */
export default function PublicMatchReport() {
  const { id } = useParams<{ id: string }>();
  const { ready, db, matches } = usePublished();
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
  const ls = lines(roster, events);
  const totals = teamTotals(roster, events);
  const scorer = topBy(ls, "points");
  const setter = topBy(ls, "assists");
  const defender = topDefender(ls);
  const name = (pid?: string) =>
    pid ? (db.players.find((p) => p.id === pid)?.fullName ?? "N/A") : "N/A";
  const teamName = (id2: string) => db.teams.find((t) => t.id === id2)?.name ?? "TBD";
  const venue = db.venues.find((v) => v.id === match.venueId);
  let homeSets = 0;
  let awaySets = 0;
  for (const s of match.setScores) {
    if (s.homePoints > s.awayPoints) homeSets++;
    else if (s.awayPoints > s.homePoints) awaySets++;
  }

  const heroes = [
    { label: "Top scorer", value: name(scorer?.playerId), stat: `${scorer?.points ?? 0} points` },
    { label: "Best setter", value: name(setter?.playerId), stat: `${setter?.assists ?? 0} assists` },
    { label: "Wall of the match", value: name(defender?.playerId), stat: `${defender?.blocks ?? 0} blocks · ${defender?.saves ?? 0} saves` },
  ];

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
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-12 flex flex-wrap gap-12">
              <div>
                <p className="stat-display tnum text-6xl font-extrabold text-accent sm:text-7xl">
                  <CountUp value={totals.points} />
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                  Team points
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Reveal from="left">
            <PointsBySpiker players={roster} events={events} />
          </Reveal>
          <Reveal delay={120} from="right">
            <SpikeSuccessRate players={roster} events={events} />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
