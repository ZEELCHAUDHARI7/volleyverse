import type { Player } from "./types";

/** Players on court per side; a team with fewer cannot start a match. */
export const STARTING_SIX = 6;

/** How many more players a team must register to field a starting six (0 when it can). */
export function squadShortBy(players: Pick<Player, "teamId">[], teamId: string): number {
  const size = players.filter((p) => p.teamId === teamId).length;
  return Math.max(0, STARTING_SIX - size);
}
