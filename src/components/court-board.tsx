"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BACK_ROW, FRONT_ROW, type Lineup, type Position, type Side } from "@/lib/rally";
import {
  type DragDirection,
  DRAG_THRESHOLD,
  HOLD_MS,
  dragDirection,
  dragEngaged,
} from "@/lib/gesture";

/**
 * THE COURT — both teams, net between them, hold and drag to act.
 *
 * Shared by the rally tracker and the free-rally tracker. `tappableIds`
 * decides what may be touched: undefined for a read-only preview, null for an
 * open rally where every on-court player is live, or a Set to restrict it.
 *
 * Two input styles share one press. Hold a player and flick — left, right or
 * up — and the whole action is one gesture; the direction comes from how far
 * the finger travelled, so nothing has to be aimed at and the readout that
 * appears is feedback rather than a target. Lift without travelling and it is
 * still an ordinary tap, which is what keeps the tracker usable with a mouse,
 * and what gives an abandoned drag somewhere harmless to land.
 *
 * A board given no `onDrag` behaves exactly as it always did.
 */

/** Display metadata for anyone on court. */
export interface CourtPlayer {
  id: string;
  name: string;
  jersey?: number;
  side: Side;
}

/** One arm of the drag readout. */
export interface DragChoice {
  glyph: string;
  label: string;
  tone: "ok" | "err" | "azure";
}

/**
 * What the three directions mean for one player, right now.
 *
 * A function of the player rather than a constant, because in the phase-based
 * tracker what a touch means depends on who was touched — a front-row player
 * defending is blocking, and the same tap in the back row is a dig.
 */
export interface DragMenu {
  left: DragChoice;
  right: DragChoice;
  up: DragChoice;
}

/** The answers a drag can produce. NONE never reaches the caller. */
export type DragAnswer = Exclude<DragDirection, "NONE">;

const TONE: Record<DragChoice["tone"], { idle: string; live: string }> = {
  ok: {
    idle: "border-ok/40 bg-ok/10 text-ok",
    live: "border-ok bg-ok/30 text-ok ring-2 ring-ok",
  },
  err: {
    idle: "border-err/40 bg-err/10 text-err",
    live: "border-err bg-err/30 text-err ring-2 ring-err",
  },
  azure: {
    idle: "border-azure/40 bg-azure/10 text-azure",
    live: "border-azure bg-azure/30 text-azure ring-2 ring-azure",
  },
};

/**
 * How far from the held tile each arm of the readout sits, in pixels. Wide
 * enough that the arms clear the tile itself — a scorer has to be able to read
 * the choice and the player they are choosing it for at the same time.
 */
const ARM_X = 132;
const ARM_Y = 104;

/** In-flight gesture. `menu` null means this player is tap-only. */
interface DragState {
  pid: string;
  side: Side;
  menu: DragMenu | null;
  /** Where the finger went down, in client coordinates. */
  ox: number;
  oy: number;
  /** Centre of the held tile — the readout is drawn around this, not the finger. */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  /** True once the readout is on screen: a long-enough hold, or any real travel. */
  live: boolean;
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
  onDrag,
  dragActions,
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
   * A completed hold-and-drag. Supplying this turns the gesture on; the whole
   * press then runs through pointer events, tap included, so one press can
   * never produce both a tap and a drag.
   */
  onDrag?: (playerId: string, side: Side, answer: DragAnswer) => void;
  /**
   * What the three directions mean for this player. Returning null leaves that
   * player tap-only — for anyone whose touch has no three-way answer yet.
   */
  dragActions?: (playerId: string, side: Side) => DragMenu | null;
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

  // ---- Hold and drag ----------------------------------------------------
  const gestures = !!onDrag;
  const [drag, setDrag] = useState<DragState | null>(null);
  const holdTimer = useRef<number | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  // A gesture in flight when the component goes away would otherwise leave a
  // timer pointing at a setState that can no longer land.
  useEffect(() => clearHold, [clearHold]);

  const beginDrag = (
    e: React.PointerEvent<HTMLButtonElement>,
    pid: string,
    side: Side,
  ) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    // Capture so the finger can leave the tile — it has to, since every answer
    // lives outside it — and still deliver move and up to this handler.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Capture unsupported for this pointer. The gesture still resolves from
      // whatever moves do arrive, and a plain tap is unaffected.
    }
    const menu = dragActions?.(pid, side) ?? null;
    clearHold();
    setDrag({
      pid,
      side,
      menu,
      ox: e.clientX,
      oy: e.clientY,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      dx: 0,
      dy: 0,
      live: false,
    });
    if (!menu) return; // tap-only player: nothing to show, nothing to time
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setDrag((d) => (d && d.pid === pid && !d.live ? { ...d, live: true } : d));
    }, HOLD_MS);
  };

  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const { clientX, clientY } = e;
    setDrag((d) => {
      if (!d) return d;
      const dx = clientX - d.ox;
      const dy = clientY - d.oy;
      // A real flick opens the readout without waiting the hold out, so the
      // fast path is never taxed by the delay that exists for the slow one.
      const live = d.live || (!!d.menu && dragEngaged(dx, dy));
      return { ...d, dx, dy, live };
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    clearHold();
    const d = drag;
    setDrag(null);
    if (!d) return;
    const answer =
      d.live && d.menu ? dragDirection(e.clientX - d.ox, e.clientY - d.oy) : "NONE";
    // NONE is not a failure. A press that went nowhere, and a drag pulled down
    // to abandon it, both land on the tap — which opens the panel, where every
    // answer is still reachable and a Back button is already waiting.
    if (answer === "NONE") onTap?.(d.pid, d.side);
    else onDrag?.(d.pid, d.side, answer);
  };

  const cancelDrag = () => {
    clearHold();
    setDrag(null);
  };

  /** Handlers for anything pressable — tiles and the bench libero chip alike. */
  const pressProps = (pid: string, side: Side) =>
    gestures
      ? {
          onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) =>
            beginDrag(e, pid, side),
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: cancelDrag,
          // A long press must not raise the OS text-selection or context menu
          // on top of the readout.
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
          // The court owns vertical movement while a player is held; without
          // this the browser would steal an upward flick to scroll the page.
          style: { touchAction: "none" as const },
        }
      : { onClick: () => onTap?.(pid, side) };

  const liveAnswer: DragDirection =
    drag && drag.live && drag.menu ? dragDirection(drag.dx, drag.dy) : "NONE";

  const tile = (pos: Position, side: Side) => {
    const lineup = side === "US" ? usLineup : oppLineup;
    const pid = lineup[pos];
    const p = players.get(pid);
    const isServer = pos === 1 && side === serving;
    const isArmed = armedId === pid;
    const isHeld = drag?.pid === pid && drag.live;
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
        {...pressProps(pid, side)}
        className={`relative flex min-h-16 select-none flex-col items-center justify-center rounded-xl border px-1 text-center transition-all duration-200 active:scale-[0.97] ${
          isHeld
            ? "z-[70] border-accent bg-accent/25 ring-4 ring-accent"
            : isArmed || highlightId === pid
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
        {...pressProps(lib.playerId, side)}
        className={`flex min-h-10 w-full select-none items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all ${
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

      {drag?.live && drag.menu && (
        <DragReadout
          cx={drag.cx}
          cy={drag.cy}
          menu={drag.menu}
          answer={liveAnswer}
          name={players.get(drag.pid)?.name ?? "Player"}
        />
      )}
    </div>
  );
}

/**
 * THE READOUT — what the finger is currently choosing.
 *
 * Deliberately inert: `pointer-events-none` throughout, because none of this is
 * a target. Hit-testing it would reintroduce exactly the precision problem the
 * gesture exists to remove — the answer is the direction travelled, and these
 * arms only report which one that currently is.
 */
function DragReadout({
  cx,
  cy,
  menu,
  answer,
  name,
}: {
  cx: number;
  cy: number;
  menu: DragMenu;
  answer: DragDirection;
  name: string;
}) {
  const arms: { dir: DragAnswer; choice: DragChoice; x: number; y: number }[] = [
    { dir: "LEFT", choice: menu.left, x: cx - ARM_X, y: cy },
    { dir: "RIGHT", choice: menu.right, x: cx + ARM_X, y: cy },
    { dir: "UP", choice: menu.up, x: cx, y: cy - ARM_Y },
  ];

  const chosen =
    answer === "LEFT"
      ? menu.left.label
      : answer === "RIGHT"
        ? menu.right.label
        : answer === "UP"
          ? menu.up.label
          : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-bg/70 backdrop-blur-[2px]" />
      {arms.map((a) => {
        const live = answer === a.dir;
        const tone = TONE[a.choice.tone];
        return (
          <div
            key={a.dir}
            className={`absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-3 text-center transition-all duration-100 ${
              live ? `${tone.live} scale-110` : `${tone.idle} opacity-70`
            }`}
            style={{ left: a.x, top: a.y }}
          >
            <span className="stat-display text-2xl font-extrabold leading-none">
              {a.choice.glyph}
            </span>
            <span className="text-[10px] font-bold uppercase leading-tight tracking-wider">
              {a.choice.label}
            </span>
          </div>
        );
      })}
      {/* Under the held player, so a scorer whose eyes are on the court rather
          than the screen can confirm the two things that matter in one glance:
          who, and what is about to be recorded. */}
      <div
        className="absolute -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-surface2/95 px-3 py-1 text-[11px] font-bold text-dim"
        style={{ left: cx, top: cy + ARM_Y - 24 }}
      >
        {name} · {chosen ?? "drag to choose  ·  ↓ cancels"}
      </div>
    </div>
  );
}

/** Re-exported so callers can size their own affordances to the same rule. */
export { DRAG_THRESHOLD };
