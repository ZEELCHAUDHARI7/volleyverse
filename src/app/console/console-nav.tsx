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
import { SyncStatus } from "@/components/sync-indicator";

/** Console shell nav — two-tier layout with brand mark, controls, and section sub-nav */

/** `short` is the label below sm, where all four tabs must fit one 390 px row. */
const LINKS = [
  { href: "/console", label: "Dashboard", exact: true },
  { href: "/console/league", label: "League Setup", short: "League", exact: false },
  { href: "/console/matches/new", label: "Start Match", short: "Start", exact: false },
  { href: "/console/analytics", label: "Analytics", exact: false },
];

function AccountControls() {
  const router = useRouter();
  const [user, setUser] = useState<TemporaryUser | null>(null);

  useEffect(() => {
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
    <div className="flex items-center gap-2 border-l border-line/60 pl-3">
      <span
        title={user.email}
        className="hidden max-w-[11rem] truncate text-xs font-medium text-dim lg:block"
      >
        {user.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="rounded-lg border border-line/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-dim transition-colors hover:border-accent/40 hover:text-ink whitespace-nowrap"
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
    <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur-md">
      {/* TIER 1: Top Brand & System Controls Bar */}
      <div className="border-b border-line/50 bg-[#070d19]/80">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo & Console Tag */}
          <Link href="/" className="flex items-center gap-2">
            <span aria-hidden className="text-base leading-none">🏐</span>
            <span className="stat-display sr-only text-sm font-extrabold uppercase tracking-widest text-ink sm:not-sr-only">
              Volleytics
            </span>
            <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
              Console
            </span>
          </Link>

          {/* Right System Controls */}
          <div className="flex items-center gap-2">
            <SyncStatus compact />
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-400 hover:bg-amber-500/25 transition-all whitespace-nowrap"
            >
              <span aria-hidden>👑</span>
              <span className="sr-only sm:not-sr-only">Admin Panel</span>
            </Link>

            <Link
              href="/"
              className="hidden rounded-lg border border-line/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-dim transition-colors hover:border-accent/40 hover:text-ink whitespace-nowrap sm:block"
            >
              Public site ↗
            </Link>

            <AccountControls />
          </div>
        </div>
      </div>

      {/* TIER 2: Operational Section Navigation Bar */}
      <div className="bg-[#0b1428]/60">
        <div className="mx-auto flex h-10 w-full max-w-6xl items-center gap-1 px-4 sm:px-6 overflow-x-auto no-scrollbar">
          {LINKS.map((l) => {
            const isActive = active(l);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-2.5 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors sm:px-3.5 ${
                  isActive ? "text-ink font-extrabold" : "text-dim hover:text-ink"
                }`}
              >
                {l.short ? (
                  <>
                    <span aria-hidden className="sm:hidden">
                      {l.short}
                    </span>
                    <span className="sr-only sm:not-sr-only">{l.label}</span>
                  </>
                ) : (
                  l.label
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-sm shadow-accent/50 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
