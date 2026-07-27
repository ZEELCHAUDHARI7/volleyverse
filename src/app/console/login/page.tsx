"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import {
  getSupabase,
  isSupabaseConfigured,
} from "@/lib/providers/supabase-client";
import { CALLBACK_PATH } from "@/lib/auth-routes";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

/**
 * Sign-in shell: a full-bleed split screen. The left half is the brand
 * panel — court-line grid, drifting orbs, film grain and the ghosted
 * wordmark, all pure CSS from globals.css, no image assets. The right
 * half carries whichever sign-in state is active.
 *
 * Below `lg` the brand panel is dropped and the backdrop textures carry
 * the page on their own, so the small-screen view still reads designed.
 */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="court-lines grain relative grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="orb orb-accent left-[-18%] top-[-10%] h-[460px] w-[460px]" />
          <div className="orb orb-violet bottom-[-20%] left-[22%] h-[420px] w-[420px]" />
        </div>

        <span className="relative text-[11px] font-bold uppercase tracking-[0.32em] text-dim">
          VolleyVerse — League Operations
        </span>

        <div className="relative">
          <div className="hero-type hero-outline text-[clamp(3.5rem,8.5vw,7.5rem)] leading-[0.82]">
            <span className="block">Volley</span>
            <span className="block">Verse</span>
          </div>
          <span className="stat-display mt-5 inline-block rounded-md bg-accent/15 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.28em] text-accent ring-1 ring-accent/25">
            Console
          </span>
        </div>

        <p className="relative max-w-sm text-sm leading-relaxed text-dim">
          Match day, live scoring and league setup. Staff access only — the
          public site stays open to everyone.
        </p>
      </aside>

      <div className="relative flex items-center justify-center border-line px-5 py-16 sm:px-10 lg:border-l">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/console";
  const linkError = params.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Enter your email address." });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setStatus({
        kind: "error",
        message: "Supabase is not configured for this deployment.",
      });
      return;
    }

    setStatus({ kind: "sending" });
    const redirect = new URL(CALLBACK_PATH, window.location.origin);
    redirect.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Invite-only: the sign-in form must never create an account.
        shouldCreateUser: false,
        emailRedirectTo: redirect.toString(),
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({ kind: "sent", email: trimmed });
  }

  if (!isSupabaseConfigured()) {
    return (
      <AuthShell>
        <h1 className="stat-display text-xl font-extrabold uppercase tracking-widest text-ink">
          Console sign-in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          This deployment runs in offline mode — no sign-in required. Open the{" "}
          <a className="text-accent underline" href="/console">
            console
          </a>{" "}
          directly.
        </p>
      </AuthShell>
    );
  }

  if (status.kind === "sent") {
    return (
      <AuthShell>
        <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
          Link sent
        </span>
        <h1 className="stat-display mt-3 text-xl font-extrabold uppercase tracking-widest text-ink">
          Check your email
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          We sent a sign-in link to{" "}
          <span className="font-semibold text-ink">{status.email}</span>. Open
          it on this device to enter the console.
        </p>
        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-dim">
          Nothing arrived? The console is invite-only — if this address has not
          been invited, no link is sent. Ask a league admin to invite you.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
        Staff access
      </span>
      <h1 className="stat-display mt-3 text-xl font-extrabold uppercase tracking-widest text-ink">
        Console sign-in
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-dim">
        Enter your invited email and we&rsquo;ll send a one-tap sign-in link.
        No password to remember.
      </p>

      {linkError && status.kind === "idle" && (
        <p role="alert" className="mt-5 text-sm text-err">
          {linkError}
        </p>
      )}

      <label
        htmlFor="email"
        className="mt-8 block text-xs font-bold uppercase tracking-wider text-dim"
      >
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void sendLink();
        }}
        placeholder="you@league.org"
        className="mt-2 w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-dim focus:border-accent/60"
      />

      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-err">
          {status.message}
        </p>
      )}

      <Button
        onClick={() => void sendLink()}
        disabled={status.kind === "sending"}
        className="mt-6 w-full"
      >
        {status.kind === "sending" ? "Sending…" : "Send sign-in link"}
      </Button>

      <p className="mt-6 text-xs leading-relaxed text-dim">
        Looking for scores and standings? The{" "}
        <a className="text-accent underline" href="/">
          public site
        </a>{" "}
        needs no account.
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
