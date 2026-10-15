/**
 * Which match the fan screens follow (home Live strip, /live).
 * Run: node --experimental-strip-types src/lib/live-score.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { pickLiveMatch } from "./live-score.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Live Match Selection Verification Suite",
  file: "src/lib/live-score.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const match = (id, status, dateISO, time = null) => ({ id, status, dateISO, time });
const point = (matchId, ts) => ({ id: `${matchId}-${ts}`, matchId, ts });
const at = (iso) => Date.parse(iso);

// =====================================================================
qa.suite("Following the match being played");

t("no live match means nothing to follow", () => {
  const matches = [match("done", "completed", "2026-10-01"), match("next", "scheduled", "2026-10-20")];
  assert.equal(pickLiveMatch(matches, []), null);
});

t("the only live match is followed, whatever else is listed", () => {
  const matches = [match("done", "completed", "2026-10-01"), match("now", "live", "2026-10-13")];
  assert.equal(pickLiveMatch(matches, [])?.id, "now");
});

t("a stale live match listed first loses to the one being scored now", () => {
  // The QA run: a 2025 match never ended sat first in the list and the Live
  // page stuck on it while today's match was being scored.
  const matches = [match("stale", "live", "2025-03-14", "18:00"), match("now", "live", "2026-10-13", "11:30")];
  const events = [point("stale", at("2025-03-14T18:20:00")), point("now", at("2026-10-13T11:42:00"))];
  assert.equal(pickLiveMatch(matches, events)?.id, "now");
});

t("before its first point, the match starting latest is followed", () => {
  const matches = [match("stale", "live", "2025-03-14", "18:00"), match("now", "live", "2026-10-13", "11:30")];
  assert.equal(pickLiveMatch(matches, [])?.id, "now");
});

t("a just-started match beats an old one that still has points", () => {
  const matches = [match("stale", "live", "2025-03-14", "18:00"), match("now", "live", "2026-10-13", "11:30")];
  const events = [point("stale", at("2025-03-14T18:20:00"))];
  assert.equal(pickLiveMatch(matches, events)?.id, "now");
});

t("between two live matches today, the one scored most recently wins", () => {
  const matches = [match("a", "live", "2026-10-13", "10:00"), match("b", "live", "2026-10-13", "10:00")];
  const events = [point("a", at("2026-10-13T10:05:00")), point("b", at("2026-10-13T10:09:00")), point("a", at("2026-10-13T10:07:00"))];
  assert.equal(pickLiveMatch(matches, events)?.id, "b");
});

qa.finish();
