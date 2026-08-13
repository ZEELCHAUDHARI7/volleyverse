import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ERROR_PARAM,
  FAN_SIGN_IN_PATH,
  LOGIN_PATH,
  NEXT_PARAM,
  isAuthPage,
  requiresAccount,
  requiresAuth,
} from "@/lib/auth/routes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Gates the site behind a verified Supabase session.
 *
 *   /console/*  needs a session AND that email in `console_admins`, or
 *               bounces to /login
 *   everything  needs any verified session, or bounces to /fans/sign-in
 *   else        (a console admin's session counts there too, so they are
 *               not asked to create a second account)
 *
 * The account pages themselves are always reachable.
 *
 * getClaims() verifies the JWT signature against the project's published
 * keys — never getSession(), whose cookie payload is spoofable. The
 * allowlist check is a second, separate query scoped by RLS to "does a
 * row exist for MY OWN email" (see the console_admins migration), so it
 * can never leak whether some other address is an admin.
 *
 * Routing here is a UX convenience, not the security boundary — RLS on
 * the tables themselves is what actually stops a non-admin from writing,
 * even via a direct API call that bypasses this middleware entirely.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAuthPage(pathname)) return NextResponse.next();

  if (!url || !anonKey) {
    // No Supabase configured: local dev runs fully offline (see
    // CLAUDE.md), so nothing can be verified either way. Passing
    // through matches that documented mode. A production build with no
    // env vars can verify no one, so it fails closed instead of
    // exposing an unlocked console.
    const blocked =
      process.env.NODE_ENV === "production" &&
      (requiresAuth(pathname) || requiresAccount(pathname));
    if (!blocked) return NextResponse.next();
    return redirectTo(requiresAuth(pathname) ? LOGIN_PATH : FAN_SIGN_IN_PATH);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;

  if (requiresAuth(pathname)) {
    if (!email) return redirectTo(LOGIN_PATH);
    const { data: admin } = await supabase
      .from("console_admins")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (!admin) return redirectTo(LOGIN_PATH, "not-authorized");
    return response;
  }

  if (requiresAccount(pathname) && !email) {
    return redirectTo(FAN_SIGN_IN_PATH);
  }

  return response;

  function redirectTo(destination: string, error?: string) {
    const dest = request.nextUrl.clone();
    dest.pathname = destination;
    dest.search = "";
    dest.searchParams.set(NEXT_PARAM, pathname + search);
    if (error) dest.searchParams.set(ERROR_PARAM, error);
    return NextResponse.redirect(dest);
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
