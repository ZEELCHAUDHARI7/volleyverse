/**
 * Counts and scores written for people. Run: node --experimental-strip-types src/lib/format.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { formatScore, plural, pluralWord } from "./format.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Wording Suite",
  file: "src/lib/format.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

qa.suite("Counts");

t("one of something is singular", () => {
  // The report: "1 points", "1 blocks", "1 digs".
  assert.equal(plural(1, "point"), "1 point");
  assert.equal(plural(1, "super dig"), "1 super dig");
});

t("none and many are plural", () => {
  assert.equal(plural(0, "block"), "0 blocks");
  assert.equal(plural(2, "dig"), "2 digs");
});

t("a word with an irregular plural takes the one given", () => {
  assert.equal(plural(1, "match", "matches"), "1 match");
  assert.equal(plural(3, "match", "matches"), "3 matches");
});

t("the word alone follows the count, for a number shown apart from its unit", () => {
  assert.equal(pluralWord(1, "ace"), "ace");
  assert.equal(pluralWord(4, "ace"), "aces");
});

qa.suite("Scores");

t("a whole score shows no decimals", () => {
  assert.equal(formatScore(2), "2");
});

t("a half point is shown rather than rounded away", () => {
  // Floor Defenders showed 3.5 as 4, so the row did not add up.
  assert.equal(formatScore(3.5), "3.5");
});

qa.finish();
