import type { Collection, DataProvider } from "./repository";
import type { Db } from "./types";

/**
 * What removing a tournament, venue or team from League Setup takes with it.
 *
 * Postgres cascades some of this on its own (schema.sql), but the local
 * store deletes only the one row it is given. A plan spells the cascade out
 * so the confirmation can say exactly what goes, and `applyRemoval` makes
 * both providers end in the same state.
 */

export interface RowRef {
  collection: Collection;
  id: string;
}

/** A row that survives the removal but drops its reference to the target. */
export interface Unlink extends RowRef {
  patch: Record<string, null>;
}

export interface RemovalPlan {
  target: RowRef;
  /** Matches deleted with the target; `deleteMatch` takes their stat events too. */
  matchIds: string[];
  /** Stat events on those matches — the points the confirmation warns about. */
  events: number;
  /** Other rows deleted with the target. */
  rows: RowRef[];
  unlinks: Unlink[];
}

function eventsOn(db: Db, matchIds: string[]): number {
  const ids = new Set(matchIds);
  return db.events.filter((e) => ids.has(e.matchId)).length;
}

const refs = (collection: Collection, rows: { id: string }[]): RowRef[] =>
  rows.map((r) => ({ collection, id: r.id }));

export function planTournamentRemoval(db: Db, id: string): RemovalPlan {
  const matchIds = db.matches.filter((m) => m.tournamentId === id).map((m) => m.id);
  return {
    target: { collection: "tournaments", id },
    matchIds,
    events: eventsOn(db, matchIds),
    rows: refs("groups", db.groups.filter((g) => g.tournamentId === id)),
    unlinks: [],
  };
}

export function planVenueRemoval(db: Db, id: string): RemovalPlan {
  const courts = db.courts.filter((c) => c.venueId === id);
  const courtIds = new Set(courts.map((c) => c.id));
  const unlinks: Unlink[] = [];
  for (const m of db.matches) {
    const patch: Record<string, null> = {};
    if (m.venueId === id) patch.venueId = null;
    if (m.courtId && courtIds.has(m.courtId)) patch.courtId = null;
    if (Object.keys(patch).length) unlinks.push({ collection: "matches", id: m.id, patch });
  }
  for (const t of db.tournaments) {
    if (t.venueId === id) unlinks.push({ collection: "tournaments", id: t.id, patch: { venueId: null } });
  }
  return {
    target: { collection: "venues", id },
    matchIds: [],
    events: 0,
    rows: refs("courts", courts),
    unlinks,
  };
}

export function planTeamRemoval(db: Db, id: string): RemovalPlan {
  const matchIds = db.matches
    .filter((m) => m.homeTeamId === id || m.awayTeamId === id)
    .map((m) => m.id);
  return {
    target: { collection: "teams", id },
    matchIds,
    events: eventsOn(db, matchIds),
    rows: [
      ...refs("players", db.players.filter((p) => p.teamId === id)),
      ...refs("staff", db.staff.filter((s) => s.teamId === id)),
    ],
    unlinks: [],
  };
}

/**
 * The matches a player is part of: their own stat events, events naming them
 * as the opponent, and match line-ups. Removing such a player would rewrite
 * a recorded result (and Postgres refuses it), so League Setup does not offer
 * it; deleting those matches first frees the player.
 */
export function matchesWithPlayer(db: Db, playerId: string): string[] {
  const ids = new Set<string>();
  for (const e of db.events) {
    if (e.playerId === playerId || e.vsPlayerId === playerId) ids.add(e.matchId);
  }
  for (const m of db.matches) {
    if (m.rosters?.some((r) => r.playerId === playerId)) ids.add(m.id);
  }
  return [...ids];
}

export function countOf(items: RowRef[], collection: Collection): number {
  return items.filter((r) => r.collection === collection).length;
}

/**
 * Carries out a plan in foreign-key order: links are cleared and matches
 * (with their stat events) deleted before the players, courts and parent
 * rows they point at, so Postgres never rejects a step.
 */
export function applyRemoval(
  store: Pick<DataProvider, "remove" | "update" | "deleteMatch">,
  plan: RemovalPlan,
): void {
  for (const u of plan.unlinks) store.update(u.collection, u.id, u.patch);
  for (const matchId of plan.matchIds) store.deleteMatch(matchId);
  for (const r of plan.rows) store.remove(r.collection, r.id);
  store.remove(plan.target.collection, plan.target.id);
}
