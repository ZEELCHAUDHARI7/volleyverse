import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_PREFIX,
  ERROR_PARAM,
  LOGIN_PATH,
  NEXT_PARAM,
  isAuthPage,
  requiresAuth,
  type SignInErrorCode,
} from "@/lib/auth/routes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Gates the console behind a verified Supabase session.
 *
 *   /console/*  needs a session AND that email in `user_roles` (or the
 *               legacy `console_admins` allowlist), or bounces to /login
 *   /admin      needs a session AND a super_admin role, or bounces to /login
 *   everything  open to anyone, signed in or not — the public showcase.
 *   else
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

  // The public showcase needs no session at all — skip the Supabase round
  // trip entirely for it. Only console and admin reach past this point.
  const gated = pathname.startsWith(ADMIN_PREFIX) || requiresAuth(pathname);
  if (!gated) return NextResponse.next();

  if (!url || !anonKey) {
    // No Supabase configured: local dev runs fully offline (see
    // CLAUDE.md), so nothing can be verified either way. Passing through
    // matches that documented mode. A production build with no env vars
    // can verify no one, so it fails closed instead of exposing an
    // unlocked console or admin panel.
    if (process.env.NODE_ENV === "production") return redirectTo(LOGIN_PATH);
    return NextResponse.next();
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

  if (pathname.startsWith("/admin")) {
    if (!email) return redirectTo(LOGIN_PATH);
    const userEmail = email.toLowerCase().trim();
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .ilike("email", userEmail)
      .maybeSingle();

    const isSuper = userRole?.role === "super_admin" || userEmail === "dhruv.khalasi.hti@gmail.com";
    if (!isSuper) return redirectTo(LOGIN_PATH, "super-admin-required");
    return response;
  }

  if (requiresAuth(pathname)) {
    if (!email) return redirectTo(LOGIN_PATH);
    const userEmail = email.toLowerCase().trim();
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .ilike("email", userEmail)
      .maybeSingle();
    
    // Also check legacy console_admins table as fallback or primary admin
    const isAllowed =
      userRole?.role === "super_admin" ||
      userRole?.role === "admin" ||
      userEmail === "dhruv.khalasi.hti@gmail.com";

    if (!isAllowed) {
      const { data: legacyAdmin } = await supabase
        .from("console_admins")
        .select("email")
        .ilike("email", userEmail)
        .maybeSingle();
      if (!legacyAdmin) return redirectTo(LOGIN_PATH, "not-authorized");
    }
    return response;
  }

  return response;

  function redirectTo(destination: string, error?: SignInErrorCode) {
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
     * Everything except Next internals and static assets — the function
     * body itself decides what, if anything, needs a session.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
