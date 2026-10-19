"use client";

import { useStore } from "@/lib/store";
import type { SyncStatus } from "@/lib/repository";

/**
 * The "are we live?" signal (Issue #3: show when synchronisation is in
 * progress), read from the provider's syncStatus. In local-only mode there is
 * no server to reconcile with, so both render nothing.
 *
 * SyncStatus sits in a header or footer, in the flow of the page: as a
 * floating badge it covered whatever control lay under the bottom-right
 * corner, which on a phone is often the one being reached for.
 */

const META: Record<
  Exclude<SyncStatus, "local" | "error">,
  { label: string; short?: string; color: string; pulse: boolean }
> = {
  connecting: { label: "Connecting…", color: "#f5a623", pulse: true },
  syncing: { label: "Syncing…", color: "#3b82f6", pulse: true },
  synced: { label: "Synced", color: "#22c55e", pulse: false },
  offline: { label: "Offline — changes saved", short: "Offline", color: "#ef4444", pulse: false },
};

/**
 * connecting → syncing → synced → offline. `compact` keeps a phone header to
 * the dot, plus "Offline", which a scorer needs to read; the full label shows
 * from the sm breakpoint.
 */
export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { syncStatus } = useStore();
  if (syncStatus === "local" || syncStatus === "error") return null;
  const meta = META[syncStatus];
  return (
    <span
      role="status"
      aria-live="polite"
      title={meta.label}
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      {compact ? (
        <>
          {meta.short && (
            <span aria-hidden className="sm:hidden">
              {meta.short}
            </span>
          )}
          <span className="sr-only sm:not-sr-only">{meta.label}</span>
        </>
      ) : (
        <span>{meta.label}</span>
      )}
    </span>
  );
}

/**
 * A refused write is not a status dot. The collector is mid-match, trusting
 * the screen; they need to know NOW that the server is dropping what they tap.
 */
export function SyncAlert() {
  const { syncStatus, lastError, rejectedCount, clearErrors, retryRejected } = useStore();
  if (syncStatus !== "error") return null;
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
