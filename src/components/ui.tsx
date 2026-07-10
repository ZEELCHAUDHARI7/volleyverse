"use client";

import Link from "next/link";
import type { Role } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";

/** Shared Console UI primitives — token-driven, no hardcoded brand values. */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-4 ${className}`}
    >
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
        <h1 className="stat-display text-3xl font-bold uppercase tracking-wide">
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

const ROLE_COLOR: Record<Role, string> = {
  SPIKER: "bg-accent/15 text-accent",
  SETTER: "bg-azure/15 text-azure",
  CENTRE: "bg-ok/15 text-ok",
};

export function RoleTag({ role }: { role: Role }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ROLE_COLOR[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function PublishBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="rounded-md bg-ok/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ok">
      Published
    </span>
  ) : (
    <span className="rounded-md bg-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-dim">
      Private
    </span>
  );
}

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
  const base =
    "inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors";
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:bg-accent/90"
      : "border border-line text-ink hover:bg-surface2";
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
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
  const base =
    "inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:bg-accent/90"
      : variant === "danger"
        ? "bg-err/15 text-err hover:bg-err/25"
        : "border border-line text-ink hover:bg-surface2";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
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
    <Card className="tile-texture flex flex-col items-center gap-3 py-12 text-center">
      <p className="stat-display text-xl font-bold uppercase tracking-wide">
        {title}
      </p>
      {hint && <p className="max-w-sm text-sm text-dim">{hint}</p>}
      {action}
    </Card>
  );
}
