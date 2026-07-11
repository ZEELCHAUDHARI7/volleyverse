"use client";

import Link from "next/link";
import { lines, teamTotals, topBy } from "@/lib/metrics";
import {
  Aurora,
  CountUp,
  Marquee,
  PlayerCard,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { LinkButton } from "@/components/ui";
import { DefendersLeaderboard, RecordsStrip } from "@/components/charts";

/**
 * Showcase Home — the 30-second owner/sponsor scroll:
 * cinematic hero → kinetic marquee → season in numbers →
 * featured player → latest result → record book → roster.
 */
export default function ShowcaseHome() {
  const { ready, db, matches, events } = usePublished();
  if (!ready) return <ShowcaseSkeleton />;

  const totals = teamTotals(db.players, events);
  const seasonLines = lines(db.players, events);
  const star = topBy(seasonLines, "contribution");
  const starPlayer = star && db.players.find((p) => p.id === star.playerId);
  const latest = matches[0];
  const latestLines = latest
    ? lines(db.players, events.filter((e) => e.matchId === latest.id))
    : [];
  const latestTop = topBy(latestLines, "points");
  const latestTopPlayer =
    latestTop && db.players.find((p) => p.id === latestTop.playerId);
  const spikers = db.players.filter((p) => p.role === "SPIKER").slice(0, 3);

  return (
    <div>
      {/* HERO — layered aurora, kinetic typography, no photo dependency */}
      <section className="grain relative -mt-20 overflow-hidden border-b border-line">
        <Aurora />
        <div className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-center px-4 pb-24 pt-32 md:px-8">
          <Reveal>
            <p className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.35em] text-azure">
              <span aria-hidden className="h-px w-10 bg-azure/60" />
              Prime Volleyball League · Panaji
            </p>
          </Reveal>
          <h1 className="stat-display text-[19vw] font-extrabold uppercase leading-[0.88] sm:text-8xl md:text-9xl">
            <Reveal delay={100} from="left">
              <span className="block">Goa</span>
            </Reveal>
            <Reveal delay={240} from="left">
              <span className="text-gradient block drop-shadow-[0_0_40px_var(--glow-accent)]">
                Guardians
              </span>
            </Reveal>
          </h1>
          <Reveal delay={420}>
            <p className="mt-6 max-w-md text-base text-dim sm:text-lg">
              Every spike, every set, every block. Tracked, measured and told.
              The home of Goa volleyball,{" "}
              <span className="text-ink">powered by data.</span>
            </p>
          </Reveal>
          <Reveal delay={560}>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/team" className="min-w-40 text-base">
                Meet the Squad
              </LinkButton>
              <LinkButton href="/matches" variant="ghost" className="min-w-40 text-base">
                Match Reports
              </LinkButton>
            </div>
          </Reveal>
          {/* Scroll cue */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2" aria-hidden>
            <div className="scroll-cue flex h-10 w-6 items-start justify-center rounded-full border border-line pt-2">
              <span className="h-2 w-1 rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </section>

      {/* KINETIC MARQUEE — pure energy between hero and stats */}
      <Marquee
        items={["Spike", "Block", "Ace", "Super Dig", "Set", "Defend", "Win"]}
      />

      {/* SEASON IN NUMBERS — count-up ticker */}
      <section className="relative border-b border-line">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-10 px-4 py-16 sm:grid-cols-4 md:px-8">
          {[
            { n: totals.points, label: "Points scored" },
            { n: Math.round(totals.spikeRate ?? 0), label: "Spike success", suffix: "%" },
            { n: totals.blocks, label: "Blocks won" },
            { n: matches.length, label: "Matches tracked" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 110} from="scale">
              <div className="group text-center">
                <p className="stat-display text-6xl font-extrabold text-accent transition-all duration-300 group-hover:drop-shadow-[0_0_24px_var(--glow-accent)] sm:text-7xl">
                  <CountUp value={s.n} suffix={s.suffix ?? ""} />
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-dim">
                  {s.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FEATURED PLAYER + LATEST RESULT */}
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-16 md:grid-cols-2 md:px-8">
        {starPlayer && star && (
          <Reveal from="left">
            <Link
              href={`/players/${starPlayer.id}`}
              className="card-premium shine group relative block h-full overflow-hidden rounded-3xl p-8"
            >
              <span
                aria-hidden
                className="stat-display text-outline pointer-events-none absolute -right-4 -top-10 text-[150px] font-extrabold leading-none transition-colors duration-500 group-hover:text-accent/15 group-hover:[-webkit-text-stroke-color:transparent]"
              >
                {starPlayer.jersey}
              </span>
              <div className="relative">
                <SectionLabel>Player of the Season</SectionLabel>
                <p className="stat-display mt-2 text-4xl font-extrabold uppercase leading-none sm:text-5xl">
                  {starPlayer.name}
                </p>
                <div className="mt-8 flex gap-10">
                  {[
                    { n: star.points, label: "Points" },
                    {
                      n: star.successRate === null ? "N/A" : `${Math.round(star.successRate)}%`,
                      label: "Success",
                    },
                    { n: star.contribution, label: "Contribution" },
                  ].map((c) => (
                    <div key={c.label}>
                      <p className="stat-display tnum text-3xl font-extrabold">{c.n}</p>
                      <p className="text-[10px] uppercase tracking-wider text-dim">
                        {c.label}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-8 text-xs font-semibold text-accent">
                  Full profile{" "}
                  <span
                    aria-hidden
                    className="inline-block transition-transform duration-300 group-hover:translate-x-1.5"
                  >
                    →
                  </span>
                </p>
              </div>
            </Link>
          </Reveal>
        )}

        {latest && (
          <Reveal delay={140} from="right">
            <Link
              href={`/matches/${latest.id}`}
              className="card-premium shine group block h-full rounded-3xl p-8"
            >
              <SectionLabel>Latest Match</SectionLabel>
              <p className="stat-display mt-2 text-3xl font-extrabold uppercase leading-tight sm:text-4xl">
                Guardians <span className="text-outline">vs</span>
                <br />
                {latest.opponent}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wider text-dim">
                {latest.dateISO} · {latest.venue}
              </p>
              {latestTopPlayer && latestTop && (
                <div className="glass mt-7 rounded-2xl p-4">
                  <p className="text-[10px] uppercase tracking-wider text-dim">
                    Top scorer
                  </p>
                  <p className="stat-display text-xl font-extrabold uppercase">
                    {latestTopPlayer.name}
                    <span className="tnum ml-3 text-accent">
                      {latestTop.points} pts
                    </span>
                  </p>
                </div>
              )}
              <p className="mt-7 text-xs font-semibold text-accent">
                Match report{" "}
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-300 group-hover:translate-x-1.5"
                >
                  →
                </span>
              </p>
            </Link>
          </Reveal>
        )}
      </section>

      {/* SEASON RECORDS + DEFENSIVE HEROES — the stats nobody else tracks */}
      <section className="grain relative overflow-hidden border-y border-line bg-raise">
        <Aurora subtle />
        <div className="relative mx-auto max-w-6xl space-y-6 px-4 py-16 md:px-8">
          <Reveal>
            <div>
              <SectionLabel>Record Book</SectionLabel>
              <h2 className="stat-display text-4xl font-extrabold uppercase sm:text-5xl">
                Season highs
              </h2>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <RecordsStrip players={db.players} matches={matches} events={events} />
          </Reveal>
          <Reveal delay={220}>
            <DefendersLeaderboard players={db.players} events={events} limit={3} />
          </Reveal>
        </div>
      </section>

      {/* ROSTER PREVIEW */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <Reveal>
          <div className="mb-7 flex items-end justify-between">
            <div>
              <SectionLabel>The Squad</SectionLabel>
              <h2 className="stat-display text-4xl font-extrabold uppercase sm:text-5xl">
                Frontline firepower
              </h2>
            </div>
            <Link
              href="/team"
              className="group hidden text-sm font-semibold text-accent sm:block"
            >
              All players{" "}
              <span
                aria-hidden
                className="inline-block transition-transform duration-300 group-hover:translate-x-1.5"
              >
                →
              </span>
            </Link>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {spikers.map((p, i) => (
            <PlayerCard key={p.id} player={p} events={events} delay={i * 120} />
          ))}
        </div>
        <Link
          href="/team"
          className="mt-6 block text-center text-sm font-semibold text-accent sm:hidden"
        >
          All players →
        </Link>
      </section>
    </div>
  );
}
