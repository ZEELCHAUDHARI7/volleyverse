/**
 * Pure spike-tally tests. Run: node --experimental-strip-types src/lib/spikes.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  OUTCOMES,
  OUTCOME_EVENT,
  SPIKE_EVENTS,
  spikeLine,
  spikeLines,
  spikeLog,
} from "./spikes.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Spike Tally Verification Suite",
  file: "src/lib/spikes.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

let seq = 0;
/** Minimal StatEvent for tallying — only playerId and type are read. */
const ev = (playerId, type) => ({
  id: `e${++seq}`,
  matchId: "m1",
  teamId: "t1",
  playerId,
  setNo: 1,
  type,
  ts: seq,
});

qa.suite("The Three Buttons");

t("each button records its own event type", () => {
  assert.equal(OUTCOME_EVENT.WIN, "SPIKE_POINT");
  assert.equal(OUTCOME_EVENT.CONT, "SPIKE_IN");
  assert.equal(OUTCOME_EVENT.LOSE, "SPIKE_ERR");
});

t("there are exactly three buttons and three distinct events", () => {
  assert.equal(OUTCOMES.length, 3);
  const produced = OUTCOMES.map((o) => OUTCOME_EVENT[o]);
  assert.equal(new Set(produced).size, 3);
  assert.deepEqual([...produced].sort(), [...SPIKE_EVENTS].sort());
});

t("no button records a receive, a set or a serve", () => {
  for (const e of Object.values(OUTCOME_EVENT)) {
    assert.equal(e.startsWith("SPIKE_"), true);
  }
});

qa.suite("The Tap Log");

t("the log is spike events only, oldest first", () => {
  const a = ev("A", "SPIKE_POINT");
  const b = ev("B", "RECV_GOOD");
  const c = ev("A", "SPIKE_ERR");
  const log = spikeLog([c, b, a]);
  assert.deepEqual(
    log.map((e) => e.id),
    [a.id, c.id],
  );
});

t("undo pops the newest tap — the last entry of the log", () => {
  const first = ev("A", "SPIKE_IN");
  const last = ev("B", "SPIKE_POINT");
  const log = spikeLog([first, last]);
  assert.equal(log[log.length - 1].id, last.id);
});

t("an empty match has an empty log, not a throw", () => {
  assert.deepEqual(spikeLog([]), []);
});

qa.suite("Spike Tallies");

t("one O then one ✓ is 2 attempts, 1 point, 50% success, 0% error", () => {
  const line = spikeLine("A", [ev("A", "SPIKE_IN"), ev("A", "SPIKE_POINT")]);
  assert.equal(line.attempts, 2);
  assert.equal(line.pointsWon, 1);
  assert.equal(line.rallyContinued, 1);
  assert.equal(line.failed, 0);
  assert.equal(line.successRate, 50);
  assert.equal(line.errorRate, 0);
});

t("every outcome counts as an attempt", () => {
  const line = spikeLine("A", [
    ev("A", "SPIKE_POINT"),
    ev("A", "SPIKE_IN"),
    ev("A", "SPIKE_ERR"),
  ]);
  assert.equal(line.attempts, 3);
});

t("no attempts gives null rates, not zero", () => {
  const line = spikeLine("A", []);
  assert.equal(line.attempts, 0);
  assert.equal(line.successRate, null);
  assert.equal(line.errorRate, null);
});

t("all failures is 0% success and 100% error", () => {
  const line = spikeLine("A", [ev("A", "SPIKE_ERR"), ev("A", "SPIKE_ERR")]);
  assert.equal(line.successRate, 0);
  assert.equal(line.errorRate, 100);
});

t("events belonging to other players are ignored", () => {
  const events = [ev("A", "SPIKE_POINT"), ev("B", "SPIKE_POINT"), ev("B", "SPIKE_ERR")];
  assert.equal(spikeLine("A", events).attempts, 1);
  assert.equal(spikeLine("B", events).attempts, 2);
});

t("non-spike events never count", () => {
  const line = spikeLine("A", [
    ev("A", "SERVE_ACE"),
    ev("A", "DIG_SAVE"),
    ev("A", "BLOCK_WIN"),
    ev("A", "SPIKE_POINT"),
  ]);
  assert.equal(line.attempts, 1);
  assert.equal(line.pointsWon, 1);
});

t("faults are not spike attempts", () => {
  const line = spikeLine("A", [
    ev("A", "FAULT_NET"),
    ev("A", "FAULT_FOUR_HITS"),
    ev("A", "FAULT_DOUBLE"),
    ev("A", "FAULT_ROTATION"),
    ev("A", "SPIKE_ERR"),
  ]);
  assert.equal(line.attempts, 1);
  assert.equal(line.failed, 1);
  assert.equal(line.errorRate, 100);
});

t("rates round to whole percent", () => {
  const line = spikeLine("A", [
    ev("A", "SPIKE_POINT"),
    ev("A", "SPIKE_IN"),
    ev("A", "SPIKE_IN"),
  ]);
  assert.equal(line.successRate, 33);
});

t("2 of 3 attempts won is 67%, not 66% — disambiguates round from floor/truncate", () => {
  const line = spikeLine("A", [
    ev("A", "SPIKE_POINT"),
    ev("A", "SPIKE_POINT"),
    ev("A", "SPIKE_IN"),
  ]);
  assert.equal(line.successRate, 67);
});

qa.suite("Multiple Players");

t("spikeLines returns one line per id, in the order given", () => {
  const events = [ev("A", "SPIKE_POINT"), ev("B", "SPIKE_ERR")];
  const lines = spikeLines(["B", "A"], events);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].playerId, "B");
  assert.equal(lines[0].failed, 1);
  assert.equal(lines[1].playerId, "A");
  assert.equal(lines[1].pointsWon, 1);
});

t("players with no events still get a zeroed line", () => {
  const lines = spikeLines(["A", "Z"], [ev("A", "SPIKE_POINT")]);
  assert.equal(lines[1].playerId, "Z");
  assert.equal(lines[1].attempts, 0);
  assert.equal(lines[1].successRate, null);
});

qa.finish();
