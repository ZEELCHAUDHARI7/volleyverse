/**
 * Pure session tests. Run: node --experimental-strip-types src/lib/spike-session.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  newSession,
  recordEvent,
  addPoint,
  undo,
  endSet,
} from "./spike-session.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Spike Session Verification Suite",
  file: "src/lib/spike-session.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

qa.suite("Scoreboard");

t("a new session starts at set 1, 0-0, nothing to undo", () => {
  const s = newSession();
  assert.equal(s.setNo, 1);
  assert.equal(s.homePoints, 0);
  assert.equal(s.awayPoints, 0);
  assert.deepEqual(s.undoStack, []);
});

t("addPoint raises only the side given", () => {
  const s = addPoint(addPoint(newSession(), "home"), "away");
  assert.equal(s.homePoints, 1);
  assert.equal(s.awayPoints, 1);
  const h = addPoint(s, "home");
  assert.equal(h.homePoints, 2);
  assert.equal(h.awayPoints, 1);
});

t("session values are never mutated in place", () => {
  const s = newSession();
  addPoint(s, "home");
  recordEvent(s, "e1");
  assert.equal(s.homePoints, 0);
  assert.deepEqual(s.undoStack, []);
});

qa.suite("Undo");

t("undo of a point lowers that side's score", () => {
  const s = addPoint(newSession(), "away");
  const { session, undone } = undo(s);
  assert.equal(session.awayPoints, 0);
  assert.deepEqual(undone, { kind: "POINT", side: "away" });
  assert.deepEqual(session.undoStack, []);
});

t("undo of a spike returns the event id and leaves the score alone", () => {
  const s = recordEvent(addPoint(newSession(), "home"), "e42");
  const { session, undone } = undo(s);
  assert.deepEqual(undone, { kind: "EVENT", eventId: "e42" });
  assert.equal(session.homePoints, 1);
  assert.equal(session.undoStack.length, 1);
});

t("undo pops in reverse order across mixed actions", () => {
  let s = newSession();
  s = addPoint(s, "home");
  s = recordEvent(s, "e1");
  s = addPoint(s, "away");

  const first = undo(s);
  assert.deepEqual(first.undone, { kind: "POINT", side: "away" });
  const second = undo(first.session);
  assert.deepEqual(second.undone, { kind: "EVENT", eventId: "e1" });
  const third = undo(second.session);
  assert.deepEqual(third.undone, { kind: "POINT", side: "home" });
  assert.equal(third.session.homePoints, 0);
});

t("undo on an empty stack is a no-op returning null", () => {
  const s = newSession();
  const { session, undone } = undo(s);
  assert.equal(undone, null);
  assert.deepEqual(session, s);
});

qa.suite("Ending a Set");

t("endSet advances the set, resets the score and clears undo", () => {
  let s = newSession();
  s = addPoint(s, "home");
  s = recordEvent(s, "e1");
  const next = endSet(s);
  assert.equal(next.setNo, 2);
  assert.equal(next.homePoints, 0);
  assert.equal(next.awayPoints, 0);
  assert.deepEqual(next.undoStack, []);
});

t("undo cannot reach back across a banked set", () => {
  const banked = endSet(addPoint(newSession(), "home"));
  const { session, undone } = undo(banked);
  assert.equal(undone, null);
  assert.equal(session.homePoints, 0);
  assert.equal(session.setNo, 2);
});

qa.finish();
