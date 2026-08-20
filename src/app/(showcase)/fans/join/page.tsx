import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FanShell } from "../fan-shell";
import { FanJoinForm } from "./fan-join-form";

export const metadata: Metadata = {
  title: "Join as a fan",
  description:
    "Create a VolleyVerse fan account to follow teams and keep match night close.",
};

export default function FanJoinPage() {
  return (
    <FanShell
      eyebrow="Fan account"
      title="Join the crowd"
      intro="Create a free account to reach the scores, standings, live matches and player pages, and to follow the teams you care about."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/fans/sign-in"
            className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <FanJoinForm />
      </Suspense>
    </FanShell>
  );
}
