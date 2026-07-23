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
  Exclude<SyncStatus, "local">,
  { label: string; color: string; pulse: boolean }
> = {
  connecting: { label: "Connecting…", color: "#f5a623", pulse: true },
  syncing: { label: "Syncing…", color: "#3b82f6", pulse: true },
  synced: { label: "Synced", color: "#22c55e", pulse: false },
  offline: { label: "Offline — changes saved", color: "#ef4444", pulse: false },
};

export function SyncIndicator() {
  const { syncStatus } = useStore();
  if (syncStatus === "local") return null;

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
