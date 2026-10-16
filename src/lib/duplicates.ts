import type { Match } from "./types";

/**
 * Duplicate checks for League Setup and the two schedule screens.
 *
 * Names are compared ignoring case and spacing: "Goa  Guardians" and "goa
 * guardians" would read as the same team on every page that shows them.
 */

export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The row already using this name, or null. A blank name never clashes. */
export function nameTaken<T extends { name: string }>(name: string, existing: T[]): T | null {
  const key = nameKey(name);
  if (!key) return null;
  return existing.find((x) => nameKey(x.name) === key) ?? null;
}

/** The message shown under a name box whose name is already in use. */
export function takenMessage(noun: string, name: string, where?: string): string {
  return `A ${noun} called "${name.trim()}" already exists${where ? ` ${where}` : ""}.`;
}

export interface FixtureDraft {
  tournamentId: string;
  homeTeamId: string;
  awayTeamId: string;
  dateISO: string;
}

/**
 * Matches already booked between the same two teams, on the same day, in the
 * same tournament, either way round. A cancelled match leaves the slot free.
 */
export function fixtureClashes(draft: FixtureDraft, matches: Match[]): Match[] {
  const pair = [draft.homeTeamId, draft.awayTeamId].sort().join("|");
  return matches.filter(
    (m) =>
      m.status !== "cancelled" &&
      m.tournamentId === draft.tournamentId &&
      m.dateISO === draft.dateISO &&
      [m.homeTeamId, m.awayTeamId].sort().join("|") === pair,
  );
}

/**
 * Today as YYYY-MM-DD on the console's clock. `toISOString` is UTC, which in
 * India is still the previous day until 05:30.
 */
export function localDateISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What to confirm before booking a fixture. Neither is refused: a repeat can
 * be a genuine second meeting, and a past date is how a match already played
 * gets entered.
 */
export function fixtureWarnings(
  draft: FixtureDraft,
  matches: Match[],
  todayISO: string,
  teamName: (id: string) => string,
): string[] {
  const warnings: string[] = [];
  if (draft.tournamentId && draft.homeTeamId && draft.awayTeamId && draft.dateISO) {
    const n = fixtureClashes(draft, matches).length;
    if (n > 0)
      warnings.push(
        `${teamName(draft.homeTeamId)} vs ${teamName(draft.awayTeamId)} is already scheduled on ${draft.dateISO} in this tournament${n > 1 ? ` (${n} times)` : ""}.`,
      );
  }
  if (draft.dateISO && draft.dateISO < todayISO)
    warnings.push(`${draft.dateISO} is in the past.`);
  return warnings;
}
