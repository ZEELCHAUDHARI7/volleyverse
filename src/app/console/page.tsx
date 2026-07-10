"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { lines, teamTotals, topBy } from "@/lib/metrics";
import { BigStat, Card, EmptyState, LinkButton, PublishBadge } from "@/components/ui";

export default function ConsoleHome() {
  const { ready, db } = useStore();
  if (!ready) return null;

  const live = db.matches.find((m) => m.status === "live");
  const completed = [...db.matches]
    .filter((m) => m.status === "completed")
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const last = completed[0];
  const lastEvents = last ? db.events.filter((e) => e.matchId === last.id) : [];
  const totals = last ? teamTotals(db.players, lastEvents) : null;
  const mvp = last
    ? topBy(lines(db.players, lastEvents), "contribution")
    : undefined;
  const mvpPlayer = mvp && db.players.find((p) => p.id === mvp.playerId);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="stat-display text-3xl font-bold uppercase tracking-wide">
            Match Day
          </h1>
          <p className="mt-1 text-sm text-dim">
            {live ? "A match is live — jump back in." : "Ready when you are, coach."}
          </p>
        </div>
        {!live && <LinkButton href="/console/matches/new">+ New Match</LinkButton>}
      </div>

      {live && (
        <Card className="vv-pulse border-accent/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-err" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-err">
                  Live
                </span>
              </div>
              <p className="stat-display text-2xl font-bold uppercase">
                vs {live.opponent}
              </p>
              <p className="text-sm text-dim">
                {live.venue} · best of {live.totalSets}
              </p>
            </div>
            <div className="flex gap-2">
              <LinkButton href={`/console/matches/${live.id}/live`}>
                Enter Stats
              </LinkButton>
              <LinkButton href={`/console/matches/${live.id}`} variant="ghost">
                Dashboard
              </LinkButton>
            </div>
          </div>
        </Card>
      )}

      {last && totals && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="stat-display text-lg font-bold uppercase tracking-wide">
              Last Match · vs {last.opponent}
            </h2>
            <PublishBadge published={last.published} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <BigStat label="Team points" value={totals.points} accent />
            <BigStat
              label="Spike success"
              value={totals.spikeRate === null ? "—" : `${totals.spikeRate}%`}
            />
            <BigStat label="Blocks" value={totals.blocks} />
            <BigStat
              label="Top contributor"
              value={mvpPlayer ? mvpPlayer.name.split(" ")[0] : "—"}
            />
          </div>
          <div className="mt-4">
            <LinkButton href={`/console/matches/${last.id}`} variant="ghost">
              Full match dashboard →
            </LinkButton>
          </div>
        </Card>
      )}

      <section>
        <h2 className="stat-display mb-3 text-lg font-bold uppercase tracking-wide">
          Recent Matches
        </h2>
        {completed.length === 0 && !live ? (
          <EmptyState
            title="No matches yet"
            hint="Create your first match to start tracking."
            action={<LinkButton href="/console/matches/new">+ New Match</LinkButton>}
          />
        ) : (
          <div className="space-y-2">
            {completed.map((m) => (
              <Link
                key={m.id}
                href={`/console/matches/${m.id}`}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface2"
              >
                <div>
                  <p className="font-semibold">vs {m.opponent}</p>
                  <p className="text-xs text-dim">
                    {m.dateISO} · {m.venue}
                  </p>
                </div>
                <PublishBadge published={m.published} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
