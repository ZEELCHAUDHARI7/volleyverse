/**
 * Route constants and the guard predicates for the whole site.
 *
 * Pure string logic, deliberately free of Next.js imports so it can be
 * unit-tested without constructing a request, and so middleware, both
 * sign-in screens and the nav all agree on one set of paths.
 *
 * There are two gates:
 *
 *   /console/*  staff only. Needs a console session.
 *   everything  needs an account of either kind. The showcase is no
 *   else        longer open to anonymous visitors.
 *
 * The account pages themselves are the only routes open to everyone, or
 * the redirects would loop forever.
 */

/** Staff sign-in for the console. */
export const LOGIN_PATH = "/login";

/** Where a successful staff sign-in lands. */
export const APP_HOME = "/console";

/** Everything under this prefix is staff only. */
export const CONSOLE_PREFIX = "/console";

/** Fan-facing account pages on the public showcase. */
export const FAN_SIGN_IN_PATH = "/fans/sign-in";
export const FAN_JOIN_PATH = "/fans/join";

/** Where a successful fan sign-in lands. */
export const PUBLIC_HOME = "/";

/** Query param used to bounce the user back to where they were headed. */
export const NEXT_PARAM = "next";

/** The only routes reachable with no session at all. */
export const AUTH_PAGES: readonly string[] = [
  LOGIN_PATH,
  FAN_SIGN_IN_PATH,
  FAN_JOIN_PATH,
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
 * True when `pathname` needs an account of either kind.
 *
 * That is every page except the console, which has its own stricter
 * gate, and the account pages themselves.
 */
export function requiresAccount(pathname: string): boolean {
  if (isAuthPage(pathname)) return false;
  if (requiresAuth(pathname)) return false;
  return true;
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
