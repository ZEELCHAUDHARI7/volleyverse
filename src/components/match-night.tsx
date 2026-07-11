"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * MATCH NIGHT effect kit.
 *
 * One concept, many instruments: the visitor walks out of the tunnel
 * into a floodlit arena. Entry = lights igniting. Cursor = a pool of
 * stadium light. Scroll = camera moving through the venue (GSAP scrub).
 * Numbers = LED scoreboards. Honours = banners in the rafters.
 *
 * Perf rules: transform/opacity only, rAF-lerped pointer work,
 * IntersectionObserver gates, prefers-reduced-motion everywhere.
 */

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------------------------------------------ */
/* ENTRY — the floodlights come on                                     */
/* ------------------------------------------------------------------ */

/**
 * Once per session: black screen, three banks of lamps flicker on,
 * the wordmark flashes, the arena is revealed. ~1.7s, then never again.
 */
export function LightsUp({
  wordmark,
  onDone,
}: {
  wordmark: string;
  onDone?: () => void;
}) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (reducedMotion() || sessionStorage.getItem("vv-lights-up")) {
      setState("done");
      doneRef.current?.();
      return;
    }
    setState("running");
    sessionStorage.setItem("vv-lights-up", "1");
    const t = setTimeout(() => {
      setState("done");
      doneRef.current?.();
    }, 1750);
    return () => clearTimeout(t);
  }, []);

  if (state !== "running") return null;

  return (
    <div className="lights-up-overlay" aria-hidden data-done="false">
      <div className="flex flex-col items-center gap-10">
        {/* Three banks of floodlights igniting in sequence */}
        <div className="flex gap-14">
          {[0, 1, 2].map((bank) => (
            <div key={bank} className="flex gap-2">
              {[0, 1, 2, 3].map((lamp) => (
                <span
                  key={lamp}
                  className="ignite h-2.5 w-2.5 rounded-full bg-[var(--brand-flood)] shadow-[0_0_18px_6px_var(--glow-flood),0_0_60px_18px_var(--glow-flood)]"
                  style={{ ["--ignite-d" as string]: `${bank * 260}ms` }}
                />
              ))}
            </div>
          ))}
        </div>
        <p
          className="hero-type ignite text-3xl tracking-[0.14em] text-ink sm:text-4xl"
          style={{ ["--ignite-d" as string]: "620ms" }}
        >
          {wordmark}
        </p>
        <p
          className="data-type ignite text-[10px] uppercase tracking-[0.5em] text-dim"
          style={{ ["--ignite-d" as string]: "900ms" }}
        >
          Lights up
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CURSOR — a pool of stadium light follows the visitor                 */
/* ------------------------------------------------------------------ */

export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    if (window.matchMedia("(pointer: coarse)").matches) return; // touch: skip
    const el = ref.current;
    if (!el) return;

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.3;
    let x = tx;
    let y = ty;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const loop = () => {
      // lazy lerp = the light "swings" behind the cursor like a rig
      x += (tx - x) * 0.07;
      y += (ty - y) * 0.07;
      el.style.setProperty("--spot-x", `${x}px`);
      el.style.setProperty("--spot-y", `${y}px`);
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="cursor-spotlight" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* TYPOGRAPHY — character-by-character headline rise                    */
/* ------------------------------------------------------------------ */

export function CharReveal({
  text,
  lineDelay = 0,
  className = "",
}: {
  text: string;
  lineDelay?: number;
  className?: string;
}) {
  let i = 0;
  return (
    <span className={className} aria-label={text} role="text">
      {text.split("").map((ch, k) => {
        if (ch === " ")
          return (
            <span key={k} aria-hidden>
              {" "}
            </span>
          );
        const d = i++;
        return (
          <span key={k} className="char-reveal" aria-hidden>
            <span
              style={{
                ["--char-i" as string]: d,
                ["--line-d" as string]: `${lineDelay}ms`,
              }}
            >
              {ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CAMERA — GSAP scroll scrub helpers                                   */
/* ------------------------------------------------------------------ */

/** Scroll-linked drift. speed 0.2 = subtle, 1 = strong. Negative = opposite. */
export function Parallax({
  children,
  speed = 0.3,
  className = "",
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: speed * 12 },
        {
          yPercent: speed * -12,
          ease: "none",
          scrollTrigger: { trigger: el, scrub: 0.6 },
        },
      );
    });
    return () => ctx.revert();
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Hero photo camera move: slow push-in as you scroll away. */
export function HeroCamera({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { scale: 1.08, yPercent: 0 },
        {
          scale: 1,
          yPercent: 8,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom top",
            scrub: 0.5,
          },
        },
      );
    });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BROADCAST — countdown, ticker                                        */
/* ------------------------------------------------------------------ */

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

export function LedCountdown({ toISO }: { toISO: string }) {
  const [t, setT] = useState<{ d: number; h: number; m: number; s: number } | null>(
    null,
  );

  useEffect(() => {
    const target = new Date(toISO).getTime();
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setT({
        d: Math.floor(diff / 86_400_000),
        h: Math.floor(diff / 3_600_000) % 24,
        m: Math.floor(diff / 60_000) % 60,
        s: Math.floor(diff / 1000) % 60,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [toISO]);

  const cells: Array<[string, string]> = t
    ? [
        [pad(t.d), "Days"],
        [pad(t.h), "Hrs"],
        [pad(t.m), "Min"],
        [pad(t.s), "Sec"],
      ]
    : [
        ["--", "Days"],
        ["--", "Hrs"],
        ["--", "Min"],
        ["--", "Sec"],
      ];

  return (
    <div className="flex items-start gap-3 sm:gap-4" role="timer" aria-label="Countdown to next match">
      {cells.map(([v, label], i) => (
        <div key={label} className="flex items-start gap-3 sm:gap-4">
          {i > 0 && (
            <span className="led mt-2 text-2xl sm:mt-3 sm:text-4xl" aria-hidden>
              :
            </span>
          )}
          <div className="text-center">
            <div className="scoreboard rounded-lg px-2.5 py-2 sm:px-4 sm:py-3">
              <span className="led text-3xl font-semibold sm:text-5xl">{v}</span>
            </div>
            <p className="data-type mt-2 text-[9px] uppercase tracking-[0.3em] text-dim">
              {label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface TickerItem {
  tag: string; // e.g. "FT"
  text: string; // e.g. "GUARDIANS vs CHENNAI BLITZ"
  detail?: string; // e.g. "R. Naik 14 PTS"
}

/** Bottom-of-hero broadcast results ticker. */
export function BroadcastTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const row = (hidden: boolean) => (
    <div aria-hidden={hidden} className="flex shrink-0 items-center">
      {items.map((it, i) => (
        <span
          key={`${it.text}-${i}`}
          className="data-type flex items-center gap-3 px-7 text-[11px] uppercase tracking-[0.18em]"
        >
          <span className="broadcast-chip bg-accent px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] text-accent-ink">
            {it.tag}
          </span>
          <span className="text-ink/90">{it.text}</span>
          {it.detail && <span className="text-dim">· {it.detail}</span>}
          <span className="text-accent/60" aria-hidden>
            ///
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="ticker-shell relative overflow-hidden py-2.5">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PHYSICAL — tilt cards, magnetic buttons                              */
/* ------------------------------------------------------------------ */

/** Pointer-tracking 3D tilt + inner spotlight. Wrap any card. */
export function TiltCard({
  children,
  className = "",
  max = 7,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    if (reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--tilt-y", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--tilt-x", `${(0.5 - py) * 2 * max}deg`);
    el.style.setProperty("--card-x", `${px * 100}%`);
    el.style.setProperty("--card-y", `${py * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div
      ref={ref}
      className={`tilt-card card-spot ${className}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </div>
  );
}

/** Button that leans toward the cursor. */
export function Magnetic({
  children,
  className = "",
  strength = 0.35,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    if (reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0,0)";
  };

  return (
    <div
      ref={ref}
      className={`magnetic inline-block ${className}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RAFTERS — honours banners                                            */
/* ------------------------------------------------------------------ */

export function RafterBanner({
  title,
  value,
  sub,
  delay = 0,
}: {
  title: string;
  value: string;
  sub?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reducedMotion()) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="overflow-hidden pt-1" style={{ minHeight: 180 }}>
      {shown && (
        <div
          className="banner-drop"
          style={{ ["--drop-d" as string]: `${delay}ms` }}
        >
          {/* the wire */}
          <div className="mx-auto h-5 w-px bg-line" aria-hidden />
          <div
            className="rafter-banner swaying px-5 pb-10 pt-6 text-center"
            style={{ ["--sway-d" as string]: `${delay * 3}ms` }}
          >
            <p className="data-type text-[9px] uppercase tracking-[0.3em] text-dim">
              {title}
            </p>
            <p className="hero-type mt-2 text-4xl text-accent sm:text-5xl">{value}</p>
            {sub && (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/80">
                {sub}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SECTION LANGUAGE                                                     */
/* ------------------------------------------------------------------ */

/** Broadcast-style section kicker: ▶ 02 / THE SQUAD */
export function Kicker({
  index,
  children,
}: {
  index: string;
  children: React.ReactNode;
}) {
  return (
    <p className="data-type mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">
      <span className="broadcast-chip bg-accent px-1.5 py-0.5 text-[9px] text-accent-ink">
        {index}
      </span>
      {children}
      <span aria-hidden className="h-px flex-1 max-w-24 bg-accent/40" />
    </p>
  );
}
