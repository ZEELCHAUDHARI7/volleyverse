/**
 * What a scoring screen shows for a match. Run: node --experimental-strip-types src/lib/tracker-view.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { trackerView } from "./tracker-view.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Tracker View Suite",
  file: "src/lib/tracker-view.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

t("a finished match opened without its session shows the report, not the toss", () => {
  assert.equal(trackerView("completed", false), "report");
});

t("a finished match shows the report on the device that scored it too", () => {
  assert.equal(trackerView("completed", true), "report");
});

t("a live match opened without its session is flagged as scored elsewhere", () => {
  assert.equal(trackerView("live", false), "elsewhere");
});

t("a live match with its session resumes the tracker", () => {
  assert.equal(trackerView("live", true), "tracker");
});

t("a scheduled match with no session opens the setup steps", () => {
  assert.equal(trackerView("scheduled", false), "setup");
});

qa.finish();
