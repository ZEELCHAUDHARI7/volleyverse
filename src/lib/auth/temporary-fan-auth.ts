/**
 * TEMPORARY FAN ACCOUNTS (replace me).
 * ====================================
 *
 * The public showcase now has a fan-facing sign-in and sign-up. Like the
 * staff layer in ./temporary-auth.ts, none of it is real: no provider, no
 * database, no verification. A fan session is a cookie holding a display
 * name and an email.
 *
 * Deliberately separate from the staff session:
 *
 *   - different cookie, so a fan is never mistaken for console staff
 *   - a fan session opens the public showcase but never the console
 *   - a staff session counts as an account on the public side, so
 *     console users are not asked to create a second one
 *   - the two can be migrated to real auth independently
 *
 *   fanSignUp()       : create a fan session from name + email
 *   fanLogin()        : create a fan session from email
 *   fanLogout()       : clear it
 *   getTemporaryFan() : who is it?
 *
 * SWAPPING IN REAL AUTH
 * ---------------------
 * Keep the signatures and re-implement the bodies. Both entry points are
 * async and already take the fields a real provider needs, so
 * `signInWithPassword` / `signUp` drop straight in. The forms in
 * src/app/(showcase)/fans/ do not change.
 *
 * NOTE: a development stand-in, not a security boundary. Nothing behind
 * this cookie is private, which is exactly why it is safe for now.
 */

/** What the public site needs to greet a fan. Nothing more. */
export type TemporaryFan = {
  id: string;
  email: string;
  name: string;
};

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

export const FAN_COOKIE = "vv_temp_fan";

/** Fans are casual visitors, so a signed-in fan is remembered for longer. */
const FAN_MAX_AGE = 60 * 60 * 24 * 90;

/** How long the fake network round-trip takes, in ms. */
const FAKE_LATENCY_MS = 900;

/* ---------------------------------------------------------------- *
 * Browser-side session storage                                      *
 * ---------------------------------------------------------------- *
 *
 * These few cookie helpers are duplicated in the staff auth module on
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

/** Event name broadcast when the fan session changes. */
const FAN_EVENT = "vv:temp-fan";

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

/** Pure builder, safe to unit test. */
export function buildTemporaryFan(email: string, name = ""): TemporaryFan {
  const normalised = email.trim().toLowerCase();
  return {
    id: "temp-fan",
    email: normalised,
    name: fanDisplayName(name, normalised),
  };
}

export function encodeFan(fan: TemporaryFan): string {
  return encodeURIComponent(JSON.stringify(fan));
}

export function decodeFan(raw: string | undefined | null): TemporaryFan | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return null;
    const f = parsed as Partial<TemporaryFan>;
    if (typeof f.id !== "string" || typeof f.email !== "string") return null;
    return {
      id: f.id,
      email: f.email,
      name: typeof f.name === "string" ? f.name : fanDisplayName("", f.email),
    };
  } catch {
    return null;
  }
}

function persist(fan: TemporaryFan, remember: boolean) {
  writeCookie(FAN_COOKIE, encodeFan(fan), remember ? FAN_MAX_AGE : undefined);
  announce(FAN_EVENT);
}

/** Simulates a fan signing in. Credentials are NOT verified. */
export async function fanLogin({
  email,
  remember = true,
}: FanLoginInput): Promise<TemporaryFan> {
  await new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));
  const fan = buildTemporaryFan(email);
  persist(fan, remember);
  return fan;
}

/** Simulates creating a fan account. Nothing is written to a database. */
export async function fanSignUp({
  name,
  email,
}: FanSignUpInput): Promise<TemporaryFan> {
  await new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));
  const fan = buildTemporaryFan(email, name);
  persist(fan, true);
  return fan;
}

export function fanLogout(): void {
  clearCookie(FAN_COOKIE);
  announce(FAN_EVENT);
}

export function getTemporaryFan(): TemporaryFan | null {
  return decodeFan(readCookie(FAN_COOKIE));
}

export function isFanSignedIn(): boolean {
  return getTemporaryFan() !== null;
}

export function onFanAuthChange(listener: () => void): () => void {
  return subscribe(FAN_EVENT, listener);
}
