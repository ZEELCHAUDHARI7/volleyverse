/**
 * Guardians Trophy U21 seed data — the seven squads circulated by the
 * organisers on 14 Aug 2026.
 *
 * Like `pvl-2025.ts`, this lives outside the core platform on purpose: the
 * product ships empty and reusable, and this module is one opt-in dataset a
 * league can load.
 *
 * SOURCE: seven team sheets shared over WhatsApp — three as images (Goa's
 * chest-number list, Bengaluru's kit-details table, Delhi's handwritten sheet)
 * and four as plain text (Mumbai, Chennai, Ahmedabad, Kochi).
 *
 * DATA-FIDELITY RULES (same ethic as the PVL seed — nothing is invented):
 *  - Every player has a squad number, because every sheet lists one.
 *  - POSITION IS NOT KNOWN. These sheets give a number and a name, and the
 *    only role any of them states is "Libero". So `position` is "L" for the
 *    seven flagged liberos and `null` for everyone else, rendering as
 *    "Not listed". None of it is inferred from the ordering of the sheet.
 *  - `isCaptain` is set for exactly one player: Naveen (MUM #12), the only
 *    name marked "(C)" anywhere in the source. No other sheet names a captain,
 *    so no other captain is guessed.
 *  - Several sheets give first names only (Goa, Mumbai, Chennai, Ahmedabad).
 *    They are stored verbatim rather than padded with a surname.
 *  - `nationality` is assumed "India" — a domestic U21 competition, and no
 *    sheet names a country. Stated assumption; correct individually in the
 *    console if a player is not Indian.
 *  - `founded`, height, logo and colours are unknown → null. A squad list for
 *    one tournament says nothing about when the side was formed.
 *  - DELHI FIELDS 10, NOT 12, and its numbers skip 2 and 9. The sheet lists
 *    ten players; the two gaps are reproduced rather than filled.
 *  - GOA REGISTERS TWO LIBEROS (Shakti #06, Yogesh #09). That is legal and is
 *    what the sheet says, so both carry position "L".
 *  - Bengaluru's sheet has a "Name on Jersey" column that disagrees with the
 *    "Name" column for two players (#8 Sahid Kalsar → "JANAM", #4 Shubhash Raj
 *    → "MALTHESH"). The data model has no jersey-name field, so the Name
 *    column is used. Worth confirming with the organisers.
 *
 * TEAM NAMES COLLIDE WITH `pvl-2025.ts` on all seven clubs. That is deliberate:
 * these are the same franchises' U21 sides, and `loadU21GuardiansTrophy`
 * REPLACES any existing team of the same name rather than sitting a duplicate
 * next to it. See the loader below for exactly what that destroys.
 */

import type { DataProvider } from "../repository";
import type { Player, Team } from "../types";

type SeedPlayer = Omit<Player, "id" | "teamId">;
type SeedTeam = { team: Omit<Team, "id">; players: SeedPlayer[] };

/** Competition chain the loader creates. Also used to find it on re-run. */
export const U21_LEAGUE_NAME = "Guardians Trophy U21";
export const U21_SEASON_NAME = "2026";
export const U21_TOURNAMENT_NAME = "Guardians Trophy U21 2026";

/**
 * Build a player row. The sheets give a number and a name; `libero` and
 * `captain` are set only where the source explicitly marks them.
 */
function p(
  jerseyNo: number,
  fullName: string,
  opts: { libero?: boolean; captain?: boolean } = {},
): SeedPlayer {
  return {
    fullName,
    jerseyNo,
    // "L" only where the sheet says Libero — every other slot is unknown,
    // not "OH by default".
    position: opts.libero ? "L" : null,
    heightCm: null,
    nationality: "India", // assumed for a domestic U21 competition
    photoUrl: null,
    isCaptain: opts.captain ?? false,
    isReserve: false, // no sheet distinguishes squad from standby
  };
}

function team(
  name: string,
  shortName: string,
  city: string,
  players: SeedPlayer[],
): SeedTeam {
  return {
    team: { name, shortName, logoUrl: null, city, founded: null, honours: [] },
    players,
  };
}

/** The seven Guardians Trophy U21 squads, players ordered by squad number. */
export const U21_GUARDIANS_TROPHY: SeedTeam[] = [
  team("Ahmedabad Defenders", "AHM", "Ahmedabad", [
    p(1, "Kausen"),
    p(2, "Ajar Ali"),
    p(3, "Daksh"),
    p(4, "Dev"),
    p(5, "Nauman", { libero: true }),
    p(6, "Dhvanik"),
    p(7, "Sujal"),
    p(8, "Anurag"),
    p(9, "Pratap"),
    p(10, "Deepak"),
    p(11, "Shiva"),
    p(12, "Aniket"),
  ]),
  team("Bengaluru Torpedoes", "BEN", "Bengaluru", [
    p(1, "Mourya Nandamuri"),
    p(2, "Rajveer Singh Rathore"),
    p(3, "R Ragul"),
    p(4, "Shubhash Raj"),
    p(5, "Parth Sarthi", { libero: true }),
    p(6, "Adhith B"),
    p(7, "Hariom"),
    p(8, "Sahid Kalsar"),
    p(9, "Arjun Sharma"),
    p(10, "Lovepreet Singh"),
    p(11, "Shivanshu Tiwari"),
    p(12, "Ritish Saini"),
  ]),
  team("Chennai Blitz", "CHE", "Chennai", [
    p(1, "Rethish Sai"),
    p(2, "Barath"),
    p(3, "Sandeep"),
    p(4, "Praveen"),
    p(5, "Sushanth"),
    p(6, "Siva"),
    p(7, "Eswar"),
    p(8, "Vishnu"),
    p(9, "Pranav"),
    p(10, "Akilan"),
    p(11, "Satyam"),
    p(12, "Mugesh", { libero: true }),
  ]),
  // Ten players, and the sheet has no #2 or #9. Reproduced as written.
  team("Delhi Toofans", "DEL", "Delhi", [
    p(1, "Kunal Das"),
    p(3, "Manpreet Singh"),
    p(4, "Harnoor Singh"),
    p(5, "Aditya Rana"),
    p(6, "Sourabh Singh"),
    p(7, "Rajat Singh"),
    p(8, "Saeed"),
    p(10, "Pravin"),
    p(11, "Numan Shaikh"),
    p(12, "Kush Singh"),
  ]),
  // Two registered liberos — Shakti (06) and Yogesh (09).
  team("Goa Guardians", "GOA", "Goa", [
    p(1, "Vishesh"),
    p(2, "Sonu"),
    p(3, "Wafiq"),
    p(4, "Digvijay"),
    p(5, "Sourab"),
    p(6, "Shakti", { libero: true }),
    p(7, "Suraj"),
    p(8, "Rajat"),
    p(9, "Yogesh", { libero: true }),
    p(10, "Kartik"),
    p(11, "Arjun"),
    p(12, "Bhuvanes"),
  ]),
  team("Kochi Blue Spikers", "KOC", "Kochi", [
    p(1, "Mouhsin PA"),
    p(2, "Rahul R Nair"),
    p(3, "Nistin C B"),
    p(4, "Jatin Padwal"),
    p(5, "Aadhi Krishna N J"),
    p(6, "Adarsh B"),
    p(7, "Manjeet Singh Rana"),
    p(8, "Neeraj Mehta"),
    p(9, "Nishant Thakur"),
    p(10, "Joseph Shaiwan"),
    p(11, "Sooryanarayanan"),
    p(12, "Sanjay", { libero: true }),
  ]),
  team("Mumbai Meteors", "MUM", "Mumbai", [
    p(1, "Akash"),
    p(2, "Aftab"),
    p(3, "Kartik"),
    p(4, "Krish"),
    p(5, "Aryan"),
    p(6, "Ashoka"),
    p(7, "Shaheraz"),
    p(8, "Rushikesh"),
    p(9, "Nishant"),
    p(10, "Ashad"),
    p(11, "Swanand"),
    p(12, "Naveen", { libero: true, captain: true }),
  ]),
];

// ---------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------

/**
 * What loading this dataset would destroy. Computed from the current store
 * so the console can state the damage BEFORE the operator confirms, rather
 * than reporting it afterwards when it is too late to decline.
 */
export interface U21ReplaceImpact {
  /** Existing team names that will be deleted and rebuilt. */
  teams: string[];
  players: number;
  staff: number;
  /** Matches involving a replaced team — deleted, with their stat events. */
  matches: number;
  /** Stat events on those matches. Every derived statistic goes with them. */
  events: number;
  /** True when the competition chain already exists (re-run, not first load). */
  leagueExists: boolean;
}

/** Teams currently in the store whose name collides with this dataset. */
function collidingTeams(store: DataProvider) {
  const wanted = new Set(
    U21_GUARDIANS_TROPHY.map((s) => s.team.name.toLowerCase()),
  );
  return store.db.teams.filter((t) => wanted.has(t.name.toLowerCase()));
}

/** Dry run: what `loadU21GuardiansTrophy` would remove, without removing it. */
export function previewU21Replace(store: DataProvider): U21ReplaceImpact {
  const doomed = collidingTeams(store);
  const ids = new Set(doomed.map((t) => t.id));
  const matches = store.db.matches.filter(
    (m) => ids.has(m.homeTeamId) || ids.has(m.awayTeamId),
  );
  const matchIds = new Set(matches.map((m) => m.id));
  return {
    teams: doomed.map((t) => t.name),
    players: store.db.players.filter((pl) => ids.has(pl.teamId)).length,
    staff: store.db.staff.filter((s) => ids.has(s.teamId)).length,
    matches: matches.length,
    events: store.db.events.filter((e) => matchIds.has(e.matchId)).length,
    leagueExists: store.db.leagues.some((l) => l.name === U21_LEAGUE_NAME),
  };
}

export interface U21SeedResult {
  /** What was destroyed to make room — mirrors the preview. */
  removed: U21ReplaceImpact;
  leagueId: string;
  seasonId: string;
  tournamentId: string;
  teamsAdded: number;
  playersAdded: number;
}

/**
 * Load the Guardians Trophy U21 competition: League → Season → Tournament,
 * then all seven clubs and their rosters.
 *
 * DESTRUCTIVE, BY DESIGN. All seven names already exist in `pvl-2025.ts`, and
 * one club cannot hold two different squads under one name. So any existing
 * team with a matching name is cascade-deleted first — its players, its staff,
 * and every match it played (which, because statistics are event-sourced,
 * takes that match's stat events, scores and analytics with it). Call
 * `previewU21Replace` first and put the numbers in front of a human.
 *
 * Idempotent in the sense that matters: re-running rebuilds the same seven
 * squads and reuses the existing league/season/tournament rather than
 * creating a second copy. It does NOT preserve matches played in between.
 *
 * Provider-agnostic — the same code path works on localStorage and Supabase.
 */
export function loadU21GuardiansTrophy(store: DataProvider): U21SeedResult {
  const removed = previewU21Replace(store);

  // --- 1. Clear the colliding franchises, deepest dependency first. ---
  // Everything to delete is listed BEFORE the first delete lands. A provider
  // is free to apply writes synchronously (Supabase optimistic path) or to
  // queue them behind a re-render (LocalProvider); iterating a live array
  // while removing from it would skip rows under the first. Snapshots don't.
  const doomed = collidingTeams(store);
  const ids = new Set(doomed.map((t) => t.id));
  const matches = store.db.matches.filter(
    (m) => ids.has(m.homeTeamId) || ids.has(m.awayTeamId),
  );
  const players = store.db.players.filter((pl) => ids.has(pl.teamId));
  const staff = store.db.staff.filter((s) => ids.has(s.teamId));

  // Matches before teams: deleteMatch also drops the match's stat events, so
  // no statistic outlives the team it was recorded against.
  for (const m of matches) store.deleteMatch(m.id);
  for (const pl of players) store.remove("players", pl.id);
  for (const s of staff) store.remove("staff", s.id);
  for (const t of doomed) store.remove("teams", t.id);

  // --- 2. Competition chain, reused on re-run rather than duplicated. ---
  const league =
    store.db.leagues.find((l) => l.name === U21_LEAGUE_NAME) ??
    store.insert("leagues", {
      name: U21_LEAGUE_NAME,
      logoUrl: null,
      status: "active",
    });

  const season =
    store.db.seasons.find(
      (s) => s.leagueId === league.id && s.name === U21_SEASON_NAME,
    ) ??
    store.insert("seasons", {
      leagueId: league.id,
      name: U21_SEASON_NAME,
      // The sheets carry no dates. Fill them in from the console once the
      // organisers publish a schedule.
      startDate: null,
      endDate: null,
      status: "active",
    });

  const tournament =
    store.db.tournaments.find(
      (t) => t.seasonId === season.id && t.name === U21_TOURNAMENT_NAME,
    ) ??
    store.insert("tournaments", {
      seasonId: season.id,
      divisionId: null,
      name: U21_TOURNAMENT_NAME,
      logoUrl: null,
      organizer: null,
      venueId: null,
      startDate: null,
      endDate: null,
      // Seven teams and no group sheet in the source → a straight round-robin
      // is the only format the data supports. Change it in the console if the
      // organisers run pools.
      format: "LEAGUE",
      status: "upcoming",
    });

  // --- 3. Squads. ---
  let teamsAdded = 0;
  let playersAdded = 0;
  for (const { team: t, players } of U21_GUARDIANS_TROPHY) {
    const created = store.insert("teams", t);
    teamsAdded++;
    for (const pl of players) {
      store.insert("players", { ...pl, teamId: created.id });
      playersAdded++;
    }
  }

  return {
    removed,
    leagueId: league.id,
    seasonId: season.id,
    tournamentId: tournament.id,
    teamsAdded,
    playersAdded,
  };
}
