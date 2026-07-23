import type {
  Court,
  Division,
  EventType,
  League,
  Match,
  MatchOfficial,
  MatchRosterEntry,
  MatchSet,
  OfficialRole,
  Player,
  PlayerPosition,
  Season,
  Staff,
  StaffRole,
  StatEvent,
  Team,
  Tournament,
  TournamentFormat,
  TournamentGroup,
  Venue,
} from "../types";

/**
 * Row <-> domain mappers. PostgreSQL is snake_case (supabase/schema.sql);
 * the frontend is camelCase (src/lib/types.ts). These functions are the
 * single place that translation happens, so the UI and the schema each
 * keep their idiomatic casing.
 *
 * Some domain objects (Team, Match, Player) embed child rows that live in
 * their own tables; the provider joins them and calls the `*WithChildren`
 * assemblers here.
 */

type Row = Record<string, unknown>;

const s = (v: unknown): string => (v == null ? "" : String(v));
const ns = (v: unknown): string | null => (v == null ? null : String(v));
const ni = (v: unknown): number | null => (v == null ? null : Number(v));

// ---------------------------------------------------------------------
// Collection (Db key) <-> table name
// ---------------------------------------------------------------------

/** Db collection key -> the Postgres table that backs it. */
export const TABLE_FOR_COLLECTION: Record<string, string> = {
  leagues: "leagues",
  seasons: "seasons",
  divisions: "divisions",
  tournaments: "tournaments",
  groups: "tournament_groups",
  venues: "venues",
  courts: "courts",
  teams: "teams",
  staff: "staff",
  players: "team_players", // read via roster_view; written across players + team_players
  matches: "matches",
  events: "stat_events",
};

/**
 * Which Db collections must be reloaded when a given table changes. A
 * table can feed more than one collection view (e.g. match_sets is part
 * of the embedded Match), and a change to a person/registration table
 * refreshes the flattened players collection.
 */
export const COLLECTIONS_FOR_TABLE: Record<string, string[]> = {
  leagues: ["leagues"],
  seasons: ["seasons"],
  divisions: ["divisions"],
  tournaments: ["tournaments"],
  tournament_groups: ["groups"],
  venues: ["venues"],
  courts: ["courts"],
  teams: ["teams"],
  team_honours: ["teams"],
  staff: ["staff"],
  players: ["players"],
  team_players: ["players"],
  matches: ["matches"],
  match_officials: ["matches"],
  match_sets: ["matches"],
  match_rosters: ["matches"],
  stat_events: ["events"],
};

/** Every table the realtime provider subscribes to. */
export const REALTIME_TABLES = Object.keys(COLLECTIONS_FOR_TABLE);

// ---------------------------------------------------------------------
// Simple entities
// ---------------------------------------------------------------------

export const leagueFromRow = (r: Row): League => ({
  id: s(r.id),
  name: s(r.name),
  logoUrl: ns(r.logo_url),
  status: (r.status as League["status"]) ?? "active",
});
export const leagueToRow = (l: Partial<League>): Row => ({
  ...(l.id !== undefined && { id: l.id }),
  ...(l.name !== undefined && { name: l.name }),
  ...(l.logoUrl !== undefined && { logo_url: l.logoUrl }),
  ...(l.status !== undefined && { status: l.status }),
});

export const seasonFromRow = (r: Row): Season => ({
  id: s(r.id),
  leagueId: s(r.league_id),
  name: s(r.name),
  startDate: ns(r.start_date),
  endDate: ns(r.end_date),
  status: (r.status as Season["status"]) ?? "upcoming",
});
export const seasonToRow = (x: Partial<Season>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.leagueId !== undefined && { league_id: x.leagueId }),
  ...(x.name !== undefined && { name: x.name }),
  ...(x.startDate !== undefined && { start_date: x.startDate }),
  ...(x.endDate !== undefined && { end_date: x.endDate }),
  ...(x.status !== undefined && { status: x.status }),
});

export const divisionFromRow = (r: Row): Division => ({
  id: s(r.id),
  seasonId: s(r.season_id),
  name: s(r.name),
});
export const divisionToRow = (x: Partial<Division>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.seasonId !== undefined && { season_id: x.seasonId }),
  ...(x.name !== undefined && { name: x.name }),
});

export const tournamentFromRow = (r: Row): Tournament => ({
  id: s(r.id),
  seasonId: s(r.season_id),
  divisionId: ns(r.division_id),
  name: s(r.name),
  logoUrl: ns(r.logo_url),
  organizer: ns(r.organizer),
  venueId: ns(r.venue_id),
  startDate: ns(r.start_date),
  endDate: ns(r.end_date),
  format: (r.format as TournamentFormat) ?? "LEAGUE",
  status: (r.status as Tournament["status"]) ?? "upcoming",
});
export const tournamentToRow = (x: Partial<Tournament>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.seasonId !== undefined && { season_id: x.seasonId }),
  ...(x.divisionId !== undefined && { division_id: x.divisionId }),
  ...(x.name !== undefined && { name: x.name }),
  ...(x.logoUrl !== undefined && { logo_url: x.logoUrl }),
  ...(x.organizer !== undefined && { organizer: x.organizer }),
  ...(x.venueId !== undefined && { venue_id: x.venueId }),
  ...(x.startDate !== undefined && { start_date: x.startDate }),
  ...(x.endDate !== undefined && { end_date: x.endDate }),
  ...(x.format !== undefined && { format: x.format }),
  ...(x.status !== undefined && { status: x.status }),
});

export const groupFromRow = (r: Row): TournamentGroup => ({
  id: s(r.id),
  tournamentId: s(r.tournament_id),
  name: s(r.name),
});
export const groupToRow = (x: Partial<TournamentGroup>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.tournamentId !== undefined && { tournament_id: x.tournamentId }),
  ...(x.name !== undefined && { name: x.name }),
});

export const venueFromRow = (r: Row): Venue => ({
  id: s(r.id),
  name: s(r.name),
  address: ns(r.address),
  city: ns(r.city),
  capacity: ni(r.capacity),
  mapUrl: ns(r.map_url),
});
export const venueToRow = (x: Partial<Venue>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.name !== undefined && { name: x.name }),
  ...(x.address !== undefined && { address: x.address }),
  ...(x.city !== undefined && { city: x.city }),
  ...(x.capacity !== undefined && { capacity: x.capacity }),
  ...(x.mapUrl !== undefined && { map_url: x.mapUrl }),
});

export const courtFromRow = (r: Row): Court => ({
  id: s(r.id),
  venueId: s(r.venue_id),
  name: s(r.name),
});
export const courtToRow = (x: Partial<Court>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.venueId !== undefined && { venue_id: x.venueId }),
  ...(x.name !== undefined && { name: x.name }),
});

export const staffFromRow = (r: Row): Staff => ({
  id: s(r.id),
  teamId: s(r.team_id),
  name: s(r.name),
  role: (r.role as StaffRole) ?? "MANAGER",
});
export const staffToRow = (x: Partial<Staff>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.teamId !== undefined && { team_id: x.teamId }),
  ...(x.name !== undefined && { name: x.name }),
  ...(x.role !== undefined && { role: x.role }),
});

// ---------------------------------------------------------------------
// Teams (+ embedded honours from team_honours)
// ---------------------------------------------------------------------

export function teamFromRow(r: Row, honourRows: Row[] = []): Team {
  return {
    id: s(r.id),
    name: s(r.name),
    shortName: s(r.short_name),
    logoUrl: ns(r.logo_url),
    city: ns(r.city),
    founded: ni(r.founded),
    honours: honourRows.map((h) => ({
      title: s(h.title),
      seasonLabel: s(h.season_label),
    })),
  };
}
/** Team columns only (honours are written to team_honours separately). */
export const teamToRow = (x: Partial<Team>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.name !== undefined && { name: x.name }),
  ...(x.shortName !== undefined && { short_name: x.shortName }),
  ...(x.logoUrl !== undefined && { logo_url: x.logoUrl }),
  ...(x.city !== undefined && { city: x.city }),
  ...(x.founded !== undefined && { founded: x.founded }),
});

// ---------------------------------------------------------------------
// Players (roster_view flatten; writes split person vs registration)
// ---------------------------------------------------------------------

export function playerFromRow(r: Row): Player {
  return {
    id: s(r.id), // team_players.id (registration id) — the app's Player.id
    fullName: s(r.full_name),
    jerseyNo: ni(r.jersey_no),
    position: (ns(r.position) as PlayerPosition | null) ?? null,
    heightCm: ni(r.height_cm),
    nationality: ns(r.nationality),
    photoUrl: ns(r.photo_url),
    teamId: s(r.team_id),
    isCaptain: Boolean(r.is_captain),
    isReserve: Boolean(r.is_reserve),
  };
}
/** roster_view exposes the person id as `person_id`. */
export const personIdFromRow = (r: Row): string | null => ns(r.person_id);

/** Person-table columns (players). */
export const playerPersonToRow = (x: Partial<Player>): Row => ({
  ...(x.fullName !== undefined && { full_name: x.fullName }),
  ...(x.heightCm !== undefined && { height_cm: x.heightCm }),
  ...(x.nationality !== undefined && { nationality: x.nationality }),
  ...(x.photoUrl !== undefined && { photo_url: x.photoUrl }),
});
/** Registration-table columns (team_players). */
export const playerRegistrationToRow = (x: Partial<Player>): Row => ({
  ...(x.teamId !== undefined && { team_id: x.teamId }),
  ...(x.jerseyNo !== undefined && { jersey_no: x.jerseyNo }),
  ...(x.position !== undefined && { position: x.position }),
  ...(x.isCaptain !== undefined && { is_captain: x.isCaptain }),
  ...(x.isReserve !== undefined && { is_reserve: x.isReserve }),
});

// ---------------------------------------------------------------------
// Matches (+ embedded officials / setScores / rosters)
// ---------------------------------------------------------------------

export const officialFromRow = (r: Row): MatchOfficial => ({
  name: s(r.name),
  role: r.role as OfficialRole,
});
export const setFromRow = (r: Row): MatchSet => ({
  setNo: Number(r.set_no),
  homePoints: Number(r.home_points),
  awayPoints: Number(r.away_points),
});
export const rosterFromRow = (r: Row): MatchRosterEntry => ({
  teamId: s(r.team_id),
  playerId: s(r.player_id),
  isStarter: Boolean(r.is_starter),
  isLibero: Boolean(r.is_libero),
});

export function matchFromRow(
  r: Row,
  officials: Row[] = [],
  sets: Row[] = [],
  rosters: Row[] = [],
): Match {
  return {
    id: s(r.id),
    tournamentId: s(r.tournament_id),
    groupId: ns(r.group_id),
    matchNo: ni(r.match_no),
    dateISO: s(r.date),
    time: ns(r.time),
    venueId: ns(r.venue_id),
    courtId: ns(r.court_id),
    homeTeamId: s(r.home_team_id),
    awayTeamId: s(r.away_team_id),
    status: (r.status as Match["status"]) ?? "scheduled",
    totalSets: Number(r.total_sets ?? 5),
    published: Boolean(r.published),
    winnerTeamId: ns(r.winner_team_id),
    officials: officials.map(officialFromRow),
    setScores: sets.map(setFromRow).sort((a, b) => a.setNo - b.setNo),
    rosters: rosters.map(rosterFromRow),
  };
}
/** matches columns only (children go to their own tables). */
export const matchToRow = (x: Partial<Match>): Row => ({
  ...(x.id !== undefined && { id: x.id }),
  ...(x.tournamentId !== undefined && { tournament_id: x.tournamentId }),
  ...(x.groupId !== undefined && { group_id: x.groupId }),
  ...(x.matchNo !== undefined && { match_no: x.matchNo }),
  ...(x.dateISO !== undefined && { date: x.dateISO }),
  ...(x.time !== undefined && { time: x.time }),
  ...(x.venueId !== undefined && { venue_id: x.venueId }),
  ...(x.courtId !== undefined && { court_id: x.courtId }),
  ...(x.homeTeamId !== undefined && { home_team_id: x.homeTeamId }),
  ...(x.awayTeamId !== undefined && { away_team_id: x.awayTeamId }),
  ...(x.status !== undefined && { status: x.status }),
  ...(x.totalSets !== undefined && { total_sets: x.totalSets }),
  ...(x.published !== undefined && { published: x.published }),
  ...(x.winnerTeamId !== undefined && { winner_team_id: x.winnerTeamId }),
});

// ---------------------------------------------------------------------
// Stat events (ts: epoch ms in the app <-> timestamptz in Postgres)
// ---------------------------------------------------------------------

export const statEventFromRow = (r: Row): StatEvent => ({
  id: s(r.id),
  matchId: s(r.match_id),
  teamId: s(r.team_id),
  playerId: s(r.player_id),
  setNo: Number(r.set_no),
  type: r.type as EventType,
  ts: r.ts ? new Date(String(r.ts)).getTime() : Date.now(),
});
export const statEventToRow = (e: Partial<StatEvent>): Row => ({
  ...(e.id !== undefined && { id: e.id }),
  ...(e.matchId !== undefined && { match_id: e.matchId }),
  ...(e.teamId !== undefined && { team_id: e.teamId }),
  ...(e.playerId !== undefined && { player_id: e.playerId }),
  ...(e.setNo !== undefined && { set_no: e.setNo }),
  ...(e.type !== undefined && { type: e.type }),
  ...(e.ts !== undefined && { ts: new Date(e.ts).toISOString() }),
});
