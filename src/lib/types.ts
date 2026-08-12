/**
 * VolleyVerse domain types — professional league management platform.
 *
 * These interfaces mirror the relational schema in supabase/schema.sql
 * 1:1 (camelCase ↔ snake_case). Player/Match embed a few child rows
 * (set scores, rosters, officials) that live in their own tables in
 * PostgreSQL; the provider layer is responsible for the join.
 *
 * Architecture note: StatEvent remains the single source of truth.
 * Every statistic shown anywhere — match stats, standings, records —
 * is DERIVED from events + set scores in metrics.ts, never stored by hand.
 */

// ---------------------------------------------------------------------
// People & positions
// ---------------------------------------------------------------------

/** Standard indoor volleyball positions. */
/**
 * `U` (Universal) is how Indian league sheets label an all-round attacker who
 * is not pinned to the opposite slot. It is kept distinct from `OPP` because
 * the team sheets we load say "Universal", and collapsing the two would put a
 * label on a player that their own club did not give them.
 */
export type PlayerPosition = "OH" | "OPP" | "MB" | "S" | "L" | "DS" | "U";

export const POSITION_LABEL: Record<PlayerPosition, string> = {
  OH: "Outside Hitter",
  OPP: "Opposite",
  MB: "Middle Blocker",
  S: "Setter",
  L: "Libero",
  DS: "Defensive Specialist",
  U: "Universal",
};

export const POSITIONS_ALL: PlayerPosition[] = ["OH", "OPP", "MB", "S", "L", "DS", "U"];

/**
 * Denormalized roster row the UI consumes: players ⋈ team_players.
 * In PostgreSQL, person data (name, height, nationality) lives in
 * `players` and per-team registration (team, jersey, captaincy) in
 * `team_players`; the provider flattens them into this shape.
 */
export interface Player {
  id: string;
  fullName: string;
  /** Squad number. `null` when the source doesn't list one ("Not listed"). */
  jerseyNo: number | null;
  /** On-court role. `null` when unknown — shown as "Not listed", never guessed. */
  position: PlayerPosition | null;
  heightCm: number | null;
  nationality: string | null;
  photoUrl: string | null;
  teamId: string;
  isCaptain: boolean;
  /** Registered as a reserve/standby rather than a main-squad player. */
  isReserve: boolean;
}

export type StaffRole = "HEAD_COACH" | "ASSISTANT_COACH" | "MANAGER" | "PHYSIO" | "ANALYST";

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  HEAD_COACH: "Head Coach",
  ASSISTANT_COACH: "Assistant Coach",
  MANAGER: "Team Manager",
  PHYSIO: "Physiotherapist",
  ANALYST: "Performance Analyst",
};

export interface Staff {
  id: string;
  teamId: string;
  name: string;
  role: StaffRole;
}

// ---------------------------------------------------------------------
// Competition structure: League → Season → Tournament → Match
// ---------------------------------------------------------------------

export interface League {
  id: string;
  name: string;
  logoUrl: string | null;
  status: "active" | "archived";
}

export interface Season {
  id: string;
  leagueId: string;
  name: string; // e.g. "2026–27"
  startDate: string | null; // yyyy-mm-dd
  endDate: string | null;
  status: "upcoming" | "active" | "completed";
}

export interface Division {
  id: string;
  seasonId: string;
  name: string; // e.g. "Division 1", "Women's Premier"
}

export type TournamentFormat = "LEAGUE" | "GROUPS_KNOCKOUT" | "KNOCKOUT";

export interface Tournament {
  id: string;
  seasonId: string;
  divisionId: string | null;
  name: string;
  logoUrl: string | null;
  organizer: string | null;
  venueId: string | null; // primary venue; matches may override
  startDate: string | null;
  endDate: string | null;
  format: TournamentFormat;
  status: "upcoming" | "active" | "completed";
}

/** Group inside a GROUPS_KNOCKOUT tournament (e.g. "Pool A"). */
export interface TournamentGroup {
  id: string;
  tournamentId: string;
  name: string;
}

// ---------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  capacity: number | null;
  /** Map link or lat,lng — presentation decides. */
  mapUrl: string | null;
}

export interface Court {
  id: string;
  venueId: string;
  name: string; // e.g. "Court 1", "Centre Court"
}

// ---------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------

export interface Honour {
  title: string;
  seasonLabel: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string; // e.g. "MUM" or "Mumbai"
  logoUrl: string | null;
  city: string | null;
  founded: number | null;
  honours: Honour[];
}

// ---------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------

export type MatchStatus = "scheduled" | "live" | "completed" | "postponed" | "cancelled";

export type OfficialRole = "FIRST_REFEREE" | "SECOND_REFEREE" | "SCORER" | "LINE_JUDGE";

export const OFFICIAL_ROLE_LABEL: Record<OfficialRole, string> = {
  FIRST_REFEREE: "1st Referee",
  SECOND_REFEREE: "2nd Referee",
  SCORER: "Scorer",
  LINE_JUDGE: "Line Judge",
};

/** match_officials table row (embedded on Match by the provider). */
export interface MatchOfficial {
  name: string;
  role: OfficialRole;
}

/** match_sets table row — persisted final score of a completed set. */
export interface MatchSet {
  setNo: number; // 1-based
  homePoints: number;
  awayPoints: number;
}

/**
 * match_rosters table row — who is registered on the scoresheet for one
 * side of one match. Starters vs bench is a per-match decision.
 */
export interface MatchRosterEntry {
  teamId: string;
  playerId: string;
  isStarter: boolean;
  isLibero: boolean;
}

export interface Match {
  id: string;
  tournamentId: string;
  groupId: string | null;
  /** Official match number within the tournament (e.g. 14). */
  matchNo: number | null;
  dateISO: string; // yyyy-mm-dd
  time: string | null; // HH:mm local
  venueId: string | null;
  courtId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: MatchStatus;
  /** Best-of sets (3 or 5). */
  totalSets: number;
  /** Publish boundary: nothing is publicly visible unless true. */
  published: boolean;
  winnerTeamId: string | null;
  officials: MatchOfficial[];
  setScores: MatchSet[];
  rosters: MatchRosterEntry[];
}

// ---------------------------------------------------------------------
// Stat events — the single source of truth for all statistics
// ---------------------------------------------------------------------

/**
 * Courtside taps — contact outcomes. Every statistic (attack %, service %,
 * reception %, standings tie-breaks, season records) derives from these.
 */
export type EventType =
  // Attack. A kill and a tool are both points and both attempts, but they are
  // different skills — one was too powerful to stop, the other turned the
  // blocker into the scorer — so they are counted apart.
  | "SPIKE_POINT" // kill — the attack scored on its own
  | "SPIKE_TOOL" // tool / block-out — scored off the opponent's block
  | "SPIKE_IN" // attack kept in play
  | "SPIKE_ERR" // attack error — the spiker's own miss (net or out)
  | "SPIKE_BLOCKED" // the block stopped it. NOT rally-ending: see BLOCK_WIN
  // Reception
  | "RECV_PERFECT" // ideal ball to the setter
  | "RECV_GOOD" // setter can run the offence
  | "RECV_POOR" // in play but limits attack options
  | "RECV_ERR" // reception error — point to server
  // Setting
  | "SET_ASSIST" // set that led directly to a point
  | "SET_GOOD" // accurate set, no direct point
  | "SET_ERR" // setting error
  // Blocking
  | "BLOCK_WIN" // kill block
  | "BLOCK_MISS" // block attempt beaten
  | "BLOCK_TOOLED" // the spiker used this blocker to score. NOT rally-ending
  // Serving
  | "SERVE_ACE" // untouched serve, instant point
  | "SERVE_IN" // serve in play
  | "SERVE_ERR" // service error
  // Defence
  | "DIG_SUPER" // extraordinary save
  | "DIG_SAVE" // ball kept alive
  | "DIG_FAIL" // ball hits the floor
  // Faults — points conceded with no serve or spike behind them.
  // Deliberately NOT SPIKE_ERR: error rate is SPIKE_ERR / spike attempts,
  // and a net touch is not a spike attempt.
  | "FAULT_NET" // touched the net
  | "FAULT_FOUR_HITS" // four contacts on one side
  | "FAULT_DOUBLE" // double contact / lift
  | "FAULT_ROTATION"; // out of rotation at service

export interface StatEvent {
  id: string;
  matchId: string;
  /** Which side produced the contact — every event belongs to a real team. */
  teamId: string;
  playerId: string;
  setNo: number; // 1-based
  type: EventType;
  ts: number; // epoch ms — preserves entry order for undo
  /**
   * The opponent on the other end of a duel, when the contact had one: the
   * blocker on a SPIKE_TOOL/SPIKE_BLOCKED, the spiker on a
   * BLOCK_WIN/BLOCK_TOOLED. `undefined` on everything else, and on the
   * BLOCK_WINs the phase-based tracker logs — it never asks who was hitting.
   *
   * A block is the one act in volleyball that is decided between two named
   * players, so the pairing is stored rather than guessed from timestamps.
   * Every spiker-vs-blocker matchup in the app is derived from this field.
   */
  vsPlayerId?: string | null;
}

// ---------------------------------------------------------------------
// Local database shape (the LocalProvider's persisted document).
// Each array corresponds to a PostgreSQL table.
// ---------------------------------------------------------------------

export interface Db {
  leagues: League[];
  seasons: Season[];
  divisions: Division[];
  tournaments: Tournament[];
  groups: TournamentGroup[];
  venues: Venue[];
  courts: Court[];
  teams: Team[];
  staff: Staff[];
  players: Player[];
  matches: Match[];
  events: StatEvent[];
}

export const EMPTY_DB: Db = {
  leagues: [],
  seasons: [],
  divisions: [],
  tournaments: [],
  groups: [],
  venues: [],
  courts: [],
  teams: [],
  staff: [],
  players: [],
  matches: [],
  events: [],
};
