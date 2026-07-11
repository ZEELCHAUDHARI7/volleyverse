"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMatch, useStore } from "@/lib/store";
import { breaksRecord, playerLine } from "@/lib/metrics";
import type { EventType, Player, Role } from "@/lib/types";
import { RoleTag } from "@/components/ui";

/**
 * LIVE ENTRY — the screen the whole product stands on.
 * Design contract (planning Phases 4–5):
 *   · any stat = 2 taps (player → outcome), <3 seconds
 *   · undo replaces confirm (mis-taps WILL happen courtside)
 *   · full-screen: navigation hidden, one Exit control
 *   · every tap persists locally within 100ms (FR1)
 *   · touch targets ≥48px
 */

type Outcome = { type: EventType; label: string; sub: string; tone: "ok" | "mid" | "err" };

const ROLE_OUTCOMES: Record<Role, Outcome[]> = {
  SPIKER: [
    { type: "SPIKE_POINT", label: "Point", sub: "Kill, spike scored", tone: "ok" },
    { type: "SPIKE_IN", label: "In Play", sub: "Good spike, rally continued", tone: "mid" },
    { type: "SPIKE_ERR", label: "Error", sub: "Out / blocked / net", tone: "err" },
  ],
  SETTER: [
    { type: "SET_ASSIST", label: "Assist", sub: "Set led directly to a point", tone: "ok" },
    { type: "SET_GOOD", label: "Good Set", sub: "Accurate, no direct point", tone: "mid" },
    { type: "SET_ERR", label: "Error", sub: "Inaccurate set", tone: "err" },
  ],
  // Digs moved to the universal Defence section — blocks are the role act
  CENTRE: [
    { type: "BLOCK_WIN", label: "Block ✓", sub: "Successful block", tone: "ok" },
    { type: "BLOCK_MISS", label: "Block ✗", sub: "Attempt beaten", tone: "err" },
  ],
};

// Universal sections — every player serves and defends (still 2 taps:
// one sheet, grouped sections, no extra screens)
const SERVE_OUTCOMES: Outcome[] = [
  { type: "SERVE_ACE", label: "Ace", sub: "Untouched, instant point", tone: "ok" },
  { type: "SERVE_IN", label: "In Play", sub: "Serve received", tone: "mid" },
  { type: "SERVE_ERR", label: "Error", sub: "Out / net", tone: "err" },
];
const DIG_OUTCOMES: Outcome[] = [
  { type: "DIG_SUPER", label: "Super Dig", sub: "Impossible ball kept alive", tone: "ok" },
  { type: "DIG_SAVE", label: "Dig", sub: "Ball saved in play", tone: "mid" },
  { type: "DIG_FAIL", label: "Missed", sub: "Ball hits the floor", tone: "err" },
];

function sheetSections(role: Role): { name: string; outcomes: Outcome[] }[] {
  return [
    { name: role === "SPIKER" ? "Attack" : role === "SETTER" ? "Setting" : "Block", outcomes: ROLE_OUTCOMES[role] },
    { name: "Serve", outcomes: SERVE_OUTCOMES },
    { name: "Defence", outcomes: DIG_OUTCOMES },
  ];
}

const TONE_CLS = {
  ok: "bg-ok/15 text-ok border-ok/40",
  mid: "bg-azure/15 text-azure border-azure/40",
  err: "bg-err/15 text-err border-err/40",
};

const EVENT_LABEL: Record<EventType, string> = {
  SPIKE_POINT: "Spike point",
  SPIKE_IN: "Spike in play",
  SPIKE_ERR: "Spike error",
  SET_ASSIST: "Assist",
  SET_GOOD: "Good set",
  SET_ERR: "Set error",
  BLOCK_WIN: "Block",
  BLOCK_MISS: "Block beaten",
  SERVE_ACE: "ACE",
  SERVE_IN: "Serve in play",
  SERVE_ERR: "Serve error",
  DIG_SUPER: "SUPER DIG",
  DIG_SAVE: "Dig",
  DIG_FAIL: "Missed dig",
};

export default function LiveEntry() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, db, completeMatch, addEvent, removeEvent } = useStore();
  const { match, roster, events } = useMatch(id);
  const allEvents = db.events; // season-wide, for live record detection

  const [set, setSet] = useState(1);
  const [picked, setPicked] = useState<Player | null>(null);
  const [lastEvent, setLastEvent] = useState<{
    id: string;
    text: string;
    record?: boolean;
  } | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  if (!ready) return null;
  if (!match) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-dim">Match not found.</p>
      </div>
    );
  }

  const record = (player: Player, type: EventType) => {
    // Season-record check runs against events BEFORE this tap (Suggestion 1 & 2)
    const broke =
      type === "SERVE_ACE"
        ? breaksRecord("aces", allEvents, match.id, player.id)
        : type === "DIG_SUPER"
          ? breaksRecord("superDigs", allEvents, match.id, player.id)
          : false;

    const e = addEvent(match.id, player.id, set, type);
    setPicked(null);
    setPulseId(player.id);
    setTimeout(() => setPulseId(null), 650);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const first = player.name.split(" ")[0];
    setLastEvent(
      broke
        ? {
            id: e.id,
            text: `🏆 NEW SEASON RECORD! ${first}: most ${type === "SERVE_ACE" ? "aces" : "super digs"} in a match!`,
            record: true,
          }
        : { id: e.id, text: `${first} · ${EVENT_LABEL[type]}` },
    );
    undoTimer.current = setTimeout(() => setLastEvent(null), broke ? 8000 : 5000);
  };

  const undo = () => {
    if (!lastEvent) return;
    removeEvent(lastEvent.id);
    setLastEvent(null);
  };

  const endMatch = () => {
    completeMatch(match.id);
    router.push(`/console/matches/${match.id}/review`);
  };

  const byRole: Role[] = ["SPIKER", "SETTER", "CENTRE"];

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-3 pb-28 pt-3">
      {/* Slim header: exit + context + set picker */}
      <header className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/console/matches/${match.id}`}
          className="flex min-h-12 items-center rounded-xl border border-line px-4 text-sm font-semibold text-dim"
        >
          ← Exit
        </Link>
        <div className="text-center">
          <p className="stat-display text-base font-bold uppercase leading-tight">
            vs {match.opponent}
          </p>
          <p className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-widest text-err">
            <span className="live-ring inline-block h-1.5 w-1.5 rounded-full bg-err" />
            Live entry
          </p>
        </div>
        <button
          type="button"
          onClick={endMatch}
          className="flex min-h-12 items-center rounded-xl bg-err/15 px-4 text-sm font-semibold text-err"
        >
          End
        </button>
      </header>

      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: match.totalSets }, (_, i) => i + 1).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSet(s)}
            className={`min-h-12 flex-1 rounded-xl text-sm font-bold transition-colors ${
              s === set
                ? "bg-accent text-accent-ink"
                : "border border-line text-dim"
            }`}
          >
            Set {s}
          </button>
        ))}
      </div>

      {/* Player tiles grouped by role — tap 1 of 2 */}
      <div className="flex-1 space-y-5">
        {byRole.map((role) => {
          const players = roster.filter((p) => p.role === role);
          if (players.length === 0) return null;
          return (
            <section key={role}>
              <div className="mb-2 flex items-center gap-2">
                <RoleTag role={role} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {players.map((p) => {
                  const l = playerLine(p, events);
                  const headline =
                    role === "SPIKER"
                      ? `${l.points} pts`
                      : role === "SETTER"
                        ? `${l.assists} ast`
                        : `${l.blocks} blk`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPicked(p)}
                      className={`card-premium flex min-h-16 items-center justify-between rounded-2xl px-4 py-3 text-left active:scale-[0.98] ${
                        pulseId === p.id ? "vv-pulse" : ""
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-bold leading-tight">
                          {p.name.split(" ")[0]}
                        </span>
                        <span className="tnum text-[11px] text-dim">#{p.jersey}</span>
                      </span>
                      <span className="stat-display tnum text-xl font-extrabold text-accent">
                        {headline}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Outcome sheet — tap 2 of 2 */}
      {picked && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 backdrop-blur-sm"
          onClick={() => setPicked(null)}
        >
          <div
            className="glass sheet-up w-full max-w-lg rounded-t-3xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="stat-display text-xl font-bold uppercase">
                  {picked.name}
                </p>
                <p className="text-xs text-dim">
                  Set {set} · #{picked.jersey}
                </p>
              </div>
              <RoleTag role={picked.role} />
            </div>
            <div className="space-y-3">
              {sheetSections(picked.role).map((section) => (
                <div key={section.name}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
                    {section.name}
                  </p>
                  <div
                    className={`grid gap-2 ${section.outcomes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                  >
                    {section.outcomes.map((o) => (
                      <button
                        key={o.type}
                        type="button"
                        onClick={() => record(picked, o.type)}
                        className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 text-center ${TONE_CLS[o.tone]}`}
                      >
                        <span className="stat-display text-base font-extrabold uppercase">
                          {o.label}
                        </span>
                        <span className="text-[9px] leading-tight opacity-80">
                          {o.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="mt-3 w-full rounded-xl border border-line py-3 text-sm font-semibold text-dim"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Undo snackbar — replaces confirm dialogs */}
      {lastEvent && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            className={`flex w-full max-w-md items-center justify-between rounded-2xl border py-2 pl-4 pr-2 shadow-lg ${
              lastEvent.record
                ? "vv-pulse border-accent bg-accent text-accent-ink"
                : "border-line bg-surface2"
            }`}
          >
            <span className={`text-sm ${lastEvent.record ? "font-bold" : ""}`}>
              {lastEvent.text}
              {lastEvent.record ? "" : " ✓"}
            </span>
            <button
              type="button"
              onClick={undo}
              className={`min-h-10 rounded-xl px-4 text-sm font-bold ${
                lastEvent.record
                  ? "bg-bg text-ink"
                  : "bg-accent text-accent-ink"
              }`}
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
