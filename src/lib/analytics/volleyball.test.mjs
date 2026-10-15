/**
 * Rally reconstruction for match analytics. Run: node --experimental-strip-types src/lib/analytics/volleyball.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import { biggestRun, progression, rallyOutcomes } from "./volleyball.ts";
import { sideTotals } from "../metrics.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Match Analytics Rally Suite",
  file: "src/lib/analytics/volleyball.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const HOME = "home";
const AWAY = "away";
let ts = 0;
const ev = (teamId, type, setNo = 1) => ({
  id: `e${++ts}`,
  matchId: "m",
  teamId,
  playerId: `${teamId}_p`,
  setNo,
  type,
  ts,
  vsPlayerId: null,
});

// Home scores twice, concedes a net touch, then scores twice more.
const withFault = () => [
  ev(HOME, "SPIKE_POINT"),
  ev(HOME, "SPIKE_POINT"),
  ev(HOME, "FAULT_NET"),
  ev(HOME, "SPIKE_POINT"),
  ev(HOME, "SPIKE_POINT"),
];

t("a rally that ends with a fault is counted", () => {
  assert.equal(rallyOutcomes(withFault(), HOME).length, 5);
});

t("the score chart includes the point a fault gave away", () => {
  const last = progression(withFault(), HOME).at(-1);
  assert.deepEqual([last.home, last.away], [4, 1]);
});

t("a fault breaks a run instead of joining two runs into one", () => {
  // Report: "Biggest run 5" where the longest real run was 4.
  assert.deepEqual(biggestRun(rallyOutcomes(withFault(), HOME)), { side: "home", run: 2 });
});

t("every fault hands the point to the other side", () => {
  for (const type of ["FAULT_NET", "FAULT_FOUR_HITS", "FAULT_DOUBLE", "FAULT_ROTATION"]) {
    const [o] = rallyOutcomes([ev(HOME, type)], HOME);
    assert.equal(o?.scorer, "away", type);
  }
});

t("the score chart names the fault", () => {
  assert.equal(progression([ev(HOME, "FAULT_NET")], HOME)[0].label, "Net touch · away");
});

t("team totals count faults as errors, as player lines already do", () => {
  const events = [ev(HOME, "FAULT_NET"), ev(HOME, "FAULT_DOUBLE"), ev(HOME, "SERVE_ERR")];
  assert.equal(sideTotals(events, HOME).errors, 3);
});

qa.finish();
