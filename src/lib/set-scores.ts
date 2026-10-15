import type { MatchSet } from "./types";

/**
 * The saved set scores a correction would delete: every set in `before` whose
 * number is missing from `after`. A blank set in the editor means "not played",
 * so clearing boxes removes sets — the review page asks before saving that.
 */
export function removedSets(before: MatchSet[], after: MatchSet[]): MatchSet[] {
  const kept = new Set(after.map((s) => s.setNo));
  return before.filter((s) => !kept.has(s.setNo));
}
