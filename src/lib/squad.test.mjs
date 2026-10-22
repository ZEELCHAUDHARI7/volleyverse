/**
 * Whether a team can put a starting six on court. Run: node --experimental-strip-types src/lib/squad.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { STARTING_SIX, byShirtNumber, squadShortBy } from "./squad.ts";

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

qa.suite("Roster order");

const shirt = (jerseyNo, fullName) => ({ id: fullName, fullName, jerseyNo });
const names = (ps) => ps.map((p) => p.fullName);

t("a roster reads in shirt-number order", () => {
  // The report: rosters were listed in the order players were added.
  const roster = [shirt(9, "Nine"), shirt(2, "Two"), shirt(14, "Fourteen"), shirt(1, "One")];
  assert.deepEqual(names([...roster].sort(byShirtNumber)), ["One", "Two", "Nine", "Fourteen"]);
});

t("players with no shirt number come last, by name", () => {
  const roster = [shirt(null, "Zed"), shirt(3, "Amy"), shirt(null, "Bob")];
  assert.deepEqual(names([...roster].sort(byShirtNumber)), ["Amy", "Bob", "Zed"]);
});

t("two players with one number fall back to their names", () => {
  const roster = [shirt(7, "Yara"), shirt(7, "Asha")];
  assert.deepEqual(names([...roster].sort(byShirtNumber)), ["Asha", "Yara"]);
});

qa.finish();
