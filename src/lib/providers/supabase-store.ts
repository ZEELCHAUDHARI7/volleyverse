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
const REJECTED_KEY = "volleyverse:sync-rejected:v1";

/** A write the database refused, parked so it cannot block the queue. */
type RejectedOp = { op: PendingOp; message: string; at: number };

/**
 * Did the DATABASE refuse this write, or did the NETWORK drop it?
 *
 * The distinction decides everything. A dropped request must be retried —
 * that is the whole point of the queue. A refused row can never succeed, and
 * retrying it at the head of a FIFO queue silently blocks every later write:
 * one rejected stat_event and the rest of the match never reaches Postgres.
 *
 * PostgREST surfaces a SQLSTATE-ish `code` on anything Postgres decided
 * (23514 check violation, 23503 foreign key, 42501 RLS). Fetch failures carry
 * no code and say so in the message.
 */
function isRefusedByDatabase(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const msg = typeof e?.message === "string" ? e.message : String(err ?? "");
  if (/failed to fetch|networkerror|network request|timeout|aborted|econn/i.test(msg))
    return false;
  const code = typeof e?.code === "string" ? e.code : "";
  return code.length > 0;
}

/** Turn a PostgREST error into something a courtside human can act on. */
function describe(op: PendingOp, err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string } | null;
  const what = op.kind === "upsert" ? `write to ${op.table}` : `delete from ${op.table}`;
  const code = e?.code ?? "";
  const base = e?.message ?? String(err ?? "unknown error");
  if (code === "23514")
    return `The database rejected a ${what}: a value is outside what the schema allows (${base}). A migration is probably missing — run the SQL in supabase/migrations/.`;
  if (code === "23503") return `The database rejected a ${what}: it references a row that does not exist (${base}).`;
  // There is no sign-in in this console (see supabase-client.ts): every
  // request runs on the anon key. So 42501 is never an expired session — it
  // is always a database whose policies still demand an authenticated role.
  if (code === "42501")
    return `The database rejected a ${what}: row-level security will not let the anon role write (${base}). Run supabase/FIX-RLS-NOW.sql in the Supabase SQL editor, then press Retry.`;
  return `The database rejected a ${what}${code ? ` [${code}]` : ""}: ${base}`;
}

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

  const [lastError, setLastError] = useState<string | null>(null);
  /** How many writes are parked, waiting for a human to fix the cause. */
  const [rejected, setRejected] = useState(0);

  // ---- durable offline queue ----
  const queueRef = useRef<PendingOp[]>([]);
  const flushingRef = useRef(false);
  const rejectedRef = useRef<RejectedOp[]>([]);

  const persistQueue = useCallback(() => {
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queueRef.current));
    } catch {
      /* storage full — queue stays in memory for the session */
    }
    setPending(queueRef.current.length);
  }, []);

  /**
   * Park a write Postgres refused. Kept durably so the rows are recoverable
   * once the schema is fixed, and surfaced immediately so nobody keeps
   * collecting a match into a database that is throwing it away.
   */
  const park = useCallback((op: PendingOp, err: unknown) => {
    const message = describe(op, err);
    rejectedRef.current.push({ op, message, at: Date.now() });
    try {
      window.localStorage.setItem(REJECTED_KEY, JSON.stringify(rejectedRef.current));
    } catch {
      /* storage full — the in-memory list still drives the UI this session */
    }
    console.error("[volleyverse] write rejected by the database", { op, err });
    setRejected(rejectedRef.current.length);
    setLastError(message);
  }, []);

  const clearErrors = useCallback(() => {
    rejectedRef.current = [];
    try {
      window.localStorage.removeItem(REJECTED_KEY);
    } catch {
      /* ignore */
    }
    setRejected(0);
    setLastError(null);
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
        } catch (err) {
          if (isRefusedByDatabase(err)) {
            // Postgres said no. Retrying can never change that, and leaving it
            // at the head of the queue would block every later write for the
            // rest of the match — the whole match lost behind one bad row.
            // Park it, report it, and keep draining.
            park(op, err);
            queueRef.current.shift();
            persistQueue();
            continue;
          }
          // Network failure — stop; the reconnect handler retries in order.
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
  }, [execOp, park, persistQueue, supabase]);

  /**
   * Put the parked writes back on the queue and try them again.
   *
   * The banner tells the collector their taps are safe and will sync once the
   * cause is fixed. That promise needs a road back: parking alone is a
   * cul-de-sac, and `clearErrors` throws the rows away. This is the road.
   *
   * Parked ops go to the HEAD of the queue, because they were refused before
   * anything now waiting was made — a match row must land before the
   * stat_events that reference it, or the replay trades 42501 for 23503.
   *
   * If the cause is not actually fixed, they are simply parked again and the
   * banner returns: retrying is safe. Every op is an upsert by primary key or
   * an append of a client-minted uuid, so a write that DID land and a write
   * that did not both converge on the same row.
   */
  const retryRejected = useCallback(() => {
    const parked = rejectedRef.current.map((r) => r.op);
    rejectedRef.current = [];
    try {
      window.localStorage.removeItem(REJECTED_KEY);
    } catch {
      /* ignore */
    }
    setRejected(0);
    setLastError(null);
    if (parked.length) {
      queueRef.current = [...parked, ...queueRef.current];
      persistQueue();
    }
    void flush();
  }, [flush, persistQueue]);

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

  /**
   * Read a table, refusing to disguise a refusal as an empty result.
   *
   * PostgREST answers a rejected read with `{ data: null, error }`. Mapping
   * that to `[]` makes "the server said no" identical to "there is nothing
   * here" — and every caller below then writes that emptiness over state the
   * user is looking at. One failed refresh blanks the screen, silently.
   *
   * Throwing pushes the decision up to callers that know what they already
   * have and can keep it.
   */
  const readTable = useCallback(
    async (table: string): Promise<Row[]> => {
      const { data, error } = await supabase!.from(table).select("*");
      if (error) {
        const code = (error as { code?: string }).code;
        throw new Error(
          `Could not read ${table}${code ? ` [${code}]` : ""}: ${error.message}`,
        );
      }
      return (data ?? []) as Row[];
    },
    [supabase],
  );

  const loadTeams = useCallback(async (): Promise<Db["teams"]> => {
    if (!supabase) return [];
    const [teams, honours] = await Promise.all([
      readTable("teams"),
      readTable("team_honours"),
    ]);
    const byTeam = groupBy(honours, "team_id");
    return teams.map((t) => M.teamFromRow(t, byTeam.get(String(t.id)) ?? []));
  }, [supabase, readTable]);

  const loadPlayers = useCallback(async (): Promise<Player[]> => {
    if (!supabase) return [];
    return (await readTable("roster_view")).map(M.playerFromRow);
  }, [supabase, readTable]);

  const loadMatches = useCallback(async (): Promise<Match[]> => {
    if (!supabase) return [];
    const [m, off, sets, rosters] = await Promise.all([
      readTable("matches"),
      readTable("match_officials"),
      readTable("match_sets"),
      readTable("match_rosters"),
    ]);
    const offBy = groupBy(off, "match_id");
    const setBy = groupBy(sets, "match_id");
    const rosBy = groupBy(rosters, "match_id");
    return m.map((r) =>
      M.matchFromRow(
        r,
        offBy.get(String(r.id)) ?? [],
        setBy.get(String(r.id)) ?? [],
        rosBy.get(String(r.id)) ?? [],
      ),
    );
  }, [supabase, readTable]);

  const loadSimple = useCallback(
    async <K extends Collection>(
      collection: K,
      fromRow: (r: Row) => Db[K][number],
    ): Promise<Db[K][number][]> => {
      if (!supabase) return [];
      return (await readTable(M.TABLE_FOR_COLLECTION[collection])).map(fromRow);
    },
    [supabase, readTable],
  );

  /** Fetch one collection. Throws if the server refused the read. */
  const fetchCollection = useCallback(
    async (collection: Collection): Promise<Partial<Db>> => {
      switch (collection) {
        case "teams":
          return { teams: await loadTeams() };
        case "players":
          return { players: await loadPlayers() };
        case "matches":
          return { matches: await loadMatches() };
        case "leagues":
          return { leagues: await loadSimple("leagues", M.leagueFromRow) };
        case "seasons":
          return { seasons: await loadSimple("seasons", M.seasonFromRow) };
        case "divisions":
          return { divisions: await loadSimple("divisions", M.divisionFromRow) };
        case "tournaments":
          return { tournaments: await loadSimple("tournaments", M.tournamentFromRow) };
        case "groups":
          return { groups: await loadSimple("groups", M.groupFromRow) };
        case "venues":
          return { venues: await loadSimple("venues", M.venueFromRow) };
        case "courts":
          return { courts: await loadSimple("courts", M.courtFromRow) };
        case "staff":
          return { staff: await loadSimple("staff", M.staffFromRow) };
        case "events":
          return { events: await loadSimple("events", M.statEventFromRow) };
      }
    },
    [loadTeams, loadPlayers, loadMatches, loadSimple],
  );

  const reload = useCallback(
    async (collection: Collection) => {
      try {
        const patch = await fetchCollection(collection);
        setDb((prev) => ({ ...prev, ...patch }));
      } catch (err) {
        // A refused refresh must never blank what is already on screen. Keep
        // the collection as it stands and say so — an empty chart the collector
        // reads as real data is worse than no refresh at all.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[volleyverse] refresh failed", collection, err);
        setLastError(`${message} — still showing the last data that loaded.`);
      }
    },
    [fetchCollection],
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

    // Restore writes a previous session could not land, so the warning
    // survives a reload instead of the data quietly staying missing.
    try {
      const raw = window.localStorage.getItem(REJECTED_KEY);
      if (raw) {
        rejectedRef.current = JSON.parse(raw) as RejectedOp[];
        setRejected(rejectedRef.current.length);
        const last = rejectedRef.current[rejectedRef.current.length - 1];
        if (last) setLastError(last.message);
      }
    } catch {
      /* ignore */
    }

    (async () => {
      // One refused table must not cost the whole load, but it must be said
      // out loud. Silence here is what let empty charts pass for real data.
      const failures: string[] = [];
      const attempt = async <T,>(what: string, run: () => Promise<T>, empty: T) => {
        try {
          return await run();
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
          console.error(`[volleyverse] initial load failed: ${what}`, err);
          return empty;
        }
      };

      const [
        leagues, seasons, divisions, tournaments, groups, venues, courts,
        staff, teams, players, matches, events,
      ] = await Promise.all([
        attempt("leagues", () => loadSimple("leagues", M.leagueFromRow), []),
        attempt("seasons", () => loadSimple("seasons", M.seasonFromRow), []),
        attempt("divisions", () => loadSimple("divisions", M.divisionFromRow), []),
        attempt("tournaments", () => loadSimple("tournaments", M.tournamentFromRow), []),
        attempt("groups", () => loadSimple("groups", M.groupFromRow), []),
        attempt("venues", () => loadSimple("venues", M.venueFromRow), []),
        attempt("courts", () => loadSimple("courts", M.courtFromRow), []),
        attempt("staff", () => loadSimple("staff", M.staffFromRow), []),
        attempt("teams", loadTeams, []),
        attempt("players", loadPlayers, []),
        attempt("matches", loadMatches, []),
        attempt("events", () => loadSimple("events", M.statEventFromRow), []),
      ]);
      if (cancelled) return;
      setDb({
        leagues, seasons, divisions, tournaments, groups, venues, courts,
        staff, teams, players, matches, events,
      });
      if (failures.length > 0) setLastError(failures[0]);
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
    // A refused write outranks every other state: "Synced" next to data the
    // server never accepted is the failure mode this whole branch exists for.
    const syncStatus: SyncStatus = lastError
      ? "error"
      : !ready
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
      lastError,
      rejectedCount: rejected,
      clearErrors,
      retryRejected,

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
          if (Object.keys(reg).length) {
            const existing = dbRef.current.players.find((r) => r.id === id);
            void resolvePersonId(id).then((personId) => {
              enqueue({
                kind: "upsert",
                table: "team_players",
                row: {
                  id,
                  ...(existing?.teamId ? { team_id: existing.teamId } : {}),
                  ...(personId ? { player_id: personId } : {}),
                  ...reg,
                },
              });
            });
          }
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

      setSetScores: (matchId, sets: MatchSet[]) => {
        // Delete-then-upsert, like setRosters: the array IS the new truth, so a
        // set left out of it must disappear server-side too.
        enqueue(
          { kind: "delete", table: "match_sets", match: { match_id: matchId } },
          ...sets.map(
            (s): PendingOp => ({
              kind: "upsert",
              table: "match_sets",
              row: {
                match_id: matchId,
                set_no: s.setNo,
                home_points: s.homePoints,
                away_points: s.awayPoints,
              },
              onConflict: "match_id,set_no",
            }),
          ),
        );
        patchMatch(matchId, (m) => ({
          ...m,
          setScores: [...sets].sort((a, b) => a.setNo - b.setNo),
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

      addEvent: (matchId, teamId, playerId, setNo, type, vsPlayerId) => {
        const e: StatEvent = {
          id: uuid(),
          matchId,
          teamId,
          playerId,
          setNo,
          type,
          ts: Date.now(),
          vsPlayerId: vsPlayerId ?? null,
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
  }, [
    db,
    ready,
    online,
    pending,
    lastError,
    rejected,
    clearErrors,
    retryRejected,
    enqueue,
    patchDb,
    patchMatch,
    supabase,
  ]);

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
