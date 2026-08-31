"use client";

import { useId, useState } from "react";
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
import { ERROR_PARAM, NEXT_PARAM, PUBLIC_HOME, safeNext } from "@/lib/auth/routes";
import {
  fanLogin,
  resetFanPassword,
  signInWithGoogleAsFan,
} from "@/lib/auth/temporary-fan-auth";
import {
  hasErrors,
  validateEmail,
  validateLogin,
  validatePassword,
  type FieldErrors,
} from "@/lib/auth/validation";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Fan sign-in. Calls the real Supabase-backed functions in
 * src/lib/auth/temporary-fan-auth.ts. The showcase is gated behind this
 * form, so a visitor with no account sees it before anything else.
 */
export function FanSignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  // The gate sends signed-out visitors here with ?next=, so a fan lands
  // back on whatever they were trying to read.
  const next = safeNext(params.get(NEXT_PARAM), PUBLIC_HOME);
  const errorCode = params.get(ERROR_PARAM);

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(errorCode);
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
    if (hasErrors(found)) return;

    setStatus("submitting");
    try {
      await fanLogin({ email, password, remember });
      setStatus("success");
      router.replace(next);
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
      await resetFanPassword(email);
    } catch {
      // Fall through to the same message below — never reveal whether
      // the address has an account.
    }
    setNotice(
      "If an account exists for that address, we've sent a link to reset the password.",
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8">
      <fieldset disabled={busy} className="contents">
        <TextField
          id={emailId}
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
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
            signInWithGoogleAsFan(next).catch(() => {
              setFormError("Something went wrong starting Google sign-in. Try again.");
            });
          }}
        />
      </fieldset>
    </form>
  );
}
