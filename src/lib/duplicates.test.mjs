/**
 * Duplicate names and fixtures, and which competition the console works in.
 * Run: node --experimental-strip-types src/lib/duplicates.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { fixtureClashes, fixtureWarnings, localDateISO, nameTaken, takenMessage } from "./duplicates.ts";
import { nextMatchNo, pickCompetition } from "./competition.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Duplicates Suite",
  file: "src/lib/duplicates.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

qa.suite("Names");

const teams = [
  { id: "A", name: "Goa Guardians" },
  { id: "B", name: "Kochi Blue Spikers" },
];

t("the same name, in any case or spacing, is taken", () => {
  // The report: a second "Goa Guardians" was saved without a word.
  assert.equal(nameTaken("Goa Guardians", teams)?.id, "A");
  assert.equal(nameTaken("  goa   GUARDIANS ", teams)?.id, "A");
});

t("a different or blank name is free", () => {
  assert.equal(nameTaken("Goa Guardians II", teams), null);
  assert.equal(nameTaken("   ", teams), null);
});

t("the message names what clashes and where", () => {
  assert.equal(takenMessage("team", " Goa Guardians "), 'A team called "Goa Guardians" already exists.');
  assert.equal(
    takenMessage("court", "Court 1", "at this venue"),
    'A court called "Court 1" already exists at this venue.',
  );
});

qa.suite("Fixtures");

const match = (id, over = {}) => ({
  id,
  tournamentId: "T1",
  homeTeamId: "A",
  awayTeamId: "B",
  dateISO: "2026-10-20",
  status: "scheduled",
  ...over,
});
const draft = { tournamentId: "T1", homeTeamId: "A", awayTeamId: "B", dateISO: "2026-10-20" };

t("the same two teams on the same day in the same tournament clash, either way round", () => {
  const ms = [match("same"), match("flipped", { homeTeamId: "B", awayTeamId: "A" })];
  assert.deepEqual(fixtureClashes(draft, ms).map((m) => m.id), ["same", "flipped"]);
});

t("another day, tournament or opponent, or a cancelled match, does not clash", () => {
  const ms = [
    match("day", { dateISO: "2026-10-21" }),
    match("tourn", { tournamentId: "T2" }),
    match("opp", { awayTeamId: "C" }),
    match("cancelled", { status: "cancelled" }),
  ];
  assert.deepEqual(fixtureClashes(draft, ms), []);
});

const name = (id) => ({ A: "Goa Guardians", B: "Kochi Blue Spikers" })[id];

t("a repeat fixture is a warning, not a refusal", () => {
  assert.deepEqual(fixtureWarnings(draft, [match("m1")], "2026-10-16", name), [
    "Goa Guardians vs Kochi Blue Spikers is already scheduled on 2026-10-20 in this tournament.",
  ]);
  assert.match(fixtureWarnings(draft, [match("m1"), match("m2")], "2026-10-16", name)[0], /\(2 times\)\.$/);
});

t("a past date is a warning; today and later are not", () => {
  const on = (dateISO) => fixtureWarnings({ ...draft, dateISO }, [], "2026-10-16", name);
  assert.deepEqual(on("2026-10-15"), ["2026-10-15 is in the past."]);
  assert.deepEqual(on("2026-10-16"), []);
  assert.deepEqual(on("2026-10-17"), []);
});

t("nothing to warn about until the fixture is filled in", () => {
  assert.deepEqual(fixtureWarnings({ ...draft, awayTeamId: "" }, [match("m1")], "2026-10-16", name), []);
  assert.deepEqual(fixtureWarnings({ ...draft, dateISO: "" }, [], "2026-10-16", name), []);
});

t("today is the console's local date, not UTC's", () => {
  // 01:00 on 16 Oct in India is still 15 Oct in UTC.
  assert.equal(localDateISO(new Date(2026, 9, 16, 1, 0)), "2026-10-16");
  assert.equal(localDateISO(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

qa.suite("Competition");

// The production shape: two "VolleyVerse League"s, three seasons named 2026.
const db = {
  leagues: [
    { id: "lg-b", name: "VolleyVerse League", status: "active" },
    { id: "lg-a", name: "VolleyVerse League", status: "active" },
  ],
  seasons: [
    { id: "s3", leagueId: "lg-b", name: "2026", status: "active" },
    { id: "s2", leagueId: "lg-a", name: "2026", status: "active" },
    { id: "s1", leagueId: "lg-a", name: "2026", status: "active" },
  ],
  tournaments: [
    { id: "t3", seasonId: "s3", name: "Season Fixtures" },
    { id: "t2", seasonId: "s2", name: "Season Fixtures" },
    { id: "t1", seasonId: "s1", name: "Guardians Cup U21" },
  ],
  matches: [
    ...Array.from({ length: 18 }, (_, i) => ({ id: `u${i}`, tournamentId: "t1" })),
    { id: "x2", tournamentId: "t2" },
    { id: "x3", tournamentId: "t3" },
  ],
};

t("the league and season in use win, whatever order the rows arrive in", () => {
  const picked = pickCompetition(db);
  assert.equal(picked.league.id, "lg-a");
  assert.equal(picked.season.id, "s1");
  assert.deepEqual(picked.tournaments.map((x) => x.id), ["t1"]);
  const reversed = pickCompetition({
    ...db,
    leagues: [...db.leagues].reverse(),
    seasons: [...db.seasons].reverse(),
  });
  assert.equal(reversed.league.id, "lg-a");
  assert.equal(reversed.season.id, "s1");
});

t("an active league or season beats a busier archived one", () => {
  const picked = pickCompetition({
    ...db,
    leagues: [{ ...db.leagues[1], status: "archived" }, db.leagues[0]],
  });
  assert.equal(picked.league.id, "lg-b");
  assert.equal(picked.season.id, "s3");
});

t("a tie is settled by id, so every load agrees", () => {
  const empty = { leagues: db.leagues, seasons: [], tournaments: [], matches: [] };
  assert.equal(pickCompetition(empty).league.id, "lg-a");
  assert.equal(pickCompetition({ ...empty, leagues: [...db.leagues].reverse() }).league.id, "lg-a");
});

t("no league means no season and no tournaments", () => {
  const none = pickCompetition({ leagues: [], seasons: [], tournaments: [], matches: [] });
  assert.equal(none.league, undefined);
  assert.equal(none.season, undefined);
  assert.deepEqual(none.tournaments, []);
});

qa.suite("Match numbers");

const numbered = (matchNo, tournamentId = "T1") => ({ id: `m${matchNo}${tournamentId}`, tournamentId, matchNo });

t("the first match of a tournament is number 1", () => {
  assert.equal(nextMatchNo([], "T1"), 1);
});

t("a deleted match's number is not handed out again", () => {
  // The report: with match 2 deleted, the next match was numbered 3 a second time.
  assert.equal(nextMatchNo([numbered(1), numbered(3)], "T1"), 4);
});

t("each tournament counts its own matches", () => {
  assert.equal(nextMatchNo([numbered(1), numbered(7, "T2")], "T1"), 2);
});

t("a match with no number does not stop the count", () => {
  assert.equal(nextMatchNo([{ id: "x", tournamentId: "T1", matchNo: null }, numbered(2)], "T1"), 3);
});

qa.finish();
