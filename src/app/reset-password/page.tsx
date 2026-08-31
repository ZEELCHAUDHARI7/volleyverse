import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Set a new password for your VolleyVerse account.",
};

/**
 * /reset-password: lands here only via the emailed recovery link, after
 * src/app/auth/callback/route.ts verifies it. Shared between staff and
 * fan accounts — see reset-password-form.tsx.
 */
export default function ResetPasswordPage() {
  return (
    <div className="court-lines grain relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16 sm:px-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="orb orb-accent left-[-10%] top-[-20%] h-[420px] w-[420px]" />
        <div className="orb orb-violet bottom-[-25%] right-[-8%] h-[380px] w-[380px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="card-premium rounded-2xl p-6 sm:p-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
            Reset password
          </span>
          <h1 className="stat-display mt-3 text-3xl font-extrabold uppercase tracking-wide text-ink">
            Set a new password
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            Choose a new password for your account. You&apos;ll use it the
            next time you sign in.
          </p>

          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
