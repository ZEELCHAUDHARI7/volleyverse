import { LinkButton } from "@/components/ui";

/** Every unknown URL, and any notFound() without a not-found page closer to it. */
export default function NotFound() {
  return (
    <div className="court-lines grain relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16 sm:px-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="orb orb-accent left-[-10%] top-[-20%] h-[420px] w-[420px]" />
        <div className="orb orb-violet bottom-[-25%] right-[-8%] h-[380px] w-[380px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="card-premium rounded-2xl p-6 sm:p-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">404</span>
          <h1 className="stat-display mt-3 text-3xl font-extrabold uppercase tracking-wide text-ink">
            Page not found
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            There is no page at this address. It may have moved, or the link may be mistyped.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <LinkButton href="/">Go to the home page</LinkButton>
            <LinkButton href="/console" variant="ghost">
              Open the console
            </LinkButton>
          </div>
        </div>
      </div>
    </div>
  );
}
