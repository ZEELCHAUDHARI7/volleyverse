import type { DataProvider } from "../repository";

/**
 * SUPABASE PROVIDER — stub.
 *
 * Implements DataProvider against PostgreSQL via Supabase
 * (schema: supabase/schema.sql). Swap-in plan:
 *
 *  1. `npm install @supabase/supabase-js` and create the client from
 *     NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *  2. Reads: scoped queries replace the whole-Db snapshot —
 *     e.g. getMatch joins matches + match_sets + match_rosters +
 *     match_officials; rosters read from roster_view.
 *  3. Writes: each DataProvider mutation maps to one insert/update;
 *     stat events stay append-only for undo integrity.
 *  4. Realtime: subscribe to `stat_events` and `matches` channels —
 *     this replaces the localStorage cross-tab `storage` event and the
 *     2s poll in useLiveMatch.
 *  5. Auth/RLS: the publish boundary is enforced server-side by the
 *     policies in schema.sql; the anon client simply cannot read
 *     unpublished data.
 *
 * The UI must not change when this replaces the LocalProvider — that is
 * the contract of the repository boundary (src/lib/repository.ts).
 */
export function createSupabaseProvider(): DataProvider {
  throw new Error(
    "SupabaseProvider is not implemented yet. Configure Supabase and implement per the notes above.",
  );
}
