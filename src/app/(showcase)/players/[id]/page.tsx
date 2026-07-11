"use client";

import { useParams } from "next/navigation";
import { playerLine } from "@/lib/metrics";
import {
  Aurora,
  CountUp,
  Reveal,
  SectionLabel,
  ShowcaseSkeleton,
  usePublished,
} from "@/components/showcase";
import { RoleTag } from "@/components/ui";
import { TrendAcrossMatches } from "@/components/charts";

/**
 * Public player profile — the SEO crown jewel and the
 * screenshot-to-Instagram surface. Published matches only.
 */
export default function PublicPlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const { ready, db, matches, events } = usePublished();
  if (!ready) return <ShowcaseSkeleton />;

  const player = db.players.find((p) => p.id === id);
  if (!player) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center md:px-8">
        <p aria-hidden className="stat-display text-outline text-7xl font-extrabold">
          404
        </p>
        <p className="mt-4 text-dim">Player not found.</p>
      </div>
    );
  }

  const season = playerLine(player, events);
  const cells =
    player.role === "SPIKER"
      ? [
          { n: season.points, label: "Points" },
          { n: season.spikeAttempts, label: "Attempts" },
          { n: season.successRate === null ? "N/A" : `${season.successRate}%`, label: "Success" },
        ]
      : player.role === "SETTER"
        ? [
            { n: season.assists, label: "Assists" },
            { n: season.setAttempts, label: "Sets" },
            { n: season.successRate === null ? "N/A" : `${season.successRate}%`, label: "Accuracy" },
          ]
        : [
            { n: season.blocks, label: "Blocks" },
            { n: season.saves, label: "Saves" },
            { n: season.successRate === null ? "N/A" : `${season.successRate}%`, label: "Block rate" },
          ];

  return (
    <div>
      {/* Hero stat card */}
      <section className="grain relative overflow-hidden border-b border-line">
        <Aurora />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-8">
          <Reveal>
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Guardians #{player.jersey}</SectionLabel>
                <h1 className="stat-display text-6xl font-extrabold uppercase leading-[0.9] sm:text-8xl">
                  {player.name.split(" ")[0]}
                  <br />
                  <span className="text-gradient">
                    {player.name.split(" ").slice(1).join(" ")}
                  </span>
                </h1>
                <div className="mt-5 flex items-center gap-3">
                  <RoleTag role={player.role} />
                  <span className="tnum text-xs uppercase tracking-wider text-dim">
                    {player.heightM.toFixed(2)}m · reach {player.reachM.toFixed(2)}m
                  </span>
                </div>
              </div>
              <span
                aria-hidden
                className="stat-display text-outline float-slow hidden select-none text-[180px] font-extrabold leading-none sm:block"
              >
                {player.jersey}
              </span>
            </div>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-12 flex flex-wrap gap-x-12 gap-y-8">
              {cells.map((c) => (
                <div key={c.label}>
                  <p className="stat-display tnum text-5xl font-extrabold sm:text-6xl">
                    {typeof c.n === "number" ? <CountUp value={c.n} /> : c.n}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                    {c.label}
                  </p>
                </div>
              ))}
              <div>
                <p className="stat-display tnum text-5xl font-extrabold text-accent sm:text-6xl">
                  <CountUp value={season.aces} />
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                  Aces
                </p>
              </div>
              <div>
                <p className="stat-display tnum text-5xl font-extrabold text-ok sm:text-6xl">
                  <CountUp value={season.superDigs} />
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-dim">
                  Super digs
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Season trend + match log */}
      <section className="mx-auto max-w-6xl space-y-8 px-4 py-14 md:px-8">
        <Reveal>
          <TrendAcrossMatches
            player={player}
            matches={matches}
            events={events}
            metric={player.role === "SPIKER" ? "points" : "contribution"}
          />
        </Reveal>

        <Reveal>
          <div className="card-premium rounded-2xl p-6">
            <h2 className="stat-display mb-4 text-lg font-bold uppercase tracking-wide">
              Match by Match
            </h2>
            <div className="space-y-2">
              {matches
                .filter((m) => m.roster.includes(player.id))
                .map((m, i) => {
                  const l = playerLine(
                    player,
                    events.filter((e) => e.matchId === m.id),
                  );
                  const headline =
                    player.role === "SPIKER"
                      ? `${l.points} pts`
                      : player.role === "SETTER"
                        ? `${l.assists} ast`
                        : `${l.blocks} blk`;
                  return (
                    <Reveal key={m.id} delay={i * 60}>
                      <div className="glass flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:border-accent/30">
                        <span className="text-sm">
                          vs {m.opponent}
                          <span className="ml-2 text-[11px] text-dim">{m.dateISO}</span>
                        </span>
                        <span className="stat-display tnum font-extrabold text-accent">
                          {headline}
                          <span className="ml-3 text-xs font-semibold text-dim">
                            {l.successRate === null ? "" : `${l.successRate}%`}
                          </span>
                        </span>
                      </div>
                    </Reveal>
                  );
                })}
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
