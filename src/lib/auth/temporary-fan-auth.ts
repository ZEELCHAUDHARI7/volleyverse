/**
 * Fan account session — a thin wrapper over Supabase Auth.
 *
 * The same underlying Supabase account system as ./temporary-auth.ts;
 * there is only ever one `auth.users` table. This module is just the
 * fan-facing surface over it — different copy, different sign-up flow
 * (fans can create an account, staff cannot), same provider calls.
 *
 *   fanSignUp()        : create an account from name + email + password
 *   fanLogin()         : sign in with email + password
 *   fanLogout()        : sign out
 *   getTemporaryFan()  : who is it? (null if signed out)
 *   onFanAuthChange()  : subscribe to sign-in/out
 *
 * `name` is stored in the account's user_metadata — there is no separate
 * profiles table, on purpose (nothing else needs one yet).
 */
import { PUBLIC_HOME, buildCallbackUrl } from "./routes.ts";
import { getSupabase } from "../providers/supabase-client.ts";

/** What the public site needs to greet a fan. Nothing more. */
export type TemporaryFan = {
  id: string;
  email: string;
  name: string;
};

/** `remember` has no effect today — Supabase's own session lifetime
 *  governs how long sign-in lasts. */
export type FanLoginInput = {
  email: string;
  password: string;
  remember?: boolean;
};

export type FanSignUpInput = {
  name: string;
  email: string;
  password: string;
};

/** Falls back to the email local part when no display name was given. */
export function fanDisplayName(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._\-+]+/).filter(Boolean);
  if (words.length === 0) return "Fan";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Up to two letters for the nav avatar. */
export function fanInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "F";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function toFan(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): TemporaryFan | null {
  if (!user.email) return null;
  const name = user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email,
    name: fanDisplayName(typeof name === "string" ? name : "", user.email),
  };
}

/** Resolves whether or not the account needs email confirmation first —
 *  callers should check for a session before assuming sign-up finished. */
export async function fanSignUp({
  name,
  email,
  password,
}: FanSignUpInput): Promise<{ confirmationRequired: boolean }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-up is not available right now.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: buildCallbackUrl(window.location.origin, PUBLIC_HOME),
    },
  });
  if (error) throw error;
  return { confirmationRequired: !data.session };
}

export async function fanLogin({ email, password }: FanLoginInput): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not available right now.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function fanLogout(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

export async function getTemporaryFan(): Promise<TemporaryFan | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? toFan(data.user) : null;
}

export async function isFanSignedIn(): Promise<boolean> {
  return (await getTemporaryFan()) !== null;
}

/** Subscribes to session changes. The listener receives the current fan
 *  directly (or null) — no separate re-fetch needed. */
export function onFanAuthChange(
  listener: (fan: TemporaryFan | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session?.user ? toFan(session.user) : null);
  });
  return () => subscription.unsubscribe();
}

/** Always resolves, regardless of whether the address has an account. */
export async function resetFanPassword(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not available right now.");
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: buildCallbackUrl(window.location.origin, PUBLIC_HOME),
  });
}

/** Starts the Google OAuth redirect. The browser navigates away on
 *  success, so nothing meaningful runs after this call returns. */
export async function signInWithGoogleAsFan(next: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sign-in is not available right now.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: buildCallbackUrl(window.location.origin, next) },
  });
  if (error) throw error;
}
