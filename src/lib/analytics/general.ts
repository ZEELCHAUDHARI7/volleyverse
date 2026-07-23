import type { Match, Team, Tournament } from "../types";

/**
 * GENERAL ANALYTICS — sport-agnostic season & historical maths.
 *
 * Everything here derives from `Match` records only (result, set scores,
 * date, venue side), so it works identically for any sport that records a
 * winner and set/period scores. No event-level or volleyball-specific logic
 * lives here — that belongs in the sport module.
 */

export type Outcome = "W" | "L" | null;

/** Count the sets each side won in a completed match. */
export function setTally(m: Match): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const s of m.setScores) {
    if (s.homePoints > s.awayPoints) home++;
    else if (s.awayPoints > s.homePoints) away++;
  }
  return { home, away };
}

/** Resolve a match result to W/L for a given team (null if not decided). */
export function outcomeFor(m: Match, teamId: string): Outcome {
  if (m.status !== "completed") return null;
  const involved = m.homeTeamId === teamId || m.awayTeamId === teamId;
  if (!involved) return null;
  const winnerId =
    m.winnerTeamId ??
    (() => {
      const t = setTally(m);
      if (t.home === t.away) return null;
      return t.home > t.away ? m.homeTeamId : m.awayTeamId;
    })();
  if (!winnerId) return null;
  return winnerId === teamId ? "W" : "L";
}

/** Chronologically completed matches involving a team. */
export function teamMatches(matches: Match[], teamId: string): Match[] {
  return matches
    .filter(
      (m) =>
        m.status === "completed" &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId),
    )
    .sort((a, b) =>
      `${a.dateISO}${a.time ?? ""}`.localeCompare(`${b.dateISO}${b.time ?? ""}`),
    );
}

export interface SplitRecord {
  played: number;
  won: number;
  lost: number;
}

export interface TeamRecord {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  winPct: number; // 0..100
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Average points scored per set. */
  avgPointsFor: number;
  avgPointsAgainst: number;
  longestWinStreak: number;
  longestLossStreak: number;
  /** Positive = current win streak, negative = current losing streak. */
  currentStreak: number;
  /** Recent form, newest last, e.g. ["W","L","W","W","W"]. */
  form: Outcome[];
  home: SplitRecord;
  away: SplitRecord;
}

export function teamRecord(matches: Match[], teamId: string): TeamRecord {
  const ms = teamMatches(matches, teamId);
  const rec: TeamRecord = {
    teamId,
    played: 0,
    won: 0,
    lost: 0,
    winPct: 0,
    setsWon: 0,
    setsLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    avgPointsFor: 0,
    avgPointsAgainst: 0,
    longestWinStreak: 0,
    longestLossStreak: 0,
    currentStreak: 0,
    form: [],
    home: { played: 0, won: 0, lost: 0 },
    away: { played: 0, won: 0, lost: 0 },
  };

  let curWin = 0;
  let curLoss = 0;
  let setCount = 0;

  for (const m of ms) {
    const isHome = m.homeTeamId === teamId;
    const outcome = outcomeFor(m, teamId);
    if (outcome === null) continue;

    rec.played++;
    const split = isHome ? rec.home : rec.away;
    split.played++;

    // Set + point tallies from the team's perspective.
    for (const s of m.setScores) {
      const forPts = isHome ? s.homePoints : s.awayPoints;
      const againstPts = isHome ? s.awayPoints : s.homePoints;
      rec.pointsFor += forPts;
      rec.pointsAgainst += againstPts;
      if (forPts > againstPts) rec.setsWon++;
      else if (againstPts > forPts) rec.setsLost++;
      setCount++;
    }

    if (outcome === "W") {
      rec.won++;
      split.won++;
      curWin++;
      curLoss = 0;
    } else {
      rec.lost++;
      split.lost++;
      curLoss++;
      curWin = 0;
    }
    rec.longestWinStreak = Math.max(rec.longestWinStreak, curWin);
    rec.longestLossStreak = Math.max(rec.longestLossStreak, curLoss);
    rec.form.push(outcome);
  }

  rec.winPct = rec.played > 0 ? Math.round((rec.won / rec.played) * 1000) / 10 : 0;
  rec.avgPointsFor = setCount > 0 ? Math.round((rec.pointsFor / setCount) * 10) / 10 : 0;
  rec.avgPointsAgainst =
    setCount > 0 ? Math.round((rec.pointsAgainst / setCount) * 10) / 10 : 0;
  rec.currentStreak = curWin > 0 ? curWin : -curLoss;
  rec.form = rec.form.slice(-6);
  return rec;
}

// ---------------------------------------------------------------------
// Head-to-head
// ---------------------------------------------------------------------

export interface HeadToHead {
  teamA: string;
  teamB: string;
  played: number;
  aWins: number;
  bWins: number;
  aSets: number;
  bSets: number;
  matches: Match[];
}

export function headToHead(
  matches: Match[],
  teamA: string,
  teamB: string,
): HeadToHead {
  const h2h: HeadToHead = {
    teamA,
    teamB,
    played: 0,
    aWins: 0,
    bWins: 0,
    aSets: 0,
    bSets: 0,
    matches: [],
  };
  const between = matches
    .filter(
      (m) =>
        m.status === "completed" &&
        ((m.homeTeamId === teamA && m.awayTeamId === teamB) ||
          (m.homeTeamId === teamB && m.awayTeamId === teamA)),
    )
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  for (const m of between) {
    h2h.played++;
    const t = setTally(m);
    const aIsHome = m.homeTeamId === teamA;
    h2h.aSets += aIsHome ? t.home : t.away;
    h2h.bSets += aIsHome ? t.away : t.home;
    const oc = outcomeFor(m, teamA);
    if (oc === "W") h2h.aWins++;
    else if (oc === "L") h2h.bWins++;
  }
  h2h.matches = between;
  return h2h;
}

// ---------------------------------------------------------------------
// Monthly / yearly performance
// ---------------------------------------------------------------------

export interface PeriodPerformance {
  period: string; // "2026-03" or "2026"
  label: string; // "Mar 2026" or "2026"
  played: number;
  won: number;
  lost: number;
  winPct: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function periodPerformance(
  matches: Match[],
  teamId: string,
  grain: "month" | "year",
): PeriodPerformance[] {
  const buckets = new Map<string, PeriodPerformance>();
  for (const m of teamMatches(matches, teamId)) {
    const outcome = outcomeFor(m, teamId);
    if (outcome === null) continue;
    const [y, mo] = m.dateISO.split("-");
    const period = grain === "month" ? `${y}-${mo}` : y;
    const label =
      grain === "month" ? `${MONTHS[Number(mo) - 1] ?? mo} ${y}` : y;
    let b = buckets.get(period);
    if (!b) {
      b = { period, label, played: 0, won: 0, lost: 0, winPct: 0 };
      buckets.set(period, b);
    }
    b.played++;
    if (outcome === "W") b.won++;
    else b.lost++;
  }
  const rows = [...buckets.values()].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  rows.forEach((r) => (r.winPct = r.played ? Math.round((r.won / r.played) * 100) : 0));
  return rows;
}

// ---------------------------------------------------------------------
// Tournament performance
// ---------------------------------------------------------------------

export interface TournamentPerformance {
  tournamentId: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  winPct: number;
}

export function tournamentPerformance(
  matches: Match[],
  tournaments: Tournament[],
  teamId: string,
): TournamentPerformance[] {
  const rows: TournamentPerformance[] = [];
  for (const t of tournaments) {
    const ms = teamMatches(
      matches.filter((m) => m.tournamentId === t.id),
      teamId,
    );
    if (ms.length === 0) continue;
    let won = 0;
    let lost = 0;
    for (const m of ms) {
      const oc = outcomeFor(m, teamId);
      if (oc === "W") won++;
      else if (oc === "L") lost++;
    }
    const played = won + lost;
    rows.push({
      tournamentId: t.id,
      name: t.name,
      played,
      won,
      lost,
      winPct: played ? Math.round((won / played) * 100) : 0,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------
// Match difficulty — how tough was a fixture, 0..100.
// ---------------------------------------------------------------------

/**
 * A blend of (a) the opponent's season win rate (stronger opponent = harder)
 * and (b) how close the match itself was (tighter scoreline = harder). Both
 * derive from Match records only. Returns a 0..100 rating plus a label.
 */
export function matchDifficulty(
  matches: Match[],
  match: Match,
  teamId: string,
): { rating: number; label: string; oppWinPct: number; closeness: number } {
  const oppId = match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId;
  const opp = teamRecord(matches, oppId);
  const oppWinPct = opp.played > 0 ? opp.winPct : 50;

  // Closeness: 1.0 when decided by the minimum margin, →0 for a sweep.
  const t = setTally(match);
  const setMargin = Math.abs(t.home - t.away);
  const setsPlayed = t.home + t.away || 1;
  const closeness = Math.max(0, 1 - setMargin / setsPlayed); // 0..1

  const rating = Math.round(oppWinPct * 0.6 + closeness * 100 * 0.4);
  const label =
    rating >= 75 ? "Very hard" : rating >= 55 ? "Hard" : rating >= 35 ? "Moderate" : "Comfortable";
  return { rating, label, oppWinPct, closeness: Math.round(closeness * 100) };
}

// ---------------------------------------------------------------------
// Season summary across a set of teams.
// ---------------------------------------------------------------------

export interface SeasonSummary {
  matchesPlayed: number;
  totalSets: number;
  totalPoints: number;
  avgPointsPerSet: number;
  sweeps: number; // 3–0 / 2–0 results
  fiveSetters: number;
  closestMatchId: string | null;
}

export function seasonSummary(matches: Match[]): SeasonSummary {
  const completed = matches.filter(
    (m) => m.status === "completed" && m.setScores.length > 0,
  );
  let totalSets = 0;
  let totalPoints = 0;
  let sweeps = 0;
  let fiveSetters = 0;
  let closestMatchId: string | null = null;
  let closestMargin = Infinity;

  for (const m of completed) {
    const t = setTally(m);
    totalSets += m.setScores.length;
    for (const s of m.setScores) totalPoints += s.homePoints + s.awayPoints;
    const margin = Math.abs(t.home - t.away);
    if (margin >= 2 && Math.min(t.home, t.away) === 0) sweeps++;
    if (m.setScores.length === 5) fiveSetters++;
    if (margin < closestMargin) {
      closestMargin = margin;
      closestMatchId = m.id;
    }
  }

  return {
    matchesPlayed: completed.length,
    totalSets,
    totalPoints,
    avgPointsPerSet: totalSets ? Math.round((totalPoints / totalSets) * 10) / 10 : 0,
    sweeps,
    fiveSetters,
    closestMatchId,
  };
}
