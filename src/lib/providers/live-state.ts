import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveScoreboard } from "../live-score";
import { getSupabase } from "./supabase-client.ts";

/**
 * LIVE COURTSIDE STATE — cross-user realtime for the moving scoreboard.
 *
 * Both scoring screens own a rich courtside state (lineups, running score,
 * current rally). Locally it is persisted to localStorage
 * (`volleytics:free:<id>` on /spikes, `volleytics:rally:<id>` on /rally),
 * which syncs tabs of ONE browser but not other users.
 *
 * These two helpers mirror that same state through Supabase
 * (`match_live_state`, one JSONB row per match) so every device watching a
 * published match sees the score move live:
 *
 *   - pushLiveState      — the scorer's side: upsert/delete the row.
 *   - subscribeLiveState — the viewer's side: initial fetch + realtime.
 *
 * Both are no-ops when Supabase is not configured, so the local-first
 * behaviour is unchanged. localStorage remains the offline cache; the DB
 * row is the shared projection. stat_events stays the durable source of
 * truth — this row can always be rebuilt from it.
 */

interface Pending {
  state: LiveScoreboard | null;
  supabase: SupabaseClient;
  waiters: ((shared: boolean) => void)[];
}

/**
 * One lane per match: a write in flight, plus the newest state queued behind
 * it. Concurrent upserts can land in any order, so a burst of taps could leave
 * the row on an older score; a state superseded while queued is never sent.
 */
const lanes = new Map<string, { next: Pending | null }>();

/**
 * Push the courtside state to the shared channel. Resolves true once the
 * database holds it (or a newer state that replaced it in the queue) and
 * false when it did not get there (local-only mode, offline, refused). Never
 * rejects, so a tap can fire and forget it.
 */
export function pushLiveState(
  matchId: string,
  state: LiveScoreboard | null,
  supabase: SupabaseClient | null = getSupabase(),
): Promise<boolean> {
  if (!supabase) return Promise.resolve(false); // local-only mode: localStorage has it
  return new Promise((resolve) => {
    const lane = lanes.get(matchId);
    if (lane) {
      lane.next = { state, supabase, waiters: [...(lane.next?.waiters ?? []), resolve] };
      return;
    }
    const fresh = { next: { state, supabase, waiters: [resolve] } as Pending | null };
    lanes.set(matchId, fresh);
    void drain(matchId, fresh);
  });
}

async function drain(matchId: string, lane: { next: Pending | null }): Promise<void> {
  while (lane.next) {
    const { state, supabase, waiters } = lane.next;
    lane.next = null;
    // A throw here would wedge the lane and silence this match for good.
    const shared = await write(supabase, matchId, state).catch(() => false);
    for (const done of waiters) done(shared);
  }
  lanes.delete(matchId);
}

async function write(
  supabase: SupabaseClient,
  matchId: string,
  state: LiveScoreboard | null,
): Promise<boolean> {
  // The query builder sends nothing until it is awaited.
  const { error } = await (state === null
    ? supabase.from("match_live_state").delete().eq("match_id", matchId)
    : supabase
        .from("match_live_state")
        .upsert(
          { match_id: matchId, state: state as unknown as Record<string, unknown> },
          { onConflict: "match_id" },
        ));
  if (error) {
    // The next tap re-sends the full state (idempotent upsert), so the row
    // converges once writes land again.
    console.warn(`[live-state] match ${matchId} not shared: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Subscribe to a match's live state. Calls `onChange` with the current
 * state immediately (initial fetch) and on every remote update/delete.
 * Returns an unsubscribe. No-op (returns a noop unsub) in local-only mode.
 */
export function subscribeLiveState(
  matchId: string,
  onChange: (state: LiveScoreboard | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  let active = true;

  supabase
    .from("match_live_state")
    .select("state")
    .eq("match_id", matchId)
    .maybeSingle()
    .then(({ data }) => {
      if (active && data) onChange((data.state as LiveScoreboard) ?? null);
    });

  const channel = supabase
    .channel(`volleytics:live:${matchId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "match_live_state",
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        if (!active) return;
        const next = payload.new as { state?: LiveScoreboard } | null;
        onChange(next && next.state ? next.state : null);
      },
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}
