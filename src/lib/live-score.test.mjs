/**
 * Which match the fan screens follow (home Live strip, /live) and count down to.
 * Run: node --experimental-strip-types src/lib/live-score.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { kickoffISO, pickLiveMatch, pickNextFixture } from "./live-score.ts";

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

// =====================================================================
qa.suite("Counting down to the next fixture");

const NOW = at("2026-10-16T15:00:00");

t("a fixture left scheduled from an earlier day is not the next one", () => {
  // The QA run: a 2026-08-14 fixture never played headed the home page with
  // the countdown stuck at 00:00:00:00.
  const matches = [match("stale", "scheduled", "2026-08-14", "18:00"), match("next", "scheduled", "2026-10-20", "18:00")];
  assert.equal(pickNextFixture(matches, NOW)?.id, "next");
});

t("with only past fixtures scheduled, there is no next one", () => {
  const matches = [match("stale", "scheduled", "2026-08-14", "18:00"), match("done", "completed", "2026-10-20")];
  assert.equal(pickNextFixture(matches, NOW), null);
});

t("a fixture later today is next; one that started this morning is not", () => {
  const matches = [match("morning", "scheduled", "2026-10-16", "09:00"), match("evening", "scheduled", "2026-10-16", "19:30")];
  assert.equal(pickNextFixture(matches, NOW)?.id, "evening");
});

t("on the same day the earlier kick-off is next, whatever the list order", () => {
  const late = match("late", "scheduled", "2026-10-20", "20:00");
  const early = match("early", "scheduled", "2026-10-20", "10:00");
  assert.equal(pickNextFixture([late, early], NOW)?.id, "early");
  assert.equal(pickNextFixture([early, late], NOW)?.id, "early");
});

t("two fixtures at the same kick-off give the same answer in any order", () => {
  const a = match("court-a", "scheduled", "2026-10-20", "18:00");
  const b = match("court-b", "scheduled", "2026-10-20", "18:00");
  assert.equal(pickNextFixture([a, b], NOW)?.id, pickNextFixture([b, a], NOW)?.id);
});

t("a fixture with no time counts down to 18:00", () => {
  const today = [match("today", "scheduled", "2026-10-16")];
  assert.equal(pickNextFixture(today, at("2026-10-16T17:59:00"))?.id, "today");
  assert.equal(pickNextFixture(today, at("2026-10-16T18:01:00")), null);
  assert.equal(kickoffISO(today[0]), "2026-10-16T18:00:00");
});

t("a time read back from the database with seconds still counts down", () => {
  // Postgres `time` comes back as HH:mm:ss; appending ":00" made the countdown NaN.
  const m = match("db", "scheduled", "2026-10-20", "18:30:00");
  assert.equal(kickoffISO(m), "2026-10-20T18:30:00");
  assert.ok(Number.isFinite(Date.parse(kickoffISO(m))));
  assert.equal(pickNextFixture([m], NOW)?.id, "db");
});

qa.finish();
