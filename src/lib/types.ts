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

/** Courtside taps per role — exactly three outcomes each (2-tap flow). */
export type EventType =
  // Spiker
  | "SPIKE_POINT" // successful spike that scored
  | "SPIKE_IN" // successful spike, rally continued
  | "SPIKE_ERR" // attempt failed (out / blocked / net)
  // Setter
  | "SET_ASSIST" // set that led directly to a point
  | "SET_GOOD" // accurate set, no direct point
  | "SET_ERR" // inaccurate set
  // Centre
  | "BLOCK_WIN" // successful block
  | "BLOCK_MISS" // block attempt beaten
  | "DIG_SAVE"; // defensive point saved

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
}

export interface StatEvent {
  id: string;
  matchId: string;
  playerId: string;
  set: number; // 1-based
  type: EventType;
  ts: number; // epoch ms — preserves entry order for undo
}

export interface Db {
  players: Player[];
  matches: Match[];
  events: StatEvent[];
}
