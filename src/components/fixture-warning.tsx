"use client";

import { Button } from "@/components/ui";

/**
 * A repeat fixture or a past date. Both can be right, so neither is refused,
 * but the normal button stands down and booking takes this second, deliberate
 * press.
 */
export function FixtureWarning({
  warnings,
  confirmLabel,
  onConfirm,
}: {
  warnings: string[];
  confirmLabel: string;
  onConfirm: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3"
    >
      <div className="min-w-0 space-y-1">
        {warnings.map((w) => (
          <p key={w} className="text-sm font-semibold text-ink">
            {w}
          </p>
        ))}
        <p className="text-xs text-dim">Check the fixture, or book it anyway.</p>
      </div>
      <Button variant="ghost" onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  );
}
