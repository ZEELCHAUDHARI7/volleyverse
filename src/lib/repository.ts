import type {
  Db,
  EventType,
  Match,
  MatchOfficial,
  MatchRosterEntry,
  MatchSet,
  StatEvent,
} from "./types";

/**
 * REPOSITORY BOUNDARY
 *
 * The UI talks only to this surface. Two implementations are planned:
 *
 *  - LocalProvider (src/lib/store.tsx): localStorage-backed, offline-first.
 *    Doubles as the courtside entry queue — taps persist within ~100ms
 *    regardless of connectivity. Ships today.
 *
 *  - SupabaseProvider (src/lib/providers/supabase.ts): PostgreSQL via
 *    Supabase, realtime channels replacing the cross-tab storage event,
 *    RLS enforcing the publish boundary. Stubbed, pending backend setup.
 *
 * Swapping providers must require no screen changes.
 */

/** Every entity row is identified by a string id. */
export type Row = { id: string };

/** Collections of Db that support generic CRUD. */
export type Collection = keyof Db;

export interface DataProvider {
  /** Snapshot of all data in scope. Supabase: replaced by scoped queries. */
  db: Db;
  /** False until the initial load completes (avoids hydration flicker). */
  ready: boolean;

  // ---- Generic entity CRUD (leagues, seasons, tournaments, venues,
  //      courts, teams, staff, players, divisions, groups) ----
  insert: <K extends Collection>(collection: K, row: Omit<Db[K][number], "id">) => Db[K][number];
  update: <K extends Collection>(collection: K, id: string, patch: Partial<Db[K][number]>) => void;
  remove: (collection: Collection, id: string) => void;

  // ---- Match lifecycle ----
  createMatch: (
    m: Omit<Match, "id" | "status" | "published" | "winnerTeamId" | "setScores">,
  ) => Match;
  startMatch: (matchId: string) => void;
  /** Persist a finished set's score (match_sets row). */
  recordSetScore: (matchId: string, set: MatchSet) => void;
  completeMatch: (matchId: string, winnerTeamId: string | null) => void;
  setPublished: (matchId: string, published: boolean) => void;
  setRosters: (matchId: string, rosters: MatchRosterEntry[]) => void;
  setOfficials: (matchId: string, officials: MatchOfficial[]) => void;

  // ---- Stat events (append-only + undo) ----
  addEvent: (
    matchId: string,
    teamId: string,
    playerId: string,
    setNo: number,
    type: EventType,
  ) => StatEvent;
  removeEvent: (eventId: string) => void;
  /** Post-match correction: remove the most recent event of a type. */
  removeLatestOfType: (matchId: string, playerId: string, type: EventType) => void;
}
