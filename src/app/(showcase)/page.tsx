"use client";

import Link from "next/link";
import { useState } from "react";
import { lines, seasonRecord, standings, topBy } from "@/lib/metrics";
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
  Kicker,
  LedCountdown,
  LightsUp,
  Magnetic,
  Parallax,
  RafterBanner,
  type TickerItem,
} from "@/components/match-night";
import { LinkButton } from "@/components/ui";
import { LiveNow } from "@/components/live-now";
import { useActiveLeague } from "@/lib/store";
import { POSITION_LABEL } from "@/lib/types";
import type { Match, Team } from "@/lib/types";

/**
 * MATCH NIGHT — the league homepage as a walk through the arena.
 * Every number and name on this page derives from store data
 * (published matches only); nothing is hardcoded.
 *
 * 00 Lights up (entry, once per session)
 * 01 The court — floodlit hero, broadcast ticker
 * 02 Matchday — next fixture, LED countdown
 * 03 The scoreboard — season in numbers
 * 04 The spotlight — leading player of the season
 * 05 Full-time — latest result
 * 06 The table — league standings
 * 07 The rafters — season record banners
 */
export default function ShowcaseHome() {
  const { ready, db, matches, events } = usePublished();
  const { league, season } = useActiveLeague();
  const [lit, setLit] = useState(false);

  if (!ready) return <ShowcaseSkeleton />;

  const teamName = (id: string) => db.teams.find((t) => t.id === id)?.name ?? "TBD";
  const teamShort = (id: string) =>
    db.teams.find((t) => t.id === id)?.shortName ?? teamName(id);
  const setsLine = (m: Match) => {
    let home = 0;
    let away = 0;
    for (const s of m.setScores) {
      if (s.homePoints > s.awayPoints) home++;
      else if (s.awayPoints > s.homePoints) away++;
    }
    return `${home}–${away}`;
  };

  // ---- derived, always from published events only ----
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

  const nextFixture = db.matches
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))[0];
  const nextFixtureVenue =
    nextFixture && db.venues.find((v) => v.id === nextFixture.venueId);

  const table = standings(matches).slice(0, 6);

  const ticker: TickerItem[] = matches.slice(0, 6).map((m) => {
    const ls = lines(db.players, events.filter((e) => e.matchId === m.id));
    const top = topBy(ls, "points");
    const topName =
      top && db.players.find((p) => p.id === top.playerId)?.fullName;
    return {
      tag: "FT",
      text: `${teamShort(m.homeTeamId)} ${setsLine(m)} ${teamShort(m.awayTeamId)}`,
      detail: topName && top ? `${topName} ${top.points} pts` : undefined,
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
    return [
      {
        label,
        value: String(r.value),
        sub: p?.fullName,
      },
    ];
  });

  const wordmark = league?.name ?? "VolleyVerse";
  const words = wordmark.trim().split(/\s+/);
  const lead = words.slice(0, -1).join(" ");
  const accent = words[words.length - 1];

  const scoreboard = [
    { n: db.teams.length, label: "Teams", suffix: "" },
    { n: matches.length, label: "Matches played", suffix: "" },
    {
      n: matches.reduce(
        (s, m) => s + m.setScores.reduce((x, ss) => x + ss.homePoints + ss.awayPoints, 0),
        0,
      ),
      label: "Points scored",
      suffix: "",
    },
    {
      n: seasonLines.reduce((s, l) => s + l.aces, 0),
      label: "Service aces",
      suffix: "",
    },
  ];

  return (
    <div className="overflow-x-clip">
      <LightsUp wordmark={wordmark} onDone={() => setLit(true)} />

      {/* ============ 01 · THE COURT ============ */}
      <section className="relative -mt-20 min-h-[100svh] overflow-hidden">
        <div className="court-floor absolute inset-0" aria-hidden />
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
            {season ? `Season ${season.name}` : "Professional volleyball, tracked live"}
          </p>
          <h1 className="hero-type text-[clamp(3.2rem,13vw,12rem)] text-ink">
            {lit ? (
              <>
                {lead && (
                  <span className="block">
                    <CharReveal text={lead} />
                  </span>
                )}
                <span className="block text-accent drop-shadow-[0_0_60px_var(--glow-accent)]">
                  <CharReveal text={accent} lineDelay={260} />
                </span>
              </>
            ) : (
              <span className="block opacity-0">
                {lead}
                <br />
                {accent}
              </span>
            )}
          </h1>

          {/* broadcast lower-third */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <p className="max-w-sm text-sm text-dim">
              Every spike, block and ace, tracked live courtside,{" "}
              <span className="text-ink">told here.</span>
            </p>
            <div className="ml-auto hidden gap-3 sm:flex">
              <Magnetic>
                <LinkButton href="/team" className="min-w-40 text-base">
                  The Teams
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

        {/* results ticker pinned to the hero floor */}
        <div className="absolute inset-x-0 bottom-0 z-10">
          <BroadcastTicker items={ticker} />
        </div>
      </section>

      {/* ============ 01.5 · LIVE NOW — renders only while a match is live ============ */}
      <LiveNow />

      {/* ============ 02 · MATCHDAY ============ */}
      {nextFixture && (
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden className="absolute inset-0">
            <div className="light-cone left-1/2 -translate-x-1/2 opacity-70" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
            <Reveal>
              <Kicker index="02">Matchday approaches</Kicker>
            </Reveal>
            <Reveal delay={90}>
              <h2 className="hero-type text-5xl leading-[0.9] sm:text-7xl">
                {teamName(nextFixture.homeTeamId)}
                <span className="mx-3 align-middle text-2xl text-dim sm:text-4xl">vs</span>
                <span className="block text-accent sm:inline">
                  {teamName(nextFixture.awayTeamId)}
                </span>
              </h2>
            </Reveal>
            <Reveal delay={170}>
              <p className="data-type mt-4 text-[11px] uppercase tracking-[0.25em] text-dim">
                {nextFixture.dateISO}
                {nextFixture.time ? ` · ${nextFixture.time}` : ""}
                {nextFixtureVenue ? ` · ${nextFixtureVenue.name}` : ""}
              </p>
            </Reveal>
            <Reveal delay={250}>
              <div className="mt-9">
                <LedCountdown
                  toISO={`${nextFixture.dateISO}T${nextFixture.time ?? "18:00"}:00`}
                />
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
            {scoreboard.map((s, i) => (
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
              {matches.length === 1 ? "match" : "matches"}. No hand-typed numbers.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 04 · THE SPOTLIGHT ============ */}
      {starPlayer && star && (
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden className="absolute inset-0">
            <div
              className="light-cone light-cone--accent left-[58%] -translate-x-1/2"
              style={{ ["--beam-r" as string]: "0deg" }}
            />
          </div>
          <Parallax
            speed={-0.4}
            className="pointer-events-none absolute -right-6 top-1/2 -translate-y-1/2 select-none"
          >
            <span aria-hidden className="hero-type hero-outline text-[38vw] leading-none lg:text-[28rem]">
              {starPlayer.jerseyNo ?? "—"}
            </span>
          </Parallax>

          <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
            <Reveal>
              <Kicker index="04">Player of the season</Kicker>
            </Reveal>
            <Reveal delay={90}>
              <h2 className="hero-type text-6xl leading-[0.88] sm:text-8xl">
                {starPlayer.fullName.split(" ")[0]}
                <span className="block text-accent">
                  {starPlayer.fullName.split(" ").slice(1).join(" ")}
                </span>
              </h2>
            </Reveal>
            <Reveal delay={170}>
              <p className="data-type mt-4 text-[11px] uppercase tracking-[0.25em] text-dim">
                #{starPlayer.jerseyNo ?? "—"} ·{" "}
                {starPlayer.position ? POSITION_LABEL[starPlayer.position] : "Not listed"} ·{" "}
                {teamName(starPlayer.teamId)}
                {starPlayer.heightCm ? ` · ${starPlayer.heightCm} cm` : ""}
              </p>
            </Reveal>
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
                {latest.dateISO}
              </span>
            </div>
          </div>
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-14 md:px-8">
            <Reveal>
              <h2 className="hero-type text-4xl sm:text-6xl">
                {teamName(latest.homeTeamId)}
                <span className="led mx-3 text-3xl text-accent sm:text-4xl">
                  {setsLine(latest)}
                </span>
                <span className="hero-outline">{teamName(latest.awayTeamId)}</span>
              </h2>
            </Reveal>
            {latestTopPlayer && latestTop && (
              <Reveal delay={120}>
                <div className="lower-third px-5 py-3 pr-9">
                  <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                    Player of the match
                  </p>
                  <p className="stat-display text-xl font-extrabold uppercase">
                    {latestTopPlayer.fullName}
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

      {/* ============ 06 · THE TABLE ============ */}
      {table.length > 0 && (
        <section className="relative overflow-hidden border-b border-line bg-raise">
          <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-8">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <Kicker index="06">The table</Kicker>
                  <h2 className="hero-type text-5xl sm:text-7xl">
                    Every point <span className="text-accent">counts</span>
                  </h2>
                </div>
                <Magnetic className="hidden sm:block">
                  <LinkButton href="/team" variant="ghost">
                    All teams →
                  </LinkButton>
                </Magnetic>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="card-premium mt-12 overflow-x-auto rounded-3xl p-2">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="data-type text-[10px] uppercase tracking-[0.25em] text-dim">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-center">P</th>
                      <th className="px-4 py-3 text-center">W</th>
                      <th className="px-4 py-3 text-center">L</th>
                      <th className="px-4 py-3 text-center">Sets</th>
                      <th className="px-4 py-3 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.teamId} className="border-t border-line/60">
                        <td className="stat-display px-4 py-3 font-extrabold text-dim">
                          {r.rank}
                        </td>
                        <td className="px-4 py-3 font-semibold">{teamName(r.teamId)}</td>
                        <td className="tnum px-4 py-3 text-center">{r.played}</td>
                        <td className="tnum px-4 py-3 text-center text-ok">{r.won}</td>
                        <td className="tnum px-4 py-3 text-center text-err">{r.lost}</td>
                        <td className="tnum px-4 py-3 text-center text-dim">
                          {r.setsWon}–{r.setsLost}
                        </td>
                        <td className="stat-display tnum px-4 py-3 text-right text-lg font-extrabold text-accent">
                          {r.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ============ 07 · THE RAFTERS ============ */}
      {recordBanners.length > 0 && (
        <section className="relative overflow-hidden border-b border-line">
          <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 md:px-8">
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {recordBanners.slice(0, 4).map((b, i) => (
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
                  Single-match records, computed live from the season’s events.
                  Break one courtside and it hangs here the same night.
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ============ EMPTY STATE — a brand-new platform ============ */}
      {matches.length === 0 && !nextFixture && (
        <section className="border-b border-line">
          <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-8">
            <Reveal>
              <h2 className="hero-type text-4xl sm:text-6xl">
                The season <span className="text-accent">starts here</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm text-dim">
                No published matches yet. Set up your league, teams and fixtures
                in the console. Results appear here the moment they’re published.
              </p>
              <div className="mt-8">
                <Magnetic className="inline-block">
                  <LinkButton href="/console" className="min-w-44">
                    Open the Console →
                  </LinkButton>
                </Magnetic>
              </div>
            </Reveal>
          </div>
        </section>
      )}
    </div>
  );
}
