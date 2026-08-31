import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/providers/supabase-server";
import {
  CONSOLE_PREFIX,
  FAN_SIGN_IN_PATH,
  LOGIN_PATH,
  NEXT_PARAM,
  PUBLIC_HOME,
  safeNext,
} from "@/lib/auth/routes";

/**
 * Landing route for every link Supabase Auth sends: OAuth (PKCE `code`),
 * and email links (`token_hash`+`type` — signup confirmation, password
 * recovery, magic link). Shared by both the staff and fan flows, since
 * they're one account system underneath (see temporary-auth.ts).
 *
 * A `type=recovery` link always lands on /reset-password regardless of
 * `next`, or the user would be bounced away before setting a new
 * password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  // Default to the public home, never the console — a missing/invalid
  // `next` should never accidentally grant console-flavoured routing.
  const next = safeNext(searchParams.get(NEXT_PARAM), PUBLIC_HOME);
  const fallbackSignIn = next.startsWith(CONSOLE_PREFIX)
    ? LOGIN_PATH
    : FAN_SIGN_IN_PATH;

  const fail = (message: string) => {
    const url = new URL(fallbackSignIn, origin);
    url.searchParams.set(NEXT_PARAM, next);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Sign-in is not available right now.");

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
    if (type === "recovery") {
      const reset = new URL("/reset-password", origin);
      reset.searchParams.set(NEXT_PARAM, next);
      return NextResponse.redirect(reset);
    }
    return NextResponse.redirect(new URL(next, origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(next, origin));
  }

  return fail("That link is invalid or has expired.");
}
