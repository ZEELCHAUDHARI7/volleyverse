/**
 * Which saved set scores a correction deletes. Run: node --experimental-strip-types src/lib/set-scores.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { removedSets, setScoreProblems } from "./set-scores.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Set Score Correction Suite",
  file: "src/lib/set-scores.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const set = (setNo, homePoints, awayPoints) => ({ setNo, homePoints, awayPoints });
const saved = [set(1, 25, 20), set(2, 23, 25), set(3, 25, 18)];

t("clearing every box deletes every saved set", () => {
  assert.deepEqual(removedSets(saved, []), saved);
});

t("clearing the last set deletes just that set", () => {
  assert.deepEqual(removedSets(saved, saved.slice(0, 2)), [set(3, 25, 18)]);
});

t("changing a score deletes nothing", () => {
  assert.deepEqual(removedSets(saved, [set(1, 25, 20), set(2, 25, 23), set(3, 25, 18)]), []);
});

t("adding a set to a match with none deletes nothing", () => {
  assert.deepEqual(removedSets([], [set(1, 25, 20)]), []);
});

qa.suite("Scores a set can finish on");

t("a set at 5–3 is not finished, and the editor says which set", () => {
  // The report: the editor accepted 5–3.
  const problems = setScoreProblems([set(1, 5, 3)], 3);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^Set 1 \(5–3\)/);
});

t("sets won at 15 or at 25, two clear, are finished", () => {
  // /spikes plays every set to 15; /rally plays to 25 with a 15-point decider.
  assert.deepEqual(setScoreProblems([set(1, 15, 13), set(2, 25, 23), set(3, 15, 0)], 5), []);
});

t("extra points end two clear", () => {
  assert.deepEqual(setScoreProblems([set(1, 17, 15), set(2, 27, 25)], 5), []);
});

t("past the target, a set ends the moment one side is two clear", () => {
  assert.equal(setScoreProblems([set(1, 18, 15)], 3).length, 1);
  assert.equal(setScoreProblems([set(1, 26, 20)], 3).length, 1);
});

t("a one-point lead has not finished a set", () => {
  assert.equal(setScoreProblems([set(1, 25, 24)], 3).length, 1);
});

t("a level set is reported once, as level", () => {
  const problems = setScoreProblems([set(1, 15, 15)], 3);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /level/);
});

t("no set follows the one that decided the match", () => {
  // The report: a third set was accepted after a 2–0 result.
  const problems = setScoreProblems([set(1, 15, 10), set(2, 15, 12), set(3, 15, 5)], 3);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^Set 3 .*2–0/);
});

t("a best-of-five is decided at three sets", () => {
  const three = [set(1, 25, 20), set(2, 25, 20), set(3, 25, 20)];
  assert.deepEqual(setScoreProblems(three, 5), []);
  assert.equal(setScoreProblems([...three, set(4, 25, 20)], 5).length, 1);
});

t("a gap in the sets is reported", () => {
  const problems = setScoreProblems([set(1, 15, 10), set(3, 15, 10)], 3);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /consecutively/);
});

t("no sets at all is not a score problem", () => {
  // Deleting every set goes through its own question instead.
  assert.deepEqual(setScoreProblems([], 3), []);
});

qa.finish();
