import type { Side } from "./rally";

type SetScore = { setNo: number; homePoints: number; awayPoints: number };

/**
 * What "End match" records, worked out before the scorer confirms it so the
 * prompt can say exactly that. Both scoring screens end a match through this.
 */
export interface EndMatchPlan {
  /**
   * The set in progress when it has already been won but not yet banked. It
   * is saved, and it counts toward the result like any finished set.
   */
  bankedSet: SetScore | null;
  /**
   * The set in progress when it was cut short. Not saved as a set score: every
   * screen counts a saved set as won by whoever leads it. Its rallies stay in
   * the stats. Null when no point has been played in it.
   */
  unfinishedSet: SetScore | null;
  /** Sets each side ends with, counting a banked set. */
  sets: { us: number; opp: number };
  /** Who the match is awarded to, on finished sets only. */
  winner: Side | null;
}

export function planEndMatch(
  s: { set: number; usScore: number; oppScore: number; usSets: number; oppSets: number },
  setOver: boolean,
): EndMatchPlan {
  const score: SetScore = { setNo: s.set, homePoints: s.usScore, awayPoints: s.oppScore };
  const played = s.usScore > 0 || s.oppScore > 0;
  const sets = {
    us: s.usSets + (setOver && s.usScore > s.oppScore ? 1 : 0),
    opp: s.oppSets + (setOver && s.oppScore > s.usScore ? 1 : 0),
  };
  return {
    bankedSet: setOver ? score : null,
    unfinishedSet: !setOver && played ? score : null,
    sets,
    winner: sets.us === sets.opp ? null : sets.us > sets.opp ? "US" : "OPP",
  };
}
