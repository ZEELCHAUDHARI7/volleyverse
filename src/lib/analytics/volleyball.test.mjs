/**
 * Rally reconstruction for match analytics. Run: node --experimental-strip-types src/lib/analytics/volleyball.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import { biggestRun, progression, rallyOutcomes, volleyballModule } from "./volleyball.ts";
import { generateSummary } from "./narrative.ts";
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

// =====================================================================
qa.suite("Matches that are not decided yet");

const player = (id, teamId) => ({
  id, fullName: `${id} Player`, jerseyNo: 1, position: "OH", heightCm: null,
  nationality: null, photoUrl: null, teamId, isCaptain: false, isReserve: false,
});
const set = (setNo, homePoints, awayPoints) => ({ setNo, homePoints, awayPoints });
const names = { home: "Home Hawks", away: "Away Aces" };
const analyze = (over, events = []) =>
  volleyballModule.analyzeMatch({
    match: {
      id: "m", tournamentId: "t", groupId: null, matchNo: null, dateISO: "2026-10-15", time: null,
      venueId: null, courtId: null, homeTeamId: HOME, awayTeamId: AWAY, status: "scheduled",
      totalSets: 3, published: false, winnerTeamId: null, officials: [], setScores: [], rosters: [],
      ...over,
    },
    homeTeam: { id: HOME, name: names.home, shortName: "HOM" },
    awayTeam: { id: AWAY, name: names.away, shortName: "AWA" },
    homeRoster: [player("h1", HOME)],
    awayRoster: [player("a1", AWAY)],
    events,
  });
const kpi = (a, key) => a.headline.find((k) => k.key === key).value;

t("a scheduled match with nothing recorded is not played, not 'finished level at 0–0'", () => {
  const a = analyze({});
  assert.equal(a.result.progress, "not-played");
  assert.equal(a.result.winner, null);
  const text = generateSummary(a, names);
  assert.match(text, /have not played yet/);
  assert.doesNotMatch(text, /finished/);
});

t("a live match ahead on sets is in progress, with no winner yet", () => {
  const a = analyze({ status: "live", setScores: [set(1, 25, 20)] });
  assert.equal(a.result.progress, "in-progress");
  assert.equal(a.result.winner, null);
  assert.equal(kpi(a, "winner"), "—");
  const text = generateSummary(a, names);
  assert.match(text, /Home Hawks lead Away Aces 1–0 on sets/);
  assert.match(text, /still in progress/);
});

t("a completed match keeps its winner and its write-up", () => {
  const a = analyze({ status: "completed", winnerTeamId: HOME, setScores: [set(1, 25, 20), set(2, 25, 22)] });
  assert.equal(a.result.progress, "final");
  assert.equal(a.result.winner, "home");
  assert.match(generateSummary(a, names), /^Home Hawks beat Away Aces 2–0/);
});

t("no MVP is named when nobody has made an impact", () => {
  assert.equal(kpi(analyze({}), "mvp"), "—");
});

qa.finish();
