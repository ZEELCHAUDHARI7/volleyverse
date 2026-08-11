"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Checkbox,
  DemoModeNote,
  Notice,
  OrDivider,
  PasswordField,
  SocialButtons,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";
import { APP_HOME, NEXT_PARAM, safeNext } from "@/lib/auth/routes";
import { login } from "@/lib/auth/temporary-auth";
import {
  hasErrors,
  validateEmail,
  validateLogin,
  validatePassword,
  type FieldErrors,
} from "@/lib/auth/validation";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * The staff sign-in form.
 *
 * Authentication is a temporary stand-in (see src/lib/auth/temporary-auth.ts).
 * This component only ever calls `login()`; when a real provider lands, the
 * import changes and this file does not. Field markup is shared with the
 * fan account forms via @/components/auth-ui.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get(NEXT_PARAM));

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const busy = status === "submitting" || status === "success";

  function blurEmail() {
    setTouched((t) => ({ ...t, email: true }));
    setErrors((e) => ({ ...e, email: validateEmail(email) }));
  }

  function blurPassword() {
    setTouched((t) => ({ ...t, password: true }));
    setErrors((e) => ({ ...e, password: validatePassword(password) }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setNotice(null);
    setFormError(null);
    const found = validateLogin(email, password);
    setErrors(found);
    setTouched({ email: true, password: true });

    if (hasErrors(found)) {
      // Send the caret to the first field that needs attention.
      const target = found.email ? emailId : passwordId;
      document.getElementById(target)?.focus();
      return;
    }

    setStatus("submitting");
    try {
      await login({ email, password, remember });
      setStatus("success");
      router.replace(next || APP_HOME);
      router.refresh();
    } catch {
      setStatus("error");
      setFormError("Something went wrong signing you in. Try again.");
    }
  }

  return (
    <div className="w-full max-w-[26rem]">
      {/* Compact brand mark. Carries identity where the panel is hidden. */}
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2.5 lg:hidden"
      >
        <span aria-hidden className="text-lg leading-none">
          🏐
        </span>
        <span className="stat-display text-sm font-extrabold uppercase tracking-[0.28em] text-ink">
          VolleyVerse
        </span>
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
          Console
        </span>
      </Link>

      <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
        Staff access
      </span>
      <h1 className="stat-display mt-3 text-3xl font-extrabold uppercase tracking-wide text-ink sm:text-4xl">
        Welcome back
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-dim">
        Sign in to run match night: live scoring, league setup and analytics.
        A console account opens the public site too, so there is no second
        account to create.
      </p>

      <form onSubmit={submit} noValidate className="mt-9">
        <fieldset disabled={busy} className="contents">
          <TextField
            id={emailId}
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@league.org"
            value={email}
            onChange={setEmail}
            onBlur={blurEmail}
            error={errors.email}
            touched={touched.email}
            autoFocus
          />

          <div className="mt-6">
            <PasswordField
              id={passwordId}
              value={password}
              onChange={setPassword}
              onBlur={blurPassword}
              error={errors.password}
              touched={touched.password}
              hint={
                <button
                  type="button"
                  onClick={() =>
                    setNotice(
                      "No password to reset yet. Sign-in is not connected to a provider, so any 8-character password works.",
                    )
                  }
                  className="text-xs font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  Forgot password?
                </button>
              }
            />
          </div>

          <div className="mt-6">
            <Checkbox id={rememberId} checked={remember} onChange={setRemember}>
              Keep me signed in for 30 days
            </Checkbox>
          </div>

          {formError && <Notice tone="error">{formError}</Notice>}
          {notice && <Notice>{notice}</Notice>}

          <SubmitButton
            status={status}
            idleLabel="Sign in"
            busyLabel="Signing in…"
            doneLabel="Signed in"
          />

          <OrDivider label="or continue with" />
          <SocialButtons
            onPick={(provider) =>
              setNotice(
                `${provider} sign-in is not connected yet. Use your email and password for now.`,
              )
            }
          />
        </fieldset>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-dim">
        New to the console?{" "}
        <button
          type="button"
          onClick={() =>
            setNotice(
              "No account needed yet. Sign-in is not connected to a provider, so any valid email and an 8-character password opens the console.",
            )
          }
          className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          Create an account
        </button>{" "}
        Here for the scores instead?{" "}
        <Link
          href="/fans/join"
          className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          Create a fan account
        </Link>
      </p>

      <DemoModeNote>
        sign-in is not connected to a provider yet. Any valid email and an
        8-character password opens the console.
      </DemoModeNote>
    </div>
  );
}
