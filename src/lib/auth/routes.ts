/**
 * Route constants and the guard predicates for the whole site.
 *
 * Pure string logic, deliberately free of Next.js imports so it can be
 * unit-tested without constructing a request, and so middleware, both
 * sign-in screens and the nav all agree on one set of paths.
 *
 * There is one gate: /console/* (staff) and /admin (super admin) need a
 * session; every other page — the public showcase — is open to anyone,
 * signed in or not. A fan account exists for whoever wants one, but no
 * page requires it.
 *
 * The account pages themselves are always reachable, or the redirects
 * would loop forever.
 */

/** Staff sign-in for the console. */
export const LOGIN_PATH = "/login";

/** Where a successful staff sign-in lands. */
export const APP_HOME = "/console";

/** Everything under this prefix is staff only. */
export const CONSOLE_PREFIX = "/console";

/** Super Admin Management Panel prefix. */
export const ADMIN_PREFIX = "/admin";

/** Fan-facing account pages on the public showcase. */
export const FAN_SIGN_IN_PATH = "/fans/sign-in";
export const FAN_JOIN_PATH = "/fans/join";

/** Where a successful fan sign-in lands. */
export const PUBLIC_HOME = "/";

/** Query param used to bounce the user back to where they were headed. */
export const NEXT_PARAM = "next";

/** Query param carrying a SignInErrorCode back to a sign-in form. */
export const ERROR_PARAM = "error";

/** Where Supabase auth links (OAuth, email confirmation, password reset) land. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Builds the redirect target passed to Supabase for any auth link it sends. */
export function buildCallbackUrl(origin: string, next: string): string {
  return `${origin}${AUTH_CALLBACK_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}

/** The only routes reachable with no session at all. AUTH_CALLBACK_PATH
 *  belongs here too: it's how a signed-out visitor gets a session in the
 *  first place (email confirmation, password recovery, OAuth) — gating
 *  it would strand every one of those links before the route ever runs. */
export const AUTH_PAGES: readonly string[] = [
  LOGIN_PATH,
  FAN_SIGN_IN_PATH,
  FAN_JOIN_PATH,
  AUTH_CALLBACK_PATH,
];

/** True for the sign-in and sign-up pages, which must never be gated. */
export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** True when `pathname` needs a console (staff) session. */
export function requiresAuth(pathname: string): boolean {
  return (
    pathname === CONSOLE_PREFIX || pathname.startsWith(`${CONSOLE_PREFIX}/`)
  );
}

/**
 * Sanitises a `?next=` value. Only same-origin relative paths survive,
 * so a crafted query string can never bounce a user to another origin,
 * and never back to an account page (which would loop).
 */
export function safeNext(
  next: string | null | undefined,
  fallback: string = APP_HOME,
): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  const path = next.split("?")[0];
  if (isAuthPage(path)) return fallback;
  return next;
}

const SIGN_IN_ERRORS = {
  "not-authorized": "That account doesn't have console access yet. Ask a league admin to add you.",
  "super-admin-required": "That account can't open the admin panel. Ask a super admin for access.",
  unavailable: "Sign-in is not available right now.",
  "link-invalid": "That link is invalid or has expired.",
  "sign-in-failed": "Sign-in didn't go through. Please try again.",
} as const;

/** What a redirect may put in ERROR_PARAM. */
export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS;

/**
 * The message for an ERROR_PARAM value. Anything that is not a known code gets
 * the generic failure, so text typed into a link is never shown on the page.
 */
export function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(SIGN_IN_ERRORS, code)
    ? SIGN_IN_ERRORS[code as SignInErrorCode]
    : SIGN_IN_ERRORS["sign-in-failed"];
}
