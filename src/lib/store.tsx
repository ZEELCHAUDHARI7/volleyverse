"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Db, EventType, Match, Player, StatEvent } from "./types";
import { buildSeed } from "./seed";

/**
 * Local-first repository (planning Phase 7 decision).
 *
 * The UI talks only to this store's actions/selectors — a repository
 * boundary. Swapping localStorage for Supabase later means replacing
 * load/persist and adding realtime subscriptions; no screen changes.
 * localStorage doubles as the courtside entry queue: entries persist
 * within ~100ms of a tap (FR1) regardless of connectivity.
 */

const KEY = "volleyverse:db:v1";

function load(): Db {
  if (typeof window === "undefined") return { players: [], matches: [], events: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // corrupted storage → reseed
  }
  const seeded = buildSeed();
  window.localStorage.setItem(KEY, JSON.stringify(seeded));
  return seeded;
}

function persist(db: Db) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // storage full/unavailable — data stays in memory for the session
  }
}

interface StoreApi {
  ready: boolean;
  db: Db;
  createMatch: (m: Omit<Match, "id" | "status" | "published">) => Match;
  completeMatch: (matchId: string) => void;
  setPublished: (matchId: string, published: boolean) => void;
  addEvent: (matchId: string, playerId: string, set: number, type: EventType) => StatEvent;
  removeEvent: (eventId: string) => void;
  /** Post-match correction: remove the most recent event of a type (FR3). */
  removeLatestOfType: (matchId: string, playerId: string, type: EventType) => void;
  resetDemoData: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Db>({ players: [], matches: [], events: [] });
  const [ready, setReady] = useState(false);
  const idCounter = useRef(0);

  useEffect(() => {
    setDb(load());
    setReady(true);
  }, []);

  const update = useCallback((fn: (prev: Db) => Db) => {
    setDb((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const newId = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${(idCounter.current++).toString(36)}`;

  const api: StoreApi = {
    ready,
    db,
    createMatch: (m) => {
      const match: Match = { ...m, id: newId("m"), status: "live", published: false };
      update((prev) => ({ ...prev, matches: [...prev.matches, match] }));
      return match;
    },
    completeMatch: (matchId) =>
      update((prev) => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId ? { ...m, status: "completed" as const } : m,
        ),
      })),
    setPublished: (matchId, published) =>
      update((prev) => ({
        ...prev,
        matches: prev.matches.map((m) =>
          m.id === matchId ? { ...m, published } : m,
        ),
      })),
    addEvent: (matchId, playerId, set, type) => {
      const e: StatEvent = { id: newId("e"), matchId, playerId, set, type, ts: Date.now() };
      update((prev) => ({ ...prev, events: [...prev.events, e] }));
      return e;
    },
    removeEvent: (eventId) =>
      update((prev) => ({
        ...prev,
        events: prev.events.filter((e) => e.id !== eventId),
      })),
    removeLatestOfType: (matchId, playerId, type) =>
      update((prev) => {
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
    resetDemoData: () => {
      const seeded = buildSeed();
      persist(seeded);
      setDb(seeded);
    },
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

// ---- Convenience selectors ----
export function useMatch(matchId: string): {
  match: Match | undefined;
  roster: Player[];
  events: StatEvent[];
} {
  const { db } = useStore();
  const match = db.matches.find((m) => m.id === matchId);
  const roster = match
    ? db.players.filter((p) => match.roster.includes(p.id))
    : [];
  const events = db.events.filter((e) => e.matchId === matchId);
  return { match, roster, events };
}
