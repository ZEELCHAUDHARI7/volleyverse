/**
 * League Setup removal plans. Run: node --experimental-strip-types src/lib/removal.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  applyRemoval,
  countOf,
  planTeamRemoval,
  planTournamentRemoval,
  planVenueRemoval,
} from "./removal.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "League Setup Removal Suite",
  file: "src/lib/removal.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const emptyDb = () => ({
  leagues: [],
  seasons: [],
  divisions: [],
  tournaments: [],
  groups: [],
  venues: [],
  courts: [],
  teams: [],
  staff: [],
  players: [],
  matches: [],
  events: [],
});

const match = (id, over = {}) => ({
  id,
  tournamentId: "T1",
  groupId: null,
  venueId: null,
  courtId: null,
  homeTeamId: "A",
  awayTeamId: "B",
  ...over,
});
const event = (id, matchId, playerId = "pA1") => ({ id, matchId, playerId, teamId: "A" });

/** Two tournaments, two venues, three teams, with matches and points across them. */
const league = () => ({
  ...emptyDb(),
  tournaments: [
    { id: "T1", venueId: "V1" },
    { id: "T2", venueId: "V2" },
  ],
  groups: [
    { id: "g1", tournamentId: "T1" },
    { id: "g2", tournamentId: "T2" },
  ],
  venues: [{ id: "V1" }, { id: "V2" }],
  courts: [
    { id: "c1", venueId: "V1" },
    { id: "c2", venueId: "V1" },
    { id: "c3", venueId: "V2" },
  ],
  teams: [{ id: "A" }, { id: "B" }, { id: "C" }],
  players: [
    { id: "pA1", teamId: "A" },
    { id: "pA2", teamId: "A" },
    { id: "pB1", teamId: "B" },
    { id: "pC1", teamId: "C" },
  ],
  staff: [
    { id: "sA1", teamId: "A" },
    { id: "sB1", teamId: "B" },
  ],
  matches: [
    match("m1", { tournamentId: "T1", venueId: "V1", courtId: "c1" }),
    match("m2", { tournamentId: "T1", homeTeamId: "B", awayTeamId: "C", courtId: "c2" }),
    match("m3", { tournamentId: "T2", homeTeamId: "C", awayTeamId: "A", venueId: "V1", courtId: "c3" }),
    match("m4", { tournamentId: "T2", homeTeamId: "B", awayTeamId: "C", venueId: "V2" }),
  ],
  events: [
    event("e1", "m1"),
    event("e2", "m1", "pB1"),
    event("e3", "m2", "pB1"),
    event("e4", "m3", "pC1"),
    event("e5", "m3", "pA2"),
    event("e6", "m4", "pB1"),
  ],
});

qa.suite("Removing a tournament");

t("takes its matches and the points recorded in them", () => {
  const plan = planTournamentRemoval(league(), "T1");
  assert.deepEqual(plan.target, { collection: "tournaments", id: "T1" });
  assert.deepEqual(plan.matchIds, ["m1", "m2"]);
  assert.equal(plan.events, 3);
});

t("takes its groups, and leaves other tournaments' groups alone", () => {
  const plan = planTournamentRemoval(league(), "T1");
  assert.deepEqual(plan.rows, [{ collection: "groups", id: "g1" }]);
  assert.deepEqual(plan.unlinks, []);
});

t("an empty tournament removes only itself", () => {
  const db = { ...emptyDb(), tournaments: [{ id: "T9", venueId: null }] };
  const plan = planTournamentRemoval(db, "T9");
  assert.deepEqual(plan.matchIds, []);
  assert.equal(plan.events, 0);
  assert.deepEqual(plan.rows, []);
});

qa.suite("Removing a venue");

t("takes its courts and no matches", () => {
  const plan = planVenueRemoval(league(), "V1");
  assert.deepEqual(plan.target, { collection: "venues", id: "V1" });
  assert.deepEqual(plan.rows, [
    { collection: "courts", id: "c1" },
    { collection: "courts", id: "c2" },
  ]);
  assert.deepEqual(plan.matchIds, []);
  assert.equal(plan.events, 0);
});

t("matches and tournaments stay, but lose only the links to this venue", () => {
  const plan = planVenueRemoval(league(), "V1");
  assert.deepEqual(plan.unlinks, [
    { collection: "matches", id: "m1", patch: { venueId: null, courtId: null } },
    { collection: "matches", id: "m2", patch: { courtId: null } },
    { collection: "matches", id: "m3", patch: { venueId: null } },
    { collection: "tournaments", id: "T1", patch: { venueId: null } },
  ]);
  assert.equal(countOf(plan.unlinks, "matches"), 3);
  assert.equal(countOf(plan.unlinks, "tournaments"), 1);
});

qa.suite("Removing a team");

t("takes its players, staff and every match it played, with their points", () => {
  const plan = planTeamRemoval(league(), "A");
  assert.deepEqual(plan.target, { collection: "teams", id: "A" });
  assert.deepEqual(plan.matchIds, ["m1", "m3"]);
  assert.equal(plan.events, 4);
  assert.deepEqual(plan.rows, [
    { collection: "players", id: "pA1" },
    { collection: "players", id: "pA2" },
    { collection: "staff", id: "sA1" },
  ]);
  assert.equal(countOf(plan.rows, "players"), 2);
  assert.equal(countOf(plan.rows, "staff"), 1);
});

t("a team with no players, staff or matches removes only itself", () => {
  const db = { ...emptyDb(), teams: [{ id: "Z" }] };
  const plan = planTeamRemoval(db, "Z");
  assert.deepEqual(plan.matchIds, []);
  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.unlinks, []);
});

qa.suite("Carrying out a plan");

/**
 * In-memory store that refuses a delete while anything still points at the
 * row, like the Postgres foreign keys without ON DELETE CASCADE
 * (matches → teams, stat_events → team_players, match → court/venue links).
 */
function strictStore(db) {
  const refs = {
    teams: (id) => db.matches.some((m) => m.homeTeamId === id || m.awayTeamId === id),
    players: (id) => db.events.some((e) => e.playerId === id),
    courts: (id) => db.matches.some((m) => m.courtId === id),
    venues: (id) =>
      db.matches.some((m) => m.venueId === id) ||
      db.tournaments.some((x) => x.venueId === id) ||
      db.courts.some((c) => c.venueId === id),
    tournaments: (id) =>
      db.matches.some((m) => m.tournamentId === id) ||
      db.groups.some((g) => g.tournamentId === id),
  };
  return {
    db,
    remove(collection, id) {
      if (refs[collection]?.(id)) throw new Error(`${collection}/${id} is still referenced`);
      db[collection] = db[collection].filter((r) => r.id !== id);
    },
    update(collection, id, patch) {
      db[collection] = db[collection].map((r) => (r.id === id ? { ...r, ...patch } : r));
    },
    deleteMatch(matchId) {
      db.matches = db.matches.filter((m) => m.id !== matchId);
      db.events = db.events.filter((e) => e.matchId !== matchId);
    },
  };
}

t("a team removal deletes matches before the players their points belong to", () => {
  const store = strictStore(league());
  applyRemoval(store, planTeamRemoval(store.db, "A"));
  assert.deepEqual(store.db.teams.map((x) => x.id), ["B", "C"]);
  assert.deepEqual(store.db.players.map((p) => p.id), ["pB1", "pC1"]);
  assert.deepEqual(store.db.staff.map((s) => s.id), ["sB1"]);
  assert.deepEqual(store.db.matches.map((m) => m.id), ["m2", "m4"]);
  assert.deepEqual(store.db.events.map((e) => e.id), ["e3", "e6"]);
});

t("a tournament removal leaves no match, point or group of it behind", () => {
  const store = strictStore(league());
  applyRemoval(store, planTournamentRemoval(store.db, "T1"));
  assert.deepEqual(store.db.tournaments.map((x) => x.id), ["T2"]);
  assert.deepEqual(store.db.matches.map((m) => m.id), ["m3", "m4"]);
  assert.deepEqual(store.db.events.map((e) => e.id), ["e4", "e5", "e6"]);
  assert.deepEqual(store.db.groups.map((g) => g.id), ["g2"]);
});

t("a venue removal clears the links before deleting courts and the venue", () => {
  const store = strictStore(league());
  applyRemoval(store, planVenueRemoval(store.db, "V1"));
  assert.deepEqual(store.db.venues.map((v) => v.id), ["V2"]);
  assert.deepEqual(store.db.courts.map((c) => c.id), ["c3"]);
  assert.equal(store.db.matches.length, 4, "every match survives");
  assert.deepEqual(
    store.db.matches.map((m) => [m.id, m.venueId, m.courtId]),
    [
      ["m1", null, null],
      ["m2", null, null],
      ["m3", null, "c3"],
      ["m4", "V2", null],
    ],
  );
  assert.deepEqual(store.db.tournaments.map((x) => [x.id, x.venueId]), [
    ["T1", null],
    ["T2", "V2"],
  ]);
});

qa.finish();
