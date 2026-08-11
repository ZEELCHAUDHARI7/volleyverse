"use client";

import { useId, useState } from "react";
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
import { NEXT_PARAM, PUBLIC_HOME, safeNext } from "@/lib/auth/routes";
import { fanLogin } from "@/lib/auth/temporary-fan-auth";
import {
  hasErrors,
  validateEmail,
  validateLogin,
  validatePassword,
  type FieldErrors,
} from "@/lib/auth/validation";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Fan sign-in.
 *
 * Fan accounts are a temporary stand-in (see
 * src/lib/auth/temporary-fan-auth.ts). The showcase is gated behind this
 * form, so a visitor with no account sees it before anything else.
 */
export function FanSignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  // The gate sends signed-out visitors here with ?next=, so a fan lands
  // back on whatever they were trying to read.
  const next = safeNext(params.get(NEXT_PARAM), PUBLIC_HOME);

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
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
      setFormError("Something went wrong signing you in. Try again.");
    }
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
                onClick={() =>
                  setNotice(
                    "No password to reset yet. Fan accounts are not connected to a provider, so any 8-character password works.",
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
          onPick={(provider) =>
            setNotice(
              `${provider} sign-in is not connected yet. Use your email and password for now.`,
            )
          }
        />
      </fieldset>

      <DemoModeNote>
        fan accounts are not connected to a provider yet. Any valid email and
        an 8-character password works, and nothing is stored on a server.
      </DemoModeNote>
    </form>
  );
}
