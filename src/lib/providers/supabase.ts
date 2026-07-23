/**
 * SUPABASE PROVIDER — implemented (was a stub; see git history).
 *
 * The DataProvider implementation against PostgreSQL via Supabase now lives
 * in `supabase-store.ts` as the `useSupabaseBackend()` hook. It is a hook
 * rather than a plain factory because it needs React state for the live
 * snapshot, the realtime subscription and the offline write queue.
 * `StoreProvider` (src/lib/store.tsx) selects it automatically when Supabase
 * is configured, so swapping providers requires no screen changes — the
 * contract of the repository boundary (src/lib/repository.ts).
 *
 * The original swap-in plan is now realised:
 *   1. @supabase/supabase-js installed; client from NEXT_PUBLIC_SUPABASE_URL
 *      / NEXT_PUBLIC_SUPABASE_ANON_KEY  → supabase-client.ts
 *   2. Reads assemble the snapshot (matches ⋈ sets/rosters/officials;
 *      players from roster_view)         → supabase-store.ts, mappers.ts
 *   3. Writes map to keyed upserts; stat events stay append-only.
 *   4. Realtime channels replace the cross-tab storage event and the 2s
 *      poll                              → supabase-store.ts, live-state.ts
 *   5. RLS publish boundary enforced server-side  → supabase/schema.sql
 *
 * See REALTIME_SYNC.md for the full design.
 */
export { useSupabaseBackend } from "./supabase-store";
export { isSupabaseConfigured, getSupabase } from "./supabase-client";
