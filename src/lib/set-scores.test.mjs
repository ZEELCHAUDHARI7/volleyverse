/**
 * Which saved set scores a correction deletes. Run: node --experimental-strip-types src/lib/set-scores.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { removedSets } from "./set-scores.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
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

qa.finish();
