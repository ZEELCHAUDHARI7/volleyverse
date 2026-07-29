import type { MatchState } from "../rally";
import { getSupabase } from "./supabase-client";

/**
 * LIVE COURTSIDE STATE — cross-user realtime for the moving scoreboard.
 *
 * The Rally Tracker owns a rich MatchState (lineups, running score, current
 * rally). Locally it is persisted to `volleyverse:rally:<id>` in
 * localStorage, and the fan views poll/listen to that key — which syncs
 * tabs of ONE browser but not other users.
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

/** Push the courtside state to the shared channel. Fire-and-forget. */
export function pushLiveState(matchId: string, state: MatchState | null): void {
  const supabase = getSupabase();
  if (!supabase) return; // local-only mode: localStorage already handled it
  if (state === null) {
    void supabase.from("match_live_state").delete().eq("match_id", matchId);
    return;
  }
  void supabase
    .from("match_live_state")
    .upsert(
      { match_id: matchId, state: state as unknown as Record<string, unknown> },
      { onConflict: "match_id" },
    );
  // No await: if offline the write fails silently and the next tap re-sends
  // the full state (idempotent upsert), so the row converges on reconnect.
}

/**
 * Subscribe to a match's live state. Calls `onChange` with the current
 * state immediately (initial fetch) and on every remote update/delete.
 * Returns an unsubscribe. No-op (returns a noop unsub) in local-only mode.
 */
export function subscribeLiveState(
  matchId: string,
  onChange: (state: MatchState | null) => void,
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
      if (active && data) onChange((data.state as MatchState) ?? null);
    });

  const channel = supabase
    .channel(`volleyverse:live:${matchId}`)
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
        const next = payload.new as { state?: MatchState } | null;
        onChange(next && next.state ? next.state : null);
      },
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}
