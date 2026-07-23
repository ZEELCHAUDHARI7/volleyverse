"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveLeague, useStore } from "@/lib/store";
import {
  Button,
  Card,
  LinkButton,
  PageSkeleton,
  SectionHeading,
  StatusChip,
} from "@/components/ui";

/**
 * START A MATCH — a guided, discoverable front door to the match pipeline.
 *
 * Step 1 (Teams): pick the two registered clubs that will play.
 * Step 2 (Details): tournament, date, best-of, optional venue/court.
 * On confirm we createMatch() and hand straight off to the Rally Tracker
 * (/console/matches/[id]/rally), whose existing wizard runs Toss → home
 * six → away six → live scoring. We deliberately do NOT duplicate that.
 *
 * If no league/season/tournament exists yet, a sensible default competition
 * is created on the fly so a first-time user is never blocked.
 */

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-ink transition-all duration-300 placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--glow-accent)] focus:outline-none";
const labelCls = "mb-1 block text-[11px] uppercase tracking-wider text-dim";

type Step = "teams" | "details";

export default function NewMatchWizard() {
  const router = useRouter();
  const store = useStore();
  const { ready, db, insert, createMatch } = store;
  const { league, season, tournaments } = useActiveLeague();

  const [step, setStep] = useState<Step>("teams");
  const [homeId, setHomeId] = useState("");
  const [awayId, setAwayId] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [totalSets, setTotalSets] = useState(5);
  const [venueId, setVenueId] = useState("");
  const [courtId, setCourtId] = useState("");

  const teams = db.teams;
  const courts = useMemo(
    () => db.courts.filter((c) => c.venueId === venueId),
    [db.courts, venueId],
  );
  const twoChosen = Boolean(homeId && awayId && homeId !== awayId);
  const effectiveTournamentId = tournamentId || tournaments[0]?.id || "";

  if (!ready) return <PageSkeleton />;

  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  /** Toggle a team into the Home slot, then Away; clicking a chosen team clears it. */
  const pick = (id: string) => {
    if (homeId === id) return setHomeId("");
    if (awayId === id) return setAwayId("");
    if (!homeId) return setHomeId(id);
    return setAwayId(id);
  };

  /** Guarantee a tournament to attach the fixture to, creating defaults if needed. */
  const ensureTournamentId = (): string => {
    if (effectiveTournamentId) return effectiveTournamentId;
    const lg = league ?? insert("leagues", { name: "VolleyVerse League", logoUrl: null, status: "active" });
    const ss =
      season ??
      insert("seasons", {
        leagueId: lg.id,
        name: String(new Date().getFullYear()),
        startDate: null,
        endDate: null,
        status: "active",
      });
    const tt =
      tournaments[0] ??
      insert("tournaments", {
        seasonId: ss.id,
        divisionId: null,
        name: "Season Fixtures",
        logoUrl: null,
        organizer: null,
        venueId: null,
        startDate: null,
        endDate: null,
        format: "LEAGUE",
        status: "active",
      });
    return tt.id;
  };

  const start = () => {
    if (!twoChosen || !dateISO) return;
    const tid = ensureTournamentId();
    const matchNo = db.matches.filter((m) => m.tournamentId === tid).length + 1;
    const match = createMatch({
      tournamentId: tid,
      groupId: null,
      matchNo,
      dateISO,
      time: time || null,
      venueId: venueId || null,
      courtId: courtId || null,
      homeTeamId: homeId,
      awayTeamId: awayId,
      totalSets,
      officials: [],
      rosters: [],
    });
    router.push(`/console/matches/${match.id}/rally`);
  };

  return (
    <div className="space-y-6">
      <header className="card-premium relative overflow-hidden rounded-3xl">
        <div className="court-lines absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Match Setup
            </span>
            <h1 className="hero-type mt-4 text-5xl text-ink sm:text-6xl">Start a Match</h1>
            <p className="mt-3 text-sm text-dim">
              Pick two teams, set the details, then run the toss courtside.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StepDot n={1} label="Teams" active={step === "teams"} done={step === "details"} />
            <span className="text-dim" aria-hidden>→</span>
            <StepDot n={2} label="Details" active={step === "details"} done={false} />
            <span className="text-dim" aria-hidden>→</span>
            <StepDot n={3} label="Toss" active={false} done={false} />
          </div>
        </div>
      </header>

      {/* STEP 1 — TEAMS */}
      {step === "teams" && (
        <Card className="space-y-5 p-6">
          <SectionHeading
            icon="🛡️"
            title="Choose two teams"
            hint="Tap a team to make it Home, tap another for Away. Tap again to clear."
            trailing={
              <StatusChip tone={twoChosen ? "ok" : "dim"}>
                {[homeId, awayId].filter(Boolean).length} of 2 selected
              </StatusChip>
            }
          />

          {teams.length < 2 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface2/50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-ink">You need at least two teams first.</p>
              <p className="mt-1 text-xs text-dim">
                Register clubs in League Setup (or load the PVL 2025 roster there), then come back.
              </p>
              <div className="mt-3">
                <LinkButton href="/console/league">Go to League Setup</LinkButton>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {teams.map((t) => {
                  const role = homeId === t.id ? "HOME" : awayId === t.id ? "AWAY" : null;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t.id)}
                      aria-pressed={role !== null}
                      className={`group relative flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-300 ${
                        role
                          ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                          : "border-line bg-surface2 hover:border-accent/40"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="stat-display grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-xs font-extrabold uppercase text-ink ring-1 ring-line"
                      >
                        {t.shortName.slice(0, 3)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{t.name}</span>
                        {t.city && <span className="block truncate text-[11px] text-dim">{t.city}</span>}
                      </span>
                      {role && (
                        <span className="absolute right-2 top-2 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                          {role}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
                <p className="text-sm text-dim">
                  {twoChosen ? (
                    <>
                      <span className="font-semibold text-ink">{nameOf(homeId)}</span> vs{" "}
                      <span className="font-semibold text-ink">{nameOf(awayId)}</span>
                    </>
                  ) : (
                    "Select a Home and an Away team to continue."
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <LinkButton href="/console/league" variant="ghost">
                    Manage teams
                  </LinkButton>
                  <Button disabled={!twoChosen} onClick={() => setStep("details")}>
                    Next: Details
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* STEP 2 — DETAILS */}
      {step === "details" && (
        <Card className="space-y-5 p-6">
          <SectionHeading
            icon="📅"
            title="Match details"
            hint="Set the fixture, then jump straight into the toss."
            trailing={
              <StatusChip tone="azure">
                {nameOf(homeId)} vs {nameOf(awayId)}
              </StatusChip>
            }
          />

          {tournaments.length === 0 && (
            <p className="rounded-xl border border-dashed border-line bg-surface2/50 px-4 py-3 text-xs text-dim">
              No competition set up yet — a default league, season and tournament will be created
              automatically so you can proceed.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tournaments.length > 0 && (
              <label className="block sm:col-span-3">
                <span className={labelCls}>Tournament</span>
                <select
                  className={inputCls}
                  value={effectiveTournamentId}
                  onChange={(e) => setTournamentId(e.target.value)}
                >
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Court</span>
              <select
                className={inputCls}
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                disabled={courts.length === 0}
              >
                <option value="">{courts.length === 0 ? "No courts" : "Any"}</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-4">
            <Button variant="ghost" onClick={() => setStep("teams")}>
              Back
            </Button>
            <Button disabled={!twoChosen || !dateISO} onClick={start}>
              Start match → Toss
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function StepDot({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
          active
            ? "bg-accent text-accent-ink"
            : done
              ? "bg-ok/20 text-ok ring-1 ring-ok/30"
              : "bg-surface2 text-dim ring-1 ring-line"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={`hidden text-[11px] font-semibold uppercase tracking-wider sm:block ${active ? "text-ink" : "text-dim"}`}>
        {label}
      </span>
    </span>
  );
}
