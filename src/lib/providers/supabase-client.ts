import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — the single connection the realtime provider,
 * the live-state channel and Auth all share.
 *
 * Configuration is env-driven so the app degrades gracefully:
 *   - Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set
 *     → cloud mode: Postgres source of truth + Realtime across all users.
 *   - Either missing → the app falls back to the offline-first
 *     LocalProvider (localStorage + cross-tab sync). Nothing throws.
 *
 * createBrowserClient stores the session in a cookie rather than
 * localStorage, which is what lets middleware and server components read
 * it. See src/middleware.ts and REALTIME_SYNC.md.
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
 * Memoised so every hook shares one websocket.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  // No `auth` options block here on purpose: createBrowserClient installs
  // its own cookie storage adapter, and passing persistSession /
  // autoRefreshToken would override it and put us back on localStorage.
  client = createBrowserClient(url!, anonKey!, {
    realtime: {
      // Cap event rate so a fast courtside tapper can't flood subscribers.
      params: { eventsPerSecond: 20 },
    },
  });
  return client;
}
