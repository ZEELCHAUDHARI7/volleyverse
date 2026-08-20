"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  getTemporaryUser,
  logout,
  onAuthChange,
  type TemporaryUser,
} from "@/lib/auth/temporary-auth";

/** Console shell nav — glass bar with brand mark, section links, the
 *  signed-in account and a route back to the public site. */

const LINKS = [
  { href: "/console", label: "Dashboard", exact: true },
  { href: "/console/league", label: "League Setup", exact: false },
  { href: "/console/matches/new", label: "Start Match", exact: false },
  { href: "/console/analytics", label: "Analytics", exact: false },
];

/**
 * Signed-in identity + sign-out.
 *
 * Reads the TEMPORARY session (src/lib/auth/temporary-auth.ts). When real
 * auth lands, swap those two calls for the provider's user/subscribe API.
 * The markup below is unaffected.
 */
function AccountControls() {
  const router = useRouter();
  const [user, setUser] = useState<TemporaryUser | null>(null);

  useEffect(() => {
    // Read after mount: the session is not available during SSR, and
    // reading it here keeps server and client markup identical.
    let active = true;
    getTemporaryUser().then((u) => {
      if (active) setUser(u);
    });
    const unsubscribe = onAuthChange((u) => {
      if (active) setUser(u);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!user) return null;

  async function signOut() {
    await logout();
    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <div className="ml-2 flex items-center gap-2 border-l border-line pl-2">
      <span
        title={user.email}
        className="hidden max-w-[12rem] truncate text-xs font-semibold text-dim sm:block"
      >
        {user.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="rounded-lg border border-line px-3 py-2 text-xs font-bold uppercase tracking-wider text-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}

export function ConsoleNav() {
  const pathname = usePathname();
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
          {LINKS.map((l) => (
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
