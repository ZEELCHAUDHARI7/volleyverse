/**
 * Start and end dates that make a range. Run: node --experimental-strip-types src/lib/date-range.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { dateRangeProblem } from "./date-range.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Date Range Suite",
  file: "src/lib/date-range.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

t("an end date before the start date is refused, with the reason", () => {
  // The report: a tournament was accepted ending before it started.
  assert.match(dateRangeProblem("2026-11-10", "2026-11-01") ?? "", /end date is before the start date/);
});

t("a one-day range is fine", () => {
  assert.equal(dateRangeProblem("2026-11-10", "2026-11-10"), null);
});

t("a range open at either end is fine", () => {
  assert.equal(dateRangeProblem("2026-11-10", ""), null);
  assert.equal(dateRangeProblem("", "2026-11-01"), null);
  assert.equal(dateRangeProblem(null, null), null);
});

qa.finish();
