import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — the single connection the realtime provider
 * and the live-state channel share.
 *
 * Configuration is env-driven so the app degrades gracefully:
 *   - Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set
 *     → cloud mode: Postgres source of truth + Realtime across all users.
 *   - Either missing → the app falls back to the offline-first
 *     LocalProvider (localStorage + cross-tab sync). Nothing throws.
 *
 * See .env.local.example and REALTIME_SYNC.md.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both env vars are present — i.e. cloud realtime is available. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

/**
 * The shared browser client, or `null` when Supabase is not configured.
 * Lazily created and memoised so every hook shares one websocket.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  client = createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      // Cap event rate so a fast courtside tapper can't flood subscribers.
      params: { eventsPerSecond: 20 },
    },
  });
  return client;
}
