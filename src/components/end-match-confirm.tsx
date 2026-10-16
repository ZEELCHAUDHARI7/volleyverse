"use client";

import { Button } from "@/components/ui";
import type { EndMatchPlan } from "@/lib/end-match";

/** The "End the match now?" step both scoring screens show before ending a match. */
export function EndMatchConfirm({
  plan,
  homeName,
  awayName,
  onConfirm,
  onCancel,
}: {
  plan: EndMatchPlan;
  homeName: string;
  awayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { us: usSets, opp: oppSets } = plan.sets;
  return (
    <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-center">
      <p className="text-sm text-ink">
        End the match now?{" "}
        {plan.winner === null ? (
          <span className="font-semibold">
            Level at {usSets}–{oppSets} on sets — no winner recorded.
          </span>
        ) : (
          <>
            <span className="font-semibold">
              {plan.winner === "US" ? homeName : awayName}
            </span>{" "}
            wins {Math.max(usSets, oppSets)}–{Math.min(usSets, oppSets)} on sets.
          </>
        )}
      </p>
      {plan.bankedSet && (
        <p className="tnum mt-1 text-xs text-dim">
          Set {plan.bankedSet.setNo} is saved, {plan.bankedSet.homePoints}–
          {plan.bankedSet.awayPoints}.
        </p>
      )}
      {plan.unfinishedSet && (
        <p className="tnum mt-1 text-xs text-dim">
          Set {plan.unfinishedSet.setNo} is unfinished at {plan.unfinishedSet.homePoints}–
          {plan.unfinishedSet.awayPoints} and is not saved as a set. Its rallies stay in the
          stats.
        </p>
      )}
      <div className="mt-2 flex justify-center gap-2">
        <Button onClick={onConfirm}>Confirm</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
