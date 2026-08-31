"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Checkbox,
  Notice,
  OrDivider,
  PasswordField,
  SocialButtons,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";
import { APP_HOME, ERROR_PARAM, NEXT_PARAM, safeNext } from "@/lib/auth/routes";
import { login, resetPassword, signInWithGoogle } from "@/lib/auth/temporary-auth";
import {
  hasErrors,
  validateEmail,
  validateLogin,
  validatePassword,
  type FieldErrors,
} from "@/lib/auth/validation";

type Status = "idle" | "submitting" | "success" | "error";

const NOT_AUTHORIZED_MESSAGE =
  "That account doesn't have console access yet. Ask a league admin to add you.";

/**
 * The staff sign-in form.
 *
 * Calls the real Supabase-backed functions in src/lib/auth/temporary-auth.ts
 * — the file name is unchanged from the temporary stand-in it replaced, but
 * the bodies now talk to a real provider. Field markup is shared with the
 * fan account forms via @/components/auth-ui.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get(NEXT_PARAM));
  const errorCode = params.get(ERROR_PARAM);
  const initialError = errorCode
    ? errorCode === "not-authorized"
      ? NOT_AUTHORIZED_MESSAGE
      : errorCode
    : null;

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(initialError);
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
      setFormError("That email and password don't match an account.");
    }
  }

  async function requestReset() {
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors((e) => ({ ...e, email: emailError }));
      setTouched((t) => ({ ...t, email: true }));
      document.getElementById(emailId)?.focus();
      return;
    }
    setFormError(null);
    setNotice(null);
    try {
      await resetPassword(email);
    } catch {
      // Fall through to the same message below — never reveal whether
      // the address has an account.
    }
    setNotice(
      "If an account exists for that address, we've sent a link to reset the password.",
    );
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
                  onClick={requestReset}
                  className="text-xs font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  Forgot password?
                </button>
              }
            />
          </div>

          <div className="mt-6">
            <Checkbox id={rememberId} checked={remember} onChange={setRemember}>
              Keep me signed in
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
            onPick={(provider) => {
              if (provider !== "Google") {
                setNotice(`${provider} sign-in is not connected yet.`);
                return;
              }
              signInWithGoogle(next || APP_HOME).catch(() => {
                setFormError("Something went wrong starting Google sign-in. Try again.");
              });
            }}
          />
        </fieldset>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-dim">
        New here?{" "}
        <Link
          href="/fans/join"
          className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          Create an account
        </Link>
        , then ask a league admin to add you as staff. Here for the scores
        instead?{" "}
        <Link
          href="/fans/sign-in"
          className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          Sign in as a fan
        </Link>
      </p>
    </div>
  );
}
