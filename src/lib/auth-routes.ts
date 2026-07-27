/**
 * Which paths the auth middleware guards. Pure string logic, kept out of
 * middleware.ts so it can be tested without constructing a Next request.
 */

export const CONSOLE_PREFIX = "/console";
export const LOGIN_PATH = "/console/login";
export const CALLBACK_PATH = "/console/auth/callback";

/** Console paths reachable while signed out — the sign-in plumbing itself. */
export const PUBLIC_CONSOLE_ROUTES: readonly string[] = [
  LOGIN_PATH,
  CALLBACK_PATH,
];

/**
 * True when `pathname` is a console route that demands a session.
 * Everything outside /console (the public showcase) is always false.
 */
export function requiresAuth(pathname: string): boolean {
  const isConsole =
    pathname === CONSOLE_PREFIX || pathname.startsWith(`${CONSOLE_PREFIX}/`);
  if (!isConsole) return false;
  return !PUBLIC_CONSOLE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
