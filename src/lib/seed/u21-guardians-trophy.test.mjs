/**
 * Guardians Trophy U21 seed tests.
 * Run: node --experimental-strip-types src/lib/seed/u21-guardians-trophy.test.mjs
 *
 * Two things are under test. First the DATA: a roster typed from a photo of a
 * handwritten sheet is exactly the kind of input that quietly grows a
 * duplicate shirt number, and a duplicate number is not visible in the UI
 * until two players are on court wearing it. Second the LOADER, which deletes
 * live data — its blast radius has to be provable, not assumed.
 */
import assert from "node:assert/strict";
import { createRunner } from "../console-ui.mjs";
import {
  U21_GUARDIANS_TROPHY,
  U21_LEAGUE_NAME,
  U21_SEASON_NAME,
  U21_TOURNAMENT_NAME,
  loadU21GuardiansTrophy,
  previewU21Replace,
  seedU21IntoDb,
} from "./u21-guardians-trophy.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Guardians Trophy U21 Seed Suite",
  file: "src/lib/seed/u21-guardians-trophy.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

/**
 * Minimal DataProvider double. Writes replace arrays rather than mutating
 * them, mirroring the real providers — a loader that only works against a
 * mutable store would be a loader that breaks in the app.
 */
function fakeStore(seed = {}) {
  let n = 0;
  const db = {
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
    ...seed,
  };
  return {
    db,
    insert(collection, row) {
      const withId = { ...row, id: `${collection}_${++n}` };
      db[collection] = [...db[collection], withId];
      return withId;
    },
    remove(collection, id) {
      db[collection] = db[collection].filter((r) => r.id !== id);
    },
    deleteMatch(matchId) {
      db.matches = db.matches.filter((m) => m.id !== matchId);
      db.events = db.events.filter((e) => e.matchId !== matchId);
    },
  };
}

/** A store already holding a PVL-style "Goa Guardians" that played a match. */
function storeWithPvlGoa() {
  const store = fakeStore();
  const goa = store.insert("teams", { name: "Goa Guardians", shortName: "GOA" });
  const cal = store.insert("teams", { name: "Calicut Heroes", shortName: "CAL" });
  const old = store.insert("players", { fullName: "Chirag Yadav", teamId: goa.id });
  store.insert("players", { fullName: "Haris PP", teamId: cal.id });
  store.insert("staff", { name: "Coach", role: "HEAD_COACH", teamId: goa.id });
  const m = store.insert("matches", {
    homeTeamId: goa.id,
    awayTeamId: cal.id,
    tournamentId: "old",
  });
  store.insert("events", { matchId: m.id, playerId: old.id, type: "SPIKE_POINT" });
  return { store, goa, cal, match: m };
}

// ---------------------------------------------------------------------

qa.suite("Roster Data");

t("seven squads, 82 players", () => {
  assert.equal(U21_GUARDIANS_TROPHY.length, 7);
  const total = U21_GUARDIANS_TROPHY.reduce((s, x) => s + x.players.length, 0);
  assert.equal(total, 82);
});

t("no team wears the same number twice", () => {
  for (const { team, players } of U21_GUARDIANS_TROPHY) {
    const nums = players.map((p) => p.jerseyNo);
    assert.equal(
      new Set(nums).size,
      nums.length,
      `${team.name} has a duplicate squad number`,
    );
  }
});

t("no team lists the same player twice", () => {
  for (const { team, players } of U21_GUARDIANS_TROPHY) {
    const names = players.map((p) => p.fullName);
    assert.equal(new Set(names).size, names.length, `${team.name} repeats a name`);
  }
});

t("every player has a number in 1–12", () => {
  for (const { team, players } of U21_GUARDIANS_TROPHY) {
    for (const p of players) {
      assert.ok(
        Number.isInteger(p.jerseyNo) && p.jerseyNo >= 1 && p.jerseyNo <= 12,
        `${team.name} #${p.jerseyNo} ${p.fullName} is out of range`,
      );
    }
  }
});

t("every squad is 12 except Delhi, whose sheet lists 10", () => {
  for (const { team, players } of U21_GUARDIANS_TROPHY) {
    assert.equal(
      players.length,
      team.name === "Delhi Toofans" ? 10 : 12,
      `${team.name} squad size`,
    );
  }
});

t("Delhi's sheet skips 2 and 9 — reproduced, not filled in", () => {
  const delhi = U21_GUARDIANS_TROPHY.find((x) => x.team.name === "Delhi Toofans");
  const nums = delhi.players.map((p) => p.jerseyNo).sort((a, b) => a - b);
  assert.deepEqual(nums, [1, 3, 4, 5, 6, 7, 8, 10, 11, 12]);
});

qa.suite("Fidelity: nothing inferred");

t("position is set ONLY for the liberos the sheets flag", () => {
  const flagged = [];
  for (const { team, players } of U21_GUARDIANS_TROPHY) {
    for (const p of players) {
      if (p.position === null) continue;
      assert.equal(p.position, "L", `${p.fullName} has a guessed position`);
      flagged.push(`${team.shortName} ${p.jerseyNo} ${p.fullName}`);
    }
  }
  // Seven, not six: Goa registers two.
  assert.deepEqual(flagged, [
    "AHM 5 Nauman",
    "BEN 5 Parth Sarthi",
    "CHE 12 Mugesh",
    "GOA 6 Shakti",
    "GOA 9 Yogesh",
    "KOC 12 Sanjay",
    "MUM 12 Naveen",
  ]);
});

t("exactly one captain — the only (C) in the source", () => {
  const caps = U21_GUARDIANS_TROPHY.flatMap((x) =>
    x.players.filter((p) => p.isCaptain).map((p) => p.fullName),
  );
  assert.deepEqual(caps, ["Naveen"]);
});

t("no team claims a founding year or honours it cannot source", () => {
  for (const { team } of U21_GUARDIANS_TROPHY) {
    assert.equal(team.founded, null);
    assert.equal(team.logoUrl, null);
    assert.deepEqual(team.honours, []);
  }
});

t("heights are unknown, not zero", () => {
  for (const { players } of U21_GUARDIANS_TROPHY) {
    for (const p of players) assert.equal(p.heightCm, null);
  }
});

qa.suite("Loader: competition chain");

t("builds league → season → tournament and links them", () => {
  const store = fakeStore();
  const r = loadU21GuardiansTrophy(store);

  assert.equal(store.db.leagues.length, 1);
  assert.equal(store.db.leagues[0].name, U21_LEAGUE_NAME);
  assert.equal(store.db.leagues[0].status, "active");

  assert.equal(store.db.seasons.length, 1);
  assert.equal(store.db.seasons[0].name, U21_SEASON_NAME);
  assert.equal(store.db.seasons[0].leagueId, r.leagueId);

  assert.equal(store.db.tournaments.length, 1);
  assert.equal(store.db.tournaments[0].name, U21_TOURNAMENT_NAME);
  assert.equal(store.db.tournaments[0].seasonId, r.seasonId);
  assert.equal(store.db.tournaments[0].format, "LEAGUE");
});

t("inserts all seven squads with every player attached to its team", () => {
  const store = fakeStore();
  const r = loadU21GuardiansTrophy(store);
  assert.equal(r.teamsAdded, 7);
  assert.equal(r.playersAdded, 82);
  assert.equal(store.db.teams.length, 7);
  assert.equal(store.db.players.length, 82);

  for (const { team, players } of U21_GUARDIANS_TROPHY) {
    const row = store.db.teams.find((x) => x.name === team.name);
    assert.ok(row, `${team.name} missing`);
    const roster = store.db.players.filter((p) => p.teamId === row.id);
    assert.equal(roster.length, players.length, `${team.name} roster size`);
  }
});

t("no player is left orphaned from a team", () => {
  const store = fakeStore();
  loadU21GuardiansTrophy(store);
  const ids = new Set(store.db.teams.map((t) => t.id));
  for (const p of store.db.players) assert.ok(ids.has(p.teamId), p.fullName);
});

qa.suite("Loader: replacing colliding teams");

t("preview reports the blast radius before anything is deleted", () => {
  const { store } = storeWithPvlGoa();
  const impact = previewU21Replace(store);

  assert.deepEqual(impact.teams, ["Goa Guardians"]);
  assert.equal(impact.players, 1);
  assert.equal(impact.staff, 1);
  assert.equal(impact.matches, 1);
  assert.equal(impact.events, 1);
  assert.equal(impact.leagueExists, false);

  // A preview that mutates is not a preview.
  assert.equal(store.db.teams.length, 2);
  assert.equal(store.db.matches.length, 1);
  assert.equal(store.db.events.length, 1);
});

t("the colliding team is rebuilt, not duplicated", () => {
  const { store, goa } = storeWithPvlGoa();
  loadU21GuardiansTrophy(store);
  const named = store.db.teams.filter((t) => t.name === "Goa Guardians");
  assert.equal(named.length, 1);
  assert.notEqual(named[0].id, goa.id, "should be a fresh row, not the old one");
});

t("the old roster goes with it — no PVL player survives on a U21 team", () => {
  const { store } = storeWithPvlGoa();
  loadU21GuardiansTrophy(store);
  assert.equal(
    store.db.players.some((p) => p.fullName === "Chirag Yadav"),
    false,
  );
  assert.equal(store.db.staff.length, 0);
});

t("matches involving a replaced team are deleted with their stat events", () => {
  const { store } = storeWithPvlGoa();
  loadU21GuardiansTrophy(store);
  assert.equal(store.db.matches.length, 0);
  assert.equal(store.db.events.length, 0, "orphaned events would inflate stats");
});

t("teams NOT in this dataset are left completely alone", () => {
  const { store, cal } = storeWithPvlGoa();
  loadU21GuardiansTrophy(store);
  const survivor = store.db.teams.find((t) => t.id === cal.id);
  assert.ok(survivor, "Calicut Heroes should not have been touched");
  assert.equal(survivor.name, "Calicut Heroes");
  assert.equal(
    store.db.players.some((p) => p.fullName === "Haris PP"),
    true,
    "an untouched team keeps its roster",
  );
});

qa.suite("Loader: re-running");

t("a second run rebuilds the squads without a second league", () => {
  const store = fakeStore();
  loadU21GuardiansTrophy(store);
  const first = { ...store.db.leagues[0] };

  loadU21GuardiansTrophy(store);
  assert.equal(store.db.leagues.length, 1, "duplicate league");
  assert.equal(store.db.seasons.length, 1, "duplicate season");
  assert.equal(store.db.tournaments.length, 1, "duplicate tournament");
  assert.equal(store.db.leagues[0].id, first.id, "league should be reused");
  assert.equal(store.db.teams.length, 7, "duplicate teams");
  assert.equal(store.db.players.length, 82, "duplicate players");
});

t("the second run reports what the first run's data cost", () => {
  const store = fakeStore();
  loadU21GuardiansTrophy(store);
  const r = loadU21GuardiansTrophy(store);
  assert.equal(r.removed.teams.length, 7);
  assert.equal(r.removed.players, 82);
  assert.equal(r.removed.leagueExists, true);
});

t("loading into an empty store destroys nothing", () => {
  const store = fakeStore();
  const r = loadU21GuardiansTrophy(store);
  assert.deepEqual(r.removed.teams, []);
  assert.equal(r.removed.players, 0);
  assert.equal(r.removed.matches, 0);
  assert.equal(r.removed.events, 0);
});

// ---------------------------------------------------------------------
// seedU21IntoDb — the offline first-run path, which runs before React and
// therefore has no provider to lean on.
// ---------------------------------------------------------------------

qa.suite("First-run seed (plain Db)");

/** The shape store.tsx starts from. */
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

t("fills an empty Db with the whole competition", () => {
  const db = seedU21IntoDb(emptyDb());
  assert.equal(db.teams.length, 7);
  assert.equal(db.players.length, 82);
  assert.equal(db.leagues.length, 1);
  assert.equal(db.leagues[0].name, U21_LEAGUE_NAME);
  assert.equal(db.seasons.length, 1);
  assert.equal(db.tournaments.length, 1);
});

t("does not mutate the input — the caller can still fall back to it", () => {
  const before = emptyDb();
  seedU21IntoDb(before);
  assert.equal(before.teams.length, 0);
  assert.equal(before.players.length, 0);
  assert.equal(before.leagues.length, 0);
});

t("every row gets a distinct id", () => {
  const db = seedU21IntoDb(emptyDb());
  const ids = [
    ...db.teams,
    ...db.players,
    ...db.leagues,
    ...db.seasons,
    ...db.tournaments,
  ].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "id collision would merge rows");
  for (const id of ids) assert.ok(id, "every row needs an id");
});

t("players point at teams that exist in the same Db", () => {
  const db = seedU21IntoDb(emptyDb());
  const teamIds = new Set(db.teams.map((t) => t.id));
  for (const p of db.players) assert.ok(teamIds.has(p.teamId), p.fullName);
  // And the chain hangs together end to end.
  assert.equal(db.seasons[0].leagueId, db.leagues[0].id);
  assert.equal(db.tournaments[0].seasonId, db.seasons[0].id);
});

t("seeding twice is the caller's bug to prevent, not a silent doubling", () => {
  // store.tsx guards with SEEDED_KEY. If that guard ever fails, the second
  // pass must still REPLACE rather than stack up two of every team.
  const once = seedU21IntoDb(emptyDb());
  const twice = seedU21IntoDb(once);
  assert.equal(twice.teams.length, 7, "would be 14 if replace stopped working");
  assert.equal(twice.players.length, 82);
  assert.equal(twice.leagues.length, 1);
});

t("an existing registry is left alone — unrelated teams survive", () => {
  const db = emptyDb();
  db.teams.push({ id: "t_keep", name: "Calicut Heroes", shortName: "CAL" });
  db.players.push({ id: "p_keep", fullName: "Haris PP", teamId: "t_keep" });
  const out = seedU21IntoDb(db);
  assert.ok(out.teams.find((t) => t.id === "t_keep"));
  assert.ok(out.players.find((p) => p.id === "p_keep"));
  assert.equal(out.teams.length, 8, "7 seeded + 1 kept");
});

qa.finish();
