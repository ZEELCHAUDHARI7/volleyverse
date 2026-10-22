/**
 * CSV exports. Run: node --experimental-strip-types src/lib/analytics/export.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import { matchCsv, tableCsv } from "./export.ts";
import { volleyballModule } from "./volleyball.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "CSV Export Suite",
  file: "src/lib/analytics/export.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

t("a CSV starts with a byte-order mark, so Excel reads it as UTF-8", () => {
  // The report: exports contain "–" and have no byte-order mark.
  assert.equal(tableCsv(["Result"], [["2–1"]]).charCodeAt(0), 0xfeff);
});

t("cells keep their characters and their quoting", () => {
  assert.equal(
    tableCsv(["Team", "Result"], [["Goa, Guardians", "2–1"]]),
    '﻿Team,Result\n"Goa, Guardians",2–1',
  );
});

const player = (id, teamId) => ({
  id, fullName: `${id} Player`, jerseyNo: 1, position: "OH", heightCm: null,
  nationality: null, photoUrl: null, teamId, isCaptain: false, isReserve: false,
});
const kill = { id: "e1", matchId: "m", teamId: "home", playerId: "h1", setNo: 1, type: "SPIKE_POINT", ts: 1, vsPlayerId: null };
const analysis = volleyballModule.analyzeMatch({
  match: {
    id: "m", tournamentId: "t", groupId: null, matchNo: 1, dateISO: "2026-10-15", time: null,
    venueId: null, courtId: null, homeTeamId: "home", awayTeamId: "away", status: "completed",
    totalSets: 3, published: true, winnerTeamId: "home", officials: [], rosters: [],
    setScores: [{ setNo: 1, homePoints: 15, awayPoints: 10 }, { setNo: 2, homePoints: 15, awayPoints: 12 }],
  },
  homeTeam: { id: "home", name: "Home Hawks", shortName: "HOM" },
  awayTeam: { id: "away", name: "Away Aces", shortName: "AWA" },
  homeRoster: [player("h1", "home")],
  awayRoster: [player("a1", "away")],
  events: [kill],
});

t("a match export marks a figure with no data as a dash, never 'null' or '—%'", () => {
  const csv = matchCsv(analysis, { home: "Home Hawks", away: "Away Aces", date: "2026-10-15" });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(csv, /null|—%/);
  assert.match(csv, /\nReception %,—,—\n/);
});

qa.finish();
