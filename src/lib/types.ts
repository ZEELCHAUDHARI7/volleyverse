/**
 * VolleyVerse domain types.
 *
 * Architecture note: StatEvent is the single source of truth (FR5).
 * Every number shown anywhere is DERIVED from events in metrics.ts —
 * success rates, points, impact are never stored by hand.
 * This is also what makes the future Supabase swap clean: the tables
 * mirror these types 1:1, and RLS enforces the publish boundary.
 */

export type Role = "SPIKER" | "SETTER" | "CENTRE";

export const ROLE_LABEL: Record<Role, string> = {
  SPIKER: "Spiker",
  SETTER: "Setter",
  CENTRE: "Centre",
};

/**
 * Courtside taps — role outcomes plus universal Serve/Defence sections
 * (every player serves in rotation; anyone can dig). Still 2 taps:
 * the outcome sheet groups sections, it never adds a screen.
 */
export type EventType =
  // Spiker
  | "SPIKE_POINT" // successful spike that scored
  | "SPIKE_IN" // successful spike, rally continued
  | "SPIKE_ERR" // attempt failed (out / blocked / net)
  // Receive — universal (Rally Tracker Action 2). Quality of first contact
  // off the opponent serve; feeds the Libero/Defender pass-quality stats.
  | "RECV_PERFECT" // ideal ball to the setter
  | "RECV_GOOD" // setter can run the offence
  | "RECV_POOR" // in play but limits attack options
  | "RECV_ERR" // ball lost off the serve — point to server
  // Setter
  | "SET_ASSIST" // set that led directly to a point
  | "SET_GOOD" // accurate set, no direct point
  | "SET_ERR" // inaccurate set
  // Centre
  | "BLOCK_WIN" // successful block
  | "BLOCK_MISS" // block attempt beaten
  // Serve — universal ("Easy Serve" deliberately folded into SERVE_IN:
  // ace/error are objective, easy-vs-pressure is a courtside judgment call)
  | "SERVE_ACE" // untouched serve, instant point — the drama stat
  | "SERVE_IN" // serve in play
  | "SERVE_ERR" // out / net
  // Defence — universal
  | "DIG_SUPER" // extraordinary save against all odds — the highlight stat
  | "DIG_SAVE" // ball kept alive normally
  | "DIG_FAIL"; // ball hits the floor

export interface Player {
  id: string;
  name: string;
  jersey: number;
  role: Role;
  heightM: number;
  /** Max reach above ground (m). Player ATTRIBUTE, not per-match entry — see Phase 5 open question. */
  reachM: number;
}

export type MatchStatus = "live" | "completed";

/**
 * Opponent player — per-match manual entry (name is all we ask courtside).
 * Lives on the Match, not in the club roster: opponents change every game
 * and never appear in the public showcase. Their StatEvents (flagged
 * `opp: true`) enable post-match scouting reports without touching any
 * Guardians analytics, which all aggregate per roster player.
 */
export interface OppPlayer {
  id: string; // `${matchId}_oppN` — unique across matches
  name: string;
}

export interface Match {
  id: string;
  opponent: string;
  dateISO: string; // yyyy-mm-dd
  venue: string;
  totalSets: number;
  status: MatchStatus;
  /** Publish boundary: nothing is publicly visible unless true (FR4). */
  published: boolean;
  /** Players registered for this match (roles can flex per match — FR6). */
  roster: string[];
  /** Opponent's on-court players, entered at match setup (optional — older matches predate this). */
  oppPlayers?: OppPlayer[];
}

export interface StatEvent {
  id: string;
  matchId: string;
  playerId: string;
  set: number; // 1-based
  type: EventType;
  ts: number; // epoch ms — preserves entry order for undo
  /** True when playerId is an opponent player. Guardians metrics filter by
   * roster ids anyway; this flag exists so season records skip them cheaply. */
  opp?: boolean;
}

export interface Db {
  players: Player[];
  matches: Match[];
  events: StatEvent[];
}
