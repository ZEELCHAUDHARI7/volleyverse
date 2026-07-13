"use client";

import Link from "next/link";
import { useState } from "react";
import { CLUB } from "@/lib/club";
import { lines, seasonRecord, teamTotals, topBy } from "@/lib/metrics";
import type { RecordStat } from "@/lib/metrics";
import {
  CountUp,
  Reveal,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import {
  BroadcastTicker,
  CharReveal,
  HeroCamera,
  Kicker,
  LedCountdown,
  LightsUp,
  Magnetic,
  Parallax,
  RafterBanner,
  TiltCard,
  type TickerItem,
} from "@/components/match-night";
import { LinkButton } from "@/components/ui";
import { LiveNow } from "@/components/live-now";
import { ROLE_LABEL } from "@/lib/types";

/**
 * MATCH NIGHT — the homepage as a walk through the arena.
 *
 * 00 Lights up (entry, once per session)
 * 01 The court — floodlit hero, broadcast ticker
 * 02 Matchday — next fixture, LED countdown
 * 03 The scoreboard — season in numbers
 * 04 The spotlight — star player under one light
 * 05 Full-time — latest result as a TV graphic
 * 06 The squad — roster under the lights
 * 07 The rafters — honours + record banners overhead
 * 08 The tunnel — join the club
 */
export default function ShowcaseHome() {
  const { ready, db, matches, events } = usePublished();
  const [lit, setLit] = useState(false);

  if (!ready) return <ShowcaseSkeleton />;

  // ---- derived, always from published events only ----
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

  const ticker: TickerItem[] = matches.slice(0, 6).map((m) => {
    const ls = lines(db.players, events.filter((e) => e.matchId === m.id));
    const top = topBy(ls, "points");
    const topName = top && db.players.find((p) => p.id === top.playerId)?.name;
    return {
      tag: "FT",
      text: `${CLUB.nameShort} vs ${m.opponent}`,
      detail: topName && top ? `${topName} ${top.points} pts` : m.venue,
    };
  });

  const recordBanners = (
    [
      ["points", "Most points, one match"],
      ["aces", "Most aces, one match"],
      ["superDigs", "Most super digs, one match"],
      ["blocks", "Most blocks, one match"],
    ] as Array<[RecordStat, string]>
  ).flatMap(([stat, label]) => {
    const r = seasonRecord(stat, events);
    if (!r) return [];
    const p = db.players.find((pl) => pl.id === r.playerId);
    const m = matches.find((ma) => ma.id === r.matchId);
    return [
      {
        label,
        value: String(r.value),
        sub: p ? `${p.name}${m ? ` · vs ${m.opponent}` : ""}` : undefined,
      },
    ];
  });

  return (
    <div className="overflow-x-clip">
      <LightsUp wordmark={CLUB.name} onDone={() => setLit(true)} />

      {/* ============ 01 · THE COURT ============ */}
      <section className="relative -mt-20 min-h-[100svh] overflow-hidden">
        {/* graded photo, slow camera push */}
        <HeroCamera className="absolute inset-0">
          <div className="mn-photo h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLUB.photos.hero.src} alt={CLUB.photos.hero.alt} loading="eager" />
          </div>
        </HeroCamera>

        {/* floodlight rig */}
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <div className="light-cone left-[6%]" style={{ ["--beam-r" as string]: "14deg" }} />
          <div
            className="light-cone light-cone--accent right-[10%]"
            style={{ ["--beam-r" as string]: "-16deg" }}
          />
        </div>
        <div className="grain absolute inset-0" aria-hidden />

        {/* headline block */}
        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-4 pb-28 pt-36 md:px-8">
          <p
            className="data-type mb-5 text-[11px] font-semibold uppercase tracking-[0.4em]"
            style={{ color: "var(--brand-flood)" }}
          >
            {CLUB.league} · {CLUB.city}
          </p>
          <h1 className="hero-type text-[clamp(4.2rem,16vw,14rem)] text-ink">
            {lit ? (
              <>
                <span className="block">
                  <CharReveal text="Goa" />
                </span>
                <span className="block text-accent drop-shadow-[0_0_60px_var(--glow-accent)]">
                  <CharReveal text="Guardians" lineDelay={260} />
                </span>
              </>
            ) : (
              <span className="block opacity-0">
                Goa
                <br />
                Guardians
              </span>
            )}
          </h1>

          {/* broadcast lower-third: home court / promise / actions */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <div className="lower-third px-5 py-3 pr-8">
              <p className="data-type text-[10px] uppercase tracking-[0.3em] text-dim">
                Home court
              </p>
              <p className="stat-display text-lg font-bold uppercase">{CLUB.arena}</p>
            </div>
            <p className="max-w-sm text-sm text-dim">
              Every spike, block and ace — tracked live courtside, told here.{" "}
              <span className="text-ink">This is our house.</span>
            </p>
            <div className="ml-auto hidden gap-3 sm:flex">
              <Magnetic>
                <LinkButton href="/team" className="min-w-40 text-base">
                  Meet the Squad
                </LinkButton>
              </Magnetic>
              <Magnetic>
                <LinkButton href="/matches" variant="ghost" className="min-w-40 text-base">
                  Match Centre
                </LinkButton>
              </Magnetic>
            </div>
          </div>
        </div>

        {/* live results ticker pinned to the hero floor */}
        <div className="absolute inset-x-0 bottom-0 z-10">
          <BroadcastTicker items={ticker} />
        </div>
      </section>

      {/* ============ 01.5 · LIVE NOW — renders only while a match is live ============ */}
      <LiveNow />

      {/* ============ 02 · MATCHDAY ============ */}
      {CLUB.nextFixture && (
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden className="absolute inset-0">
            <div className="light-cone left-1/2 -translate-x-1/2 opacity-70" />
          </div>
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-24 md:grid-cols-[1.2fr_1fr] md:px-8">
            <div>
              <Reveal>
                <Kicker index="02">Matchday approaches</Kicker>
              </Reveal>
              <Reveal delay={90}>
                <h2 className="hero-type text-5xl leading-[0.9] sm:text-7xl">
                  {CLUB.nameShort}
                  <span className="mx-3 align-middle text-2xl text-dim sm:text-4xl">vs</span>
                  <span className="block text-accent sm:inline">
                    {CLUB.nextFixture.opponent}
                  </span>
                </h2>
              </Reveal>
              <Reveal delay={170}>
                <p className="data-type mt-4 text-[11px] uppercase tracking-[0.25em] text-dim">
                  {CLUB.nextFixture.competition} · {CLUB.nextFixture.venue}
                </p>
              </Reveal>
              <Reveal delay={250}>
                <div className="mt-9">
                  <LedCountdown toISO={CLUB.nextFixture.dateISO} />
                </div>
              </Reveal>
              <Reveal delay={330}>
                <div className="mt-9">
                  <Magnetic>
                    <LinkButton href="/matches" className="min-w-44 text-base">
                      Match Centre →
                    </LinkButton>
                  </Magnetic>
                </div>
              </Reveal>
            </div>
            {/* diagonal cut action shot */}
            <Reveal from="right" delay={150} className="hidden md:block">
              <Parallax speed={0.5}>
                <div
                  className="mn-photo h-[420px]"
                  style={{ clipPath: "polygon(12% 0, 100% 0, 88% 100%, 0 100%)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CLUB.photos.attack.src} alt={CLUB.photos.attack.alt} loading="lazy" />
                </div>
              </Parallax>
            </Reveal>
          </div>
        </section>
      )}

      {/* ============ 03 · THE SCOREBOARD ============ */}
      <section className="relative overflow-hidden border-b border-line bg-raise">
        <div className="court-floor" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
          <Reveal>
            <Kicker index="03">Season on the board</Kicker>
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { n: totals.points, label: "Points scored", suffix: "" },
              { n: Math.round(totals.spikeRate ?? 0), label: "Spike success", suffix: "%" },
              { n: totals.blocks, label: "Blocks won", suffix: "" },
              { n: totals.aces, label: "Service aces", suffix: "" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 110} from="scale">
                <div className="scoreboard rounded-2xl px-4 py-8 text-center">
                  <p className="led text-6xl font-semibold sm:text-7xl">
                    <CountUp value={s.n} suffix={s.suffix} />
                  </p>
                  <p className="data-type relative z-10 mt-4 text-[10px] uppercase tracking-[0.3em] text-dim">
                    {s.label}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={480}>
            <p className="data-type mt-6 text-[10px] uppercase tracking-[0.25em] text-dim">
              Derived live from {matches.length} published{" "}
              {matches.length === 1 ? "match" : "matches"} — no hand-typed numbers.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 04 · THE SPOTLIGHT ============ */}
      {starPlayer && star && (
        <section className="relative overflow-hidden border-b border-line">
          {/* one light, one player */}
          <div aria-hidden className="absolute inset-0">
            <div
              className="light-cone light-cone--accent left-[58%] -translate-x-1/2"
              style={{ ["--beam-r" as string]: "0deg" }}
            />
          </div>
          {/* ghost numeral fills the background */}
          <Parallax
            speed={-0.4}
            className="pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 select-none"
          >
            <span aria-hidden className="hero-type hero-outline text-[38vw] leading-none lg:text-[28rem]">
              {starPlayer.jersey}
            </span>
          </Parallax>

          <div className="relative mx-auto grid max-w-7xl items-end gap-10 px-4 py-24 md:grid-cols-2 md:px-8">
            <div className="order-2 md:order-1">
              <Reveal>
                <Kicker index="04">Player of the season</Kicker>
              </Reveal>
              <Reveal delay={90}>
                <h2 className="hero-type text-6xl leading-[0.88] sm:text-8xl">
                  {starPlayer.name.split(" ")[0]}
                  <span className="block text-accent">
                    {starPlayer.name.split(" ").slice(1).join(" ")}
                  </span>
                </h2>
              </Reveal>
              <Reveal delay={170}>
                <p className="data-type mt-4 text-[11px] uppercase tracking-[0.25em] text-dim">
                  #{starPlayer.jersey} · {ROLE_LABEL[starPlayer.role]} ·{" "}
                  {starPlayer.heightM.toFixed(2)}m
                </p>
              </Reveal>
              {/* broadcast stat bar */}
              <Reveal delay={260}>
                <div className="mt-9 flex flex-wrap gap-3">
                  {[
                    { n: String(star.points), label: "Points" },
                    {
                      n:
                        star.successRate === null
                          ? "N/A"
                          : `${Math.round(star.successRate)}%`,
                      label: "Success",
                    },
                    { n: String(star.contribution), label: "Impact" },
                  ].map((c) => (
                    <div key={c.label} className="lower-third px-5 py-3 pr-8">
                      <p className="stat-display tnum text-3xl font-extrabold text-accent">
                        {c.n}
                      </p>
                      <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                        {c.label}
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={340}>
                <div className="mt-9">
                  <Magnetic>
                    <LinkButton
                      href={`/players/${starPlayer.id}`}
                      variant="ghost"
                      className="min-w-44"
                    >
                      Full profile →
                    </LinkButton>
                  </Magnetic>
                </div>
              </Reveal>
            </div>
            <Reveal from="right" delay={140} className="order-1 md:order-2">
              <TiltCard max={4}>
                <div className="mn-photo h-[420px] rounded-3xl sm:h-[540px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={CLUB.photos.spotlight.src}
                    alt={CLUB.photos.spotlight.alt}
                    loading="lazy"
                  />
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </section>
      )}

      {/* ============ 05 · FULL-TIME ============ */}
      {latest && (
        <section className="border-b border-line">
          <div className="ft-bar">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 md:px-8">
              <span className="data-type text-[11px] font-bold uppercase tracking-[0.4em]">
                Full-time
              </span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-accent-ink/60" />
              <span className="data-type text-[11px] uppercase tracking-[0.2em]">
                {latest.dateISO} · {latest.venue}
              </span>
            </div>
          </div>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-14 md:px-8">
            <Reveal>
              <h2 className="hero-type text-4xl sm:text-6xl">
                {CLUB.nameShort}
                <span className="mx-3 text-2xl text-dim sm:text-3xl">vs</span>
                <span className="hero-outline">{latest.opponent}</span>
              </h2>
            </Reveal>
            {latestTopPlayer && latestTop && (
              <Reveal delay={120}>
                <div className="lower-third px-5 py-3 pr-9">
                  <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                    Player of the match
                  </p>
                  <p className="stat-display text-xl font-extrabold uppercase">
                    {latestTopPlayer.name}
                    <span className="led ml-3 text-lg">{latestTop.points} pts</span>
                  </p>
                </div>
              </Reveal>
            )}
            <Reveal delay={200}>
              <Magnetic>
                <LinkButton href={`/matches/${latest.id}`} variant="ghost" className="min-w-44">
                  Match report →
                </LinkButton>
              </Magnetic>
            </Reveal>
          </div>
        </section>
      )}

      {/* ============ 06 · THE SQUAD ============ */}
      <section className="relative overflow-hidden border-b border-line bg-raise">
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Kicker index="06">The squad</Kicker>
                <h2 className="hero-type text-5xl sm:text-7xl">
                  Built for the <span className="text-accent">big points</span>
                </h2>
              </div>
              <Magnetic className="hidden sm:block">
                <LinkButton href="/team" variant="ghost">
                  All players →
                </LinkButton>
              </Magnetic>
            </div>
          </Reveal>

          {/* horizontal shelf of players under the lights */}
          <div className="-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-6 md:-mx-8 md:px-8">
            {db.players.map((p, i) => {
              const l = seasonLines.find((sl) => sl.playerId === p.id);
              const headline =
                p.role === "SPIKER"
                  ? { n: l?.points ?? 0, label: "Points" }
                  : p.role === "SETTER"
                    ? { n: l?.assists ?? 0, label: "Assists" }
                    : { n: l?.blocks ?? 0, label: "Blocks" };
              return (
                <Reveal key={p.id} delay={Math.min(i, 5) * 90} className="snap-start">
                  <TiltCard max={6}>
                    <Link
                      href={`/players/${p.id}`}
                      className="card-premium relative block w-[264px] shrink-0 overflow-hidden rounded-3xl p-6 sm:w-[300px]"
                    >
                      {/* jersey numeral as the art */}
                      <span
                        aria-hidden
                        className="hero-type hero-outline pointer-events-none absolute -right-3 -top-7 text-[130px] leading-none"
                      >
                        {p.jersey}
                      </span>
                      <div className="relative z-10">
                        <p className="data-type text-[9px] uppercase tracking-[0.3em] text-accent">
                          {ROLE_LABEL[p.role]}
                        </p>
                        <p className="hero-type mt-16 text-3xl leading-[0.95]">
                          {p.name.split(" ")[0]}
                          <span className="block text-accent">
                            {p.name.split(" ").slice(1).join(" ")}
                          </span>
                        </p>
                        <div className="mt-6 flex items-end justify-between border-t border-line pt-4">
                          <div>
                            <p className="stat-display tnum text-2xl font-extrabold">
                              {headline.n}
                            </p>
                            <p className="data-type text-[9px] uppercase tracking-[0.25em] text-dim">
                              {headline.label}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="stat-display tnum text-2xl font-extrabold">
                              {l?.successRate == null ? "—" : `${Math.round(l.successRate)}%`}
                            </p>
                            <p className="data-type text-[9px] uppercase tracking-[0.25em] text-dim">
                              Success
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
          <Link
            href="/team"
            className="mt-2 block text-center text-sm font-semibold text-accent sm:hidden"
          >
            All players →
          </Link>
        </div>
      </section>

      {/* ============ 07 · THE RAFTERS ============ */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 md:px-8">
          {/* banners hang from the very top edge — the roof */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {[
              ...CLUB.honours.map((h) => ({
                label: h.title,
                value: h.season,
                sub: undefined as string | undefined,
              })),
              ...recordBanners,
            ]
              .slice(0, 4)
              .map((b, i) => (
                <RafterBanner
                  key={b.label}
                  title={b.label}
                  value={b.value}
                  sub={b.sub}
                  delay={i * 140}
                />
              ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-14 text-center">
              <h2 className="hero-type text-4xl sm:text-6xl">
                History is <span className="text-accent">kept overhead</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm text-dim">
                Honours and single-match records, computed live from the season’s
                events. Break one courtside and it hangs here the same night.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 08 · THE TUNNEL ============ */}
      <section className="tunnel relative overflow-hidden">
        <Parallax speed={0.6} className="absolute inset-0">
          <div className="mn-photo h-[120%] w-full opacity-60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={CLUB.photos.community.src}
              alt={CLUB.photos.community.alt}
              loading="lazy"
            />
          </div>
        </Parallax>
        <div className="relative mx-auto flex min-h-[70vh] max-w-7xl flex-col items-center justify-center px-4 py-28 text-center md:px-8">
          <Reveal>
            <p className="data-type text-[11px] uppercase tracking-[0.4em] text-dim">
              {CLUB.city} · est. {CLUB.founded}
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="hero-type mt-5 text-6xl leading-[0.88] sm:text-8xl md:text-9xl">
              This is
              <span className="block text-accent drop-shadow-[0_0_60px_var(--glow-accent)]">
                our house
              </span>
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Magnetic>
                <LinkButton href="/team" className="min-w-44 text-base">
                  Join the journey
                </LinkButton>
              </Magnetic>
              <Magnetic>
                <LinkButton href="/matches" variant="ghost" className="min-w-44 text-base">
                  Relive the matches
                </LinkButton>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
