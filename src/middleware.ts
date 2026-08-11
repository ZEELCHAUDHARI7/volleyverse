import { NextResponse, type NextRequest } from "next/server";
import {
  FAN_SIGN_IN_PATH,
  LOGIN_PATH,
  NEXT_PARAM,
  isAuthPage,
  requiresAccount,
  requiresAuth,
} from "@/lib/auth/routes";
import { SESSION_COOKIE } from "@/lib/auth/temporary-auth";
import { FAN_COOKIE } from "@/lib/auth/temporary-fan-auth";

/**
 * Gates the site behind the TEMPORARY session cookies.
 *
 *   /console/*  needs the staff cookie, or bounces to /login
 *   everything  needs either cookie, or bounces to /fans/sign-in
 *   else        (a staff session counts, so console users are not asked
 *               to create a second account)
 *
 * The account pages themselves are always reachable.
 *
 * There is no real authentication yet (see src/lib/auth/temporary-auth.ts
 * and temporary-fan-auth.ts). These checks exist so the app routes
 * correctly, NOT as a security boundary: both cookies are unsigned, and
 * anything genuinely private must be enforced by RLS on the data.
 *
 * When real auth lands, replace the two cookie reads below with verified
 * session checks. The redirect logic does not change.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAuthPage(pathname)) return NextResponse.next();

  const staffed = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const fan = Boolean(request.cookies.get(FAN_COOKIE)?.value);

  if (requiresAuth(pathname)) {
    return staffed ? NextResponse.next() : redirectTo(request, LOGIN_PATH);
  }

  if (requiresAccount(pathname) && !staffed && !fan) {
    return redirectTo(request, FAN_SIGN_IN_PATH);
  }

  return NextResponse.next();

  function redirectTo(req: NextRequest, destination: string) {
    const url = req.nextUrl.clone();
    url.pathname = destination;
    url.search = "";
    url.searchParams.set(NEXT_PARAM, pathname + search);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. The whole site
     * is gated now, so matching narrowly would leave holes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
