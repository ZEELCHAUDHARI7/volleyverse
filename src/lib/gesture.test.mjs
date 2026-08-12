/**
 * Pure gesture tests. Run: node --experimental-strip-types src/lib/gesture.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  DRAG_THRESHOLD,
  HOLD_MS,
  dragDirection,
  dragEngaged,
  dragProgress,
} from "./gesture.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Hold-and-Drag Gesture Verification Suite",
  file: "src/lib/gesture.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

/** Far enough past the dead zone that only the angle is under test. */
const FAR = DRAG_THRESHOLD * 4;

qa.suite("The Dead Zone");

t("a press that does not move records nothing", () => {
  assert.equal(dragDirection(0, 0), "NONE");
});

t("the wobble in a press-and-lift stays a tap", () => {
  // Every direction, just short of the threshold — all of them must be NONE,
  // because this is the movement a finger makes when it means to tap.
  for (const [dx, dy] of [
    [DRAG_THRESHOLD - 1, 0],
    [-(DRAG_THRESHOLD - 1), 0],
    [0, -(DRAG_THRESHOLD - 1)],
    [0, DRAG_THRESHOLD - 1],
    [10, -10],
  ]) {
    assert.equal(dragDirection(dx, dy), "NONE", `${dx},${dy}`);
  }
});

t("the threshold itself counts as movement, not as wobble", () => {
  assert.equal(dragDirection(0, -DRAG_THRESHOLD), "UP");
  assert.equal(dragDirection(-DRAG_THRESHOLD, 0), "LEFT");
});

qa.suite("The Three Answers");

t("← is Point Won", () => {
  assert.equal(dragDirection(-FAR, 0), "LEFT");
});

t("→ is Failed", () => {
  assert.equal(dragDirection(FAR, 0), "RIGHT");
});

t("↑ is Rally Continues", () => {
  assert.equal(dragDirection(0, -FAR), "UP");
});

t("↓ records nothing — it is the escape hatch, not a fourth answer", () => {
  assert.equal(dragDirection(0, FAR), "NONE");
});

qa.suite("Forgiveness");

t("a sloppy sideways flick still reads sideways", () => {
  // 30° of vertical wander either way on a horizontal drag: still LEFT/RIGHT.
  assert.equal(dragDirection(-FAR, -FAR * 0.5), "LEFT");
  assert.equal(dragDirection(-FAR, FAR * 0.5), "LEFT");
  assert.equal(dragDirection(FAR, -FAR * 0.5), "RIGHT");
  assert.equal(dragDirection(FAR, FAR * 0.5), "RIGHT");
});

t("a sloppy upward flick still reads up", () => {
  assert.equal(dragDirection(-FAR * 0.5, -FAR), "UP");
  assert.equal(dragDirection(FAR * 0.5, -FAR), "UP");
});

t("LEFT and RIGHT own 135° each — nearly everything sideways-ish", () => {
  // Just past the 45° diagonal, on the horizontal side of it.
  assert.equal(dragDirection(-100, -99), "LEFT");
  assert.equal(dragDirection(100, 99), "RIGHT");
});

t("the exact diagonal is decided, not a coin flip", () => {
  // Upward, |dx| === |dy| resolves to UP. Downward it resolves sideways —
  // cancel is the narrow wedge, so a diagonal is a long way outside it.
  assert.equal(dragDirection(-100, -100), "UP");
  assert.equal(dragDirection(100, -100), "UP");
  assert.equal(dragDirection(-100, 100), "LEFT");
  assert.equal(dragDirection(100, 100), "RIGHT");
});

t("cancel needs a straight pull down, not a vague one", () => {
  assert.equal(dragDirection(0, 100), "NONE");
  assert.equal(dragDirection(20, 100), "NONE"); // ~11° off vertical — still cancel
  assert.equal(dragDirection(60, 100), "RIGHT"); // ~31° off — an answer, not a cancel
});

t("every direction outside the dead zone has an answer", () => {
  // A full sweep: nothing past the threshold may fall through to undefined.
  const answers = new Set();
  for (let deg = 0; deg < 360; deg++) {
    const r = (deg * Math.PI) / 180;
    const d = dragDirection(Math.cos(r) * FAR, Math.sin(r) * FAR);
    assert.ok(
      d === "LEFT" || d === "RIGHT" || d === "UP" || d === "NONE",
      `${deg}° gave ${d}`,
    );
    answers.add(d);
  }
  assert.deepEqual([...answers].sort(), ["LEFT", "NONE", "RIGHT", "UP"]);
});

t("the two scoring answers are the easiest to hit", () => {
  // Count the degrees each answer owns. LEFT and RIGHT end rallies and are
  // pressed under the most time pressure, so they must not be the narrow ones.
  const owned = { LEFT: 0, RIGHT: 0, UP: 0, NONE: 0 };
  for (let deg = 0; deg < 360; deg++) {
    const r = (deg * Math.PI) / 180;
    owned[dragDirection(Math.cos(r) * FAR, Math.sin(r) * FAR)]++;
  }
  assert.ok(owned.LEFT >= 100, `LEFT owns ${owned.LEFT}°`);
  assert.ok(owned.RIGHT >= 100, `RIGHT owns ${owned.RIGHT}°`);
  assert.ok(owned.UP >= 85, `UP owns ${owned.UP}°`);
  // Cancel is the narrow one — it must not be able to swallow a real answer.
  assert.ok(owned.NONE <= 60, `cancel owns ${owned.NONE}°`);
});

qa.suite("Feedback Ramp");

t("progress runs 0 → 1 across the dead zone", () => {
  assert.equal(dragProgress(0, 0), 0);
  assert.equal(dragProgress(0, -DRAG_THRESHOLD / 2), 0.5);
  assert.equal(dragProgress(0, -DRAG_THRESHOLD), 1);
});

t("progress never exceeds 1 — past the threshold the answer is committed", () => {
  assert.equal(dragProgress(0, -DRAG_THRESHOLD * 10), 1);
});

t("engaged agrees with direction about what counts as movement", () => {
  for (const [dx, dy] of [
    [0, 0],
    [5, 5],
    [DRAG_THRESHOLD - 1, 0],
    [DRAG_THRESHOLD, 0],
    [FAR, FAR],
    [0, FAR],
  ]) {
    // Down is the one case they differ on by design: engaged, but no answer.
    const engaged = dragEngaged(dx, dy);
    const dir = dragDirection(dx, dy);
    if (!engaged) assert.equal(dir, "NONE", `${dx},${dy} not engaged`);
  }
  assert.equal(dragEngaged(0, DRAG_THRESHOLD), true);
  assert.equal(dragDirection(0, DRAG_THRESHOLD), "NONE");
});

qa.suite("Timing");

t("the hold delay is short enough not to slow a scorer down", () => {
  assert.ok(HOLD_MS > 0 && HOLD_MS <= 250, `HOLD_MS is ${HOLD_MS}`);
});

qa.finish();
