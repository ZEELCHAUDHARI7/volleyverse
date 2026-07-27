"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/ui";
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
      <Card className="mx-auto mt-16 max-w-md">
        <h1 className="stat-display text-lg font-extrabold uppercase tracking-widest text-ink">
          Console sign-in
        </h1>
        <p className="mt-3 text-sm text-dim">
          This deployment runs in offline mode — no sign-in required. Open the{" "}
          <a className="text-accent underline" href="/console">
            console
          </a>{" "}
          directly.
        </p>
      </Card>
    );
  }

  if (status.kind === "sent") {
    return (
      <Card className="mx-auto mt-16 max-w-md">
        <h1 className="stat-display text-lg font-extrabold uppercase tracking-widest text-ink">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-dim">
          We sent a sign-in link to{" "}
          <span className="font-semibold text-ink">{status.email}</span>. Open
          it on this device to enter the console.
        </p>
        <p className="mt-4 text-xs text-dim">
          Nothing arrived? The console is invite-only — if this address has not
          been invited, no link is sent. Ask a league admin to invite you.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-16 max-w-md">
      <h1 className="stat-display text-lg font-extrabold uppercase tracking-widest text-ink">
        Console sign-in
      </h1>
      <p className="mt-2 text-sm text-dim">
        Staff only. Enter your invited email and we&rsquo;ll send a one-tap
        sign-in link.
      </p>

      {linkError && status.kind === "idle" && (
        <p role="alert" className="mt-4 text-sm text-err">
          {linkError}
        </p>
      )}

      <label
        htmlFor="email"
        className="mt-6 block text-xs font-bold uppercase tracking-wider text-dim"
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
        className="mt-2 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-dim focus:border-accent/60"
      />

      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-err">
          {status.message}
        </p>
      )}

      <Button
        onClick={() => void sendLink()}
        disabled={status.kind === "sending"}
        className="mt-5 w-full"
      >
        {status.kind === "sending" ? "Sending…" : "Send sign-in link"}
      </Button>
    </Card>
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
