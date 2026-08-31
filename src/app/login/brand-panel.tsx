/**
 * The branded half of the split-screen sign-in. Pure presentation with no
 * state and no client JS. Every texture (court lines, orbs, grain, ghosted
 * wordmark) is CSS from globals.css, so there are no image assets to ship.
 *
 * Hidden below `lg`, where the form takes the full viewport and the
 * compact brand mark in the form column carries the identity instead.
 */

const HIGHLIGHTS = [
  {
    stat: "Live",
    label: "Courtside scoring",
    copy: "Tap rallies as they happen. Scoreboards update everywhere at once.",
  },
  {
    stat: "360°",
    label: "Player analytics",
    copy: "Attack efficiency, reception grades and set-by-set momentum.",
  },
  {
    stat: "One",
    label: "League source of truth",
    copy: "Fixtures, rosters and standings maintained in a single console.",
  },
];

export function BrandPanel() {
  return (
    <aside className="court-lines grain relative hidden overflow-hidden border-r border-line bg-raise p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="orb orb-accent left-[-18%] top-[-12%] h-[480px] w-[480px]" />
        <div className="orb orb-violet bottom-[-22%] left-[18%] h-[440px] w-[440px]" />
        <div className="orb orb-azure right-[-16%] top-[38%] h-[360px] w-[360px]" />
      </div>

      <div className="relative flex items-center gap-2.5">
        <span aria-hidden className="text-lg leading-none">
          🏐
        </span>
        <span className="stat-display text-sm font-extrabold uppercase tracking-[0.28em] text-ink">
          VolleyVerse
        </span>
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/25">
          Console
        </span>
      </div>

      <div className="relative">
        <div className="hero-type hero-outline text-[clamp(3.5rem,7.5vw,7rem)] leading-[0.82]">
          <span className="block">Match</span>
          <span className="block">Night</span>
        </div>
        <p className="mt-6 max-w-md text-base leading-relaxed text-dim">
          The operations console behind every whistle: league setup, live
          rally entry and the analytics your staff review before the next
          serve.
        </p>
      </div>

      <ul className="relative grid max-w-md gap-5">
        {HIGHLIGHTS.map((h) => (
          <li key={h.label} className="flex gap-4">
            <span className="stat-display mt-0.5 w-14 shrink-0 text-lg font-extrabold uppercase tracking-wide text-accent">
              {h.stat}
            </span>
            <span className="border-l border-line pl-4">
              <span className="block text-sm font-semibold text-ink">
                {h.label}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-dim">
                {h.copy}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
