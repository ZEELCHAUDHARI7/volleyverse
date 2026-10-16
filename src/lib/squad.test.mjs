/**
 * Whether a team can put a starting six on court. Run: node --experimental-strip-types src/lib/squad.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { STARTING_SIX, squadShortBy } from "./squad.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Squad Size Suite",
  file: "src/lib/squad.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const squad = (teamId, n) => Array.from({ length: n }, (_, i) => ({ id: `${teamId}-${i}`, teamId }));

t("a starting six is six players", () => {
  assert.equal(STARTING_SIX, 6);
});

t("a team with no players is six short", () => {
  assert.equal(squadShortBy([], "A"), 6);
});

t("a team with some players is short by the rest", () => {
  assert.equal(squadShortBy(squad("A", 4), "A"), 2);
});

t("six or more is enough", () => {
  assert.equal(squadShortBy(squad("A", 6), "A"), 0);
  assert.equal(squadShortBy(squad("A", 12), "A"), 0);
});

t("only the team's own players count", () => {
  assert.equal(squadShortBy([...squad("A", 2), ...squad("B", 12)], "A"), 4);
});

qa.finish();
