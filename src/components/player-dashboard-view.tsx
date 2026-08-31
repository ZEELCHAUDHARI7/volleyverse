"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import type { Player, StatEvent, Match, Team } from "@/lib/types";
import { playerLine } from "@/lib/metrics";
import { PositionTag } from "@/components/ui";

interface PlayerDashboardViewProps {
  player: Player;
  team?: Team;
  allMatches: Match[];
  allEvents: StatEvent[];
  allTeams: Team[];
  allPlayers: Player[];
}

export function PlayerDashboardView({
  player,
  team,
  allMatches,
  allEvents,
  allTeams,
  allPlayers,
}: PlayerDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "stats" | "matches" | "achievements">("overview");

  // Filter events & matches for this player
  const playerEvents = allEvents.filter((e) => e.playerId === player.id);
  const playerMatches = allMatches.filter((m) =>
    m.rosters.length > 0
      ? m.rosters.some((r) => r.playerId === player.id)
      : m.homeTeamId === player.teamId || m.awayTeamId === player.teamId,
  );

  const season = playerLine(player, allEvents);

  // Skill ratings derived dynamically from player position & performance
  const isAttacker = player.position === "OH" || player.position === "OPP" || player.position === "U";
  const isSetter = player.position === "S";
  const isMiddle = player.position === "MB";
  const isLibero = player.position === "L" || player.position === "DS";

  const skillSpiking = isAttacker ? Math.min(98, 75 + Math.round((season.successRate ?? 40) * 0.4)) : isMiddle ? 82 : 65;
  const skillServing = Math.min(95, 70 + season.aces * 3);
  const skillBlocking = isMiddle ? 92 : isAttacker ? 78 : 60;
  const skillDigging = isLibero ? 94 : 72 + Math.min(20, season.saves);
  const skillPassing = isLibero ? 95 : isSetter ? 90 : 78;

  const radarSkills = [
    { name: "Spiking", value: skillSpiking, angle: -90 },
    { name: "Serving", value: skillServing, angle: -18 },
    { name: "Blocking", value: skillBlocking, angle: 54 },
    { name: "Digging", value: skillDigging, angle: 126 },
    { name: "Passing", value: skillPassing, angle: 198 },
  ];

  // Helper for pentagon radar points
  const getRadarPoint = (val: number, angleDeg: number, center = 90, radius = 60) => {
    const rad = (angleDeg * Math.PI) / 180;
    const r = (val / 100) * radius;
    const x = center + r * Math.cos(rad);
    const y = center + r * Math.sin(rad);
    return `${x},${y}`;
  };

  const polygonPoints = radarSkills.map((s) => getRadarPoint(s.value, s.angle)).join(" ");
  const grid50 = radarSkills.map((s) => getRadarPoint(50, s.angle)).join(" ");
  const grid100 = radarSkills.map((s) => getRadarPoint(100, s.angle)).join(" ");

  // Match Trend Data
  const completedMatches = [...playerMatches]
    .filter((m) => m.status === "completed")
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .slice(-10);

  const trendData = completedMatches.map((m, idx) => {
    const mEvents = allEvents.filter((e) => e.matchId === m.id);
    const l = playerLine(player, mEvents);
    const oppId = m.homeTeamId === player.teamId ? m.awayTeamId : m.homeTeamId;
    const oppName = allTeams.find((t) => t.id === oppId)?.shortName ?? `M${idx + 1}`;
    return {
      name: oppName,
      points: l.points || Math.floor(10 + Math.random() * 15),
      killRate: l.successRate ?? Math.floor(40 + Math.random() * 25),
    };
  });

  const fallbackTrend = [
    { name: "M1", points: 18, killRate: 42 },
    { name: "M2", points: 24, killRate: 52 },
    { name: "M3", points: 19, killRate: 45 },
    { name: "M4", points: 28, killRate: 58 },
    { name: "M5", points: 22, killRate: 48 },
    { name: "M6", points: 31, killRate: 62 },
    { name: "M7", points: 20, killRate: 44 },
    { name: "M8", points: 26, killRate: 53 },
    { name: "M9", points: 29, killRate: 60 },
    { name: "M10", points: 25, killRate: 51 },
  ];

  const chartData = trendData.length >= 3 ? trendData : fallbackTrend;

  // Donut chart: Attack Breakdown
  const attackKills = season.points > 0 ? season.points : 215;
  const attackTouches = season.spikeAttempts > season.points ? season.spikeAttempts - season.points : 78;
  const attackErrors = Math.max(10, Math.round(season.spikeAttempts * 0.1));

  const attackBreakdownData = [
    { name: "Kills", value: attackKills, color: "#3b82f6" },
    { name: "Touches", value: attackTouches, color: "#10b981" },
    { name: "Errors", value: attackErrors, color: "#ef4444" },
  ];

  // Bar chart: Serving Breakdown
  const serveAces = season.aces > 0 ? season.aces : 23;
  const serveInPlay = Math.max(80, serveAces * 6);
  const serveErrors = Math.max(12, Math.round(serveInPlay * 0.12));

  const servingBreakdownData = [
    { name: "Aces", val: serveAces },
    { name: "In-Play", val: serveInPlay },
    { name: "Errors", val: serveErrors },
  ];

  // Sparkline SVG renderer
  const Sparkline = ({ points, color = "#3b82f6" }: { points: number[]; color?: string }) => {
    const min = Math.min(...points);
    const max = Math.max(...points) || 1;
    const path = points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * 100;
        const y = 30 - ((p - min) / (max - min || 1)) * 24;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
    return (
      <svg className="h-7 w-full" viewBox="0 0 100 32" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-[#080d1a] text-[#f2f6fc] font-sans pb-24">
      {/* Top Header Navigation Bar */}
      <header className="border-b border-[#1c2e54]/60 bg-[#0c1730]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 font-black text-white shadow-lg shadow-blue-500/20">
                ⚡
              </span>
              <span className="stat-display text-xl font-black uppercase tracking-wider text-white">
                Volley<span className="text-cyan-400">Verse</span>
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {[
                { id: "overview", label: "Overview" },
                { id: "stats", label: "Stats" },
                { id: "matches", label: "Matches" },
                { id: "achievements", label: "Achievements" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === tab.id
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <input
                type="text"
                placeholder="Search players, teams..."
                className="w-56 rounded-xl border border-[#1c2e54] bg-[#070e20] px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-xs ring-2 ring-blue-400/30">
              {player.fullName.charAt(0)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 space-y-6">
        {/* ROW 1: Hero Card + Skill Radar + Key KPIs */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Athlete Card (4 Cols) */}
          <div className="lg:col-span-4 relative overflow-hidden rounded-3xl border border-[#1c2e54] bg-gradient-to-b from-[#111f42] to-[#0a1226] p-6 shadow-2xl">
            <div className="absolute top-2 left-4 text-7xl font-black text-slate-700/20 select-none font-mono">
              #{player.jerseyNo ?? "07"}
            </div>

            {player.isCaptain && (
              <span className="absolute top-6 right-6 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">
                CAPTAIN
              </span>
            )}

            <div className="relative z-10 flex flex-col items-center text-center pt-4">
              <div className="relative mb-4">
                <div className="h-28 w-28 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 p-0.5 shadow-xl shadow-blue-500/20">
                  <div className="h-full w-full rounded-2xl bg-[#0a1226] overflow-hidden flex items-center justify-center">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt={player.fullName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-4xl font-extrabold text-blue-400">{player.fullName.charAt(0)}</span>
                    )}
                  </div>
                </div>
              </div>

              <h2 className="stat-display text-2xl font-black uppercase tracking-wide text-white">
                {player.fullName}
              </h2>
              <div className="mt-1">
                <PositionTag position={player.position} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
                <span className="flex items-center gap-1 bg-[#142347] px-2.5 py-1 rounded-lg border border-[#23396c]">
                  🇮🇳 {player.nationality ?? "India"}
                </span>
                <span className="flex items-center gap-1 bg-[#142347] px-2.5 py-1 rounded-lg border border-[#23396c]">
                  📏 {player.heightCm ?? 195} cm
                </span>
                <span className="flex items-center gap-1 bg-[#142347] px-2.5 py-1 rounded-lg border border-[#23396c]">
                  🏐 {team?.name ?? "Thunder Spikers"}
                </span>
              </div>
            </div>
          </div>

          {/* Skill Radar (3 Cols) */}
          <div className="lg:col-span-3 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 flex flex-col justify-between shadow-xl">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400">
              Skill Radar
            </h3>

            <div className="relative mx-auto my-2 h-44 w-44">
              <svg viewBox="0 0 180 180" className="h-full w-full">
                <polygon points={grid100} fill="none" stroke="#1c2e54" strokeWidth="1" />
                <polygon points={grid50} fill="none" stroke="#1c2e54" strokeWidth="1" strokeDasharray="3 3" />

                {radarSkills.map((s) => {
                  const pt = getRadarPoint(100, s.angle);
                  return <line key={s.name} x1="90" y1="90" x2={pt.split(",")[0]} y2={pt.split(",")[1]} stroke="#1c2e54" strokeWidth="1" />;
                })}

                <polygon points={polygonPoints} fill="rgba(59, 130, 246, 0.3)" stroke="#3b82f6" strokeWidth="2" />

                {radarSkills.map((s) => {
                  const pt = getRadarPoint(125, s.angle);
                  const x = parseFloat(pt.split(",")[0]);
                  const y = parseFloat(pt.split(",")[1]);
                  return (
                    <g key={s.name}>
                      <text x={x} y={y - 6} textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold">
                        {s.name}
                      </text>
                      <text x={x} y={y + 6} textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="900">
                        {s.value}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="text-center text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              Pro Skill Index
            </div>
          </div>

          {/* Key Performance Indicators (5 Cols) */}
          <div className="lg:col-span-5 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Season Key Performance Indicators
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Total Points", val: season.points || 268, rank: "#2 on team", trend: [12, 18, 15, 22, 28, 24], color: "#3b82f6" },
                { label: "Kills", val: season.points || 215, rank: "#1 on team", trend: [10, 15, 12, 19, 23, 20], color: "#06b6d4" },
                { label: "Kill %", val: `${season.successRate ?? 48.7}%`, rank: "#3 in league", trend: [38, 42, 45, 52, 49, 54], color: "#10b981" },
                { label: "Aces", val: season.aces || 23, rank: "#2 on team", trend: [1, 3, 2, 4, 3, 5], color: "#f59e0b" },
                { label: "Errors", val: 18, rank: "#5 on team", trend: [4, 2, 3, 1, 4, 2], color: "#ef4444" },
                { label: "Efficiency", val: "+197", rank: "#2 on team", trend: [120, 145, 160, 180, 197], color: "#a855f7" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-[#1c2e54] bg-[#070e20] p-3 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</span>
                    <div className="stat-display text-xl font-black text-white mt-1">{kpi.val}</div>
                    <div className="text-[9px] font-medium text-slate-500">{kpi.rank}</div>
                  </div>
                  <div className="mt-2">
                    <Sparkline points={kpi.trend} color={kpi.color} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 2: Performance Trend + Attack Breakdown + Serving Breakdown + Heatmap */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Performance Trend (4 Cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl flex flex-col justify-between">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Performance Trend (Last 10 Matches)
            </h3>

            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0c1730", border: "1px solid #1c2e54", borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="points" name="Points" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: "#3b82f6", r: 3 }} />
                  <Line type="monotone" dataKey="killRate" name="Kill %" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-6 pt-2 border-t border-[#1c2e54]/50 text-xs">
              <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span> Points
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Kill %
              </span>
            </div>
          </div>

          {/* Attack Breakdown Donut (3 Cols) */}
          <div className="lg:col-span-3 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl flex flex-col justify-between">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Attack Breakdown
            </h3>

            <div className="relative h-44 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attackBreakdownData} innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                    {attackBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0c1730", border: "1px solid #1c2e54", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="stat-display text-2xl font-black text-white">{attackKills}</span>
                <span className="text-[9px] uppercase tracking-widest text-slate-400">Total Kills</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 text-center text-[10px] border-t border-[#1c2e54]/50 pt-2">
              <div>
                <div className="font-bold text-blue-400">{attackKills}</div>
                <div className="text-slate-500">Kills</div>
              </div>
              <div>
                <div className="font-bold text-emerald-400">{attackTouches}</div>
                <div className="text-slate-500">Touches</div>
              </div>
              <div>
                <div className="font-bold text-rose-400">{attackErrors}</div>
                <div className="text-slate-500">Errors</div>
              </div>
            </div>
          </div>

          {/* Serving Breakdown (2 Cols) */}
          <div className="lg:col-span-2 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl flex flex-col justify-between">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Serving Breakdown
            </h3>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={servingBreakdownData} layout="vertical" margin={{ top: 0, right: 10, left: -25, bottom: 0 }}>
                  <XAxis type="number" stroke="#64748b" fontSize={9} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0c1730", border: "1px solid #1c2e54", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="val" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center text-[10px] text-slate-500 uppercase tracking-wider">
              Serving Accuracy 88%
            </div>
          </div>

          {/* Attack Zone Heatmap (3 Cols) */}
          <div className="lg:col-span-3 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl flex flex-col justify-between">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Attack Zone Heatmap
            </h3>

            <div className="relative h-44 w-full rounded-2xl border border-blue-500/30 bg-[#07132b] p-2 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-cyan-400 shadow-md shadow-cyan-400/50 z-10"></div>

              <div className="grid grid-cols-3 gap-1 h-full w-full">
                <div className="relative rounded-lg bg-blue-900/20 border border-blue-500/20 flex flex-col items-center justify-center p-1">
                  <span className="text-[9px] font-bold text-slate-400">Zone 4</span>
                  <div className="h-6 w-6 rounded-full bg-blue-500/60 flex items-center justify-center text-[10px] font-bold text-white">45%</div>
                </div>
                <div className="relative rounded-lg bg-red-900/30 border border-red-500/30 flex flex-col items-center justify-center p-1">
                  <span className="text-[9px] font-bold text-slate-400">Zone 3</span>
                  <div className="h-7 w-7 rounded-full bg-red-500/80 shadow-lg shadow-red-500/50 flex items-center justify-center text-[10px] font-black text-white">82%</div>
                </div>
                <div className="relative rounded-lg bg-blue-900/20 border border-blue-500/20 flex flex-col items-center justify-center p-1">
                  <span className="text-[9px] font-bold text-slate-400">Zone 2</span>
                  <div className="h-6 w-6 rounded-full bg-blue-500/60 flex items-center justify-center text-[10px] font-bold text-white">38%</div>
                </div>

                <div className="relative rounded-lg bg-blue-900/20 border border-blue-500/20 flex flex-col items-center justify-center p-1">
                  <span className="text-[9px] font-bold text-slate-400">Zone 5</span>
                  <div className="h-5 w-5 rounded-full bg-cyan-500/50 flex items-center justify-center text-[9px] font-bold text-white">20%</div>
                </div>
                <div className="relative rounded-lg bg-amber-900/30 border border-amber-500/30 flex flex-col items-center justify-center p-1">
                  <span className="text-[9px] font-bold text-slate-400">Zone 6</span>
                  <div className="h-7 w-7 rounded-full bg-amber-500/80 shadow-lg shadow-amber-500/50 flex items-center justify-center text-[10px] font-black text-white">65%</div>
                </div>
                <div className="relative rounded-lg bg-blue-900/20 border border-blue-500/20 flex flex-col items-center justify-center p-1">
                  <span className="text-[9px] font-bold text-slate-400">Zone 1</span>
                  <div className="h-5 w-5 rounded-full bg-cyan-500/50 flex items-center justify-center text-[9px] font-bold text-white">15%</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-[#1c2e54]/50">
              <span>Attack Density</span>
              <span className="font-bold text-red-400">High: Zone 3 & Zone 6</span>
            </div>
          </div>
        </div>

        {/* ROW 3: Match Log & Career Highlights */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Match Log (7 Cols) */}
          <div className="lg:col-span-7 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Match Log
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-[#1c2e54] text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Opponent</th>
                    <th className="py-2.5 px-3">Score</th>
                    <th className="py-2.5 px-3 text-right">Points</th>
                    <th className="py-2.5 px-3 text-right">Kills</th>
                    <th className="py-2.5 px-3 text-right">Aces</th>
                    <th className="py-2.5 px-3 text-right">Blocks</th>
                    <th className="py-2.5 px-3 text-center">MVP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2e54]/40">
                  {(() => {
                    const realLogs = completedMatches.map((m) => {
                      const mEvents = allEvents.filter((e) => e.matchId === m.id);
                      const l = playerLine(player, mEvents);
                      const oppId = m.homeTeamId === player.teamId ? m.awayTeamId : m.homeTeamId;
                      const opp = allTeams.find((t) => t.id === oppId)?.shortName ?? "TBD";
                      const sets = m.setScores.length > 0
                        ? `${m.setScores.filter(s => s.homePoints > s.awayPoints).length}-${m.setScores.filter(s => s.awayPoints > s.homePoints).length}`
                        : "3-1";
                      return {
                        date: m.dateISO || "Recent",
                        opp: `vs ${opp}`,
                        score: sets,
                        pts: l.points,
                        kills: Math.max(0, l.points - l.aces - l.blocks),
                        aces: l.aces,
                        blocks: l.blocks,
                        mvp: l.points >= 15,
                      };
                    });

                    const demoLogs = [
                      { date: "18 Aug 2024", opp: "vs Sky High", score: "3-1", pts: 24, kills: 19, aces: 3, blocks: 2, mvp: true },
                      { date: "14 Aug 2024", opp: "vs Net Ninjas", score: "3-2", pts: 28, kills: 23, aces: 4, blocks: 1, mvp: true },
                      { date: "10 Aug 2024", opp: "vs Block Busters", score: "3-0", pts: 18, kills: 15, aces: 2, blocks: 3, mvp: false },
                      { date: "06 Aug 2024", opp: "vs Smashers", score: "1-3", pts: 16, kills: 12, aces: 1, blocks: 2, mvp: false },
                      { date: "02 Aug 2024", opp: "vs Jump Titans", score: "3-1", pts: 20, kills: 17, aces: 2, blocks: 2, mvp: true },
                    ];

                    const displayLogs = realLogs.length > 0 ? realLogs : demoLogs;

                    return displayLogs.map((m, idx) => (
                      <tr key={idx} className="hover:bg-[#142347]/50 transition-colors">
                        <td className="py-3 px-3 text-slate-400">{m.date}</td>
                        <td className="py-3 px-3 font-semibold text-white">{m.opp}</td>
                        <td className="py-3 px-3 font-mono text-cyan-400">{m.score}</td>
                        <td className="py-3 px-3 text-right font-bold text-white">{m.pts}</td>
                        <td className="py-3 px-3 text-right text-blue-400 font-semibold">{m.kills}</td>
                        <td className="py-3 px-3 text-right text-amber-400 font-semibold">{m.aces}</td>
                        <td className="py-3 px-3 text-right text-purple-400 font-semibold">{m.blocks}</td>
                        <td className="py-3 px-3 text-center">
                          {m.mvp ? <span className="text-amber-400 text-sm">⭐</span> : <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Career Highlights (5 Cols) */}
          <div className="lg:col-span-5 rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-5 shadow-xl">
            <h3 className="stat-display text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Career Highlights
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-[#070e20] p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 text-xl font-bold border border-amber-500/40">
                  🏆
                </div>
                <div className="stat-display text-2xl font-black text-amber-400 mt-2">24</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Career High Points</div>
                <div className="text-[9px] text-slate-500 mt-1">vs Sky High · 18 Aug 2024</div>
              </div>

              <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-500/10 to-[#070e20] p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 text-xl font-bold border border-blue-500/40">
                  ⚡
                </div>
                <div className="stat-display text-2xl font-black text-blue-400 mt-2">5</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Single Match Aces</div>
                <div className="text-[9px] text-slate-500 mt-1">vs Net Ninjas · 14 Aug 2024</div>
              </div>

              <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-b from-purple-500/10 to-[#070e20] p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 text-xl font-bold border border-purple-500/40">
                  🔥
                </div>
                <div className="stat-display text-2xl font-black text-purple-400 mt-2">19</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Most Kills</div>
                <div className="text-[9px] text-slate-500 mt-1">vs Sky High · 18 Aug 2024</div>
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-[#070e20] p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 text-xl font-bold border border-emerald-500/40">
                  🎯
                </div>
                <div className="stat-display text-lg font-black text-emerald-400 mt-2 uppercase">Clutch Finisher</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Decisive Points</div>
                <div className="text-[9px] text-slate-500 mt-1">vs Block Busters · 10 Aug 2024</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
