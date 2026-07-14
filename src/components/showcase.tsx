"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Player, StatEvent, Match, Db } from "@/lib/types";
import { playerLine } from "@/lib/metrics";
import { PositionTag, Skeleton } from "@/components/ui";
import { useActiveLeague, useStore } from "@/lib/store";

/**
 * Showcase building blocks: cinematic backdrop, scroll-aware navigation,
 * scroll-triggered reveals, count-up tickers, premium player cards.
 * Motion is choreographed but cheap: transform/opacity only,
 * prefers-reduced-motion fully honored.
 */

// ---- Publish boundary for the public site ----
// Everything fan-facing derives ONLY from published matches.
export function usePublished(): {
  ready: boolean;
  db: Db;
  matches: Match[];
  events: StatEvent[];
} {
  const { ready, db } = useStore();
  const matches = db.matches
    .filter((m) => m.published && m.status === "completed")
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const ids = new Set(matches.map((m) => m.id));
  const events = db.events.filter((e) => ids.has(e.matchId));
  return { ready, db, matches, events };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ---- Cinematic layered backdrop: aurora orbs + court grid + grain ----
export function Aurora({ subtle = false }: { subtle?: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${subtle ? "opacity-50" : ""}`}
    >
      <div className="orb orb-accent -top-32 left-[8%] h-[420px] w-[420px]" />
      <div className="orb orb-azure right-[4%] top-[10%] h-[380px] w-[380px]" />
      <div className="orb orb-violet -bottom-24 left-[38%] h-[360px] w-[360px]" />
      <div className="court-lines absolute inset-0" />
    </div>
  );
}

// ---- Kinetic marquee strip ----
export function Marquee({ items }: { items: string[] }) {
  const row = (key: string, hidden = false) => (
    <div key={key} aria-hidden={hidden} className="flex shrink-0 items-center">
      {items.map((t, i) => (
        <span key={`${t}-${i}`} className="flex items-center">
          <span className="stat-display px-6 text-2xl font-extrabold uppercase tracking-wide text-ink/90 sm:text-3xl">
            {t}
          </span>
          <span className="text-accent" aria-hidden>
            ●
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-y border-line bg-raise py-4">
      <div className="marquee-track">
        {row("a")}
        {row("b", true)}
      </div>
      {/* Edge fade */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}

// ---- Scroll reveal (direction + blur aware) ----
export function Reveal({
  children,
  delay = 0,
  from = "up",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  from?: "up" | "left" | "right" | "scale";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hiddenTransform =
    from === "left"
      ? "translateX(-28px)"
      : from === "right"
        ? "translateX(28px)"
        : from === "scale"
          ? "scale(0.94)"
          : "translateY(22px)";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : hiddenTransform,
        filter: shown ? "blur(0)" : "blur(6px)",
        transition: `opacity 700ms cubic-bezier(0.21,1,0.32,1) ${delay}ms, transform 700ms cubic-bezier(0.21,1,0.32,1) ${delay}ms, filter 700ms ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ---- Count-up number (the "expensive feel" trick) ----
export function CountUp({
  value,
  suffix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1100;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(Math.round(value * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={`tnum ${className}`}>
      {display}
      {suffix}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-accent">
      <span aria-hidden className="h-px w-8 bg-accent/60" />
      {children}
    </p>
  );
}

// ---- Scroll-aware public navigation (glass on scroll) ----
const NAV_LINKS = [
  { href: "/live", label: "Live" },
  { href: "/team", label: "Teams" },
  { href: "/matches", label: "Matches" },
];

/** League wordmark, split for the two-tone treatment. Data-driven —
 * falls back to the platform name until a league exists. */
export function useWordmark(): { lead: string; accent: string; full: string } {
  const { league } = useActiveLeague();
  if (!league) return { lead: "Volley", accent: "Verse", full: "VolleyVerse" };
  const words = league.name.trim().split(/\s+/);
  if (words.length === 1) return { lead: "", accent: words[0], full: league.name };
  return {
    lead: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
    full: league.name,
  };
}

function Wordmark() {
  const wm = useWordmark();
  return (
    <Link
      href="/"
      className="stat-display group text-lg font-extrabold uppercase tracking-wide"
    >
      {wm.lead && <>{wm.lead} </>}
      <span className="text-accent transition-all group-hover:drop-shadow-[0_0_12px_var(--glow-accent)]">
        {wm.accent}
      </span>
    </Link>
  );
}

export function ShowcaseNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-500 ${
        scrolled ? "glass shadow-[0_10px_40px_-16px_rgba(0,0,0,0.8)]" : "bg-transparent"
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between px-4 transition-all duration-500 md:px-8 ${
          scrolled ? "h-14" : "h-20"
        }`}
      >
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm font-semibold">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              data-active={pathname.startsWith(l.href)}
              className={`nav-link rounded-lg px-3 py-2 transition-colors ${
                pathname.startsWith(l.href) ? "text-ink" : "text-dim hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/console"
            className="btn-premium ml-2 rounded-xl border border-line px-4 py-2 text-xs uppercase tracking-wider text-dim transition-colors hover:border-accent/60 hover:text-accent"
          >
            Console
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---- Public footer: oversized wordmark, quiet meta ----
export function ShowcaseFooter() {
  const wm = useWordmark();
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div className="court-lines absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-12 md:px-8">
        <p
          aria-hidden
          className="stat-display select-none text-[16vw] font-extrabold uppercase leading-none text-outline sm:text-[7rem] md:text-[9rem]"
        >
          {wm.accent}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-6">
          <p className="text-xs text-dim">
            © {new Date().getFullYear()} {wm.full}
          </p>
          <nav className="flex items-center gap-4 text-xs font-semibold text-dim">
            <Link href="/team" className="transition-colors hover:text-ink">
              Team
            </Link>
            <Link href="/matches" className="transition-colors hover:text-ink">
              Matches
            </Link>
          </nav>
          <p className="text-xs text-dim">
            Powered by <span className="font-semibold text-accent">VolleyVerse</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ---- Loading skeleton for public pages (no more blank flash) ----
export function ShowcaseSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-8 px-4 py-16 md:px-8"
      role="status"
      aria-label="Loading"
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

// ---- Public player card (typographic art direction — no photos needed) ----
export function PlayerCard({
  player,
  events,
  delay = 0,
}: {
  player: Player;
  events: StatEvent[];
  delay?: number;
}) {
  const l = playerLine(player, events);
  const headline =
    player.position === "S"
      ? { n: l.assists, label: "Assists" }
      : player.position === "MB"
        ? { n: l.blocks, label: "Blocks" }
        : player.position === "L" || player.position === "DS"
          ? { n: l.saves, label: "Digs" }
          : { n: l.points, label: "Points" };

  return (
    <Reveal delay={delay}>
      <Link
        href={`/players/${player.id}`}
        className="card-premium shine group relative block overflow-hidden rounded-2xl p-5"
      >
        {/* Ghost jersey numeral — fills with brand color on hover */}
        <span
          aria-hidden
          className="stat-display text-outline pointer-events-none absolute -right-2 -top-8 text-[110px] font-extrabold leading-none transition-all duration-500 group-hover:-translate-y-1 group-hover:text-accent/20 group-hover:[-webkit-text-stroke-color:transparent]"
        >
          {player.jerseyNo ?? "—"}
        </span>
        <div className="relative">
          <PositionTag position={player.position} />
          <p className="stat-display mt-3 text-2xl font-extrabold uppercase leading-none">
            {player.fullName.split(" ")[0]}
            <br />
            <span className="text-accent">
              {player.fullName.split(" ").slice(1).join(" ")}
            </span>
          </p>
          <div className="mt-4 flex items-end gap-4">
            <div>
              <p className="stat-display tnum text-3xl font-extrabold">
                {headline.n}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-dim">
                {headline.label}
              </p>
            </div>
            <div>
              <p className="stat-display tnum text-3xl font-extrabold">
                {l.successRate === null ? "N/A" : `${Math.round(l.successRate)}%`}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-dim">
                Success
              </p>
            </div>
            <span
              aria-hidden
              className="mb-1 ml-auto translate-x-2 text-accent opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
            >
              →
            </span>
          </div>
        </div>
      </Link>
    </Reveal>
  );
}
