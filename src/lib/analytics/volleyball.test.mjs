/**
 * Rally reconstruction for match analytics. Run: node --experimental-strip-types src/lib/analytics/volleyball.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import { biggestRun, progression, rallyOutcomes, volleyballModule } from "./volleyball.ts";
import { statText } from "./framework.ts";
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

qa.suite("A figure with no data reads as a dash");

const played = (events) =>
  analyze({ status: "completed", winnerTeamId: HOME, setScores: [set(1, 15, 10), set(2, 15, 12)] }, events);
const stat = (a, side, key) => a.teamStats[side].stats.find((s) => s.key === key);
const metric = (a, key) => a.comparison.find((c) => c.key === key);
/** The same event, credited to a player on the match roster. */
const by = (playerId, e) => ({ ...e, playerId });

t("first-ball side-out has no value when receptions were not recorded", () => {
  // The report: "First-ball side-out %" read 0% for a match scored without receptions.
  const a = played([ev(HOME, "SERVE_ERR"), ev(HOME, "SPIKE_POINT")]);
  assert.equal(stat(a, "home", "firstball").value, "—");
});

t("first-ball side-out is measured once receptions are recorded", () => {
  const a = played([ev(HOME, "SERVE_ERR"), ev(HOME, "RECV_GOOD"), ev(HOME, "SPIKE_POINT")]);
  assert.equal(stat(a, "home", "firstball").value, 100);
});

t("head-to-head percentages have no value for a side with no attempts", () => {
  // The report: Reception % read 0% when no receptions were recorded.
  const a = played([ev(HOME, "SPIKE_POINT")]);
  assert.equal(metric(a, "attackPct").home, 100);
  assert.equal(metric(a, "attackPct").away, null);
  assert.equal(metric(a, "recvPct").home, null);
  assert.equal(metric(a, "recvPct").away, null);
});

t("a dash never carries a unit", () => {
  // The report: "—%" on the team stat sheet.
  assert.equal(statText("—", "%"), "—");
  assert.equal(statText(null, "%"), "—");
});

t("a number carries its unit", () => {
  assert.equal(statText(41.5, "%"), "41.5%");
  assert.equal(statText(3), "3");
});

t("the best defender's line counts each kind of dig once, in words", () => {
  // The report: "1 digs"; and a super dig was counted again as a plain dig.
  const a = played([by("a1", ev(AWAY, "DIG_SAVE")), by("a1", ev(AWAY, "DIG_SUPER"))]);
  const d = a.performers.find((p) => p.award === "Best Defender");
  assert.equal(d.detail, "1 dig · 1 super dig");
  assert.equal(d.value, 3.5);
});

t("a performer with one of something is named in the singular", () => {
  const a = played([by("h1", ev(HOME, "SERVE_ACE")), by("a1", ev(AWAY, "BLOCK_WIN"))]);
  const award = (name) => a.performers.find((p) => p.award === name);
  assert.equal(award("Best Server").unit, "ace");
  assert.equal(award("Best Blocker").unit, "block");
});

qa.finish();
