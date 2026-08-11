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

/**
 * Live connection/sync state, surfaced to the UI so it can show a
 * loading/sync indicator (Issue #3 requirement).
 *
 *  - `local`      — offline-first LocalProvider; no server to sync with.
 *  - `connecting` — initial load / opening the realtime socket.
 *  - `synced`     — connected, all local writes acknowledged by the server.
 *  - `syncing`    — connected, writes in flight (optimistic UI already updated).
 *  - `offline`    — no connection; writes are queued and will flush on reconnect.
 *  - `error`      — the DATABASE refused a write. Retrying cannot fix it; the
 *                   row is lost unless a human changes the schema or the data.
 *                   This must be loud: the optimistic UI already showed the tap
 *                   landing, so a silent failure looks exactly like success.
 */
export type SyncStatus =
  | "local"
  | "connecting"
  | "synced"
  | "syncing"
  | "offline"
  | "error";

export interface DataProvider {
  /** Snapshot of all data in scope. Supabase: replaced by scoped queries. */
  db: Db;
  /** False until the initial load completes (avoids hydration flicker). */
  ready: boolean;
  /** Live sync state for the sync indicator. `local` when server-less. */
  syncStatus: SyncStatus;
  /**
   * Human-readable description of the last write the database REFUSED, or
   * null. Never silently swallowed: a rejected write means data the collector
   * believes they saved does not exist on the server.
   */
  lastError: string | null;
  /** How many refused writes are parked on this device awaiting a retry. */
  rejectedCount: number;
  /** Discard the parked rejected writes and clear `lastError`. */
  clearErrors: () => void;
  /**
   * Put the parked writes back on the queue and try them again — the path
   * back after a human fixes the cause (a missing migration, closed RLS).
   * Safe to call repeatedly: every queued write is an upsert by primary key
   * or an append of a client-minted id, so replaying one that already landed
   * changes nothing. Refused again, they are simply parked again.
   */
  retryRejected: () => void;

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
  /** Persist a finished set's score (match_sets row). Upserts by set number. */
  recordSetScore: (matchId: string, set: MatchSet) => void;
  /**
   * Replace a match's whole set-score list — the post-match correction path.
   * Unlike `recordSetScore` this can also REMOVE a set (leave it out of the
   * array), which matters when a set was banked by mistake, or when a match
   * ended with no scores at all and they have to be typed in.
   */
  setSetScores: (matchId: string, sets: MatchSet[]) => void;
  completeMatch: (matchId: string, winnerTeamId: string | null) => void;
  /**
   * Permanently delete a match and everything derived from it. Because all
   * statistics are event-sourced, removing the match row plus its stat_events
   * erases scores, events, statistics and analytics in one operation — there
   * is no hand-stored aggregate left behind. In PostgreSQL this is a single
   * DELETE on `matches` with `ON DELETE CASCADE` fanning out to match_sets,
   * match_rosters, match_officials and stat_events.
   */
  deleteMatch: (matchId: string) => void;
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
