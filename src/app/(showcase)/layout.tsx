import type { Metadata } from "next";
import { StoreProvider } from "@/lib/store";
import { ShowcaseNav, ShowcaseFooter } from "@/components/showcase";
import { SmoothScroll } from "@/components/smooth-scroll";
import { CursorSpotlight } from "@/components/match-night";
import { SyncAlert } from "@/components/sync-indicator";

export const metadata: Metadata = {
  // The object form, as in the console layout: a plain string doubles the
  // root suffix here and leaves the pages below with no suffix at all.
  title: { default: "Live Volleyball", template: "%s | Volleytics" },
  description:
    "Official stats, standings, teams and match reports, tracked live courtside.",
};

/** Public Showcase shell: the Match Night arena. Visitors need an account (see middleware.ts). */
export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <SmoothScroll>
        <CursorSpotlight />
        <div className="flex min-h-dvh flex-col">
          <ShowcaseNav />
          {/* Reveal slides content in from the side; until it is on screen that
              offset must not widen the page on a phone. */}
          <main className="flex-1 overflow-x-clip">{children}</main>
          <ShowcaseFooter />
        </div>
        <SyncAlert />
      </SmoothScroll>
    </StoreProvider>
  );
}
