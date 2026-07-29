"use client";

import { lines, sideTotals, topBy } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import {
  LiveLeaders,
  useAttackLeaders,
  useElapsedMinutes,
  useLiveMatch,
  useMatchContext,
} from "@/components/live-match";
import { ShowcaseSkeleton, Reveal, usePublished } from "@/components/showcase";
import { Kicker, LedCountdown, Magnetic } from "@/components/match-night";
import { LinkButton } from "@/components/ui";

/**
 * LIVE MATCH CENTRE — the fan's second screen. Strictly read-only.
 *
 * Three states:
 *   LIVE      — attack leaders, match timer, head-to-head team stats.
 *   WARM-UP   — match is on, nothing logged from the court yet.
 *   NO MATCH  — next fixture countdown + latest published result.
 *
 * Everything is DERIVED from StatEvents, which arrive through useLiveMatch
 * and the store's cross-tab listener — values update in place, no refresh.
 * There is no scoreboard here: the courtside tracker logs attacks and their
 * outcomes, not the referee's score, so a running total would be invented.
 * Stats are TEAM-level aggregates (publish boundary note in live-match.tsx).
 */

export default function LiveMatchCentre() {
  const { ready, match, events, started } = useLiveMatch();
  const { homeTeam, awayTeam, venue } = useMatchContext(match);
  const leaders = useAttackLeaders(match, events, 8);
  const { db } = useStore();
  const published = usePublished();
  const elapsed = useElapsedMinutes(events);

  if (!ready) return <ShowcaseSkeleton />;

  const nameFor = (teamId: string) =>
    db.teams.find((t) => t.id === teamId)?.name ?? "TBD";

  // ---------------- NO LIVE MATCH ----------------
  if (!match) {
    const latest = published.matches[0];
    const nextFixture = db.matches
      .filter((m) => m.status === "scheduled")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))[0];
    return (
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-32 md:px-8">
        <Reveal>
          <Kicker index="LIVE">Match Centre</Kicker>
        </Reveal>
        <Reveal delay={90}>
          <h1 className="hero-type mt-2 text-5xl sm:text-7xl">
            No match <span className="text-accent">right now</span>
          </h1>
        </Reveal>
        {nextFixture && (
          <Reveal delay={180}>
            <div className="card-premium mt-10 max-w-xl rounded-3xl p-8">
              <p className="data-type text-[10px] uppercase tracking-[0.3em] text-dim">
                Next up
              </p>
              <p className="stat-display mt-2 text-2xl font-extrabold uppercase">
                {nameFor(nextFixture.homeTeamId)} <span className="text-dim">vs</span>{" "}
                <span className="text-accent">{nameFor(nextFixture.awayTeamId)}</span>
              </p>
              <div className="mt-6">
                <LedCountdown
                  toISO={`${nextFixture.dateISO}T${nextFixture.time ?? "18:00"}:00`}
                />
              </div>
            </div>
          </Reveal>
        )}
        {latest && (
          <Reveal delay={260}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <p className="text-sm text-dim">
                Latest result: {nameFor(latest.homeTeamId)} vs{" "}
                {nameFor(latest.awayTeamId)}, {latest.dateISO}.
              </p>
              <Magnetic>
                <LinkButton href={`/matches/${latest.id}`} variant="ghost">
                  Match report →
                </LinkButton>
              </Magnetic>
            </div>
          </Reveal>
        )}
      </div>
    );
  }

  const homeName = homeTeam?.name ?? "Home";
  const awayName = awayTeam?.name ?? "Away";

  // ---------------- WARM-UP ----------------
  if (!started) {
    return (
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-32 md:px-8">
        <div className="flex items-center gap-3">
          <span className="live-ring inline-block h-2 w-2 rounded-full bg-err" />
          <p className="data-type text-[11px] font-bold uppercase tracking-[0.4em] text-err">
            Matchday
          </p>
        </div>
        <h1 className="hero-type mt-4 text-5xl sm:text-7xl">
          {homeName}
          <span className="mx-3 text-3xl text-dim">vs</span>
          <span className="text-accent">{awayName}</span>
        </h1>
        <div className="card-premium mt-10 max-w-xl rounded-3xl p-8 text-center">
          <p className="stat-display text-lg font-bold uppercase">Warming up</p>
          <p className="mt-2 text-sm text-dim">
            Nothing logged from the court yet. The board fills in with the first
            attack. Keep this page open, it updates by itself.
          </p>
        </div>
      </div>
    );
  }

  // ---------------- LIVE ----------------
  const us = sideTotals(events, match.homeTeamId);
  const opp = sideTotals(events, match.awayTeamId);
  const mvp = topBy(lines(db.players, events), "contribution");
  const mvpPlayer = mvp && mvp.contribution > 0 ? db.players.find((p) => p.id === mvp.playerId) : undefined;
  const attempts = us.spikeAttempts + opp.spikeAttempts;
  const currentSet = events.reduce((n, e) => Math.max(n, e.setNo), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-32 md:px-8">
      {/* header strip */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="live-ring inline-block h-2 w-2 rounded-full bg-err" />
        <p className="data-type text-[11px] font-bold uppercase tracking-[0.4em] text-err">Live</p>
        <p className="data-type text-[11px] uppercase tracking-[0.25em] text-dim">
          Set {currentSet}
          {venue ? ` · ${venue.name}` : ""}
          {elapsed !== null ? ` · ${elapsed}′` : ""}
        </p>
      </div>

      {/* attack board */}
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="hero-type text-4xl leading-[0.9] sm:text-6xl">
            {homeName}
            <span className="mx-3 align-middle text-2xl text-dim sm:text-3xl">vs</span>
            <span className="block text-accent sm:inline">{awayName}</span>
          </h1>
          <p className="led mt-6 text-7xl font-semibold sm:text-8xl">
            <span className="text-accent">{us.kills}</span>
            <span className="mx-4 text-dim">–</span>
            <span>{opp.kills}</span>
          </p>
          <p className="data-type mt-2 text-[10px] uppercase tracking-[0.3em] text-dim">
            Kills · not the match score
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="lower-third px-5 py-3 pr-8">
              <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                Attacks tracked
              </p>
              <p className="stat-display tnum text-lg font-extrabold">{attempts}</p>
            </div>
            <div className="lower-third px-5 py-3 pr-8">
              <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                Attack %
              </p>
              <p className="stat-display tnum text-lg font-extrabold">
                {us.attackPct ?? 0}% <span className="text-dim">/</span>{" "}
                {opp.attackPct ?? 0}%
              </p>
            </div>
          </div>

          {/* MVP so far */}
          <div className="mt-8">
            <p className="data-type text-[10px] uppercase tracking-[0.3em] text-dim">
              Player of the match, so far
            </p>
            {mvpPlayer && mvp ? (
              <p className="stat-display mt-1 text-2xl font-extrabold uppercase">
                {mvpPlayer.fullName}
                <span className="led ml-3 text-xl">{mvp.points} pts</span>
              </p>
            ) : (
              <p className="stat-display mt-1 text-2xl font-extrabold uppercase text-dim">
                First points coming up
              </p>
            )}
          </div>
        </div>

        {/* attack leaders — both teams */}
        <LiveLeaders rows={leaders} homeName={homeName} awayName={awayName} />
      </div>

      {/* head-to-head team stats */}
      <div className="mt-16">
        <Reveal>
          <Kicker index="H2H">Team statistics · live</Kicker>
        </Reveal>
        <div className="card-premium mt-6 rounded-3xl p-6 sm:p-8">
          <div className="data-type mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.3em]">
            <span className="text-accent">{homeName}</span>
            <span className="text-dim">{awayName}</span>
          </div>
          <div className="space-y-5">
            <VsBar label="Attack %" us={us.attackPct} opp={opp.attackPct} unit="%" />
            <VsBar
              label="Attempts"
              us={us.spikeAttempts}
              opp={opp.spikeAttempts}
              zeroIsValue
            />
            <VsBar label="Kills" us={us.kills} opp={opp.kills} zeroIsValue />
            <VsBar label="Attack errors" us={us.errors} opp={opp.errors} zeroIsValue invert />
          </div>
          {attempts === 0 && (
            <p className="data-type mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-dim">
              Statistics build swing by swing once the tracker starts logging.
            </p>
          )}
        </div>
        <p className="data-type mt-4 text-[10px] uppercase tracking-[0.25em] text-dim">
          Derived live from courtside events. No hand-typed numbers.
        </p>
      </div>
    </div>
  );
}

/**
 * Two-sided broadcast stat bar. `null` renders as an em-dash placeholder;
 * `zeroIsValue` keeps 0 as a real reading (counts vs. percentages).
 * `invert` flags stats where lower is better (errors) so neither side
 * gets the accent glow for "winning" them.
 */
function VsBar({
  label,
  us,
  opp,
  unit = "",
  zeroIsValue = false,
  invert = false,
}: {
  label: string;
  us: number | null;
  opp: number | null;
  unit?: string;
  zeroIsValue?: boolean;
  invert?: boolean;
}) {
  const fmt = (v: number | null) =>
    v === null && !zeroIsValue ? "n/a" : `${v ?? 0}${unit}`;
  const uv = us ?? 0;
  const ov = opp ?? 0;
  const total = uv + ov;
  const usShare = total > 0 ? (uv / total) * 100 : 50;
  const usLeads = !invert && total > 0 && uv > ov;
  const oppLeads = !invert && total > 0 && ov > uv;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className={`stat-display tnum text-lg font-extrabold ${usLeads ? "text-accent" : ""}`}>
          {fmt(us)}
        </span>
        <span className="data-type text-[10px] uppercase tracking-[0.25em] text-dim">{label}</span>
        <span className={`stat-display tnum text-lg font-extrabold ${oppLeads ? "text-accent" : ""}`}>
          {fmt(opp)}
        </span>
      </div>
      <div className="flex h-1.5 gap-1 overflow-hidden rounded-full">
        <div
          className={`rounded-full transition-all duration-500 ${usLeads ? "bg-accent" : "bg-line"}`}
          style={{ width: `${usShare}%` }}
        />
        <div
          className={`rounded-full transition-all duration-500 ${oppLeads ? "bg-accent" : "bg-line"}`}
          style={{ width: `${100 - usShare}%` }}
        />
      </div>
    </div>
  );
}
