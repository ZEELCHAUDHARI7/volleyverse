"use client";

import { Button, LinkButton } from "@/components/ui";

/**
 * Shown instead of the setup steps when a live match is opened on a device
 * that does not hold its scoring session. Starting here is still possible —
 * the scoring device may have died — but only after saying what it costs.
 */
export function ScoredElsewhere({
  homeName,
  awayName,
  onScoreHere,
}: {
  homeName: string;
  awayName: string;
  onScoreHere: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.25em] text-err">
        <span className="live-ring inline-block h-1.5 w-1.5 rounded-full bg-err" />
        Live
      </p>
      <p className="stat-display text-xl font-extrabold uppercase text-ink">
        {homeName} v {awayName}
      </p>
      <p className="text-sm text-dim">
        This match is being scored on another device. Its score is not on this one.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <LinkButton href="/live">Watch on the Live page</LinkButton>
        <LinkButton href="/console" variant="ghost">
          Back to console
        </LinkButton>
      </div>
      <div className="mt-4 w-full rounded-xl border border-err/30 bg-err/5 p-3">
        <p className="text-xs text-dim">
          Scoring here starts again at set 1, 0–0, and the Live page will show that score.
        </p>
        <div className="mt-2">
          <Button variant="danger" onClick={onScoreHere}>
            Score from this device anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
