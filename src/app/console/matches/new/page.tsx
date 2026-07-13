"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Card, PageHeader, PageSkeleton, RoleTag } from "@/components/ui";

/**
 * Match basics (planning Phase 4): ≤6 fields, squad pre-selected,
 * done in under 2 minutes. Everything match-flow related — toss,
 * starting six, opponent players, court view — lives in the setup
 * wizard on the rally route, which this page hands off to.
 */
export default function NewMatch() {
  const router = useRouter();
  const { ready, db, createMatch } = useStore();
  const [opponent, setOpponent] = useState("");
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [venue, setVenue] = useState("Panaji, Goa");
  const [totalSets, setTotalSets] = useState(5);
  const [roster, setRoster] = useState<Set<string> | null>(null);

  if (!ready) return <PageSkeleton />;
  const selected = roster ?? new Set(db.players.map((p) => p.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRoster(next);
  };

  const valid = opponent.trim().length > 0 && selected.size >= 6;

  const submit = () => {
    const match = createMatch({
      opponent: opponent.trim(),
      dateISO,
      venue: venue.trim(),
      totalSets,
      roster: [...selected],
    });
    router.push(`/console/matches/${match.id}/rally`);
  };

  const inputCls =
    "min-h-12 w-full rounded-xl border border-line bg-surface2 px-4 text-sm text-ink transition-all duration-300 placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--glow-accent)] focus:outline-none";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New Match" subtitle="Setup in under two minutes." />

      <Card className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-dim">
            Opponent
          </span>
          <input
            className={inputCls}
            placeholder="e.g. Chennai Blitz"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-dim">
              Date
            </span>
            <input
              type="date"
              className={inputCls}
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-dim">
              Sets
            </span>
            <select
              className={inputCls}
              value={totalSets}
              onChange={(e) => setTotalSets(Number(e.target.value))}
            >
              <option value={3}>Best of 3</option>
              <option value={4}>4 sets</option>
              <option value={5}>Best of 5</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-dim">
            Venue
          </span>
          <input
            className={inputCls}
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </label>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="stat-display text-lg font-bold uppercase tracking-wide">
            Match Roster
          </h2>
          <span className="tnum text-sm text-dim">{selected.size} selected</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {db.players.map((p) => {
            const on = selected.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex min-h-12 items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                  on
                    ? "border-accent/50 bg-accent/10"
                    : "border-line bg-surface2 opacity-60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="tnum w-7 text-center text-xs font-bold text-dim">
                    #{p.jersey}
                  </span>
                  <span className="text-sm font-semibold">{p.name}</span>
                </span>
                <RoleTag role={p.role} />
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex gap-3">
        <Button onClick={submit} disabled={!valid} className="flex-1">
          Continue → Toss
        </Button>
      </div>
      {!valid && (
        <p className="text-center text-xs text-dim">
          Enter an opponent and keep at least 6 players selected.
        </p>
      )}
    </div>
  );
}
