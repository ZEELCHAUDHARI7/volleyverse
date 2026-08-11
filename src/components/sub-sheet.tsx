"use client";

import { useEffect, useState } from "react";
import { BACK_ROW, FRONT_ROW, type Lineup, type Position, type Side } from "@/lib/rally";
import {
  type LiberoState,
  type SubCount,
  positionOf,
  subOptions,
} from "@/lib/substitution";
import type { Player } from "@/lib/types";
import { PositionTag } from "@/components/ui";

/**
 * SUB — the coach's control, always on screen during a live match.
 *
 * Two taps and a confirm: which team, who comes off, who comes on. The
 * incoming player takes the outgoing player's EXACT rotation slot, so rotation
 * carries on from there untouched — that guarantee lives in
 * `applySub` (substitution.ts); this component only collects the choice.
 *
 * The libero is deliberately NOT substitutable here. Their swap is automatic
 * and driven by who holds the serve, so the libero's slot is locked and the
 * sheet says so rather than silently ignoring a tap.
 */

export function SubControl({
  homeName,
  awayName,
  usLineup,
  oppLineup,
  usLibero,
  oppLibero,
  usLiberoId,
  oppLiberoId,
  homeRoster,
  awayRoster,
  subs,
  onSub,
  disabled = false,
  disabledReason,
}: {
  homeName: string;
  awayName: string;
  usLineup: Lineup;
  oppLineup: Lineup;
  usLibero: LiberoState;
  oppLibero: LiberoState;
  usLiberoId: string | null;
  oppLiberoId: string | null;
  homeRoster: Player[];
  awayRoster: Player[];
  subs: SubCount;
  /** Apply the swap. The screen owns the state; this component owns the choice. */
  onSub: (side: Side, outId: string, inId: string) => void;
  /** Set while the ball is live — a substitution is requested at a dead ball. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("US");
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);

  // A clean choice on any change of team, on reopening, and whenever the court
  // itself moves underneath the sheet (another tab scoring a point, an automatic
  // libero swap) — a stale selection is the one way this could sub the wrong
  // player. `applySub` refuses an impossible pair as well, so this is belt and
  // braces rather than the only guard.
  useEffect(() => {
    setOutId(null);
    setInId(null);
  }, [side, open, usLineup, oppLineup, usLibero, oppLibero]);

  const roster = side === "US" ? homeRoster : awayRoster;
  const lineup = side === "US" ? usLineup : oppLineup;
  const libero = side === "US" ? usLibero : oppLibero;
  const liberoId = side === "US" ? usLiberoId : oppLiberoId;
  const used = side === "US" ? subs.us : subs.opp;

  const byId = new Map(roster.map((p) => [p.id, p]));
  const opts = subOptions(
    roster.map((p) => p.id),
    lineup,
    liberoId,
    libero,
  );

  const label = (pid: string | null) => {
    const p = pid ? byId.get(pid) : undefined;
    if (!p) return "—";
    return `${p.jerseyNo !== null ? `#${p.jerseyNo} ` : ""}${p.fullName.split(" ")[0]}`;
  };

  const outSlot: Position | null = outId ? positionOf(lineup, outId) : null;
  const ready = !!outId && !!inId;

  /**
   * A libero with no Middle Blocker anywhere in the six can never be swapped in
   * — the automatic cycle would silently do nothing. Say so instead, here where
   * the coach is already looking at the court.
   */
  const noMiddleBlocker =
    !!liberoId &&
    !opts.onCourt.some(
      (s) => !s.isLibero && byId.get(s.playerId)?.position === "MB",
    ) &&
    byId.get(libero.replacedId ?? "")?.position !== "MB";

  const confirm = () => {
    // Re-check on confirm, not just on open: the ball can go live under an open
    // sheet when a second collector is scoring the same match from another tab.
    if (disabled || !outId || !inId) return;
    onSub(side, outId, inId);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : "Substitute a player"}
        onClick={() => setOpen(true)}
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-azure/40 bg-azure/10 px-4 text-sm font-bold uppercase tracking-wide text-azure disabled:opacity-30"
      >
        ⇄ Sub
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/85 px-3 pb-3 backdrop-blur sm:items-center sm:pb-0">
          <div className="card-premium max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="stat-display text-lg font-extrabold uppercase tracking-wide text-ink">
                  Substitution
                </p>
                <p className="text-xs text-dim">
                  The player coming on takes the same rotation slot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-10 rounded-xl border border-line px-3 text-xs font-semibold text-dim"
              >
                Close
              </button>
            </div>

            {/* Which team */}
            <div className="mb-4 flex gap-2">
              {(["US", "OPP"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`flex min-h-12 flex-1 items-center justify-center rounded-2xl border px-3 text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                    side === s
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-ink"
                  }`}
                >
                  {s === "US" ? homeName : awayName}
                </button>
              ))}
            </div>

            {noMiddleBlocker && (
              <p className="mb-4 rounded-xl border border-violet/40 bg-violet/5 px-3 py-2 text-[11px] leading-relaxed text-violet">
                No Middle Blocker in this six, so the automatic libero swap has
                nobody to replace. Set player positions in League Setup and the
                libero will start cycling with the serve.
              </p>
            )}

            {/* Coming off — the six on court, laid out as the court reads */}
            <p className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
              <span>Coming off · on court</span>
              <span className="tnum normal-case tracking-normal">
                {used} sub{used === 1 ? "" : "s"} this set
              </span>
            </p>
            <p className="mb-1.5 text-center text-[10px] uppercase tracking-widest text-dim">
              ← net →
            </p>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[...FRONT_ROW, ...BACK_ROW].map((pos) => {
                const slot = opts.onCourt.find((s) => s.position === pos)!;
                const p = byId.get(slot.playerId);
                const picked = outId === slot.playerId;
                return (
                  <button
                    key={pos}
                    type="button"
                    disabled={slot.isLibero}
                    onClick={() => setOutId(picked ? null : slot.playerId)}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 text-center transition-all active:scale-[0.97] ${
                      picked
                        ? "border-err bg-err/10 ring-2 ring-err"
                        : slot.isLibero
                          ? "border-violet/40 bg-violet/5 opacity-60"
                          : "border-line bg-surface2/40"
                    }`}
                  >
                    <span className="tnum text-[9px] text-dim">P{pos}</span>
                    {p?.jerseyNo != null && (
                      <span className="stat-display tnum text-lg font-extrabold leading-none">
                        #{p.jerseyNo}
                      </span>
                    )}
                    <span
                      className={`max-w-full truncate leading-tight ${
                        p?.jerseyNo != null
                          ? "text-[10px] text-dim"
                          : "text-[13px] font-bold"
                      }`}
                    >
                      {p?.fullName.split(" ")[0] ?? "—"}
                    </span>
                    {slot.isLibero && (
                      <span className="text-[9px] uppercase tracking-wider text-violet">
                        libero · auto
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* The MB the libero is standing in for: off court, but still owed
                the slot back — so they are substitutable too. */}
            {opts.liberoHeld && (
              <button
                type="button"
                onClick={() =>
                  setOutId(outId === opts.liberoHeld ? null : opts.liberoHeld!)
                }
                className={`mb-3 flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left transition-all ${
                  outId === opts.liberoHeld
                    ? "border-err bg-err/10 ring-2 ring-err"
                    : "border-violet/40 bg-violet/5"
                }`}
              >
                <span className="text-sm font-bold text-ink">
                  {label(opts.liberoHeld)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-violet">
                  off for libero · returns on serve
                </span>
              </button>
            )}

            {/* Coming on — the bench */}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">
              Coming on · bench
            </p>
            {opts.bench.length === 0 ? (
              <p className="mb-3 rounded-xl border border-line px-3 py-3 text-center text-xs text-dim">
                No bench players registered for this team on the match sheet.
              </p>
            ) : (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {opts.bench.map((pid) => {
                  const p = byId.get(pid);
                  const picked = inId === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => setInId(picked ? null : pid)}
                      className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98] ${
                        picked
                          ? "border-ok bg-ok/10 ring-2 ring-ok"
                          : "border-line bg-surface2/40"
                      }`}
                    >
                      <span className="min-w-0">
                        {p?.jerseyNo != null ? (
                          <>
                            <span className="stat-display tnum block text-lg font-extrabold leading-none">
                              #{p.jerseyNo}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] leading-tight text-dim">
                              {p.fullName.split(" ")[0]}
                            </span>
                          </>
                        ) : (
                          <span className="block truncate text-sm font-bold leading-tight">
                            {p?.fullName.split(" ")[0]}
                          </span>
                        )}
                      </span>
                      <PositionTag position={p?.position ?? null} short />
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={!ready || disabled}
              onClick={confirm}
              className="btn-glow flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent text-sm font-extrabold uppercase tracking-wide text-accent-ink disabled:opacity-30"
            >
              {disabled
                ? (disabledReason ?? "Ball is live")
                : ready
                  ? `${label(inId)} on for ${label(outId)}${outSlot ? ` · P${outSlot}` : ""}`
                  : outId
                    ? "Pick who comes on"
                    : "Pick who comes off"}
            </button>
            <p className="mt-2 text-center text-[11px] text-dim">
              Libero swaps are automatic and never counted here.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
