import type { Metadata } from "next";
import { StoreProvider } from "@/lib/store";
import { SyncIndicator } from "@/components/sync-indicator";
import { ConsoleNav } from "./console-nav";
import { ConsoleMain } from "./console-main";

export const metadata: Metadata = {
  title: "Console | VolleyVerse",
  description: "League setup, match day and stat entry.",
};

/**
 * Console shell: every /console route talks to the local data store, so
 * the whole segment is wrapped in <StoreProvider>. The store is
 * client/localStorage-backed, so these routes are rendered dynamically
 * rather than statically prerendered at build time.
 *
 * The shell adds the cinematic backdrop, the glass nav and a centered
 * content column — pure presentation around the routed pages.
 */
export const dynamic = "force-dynamic";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <div className="relative min-h-dvh overflow-x-clip">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="orb orb-accent left-[-12%] top-[-8%] h-[420px] w-[420px]" />
          <div className="orb orb-azure right-[-10%] top-[24%] h-[380px] w-[380px]" />
          <div className="orb orb-violet bottom-[-14%] left-[28%] h-[360px] w-[360px]" />
        </div>
        <ConsoleNav />
        <ConsoleMain>{children}</ConsoleMain>
        <SyncIndicator />
      </div>
    </StoreProvider>
  );
}
