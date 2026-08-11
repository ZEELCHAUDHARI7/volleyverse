/**
 * Season-analytics counting rules.
 * Run: node --experimental-strip-types src/lib/analytics/general.test.mjs
 * (general.ts has only a type-only import, so type-stripping loads it directly.)
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import {
  hasRecordedPlay,
  headToHead,
  isDecided,
  outcomeFor,
  seasonSummary,
  setTally,
  teamMatches,
  teamRecord,
} from "./general.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Season Analytics Counting Rules",
  file: "src/lib/analytics/general.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const HOME = "home";
const AWAY = "away";

/** A match with whatever shape the test needs. */
const match = (over) => ({
  id: "m",
  tournamentId: "t",
  groupId: null,
  matchNo: null,
  dateISO: "2026-08-01",
  time: null,
  venueId: null,
  courtId: null,
  homeTeamId: HOME,
  awayTeamId: AWAY,
  status: "live",
  totalSets: 5,
  published: false,
  winnerTeamId: null,
  officials: [],
  setScores: [],
  rosters: [],
  ...over,
});

const set = (setNo, homePoints, awayPoints) => ({ setNo, homePoints, awayPoints });

// =====================================================================
qa.suite("What counts as a match worth analysing");

t("a match counts once a set score exists, whatever its status says", () => {
  assert.equal(hasRecordedPlay(match({ setScores: [] })), false);
  assert.equal(hasRecordedPlay(match({ setScores: [set(1, 25, 20)] })), true);
  // The regression: completed, but nothing was ever banked.
  assert.equal(
    hasRecordedPlay(match({ status: "completed", setScores: [] })),
    false,
  );
});

t("a live match is decided only once a side holds the majority of sets", () => {
  assert.equal(isDecided(match({ setScores: [set(1, 25, 20)] })), false); // 1-0 of 5
  assert.equal(
    isDecided(match({ setScores: [set(1, 25, 20), set(2, 25, 18)] })),
    false, // 2-0 of 5 — set 3 still to come
  );
  assert.equal(
    isDecided(
      match({ setScores: [set(1, 25, 20), set(2, 25, 18), set(3, 25, 22)] }),
    ),
    true, // 3-0 takes a best-of-five
  );
  // Best-of-three needs two.
  assert.equal(
    isDecided(match({ totalSets: 3, setScores: [set(1, 25, 20), set(2, 25, 18)] })),
    true,
  );
});

t("ending a match settles it even mid-set, and no play settles nothing", () => {
  assert.equal(isDecided(match({ status: "completed", setScores: [set(1, 25, 20)] })), true);
  assert.equal(isDecided(match({ status: "completed", setScores: [] })), false);
  assert.equal(isDecided(match({ setScores: [] })), false);
});

t("a live match that is mathematically over resolves to W/L", () => {
  const m = match({ setScores: [set(1, 25, 20), set(2, 25, 18), set(3, 25, 22)] });
  assert.equal(outcomeFor(m, HOME), "W");
  assert.equal(outcomeFor(m, AWAY), "L");
  // Still in the balance: nobody has won anything yet.
  const open = match({ setScores: [set(1, 25, 20)] });
  assert.equal(outcomeFor(open, HOME), null);
  assert.equal(outcomeFor(open, AWAY), null);
});

// =====================================================================
qa.suite("The blank-analytics regression");

t("a completed match with no set scores counts nowhere — not just somewhere", () => {
  // This is the exact state that produced teams in the rankings above
  // "Matches Played: 0": teamMatches counted it, seasonSummary did not.
  const broken = [match({ id: "b", status: "completed", setScores: [] })];
  assert.equal(teamMatches(broken, HOME).length, 0);
  assert.equal(seasonSummary(broken).matchesPlayed, 0);
  assert.equal(teamRecord(broken, HOME).played, 0);
});

t("a season of in-progress matches is no longer invisible", () => {
  const live = [
    match({ id: "a", setScores: [set(1, 25, 20), set(2, 22, 25)] }),
    match({ id: "b", setScores: [set(1, 25, 19)] }),
  ];
  const s = seasonSummary(live);
  assert.equal(s.matchesPlayed, 2);
  assert.equal(s.totalSets, 3);
  assert.equal(s.totalPoints, 25 + 20 + 22 + 25 + 25 + 19);
  assert.equal(s.inProgress, 2); // and it says so
});

t("shape-of-result counts wait for the result", () => {
  // 2-0 in a best-of-five is not a sweep yet; 3-0 is.
  const partial = [match({ setScores: [set(1, 25, 20), set(2, 25, 18)] })];
  assert.equal(seasonSummary(partial).sweeps, 0);
  assert.equal(seasonSummary(partial).closestMatchId, null);
  const swept = [
    match({ setScores: [set(1, 25, 20), set(2, 25, 18), set(3, 25, 22)] }),
  ];
  assert.equal(seasonSummary(swept).sweeps, 1);
  assert.equal(seasonSummary(swept).inProgress, 0);
  // A five-setter only counts when the fifth set is in.
  const five = [
    match({
      status: "completed",
      setScores: [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 20, 25), set(5, 15, 12)],
    }),
  ];
  assert.equal(seasonSummary(five).fiveSetters, 1);
});

// =====================================================================
qa.suite("Records stay honest");

t("points accrue from a live match; wins and form do not", () => {
  const live = [match({ setScores: [set(1, 25, 20), set(2, 18, 25)] })];
  const rec = teamRecord(live, HOME);
  assert.equal(rec.pointsFor, 43); // 25 + 18
  assert.equal(rec.pointsAgainst, 45); // 20 + 25
  assert.equal(rec.setsWon, 1);
  assert.equal(rec.setsLost, 1);
  assert.equal(rec.played, 0); // undecided — nothing to bank
  assert.equal(rec.won, 0);
  assert.equal(rec.winPct, 0);
  assert.deepEqual(rec.form, []);
});

t("a decided match banks the win exactly once", () => {
  const done = [
    match({
      totalSets: 3,
      status: "completed",
      winnerTeamId: HOME,
      setScores: [set(1, 25, 20), set(2, 25, 18)],
    }),
  ];
  const rec = teamRecord(done, HOME);
  assert.equal(rec.played, 1);
  assert.equal(rec.won, 1);
  assert.equal(rec.winPct, 100);
  assert.deepEqual(rec.form, ["W"]);
  assert.equal(rec.home.won, 1);
  assert.equal(teamRecord(done, AWAY).lost, 1);
});

t("win % is not diluted by matches still being played", () => {
  const mixed = [
    match({ id: "done", totalSets: 3, status: "completed", winnerTeamId: HOME, setScores: [set(1, 25, 20), set(2, 25, 18)] }),
    match({ id: "live", setScores: [set(1, 25, 20)] }),
  ];
  const rec = teamRecord(mixed, HOME);
  assert.equal(rec.played, 1);
  assert.equal(rec.winPct, 100); // NOT 50 — the live match is not a loss
  assert.equal(rec.setsWon, 3); // 2 from the finished match + the live one
});

t("head-to-head never reads '1 played, 0-0'", () => {
  const live = [match({ setScores: [set(1, 25, 20)] })];
  const h = headToHead(live, HOME, AWAY);
  assert.equal(h.played, 0); // undecided
  assert.equal(h.aSets, 1); // sets still shown
  assert.equal(h.bSets, 0);
  assert.equal(h.aWins, 0);
  assert.equal(h.matches.length, 1); // and the match is listed
});

t("setTally is unchanged — drawn sets count for neither side", () => {
  assert.deepEqual(setTally(match({ setScores: [set(1, 25, 20), set(2, 20, 20)] })), {
    home: 1,
    away: 0,
  });
});

qa.finish();
