"use client";

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Checkbox,
  Notice,
  OrDivider,
  PasswordField,
  SocialButtons,
  StrengthMeter,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";
import { NEXT_PARAM, PUBLIC_HOME, safeNext } from "@/lib/auth/routes";
import {
  fanSignUp,
  signInWithGoogleAsFan,
} from "@/lib/auth/temporary-fan-auth";
import {
  hasErrors,
  passwordStrength,
  validateEmail,
  validateName,
  validatePassword,
  validateSignUp,
  type FieldErrors,
} from "@/lib/auth/validation";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Fan sign-up. Creates a real Supabase Auth account — see
 * src/lib/auth/temporary-fan-auth.ts.
 */
export function FanJoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Someone gated out of a page can create an account and carry on to it.
  const next = safeNext(params.get(NEXT_PARAM), PUBLIC_HOME);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const termsId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const busy = status === "submitting" || status === "success";
  const strength = passwordStrength(password);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setNotice(null);
    setFormError(null);
    const found = validateSignUp(name, email, password);
    setErrors(found);
    setTouched({ name: true, email: true, password: true });
    if (hasErrors(found)) return;

    if (!accepted) {
      setFormError("Please accept the house rules to create an account.");
      return;
    }

    setStatus("submitting");
    try {
      const { confirmationRequired } = await fanSignUp({ name, email, password });
      setStatus("success");
      if (confirmationRequired) {
        setNotice(
          "Check your email to confirm your account, then sign in.",
        );
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setStatus("error");
      setFormError("Something went wrong creating your account. Try again.");
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8">
      <fieldset disabled={busy} className="contents">
        <TextField
          id={nameId}
          label="Name"
          autoComplete="name"
          placeholder="Ana Rivera"
          value={name}
          onChange={setName}
          onBlur={() => {
            setTouched((t) => ({ ...t, name: true }));
            setErrors((e) => ({ ...e, name: validateName(name) }));
          }}
          error={errors.name}
          touched={touched.name}
          autoFocus
        />

        <div className="mt-6">
          <TextField
            id={emailId}
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            onBlur={() => {
              setTouched((t) => ({ ...t, email: true }));
              setErrors((e) => ({ ...e, email: validateEmail(email) }));
            }}
            error={errors.email}
            touched={touched.email}
          />
        </div>

        <div className="mt-6">
          <PasswordField
            id={passwordId}
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            onBlur={() => {
              setTouched((t) => ({ ...t, password: true }));
              setErrors((e) => ({ ...e, password: validatePassword(password) }));
            }}
            error={errors.password}
            touched={touched.password}
          >
            <StrengthMeter
              score={strength.score}
              label={strength.label}
              visible={password.length > 0}
            />
          </PasswordField>
        </div>

        <div className="mt-6">
          <Checkbox id={termsId} checked={accepted} onChange={setAccepted}>
            I will keep it civil in match threads and accept the league house
            rules.
          </Checkbox>
        </div>

        {formError && <Notice tone="error">{formError}</Notice>}
        {notice && <Notice>{notice}</Notice>}

        <SubmitButton
          status={status}
          idleLabel="Create account"
          busyLabel="Creating account…"
          doneLabel="Account created"
        />

        <OrDivider label="or sign up with" />
        <SocialButtons
          onPick={(provider) => {
            if (provider !== "Google") {
              setNotice(`${provider} sign-up is not connected yet.`);
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
