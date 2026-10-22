/**
 * Postgres rows into app objects. Run: node --experimental-strip-types src/lib/providers/mappers.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import { matchFromRow } from "./mappers.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Row Mapping Suite",
  file: "src/lib/providers/mappers.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const row = (over = {}) => ({
  id: "m1",
  tournament_id: "t1",
  group_id: null,
  match_no: 4,
  date: "2026-10-20",
  time: "18:00:00",
  venue_id: null,
  court_id: null,
  home_team_id: "h",
  away_team_id: "a",
  status: "scheduled",
  total_sets: 3,
  published: false,
  winner_team_id: null,
  ...over,
});

t("a kick-off time read from Postgres comes back as HH:MM", () => {
  // The report: a new dashboard row read "18:00", then "18:00:00" after the reload.
  assert.equal(matchFromRow(row()).time, "18:00");
});

t("a time already in HH:MM is unchanged", () => {
  assert.equal(matchFromRow(row({ time: "09:30" })).time, "09:30");
});

t("a match with no time has none", () => {
  assert.equal(matchFromRow(row({ time: null })).time, null);
});

qa.finish();
