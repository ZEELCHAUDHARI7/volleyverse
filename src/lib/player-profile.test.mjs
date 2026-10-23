/**
 * The public player profile, from published events only.
 * Run: node --experimental-strip-types src/lib/player-profile.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { matchHighs, matchLog, rate, searchDirectory, totalPoints } from "./player-profile.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Player Profile Suite",
  file: "src/lib/player-profile.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const player = { id: "p1", fullName: "Asha Rao", teamId: "B", position: "OH", jerseyNo: 7 };
const match = (id, over = {}) => ({
  id,
  homeTeamId: "A",
  awayTeamId: "B",
  dateISO: "2026-09-01",
  time: "18:00",
  status: "completed",
  winnerTeamId: null,
  setScores: [],
  rosters: [],
  ...over,
});
let n = 0;
const ev = (matchId, type, playerId = "p1") => ({ id: `e${n++}`, matchId, playerId, teamId: "B", setNo: 1, type, ts: 0 });
const sets = (...pairs) => pairs.map(([h, a], i) => ({ setNo: i + 1, homePoints: h, awayPoints: a }));

qa.suite("Numbers");

t("total points are kills, aces and blocks", () => {
  assert.equal(totalPoints({ points: 9, aces: 2, blocks: 3 }), 14);
});

t("a rate needs attempts, and keeps one decimal", () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(8, 11), 72.7);
});

qa.suite("Match log");

t("lists completed matches the player took part in, newest first", () => {
  const ms = [
    match("old", { dateISO: "2026-08-01" }),
    match("new", { dateISO: "2026-09-10" }),
    match("roster-only", { dateISO: "2026-09-05", rosters: [{ teamId: "B", playerId: "p1", isStarter: true, isLibero: false }] }),
    match("bench", { dateISO: "2026-09-07" }),
    match("live", { dateISO: "2026-09-12", status: "live" }),
  ];
  const es = [ev("old", "SPIKE_POINT"), ev("new", "SERVE_ACE"), ev("bench", "SPIKE_POINT", "p2"), ev("live", "SPIKE_POINT")];
  assert.deepEqual(matchLog(player, ms, es).map((r) => r.match.id), ["new", "roster-only", "old"]);
});

t("sets and result read from the player's side", () => {
  // The report: an away player's row said 2-1 for a match they lost 1–2.
  const m = match("m", { setScores: sets([25, 20], [20, 25], [15, 10]), winnerTeamId: "A" });
  const [row] = matchLog(player, [m], [ev("m", "SPIKE_POINT")]);
  assert.equal(row.opponentId, "A");
  assert.deepEqual([row.setsFor, row.setsAgainst, row.result], [1, 2, "L"]);
});

t("each row carries the player's own numbers for that match", () => {
  const es = [ev("m", "SPIKE_POINT"), ev("m", "SPIKE_POINT"), ev("m", "SERVE_ACE"), ev("m", "BLOCK_WIN"), ev("m", "SPIKE_POINT", "p2")];
  const [row] = matchLog(player, [match("m")], es);
  assert.equal(row.line.points, 2);
  assert.equal(row.totalPoints, 4);
});

qa.suite("Single-match highs");

t("the best match for each stat, and nothing for a stat never recorded", () => {
  const ms = [match("a", { dateISO: "2026-09-01" }), match("b", { dateISO: "2026-09-08" })];
  const es = [ev("a", "SPIKE_POINT"), ev("a", "SPIKE_POINT"), ev("a", "SPIKE_POINT"), ev("b", "SERVE_ACE"), ev("b", "SPIKE_POINT")];
  const highs = matchHighs(matchLog(player, ms, es));
  const by = Object.fromEntries(highs.map((h) => [h.stat, [h.value, h.row.match.id]]));
  assert.deepEqual(by.totalPoints, [3, "a"]);
  assert.deepEqual(by.kills, [3, "a"]);
  assert.deepEqual(by.aces, [1, "b"]);
  assert.equal(by.blocks, undefined);
  assert.equal(by.digs, undefined);
});

t("a tie goes to the most recent match", () => {
  const ms = [match("a", { dateISO: "2026-09-01" }), match("b", { dateISO: "2026-09-08" })];
  const highs = matchHighs(matchLog(player, ms, [ev("a", "SERVE_ACE"), ev("b", "SERVE_ACE")]));
  assert.equal(highs.find((h) => h.stat === "aces").row.match.id, "b");
});

t("a player with no published stats has no highs", () => {
  assert.deepEqual(matchHighs(matchLog(player, [match("m")], [])), []);
});

qa.suite("Search");

const players = [
  { id: "p1", fullName: "Asha Rao", teamId: "B" },
  { id: "p2", fullName: "Ravi Kumar", teamId: "A" },
  { id: "p3", fullName: "Arav Shah", teamId: "A" },
];
const teams = [
  { id: "A", name: "Kochi Blue Spikers", shortName: "KBS", city: "Kochi" },
  { id: "B", name: "Goa Guardians", shortName: "GOA", city: "Goa" },
];

t("finds players and teams by any part of the name, any case", () => {
  const hits = searchDirectory("RAV", players, teams);
  assert.deepEqual(hits.map((h) => h.id), ["p2", "p3"]);
  assert.equal(hits[0].detail, "Kochi Blue Spikers");
  assert.deepEqual(searchDirectory("goa", players, teams).map((h) => [h.kind, h.id]), [["team", "B"]]);
});

t("names that start with the query come first", () => {
  assert.deepEqual(searchDirectory("a", players, teams).slice(0, 2).map((h) => h.id), ["p1", "p3"]);
});

t("an empty query finds nothing, and results are capped", () => {
  assert.deepEqual(searchDirectory("  ", players, teams), []);
  assert.equal(searchDirectory("a", players, teams, 2).length, 2);
});

qa.finish();
