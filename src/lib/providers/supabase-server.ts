import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Per-request Supabase client for route handlers and server components.
 *
 * Never memoise this the way getSupabase() memoises the browser client —
 * each request carries its own cookies, so each needs its own client.
 *
 * Returns null when Supabase is unconfigured, mirroring getSupabase().
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Thrown when called from a Server Component, where the cookie
          // store is read-only. Nothing depends on the write: the console has
          // no sign-in, so there is no session to persist — server reads run
          // on the anon key and RLS enforces the publish boundary.
        }
      },
    },
  });
}
