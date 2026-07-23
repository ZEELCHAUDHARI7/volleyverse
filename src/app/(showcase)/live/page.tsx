"use client";

import { lines, sideTotals, topBy } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import {
  LiveCourt,
  useElapsedMinutes,
  useLiveMatch,
  useMatchContext,
  useNameOf,
} from "@/components/live-match";
import { ShowcaseSkeleton, Reveal, usePublished } from "@/components/showcase";
import { Kicker, LedCountdown, Magnetic } from "@/components/match-night";
import { LinkButton } from "@/components/ui";

/**
 * LIVE MATCH CENTRE — the fan's second screen. Strictly read-only.
 *
 * Three states:
 *   LIVE      — full broadcast scoreboard: score, sets, serving, court,
 *               match timer, head-to-head team stats, match leaders.
 *   WARM-UP   — match created, line-ups still being set in the console.
 *   NO MATCH  — next fixture countdown + latest published result.
 *
 * All data arrives through useLiveMatch (cross-tab storage sync + 2s
 * poll) and the store's own cross-tab listener — values update in place,
 * no refresh. Stats are TEAM-level aggregates (publish boundary note in
 * live-match.tsx); placeholders render until the first attempts exist.
 */

export default function LiveMatchCentre() {
  const { ready, match, state, events, degraded } = useLiveMatch();
  const nameOf = useNameOf();
  const { homeTeam, awayTeam, venue } = useMatchContext(match);
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
  if (!state) {
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
            Line-ups are being set courtside. The scoreboard goes live with the first serve.
            Keep this page open, it updates by itself.
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
  const setScores = state.setScores ?? [];
  const deciding = state.set === match.totalSets;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-32 md:px-8">
      {/* header strip */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="live-ring inline-block h-2 w-2 rounded-full bg-err" />
        <p className="data-type text-[11px] font-bold uppercase tracking-[0.4em] text-err">Live</p>
        <p className="data-type text-[11px] uppercase tracking-[0.25em] text-dim">
          Set {state.set} · {deciding ? "to 15" : "to 25"}
          {venue ? ` · ${venue.name}` : ""}
          {elapsed !== null ? ` · ${elapsed}′` : ""}
        </p>
        {degraded && (
          <span className="data-type rounded-full border border-line px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-dim">
            reconnecting…
          </span>
        )}
      </div>

      {/* scoreboard */}
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="hero-type text-4xl leading-[0.9] sm:text-6xl">
            {homeName}
            <span className="mx-3 align-middle text-2xl text-dim sm:text-3xl">vs</span>
            <span className="block text-accent sm:inline">{awayName}</span>
          </h1>
          <p className="led mt-6 text-7xl font-semibold sm:text-8xl">
            <span className={state.rally.serving === "US" ? "text-accent" : ""}>
              {state.usScore}
            </span>
            <span className="mx-4 text-dim">–</span>
            <span className={state.rally.serving === "OPP" ? "text-accent" : ""}>
              {state.oppScore}
            </span>
          </p>

          {/* sets */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="lower-third px-5 py-3 pr-8">
              <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">Sets</p>
              <p className="stat-display tnum text-lg font-extrabold">
                {state.usSets} – {state.oppSets}
              </p>
            </div>
            <div className="lower-third px-5 py-3 pr-8">
              <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">Serving</p>
              <p className="stat-display text-lg font-bold uppercase">
                {state.rally.serving === "US" ? homeName : awayName}
              </p>
            </div>
            {setScores.length > 0 && (
              <div className="lower-third px-5 py-3 pr-8">
                <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
                  Previous sets
                </p>
                <p className="stat-display tnum text-lg font-extrabold">
                  {setScores.map((s) => `${s.us}–${s.opp}`).join("  ·  ")}
                </p>
              </div>
            )}
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

        {/* on-court six */}
        <LiveCourt match={match} state={state} nameOf={nameOf} />
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
            <VsBar label="Serve %" us={us.servePct} opp={opp.servePct} unit="%" />
            <VsBar label="Reception %" us={us.recvPct} opp={opp.recvPct} unit="%" />
            <VsBar label="Block %" us={us.blockPct} opp={opp.blockPct} unit="%" />
            <VsBar label="Aces" us={us.aces} opp={opp.aces} zeroIsValue />
            <VsBar label="Blocks won" us={us.blocks} opp={opp.blocks} zeroIsValue />
            <VsBar label="Points earned" us={us.earned} opp={opp.earned} zeroIsValue />
            <VsBar label="Errors" us={us.errors} opp={opp.errors} zeroIsValue invert />
          </div>
          {us.spikeAttempts + opp.spikeAttempts + us.serveAttempts + opp.serveAttempts === 0 && (
            <p className="data-type mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-dim">
              Statistics build point by point once the rally tracker starts logging.
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
