/**
 * Staff (console) session — a thin wrapper over Supabase Auth.
 *
 * Every staff account is a regular Supabase Auth user; there is no
 * separate staff account system. What makes someone "staff" is whether
 * their email appears in the `console_admins` table — checked server-side
 * in src/middleware.ts, not here. This module only ever answers "who is
 * signed in", never "are they allowed into the console".
 *
 * The login screen, the nav and middleware all talk to this surface only:
 *
 *   login()             : sign in with email + password
 *   logout()             : sign out
 *   getTemporaryUser()   : who is it? (null if signed out)
 *   onAuthChange()       : subscribe to sign-in/out
 *   resetPassword()      : email a password-reset link
 *   signInWithGoogle()   : start the Google OAuth flow
 *
 * File name and export names are unchanged from the temporary stand-in
 * this replaced, so no call site needed to change beyond what a real
 * session shape requires (async reads, a user object with no invented
 * fields).
 */
import { APP_HOME, buildCallbackUrl } from "./routes.ts";
import { getSupabase } from "../providers/supabase-client.ts";

/** The minimal user shape the console UI needs, nothing more. */
export type TemporaryUser = {
  id: string;
  email: string;
};

/** Credentials the login form collects. `remember` has no effect today —
 *  Supabase's own session lifetime governs how long sign-in lasts. */
export type LoginInput = {
  email: string;
  password: string;
  remember?: boolean;
};

export async function login({ email, password }: LoginInput): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not available right now.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

export async function getTemporaryUser(): Promise<TemporaryUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getTemporaryUser()) !== null;
}

/** Subscribes to session changes. The listener receives the current user
 *  directly (or null) — no separate re-fetch needed. */
export function onAuthChange(
  listener: (user: TemporaryUser | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    listener(user?.email ? { id: user.id, email: user.email } : null);
  });
  return () => subscription.unsubscribe();
}

/** Always resolves, regardless of whether the address has an account —
 *  Supabase itself never reveals that, and neither does this. */
export async function resetPassword(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not available right now.");
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: buildCallbackUrl(window.location.origin, APP_HOME),
  });
}

/** Starts the Google OAuth redirect. The browser navigates away on
 *  success, so nothing meaningful runs after this call returns. */
export async function signInWithGoogle(next: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not available right now.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: buildCallbackUrl(window.location.origin, next) },
  });
  if (error) throw error;
}
