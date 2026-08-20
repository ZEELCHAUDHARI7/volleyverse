"use client";

import { useState } from "react";

/**
 * Shared building blocks for every account form (staff sign-in, fan
 * sign-in, fan sign-up).
 *
 * Presentation only. No auth provider, no routing, no validation rules
 * live here, so these survive the move to real authentication untouched.
 * Icons are inline SVG so the pages ship no extra assets or icon deps.
 */

type FieldState = "neutral" | "valid" | "invalid";

function borderFor(state: FieldState) {
  if (state === "invalid") return "border-err/70 focus-within:border-err";
  if (state === "valid") return "border-ok/45 focus-within:border-ok/70";
  return "border-line focus-within:border-accent/70";
}

export function stateFor(
  value: string,
  error: string | undefined,
  touched: boolean,
): FieldState {
  if (error) return "invalid";
  if (touched && value.trim().length > 0) return "valid";
  return "neutral";
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 flex items-start gap-1.5 text-xs font-medium text-err"
    >
      <span aria-hidden>⚠</span>
      {message}
    </p>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  touched,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  autoFocus,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  touched: boolean;
  type?: "text" | "email";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "email";
  autoFocus?: boolean;
  hint?: React.ReactNode;
}) {
  const state = stateFor(value, error, touched);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="block text-xs font-bold uppercase tracking-wider text-dim"
        >
          {label}
        </label>
        {hint}
      </div>
      <div
        className={`auth-field mt-2 flex items-center rounded-xl border bg-surface/60 ${borderFor(state)}`}
      >
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="min-h-12 w-full rounded-xl bg-transparent px-3.5 text-sm text-ink outline-none placeholder:text-dim/70"
        />
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d="M2.2 12S5.8 5.5 12 5.5 21.8 12 21.8 12 18.2 18.5 12 18.5 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {off && <path d="M4 20 20 4" />}
    </svg>
  );
}

export function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
  onBlur,
  error,
  touched,
  autoComplete = "current-password",
  hint,
  children,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  touched: boolean;
  autoComplete?: string;
  hint?: React.ReactNode;
  /** Rendered under the field, e.g. a strength meter. */
  children?: React.ReactNode;
}) {
  const [reveal, setReveal] = useState(false);
  const state = stateFor(value, error, touched);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="block text-xs font-bold uppercase tracking-wider text-dim"
        >
          {label}
        </label>
        {hint}
      </div>
      <div
        className={`auth-field mt-2 flex items-center rounded-xl border bg-surface/60 ${borderFor(state)}`}
      >
        <input
          id={id}
          type={reveal ? "text" : "password"}
          value={value}
          placeholder="••••••••"
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="min-h-12 w-full rounded-xl bg-transparent px-3.5 text-sm text-ink outline-none placeholder:text-dim/70"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-pressed={reveal}
          aria-label={reveal ? "Hide password" : "Show password"}
          className="mr-1.5 rounded-lg p-2.5 text-dim transition-colors hover:text-ink"
        >
          <EyeIcon off={reveal} />
        </button>
      </div>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </>
  );
}

/** Four-segment strength meter. Purely advisory. */
export function StrengthMeter({
  score,
  label,
  visible,
}: {
  score: number;
  label: string;
  visible: boolean;
}) {
  if (!visible) return null;
  const colour =
    score <= 1 ? "bg-err" : score === 2 ? "bg-accent-hot" : score === 3 ? "bg-accent" : "bg-ok";
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= score ? colour : "bg-line"
            }`}
          />
        ))}
      </div>
      <span className="w-14 text-right text-[11px] font-semibold uppercase tracking-wider text-dim">
        {label}
      </span>
    </div>
  );
}

export function Checkbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="auth-check mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-line bg-surface transition-colors checked:border-accent checked:bg-accent"
      />
      <label
        htmlFor={id}
        className="cursor-pointer select-none text-sm leading-snug text-dim"
      >
        {children}
      </label>
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-err/40 bg-err/10 text-err"
      : "border-line bg-surface/60 text-dim";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`mt-6 rounded-xl border px-3.5 py-3 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SubmitButton({
  status,
  idleLabel,
  busyLabel,
  doneLabel,
  className = "",
}: {
  status: "idle" | "submitting" | "success" | "error";
  idleLabel: string;
  busyLabel: string;
  doneLabel: string;
  className?: string;
}) {
  return (
    <>
      <button
        type="submit"
        className={`btn-premium btn-glow mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold uppercase tracking-wider text-accent-ink hover:bg-accent-hot disabled:pointer-events-none disabled:opacity-60 ${className}`}
      >
        {status === "submitting" && <Spinner />}
        {status === "success" && <span aria-hidden>✓</span>}
        {status === "submitting"
          ? busyLabel
          : status === "success"
            ? doneLabel
            : idleLabel}
      </button>
      <p aria-live="polite" className="sr-only">
        {status === "submitting"
          ? busyLabel
          : status === "success"
            ? doneLabel
            : ""}
      </p>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M16.4 12.7c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.7 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.6-3.9ZM14 4.9c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" />
    </svg>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="my-7 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" aria-hidden />
      <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-dim">
        {label}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

/** Social buttons are UI only. `onPick` reports which one was pressed. */
export function SocialButtons({
  onPick,
}: {
  onPick: (provider: string) => void;
}) {
  const providers = [
    { label: "Google", mark: <GoogleMark /> },
    { label: "Apple", mark: <AppleMark /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {providers.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.label)}
          className="btn-premium inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface/40 px-4 text-sm font-semibold text-ink transition-colors hover:border-accent/45 hover:bg-surface2"
        >
          {p.mark}
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** The standing note that none of this talks to a provider yet. */
export function DemoModeNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-xl border border-dashed border-line px-3.5 py-3 text-xs leading-relaxed text-dim">
      <span className="font-bold uppercase tracking-wider text-accent">
        Demo mode
      </span>{" "}
      {children}
    </p>
  );
}
