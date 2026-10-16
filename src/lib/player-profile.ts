import type { Match, Player, StatEvent, Team } from "./types";
import { playerLine, type PlayerLine } from "./metrics.ts";
import { outcomeFor, setTally, type Outcome } from "./analytics/general.ts";

/**
 * The public player profile. Every number comes from the published events it
 * is given; with none, the profile says so rather than showing a stand-in.
 */

/** Points a player scored: kills (incl. tools), aces and stuff blocks. */
export function totalPoints(line: Pick<PlayerLine, "points" | "aces" | "blocks">): number {
  return line.points + line.aces + line.blocks;
}

/** A percentage to one decimal, or null with no attempts to divide by. */
export function rate(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

export interface MatchLogRow {
  match: Match;
  opponentId: string;
  setsFor: number;
  setsAgainst: number;
  result: Outcome;
  line: PlayerLine;
  totalPoints: number;
}

/**
 * Completed matches the player took part in (a line-up place or any event
 * naming them), newest first, read from the player's side of the net.
 */
export function matchLog(player: Player, matches: Match[], events: StatEvent[]): MatchLogRow[] {
  const named = new Set<string>();
  for (const e of events) {
    if (e.playerId === player.id || e.vsPlayerId === player.id) named.add(e.matchId);
  }
  return matches
    .filter(
      (m) =>
        m.status === "completed" &&
        (named.has(m.id) || m.rosters.some((r) => r.playerId === player.id)),
    )
    .sort(
      (a, b) =>
        `${b.dateISO}${b.time ?? ""}`.localeCompare(`${a.dateISO}${a.time ?? ""}`) ||
        a.id.localeCompare(b.id),
    )
    .map((m) => {
      const home = m.homeTeamId === player.teamId;
      const tally = setTally(m);
      const line = playerLine(player, events.filter((e) => e.matchId === m.id));
      return {
        match: m,
        opponentId: home ? m.awayTeamId : m.homeTeamId,
        setsFor: home ? tally.home : tally.away,
        setsAgainst: home ? tally.away : tally.home,
        result: outcomeFor(m, player.teamId),
        line,
        totalPoints: totalPoints(line),
      };
    });
}

export type HighStat = "totalPoints" | "kills" | "aces" | "blocks" | "digs";

const HIGH_VALUE: Record<HighStat, (r: MatchLogRow) => number> = {
  totalPoints: (r) => r.totalPoints,
  kills: (r) => r.line.points,
  aces: (r) => r.line.aces,
  blocks: (r) => r.line.blocks,
  digs: (r) => r.line.saves,
};

export interface MatchHigh {
  stat: HighStat;
  value: number;
  row: MatchLogRow;
}

/** The best single match for each stat; a stat never recorded has none. Ties go to the newer match. */
export function matchHighs(log: MatchLogRow[]): MatchHigh[] {
  const highs: MatchHigh[] = [];
  for (const stat of Object.keys(HIGH_VALUE) as HighStat[]) {
    let best: MatchHigh | null = null;
    for (const row of log) {
      const value = HIGH_VALUE[stat](row);
      if (value > 0 && (!best || value > best.value)) best = { stat, value, row };
    }
    if (best) highs.push(best);
  }
  return highs;
}

export interface DirectoryHit {
  kind: "player" | "team";
  id: string;
  label: string;
  detail: string | null;
}

/** Players and teams whose name contains the query, names starting with it first. */
export function searchDirectory(
  query: string,
  players: Pick<Player, "id" | "fullName" | "teamId">[],
  teams: Pick<Team, "id" | "name" | "shortName" | "city">[],
  limit = 8,
): DirectoryHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const scored: { hit: DirectoryHit; prefix: boolean }[] = [];
  for (const p of players) {
    const name = p.fullName.toLowerCase();
    if (name.includes(q))
      scored.push({
        hit: { kind: "player", id: p.id, label: p.fullName, detail: teamName.get(p.teamId) ?? null },
        prefix: name.startsWith(q),
      });
  }
  for (const t of teams) {
    const name = t.name.toLowerCase();
    if (name.includes(q) || t.shortName.toLowerCase().includes(q))
      scored.push({
        hit: { kind: "team", id: t.id, label: t.name, detail: t.city },
        prefix: name.startsWith(q) || t.shortName.toLowerCase().startsWith(q),
      });
  }
  return [...scored.filter((s) => s.prefix), ...scored.filter((s) => !s.prefix)]
    .slice(0, limit)
    .map((s) => s.hit);
}
