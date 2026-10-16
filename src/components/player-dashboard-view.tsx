"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Player, StatEvent, Match, Team } from "@/lib/types";
import { playerLine, seasonRecord, type PlayerLine, type RecordStat } from "@/lib/metrics";
import {
  matchHighs,
  matchLog,
  rate,
  searchDirectory,
  totalPoints,
  type DirectoryHit,
  type HighStat,
  type MatchLogRow,
} from "@/lib/player-profile";
import { ChartShell, axisProps, theme, tooltipStyle } from "@/components/charts";
import { PositionTag } from "@/components/ui";

interface PlayerDashboardViewProps {
  player: Player;
  team?: Team;
  /** Published matches only. */
  allMatches: Match[];
  /** Events of published matches only. */
  allEvents: StatEvent[];
  allTeams: Team[];
  allPlayers: Player[];
}

type Tab = "overview" | "stats" | "matches" | "achievements";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "stats", label: "Stats" },
  { id: "matches", label: "Matches" },
  { id: "achievements", label: "Achievements" },
];

/**
 * The public player profile. Every number is derived from published events;
 * where there are none the page says so instead of drawing a stand-in.
 */
export function PlayerDashboardView({
  player,
  team,
  allMatches,
  allEvents,
  allTeams,
  allPlayers,
}: PlayerDashboardViewProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabsId = useId();

  const season = playerLine(player, allEvents);
  const log = matchLog(player, allMatches, allEvents);
  const shortName = (id: string) => allTeams.find((t) => t.id === id)?.shortName ?? "TBD";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 md:px-8">
      <header className="card-premium relative overflow-hidden rounded-3xl p-6 sm:p-8">
        {player.jerseyNo !== null && (
          <span
            aria-hidden
            className="stat-display tnum absolute -top-2 right-4 select-none text-8xl font-extrabold text-ink/5 sm:text-9xl"
          >
            {player.jerseyNo}
          </span>
        )}
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PositionTag position={player.position} />
              {player.isCaptain && <Chip>Captain</Chip>}
              {player.isReserve && <Chip>Reserve</Chip>}
            </div>
            <h1 className="stat-display mt-3 text-4xl font-extrabold uppercase leading-none sm:text-6xl">
              {player.fullName}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dim">
              {player.jerseyNo !== null && <span className="tnum">#{player.jerseyNo}</span>}
              {team && (
                <Link href={`/team?team=${team.id}`} className="font-semibold text-ink hover:text-accent">
                  {team.name}
                </Link>
              )}
              {player.nationality && <span>{player.nationality}</span>}
              {player.heightCm !== null && <span className="tnum">{player.heightCm} cm</span>}
            </p>
          </div>
          <DirectorySearch players={allPlayers} teams={allTeams} />
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Player profile"
        className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface2/40 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${tabsId}-${t.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-${t.id}-panel`}
            onClick={() => setTab(t.id)}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-4 text-xs font-bold uppercase tracking-wider transition-colors ${
              tab === t.id ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "text-dim hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section
        id={`${tabsId}-${tab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${tab}-tab`}
        className="mt-6"
      >
        {tab === "overview" && (
          <Overview player={player} season={season} log={log} shortName={shortName} />
        )}
        {tab === "stats" && <Stats player={player} season={season} />}
        {tab === "matches" && <Matches player={player} log={log} shortName={shortName} />}
        {tab === "achievements" && (
          <Achievements player={player} log={log} events={allEvents} shortName={shortName} />
        )}
      </section>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/30">
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl px-6 py-10 text-center text-sm text-dim">{children}</div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function Overview({
  player,
  season,
  log,
  shortName,
}: {
  player: Player;
  season: PlayerLine;
  log: MatchLogRow[];
  shortName: (id: string) => string;
}) {
  const tiles = [
    { label: "Matches", value: String(log.length) },
    { label: "Total points", value: String(totalPoints(season)) },
    { label: "Kills", value: String(season.points) },
    { label: "Kill %", value: pct(rate(season.points, season.spikeAttempts)) },
    { label: "Aces", value: String(season.aces) },
    { label: "Blocks", value: String(season.blocks) },
  ];
  const trend = [...log].reverse().map((r) => ({
    name: `vs ${shortName(r.opponentId)}`,
    points: r.totalPoints,
    kills: r.line.points,
  }));
  const t = theme();

  return (
    <div className="space-y-6">
      {log.length === 0 && (
        <Empty>
          No published matches for {player.fullName} yet. Their numbers appear here once a match
          they played in is published.
        </Empty>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((k) => (
          <div key={k.label} className="card-premium rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-dim">{k.label}</p>
            <p className="stat-display tnum mt-1 text-3xl font-extrabold">{k.value}</p>
          </div>
        ))}
      </div>
      <ChartShell
        title="Points per match"
        insight="Total points and kills in each published match, oldest first."
        height={240}
        empty={trend.length < 2 ? "The trend appears once two of their matches are published." : undefined}
      >
        <LineChart data={trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
          <XAxis dataKey="name" {...axisProps()} />
          <YAxis allowDecimals={false} {...axisProps()} />
          <Tooltip {...tooltipStyle()} />
          <Line type="monotone" dataKey="points" name="Points" stroke={t.accent} strokeWidth={2.5} dot={{ fill: t.accent, r: 4 }} />
          <Line type="monotone" dataKey="kills" name="Kills" stroke={t.azure} strokeWidth={2.5} dot={{ fill: t.azure, r: 4 }} />
        </LineChart>
      </ChartShell>
    </div>
  );
}

function Stats({ player, season: s }: { player: Player; season: PlayerLine }) {
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Attack",
      rows: [
        ["Attempts", String(s.spikeAttempts)],
        ["Kills", String(s.points)],
        ["Kept in play", String(s.spikeSuccesses - s.points)],
        ["Errors", String(s.spikeAttempts - s.spikeSuccesses)],
        ["Kill %", pct(rate(s.points, s.spikeAttempts))],
      ],
    },
    {
      title: "Serve",
      rows: [
        ["Serves", String(s.serveAttempts)],
        ["Aces", String(s.aces)],
        ["In play", String(s.serveAttempts - s.aces - s.serveErrors)],
        ["Errors", String(s.serveErrors)],
        ["Ace %", pct(rate(s.aces, s.serveAttempts))],
        ["Serves in", pct(rate(s.serveAttempts - s.serveErrors, s.serveAttempts))],
      ],
    },
    {
      title: "Reception",
      rows: [
        ["Receptions", String(s.receiveAttempts)],
        ["Perfect", String(s.receivesPerfect)],
        ["Errors", String(s.receiveErrors)],
        ["Positive %", pct(rate(s.receivesGood, s.receiveAttempts))],
      ],
    },
    {
      title: "Setting",
      rows: [
        ["Sets", String(s.setAttempts)],
        ["Assists", String(s.assists)],
        ["Errors", String(s.setAttempts - s.setSuccesses)],
      ],
    },
    {
      title: "Block",
      rows: [
        ["Attempts", String(s.blockAttempts)],
        ["Stuff blocks", String(s.blocks)],
        ["Block %", pct(rate(s.blocks, s.blockAttempts))],
      ],
    },
    {
      title: "Defence",
      rows: [
        ["Dig attempts", String(s.digAttempts)],
        ["Digs", String(s.saves)],
        ["Super digs", String(s.superDigs)],
        ["Dig %", pct(rate(s.saves, s.digAttempts))],
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-dim">
        {player.fullName}&apos;s season from every published match. Errors across all skills:{" "}
        <span className="tnum font-semibold text-ink">{s.errors}</span>.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="card-premium rounded-2xl p-5">
            <h3 className="stat-display text-lg font-bold uppercase tracking-wide">{g.title}</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              {g.rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-dim">{label}</dt>
                  <dd className="tnum font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function Matches({
  player,
  log,
  shortName,
}: {
  player: Player;
  log: MatchLogRow[];
  shortName: (id: string) => string;
}) {
  if (log.length === 0) return <Empty>No published matches for {player.fullName} yet.</Empty>;
  return (
    <div className="card-premium overflow-x-auto rounded-2xl p-2 sm:p-4">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wider text-dim">
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Opponent</th>
            <th className="px-3 py-2.5">Result</th>
            <th className="px-3 py-2.5 text-right">Points</th>
            <th className="px-3 py-2.5 text-right">Kills</th>
            <th className="px-3 py-2.5 text-right">Aces</th>
            <th className="px-3 py-2.5 text-right">Blocks</th>
            <th className="px-3 py-2.5 text-right">Digs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {log.map((r) => (
            <tr key={r.match.id}>
              <td className="tnum px-3 py-3 text-dim">{r.match.dateISO}</td>
              <td className="px-3 py-3 font-semibold">
                <Link href={`/matches/${r.match.id}`} className="hover:text-accent">
                  vs {shortName(r.opponentId)}
                </Link>
              </td>
              <td className="tnum px-3 py-3">
                {r.result ? (
                  <span className={r.result === "W" ? "text-ok" : "text-err"}>
                    {r.result} {r.setsFor}–{r.setsAgainst}
                  </span>
                ) : (
                  <span className="text-dim">
                    {r.setsFor}–{r.setsAgainst}
                  </span>
                )}
              </td>
              <td className="tnum px-3 py-3 text-right font-bold">{r.totalPoints}</td>
              <td className="tnum px-3 py-3 text-right">{r.line.points}</td>
              <td className="tnum px-3 py-3 text-right">{r.line.aces}</td>
              <td className="tnum px-3 py-3 text-right">{r.line.blocks}</td>
              <td className="tnum px-3 py-3 text-right">{r.line.saves}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HIGH_LABEL: Record<HighStat, string> = {
  totalPoints: "Most points in a match",
  kills: "Most kills in a match",
  aces: "Most aces in a match",
  blocks: "Most blocks in a match",
  digs: "Most digs in a match",
};

const RECORD_LABEL: Record<RecordStat, string> = {
  points: "attack points",
  aces: "aces",
  blocks: "blocks",
  superDigs: "super digs",
};

function Achievements({
  player,
  log,
  events,
  shortName,
}: {
  player: Player;
  log: MatchLogRow[];
  events: StatEvent[];
  shortName: (id: string) => string;
}) {
  const highs = matchHighs(log);
  // League-wide single-match records this player holds.
  const records = (Object.keys(RECORD_LABEL) as RecordStat[])
    .map((stat) => seasonRecord(stat, events))
    .filter((r) => r !== null && r.playerId === player.id);

  if (highs.length === 0)
    return (
      <Empty>
        No achievements for {player.fullName} yet. Their single-match bests appear after a
        published match with recorded stats.
      </Empty>
    );

  return (
    <div className="space-y-4">
      {records.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {records.map((r) => (
            <span
              key={r!.stat}
              className="rounded-xl bg-accent/15 px-3 py-2 text-xs font-bold text-accent ring-1 ring-accent/30"
            >
              League record · {r!.value} {RECORD_LABEL[r!.stat]} in one match
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {highs.map((h) => (
          <div key={h.stat} className="card-premium rounded-2xl p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-dim">{HIGH_LABEL[h.stat]}</p>
            <p className="stat-display tnum mt-1 text-4xl font-extrabold text-accent">{h.value}</p>
            <Link href={`/matches/${h.row.match.id}`} className="mt-1 block text-xs text-dim hover:text-ink">
              vs {shortName(h.row.opponentId)} · {h.row.match.dateISO}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Find any player or team by name and go to them. */
function DirectorySearch({ players, teams }: { players: Player[]; teams: Team[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const hits = searchDirectory(query, players, teams);
  const hrefOf = (h: DirectoryHit) => (h.kind === "player" ? `/players/${h.id}` : `/team?team=${h.id}`);

  return (
    <div className="relative w-full sm:w-72">
      <label htmlFor={inputId} className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-dim">
        Find a player or team
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) router.push(hrefOf(hits[0]));
          if (e.key === "Escape") setQuery("");
        }}
        placeholder="Search players, teams…"
        autoComplete="off"
        className="min-h-11 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-ink placeholder:text-dim focus:border-accent focus:outline-none"
      />
      {query.trim() && (
        <ul
          aria-label="Search results"
          className="card-premium absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl p-1"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-dim">No player or team matches “{query.trim()}”.</li>
          ) : (
            hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link
                  href={hrefOf(h)}
                  onClick={() => setQuery("")}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent/10"
                >
                  <span className="truncate font-semibold">{h.label}</span>
                  <span className="shrink-0 text-xs text-dim">
                    {h.kind === "team" ? "Team" : (h.detail ?? "")}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
