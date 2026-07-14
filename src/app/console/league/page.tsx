"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  Button,
  Card,
  LinkButton,
  PageSkeleton,
  PositionTag,
  SectionHeading,
  StatusChip,
} from "@/components/ui";
import {
  POSITIONS_ALL,
  POSITION_LABEL,
  STAFF_ROLE_LABEL,
  type PlayerPosition,
  type StaffRole,
  type Team,
} from "@/lib/types";

/**
 * LEAGUE SETUP — the registry console: league → season → tournaments,
 * venues & courts, teams with staff and players. Everything the match
 * screens consume is created here; nothing on the platform is seeded.
 */

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-ink transition-all duration-300 placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--glow-accent)] focus:outline-none";
const labelCls = "mb-1 block text-[11px] uppercase tracking-wider text-dim";

/** Small destructive text action used on registry rows. */
function RemoveButton({
  onClick,
  children = "Remove",
}: {
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-err/70 transition-colors hover:bg-err/10 hover:text-err"
    >
      {children}
    </button>
  );
}

export default function LeagueSetup() {
  const store = useStore();
  const { ready, db } = store;

  if (!ready) return <PageSkeleton />;

  const complete = db.teams.length >= 2 && db.tournaments.length > 0;

  return (
    <div className="space-y-8">
      <header className="card-premium relative overflow-hidden rounded-3xl">
        <div className="court-lines absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              League Registry
            </span>
            <h1 className="hero-type mt-4 text-5xl text-ink sm:text-6xl">
              League Setup
            </h1>
            <p className="mt-3 text-sm text-dim">
              Competition structure, venues, teams and rosters.
            </p>
          </div>
          <StatusChip tone={complete ? "ok" : "accent"} pulse={!complete}>
            {complete ? "Setup complete" : "Setup in progress"}
          </StatusChip>
        </div>
      </header>

      <CompetitionSection />
      <VenuesSection />
      <TeamsSection />

      {complete && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-ok/25 p-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-xl bg-ok/10 text-lg ring-1 ring-ok/25"
            >
              ✅
            </span>
            <div>
              <p className="text-sm font-bold text-ink">Setup complete</p>
              <p className="text-xs text-dim">
                Your league can host matches. Schedule fixtures from the dashboard.
              </p>
            </div>
          </div>
          <LinkButton href="/console" variant="ghost">
            Go to Dashboard
          </LinkButton>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// League → Season → Tournament
// ---------------------------------------------------------------------

function CompetitionSection() {
  const { db, insert, remove } = useStore();
  const [leagueName, setLeagueName] = useState("");
  const [seasonName, setSeasonName] = useState("");
  const [tournName, setTournName] = useState("");
  const [tournOrganizer, setTournOrganizer] = useState("");
  const [tournVenueId, setTournVenueId] = useState("");
  const [tournStart, setTournStart] = useState("");
  const [tournEnd, setTournEnd] = useState("");

  const league = db.leagues[0];
  const season = db.seasons.find((s) => s.leagueId === league?.id);
  const tournaments = season
    ? db.tournaments.filter((t) => t.seasonId === season.id)
    : [];

  return (
    <Card className="space-y-5 p-6">
      <SectionHeading
        icon="🏆"
        title="Competition"
        hint="League, season and the tournaments fixtures live inside."
        trailing={
          tournaments.length > 0 ? (
            <StatusChip tone="dim">
              {tournaments.length}{" "}
              {tournaments.length === 1 ? "tournament" : "tournaments"}
            </StatusChip>
          ) : undefined
        }
      />

      {!league ? (
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className={labelCls}>League name</span>
            <input
              className={inputCls}
              placeholder="Name of your league"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
            />
          </label>
          <Button
            disabled={leagueName.trim().length < 2}
            onClick={() => {
              insert("leagues", {
                name: leagueName.trim(),
                logoUrl: null,
                status: "active",
              });
              setLeagueName("");
            }}
          >
            Create league
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="stat-display grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-sm font-extrabold uppercase text-accent ring-1 ring-accent/25"
            >
              {league.name.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="stat-display truncate text-base font-extrabold uppercase">
                {league.name}
              </p>
              <p className="text-xs text-dim">
                {season ? `Season ${season.name}` : "No season yet"}
              </p>
            </div>
          </div>
          <StatusChip tone="ok">Active</StatusChip>
        </div>
      )}

      {league && !season && (
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className={labelCls}>Season</span>
            <input
              className={inputCls}
              placeholder="e.g. 2026–27"
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
            />
          </label>
          <Button
            disabled={seasonName.trim().length < 2}
            onClick={() => {
              insert("seasons", {
                leagueId: league.id,
                name: seasonName.trim(),
                startDate: null,
                endDate: null,
                status: "active",
              });
              setSeasonName("");
            }}
          >
            Add season
          </Button>
        </div>
      )}

      {season && (
        <div className="space-y-3 border-t border-line/60 pt-4">
          <div className="flex items-center justify-between">
            <p className={`${labelCls} mb-0`}>Tournaments</p>
            {tournaments.length === 0 && (
              <StatusChip tone="accent" pulse>
                Next up
              </StatusChip>
            )}
          </div>
          {tournaments.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                <p className="text-xs text-dim">
                  {t.organizer ? `${t.organizer} · ` : ""}
                  {t.startDate ?? "dates TBC"}
                  {t.endDate ? ` → ${t.endDate}` : ""}
                </p>
              </div>
              <RemoveButton onClick={() => remove("tournaments", t.id)} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 block sm:col-span-1">
              <span className={labelCls}>Tournament name</span>
              <input
                className={inputCls}
                placeholder="e.g. Championship Round"
                value={tournName}
                onChange={(e) => setTournName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Organizer</span>
              <input
                className={inputCls}
                placeholder="optional"
                value={tournOrganizer}
                onChange={(e) => setTournOrganizer(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Primary venue</span>
              <select
                className={inputCls}
                value={tournVenueId}
                onChange={(e) => setTournVenueId(e.target.value)}
              >
                <option value="">TBC</option>
                {db.venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Start date</span>
              <input
                type="date"
                className={inputCls}
                value={tournStart}
                onChange={(e) => setTournStart(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelCls}>End date</span>
              <input
                type="date"
                className={inputCls}
                value={tournEnd}
                onChange={(e) => setTournEnd(e.target.value)}
              />
            </label>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={tournName.trim().length < 2}
                onClick={() => {
                  insert("tournaments", {
                    seasonId: season.id,
                    divisionId: null,
                    name: tournName.trim(),
                    logoUrl: null,
                    organizer: tournOrganizer.trim() || null,
                    venueId: tournVenueId || null,
                    startDate: tournStart || null,
                    endDate: tournEnd || null,
                    format: "LEAGUE",
                    status: "active",
                  });
                  setTournName("");
                  setTournOrganizer("");
                  setTournStart("");
                  setTournEnd("");
                }}
              >
                Add tournament
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Venues & courts
// ---------------------------------------------------------------------

function VenuesSection() {
  const { db, insert, remove } = useStore();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [courtName, setCourtName] = useState("");
  const [courtVenueId, setCourtVenueId] = useState("");

  return (
    <Card className="space-y-5 p-6">
      <SectionHeading
        icon="🏟️"
        title="Venues"
        hint="Arenas and the courts inside them."
        trailing={
          db.venues.length > 0 ? (
            <StatusChip tone="dim">
              {db.venues.length} {db.venues.length === 1 ? "venue" : "venues"}
            </StatusChip>
          ) : undefined
        }
      />

      {db.venues.map((v) => {
        const courts = db.courts.filter((c) => c.venueId === v.id);
        return (
          <div key={v.id} className="rounded-xl bg-surface2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{v.name}</p>
                <p className="text-xs text-dim">
                  {v.city ?? "City TBC"}
                  {v.capacity ? ` · ${v.capacity.toLocaleString()} seats` : ""}
                </p>
              </div>
              <RemoveButton onClick={() => remove("venues", v.id)} />
            </div>
            {courts.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {courts.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-md bg-line/50 px-2 py-0.5 text-[11px] font-semibold text-dim"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={labelCls}>Venue name</span>
          <input
            className={inputCls}
            placeholder="Arena name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>City</span>
          <input
            className={inputCls}
            placeholder="optional"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Capacity</span>
          <input
            type="number"
            min={0}
            className={inputCls}
            placeholder="optional"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={name.trim().length < 2}
            onClick={() => {
              insert("venues", {
                name: name.trim(),
                address: null,
                city: city.trim() || null,
                capacity: capacity ? Number(capacity) : null,
                mapUrl: null,
              });
              setName("");
              setCity("");
              setCapacity("");
            }}
          >
            Add venue
          </Button>
        </div>
      </div>

      {db.venues.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-t border-line/60 pt-4 sm:grid-cols-4">
          <label className="block">
            <span className={labelCls}>Court name</span>
            <input
              className={inputCls}
              placeholder="e.g. Court 1"
              value={courtName}
              onChange={(e) => setCourtName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelCls}>At venue</span>
            <select
              className={inputCls}
              value={courtVenueId}
              onChange={(e) => setCourtVenueId(e.target.value)}
            >
              <option value="">Select…</option>
              {db.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              disabled={courtName.trim().length < 1 || !courtVenueId}
              onClick={() => {
                insert("courts", { venueId: courtVenueId, name: courtName.trim() });
                setCourtName("");
              }}
            >
              Add court
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Teams, staff & players
// ---------------------------------------------------------------------

function TeamsSection() {
  const { db, insert, remove, update } = useStore();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [city, setCity] = useState("");
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-6">
        <SectionHeading
          icon="🛡️"
          title="Teams"
          hint="Register clubs, then open a team to manage its staff and roster."
          trailing={
            <StatusChip tone={db.teams.length >= 2 ? "ok" : "dim"}>
              {db.teams.length} of 2 minimum
            </StatusChip>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className={labelCls}>Team name</span>
            <input
              className={inputCls}
              placeholder="Full team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Short name</span>
            <input
              className={inputCls}
              placeholder="e.g. 3-letter code"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelCls}>City</span>
            <input
              className={inputCls}
              placeholder="optional"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={name.trim().length < 2}
              onClick={() => {
                const t = insert("teams", {
                  name: name.trim(),
                  shortName: shortName.trim() || name.trim().slice(0, 3).toUpperCase(),
                  logoUrl: null,
                  city: city.trim() || null,
                  founded: null,
                  honours: [],
                });
                setOpenTeam((t as Team).id);
                setName("");
                setShortName("");
                setCity("");
              }}
            >
              Add team
            </Button>
          </div>
        </div>
      </Card>

      {db.teams.map((t) => (
        <TeamCard
          key={t.id}
          team={t}
          open={openTeam === t.id}
          onToggle={() => setOpenTeam(openTeam === t.id ? null : t.id)}
          onRemove={() => {
            // Cascade locally: players & staff of the team go too.
            db.players.filter((p) => p.teamId === t.id).forEach((p) => remove("players", p.id));
            db.staff.filter((s) => s.teamId === t.id).forEach((s) => remove("staff", s.id));
            remove("teams", t.id);
          }}
          update={update}
        />
      ))}
    </div>
  );
}

function TeamCard({
  team,
  open,
  onToggle,
  onRemove,
  update,
}: {
  team: Team;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  update: ReturnType<typeof useStore>["update"];
}) {
  const { db, insert, remove } = useStore();
  const roster = db.players.filter((p) => p.teamId === team.id);
  const staff = db.staff.filter((s) => s.teamId === team.id);

  // player form
  const [pName, setPName] = useState("");
  const [pJersey, setPJersey] = useState("");
  const [pPosition, setPPosition] = useState<PlayerPosition>("OH");
  const [pHeight, setPHeight] = useState("");
  const [pNationality, setPNationality] = useState("");

  // staff form
  const [sName, setSName] = useState("");
  const [sRole, setSRole] = useState<StaffRole>("HEAD_COACH");

  const captain = roster.find((p) => p.isCaptain);

  return (
    <Card className="space-y-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="stat-display grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface2 text-sm font-extrabold uppercase text-ink ring-1 ring-line"
          >
            {team.shortName.slice(0, 3)}
          </span>
          <div className="min-w-0">
            <p className="stat-display truncate text-lg font-extrabold uppercase">
              {team.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusChip tone="dim">
                {roster.length} {roster.length === 1 ? "player" : "players"}
              </StatusChip>
              <StatusChip tone="dim">
                {staff.length} staff
              </StatusChip>
              {captain && <StatusChip tone="accent">© {captain.fullName}</StatusChip>}
            </div>
          </div>
        </div>
        <span
          aria-hidden
          className={`shrink-0 text-dim transition-transform duration-300 ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
      </button>

      {open && (
        <>
          {/* Staff */}
          <div className="border-t border-line/60 pt-4">
            <p className={labelCls}>Coaching staff</p>
            <div className="space-y-1.5">
              {staff.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-semibold text-ink">{s.name}</span>
                    <span className="ml-2 text-xs text-dim">
                      {STAFF_ROLE_LABEL[s.role]}
                    </span>
                  </span>
                  <RemoveButton onClick={() => remove("staff", s.id)} />
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <input
                className={inputCls}
                placeholder="Name"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
              />
              <select
                className={inputCls}
                value={sRole}
                onChange={(e) => setSRole(e.target.value as StaffRole)}
              >
                {Object.entries(STAFF_ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                disabled={sName.trim().length < 2}
                onClick={() => {
                  insert("staff", { teamId: team.id, name: sName.trim(), role: sRole });
                  setSName("");
                }}
              >
                Add staff
              </Button>
            </div>
          </div>

          {/* Players */}
          <div className="border-t border-line/60 pt-4">
            <p className={labelCls}>Players</p>
            <div className="space-y-1.5">
              {roster.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className="data-type grid h-7 w-9 shrink-0 place-items-center rounded-lg bg-line/40 text-[11px] font-bold text-dim"
                    >
                      #{p.jerseyNo}
                    </span>
                    <span className="truncate font-semibold text-ink">{p.fullName}</span>
                    <PositionTag position={p.position} short />
                    {p.isCaptain && (
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent ring-1 ring-accent/30"
                        title="Captain"
                      >
                        C
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        roster.forEach((q) =>
                          update("players", q.id, { isCaptain: q.id === p.id && !p.isCaptain }),
                        );
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-dim transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      {p.isCaptain ? "Unset captain" : "Make captain"}
                    </button>
                    <RemoveButton onClick={() => remove("players", p.id)} />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input
                className={`${inputCls} col-span-2`}
                placeholder="Full name"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
              />
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="Jersey #"
                value={pJersey}
                onChange={(e) => setPJersey(e.target.value)}
              />
              <select
                className={inputCls}
                value={pPosition}
                onChange={(e) => setPPosition(e.target.value as PlayerPosition)}
              >
                {POSITIONS_ALL.map((pos) => (
                  <option key={pos} value={pos}>
                    {POSITION_LABEL[pos]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                className={inputCls}
                placeholder="Height cm"
                value={pHeight}
                onChange={(e) => setPHeight(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Nationality"
                value={pNationality}
                onChange={(e) => setPNationality(e.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              className="mt-2"
              disabled={pName.trim().length < 2 || pJersey === ""}
              onClick={() => {
                insert("players", {
                  fullName: pName.trim(),
                  jerseyNo: Number(pJersey),
                  position: pPosition,
                  heightCm: pHeight ? Number(pHeight) : null,
                  nationality: pNationality.trim() || null,
                  photoUrl: null,
                  teamId: team.id,
                  isCaptain: false,
                });
                setPName("");
                setPJersey("");
                setPHeight("");
                setPNationality("");
              }}
            >
              Add player
            </Button>
          </div>

          <div className="border-t border-line/60 pt-3 text-right">
            <RemoveButton onClick={onRemove}>
              Remove team (and its players &amp; staff)
            </RemoveButton>
          </div>
        </>
      )}
    </Card>
  );
}
