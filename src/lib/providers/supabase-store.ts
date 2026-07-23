"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Db,
  Match,
  MatchOfficial,
  MatchRosterEntry,
  MatchSet,
  Player,
  StatEvent,
} from "../types";
import { EMPTY_DB } from "../types";
import type { Collection, DataProvider, SyncStatus } from "../repository";
import { getSupabase } from "./supabase-client";
import * as M from "./mappers";

type Row = Record<string, unknown>;

/** A durable, serialisable write. Queued when offline; flushed on reconnect. */
type PendingOp =
  | { kind: "upsert"; table: string; row: Row; onConflict?: string }
  | { kind: "delete"; table: string; match: Row };

const QUEUE_KEY = "volleyverse:sync-queue:v1";

/** Group child rows by a foreign-key column. */
function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[key]);
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  return m;
}

const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

/**
 * SUPABASE BACKEND — the cloud, multi-user implementation of DataProvider.
 *
 * Contract (src/lib/repository.ts): identical surface to the LocalProvider,
 * so no screen changes. Differences are all under the hood:
 *
 *   Reads   — one initial load assembles the whole Db snapshot; thereafter
 *             Postgres realtime pushes drive debounced per-collection
 *             reloads, so every connected user converges on the server.
 *   Writes  — optimistic: local state updates immediately, then the write
 *             goes to Postgres. The realtime echo reconciles. Ids are minted
 *             client-side (uuid) so the synchronous return contract holds.
 *   Offline — failed/at-rest writes are queued (durable in localStorage) and
 *             flushed in order on reconnect. Append-only stat_events plus
 *             upsert-by-key mutations make replay idempotent and conflict-safe.
 */
export function useSupabaseBackend(): DataProvider {
  const supabase = getSupabase();
  const [db, setDb] = useState<Db>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  const dbRef = useRef<Db>(db);
  dbRef.current = db;

  // ---- durable offline queue ----
  const queueRef = useRef<PendingOp[]>([]);
  const flushingRef = useRef(false);

  const persistQueue = useCallback(() => {
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queueRef.current));
    } catch {
      /* storage full — queue stays in memory for the session */
    }
    setPending(queueRef.current.length);
  }, []);

  const execOp = useCallback(
    async (op: PendingOp): Promise<void> => {
      if (!supabase) throw new Error("no client");
      if (op.kind === "upsert") {
        const { error } = await supabase
          .from(op.table)
          .upsert(op.row, op.onConflict ? { onConflict: op.onConflict } : undefined);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(op.table).delete().match(op.match);
        if (error) throw error;
      }
    },
    [supabase],
  );

  const flush = useCallback(async () => {
    if (flushingRef.current || !supabase) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    flushingRef.current = true;
    try {
      while (queueRef.current.length) {
        const op = queueRef.current[0];
        try {
          await execOp(op);
        } catch {
          // Network/permission failure — stop; reconnect handler retries.
          setOnline(false);
          break;
        }
        queueRef.current.shift();
        persistQueue();
      }
      if (queueRef.current.length === 0) setOnline(true);
    } finally {
      flushingRef.current = false;
    }
  }, [execOp, persistQueue, supabase]);

  const enqueue = useCallback(
    (...ops: PendingOp[]) => {
      queueRef.current.push(...ops);
      persistQueue();
      void flush();
    },
    [flush, persistQueue],
  );

  // ---- collection loaders ----
  // Each returns the fresh domain array for its collection(s). Reloading a
  // whole collection on every relevant realtime event trades a little
  // bandwidth for guaranteed convergence with the server — no fiddly
  // incremental patching to drift out of sync.

  const loadTeams = useCallback(async (): Promise<Db["teams"]> => {
    if (!supabase) return [];
    const [{ data: teams }, { data: honours }] = await Promise.all([
      supabase.from("teams").select("*"),
      supabase.from("team_honours").select("*"),
    ]);
    const byTeam = groupBy((honours ?? []) as Row[], "team_id");
    return ((teams ?? []) as Row[]).map((t) =>
      M.teamFromRow(t, byTeam.get(String(t.id)) ?? []),
    );
  }, [supabase]);

  const loadPlayers = useCallback(async (): Promise<Player[]> => {
    if (!supabase) return [];
    const { data } = await supabase.from("roster_view").select("*");
    return ((data ?? []) as Row[]).map(M.playerFromRow);
  }, [supabase]);

  const loadMatches = useCallback(async (): Promise<Match[]> => {
    if (!supabase) return [];
    const [m, off, sets, rosters] = await Promise.all([
      supabase.from("matches").select("*"),
      supabase.from("match_officials").select("*"),
      supabase.from("match_sets").select("*"),
      supabase.from("match_rosters").select("*"),
    ]);
    const offBy = groupBy((off.data ?? []) as Row[], "match_id");
    const setBy = groupBy((sets.data ?? []) as Row[], "match_id");
    const rosBy = groupBy((rosters.data ?? []) as Row[], "match_id");
    return ((m.data ?? []) as Row[]).map((r) =>
      M.matchFromRow(
        r,
        offBy.get(String(r.id)) ?? [],
        setBy.get(String(r.id)) ?? [],
        rosBy.get(String(r.id)) ?? [],
      ),
    );
  }, [supabase]);

  const loadSimple = useCallback(
    async <K extends Collection>(
      collection: K,
      fromRow: (r: Row) => Db[K][number],
    ): Promise<Db[K][number][]> => {
      if (!supabase) return [];
      const table = M.TABLE_FOR_COLLECTION[collection];
      const { data } = await supabase.from(table).select("*");
      return ((data ?? []) as Row[]).map(fromRow);
    },
    [supabase],
  );

  const reload = useCallback(
    async (collection: Collection) => {
      const set = (patch: Partial<Db>) => setDb((prev) => ({ ...prev, ...patch }));
      switch (collection) {
        case "teams":
          return set({ teams: await loadTeams() });
        case "players":
          return set({ players: await loadPlayers() });
        case "matches":
          return set({ matches: await loadMatches() });
        case "leagues":
          return set({ leagues: await loadSimple("leagues", M.leagueFromRow) });
        case "seasons":
          return set({ seasons: await loadSimple("seasons", M.seasonFromRow) });
        case "divisions":
          return set({ divisions: await loadSimple("divisions", M.divisionFromRow) });
        case "tournaments":
          return set({ tournaments: await loadSimple("tournaments", M.tournamentFromRow) });
        case "groups":
          return set({ groups: await loadSimple("groups", M.groupFromRow) });
        case "venues":
          return set({ venues: await loadSimple("venues", M.venueFromRow) });
        case "courts":
          return set({ courts: await loadSimple("courts", M.courtFromRow) });
        case "staff":
          return set({ staff: await loadSimple("staff", M.staffFromRow) });
        case "events":
          return set({ events: await loadSimple("events", M.statEventFromRow) });
      }
    },
    [loadTeams, loadPlayers, loadMatches, loadSimple],
  );

  // ---- initial load + realtime subscription ----
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    // Restore any writes queued in a previous (offline) session.
    try {
      const raw = window.localStorage.getItem(QUEUE_KEY);
      if (raw) {
        queueRef.current = JSON.parse(raw) as PendingOp[];
        setPending(queueRef.current.length);
      }
    } catch {
      /* ignore */
    }

    (async () => {
      const [
        leagues, seasons, divisions, tournaments, groups, venues, courts,
        staff, teams, players, matches, events,
      ] = await Promise.all([
        loadSimple("leagues", M.leagueFromRow),
        loadSimple("seasons", M.seasonFromRow),
        loadSimple("divisions", M.divisionFromRow),
        loadSimple("tournaments", M.tournamentFromRow),
        loadSimple("groups", M.groupFromRow),
        loadSimple("venues", M.venueFromRow),
        loadSimple("courts", M.courtFromRow),
        loadSimple("staff", M.staffFromRow),
        loadTeams(),
        loadPlayers(),
        loadMatches(),
        loadSimple("events", M.statEventFromRow),
      ]);
      if (cancelled) return;
      setDb({
        leagues, seasons, divisions, tournaments, groups, venues, courts,
        staff, teams, players, matches, events,
      });
      setReady(true);
      void flush(); // drain anything queued from a prior session
    })();

    // Debounced per-collection reloads keep clients synchronised with the
    // server as changes stream in from any user.
    const timers = new Map<Collection, ReturnType<typeof setTimeout>>();
    const scheduleReload = (collection: Collection) => {
      const existing = timers.get(collection);
      if (existing) clearTimeout(existing);
      timers.set(
        collection,
        setTimeout(() => void reload(collection), 150),
      );
    };

    const channel: RealtimeChannel = supabase.channel("volleyverse:db");
    for (const table of M.REALTIME_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const c of M.COLLECTIONS_FOR_TABLE[table] ?? [])
            scheduleReload(c as Collection);
        },
      );
    }
    channel.subscribe();

    return () => {
      cancelled = true;
      for (const t of timers.values()) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [supabase, loadSimple, loadTeams, loadPlayers, loadMatches, reload, flush]);

  // ---- connectivity: flush the queue whenever the network returns ----
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush]);

  // ---- optimistic local patch helpers ----
  const patchDb = useCallback((fn: (prev: Db) => Db) => setDb(fn), []);
  const patchMatch = useCallback(
    (matchId: string, patch: (m: Match) => Match) =>
      setDb((prev) => ({
        ...prev,
        matches: prev.matches.map((m) => (m.id === matchId ? patch(m) : m)),
      })),
    [],
  );

  // ---- DataProvider surface (mirrors LocalProvider exactly) ----
  const api: DataProvider = useMemo(() => {
    const syncStatus: SyncStatus = !ready
      ? "connecting"
      : !online
        ? "offline"
        : pending > 0
          ? "syncing"
          : "synced";

    return {
      db,
      ready,
      syncStatus,

      insert: (collection, row) => {
        const id = uuid();
        const withId = { ...row, id } as Db[typeof collection][number];

        if (collection === "players") {
          // A Player is one person row + one registration row. Mint both ids;
          // the registration id is the app-facing Player.id.
          const p = withId as unknown as Player;
          const personId = uuid();
          enqueue(
            { kind: "upsert", table: "players", row: { id: personId, ...M.playerPersonToRow(p) } },
            {
              kind: "upsert",
              table: "team_players",
              row: { id, player_id: personId, ...M.playerRegistrationToRow(p) },
            },
          );
        } else {
          const table = M.TABLE_FOR_COLLECTION[collection];
          enqueue({
            kind: "upsert",
            table,
            row: toRow(collection, withId as unknown as Row),
          });
        }

        patchDb((prev) => ({
          ...prev,
          [collection]: [...prev[collection], withId],
        }));
        return withId;
      },

      update: (collection, id, patch) => {
        if (collection === "players") {
          const p = patch as Partial<Player>;
          const person = M.playerPersonToRow(p);
          const reg = M.playerRegistrationToRow(p);
          if (Object.keys(reg).length)
            enqueue({ kind: "upsert", table: "team_players", row: { id, ...reg } });
          if (Object.keys(person).length) {
            // Person fields live in players, keyed by person_id — resolve it
            // from the current snapshot's roster (person_id is not on Player).
            void resolvePersonId(id).then((personId) => {
              if (personId)
                enqueue({ kind: "upsert", table: "players", row: { id: personId, ...person } });
            });
          }
        } else {
          const table = M.TABLE_FOR_COLLECTION[collection];
          enqueue({
            kind: "upsert",
            table,
            row: { id, ...toRow(collection, { ...patch, id } as unknown as Row) },
          });
        }
        patchDb((prev) => ({
          ...prev,
          [collection]: (prev[collection] as { id: string }[]).map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        }));
      },

      remove: (collection: Collection, id: string) => {
        const table = M.TABLE_FOR_COLLECTION[collection]; // players -> team_players
        enqueue({ kind: "delete", table, match: { id } });
        patchDb((prev) => ({
          ...prev,
          [collection]: (prev[collection] as { id: string }[]).filter(
            (r) => r.id !== id,
          ),
        }));
      },

      createMatch: (m) => {
        const match: Match = {
          ...m,
          id: uuid(),
          status: "scheduled",
          published: false,
          winnerTeamId: null,
          setScores: [],
        };
        enqueue({ kind: "upsert", table: "matches", row: M.matchToRow(match) });
        patchDb((prev) => ({ ...prev, matches: [...prev.matches, match] }));
        return match;
      },

      startMatch: (matchId) => {
        enqueue({ kind: "upsert", table: "matches", row: { id: matchId, status: "live" } });
        patchMatch(matchId, (m) => ({ ...m, status: "live" }));
      },

      recordSetScore: (matchId, set: MatchSet) => {
        enqueue({
          kind: "upsert",
          table: "match_sets",
          row: {
            match_id: matchId,
            set_no: set.setNo,
            home_points: set.homePoints,
            away_points: set.awayPoints,
          },
          onConflict: "match_id,set_no",
        });
        patchMatch(matchId, (m) => ({
          ...m,
          setScores: [...m.setScores.filter((s) => s.setNo !== set.setNo), set].sort(
            (a, b) => a.setNo - b.setNo,
          ),
        }));
      },

      completeMatch: (matchId, winnerTeamId) => {
        enqueue({
          kind: "upsert",
          table: "matches",
          row: { id: matchId, status: "completed", winner_team_id: winnerTeamId },
        });
        patchMatch(matchId, (m) => ({ ...m, status: "completed", winnerTeamId }));
      },

      deleteMatch: (matchId) => {
        // ON DELETE CASCADE fans out to sets, rosters, officials, stat_events
        // and match_live_state — one delete erases everything derived.
        enqueue({ kind: "delete", table: "matches", match: { id: matchId } });
        patchDb((prev) => ({
          ...prev,
          matches: prev.matches.filter((m) => m.id !== matchId),
          events: prev.events.filter((e) => e.matchId !== matchId),
        }));
      },

      setPublished: (matchId, published) => {
        enqueue({ kind: "upsert", table: "matches", row: { id: matchId, published } });
        patchMatch(matchId, (m) => ({ ...m, published }));
      },

      setRosters: (matchId, rosters: MatchRosterEntry[]) => {
        enqueue(
          { kind: "delete", table: "match_rosters", match: { match_id: matchId } },
          ...rosters.map(
            (r): PendingOp => ({
              kind: "upsert",
              table: "match_rosters",
              row: {
                id: uuid(),
                match_id: matchId,
                team_id: r.teamId,
                player_id: r.playerId,
                is_starter: r.isStarter,
                is_libero: r.isLibero,
              },
            }),
          ),
        );
        patchMatch(matchId, (m) => ({ ...m, rosters }));
      },

      setOfficials: (matchId, officials: MatchOfficial[]) => {
        enqueue(
          { kind: "delete", table: "match_officials", match: { match_id: matchId } },
          ...officials.map(
            (o): PendingOp => ({
              kind: "upsert",
              table: "match_officials",
              row: { id: uuid(), match_id: matchId, name: o.name, role: o.role },
            }),
          ),
        );
        patchMatch(matchId, (m) => ({ ...m, officials }));
      },

      addEvent: (matchId, teamId, playerId, setNo, type) => {
        const e: StatEvent = {
          id: uuid(),
          matchId,
          teamId,
          playerId,
          setNo,
          type,
          ts: Date.now(),
        };
        enqueue({ kind: "upsert", table: "stat_events", row: M.statEventToRow(e) });
        patchDb((prev) => ({ ...prev, events: [...prev.events, e] }));
        return e;
      },

      removeEvent: (eventId) => {
        enqueue({ kind: "delete", table: "stat_events", match: { id: eventId } });
        patchDb((prev) => ({
          ...prev,
          events: prev.events.filter((e) => e.id !== eventId),
        }));
      },

      removeLatestOfType: (matchId, playerId, type) => {
        const target = [...dbRef.current.events]
          .filter(
            (e) => e.matchId === matchId && e.playerId === playerId && e.type === type,
          )
          .pop();
        if (!target) return;
        enqueue({ kind: "delete", table: "stat_events", match: { id: target.id } });
        patchDb((prev) => ({
          ...prev,
          events: prev.events.filter((e) => e.id !== target.id),
        }));
      },
    };

    // resolvePersonId reads the person id for a registration from Postgres.
    async function resolvePersonId(registrationId: string): Promise<string | null> {
      if (!supabase) return null;
      const { data } = await supabase
        .from("roster_view")
        .select("person_id")
        .eq("id", registrationId)
        .maybeSingle();
      return data ? M.personIdFromRow(data as Row) : null;
    }
  }, [db, ready, online, pending, enqueue, patchDb, patchMatch, supabase]);

  return api;
}

/** Dispatch a domain object to its table-row shape for a generic collection. */
function toRow(collection: Collection, value: Row): Row {
  switch (collection) {
    case "leagues":
      return M.leagueToRow(value as never);
    case "seasons":
      return M.seasonToRow(value as never);
    case "divisions":
      return M.divisionToRow(value as never);
    case "tournaments":
      return M.tournamentToRow(value as never);
    case "groups":
      return M.groupToRow(value as never);
    case "venues":
      return M.venueToRow(value as never);
    case "courts":
      return M.courtToRow(value as never);
    case "staff":
      return M.staffToRow(value as never);
    case "teams":
      return M.teamToRow(value as never);
    case "matches":
      return M.matchToRow(value as never);
    case "events":
      return M.statEventToRow(value as never);
    default:
      return value;
  }
}
