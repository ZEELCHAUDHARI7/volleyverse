/**
 * What "End match" records. Run: node --experimental-strip-types src/lib/end-match.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { planEndMatch } from "./end-match.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
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

t("4–1 in set 1 saves the set as it stands and records no winner", () => {
  assert.deepEqual(planEndMatch(at(1, 4, 1, 0, 0)), {
    bankedSet: { setNo: 1, homePoints: 4, awayPoints: 1 },
    winner: null,
  });
});

t("a set with no points played is not saved", () => {
  assert.equal(planEndMatch(at(3, 0, 0, 1, 1)).bankedSet, null);
});

t("away points are saved on the away side", () => {
  assert.deepEqual(planEndMatch(at(2, 3, 7, 1, 0)).bankedSet, {
    setNo: 2,
    homePoints: 3,
    awayPoints: 7,
  });
});

t("the side ahead on sets wins, whatever the score in the set", () => {
  assert.equal(planEndMatch(at(4, 10, 12, 2, 1)).winner, "US");
  assert.equal(planEndMatch(at(4, 12, 10, 1, 2)).winner, "OPP");
});

t("a lead on points does not count while sets are level", () => {
  assert.equal(planEndMatch(at(3, 20, 5, 1, 1)).winner, null);
});

qa.finish();
