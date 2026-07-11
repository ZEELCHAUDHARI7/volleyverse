import type { Metadata } from "next";
import { StoreProvider } from "@/lib/store";
import { ShowcaseNav, ShowcaseFooter } from "@/components/showcase";
import { SmoothScroll } from "@/components/smooth-scroll";
import { CursorSpotlight } from "@/components/match-night";

export const metadata: Metadata = {
  title: "Goa Guardians | The Home of Goa Volleyball",
  description:
    "Official stats, players and match reports of the Goa Guardians, Prime Volleyball League.",
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
      </SmoothScroll>
    </StoreProvider>
  );
}
