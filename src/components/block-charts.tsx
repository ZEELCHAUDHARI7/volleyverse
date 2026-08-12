"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { Player, StatEvent } from "@/lib/types";
import {
  bestSetBlocks,
  blockLeaders,
  blockLine,
  blockLines,
  duels,
  type BlockLine,
} from "@/lib/blocks";
import { ChartShell, axisProps, firstName, theme, tooltipStyle } from "./charts";

/**
 * THE BLOCKING VIEW — everything the ✓/✗ sub-options make derivable.
 *
 * Not one extra tap was collected for any of this. Saying an attack was BLOCKED
 * names a blocker, and saying it was a TOOL names the blocker who got used;
 * those two answers are the whole input behind these cards, bars and matchups.
 *
 * "Duels won" is deliberately not called a block success rate. Its denominator
 * is the blocks and tools this app witnessed, so it answers "when the ball came
 * through their hands, how often did it stay down" — an attack hit past the
 * block is invisible to it, and calling it a success rate would imply otherwise.
 */

const label = (p: Player) =>
  p.jerseyNo !== null ? `#${p.jerseyNo} ${firstName(p.fullName)}` : firstName(p.fullName);

/** Blockers with something to show, best first, with their player row. */
function ranked(
  players: Player[],
  events: StatEvent[],
): { player: Player; line: BlockLine }[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return blockLines(
    players.map((p) => p.id),
    events,
  )
    .filter((l) => l.attempts > 0)
    .sort((a, b) => b.blocks - a.blocks || a.tooled - b.tooled)
    .map((line) => ({ player: byId.get(line.playerId)!, line }));
}

/**
 * Per-blocker cards: the match, the duel record, and who they keep stopping.
 *
 * `seasonEvents` is optional and separate from `events` because the two are
 * different scopes on purpose — the card shows tonight next to the season, and
 * the caller decides whether it has the season to give.
 */
export function BlockerCards({
  players,
  events,
  homeTeamId,
  seasonEvents,
}: {
  players: Player[];
  events: StatEvent[];
  homeTeamId: string;
  seasonEvents?: StatEvent[];
}) {
  const rows = ranked(players, events);
  const byId = new Map(players.map((p) => [p.id, p]));
  const t = theme();

  if (rows.length === 0) {
    return (
      <div className="card-premium rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-ink">No blocks logged yet.</p>
        <p className="mt-1 text-xs text-dim">
          Tap a spiker, then ✗ → Blocked, and name who stopped it. Blocking
          statistics build themselves from there.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map(({ player, line }) => {
        const season = seasonEvents ? blockLine(player.id, seasonEvents) : null;
        const victim = line.topVictim ? byId.get(line.topVictim.playerId) : null;
        const home = player.teamId === homeTeamId;
        return (
          <div key={player.id} className="card-premium rounded-2xl p-4">
            <div className="flex items-baseline gap-2">
              {player.jerseyNo !== null && (
                <span
                  className="stat-display tnum text-2xl font-extrabold"
                  style={{ color: home ? t.accent : t.azure }}
                >
                  #{player.jerseyNo}
                </span>
              )}
              <span className="stat-display text-base font-extrabold uppercase leading-tight text-ink">
                {player.fullName}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="stat-display tnum text-2xl font-extrabold text-ok">
                  {line.blocks}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim">
                  Blocks
                </p>
              </div>
              <div>
                <p className="stat-display tnum text-2xl font-extrabold text-ink">
                  {line.successRate === null ? "—" : `${line.successRate}%`}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim">
                  Duels won
                </p>
              </div>
              <div>
                <p className="stat-display tnum text-2xl font-extrabold text-dim">
                  {line.tooled}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim">
                  Tooled
                </p>
              </div>
            </div>

            <p className="mt-3 border-t border-line/60 pt-2 text-xs text-dim">
              {victim && line.topVictim ? (
                <>
                  Stops{" "}
                  <span className="font-semibold text-ink">{label(victim)}</span> most
                  — {line.topVictim.blocks}×
                </>
              ) : (
                "No named matchup yet."
              )}
              {season && (
                <>
                  {" · "}
                  <span className="tnum font-semibold text-ink">{season.blocks}</span>{" "}
                  this season
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** See spike-charts.tsx on why this returns the element, not a component. */
function blockBars({
  data,
  unit,
  domain,
  tooltipLabel,
}: {
  data: { name: string; value: number; home: boolean }[];
  unit?: string;
  domain?: [number, number];
  tooltipLabel: string;
}) {
  const t = theme();
  return (
    <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
      <XAxis dataKey="name" {...axisProps()} />
      <YAxis {...axisProps()} unit={unit} domain={domain} allowDecimals={unit === "%"} />
      <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}${unit ?? ""}`, tooltipLabel]} />
      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44}>
        {data.map((d, i) => (
          <Cell key={i} fill={d.home ? t.accent : t.azure} />
        ))}
      </Bar>
    </BarChart>
  );
}

/** Who the wall is: blocks per player, and how their duels went. */
export function BlockChartGrid({
  players,
  events,
  homeTeamId,
  homeLabel,
  awayLabel,
}: {
  players: Player[];
  events: StatEvent[];
  homeTeamId: string;
  homeLabel: string;
  awayLabel: string;
}) {
  const rows = ranked(players, events);
  const t = theme();
  if (rows.length === 0) return null;

  const bars = (pick: (l: BlockLine) => number | null) =>
    rows.map(({ player, line }) => ({
      name: firstName(player.fullName),
      value: pick(line) ?? 0,
      home: player.teamId === homeTeamId,
    }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider text-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: t.accent }} />
          {homeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: t.azure }} />
          {awayLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartShell title="Blocks" insight="Attacks stopped dead at the net.">
          {blockBars({ data: bars((l) => l.blocks), tooltipLabel: "Blocks" })}
        </ChartShell>

        <ChartShell
          title="Duels Won"
          insight="Blocks ÷ balls that came through their hands."
        >
          {blockBars({
            data: bars((l) => l.successRate),
            unit: "%",
            domain: [0, 100],
            tooltipLabel: "Duels won",
          })}
        </ChartShell>
      </div>
    </div>
  );
}

/** Top blockers of a match or a whole season — the caller's scope decides. */
export function BlockLeaderboard({
  players,
  events,
  limit = 5,
  title = "Top Blockers",
  hint = "Attacks stopped, with the duels those blockers lost alongside.",
}: {
  players: Player[];
  events: StatEvent[];
  limit?: number;
  title?: string;
  hint?: string;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = blockLeaders(
    players.map((p) => p.id),
    events,
  ).slice(0, limit);

  return (
    <div className="card-premium rounded-2xl p-4">
      <h3 className="stat-display text-lg font-bold uppercase tracking-wide">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-dim">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-dim">
          No blocks recorded yet — they appear as soon as a scorer names one.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((l, i) => {
            const p = byId.get(l.playerId);
            const victim = l.topVictim ? byId.get(l.topVictim.playerId) : null;
            return (
              <div
                key={l.playerId}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="stat-display tnum w-5 text-center text-sm font-extrabold text-dim">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {p ? p.fullName : "Unknown player"}
                    </span>
                    {victim && l.topVictim && (
                      <span className="block truncate text-[11px] text-dim">
                        stops {label(victim)} {l.topVictim.blocks}×
                      </span>
                    )}
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs text-dim">
                  {l.tooled} tooled
                  <span className="stat-display ml-3 text-base font-extrabold text-ok">
                    {l.blocks}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * MOST BLOCKS IN ONE SET — the record the per-match strip cannot show.
 *
 * A set is the shortest window a wall can dominate, so it is where the sport's
 * loudest blocking nights actually live: four in one set says more than six
 * across five. Sets are numbered per match, so the record is keyed on both.
 */
export function BestSetBlocks({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  let best: { player: Player; setNo: number; blocks: number } | null = null;
  for (const p of players) {
    const b = bestSetBlocks(p.id, events);
    // > and not >=: the first player to reach the mark keeps it, so the card
    // does not change hands every time the roster is re-derived in a new order.
    if (b && b.blocks >= 2 && (!best || b.blocks > best.blocks)) {
      best = { player: p, setNo: b.setNo, blocks: b.blocks };
    }
  }
  if (!best) return null;

  return (
    <div className="card-premium shine rounded-2xl border-accent/30 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
        🏆 Season high
      </p>
      <p className="stat-display mt-1 text-lg font-extrabold uppercase leading-tight">
        {best.player.fullName}
      </p>
      <p className="tnum mt-0.5 text-sm text-dim">
        <span className="stat-display text-xl font-extrabold text-ink">
          {best.blocks}
        </span>{" "}
        blocks in one set · set {best.setNo}
      </p>
    </div>
  );
}

/**
 * SPIKER vs BLOCKER — the matchup table a coach reads before a rotation.
 *
 * One row per duel that actually happened, rather than a full cross-product
 * grid: a 14-by-14 table of mostly zeroes hides the three matchups that matter.
 */
export function DuelMatrix({
  players,
  events,
  limit = 12,
}: {
  players: Player[];
  events: StatEvent[];
  limit?: number;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const cells = duels(events);
  const shown = cells.slice(0, limit);
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? label(p) : "Unknown";
  };

  return (
    <div className="card-premium rounded-2xl p-4">
      <h3 className="stat-display text-lg font-bold uppercase tracking-wide">
        Spiker vs Blocker
      </h3>
      <p className="mb-3 mt-0.5 text-xs text-dim">
        Every matchup the net produced: who stopped whom, and who hit back.
      </p>
      {shown.length === 0 ? (
        <p className="text-sm text-dim">
          No matchups yet. They build themselves from the Blocked and Tool
          answers — a block recorded without naming the spiker cannot appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-dim">
                <th className="py-1 pr-2">Blocker</th>
                <th className="py-1 pr-2">Spiker</th>
                <th className="py-1 pr-2 text-right">Blocked</th>
                <th className="py-1 text-right">Tooled</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr
                  key={`${d.blockerId}|${d.spikerId}`}
                  className="border-t border-line/60"
                >
                  <td className="py-1.5 pr-2 font-semibold">{nameOf(d.blockerId)}</td>
                  <td className="py-1.5 pr-2 text-dim">{nameOf(d.spikerId)}</td>
                  <td className="tnum py-1.5 pr-2 text-right font-bold text-ok">
                    {d.blocks}
                  </td>
                  <td className="tnum py-1.5 text-right text-dim">{d.tools}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cells.length > shown.length && (
            <p className="mt-2 text-[11px] text-dim">
              Showing the {shown.length} strongest of {cells.length} matchups.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
