/**
 * TEMPORARY AUTHENTICATION LAYER (replace me).
 * ============================================
 *
 * The console currently has no real authentication. This module fakes a
 * session so the new login UI can hand the user through to the existing
 * application while we decide what the real auth architecture should be.
 *
 * Everything fake lives here and nowhere else. The login screen, the
 * nav and the middleware all talk to this surface only:
 *
 *   login()            : mint a temporary session
 *   logout()           : clear it
 *   isAuthenticated()  : is there a session?
 *   getTemporaryUser() : who is it?
 *
 * SWAPPING IN REAL AUTH
 * ---------------------
 * Keep the four function signatures and re-implement the bodies against
 * Supabase Auth (or whatever we choose). The login screen calls
 * `login({ email, password, remember })` and awaits it, so a real
 * `supabase.auth.signInWithPassword()` drops straight in. Middleware
 * reads `SESSION_COOKIE`; point it at the real session cookie / a
 * `getClaims()` check instead. No UI needs rebuilding.
 *
 * NOTE: this is a development stand-in, not a security boundary. The
 * cookie is unsigned and trivially forgeable, and it must not be used to
 * protect anything sensitive. It exists so the app is navigable.
 */

/** The minimal user shape the console UI needs, nothing more. */
export type TemporaryUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/** Credentials the login form collects. */
export type LoginInput = {
  email: string;
  password: string;
  remember?: boolean;
};

/**
 * Cookie rather than localStorage so the Next.js middleware can gate
 * /console on the server, so there is no flash of console UI before a
 * redirect, and it is the same mechanism real auth will use.
 */
export const SESSION_COOKIE = "vv_temp_session";

/** Remembered sessions last 30 days; otherwise it's a browser session. */
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

/** How long the fake network round-trip takes, in ms. */
const FAKE_LATENCY_MS = 900;

/** Derives a presentable display name from an email local part. */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._\-+]+/).filter(Boolean);
  if (words.length === 0) return "League Staff";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Builds the stand-in user for an email. Pure, so it is safe to unit test. */
export function buildTemporaryUser(email: string): TemporaryUser {
  const normalised = email.trim().toLowerCase();
  return {
    id: "temp-user",
    email: normalised,
    name: displayNameFromEmail(normalised),
    role: "admin",
  };
}

/** Cookie-safe encoding. Percent-encoding works identically everywhere. */
export function encodeSession(user: TemporaryUser): string {
  return encodeURIComponent(JSON.stringify(user));
}

/** Inverse of {@link encodeSession}. Returns null on anything malformed. */
export function decodeSession(raw: string | undefined | null): TemporaryUser | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return null;
    const u = parsed as Partial<TemporaryUser>;
    if (typeof u.id !== "string" || typeof u.email !== "string") return null;
    return {
      id: u.id,
      email: u.email,
      name: typeof u.name === "string" ? u.name : displayNameFromEmail(u.email),
      role: typeof u.role === "string" ? u.role : "admin",
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- *
 * Browser-side session storage                                      *
 * ---------------------------------------------------------------- *
 *
 * These few cookie helpers are duplicated in the fan auth module on
 * purpose. Each temporary layer stays dependency-free so it can be
 * deleted or replaced on its own, and the test runner can strip types
 * from this file without resolving a shared import.
 */

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function writeCookie(name: string, value: string, maxAge?: number) {
  if (typeof document === "undefined") return;
  const parts = [`${name}=${value}`, "path=/", "SameSite=Lax"];
  if (typeof maxAge === "number") parts.push(`max-age=${maxAge}`);
  if (typeof location !== "undefined" && location.protocol === "https:") {
    parts.push("Secure");
  }
  document.cookie = parts.join("; ");
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

/** Same-tab pub/sub so nav bars re-read the session the moment it changes. */
function announce(event: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(event));
}

function subscribe(event: string, listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}

/** Event name broadcast when the staff session changes. */
const AUTH_EVENT = "vv:temp-auth";

/* ---------------------------------------------------------------- *
 * Public API                                                        *
 * ---------------------------------------------------------------- */

/**
 * Simulates signing in. Credentials are NOT verified: any syntactically
 * valid pair succeeds. The delay exists so the UI's loading state is
 * exercised the way it will be against a real provider.
 */
export async function login({
  email,
  remember = false,
}: LoginInput): Promise<TemporaryUser> {
  await new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));
  const user = buildTemporaryUser(email);
  writeCookie(
    SESSION_COOKIE,
    encodeSession(user),
    remember ? REMEMBER_MAX_AGE : undefined,
  );
  announce(AUTH_EVENT);
  return user;
}

/** Clears the temporary session. No provider call, because there isn't one yet. */
export function logout(): void {
  clearCookie(SESSION_COOKIE);
  announce(AUTH_EVENT);
}

/** The signed-in stand-in user, or null. */
export function getTemporaryUser(): TemporaryUser | null {
  return decodeSession(readCookie(SESSION_COOKIE));
}

/** Whether a temporary session exists. */
export function isAuthenticated(): boolean {
  return getTemporaryUser() !== null;
}

/** Subscribes to session changes in this tab. Returns an unsubscribe fn. */
export function onAuthChange(listener: () => void): () => void {
  return subscribe(AUTH_EVENT, listener);
}
