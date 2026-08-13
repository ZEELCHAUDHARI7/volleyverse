"use client";

import { useStore } from "@/lib/store";
import type { SyncStatus } from "@/lib/repository";

/**
 * SyncIndicator — the ambient "are we live?" badge (Issue #3 requirement:
 * show a loading/sync indicator while synchronisation is in progress).
 *
 * Reads the provider's syncStatus. In local-only mode there is no server
 * to reconcile with, so it renders nothing. In cloud mode it shows a small
 * fixed badge: connecting → syncing → synced → offline.
 */

const META: Record<
  Exclude<SyncStatus, "local" | "error">,
  { label: string; color: string; pulse: boolean }
> = {
  connecting: { label: "Connecting…", color: "#f5a623", pulse: true },
  syncing: { label: "Syncing…", color: "#3b82f6", pulse: true },
  synced: { label: "Synced", color: "#22c55e", pulse: false },
  offline: { label: "Offline — changes saved", color: "#ef4444", pulse: false },
};

export function SyncIndicator() {
  const { syncStatus, lastError, rejectedCount, clearErrors, retryRejected } = useStore();
  if (syncStatus === "local") return null;

  // A refused write is not a badge. The collector is mid-match, trusting the
  // screen; they need to know NOW that the server is dropping what they tap.
  if (syncStatus === "error") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-lg rounded-2xl border border-err bg-err/95 px-4 py-3 text-white shadow-2xl"
      >
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em]">
          Not saved to the server
        </p>
        <p className="mt-1 text-xs leading-relaxed">{lastError}</p>
        <p className="mt-1.5 text-[11px] opacity-90">
          {rejectedCount === 1
            ? "1 write is held on this device"
            : `${rejectedCount} writes are held on this device`}
          . Do not clear this browser&apos;s data. Fix the cause above, then press
          Retry — Dismiss throws them away.
        </p>
        <div className="mt-2 flex gap-2">
          {/* The way back. Without it the promise above is a lie: parked
              writes are never re-sent, so fixing the database would not
              recover a single tap. */}
          <button
            type="button"
            onClick={retryRejected}
            className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-err"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={clearErrors}
            className="rounded-lg border border-white/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const meta = META[syncStatus];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white/90 shadow-lg backdrop-blur"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      <span>{meta.label}</span>
    </div>
  );
}
