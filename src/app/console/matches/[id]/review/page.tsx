"use client";

import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import { playerLine } from "@/lib/metrics";
import type { EventType, Player } from "@/lib/types";
import { Card, LinkButton, PageHeader, RoleTag } from "@/components/ui";

/**
 * Post-match review & corrections (FR3): adjust any count inline.
 * "+" adds an event of that type; "−" removes the most recent one.
 * The coach never re-enters a match.
 */

const ROWS: Record<Player["role"], { type: EventType; label: string }[]> = {
  SPIKER: [
    { type: "SPIKE_POINT", label: "Points (kills)" },
    { type: "SPIKE_IN", label: "Spikes in play" },
    { type: "SPIKE_ERR", label: "Spike errors" },
  ],
  SETTER: [
    { type: "SET_ASSIST", label: "Assists" },
    { type: "SET_GOOD", label: "Good sets" },
    { type: "SET_ERR", label: "Set errors" },
  ],
  CENTRE: [
    { type: "BLOCK_WIN", label: "Blocks won" },
    { type: "BLOCK_MISS", label: "Blocks beaten" },
    { type: "DIG_SAVE", label: "Saves" },
  ],
};

export default function ReviewMatch() {
  const { id } = useParams<{ id: string }>();
  const { ready, addEvent, removeLatestOfType } = useStore();
  const { match, roster, events } = useMatch(id);

  if (!ready) return null;
  if (!match) return <p className="text-dim">Match not found.</p>;

  const countOf = (playerId: string, type: EventType) =>
    events.filter((e) => e.playerId === playerId && e.type === type).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review & Corrections"
        subtitle={`vs ${match.opponent} · fix any mis-taps before publishing`}
        action={
          <LinkButton href={`/console/matches/${match.id}`}>
            Match Dashboard →
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {roster.map((p) => {
          const l = playerLine(p, events);
          const summary =
            p.role === "SPIKER"
              ? `${l.points} pts · ${l.successRate ?? "—"}%`
              : p.role === "SETTER"
                ? `${l.assists} ast · ${l.successRate ?? "—"}%`
                : `${l.blocks} blk · ${l.saves} sv`;
          return (
            <Card key={p.id}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="tnum text-xs font-bold text-dim">#{p.jersey}</span>
                  <span className="font-semibold">{p.name}</span>
                  <RoleTag role={p.role} />
                </div>
                <span className="tnum text-xs text-dim">{summary}</span>
              </div>
              <div className="space-y-1.5">
                {ROWS[p.role].map((row) => {
                  const count = countOf(p.id, row.type);
                  return (
                    <div
                      key={row.type}
                      className="flex items-center justify-between rounded-xl bg-surface2 px-3 py-1.5"
                    >
                      <span className="text-sm text-dim">{row.label}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Remove one: ${row.label}`}
                          disabled={count === 0}
                          onClick={() => removeLatestOfType(match.id, p.id, row.type)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-lg text-dim disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="stat-display tnum w-10 text-center text-lg font-bold">
                          {count}
                        </span>
                        <button
                          type="button"
                          aria-label={`Add one: ${row.label}`}
                          onClick={() => addEvent(match.id, p.id, 1, row.type)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-lg text-accent"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
