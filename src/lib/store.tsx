"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Db,
  Match,
  MatchRosterEntry,
  Player,
  StatEvent,
} from "./types";
import { EMPTY_DB } from "./types";
import type { Collection, DataProvider } from "./repository";
import { isSupabaseConfigured } from "./providers/supabase-client";
import { useSupabaseBackend } from "./providers/supabase-store";

/**
 * LocalProvider — localStorage-backed implementation of DataProvider.
 *
 * The UI talks only to this repository surface; swapping in the
 * SupabaseProvider later means replacing load/persist with queries and
 * the storage event with realtime channels. No screen changes.
 *
 * The database starts EMPTY. All leagues, teams, players, venues and
 * matches are created through the console — there is no seed data.
 */

// v3: league-platform data model (two real teams per match, persisted
// set scores, standard positions). Bump intentionally discards v2
// prototype data — see REFACTOR_AUDIT.md, risk #2.
const KEY = "volleyverse:db:v3";

function load(): Db {
  if (typeof window === "undefined") return EMPTY_DB;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...EMPTY_DB, ...(JSON.parse(raw) as Partial<Db>) };
  } catch {
    // corrupted storage → start clean
  }
  return EMPTY_DB;
}

function persist(db: Db) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // storage full/unavailable — data stays in memory for the session
  }
}

const StoreContext = createContext<DataProvider | null>(null);

/**
 * StoreProvider — chooses the backend once, at module scope, from the
 * environment:
 *
 *   - Supabase configured  → cloud, multi-user realtime (SupabaseBackend).
 *   - otherwise            → offline-first localStorage (LocalStoreProvider).
 *
 * The branch is stable across renders (env vars don't change at runtime),
 * so each subtree calls a consistent set of hooks. Consumers use the
 * identical `useStore()` surface either way — that's the repository
 * contract (src/lib/repository.ts): swapping providers needs no screen
 * changes.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured()) {
    return <SupabaseStoreProvider>{children}</SupabaseStoreProvider>;
  }
  return <LocalStoreProvider>{children}</LocalStoreProvider>;
}

/** Cloud backend: Postgres source of truth + realtime across all users. */
function SupabaseStoreProvider({ children }: { children: React.ReactNode }) {
  const api = useSupabaseBackend();
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

function LocalStoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Db>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const idCounter = useRef(0);

  useEffect(() => {
    setDb(load());
    setReady(true);
  }, []);

  // Cross-tab sync: the console tab writes, public tabs follow instantly.
  // localStorage fires `storage` in every OTHER tab of the same browser —
  // the local-first stand-in for the future Supabase realtime channel.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue == null) return;
      try {
        setDb({ ...EMPTY_DB, ...(JSON.parse(e.newValue) as Partial<Db>) });
      } catch {
        // partial write / corrupt payload — keep current state
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateDb = useCallback((fn: (prev: Db) => Db) => {
    setDb((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const newId = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${(idCounter.current++).toString(36)}`;

  const patchMatch = (matchId: string, patch: (m: Match) => Match) =>
    updateDb((prev) => ({
      ...prev,
      matches: prev.matches.map((m) => (m.id === matchId ? patch(m) : m)),
    }));

  const api: DataProvider = {
    ready,
    db,
    // No server to reconcile with: cross-tab sync is instant and local.
    syncStatus: "local",
    // Nothing can refuse a write here — localStorage takes whatever it is given.
    lastError: null,
    rejectedCount: 0,
    clearErrors: () => {},
    retryRejected: () => {},

    insert: (collection, row) => {
      const withId = { ...row, id: newId(String(collection).slice(0, 2)) } as Db[typeof collection][number];
      updateDb((prev) => ({
        ...prev,
        [collection]: [...prev[collection], withId],
      }));
      return withId;
    },
    update: (collection, id, patch) =>
      updateDb((prev) => ({
        ...prev,
        [collection]: (prev[collection] as { id: string }[]).map((r) =>
          r.id === id ? { ...r, ...patch } : r,
        ),
      })),
    remove: (collection: Collection, id: string) =>
      updateDb((prev) => ({
        ...prev,
        [collection]: (prev[collection] as { id: string }[]).filter((r) => r.id !== id),
      })),

    createMatch: (m) => {
      const match: Match = {
        ...m,
        id: newId("m"),
        status: "scheduled",
        published: false,
        winnerTeamId: null,
        setScores: [],
      };
      updateDb((prev) => ({ ...prev, matches: [...prev.matches, match] }));
      return match;
    },
    startMatch: (matchId) =>
      patchMatch(matchId, (m) => ({ ...m, status: "live" as const })),
    recordSetScore: (matchId, set) =>
      patchMatch(matchId, (m) => ({
        ...m,
        setScores: [...m.setScores.filter((s) => s.setNo !== set.setNo), set].sort(
          (a, b) => a.setNo - b.setNo,
        ),
      })),
    setSetScores: (matchId, sets) =>
      patchMatch(matchId, (m) => ({
        ...m,
        setScores: [...sets].sort((a, b) => a.setNo - b.setNo),
      })),
    completeMatch: (matchId, winnerTeamId) =>
      patchMatch(matchId, (m) => ({
        ...m,
        status: "completed" as const,
        winnerTeamId,
      })),
    deleteMatch: (matchId) =>
      // Event-sourced cascade: drop the match row AND every stat_event that
      // belongs to it. Set scores, rosters and officials live on the match
      // row, so they go with it; nothing derived survives.
      updateDb((prev) => ({
        ...prev,
        matches: prev.matches.filter((m) => m.id !== matchId),
        events: prev.events.filter((e) => e.matchId !== matchId),
      })),
    setPublished: (matchId, published) =>
      patchMatch(matchId, (m) => ({ ...m, published })),
    setRosters: (matchId, rosters: MatchRosterEntry[]) =>
      patchMatch(matchId, (m) => ({ ...m, rosters })),
    setOfficials: (matchId, officials) =>
      patchMatch(matchId, (m) => ({ ...m, officials })),

    addEvent: (matchId, teamId, playerId, setNo, type, vsPlayerId) => {
      const e: StatEvent = {
        id: newId("e"),
        matchId,
        teamId,
        playerId,
        setNo,
        type,
        ts: Date.now(),
        // null, not undefined, so JSON.stringify keeps the key: a persisted
        // event that lost the field would read as "never asked" rather than
        // "asked, nobody there".
        vsPlayerId: vsPlayerId ?? null,
      };
      updateDb((prev) => ({ ...prev, events: [...prev.events, e] }));
      return e;
    },
    removeEvent: (eventId) =>
      updateDb((prev) => ({
        ...prev,
        events: prev.events.filter((e) => e.id !== eventId),
      })),
    removeLatestOfType: (matchId, playerId, type) =>
      updateDb((prev) => {
        const idx = [...prev.events]
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.matchId === matchId && e.playerId === playerId && e.type === type)
          .map(({ i }) => i)
          .pop();
        if (idx === undefined) return prev;
        const events = [...prev.events];
        events.splice(idx, 1);
        return { ...prev, events };
      }),
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): DataProvider {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

// ---- Convenience selectors ----

export interface MatchContext {
  match: Match | undefined;
  homeTeam: ReturnType<typeof findTeam>;
  awayTeam: ReturnType<typeof findTeam>;
  homeRoster: Player[];
  awayRoster: Player[];
  events: StatEvent[];
}

function findTeam(db: Db, id: string | undefined) {
  return db.teams.find((t) => t.id === id);
}

/** Everything one match screen needs: both teams, both rosters, events. */
export function useMatch(matchId: string): MatchContext {
  const { db } = useStore();
  const match = db.matches.find((m) => m.id === matchId);
  const rosterFor = (teamId: string | undefined): Player[] => {
    if (!match || !teamId) return [];
    const ids = new Set(
      match.rosters.filter((r) => r.teamId === teamId).map((r) => r.playerId),
    );
    // Fall back to the full team roster when no match roster was set.
    return ids.size > 0
      ? db.players.filter((p) => ids.has(p.id))
      : db.players.filter((p) => p.teamId === teamId);
  };
  return {
    match,
    homeTeam: findTeam(db, match?.homeTeamId),
    awayTeam: findTeam(db, match?.awayTeamId),
    homeRoster: rosterFor(match?.homeTeamId),
    awayRoster: rosterFor(match?.awayTeamId),
    events: db.events.filter((e) => e.matchId === matchId),
  };
}

/** Active league context: first active league, its seasons/tournaments. */
export function useActiveLeague() {
  const { db } = useStore();
  const league = db.leagues.find((l) => l.status === "active") ?? db.leagues[0];
  const seasons = league ? db.seasons.filter((s) => s.leagueId === league.id) : [];
  const season =
    seasons.find((s) => s.status === "active") ?? seasons[seasons.length - 1];
  const tournaments = season
    ? db.tournaments.filter((t) => t.seasonId === season.id)
    : [];
  return { league, season, tournaments };
}
