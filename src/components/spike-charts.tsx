"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { Player, StatEvent } from "@/lib/types";
import { spikeLines, type SpikeLine } from "@/lib/spikes";
import { ChartShell, axisProps, firstName, theme, tooltipStyle } from "./charts";

/**
 * THE FOUR DEMO CHARTS — attempts, points won, success rate, error rate.
 *
 * Every chart shows both teams in one plot, coloured by side, sorted by
 * value. Players with no attempts are dropped: a bench sitting at zero
 * crowds out the attackers the charts exist to compare.
 */

interface Row {
  name: string;
  value: number;
  home: boolean;
}

function rows(
  players: Player[],
  events: StatEvent[],
  homeTeamId: string,
  pick: (l: SpikeLine) => number | null,
): Row[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return spikeLines(
    players.map((p) => p.id),
    events,
  )
    .filter((l) => l.attempts > 0)
    .map((l) => {
      const p = byId.get(l.playerId)!;
      return {
        name: firstName(p.fullName),
        value: pick(l) ?? 0,
        home: p.teamId === homeTeamId,
      };
    })
    .sort((a, b) => b.value - a.value);
}

function TeamBars({
  data,
  unit,
  domain,
  tooltipLabel,
}: {
  data: Row[];
  unit?: string;
  domain?: [number, number];
  tooltipLabel: string;
}) {
  const t = theme();
  return (
    <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
      <XAxis dataKey="name" {...axisProps()} />
      <YAxis
        {...axisProps()}
        unit={unit}
        domain={domain}
        allowDecimals={unit === "%"}
      />
      <Tooltip
        {...tooltipStyle()}
        formatter={(v) => [`${v}${unit ?? ""}`, tooltipLabel]}
      />
      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44}>
        {data.map((d, i) => (
          <Cell key={i} fill={d.home ? t.accent : t.azure} />
        ))}
      </Bar>
    </BarChart>
  );
}

/** All four charts, with a colour key for the two teams. */
export function SpikeChartGrid({
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
  const attempts = rows(players, events, homeTeamId, (l) => l.attempts);
  const points = rows(players, events, homeTeamId, (l) => l.pointsWon);
  const success = rows(players, events, homeTeamId, (l) => l.successRate);
  const errors = rows(players, events, homeTeamId, (l) => l.errorRate);
  const t = theme();

  if (attempts.length === 0) {
    return (
      <div className="card-premium rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-ink">No spikes logged yet.</p>
        <p className="mt-1 text-xs text-dim">
          Tap a player, then ✓, O or ✗. Charts appear from the first attempt.
        </p>
      </div>
    );
  }

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
        <ChartShell title="Spike Attempts" insight="Every tap counts as one attempt.">
          <TeamBars data={attempts} tooltipLabel="Attempts" />
        </ChartShell>

        <ChartShell title="Points Won" insight="Attacks that ended the rally.">
          <TeamBars data={points} tooltipLabel="Points" />
        </ChartShell>

        <ChartShell title="Success Rate" insight="Points won ÷ attempts.">
          <TeamBars data={success} unit="%" domain={[0, 100]} tooltipLabel="Success" />
        </ChartShell>

        <ChartShell title="Error Rate" insight="Into the net or out ÷ attempts.">
          <TeamBars data={errors} unit="%" domain={[0, 100]} tooltipLabel="Errors" />
        </ChartShell>
      </div>
    </div>
  );
}
