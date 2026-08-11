"use client";

import { BACK_ROW, FRONT_ROW, type Lineup, type Position, type Side } from "@/lib/rally";

/**
 * THE COURT — both teams, net between them, tap to act.
 *
 * Shared by the rally tracker and the free-rally tracker. `tappableIds`
 * decides what may be touched: undefined for a read-only preview, null for an
 * open rally where every on-court player is live, or a Set to restrict it.
 */

/** Display metadata for anyone on court. */
export interface CourtPlayer {
  id: string;
  name: string;
  jersey?: number;
  side: Side;
}

// =====================================================================
// COURT BOARD — both teams, net in the middle. Shared by wizard + live.
// =====================================================================

/**
 * Screen layout mirrors a real court seen from the home bench:
 *   away back row  (their P1 = server, top-left)
 *   away front row
 *   ───── net ─────
 *   home front row (P4 P3 P2)
 *   home back row  (P5 P6 P1 — P1 = server, bottom-right)
 */
const OPP_ROWS: Position[][] = [
  [1, 6, 5],
  [2, 3, 4],
];
const US_ROWS: Position[][] = [FRONT_ROW, BACK_ROW];

export function CourtBoard({
  homeName,
  awayName,
  usLineup,
  oppLineup,
  players,
  serving,
  highlightId = null,
  armedId = null,
  tappableIds = undefined,
  onTap,
  liberos,
}: {
  homeName: string;
  awayName: string;
  usLineup: Lineup;
  oppLineup: Lineup;
  players: Map<string, CourtPlayer>;
  serving: Side;
  /** Static highlight (wizard preview: the first server). */
  highlightId?: string | null;
  /** Armed player (live): everyone else fades. */
  armedId?: string | null;
  /**
   * Which players may be tapped right now:
   *   · undefined  → read-only board (wizard preview)
   *   · null       → EVERY on-court player is tappable (open rally)
   *   · Set<id>    → only these ids are tappable, the rest fade (serve lock)
   */
  tappableIds?: Set<string> | null;
  onTap?: (playerId: string, side: Side) => void;
  /**
   * Optional libero row per side. `onCourt` is set by the automatic swap
   * (substitution.ts): while it is true the libero holds a court SLOT, so the
   * tile is the tappable thing and the chip below is a status line. While it is
   * false the libero is genuinely on the bench and cannot touch the ball.
   */
  liberos?: { side: Side; playerId: string; enabled: boolean; onCourt?: boolean }[];
}) {
  const canTap = (pid: string) =>
    !!onTap && !!pid && (tappableIds === null || (!!tappableIds && tappableIds.has(pid)));

  const liberoIdOf = (side: Side) => liberos?.find((l) => l.side === side)?.playerId ?? null;

  const tile = (pos: Position, side: Side) => {
    const lineup = side === "US" ? usLineup : oppLineup;
    const pid = lineup[pos];
    const p = players.get(pid);
    const isServer = pos === 1 && side === serving;
    const isArmed = armedId === pid;
    const isLibero = !!pid && liberoIdOf(side) === pid;
    const tappable = canTap(pid);
    // Fade rule: once a player is armed, everyone else dims; before that, only
    // a restricted set (e.g. serve lock) dims the non-tappable players.
    const faded = armedId
      ? !isArmed
      : tappableIds !== undefined && tappableIds !== null
        ? !tappable
        : false;

    return (
      <button
        key={`${side}${pos}`}
        type="button"
        disabled={!tappable}
        onClick={() => onTap?.(pid, side)}
        className={`relative flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 text-center transition-all duration-200 active:scale-[0.97] ${
          isArmed || highlightId === pid
            ? "border-accent bg-accent/15 ring-2 ring-accent"
            : faded
              ? "border-line/50 bg-surface2/20 opacity-30"
              : isLibero
                ? "border-violet/50 bg-violet/10"
                : "border-line bg-surface2/40"
        }`}
      >
        <span className="tnum text-[9px] text-dim">
          P{pos}
          {isServer ? " · serve" : ""}
        </span>
        {/* The collector reads the jersey off the player's back, so the number
            leads and the name confirms the tap. Where no number is on file the
            name takes the headline slot rather than showing a dead "#—". */}
        {p === undefined ? (
          <span className="stat-display text-xl font-extrabold leading-none">Open</span>
        ) : p.jersey !== undefined ? (
          <>
            <span className="stat-display tnum text-xl font-extrabold leading-none">
              #{p.jersey}
            </span>
            <span className="max-w-full truncate text-[10px] leading-tight text-dim">{p.name}</span>
          </>
        ) : (
          <span className="max-w-full truncate text-[13px] font-bold leading-tight">{p.name}</span>
        )}
        {isServer && (
          <span className="live-ring absolute right-1 top-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        )}
        {isLibero && (
          <span className="absolute left-1 top-1 rounded bg-violet/25 px-1 text-[8px] font-extrabold uppercase leading-tight tracking-wider text-violet">
            L
          </span>
        )}
      </button>
    );
  };

  const liberoChip = (side: Side) => {
    const lib = liberos?.find((l) => l.side === side);
    if (!lib) return null;
    const p = players.get(lib.playerId);
    const isArmed = armedId === lib.playerId;

    // On court: the libero is holding a slot, so the tile above carries the tap
    // and this row is a status line — "who is in, for whom, in which slot" is
    // exactly what a collector needs to trust an automatic swap.
    if (lib.onCourt) {
      const pos = ([1, 2, 3, 4, 5, 6] as Position[]).find(
        (x) => (side === "US" ? usLineup : oppLineup)[x] === lib.playerId,
      );
      return (
        <div
          className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet/40 bg-violet/10 text-xs font-bold ${
            armedId && !isArmed ? "opacity-40" : ""
          }`}
        >
          <span className="rounded bg-violet/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-violet">
            Libero on
          </span>
          {p?.jersey !== undefined && (
            <span className="stat-display tnum text-base font-extrabold text-ink">
              #{p.jersey}
            </span>
          )}
          <span className={p?.jersey !== undefined ? "text-[11px] text-dim" : "text-ink"}>
            {p?.name}
          </span>
          {pos && <span className="tnum text-[10px] text-dim">P{pos}</span>}
        </div>
      );
    }

    // Off court: the automatic swap has the libero on the bench (their team is
    // serving), so they cannot be tapped — shown, not hidden, so the collector
    // can see the system is tracking it.
    const faded = armedId ? !isArmed : !lib.enabled;
    return (
      <button
        type="button"
        disabled={!lib.enabled || !onTap}
        onClick={() => onTap?.(lib.playerId, side)}
        className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all ${
          isArmed
            ? "border-violet bg-violet/15 ring-2 ring-violet"
            : faded
              ? "border-violet/20 opacity-30"
              : "border-violet/40"
        }`}
      >
        <span className="rounded bg-violet/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-violet">
          Libero
        </span>
        {p?.jersey !== undefined && (
          <span className="stat-display tnum text-base font-extrabold">#{p.jersey}</span>
        )}
        <span className={p?.jersey !== undefined ? "text-[11px] text-dim" : ""}>{p?.name}</span>
        <span className="text-[9px] uppercase tracking-wider text-dim">bench</span>
      </button>
    );
  };

  return (
    <div className="card-premium rounded-2xl p-3">
      <p className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
        <span>{awayName}</span>
        {serving === "OPP" && <span className="text-accent">serving</span>}
      </p>
      {liberoChip("OPP")}
      <div className="mt-1.5 space-y-1.5">
        {OPP_ROWS.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map((pos) => tile(pos, "OPP"))}
          </div>
        ))}
      </div>

      {/* The net */}
      <div className="relative my-2.5 flex items-center">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
        <span className="px-2 text-[9px] font-bold uppercase tracking-[0.3em] text-dim">net</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
      </div>

      <div className="space-y-1.5">
        {US_ROWS.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5">
            {row.map((pos) => tile(pos, "US"))}
          </div>
        ))}
      </div>
      <div className="mt-1.5">{liberoChip("US")}</div>
      <p className="mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
        <span>{homeName}</span>
        {serving === "US" && <span className="text-accent">serving</span>}
      </p>
    </div>
  );
}
