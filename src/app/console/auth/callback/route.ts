import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/providers/supabase-server";
import { LOGIN_PATH } from "@/lib/auth-routes";

/**
 * Magic-link landing route. Accepts either shape of Supabase email link:
 *
 *   ?token_hash=…&type=…  → verifyOtp   (the recommended SSR flow; needs the
 *                                        email template to send .TokenHash)
 *   ?code=…               → exchangeCodeForSession (PKCE flow)
 *
 * Supporting both means sign-in works whether or not the Magic Link email
 * template has been switched over. Either way the session lands in cookies
 * before we redirect on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const next = searchParams.get("next") ?? "/console";
  // Same-origin relative paths only — never bounce to an attacker-supplied
  // absolute URL handed to us in the query string.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/console";

  const fail = (message: string) => {
    const url = new URL(LOGIN_PATH, origin);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Supabase is not configured.");

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(safeNext, origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(safeNext, origin));
  }

  return fail("That sign-in link is invalid or has expired.");
}
