"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getSupabase,
  isSupabaseConfigured,
} from "@/lib/providers/supabase-client";
import { LOGIN_PATH } from "@/lib/auth-routes";

/** Console shell nav — glass bar with brand mark, section links, the
 *  signed-in account and a route back to the public site. */

const LINKS = [
  { href: "/console", label: "Dashboard", exact: true },
  { href: "/console/league", label: "League Setup", exact: false },
  { href: "/console/matches/new", label: "Start Match", exact: false },
  { href: "/console/analytics", label: "Analytics", exact: false },
];

/** Signed-in email + sign-out. Renders nothing in offline mode. */
function AccountControls() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user.email ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured() || !email) return null;

  async function signOut() {
    await getSupabase()?.auth.signOut();
    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <div className="ml-2 flex items-center gap-2 border-l border-line pl-2">
      <span
        title={email}
        className="hidden max-w-[12rem] truncate text-xs font-semibold text-dim sm:block"
      >
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-lg border border-line px-3 py-2 text-xs font-bold uppercase tracking-wider text-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}

export function ConsoleNav() {
  const pathname = usePathname();
  const onLoginPage = pathname === LOGIN_PATH;
  const active = (l: (typeof LINKS)[number]) =>
    l.exact ? pathname === l.href : pathname.startsWith(l.href);

  return (
    <nav className="glass sticky top-0 z-50">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-base leading-none">🏐</span>
          <span className="stat-display truncate text-sm font-extrabold uppercase tracking-widest text-ink">
            VolleyVerse
          </span>
          <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
            Console
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {!onLoginPage &&
            LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-active={active(l)}
                className={`nav-link rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  active(l) ? "text-ink" : "text-dim hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            ))}
          <Link
            href="/"
            className="ml-2 hidden rounded-lg border border-line px-3 py-2 text-xs font-bold uppercase tracking-wider text-dim transition-colors hover:border-accent/40 hover:text-ink sm:block"
          >
            Public site ↗
          </Link>
          <AccountControls />
        </div>
      </div>
    </nav>
  );
}
