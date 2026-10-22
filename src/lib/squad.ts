import type { Player } from "./types";

/** Players on court per side; a team with fewer cannot start a match. */
export const STARTING_SIX = 6;

/** How many more players a team must register to field a starting six (0 when it can). */
export function squadShortBy(players: Pick<Player, "teamId">[], teamId: string): number {
  const size = players.filter((p) => p.teamId === teamId).length;
  return Math.max(0, STARTING_SIX - size);
}

type RosterSortable = Pick<Player, "jerseyNo" | "fullName">;

/** Roster order: shirt number up, players without one last, then by name. */
export function byShirtNumber(a: RosterSortable, b: RosterSortable): number {
  if (a.jerseyNo !== b.jerseyNo) {
    if (a.jerseyNo === null) return 1;
    if (b.jerseyNo === null) return -1;
    return a.jerseyNo - b.jerseyNo;
  }
  return a.fullName.localeCompare(b.fullName);
}
