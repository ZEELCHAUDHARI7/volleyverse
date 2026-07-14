import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VolleyVerse",
    template: "%s | VolleyVerse",
  },
  description:
    "Professional volleyball league management. Courtside stat entry, live scoreboards, standings and player analytics.",
};

export const viewport: Viewport = {
  themeColor: "#030509",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Runtime font load with system fallbacks — no build-time network dependency */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Saira+Condensed:wght@600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
