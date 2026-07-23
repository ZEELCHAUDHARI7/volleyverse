"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { PlayerPosition } from "@/lib/types";
import { POSITION_LABEL } from "@/lib/types";

/** Shared Console UI primitives — token-driven, no hardcoded brand values. */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-premium rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 h-0.5 w-8 rounded-full bg-accent" aria-hidden />
        <h1 className="stat-display text-3xl font-extrabold uppercase tracking-wide">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function BigStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={`stat-display text-4xl font-extrabold ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs uppercase tracking-wider text-dim">
        {label}
      </div>
    </div>
  );
}

const POSITION_COLOR: Record<PlayerPosition, string> = {
  OH: "bg-accent/15 text-accent ring-1 ring-accent/25",
  OPP: "bg-accent/15 text-accent ring-1 ring-accent/25",
  S: "bg-azure/15 text-azure ring-1 ring-azure/25",
  MB: "bg-ok/15 text-ok ring-1 ring-ok/25",
  L: "bg-violet/15 text-violet ring-1 ring-violet/25",
  DS: "bg-violet/15 text-violet ring-1 ring-violet/25",
};

export function PositionTag({
  position,
  short = false,
}: {
  position: PlayerPosition | null;
  short?: boolean;
}) {
  if (position === null) {
    return (
      <span className="rounded-md bg-line/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-dim ring-1 ring-line">
        {short ? "—" : "Not listed"}
      </span>
    );
  }
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${POSITION_COLOR[position]}`}
    >
      {short ? position : POSITION_LABEL[position]}
    </span>
  );
}

export function PublishBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-ok/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ok ring-1 ring-ok/25">
      <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
      Published
    </span>
  ) : (
    <span className="rounded-md bg-line/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-dim">
      Private
    </span>
  );
}

const BTN_BASE =
  "btn-premium inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold";

const BTN_STYLES = {
  primary: "btn-glow bg-accent text-accent-ink hover:bg-accent-hot",
  ghost:
    "border border-line text-ink hover:border-accent/50 hover:bg-surface2",
  danger: "bg-err/15 text-err ring-1 ring-err/25 hover:bg-err/25",
};

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  return (
    <Link href={href} className={`${BTN_BASE} ${BTN_STYLES[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BTN_BASE} ${BTN_STYLES[variant]} disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/** Filter pill group — the segmented control used across list screens. */
export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`btn-premium min-h-10 rounded-full px-4 text-xs font-bold uppercase tracking-wider transition-colors ${
        active
          ? "bg-accent text-accent-ink shadow-[0_4px_20px_-6px_var(--glow-accent)]"
          : "border border-line text-dim hover:border-accent/40 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="relative flex flex-col items-center gap-3 overflow-hidden py-14 text-center">
      <div className="court-lines absolute inset-0" aria-hidden />
      <span
        aria-hidden
        className="float-slow text-3xl"
        role="presentation"
      >
        🏐
      </span>
      <p className="stat-display relative text-xl font-bold uppercase tracking-wide">
        {title}
      </p>
      {hint && <p className="relative max-w-sm text-sm text-dim">{hint}</p>}
      {action && <div className="relative mt-1">{action}</div>}
    </Card>
  );
}

/** Shimmer placeholder — replaces blank screens while the store hydrates. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Status badge — tones used console-wide (Success, Live, Pending, …). */
const CHIP_TONES = {
  accent: "bg-accent/15 text-accent ring-1 ring-accent/25",
  azure: "bg-azure/15 text-azure ring-1 ring-azure/25",
  ok: "bg-ok/15 text-ok ring-1 ring-ok/25",
  err: "bg-err/15 text-err ring-1 ring-err/25",
  violet: "bg-violet/15 text-violet ring-1 ring-violet/25",
  dim: "bg-line/60 text-dim",
} as const;

export function StatusChip({
  tone = "dim",
  pulse = false,
  children,
}: {
  tone?: keyof typeof CHIP_TONES;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${CHIP_TONES[tone]}`}
    >
      {pulse && (
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

/**
 * Modal — centred glass dialog over a dimmed backdrop. Closes on Escape and
 * backdrop click. Body scroll is locked while open. Pure presentation; the
 * caller owns open/close state.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div className="card-premium relative z-10 w-full max-w-md rounded-3xl p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

/**
 * ConfirmDialog — a Modal specialised for destructive confirmations. Renders
 * a title, message, cancel and confirm buttons. The confirm button defaults
 * to the danger tone. Used by "Delete Match" and any other irreversible action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-title">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${
            tone === "danger"
              ? "bg-err/15 text-err ring-1 ring-err/25"
              : "bg-accent/15 text-accent ring-1 ring-accent/25"
          }`}
        >
          {tone === "danger" ? "⚠️" : "❓"}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="confirm-title"
            className="stat-display text-lg font-bold uppercase tracking-wide"
          >
            {title}
          </h2>
          <div className="mt-1 text-sm text-dim">{message}</div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Console section heading — icon tile, title, optional hint and trailing chip. */
export function SectionHeading({
  icon,
  title,
  hint,
  trailing,
}: {
  icon: string;
  title: string;
  hint?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface2 text-lg ring-1 ring-line"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="stat-display text-lg font-bold uppercase leading-none tracking-wide">
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
      </div>
      {trailing}
    </div>
  );
}
