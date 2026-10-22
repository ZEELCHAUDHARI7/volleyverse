import { matchTarget } from "./rally.ts";
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

/**
 * Points that take a set. A match does not record which tracker scored it:
 * /spikes plays every set to 15, /rally plays to 25 with a 15-point decider.
 */
const SET_TARGETS = [15, 25];

/** Could this score end a set at one of SET_TARGETS? */
function isFinishedSet(a: number, b: number): boolean {
  const won = Math.max(a, b);
  const lost = Math.min(a, b);
  return SET_TARGETS.some((target) =>
    won === target ? lost <= target - 2 : won > target && won - lost === 2,
  );
}

/**
 * Why these set scores cannot be saved, one sentence per problem, or an empty
 * list when they can. `sets` are the editor's non-blank rows in set order.
 */
export function setScoreProblems(sets: MatchSet[], totalSets: number): string[] {
  const problems: string[] = [];
  if (sets.some((s, i) => s.setNo !== i + 1)) {
    problems.push("Sets have to run consecutively from set 1 — fill the gap before saving.");
  }
  const need = matchTarget(totalSets);
  let home = 0;
  let away = 0;
  for (const s of sets) {
    const score = `Set ${s.setNo} (${s.homePoints}–${s.awayPoints})`;
    if (home >= need || away >= need) {
      problems.push(`Set ${s.setNo} comes after the match was already decided ${home}–${away} on sets.`);
    } else if (s.homePoints === s.awayPoints) {
      problems.push(`${score} is level. A set cannot finish level.`);
    } else if (!isFinishedSet(s.homePoints, s.awayPoints)) {
      problems.push(
        `${score} is not a finished score. A set ends when a team reaches 15 or 25 points with a two-point lead.`,
      );
    } else if (s.homePoints > s.awayPoints) {
      home++;
    } else {
      away++;
    }
  }
  return problems;
}
