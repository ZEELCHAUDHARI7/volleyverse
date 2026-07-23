"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useActiveLeague, useStore } from "@/lib/store";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  LinkButton,
  PageSkeleton,
  PublishBadge,
  SectionHeading,
  StatusChip,
} from "@/components/ui";
import type { Match, Team, Venue } from "@/lib/types";

/**
 * CONSOLE DASHBOARD — the operational hub for match day.
 *
 * League Setup (/console/league) owns the registry: competition,
 * venues, teams, rosters. This screen owns the MATCH PIPELINE:
 * schedule a fixture, run it courtside (Rally Tracker), then publish
 * the result to the public site. Everything renders from the store —
 * no fixed team counts, no seeded fixtures.
 */

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-ink transition-all duration-300 placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--glow-accent)] focus:outline-none";
const labelCls = "mb-1 block text-[11px] uppercase tracking-wider text-dim";

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

export default function ConsoleDashboard() {
  const { ready, db } = useStore();
  const { league, season, tournaments } = useActiveLeague();

  if (!ready) return <PageSkeleton />;

  const setupIncomplete =
    !league || !season || tournaments.length === 0 || db.teams.length < 2;
  const liveCount = db.matches.filter((m) => m.status === "live").length;

  return (
    <div className="space-y-8">
      <header className="card-premium relative overflow-hidden rounded-3xl">
        <div className="court-lines absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              League Operations Hub
            </span>
            <h1 className="hero-type mt-4 text-5xl text-ink sm:text-6xl">
              Console
            </h1>
            <p className="mt-3 text-sm text-dim">
              {league
                ? `${league.name}${season ? ` · ${season.name}` : ""}`
                : "Schedule fixtures, run them courtside, publish the results."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {liveCount > 0 && (
              <StatusChip tone="err" pulse>
                {liveCount} live now
              </StatusChip>
            )}
            <LinkButton href="/console/league" variant="ghost">
              ⚙️ League Setup
            </LinkButton>
            {db.teams.length >= 2 && (
              <LinkButton href="/console/matches/new">🏐 Start a Match</LinkButton>
            )}
          </div>
        </div>
      </header>

      <OverviewStats />

      {setupIncomplete ? (
        <SetupChecklist />
      ) : (
        <>
          <ScheduleMatch tournaments={tournaments.map((t) => t.id)} />
          <MatchPipeline />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------

function OverviewStats() {
  const { db } = useStore();
  const live = db.matches.filter((m) => m.status === "live").length;
  const published = db.matches.filter((m) => m.published).length;

  const stats = [
    { icon: "🛡️", label: "Teams", value: db.teams.length, sub: "registered clubs" },
    { icon: "👥", label: "Players", value: db.players.length, sub: "on active rosters" },
    {
      icon: "📡",
      label: "Live now",
      value: live,
      sub: live > 0 ? "match in progress" : "courts are quiet",
      accent: live > 0,
    },
    { icon: "📣", label: "Published", value: published, sub: "results on public site" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="card-spot relative overflow-hidden p-5">
          <div className="flex items-start justify-between gap-2">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-xl bg-surface2 text-lg ring-1 ring-line"
            >
              {s.icon}
            </span>
            {s.accent && (
              <span
                className="live-ring mt-1 h-2.5 w-2.5 rounded-full bg-err"
                aria-hidden
              />
            )}
          </div>
          <div
            className={`stat-display mt-4 text-4xl font-extrabold ${
              s.accent ? "text-accent" : "text-ink"
            }`}
          >
            {s.value}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-dim">
            {s.label}
          </div>
          <div className="mt-0.5 text-[11px] text-dim/70">{s.sub}</div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Setup checklist — shown until the league can host a match
// ---------------------------------------------------------------------

function SetupChecklist() {
  const { db } = useStore();
  const { league, season, tournaments } = useActiveLeague();

  const steps = [
    {
      title: "Create your league",
      detail: "Name the competition. Everything hangs off it.",
      done: !!league,
    },
    {
      title: "Open a season",
      detail: "An active season anchors every fixture and standing.",
      done: !!season,
    },
    {
      title: "Add a tournament",
      detail: "Fixtures are scheduled inside a tournament.",
      done: tournaments.length > 0,
    },
    {
      title: "Register at least two teams",
      detail: `${db.teams.length} of 2 minimum registered so far.`,
      done: db.teams.length >= 2,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="relative overflow-hidden p-0">
      <div className="court-lines absolute inset-0" aria-hidden />
      <div className="relative space-y-6 p-6 sm:p-8">
        <SectionHeading
          icon="🚀"
          title="Get match-ready"
          hint="A match needs a tournament and at least two registered teams."
          trailing={
            <StatusChip tone={doneCount === steps.length ? "ok" : "accent"}>
              {doneCount} of {steps.length} complete
            </StatusChip>
          }
        />

        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface2"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {steps.map((s, i) => {
            const state = s.done ? "done" : i === nextIdx ? "next" : "pending";
            return (
              <li
                key={s.title}
                className={`flex items-start gap-4 rounded-2xl border p-4 transition-colors ${
                  state === "done"
                    ? "border-ok/25 bg-ok/5"
                    : state === "next"
                      ? "border-accent/40 bg-accent/5"
                      : "border-line bg-surface/40"
                }`}
              >
                <span
                  aria-hidden
                  className={`data-type grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    state === "done"
                      ? "bg-ok/15 text-ok ring-1 ring-ok/30"
                      : state === "next"
                        ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                        : "bg-surface2 text-dim ring-1 ring-line"
                  }`}
                >
                  {s.done ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-xs text-dim">{s.detail}</p>
                </div>
                {state === "done" ? (
                  <StatusChip tone="ok">Done</StatusChip>
                ) : state === "next" ? (
                  <StatusChip tone="accent" pulse>
                    Next up
                  </StatusChip>
                ) : (
                  <StatusChip tone="dim">Pending</StatusChip>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-4">
          <LinkButton href="/console/league">Open League Setup</LinkButton>
          <p className="text-xs text-dim">
            Competition structure, venues and rosters all live in League Setup.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Schedule a match
// ---------------------------------------------------------------------

function ScheduleMatch({ tournaments }: { tournaments: string[] }) {
  const { db, createMatch } = useStore();

  const [tournamentId, setTournamentId] = useState(tournaments[0] ?? "");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [dateISO, setDateISO] = useState("");
  const [time, setTime] = useState("");
  const [venueId, setVenueId] = useState("");
  const [courtId, setCourtId] = useState("");
  const [totalSets, setTotalSets] = useState(5);

  const courts = db.courts.filter((c) => c.venueId === venueId);
  const nextMatchNo =
    db.matches.filter((m) => m.tournamentId === tournamentId).length + 1;

  const valid =
    tournamentId &&
    homeTeamId &&
    awayTeamId &&
    homeTeamId !== awayTeamId &&
    dateISO;

  const submit = () => {
    if (!valid) return;
    createMatch({
      tournamentId,
      groupId: null,
      matchNo: nextMatchNo,
      dateISO,
      time: time || null,
      venueId: venueId || null,
      courtId: courtId || null,
      homeTeamId,
      awayTeamId,
      totalSets,
      officials: [],
      rosters: [],
    });
    setHomeTeamId("");
    setAwayTeamId("");
    setTime("");
  };

  const teamOptions = (excludeId: string) =>
    db.teams.filter((t) => t.id !== excludeId);

  return (
    <Card className="space-y-5 p-6">
      <SectionHeading
        icon="📅"
        title="Schedule a Match"
        hint="Create the fixture here, then run it courtside with the Rally Tracker."
        trailing={
          <StatusChip tone="azure">Match {nextMatchNo} up next</StatusChip>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelCls}>Tournament</span>
          <select className={inputCls} value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
            {db.tournaments
              .filter((t) => tournaments.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Home team</span>
          <select className={inputCls} value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
            <option value="">Select…</option>
            {teamOptions(awayTeamId).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Away team</span>
          <select className={inputCls} value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
            <option value="">Select…</option>
            {teamOptions(homeTeamId).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Date</span>
          <input type="date" className={inputCls} value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelCls}>Time</span>
          <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelCls}>Best of</span>
          <select className={inputCls} value={totalSets} onChange={(e) => setTotalSets(Number(e.target.value))}>
            <option value={3}>3 sets</option>
            <option value={5}>5 sets</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Venue</span>
          <select
            className={inputCls}
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value);
              setCourtId("");
            }}
          >
            <option value="">TBD</option>
            {db.venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Court</span>
          <select className={inputCls} value={courtId} onChange={(e) => setCourtId(e.target.value)} disabled={courts.length === 0}>
            <option value="">{courts.length === 0 ? "No courts" : "Any"}</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button className="w-full" disabled={!valid} onClick={submit}>
            Schedule · Match {nextMatchNo}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Match pipeline: live → scheduled → completed
// ---------------------------------------------------------------------

function MatchPipeline() {
  const { db } = useStore();

  const byDate = (a: Match, b: Match) =>
    `${a.dateISO}${a.time ?? ""}`.localeCompare(`${b.dateISO}${b.time ?? ""}`);

  const live = db.matches.filter((m) => m.status === "live").sort(byDate);
  const scheduled = db.matches.filter((m) => m.status === "scheduled").sort(byDate);
  const completed = db.matches
    .filter((m) => m.status === "completed")
    .sort(byDate)
    .reverse();

  if (db.matches.length === 0) {
    return (
      <EmptyState
        title="No matches yet"
        hint="Schedule your first fixture above, then run it courtside with the Rally Tracker."
      />
    );
  }

  return (
    <div className="space-y-8">
      {live.length > 0 && (
        <MatchGroup title="Live now" icon="🔴" matches={live} />
      )}
      {scheduled.length > 0 && (
        <MatchGroup title="Scheduled" icon="🗓️" matches={scheduled} />
      )}
      {completed.length > 0 && (
        <MatchGroup title="Completed" icon="🏁" matches={completed} />
      )}
    </div>
  );
}

function MatchGroup({
  title,
  icon,
  matches,
}: {
  title: string;
  icon: string;
  matches: Match[];
}) {
  return (
    <section className="space-y-3">
      <SectionHeading
        icon={icon}
        title={title}
        trailing={
          <StatusChip tone="dim">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
          </StatusChip>
        }
      />
      <div className="space-y-3">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

function MatchRow({ match }: { match: Match }) {
  const { db, setPublished, deleteMatch } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const team = (id: string | null): Team | undefined =>
    db.teams.find((t) => t.id === id);
  const venue: Venue | undefined = db.venues.find((v) => v.id === match.venueId);
  const home = team(match.homeTeamId);
  const away = team(match.awayTeamId);
  const tournament = db.tournaments.find((t) => t.id === match.tournamentId);

  const setsWon = useMemo(() => {
    let h = 0;
    let a = 0;
    for (const s of match.setScores) {
      if (s.homePoints > s.awayPoints) h++;
      else if (s.awayPoints > s.homePoints) a++;
    }
    return { h, a };
  }, [match.setScores]);

  return (
    <Card
      className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${
        match.status === "live" ? "border-err/30" : ""
      }`}
    >
      <span
        aria-hidden
        className="data-type grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface2 text-xs font-bold text-dim ring-1 ring-line"
      >
        {match.matchNo != null ? `M${match.matchNo}` : "VS"}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">
          {home?.name ?? "TBD"}{" "}
          <span className="text-dim">vs</span>{" "}
          {away?.name ?? "TBD"}
        </p>
        <p className="mt-0.5 text-xs text-dim">
          {tournament?.name}
          {` · ${match.dateISO}`}
          {match.time && ` · ${match.time}`}
          {venue && ` · ${venue.name}`}
        </p>
      </div>

      {match.status === "completed" && (
        <div className="flex items-center gap-3">
          <div className="stat-display text-2xl font-extrabold">
            {setsWon.h}
            <span className="text-dim">–</span>
            {setsWon.a}
          </div>
          <StatusChip tone="dim">Final</StatusChip>
        </div>
      )}

      {match.status === "live" && (
        <StatusChip tone="err" pulse>
          Live
        </StatusChip>
      )}

      {match.status === "scheduled" && (
        <StatusChip tone="azure">Scheduled</StatusChip>
      )}

      <div className="flex items-center gap-2">
        {match.status !== "completed" ? (
          <LinkButton href={`/console/matches/${match.id}/rally`} variant={match.status === "live" ? "primary" : "ghost"}>
            {match.status === "live" ? "Open Tracker" : "Start Match"}
          </LinkButton>
        ) : (
          <>
            <PublishBadge published={match.published} />
            <LinkButton
              href={`/console/matches/${match.id}/analytics`}
              variant="ghost"
            >
              📊 Analytics
            </LinkButton>
            <Button
              variant="ghost"
              onClick={() => setPublished(match.id, !match.published)}
            >
              {match.published ? "Unpublish" : "Publish"}
            </Button>
            <Link
              href={`/console/matches/${match.id}/rally`}
              className="text-xs text-dim underline-offset-2 hover:text-ink hover:underline"
            >
              Details
            </Link>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        )}
      </div>

      {match.status === "completed" && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete match?"
          message={
            <>
              This permanently removes{" "}
              <span className="font-semibold text-ink">
                {home?.name ?? "TBD"} vs {away?.name ?? "TBD"}
              </span>{" "}
              — its scores, every recorded event, all statistics and analytics.
              This cannot be undone.
            </>
          }
          confirmLabel="Delete match"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteMatch(match.id);
            setConfirmDelete(false);
          }}
        />
      )}
    </Card>
  );
}
