import Link from "next/link";

/**
 * The card the fan account forms sit in.
 *
 * Fan pages live inside the showcase shell, so they inherit the public
 * nav, footer and cinematic backdrop. This adds only the centred card
 * and its heading block, which keeps the two fan pages identical in
 * structure and lets each form worry about fields alone.
 */
export function FanShell({
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden px-4 py-16 sm:py-24 md:px-8">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="orb orb-accent left-[-10%] top-[-20%] h-[420px] w-[420px]" />
        <div className="orb orb-violet bottom-[-25%] right-[-8%] h-[380px] w-[380px]" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <div className="card-premium rounded-2xl p-6 sm:p-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
            {eyebrow}
          </span>
          <h1 className="stat-display mt-3 text-3xl font-extrabold uppercase tracking-wide text-ink">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-dim">{intro}</p>
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-dim">{footer}</p>

        <p className="mt-6 text-center text-xs text-dim">
          League staff?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
          >
            Sign in to the console
          </Link>
        </p>
      </div>
    </div>
  );
}
