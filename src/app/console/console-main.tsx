"use client";

import { usePathname } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth-routes";

/**
 * The console's content column. Every routed page gets the centered,
 * padded column — except sign-in, which is a full-bleed cinematic panel
 * and manages its own layout.
 *
 * `children` is passed through as a prop, so the pages it wraps stay
 * server components despite this boundary being client-side.
 */
export function ConsoleMain({ children }: { children: React.ReactNode }) {
  const bare = usePathname() === LOGIN_PATH;

  return (
    <main
      className={
        bare
          ? "relative"
          : "relative mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6"
      }
    >
      {children}
    </main>
  );
}
