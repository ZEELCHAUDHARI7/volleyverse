"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ComparisonMetric,
  DistributionSeries,
  Kpi,
  Performer,
  ProgressionPoint,
  StatTable,
  TeamStatLine,
  Tone,
} from "@/lib/analytics";
import type { Insight } from "@/lib/analytics";

/**
 * ANALYTICS UI — reusable, fully prop-driven, token-themed visualisations.
 *
 * Every component reads brand colours from CSS variables at render time, so a
 * theme swap re-skins the whole dashboard. None of these import entity data;
 * the sport-neutral analytics shapes (KPIs, comparison metrics, distributions)
 * always arrive via props, which is what lets one component set serve every
 * sport.
 */

const cssVar = (name: string, fallback: string) =>
  typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
    : fallback;

const theme = () => ({
  accent: cssVar("--brand-accent", "#ffc400"),
  azure: cssVar("--brand-azure", "#4fc3f7"),
  ok: cssVar("--brand-success", "#2ee6a8"),
  err: cssVar("--brand-error", "#ff5c63"),
  violet: cssVar("--brand-violet", "#7c6cff"),
  dim: cssVar("--brand-ink-dim", "#8299c4"),
  line: cssVar("--brand-line", "#182342"),
  surface: cssVar("--brand-surface", "#0a101f"),
  ink: cssVar("--brand-ink", "#f4f7fd"),
});

const TONE_HEX: Record<Tone, () => string> = {
  accent: () => theme().accent,
  azure: () => theme().azure,
  ok: () => theme().ok,
  err: () => theme().err,
  violet: () => theme().violet,
  dim: () => theme().dim,
};

const TONE_TEXT: Record<Tone, string> = {
  accent: "text-accent",
  azure: "text-azure",
  ok: "text-ok",
  err: "text-err",
  violet: "text-violet",
  dim: "text-dim",
};

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

export function ChartCard({
  title,
  hint,
  children,
  height = 260,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactElement;
  height?: number;
  right?: React.ReactNode;
}) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="stat-display text-lg font-bold uppercase tracking-wide">{title}</h3>
          {hint && <p className="mb-1 mt-0.5 text-xs text-dim">{hint}</p>}
        </div>
        {right}
      </div>
      <div style={{ height }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// KPI grid
// ---------------------------------------------------------------------

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.key} className="card-spot card-premium relative overflow-hidden rounded-2xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-dim">
            {k.label}
          </div>
          <div
            className={`stat-display mt-2 text-3xl font-extrabold leading-none ${
              k.tone ? TONE_TEXT[k.tone] : "text-ink"
            }`}
          >
            {k.value}
            {k.unit && <span className="ml-0.5 text-base text-dim">{k.unit}</span>}
          </div>
          {k.hint && <div className="mt-1 text-[11px] text-dim/70">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Team comparison — radar + bars
// ---------------------------------------------------------------------

export function ComparisonRadar({
  metrics,
  homeLabel,
  awayLabel,
}: {
  metrics: ComparisonMetric[];
  homeLabel: string;
  awayLabel: string;
}) {
  const t = theme();
  const data = metrics.map((m) => {
    const ceil = m.max ?? Math.max(m.home, m.away, 1);
    return {
      metric: m.label,
      home: Math.round((m.home / ceil) * 100),
      away: Math.round((m.away / ceil) * 100),
    };
  });
  return (
    <ChartCard title="Team Comparison" hint="Normalised across the key departments." height={320}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={t.line} />
        <PolarAngleAxis dataKey="metric" tick={{ fill: t.dim, fontSize: 11 }} />
        <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
        <Radar name={homeLabel} dataKey="home" stroke={t.accent} fill={t.accent} fillOpacity={0.35} />
        <Radar name={awayLabel} dataKey="away" stroke={t.azure} fill={t.azure} fillOpacity={0.25} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.dim }} />
        <Tooltip {...tooltipStyle()} />
      </RadarChart>
    </ChartCard>
  );
}

export function ComparisonBars({
  metrics,
  homeLabel,
  awayLabel,
}: {
  metrics: ComparisonMetric[];
  homeLabel: string;
  awayLabel: string;
}) {
  const t = theme();
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="stat-display text-lg font-bold uppercase tracking-wide">Head to Head</h3>
        <div className="flex gap-3 text-[11px] font-semibold uppercase tracking-wider">
          <span className="text-accent">{homeLabel}</span>
          <span className="text-azure">{awayLabel}</span>
        </div>
      </div>
      <div className="space-y-3">
        {metrics.map((m) => {
          const total = Math.max(m.home + m.away, 1);
          const hp = (m.home / total) * 100;
          const better = m.higherIsBetter === false ? "lower" : "higher";
          const homeWins = better === "higher" ? m.home > m.away : m.home < m.away;
          const awayWins = better === "higher" ? m.away > m.home : m.away < m.home;
          return (
            <div key={m.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={`tnum font-bold ${homeWins ? "text-accent" : "text-dim"}`}>
                  {m.home}
                  {m.unit ?? ""}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-dim">{m.label}</span>
                <span className={`tnum font-bold ${awayWins ? "text-azure" : "text-dim"}`}>
                  {m.away}
                  {m.unit ?? ""}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-surface2">
                <div style={{ width: `${hp}%`, background: t.accent }} />
                <div style={{ width: `${100 - hp}%`, background: t.azure }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Score timeline + momentum
// ---------------------------------------------------------------------

export function ScoreTimeline({
  progression,
  homeLabel,
  awayLabel,
}: {
  progression: ProgressionPoint[];
  homeLabel: string;
  awayLabel: string;
}) {
  const t = theme();
  return (
    <ChartCard
      title="Scoring Progression"
      hint="Cumulative points as the match unfolded, rally by rally."
    >
      <LineChart data={progression} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="rally" {...axisProps()} />
        <YAxis {...axisProps()} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.dim }} />
        <Line type="monotone" dataKey="home" name={homeLabel} stroke={t.accent} strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="away" name={awayLabel} stroke={t.azure} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ChartCard>
  );
}

export function MomentumChart({
  progression,
  homeLabel,
  awayLabel,
}: {
  progression: ProgressionPoint[];
  homeLabel: string;
  awayLabel: string;
}) {
  const t = theme();
  return (
    <ChartCard
      title="Momentum"
      hint={`Points ahead — above the line favours ${homeLabel}, below favours ${awayLabel}.`}
    >
      <AreaChart data={progression} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="momo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity={0.5} />
            <stop offset="50%" stopColor={t.accent} stopOpacity={0.05} />
            <stop offset="50%" stopColor={t.azure} stopOpacity={0.05} />
            <stop offset="100%" stopColor={t.azure} stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="rally" {...axisProps()} />
        <YAxis {...axisProps()} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}`, "Margin"]} />
        <ReferenceLine y={0} stroke={t.dim} />
        <Area type="monotone" dataKey="margin" stroke={t.accent} strokeWidth={2} fill="url(#momo)" />
      </AreaChart>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------
// Distributions (pie / bar / court)
// ---------------------------------------------------------------------

export function DistributionCard({ series }: { series: DistributionSeries }) {
  if (series.shape === "court") return <CourtHeatmap series={series} />;
  if (series.shape === "pie") return <DistributionPie series={series} />;
  return <DistributionBar series={series} />;
}

function DistributionPie({ series }: { series: DistributionSeries }) {
  const t = theme();
  const data = series.data.filter((d) => d.value > 0);
  const empty = data.length === 0;
  return (
    <ChartCard title={series.label} hint={series.hint} height={240}>
      {empty ? (
        <EmptyChart />
      ) : (
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
            {data.map((d, i) => (
              <Cell key={i} fill={d.tone ? TONE_HEX[d.tone]() : [t.accent, t.azure, t.violet][i % 3]} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 12, color: t.dim }} />
          <Tooltip {...tooltipStyle()} />
        </PieChart>
      )}
    </ChartCard>
  );
}

function DistributionBar({ series }: { series: DistributionSeries }) {
  const t = theme();
  return (
    <ChartCard title={series.label} hint={series.hint} height={240}>
      <BarChart data={series.data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="label" {...axisProps()} tick={{ fill: t.dim, fontSize: 10 }} />
        <YAxis {...axisProps()} allowDecimals={false} />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={54}>
          {series.data.map((d, i) => (
            <Cell key={i} fill={d.tone ? TONE_HEX[d.tone]() : t.accent} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

/** Representative 6-zone court heatmap (FIVB slots), coloured by activity. */
function CourtHeatmap({ series }: { series: DistributionSeries }) {
  const byZone = new Map(series.data.map((d) => [d.key, d]));
  const max = Math.max(1, ...series.data.map((d) => d.value));
  // Display order: front row (4,3,2) on top, back row (5,6,1) below.
  const grid = [
    ["4", "3", "2"],
    ["5", "6", "1"],
  ];
  return (
    <div className="card-premium rounded-2xl p-4">
      <h3 className="stat-display text-lg font-bold uppercase tracking-wide">{series.label}</h3>
      {series.hint && <p className="mb-3 mt-0.5 text-xs text-dim">{series.hint}</p>}
      <div className="relative mx-auto max-w-sm rounded-xl border-2 border-line bg-surface2/40 p-2">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-accent/40" aria-hidden />
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-2">
            {row.map((z) => {
              const d = byZone.get(z);
              const v = d?.value ?? 0;
              const intensity = v / max;
              return (
                <div
                  key={z}
                  className="grid aspect-video place-items-center rounded-lg text-center ring-1 ring-line"
                  style={{ background: `color-mix(in srgb, var(--brand-accent) ${Math.round(intensity * 80)}%, transparent)` }}
                  title={d?.label}
                >
                  <div>
                    <div className="stat-display text-xl font-extrabold text-ink">{v}</div>
                    <div className="text-[9px] uppercase tracking-wider text-dim">Zone {z}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className="my-2 h-px bg-line" aria-hidden />
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-full place-items-center text-sm text-dim">No data recorded</div>
  );
}

// ---------------------------------------------------------------------
// Performer cards
// ---------------------------------------------------------------------

export function PerformerCards({ performers }: { performers: Performer[] }) {
  if (performers.length === 0)
    return <p className="text-sm text-dim">No player statistics were recorded.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {performers.map((p) => (
        <div key={p.award} className="card-premium shine rounded-2xl border-accent/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">🏅 {p.award}</p>
          <p className="stat-display mt-1 truncate text-lg font-extrabold uppercase leading-tight" title={p.name}>
            {p.name}
          </p>
          <p className="tnum mt-0.5 text-sm text-dim">
            <span className="stat-display text-xl font-extrabold text-ink">{p.value}</span> {p.unit}
          </p>
          {p.detail && <p className="mt-0.5 text-[11px] text-dim/70">{p.detail}</p>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Team stat sheet — two-column comparison
// ---------------------------------------------------------------------

export function TeamStatSheet({
  home,
  away,
  homeLabel,
  awayLabel,
}: {
  home: TeamStatLine;
  away: TeamStatLine;
  homeLabel: string;
  awayLabel: string;
}) {
  const awayMap = new Map(away.stats.map((s) => [s.key, s]));
  return (
    <div className="card-premium overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line px-4 py-3 text-[11px] font-bold uppercase tracking-wider">
        <span className="text-right text-accent">{homeLabel}</span>
        <span className="text-dim">Metric</span>
        <span className="text-azure">{awayLabel}</span>
      </div>
      <div className="divide-y divide-line/60">
        {home.stats.map((s) => {
          const a = awayMap.get(s.key);
          const muted = !!s.note;
          const hv = typeof s.value === "number" ? s.value : null;
          const av = a && typeof a.value === "number" ? a.value : null;
          const hb = hv != null && av != null && hv > av;
          const ab = hv != null && av != null && av > hv;
          return (
            <div key={s.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 text-sm">
              <span className={`tnum text-right font-bold ${muted ? "text-dim/50" : hb ? "text-accent" : "text-ink"}`}>
                {s.value}
                {s.unit ?? ""}
              </span>
              <span className="min-w-[9rem] text-center text-[11px] uppercase tracking-wider text-dim" title={s.note}>
                {s.label}
                {s.note && <span className="ml-1 text-dim/50">*</span>}
              </span>
              <span className={`tnum font-bold ${muted ? "text-dim/50" : ab ? "text-azure" : "text-ink"}`}>
                {a ? `${a.value}${a.unit ?? ""}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      {home.stats.some((s) => s.note) && (
        <p className="border-t border-line px-4 py-2 text-[10px] text-dim/60">
          * Not captured in the current courtside data model.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Box score
// ---------------------------------------------------------------------

export function BoxScoreTable({ table }: { table: StatTable }) {
  if (table.rows.length === 0)
    return <p className="text-sm text-dim">No player statistics were recorded for this match.</p>;
  return (
    <div className="card-premium overflow-x-auto rounded-2xl p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-dim">
            {table.columns.map((c) => (
              <th key={c.key} className={`py-1 pr-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {table.columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-1.5 pr-2 ${c.align === "right" ? "tnum text-right" : "font-semibold"}`}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// Insight cards + narrative summary
// ---------------------------------------------------------------------

export function InsightCards({ insights }: { insights: Insight[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {insights.map((ins, i) => (
        <div key={i} className="card-premium rounded-2xl p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span aria-hidden className="text-lg">{ins.icon}</span>
            <span className={TONE_TEXT[ins.tone]}>{ins.title}</span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-dim">{ins.body}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Generic season charts
// ---------------------------------------------------------------------

/** A win-percentage line across periods (months/years). */
export function PeriodTrend({
  data,
  label = "Win %",
}: {
  data: { label: string; winPct: number; played: number }[];
  label?: string;
}) {
  const t = theme();
  return (
    <ChartCard title="Performance Over Time" hint="Win percentage by period." height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
        <XAxis dataKey="label" {...axisProps()} />
        <YAxis {...axisProps()} unit="%" domain={[0, 100]} />
        <Tooltip {...tooltipStyle()} formatter={(v: number) => [`${v}%`, label]} />
        <Line type="monotone" dataKey="winPct" name={label} stroke={t.accent} strokeWidth={2.5} dot={{ fill: t.accent, r: 4 }} />
      </LineChart>
    </ChartCard>
  );
}

/** Horizontal team-ranking bar (e.g. win %, points). */
export function RankingBars({
  title,
  hint,
  data,
  unit = "",
}: {
  title: string;
  hint?: string;
  data: { name: string; value: number }[];
  unit?: string;
}) {
  const t = theme();
  return (
    <ChartCard title={title} hint={hint} height={Math.max(200, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.line} horizontal={false} />
        <XAxis type="number" {...axisProps()} unit={unit} />
        <YAxis type="category" dataKey="name" {...axisProps()} width={110} tick={{ fill: t.dim, fontSize: 11 }} />
        <Tooltip {...tooltipStyle()} />
        <Bar dataKey="value" fill={t.accent} radius={[0, 6, 6, 0]} maxBarSize={26} />
      </BarChart>
    </ChartCard>
  );
}

/** Recent form pips, newest last. */
export function FormStrip({ form }: { form: ("W" | "L" | null)[] }) {
  return (
    <div className="flex gap-1">
      {form.map((f, i) => (
        <span
          key={i}
          className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold ${
            f === "W"
              ? "bg-ok/20 text-ok ring-1 ring-ok/30"
              : f === "L"
                ? "bg-err/20 text-err ring-1 ring-err/30"
                : "bg-line/50 text-dim"
          }`}
        >
          {f ?? "–"}
        </span>
      ))}
    </div>
  );
}
