import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FanShell } from "../fan-shell";
import { FanSignInForm } from "./fan-sign-in-form";

export const metadata: Metadata = {
  title: "Fan sign in",
  description:
    "Sign in to your VolleyVerse fan account to follow teams and keep match night close.",
};

export default function FanSignInPage() {
  return (
    <FanShell
      eyebrow="Fan account"
      title="Welcome back"
      intro="Sign in to pick up where you left off. Scores, standings, live matches and player pages are all behind your account."
      footer={
        <>
          New here?{" "}
          <Link
            href="/fans/join"
            className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
          >
            Create a fan account
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <FanSignInForm />
      </Suspense>
    </FanShell>
  );
}
