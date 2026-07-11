"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Player, StatEvent, Match } from "@/lib/types";
import {
  defensiveScore,
  lines,
  playerLine,
  seasonRecord,
  type RecordStat,
} from "@/lib/metrics";

/**
 * The five charts from the client brief, token-themed.
 * All charts read brand colors from CSS variables at render time,
 * so the white-label theme swap covers data-viz too.
 */

const css = (name: string, fallback: string) =>
  typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
      fallback
    : fallback;

const theme = () => ({
  accent: css("--brand-accent", "#ffc400"),
  azure: css("--brand-azure", "#4fc3f7"),
  ok: css("--brand-success", "#2ee6a8"),
  err: css("--brand-error", "#ff5c63"),
  dim: css("--brand-ink-dim", "#8fa3c8"),
  line: css("--brand-line", "#1c2e54"),
  surface: css("--brand-surface", "#0c1730"),
  ink: css("--brand-ink", "#f2f6fc"),
});

const tooltipStyle = () => ({
  contentStyle: {
    background: theme().surface,
    border: `1px solid ${theme().line}`,
    borderRadius: 12,
    color: theme().ink,
    fontSize: 13,
  },
  labelStyle: { color: theme().dim },
  cursor: { fill: "rgba(255,255,255,0.04)" },
});

const axisProps = () => ({
  stroke: theme().dim,
  tick: { fill: theme().dim, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: theme().line },
});

function firstName(name: string) {
  return name.split(" ")[0];
}

function ChartShell({
  title,
  insight,
  children,
  height = 260,
}: {
  title: string;
  insight?: string;
  children: React.ReactElement;
  height?: number;
}) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <h3 className="stat-display text-lg font-bold uppercase tracking-wide">
        {title}
      </h3>
      {insight && <p className="mb-2 mt-0.5 text-xs text-dim">{insight}</p>}
      <div style={{ height }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** 1 — Points scored by each spiker (match MVP). */
export function PointsBySpiker({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  const spikers = players.filter((p) => p.role === "SPIKER");
  const data = lines(spikers, events)
    .map((l) => ({
      name: firstName(spikers.find((p) => p.id === l.playerId)!.name),
      points: l.points,
    }))
    .sort((a, b) => b.points - a.points);
  const t = theme();
  return (
    <ChartShell title="Points by Spiker" insight="Who is the MVP this match?">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="name" {...axisProps()} />
        <YAxis {...axisProps()} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="points" fill={t.accent} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartShell>
  );
}

/** 2 — Spike success rate per spiker (reliability). */
export function SpikeSuccessRate({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  const spikers = players.filter((p) => p.role === "SPIKER");
  const data = lines(spikers, events)
    .map((l) => ({
      name: firstName(spikers.find((p) => p.id === l.playerId)!.name),
      rate: l.successRate ?? 0,
    }))
    .sort((a, b) => b.rate - a.rate);
  const t = theme();
  return (
    <ChartShell title="Spike Success Rate" insight="Who is most reliable?">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="name" {...axisProps()} />
        <YAxis {...axisProps()} unit="%" domain={[0, 100]} />
        <Tooltip {...tooltipStyle()} formatter={(v) => [`${v}%`, "Success rate"]} />
        <Bar dataKey="rate" fill={t.azure} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartShell>
  );
}

/** 3 — Setter accuracy vs assists, clustered. */
export function SetterAccuracyVsAssists({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  const setters = players.filter((p) => p.role === "SETTER");
  const data = lines(setters, events).map((l) => ({
    name: firstName(setters.find((p) => p.id === l.playerId)!.name),
    accuracy: l.successRate ?? 0,
    assists: l.assists,
  }));
  const t = theme();
  return (
    <ChartShell
      title="Setter Accuracy vs Assists"
      insight="Accuracy creates assists, side by side."
    >
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="name" {...axisProps()} />
        <YAxis {...axisProps()} />
        <Tooltip {...tooltipStyle()} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.dim }} />
        <Bar dataKey="accuracy" name="Accuracy %" fill={t.azure} radius={[6, 6, 0, 0]} maxBarSize={30} />
        <Bar dataKey="assists" name="Assists" fill={t.accent} radius={[6, 6, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ChartShell>
  );
}

/** 4 — Reach vs success rate (the key insight from the pitch deck). */
export function ReachVsSuccess({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  const spikers = players.filter((p) => p.role === "SPIKER");
  const data = spikers
    .map((p) => {
      const l = playerLine(p, events);
      return {
        name: p.name,
        reach: p.reachM,
        rate: l.successRate ?? 0,
        points: l.points,
      };
    })
    .filter((d) => d.rate > 0);
  const t = theme();
  return (
    <ChartShell
      title="Reach vs Success Rate"
      insight="Higher reach above the net → higher success. The data makes it undeniable."
    >
      <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} />
        <XAxis
          type="number"
          dataKey="reach"
          name="Reach"
          unit="m"
          domain={["dataMin - 0.03", "dataMax + 0.03"]}
          {...axisProps()}
          tickFormatter={(v: number) => v.toFixed(2)}
        />
        <YAxis type="number" dataKey="rate" name="Success" unit="%" domain={[50, 100]} {...axisProps()} />
        <ZAxis type="number" dataKey="points" range={[60, 260]} name="Points" />
        <Tooltip
          {...tooltipStyle()}
          formatter={(value, name) =>
            name === "Reach" ? [`${Number(value).toFixed(2)} m`, name] : [name === "Success" ? `${value}%` : value, name]
          }
        />
        <Scatter data={data} fill={t.accent} fillOpacity={0.85} stroke={t.accent} />
      </ScatterChart>
    </ChartShell>
  );
}

/** 6 — Aces per player (Suggestion 1: the drama stat). */
export function AcesByPlayer({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  const data = lines(players, events)
    .map((l) => ({
      name: firstName(players.find((p) => p.id === l.playerId)!.name),
      aces: l.aces,
    }))
    .filter((d) => d.aces > 0)
    .sort((a, b) => b.aces - a.aces)
    .slice(0, 8);
  const t = theme();
  return (
    <ChartShell title="Aces" insight="Untouched serves. Instant points, instant drama.">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="name" {...axisProps()} />
        <YAxis {...axisProps()} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="aces" fill={t.accent} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartShell>
  );
}

/** 7 — Super Digs per player (Suggestion 2: defenders become heroes). */
export function SuperDigsByPlayer({
  players,
  events,
}: {
  players: Player[];
  events: StatEvent[];
}) {
  const data = lines(players, events)
    .map((l) => ({
      name: firstName(players.find((p) => p.id === l.playerId)!.name),
      superDigs: l.superDigs,
    }))
    .filter((d) => d.superDigs > 0)
    .sort((a, b) => b.superDigs - a.superDigs)
    .slice(0, 8);
  const t = theme();
  return (
    <ChartShell
      title="Super Digs"
      insight="Impossible balls kept alive. The saves nobody used to count."
    >
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="name" {...axisProps()} />
        <YAxis {...axisProps()} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="superDigs" name="Super digs" fill={t.ok} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartShell>
  );
}

/** Season record cards — "Season High: X hit 7 aces in one match". */
export function RecordsStrip({
  players,
  matches,
  events,
  stats = ["aces", "superDigs", "points"],
}: {
  players: Player[];
  matches: Match[];
  events: StatEvent[];
  stats?: RecordStat[];
}) {
  const LABEL: Record<RecordStat, { title: string; unit: string }> = {
    aces: { title: "Most aces in a match", unit: "aces" },
    superDigs: { title: "Most super digs in a match", unit: "super digs" },
    points: { title: "Most points in a match", unit: "points" },
    blocks: { title: "Most blocks in a match", unit: "blocks" },
  };
  const records = stats
    .map((s) => ({ stat: s, rec: seasonRecord(s, events) }))
    .filter((r) => r.rec !== null);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {records.map(({ stat, rec }) => {
        const player = players.find((p) => p.id === rec!.playerId);
        const match = matches.find((m) => m.id === rec!.matchId);
        return (
          <div
            key={stat}
            className="card-premium shine rounded-2xl border-accent/30 p-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              🏆 Season high
            </p>
            <p className="stat-display mt-1 text-lg font-extrabold uppercase leading-tight">
              {player?.name ?? "N/A"}
            </p>
            <p className="tnum mt-0.5 text-sm text-dim">
              <span className="stat-display text-xl font-extrabold text-ink">
                {rec!.value}
              </span>{" "}
              {LABEL[stat].unit}
              {match ? ` · vs ${match.opponent}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Top defenders of the season — blocks + digs, super digs weighted. */
export function DefendersLeaderboard({
  players,
  events,
  limit = 5,
}: {
  players: Player[];
  events: StatEvent[];
  limit?: number;
}) {
  const rows = lines(players, events)
    .map((l) => ({ l, score: defensiveScore(l) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return (
    <div className="card-premium rounded-2xl p-4">
      <h3 className="stat-display text-lg font-bold uppercase tracking-wide">
        Guardians of the Floor
      </h3>
      <p className="mb-3 mt-0.5 text-xs text-dim">
        Top defenders: blocks, digs and super digs combined.
      </p>
      <div className="space-y-1.5">
        {rows.map(({ l, score }, i) => {
          const p = players.find((pl) => pl.id === l.playerId)!;
          return (
            <div
              key={l.playerId}
              className="flex items-center justify-between rounded-xl bg-surface2 px-3 py-2"
            >
              <span className="flex items-center gap-3">
                <span className="stat-display tnum w-5 text-center text-sm font-extrabold text-dim">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{p.name}</span>
              </span>
              <span className="tnum text-xs text-dim">
                {l.blocks} blk · {l.saves} dig ·{" "}
                <span className="font-bold text-ok">{l.superDigs} super</span>
                <span className="stat-display ml-3 text-base font-extrabold text-ink">
                  {Math.round(score)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 5 — Player performance across matches (is this player improving?). */
export function TrendAcrossMatches({
  player,
  matches,
  events,
  metric = "points",
}: {
  player: Player;
  matches: Match[];
  events: StatEvent[];
  metric?: "points" | "successRate" | "contribution";
}) {
  const completed = [...matches]
    .filter((m) => m.status === "completed")
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const data = completed.map((m) => {
    const l = playerLine(player, events.filter((e) => e.matchId === m.id));
    return {
      name: `vs ${m.opponent.split(" ")[0]}`,
      value:
        metric === "points"
          ? l.points
          : metric === "successRate"
            ? (l.successRate ?? 0)
            : l.contribution,
    };
  });
  const label =
    metric === "points"
      ? "Points"
      : metric === "successRate"
        ? "Success %"
        : "Contribution";
  const t = theme();
  return (
    <ChartShell
      title={`${firstName(player.name)} · ${label} per match`}
      insight="Is this player improving across the season?"
      height={220}
    >
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="name" {...axisProps()} />
        <YAxis {...axisProps()} />
        <Tooltip {...tooltipStyle()} />
        <Line
          type="monotone"
          dataKey="value"
          name={label}
          stroke={t.accent}
          strokeWidth={2.5}
          dot={{ fill: t.accent, r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ChartShell>
  );
}
