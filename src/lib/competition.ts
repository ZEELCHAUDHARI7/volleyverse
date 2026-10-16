import type { Db, League, Season, Tournament } from "./types";

export interface Competition {
  league: League | undefined;
  season: Season | undefined;
  /** The season's tournaments, where fixtures are booked. */
  tournaments: Tournament[];
}

/**
 * The league and season the console works in.
 *
 * The database returns rows in no fixed order, so "the first active league"
 * could change between loads, and League Setup could show one season while
 * the schedule screens booked into another. Active wins, then the one holding
 * the most matches (the competition actually in use), then the id, so every
 * screen and every load lands on the same one.
 */
export function pickCompetition(
  db: Pick<Db, "leagues" | "seasons" | "tournaments" | "matches">,
): Competition {
  const perTournament = new Map<string, number>();
  for (const m of db.matches)
    perTournament.set(m.tournamentId, (perTournament.get(m.tournamentId) ?? 0) + 1);
  const seasonMatches = (s: Season) =>
    db.tournaments
      .filter((t) => t.seasonId === s.id)
      .reduce((n, t) => n + (perTournament.get(t.id) ?? 0), 0);
  const leagueMatches = (l: League) =>
    db.seasons.filter((s) => s.leagueId === l.id).reduce((n, s) => n + seasonMatches(s), 0);

  const league = best(db.leagues, leagueMatches);
  const season = league
    ? best(
        db.seasons.filter((s) => s.leagueId === league.id),
        seasonMatches,
      )
    : undefined;
  const tournaments = season ? db.tournaments.filter((t) => t.seasonId === season.id) : [];
  return { league, season, tournaments };
}

function best<T extends { id: string; status: string }>(
  rows: T[],
  matches: (row: T) => number,
): T | undefined {
  return [...rows].sort(
    (a, b) =>
      Number(b.status === "active") - Number(a.status === "active") ||
      matches(b) - matches(a) ||
      a.id.localeCompare(b.id),
  )[0];
}
