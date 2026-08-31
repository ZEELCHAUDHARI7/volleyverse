"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Notice, PasswordField, StrengthMeter, SubmitButton } from "@/components/auth-ui";
import { NEXT_PARAM, PUBLIC_HOME, safeNext } from "@/lib/auth/routes";
import { getSupabase } from "@/lib/providers/supabase-client";
import { passwordStrength, validatePassword } from "@/lib/auth/validation";

type Status = "idle" | "submitting" | "success" | "error";
type SessionState = "checking" | "ready" | "expired";

/**
 * Sets a new password after a recovery link. Shared between staff and
 * fan accounts — password reset doesn't care which kind of account it
 * is, since they're the same Supabase Auth account underneath.
 *
 * Reached only via src/app/auth/callback/route.ts, which already
 * verified the recovery link and left a session in cookies. If there's
 * no session by the time this mounts, the link was expired or reused.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get(NEXT_PARAM), PUBLIC_HOME);

  const passwordId = useId();
  const [session, setSession] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const busy = status === "submitting" || status === "success";
  const strength = passwordStrength(password);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setSession("expired");
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setSession(data.user ? "ready" : "expired");
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const passwordError = validatePassword(password);
    setError(passwordError);
    setTouched(true);
    if (passwordError) return;

    setFormError(null);
    setStatus("submitting");
    const supabase = getSupabase();
    if (!supabase) {
      setStatus("error");
      setFormError("Sign-in is not available right now.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setStatus("error");
      setFormError("Something went wrong setting your password. Try again.");
      return;
    }
    setStatus("success");
    router.replace(next);
    router.refresh();
  }

  if (session === "checking") return null;

  if (session === "expired") {
    return (
      <div className="mt-8">
        <Notice tone="error">
          This link has expired or was already used. Request a new one from
          the sign-in page.
        </Notice>
        <p className="mt-6 text-center text-sm text-dim">
          <Link
            href="/login"
            className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
          >
            Staff sign in
          </Link>
          {" · "}
          <Link
            href="/fans/sign-in"
            className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
          >
            Fan sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8">
      <fieldset disabled={busy} className="contents">
        <PasswordField
          id={passwordId}
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          onBlur={() => {
            setTouched(true);
            setError(validatePassword(password));
          }}
          error={error}
          touched={touched}
        >
          <StrengthMeter
            score={strength.score}
            label={strength.label}
            visible={password.length > 0}
          />
        </PasswordField>

        {formError && <Notice tone="error">{formError}</Notice>}

        <SubmitButton
          status={status}
          idleLabel="Set new password"
          busyLabel="Saving…"
          doneLabel="Password set"
        />
      </fieldset>
    </form>
  );
}
