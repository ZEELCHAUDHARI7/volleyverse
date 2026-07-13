"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StoreProvider } from "@/lib/store";

/**
 * Console shell: bottom tab bar on mobile/tablet (one-handed courtside
 * use), sidebar on desktop. Live Entry hides this shell entirely via
 * its own full-screen layout.
 */

const TABS = [
  { href: "/console", label: "Home", icon: "⌂" },
  { href: "/console/players", label: "Players", icon: "▲" },
  { href: "/console/analytics", label: "Season", icon: "◔" },
];

function NavLinks({ vertical = false }: { vertical?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {TABS.map((tab) => {
        const active =
          tab.href === "/console"
            ? pathname === "/console"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-300 ${
              vertical ? "w-full justify-start" : "flex-1 flex-col gap-0.5"
            } ${
              active
                ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/20"
                : "text-dim hover:bg-surface2/60 hover:text-ink"
            }`}
          >
            {vertical && active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-accent"
              />
            )}
            <span aria-hidden className="text-base leading-none">
              {tab.icon}
            </span>
            <span className={vertical ? "" : "text-[11px]"}>{tab.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Both courtside entry screens run full-screen (no nav competing with taps).
  const isLive = pathname.includes("/live") || pathname.includes("/rally");

  return (
    <StoreProvider>
      {isLive ? (
        // Full-screen Live Entry: nothing competes with data entry
        <main className="min-h-dvh">{children}</main>
      ) : (
        <div className="mx-auto flex min-h-dvh max-w-6xl">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
            <Link href="/console" className="group mb-6 block px-2">
              <span className="stat-display block text-xl font-extrabold uppercase leading-tight tracking-wide">
                Goa{" "}
                <span className="text-accent transition-all group-hover:drop-shadow-[0_0_12px_var(--glow-accent)]">
                  Guardians
                </span>
              </span>
              <span className="text-[11px] uppercase tracking-widest text-dim">
                VolleyVerse Console
              </span>
            </Link>
            <NavLinks vertical />
            <Link
              href="/"
              className="mt-auto rounded-xl border border-line px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-dim transition-colors hover:border-accent/50 hover:text-accent"
            >
              ← Public site
            </Link>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <header className="glass sticky top-0 z-40 flex items-center justify-between px-4 py-3 md:hidden">
              <Link
                href="/console"
                className="stat-display text-lg font-extrabold uppercase tracking-wide"
              >
                Goa <span className="text-accent">Guardians</span>
              </Link>
              <span className="text-[10px] uppercase tracking-widest text-dim">
                Console
              </span>
            </header>

            <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
              {children}
            </main>

            {/* Mobile bottom tab bar */}
            <nav className="glass fixed inset-x-0 bottom-0 z-40 flex px-2 py-1 md:hidden">
              <NavLinks />
            </nav>
          </div>
        </div>
      )}
    </StoreProvider>
  );
}
