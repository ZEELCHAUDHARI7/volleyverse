import type { Side } from "./rally";

/**
 * What "End match" records, worked out before the scorer confirms it so the
 * prompt can say exactly that. Both scoring screens end a match through this.
 */
export interface EndMatchPlan {
  /**
   * The set in progress, saved as it stands so its points stay on record.
   * Null when no point has been played in it.
   */
  bankedSet: { setNo: number; homePoints: number; awayPoints: number } | null;
  /**
   * Who the match is awarded to. Sets decide it, so a side ahead on points
   * but level on sets takes nothing — the set in progress is unfinished.
   */
  winner: Side | null;
}

export function planEndMatch(s: {
  set: number;
  usScore: number;
  oppScore: number;
  usSets: number;
  oppSets: number;
}): EndMatchPlan {
  return {
    bankedSet:
      s.usScore > 0 || s.oppScore > 0
        ? { setNo: s.set, homePoints: s.usScore, awayPoints: s.oppScore }
        : null,
    winner: s.usSets === s.oppSets ? null : s.usSets > s.oppSets ? "US" : "OPP",
  };
}
