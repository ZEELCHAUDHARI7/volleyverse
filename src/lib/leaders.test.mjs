/**
 * Who a page names as the best player. Run: node --experimental-strip-types src/lib/leaders.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { defenceBreakdown, topBy, topDefender } from "./metrics.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Best Player Suite",
  file: "src/lib/leaders.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const line = (playerId, over = {}) => ({
  playerId,
  points: 0,
  assists: 0,
  contribution: 0,
  blocks: 0,
  saves: 0,
  superDigs: 0,
  ...over,
});

t("nobody is named when nobody scored", () => {
  const ls = [line("p1"), line("p2")];
  assert.equal(topBy(ls, "points"), undefined);
  assert.equal(topBy(ls, "assists"), undefined);
  assert.equal(topBy(ls, "contribution"), undefined);
  assert.equal(topDefender(ls), undefined);
});

t("the player with the most is named", () => {
  const ls = [line("p1", { points: 3 }), line("p2", { points: 7 }), line("p3")];
  assert.equal(topBy(ls, "points")?.playerId, "p2");
  assert.equal(topDefender([line("p1", { blocks: 1 }), line("p2")])?.playerId, "p1");
});

t("a tie names the same player whatever order the list comes in", () => {
  const a = line("p-a", { points: 5 });
  const b = line("p-b", { points: 5 });
  assert.equal(topBy([a, b], "points")?.playerId, topBy([b, a], "points")?.playerId);
  const d1 = line("p-a", { saves: 2 });
  const d2 = line("p-b", { saves: 2 });
  assert.equal(topDefender([d1, d2])?.playerId, topDefender([d2, d1])?.playerId);
});

t("a super dig is counted once, as a super dig, not also as a dig", () => {
  // The report: Floor Defenders read "2 dig · 1 super" for one dig and one super dig.
  assert.deepEqual(defenceBreakdown(line("p", { blocks: 1, saves: 2, superDigs: 1 })), {
    blocks: 1,
    digs: 1,
    superDigs: 1,
  });
});

qa.finish();
