/**
 * What "End match" records. Run: node --experimental-strip-types src/lib/end-match.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { planEndMatch } from "./end-match.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "End Match Suite",
  file: "src/lib/end-match.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const at = (set, usScore, oppScore, usSets, oppSets) => ({
  set,
  usScore,
  oppScore,
  usSets,
  oppSets,
});

t("9–11 in set 1 saves no set and records no winner", () => {
  // The QA run: this ended "Drawn · 0–1 · S1 9–11", the set counted as won.
  assert.deepEqual(planEndMatch(at(1, 9, 11, 0, 0), false), {
    bankedSet: null,
    unfinishedSet: { setNo: 1, homePoints: 9, awayPoints: 11 },
    sets: { us: 0, opp: 0 },
    winner: null,
  });
});

t("a set with no points played is neither saved nor reported", () => {
  const plan = planEndMatch(at(3, 0, 0, 1, 1), false);
  assert.equal(plan.bankedSet, null);
  assert.equal(plan.unfinishedSet, null);
});

t("a set already won is saved and counts toward the result", () => {
  assert.deepEqual(planEndMatch(at(3, 15, 10, 1, 1), true), {
    bankedSet: { setNo: 3, homePoints: 15, awayPoints: 10 },
    unfinishedSet: null,
    sets: { us: 2, opp: 1 },
    winner: "US",
  });
});

t("a set won by the away side is saved on the away side", () => {
  const plan = planEndMatch(at(2, 13, 15, 1, 0), true);
  assert.deepEqual(plan.bankedSet, { setNo: 2, homePoints: 13, awayPoints: 15 });
  assert.deepEqual(plan.sets, { us: 1, opp: 1 });
  assert.equal(plan.winner, null);
});

t("the side ahead on finished sets wins, whatever the unfinished score", () => {
  assert.equal(planEndMatch(at(4, 10, 12, 2, 1), false).winner, "US");
  assert.equal(planEndMatch(at(4, 12, 10, 1, 2), false).winner, "OPP");
});

t("a lead on points does not count while sets are level", () => {
  assert.equal(planEndMatch(at(3, 20, 5, 1, 1), false).winner, null);
});

qa.finish();
