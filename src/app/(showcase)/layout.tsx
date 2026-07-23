import type { Metadata } from "next";
import { StoreProvider } from "@/lib/store";
import { ShowcaseNav, ShowcaseFooter } from "@/components/showcase";
import { SmoothScroll } from "@/components/smooth-scroll";
import { CursorSpotlight } from "@/components/match-night";
import { SyncIndicator } from "@/components/sync-indicator";

export const metadata: Metadata = {
  title: "Live Volleyball | VolleyVerse",
  description:
    "Official stats, standings, teams and match reports, tracked live courtside.",
};

/** Public Showcase shell: the Match Night arena. Zero login. */
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
          <main className="flex-1">{children}</main>
          <ShowcaseFooter />
        </div>
        <SyncIndicator />
      </SmoothScroll>
    </StoreProvider>
  );
}
