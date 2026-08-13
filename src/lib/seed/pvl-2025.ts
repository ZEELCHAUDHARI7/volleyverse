/**
 * PVL 2025 seed data — Prime Volleyball League squads.
 *
 * This is REAL roster data for all 10 franchises, taken from team sheets that
 * carry the two fields a courtside collector cannot work without: the shirt
 * number and the court position. It lives outside the core platform on
 * purpose: the product itself ships empty and reusable, and this module is one
 * opt-in dataset a league can load.
 *
 * DATA-FIDELITY RULES (see the loader button in the console):
 *  - Every player here has a squad number and a position, because the source
 *    sheet lists both. Nothing is inferred: a player absent from the sheet is
 *    absent from this file rather than carried over without a number.
 *  - "Universal" is recorded as `U`, not folded into `OPP`. It is the label the
 *    clubs use, and the two are not the same job.
 *  - `nationality` is set only where the source names a country. Everyone else
 *    is a domestic player in an Indian league, so we ASSUME "India".
 *    (Stated assumption — correct individually via the console if needed.)
 *  - Height and photo are unknown → left null.
 *  - `founded` = the franchise's first PVL season (Wikipedia "Debut" column).
 *    Note PVL's inaugural edition was 2022; the 2019 six-team league was a
 *    separate, defunct predecessor (Pro Volleyball League).
 *  - `isCaptain` is set ONLY for captains that could be verified AND appear in
 *    this squad list: Muthusamy Appavu (AHM), Saqlain Tariq (DEL), Chirag Yadav
 *    (GOA), Amit Gulia (MUM). Other franchises' listed captains did not match
 *    the loaded roster, so they are left unset rather than guessed. Brand
 *    colours are unpublished by any reliable source → omitted.
 *  - FOUR NAMES APPEAR ON TWO TEAMS in the source (Ashwal Rai: AHM #11 and KOL
 *    #11; LM Manoj: AHM #18 and GOA #2; Vinit Kumar: KOC #1 and KOL #7;
 *    Ratheesh CK: MUM #10 and KOC #14). One person cannot hold two squads in a
 *    single season, so the sheet either mixes seasons or repeats a name across
 *    two different people. Both entries are kept, each on the team that listed
 *    them, rather than dropping a squad member on a guess. They are separate
 *    rows and nothing downstream joins players by name.
 */

import type { DataProvider } from "../repository";
import type { Player, PlayerPosition, Team } from "../types";

type SeedPlayer = Omit<Player, "id" | "teamId">;
type SeedTeam = { team: Omit<Team, "id">; players: SeedPlayer[] };

/** Build a player row: number and position are known, the rest is not. */
function p(
  jerseyNo: number,
  fullName: string,
  position: PlayerPosition,
  opts: { nationality?: string; reserve?: boolean; captain?: boolean } = {},
): SeedPlayer {
  return {
    fullName,
    jerseyNo,
    position,
    heightCm: null,
    nationality: opts.nationality ?? "India", // assumed for domestic players
    photoUrl: null,
    isCaptain: opts.captain ?? false, // set only where verified
    isReserve: opts.reserve ?? false,
  };
}

function team(
  name: string,
  shortName: string,
  city: string,
  founded: number, // first PVL season (Wikipedia "Debut"); PVL's inaugural edition was 2022
  players: SeedPlayer[],
): SeedTeam {
  return {
    // Brand colours are intentionally omitted: no reliable source publishes
    // named colours or hex codes, so logoUrl stays null rather than guessed.
    team: { name, shortName, logoUrl: null, city, founded, honours: [] },
    players,
  };
}

/** All 10 Prime Volleyball League franchises with their squads. */
export const PVL_2025: SeedTeam[] = [
  team("Ahmedabad Defenders", "AHM", "Ahmedabad", 2022, [
    p(3, "Muthusamy Appavu", "S", { captain: true }),
    p(5, "Shon T John", "OH"),
    p(6, "Angamuthu Ramaswamy", "U"),
    p(8, "Ilya Kovalov", "OH"),
    p(9, "Max Senica", "OH"),
    p(11, "Ashwal Rai", "MB"),
    p(14, "Srikanth T", "L"),
    p(18, "LM Manoj", "MB"),
  ]),
  team("Bengaluru Torpedoes", "BEN", "Bengaluru", 2022, [
    p(1, "Pankaj Sharma", "OH"),
    p(2, "Srajan Shetty", "MB"),
    p(4, "Jishnu PV", "MB"),
    p(7, "Paulo Iury", "S"),
    p(8, "Heptinstall", "OH"),
    p(9, "Ibin Jose", "U"),
    p(10, "Midhun Kumar", "L"),
    p(12, "Nisamathuheen", "MB"),
    p(14, "Sethu TR", "OH"),
  ]),
  team("Calicut Heroes", "CAL", "Calicut", 2022, [
    p(1, "Mohan Ukkrapandian", "S"),
    p(4, "Haris PP", "S"),
    p(7, "Ashok Bishnoi", "OH"),
    p(9, "Bosco Dete", "OH", { nationality: "Benin" }),
    p(10, "Santhosh Sahaya", "OH"),
    p(11, "Gagan Kumar", "OPP"),
    p(12, "Vikas Maan", "MB"),
    p(14, "Mukesh Kumar", "L"),
    p(17, "Abdul Raheem", "U"),
  ]),
  team("Chennai Blitz", "CHE", "Chennai", 2022, [
    p(2, "Sameer Chaudhary", "S"),
    p(5, "Surya Nanjil", "S"),
    p(7, "Luiz Felipe Perotto", "OH", { nationality: "Brazil" }),
    p(8, "M Ashwin Raj", "OH"),
    p(9, "Tarun Gowda K", "OH"),
    p(11, "Jerome Vinith C", "U"),
    p(12, "Dhilip Kumar", "U"),
    p(14, "P Prabhakaran", "L"),
    p(18, "GS Akhin", "MB"),
  ]),
  team("Delhi Toofans", "DEL", "Delhi", 2024, [
    p(1, "Santhosh S", "OH"),
    p(3, "Lazar Dodic", "U", { nationality: "Serbia" }),
    p(4, "Anas Khan", "MB"),
    p(5, "Saqlain Tariq", "S", { captain: true }),
    p(6, "Rohit Kumar", "OH"),
    p(8, "Daniel Aponza", "MB", { nationality: "Colombia" }),
    p(10, "Anand K", "L"),
    p(11, "Fayadh Hudha", "OH"),
    p(17, "Amal Thomas", "S"),
  ]),
  team("Goa Guardians", "GOA", "Goa", 2025, [
    p(1, "Jeffrey Menzel", "OH", { nationality: "USA" }),
    p(2, "LM Manoj", "MB"),
    p(3, "Prince Malik", "MB"),
    p(4, "Nathaniel Dickinson", "U", { nationality: "USA" }),
    p(5, "Amit Chhoker", "OH"),
    p(6, "Ramanathan Ramamoorthy", "L"),
    p(7, "Jerry Daniel", "OH"),
    p(8, "Aravindhan S", "S"),
    p(9, "Chirag Yadav", "OH", { captain: true }),
    p(10, "Shakti Singh", "L"),
    p(11, "Rohit Yadav", "S"),
    p(13, "Dushyant Singh", "MB"),
    p(14, "Vikram Choudhary", "U"),
  ]),
  team("Hyderabad Black Hawks", "HYD", "Hyderabad", 2022, [
    p(3, "Paulo Iury Lamounier", "S", { nationality: "Brazil" }),
    p(5, "Kumar Yashvanth", "S"),
    p(6, "Vitor Yudi Yamamoto", "OH", { nationality: "Brazil" }),
    p(8, "Manoj Kumar", "OPP"),
    p(10, "Digvijay Singh", "MB"),
    p(12, "Guramritpal Singh", "MB"),
    p(15, "Sonu Kumar Jhakar", "L"),
  ]),
  team("Kochi Blue Spikers", "KOC", "Kochi", 2022, [
    p(1, "Vinit Kumar", "OPP"),
    p(3, "Byron Keturakis", "S", { nationality: "Canada" }),
    p(6, "Janshad U", "S"),
    p(8, "Erin Varghese", "OH"),
    p(9, "Amal K Thomas", "OH"),
    p(11, "Suresh Khoiwal", "OPP"),
    p(14, "Ratheesh CK", "L"),
    p(16, "Abhinav BS", "MB"),
  ]),
  team("Kolkata Thunderbolts", "KOL", "Kolkata", 2022, [
    p(1, "Kisiel", "U", { nationality: "Poland" }),
    p(2, "Shetty", "MB"),
    p(5, "Rahul K", "OH"),
    p(7, "Vinit Kumar", "OH"),
    p(10, "Hari Parsad", "L"),
    p(11, "Ashwal Rai", "MB"),
    p(15, "Vinayak Rokhade", "S"),
    p(17, "Onur Cukur", "S", { nationality: "Türkiye" }),
    p(19, "Praful", "MB"),
  ]),
  team("Mumbai Meteors", "MUM", "Mumbai", 2023, [
    p(4, "Hardeep Singh", "OH"),
    p(6, "Ajithlal C", "OH"),
    p(7, "Karthik A", "MB"),
    p(8, "Amit Gulia", "OH", { captain: true }),
    p(9, "Vipul Kumar", "S"),
    p(10, "Ratheesh CK", "L"),
    p(11, "Shameemudheen", "U"),
    p(13, "Peter Ostvik", "MB", { nationality: "Norway" }),
    p(16, "Mathias Loftesnes", "OH", { nationality: "Norway" }),
  ]),
];

export interface SeedResult {
  teamsAdded: number;
  playersAdded: number;
  skipped: string[]; // team names skipped because they already exist
}

/**
 * Insert the PVL squads through the repository. Idempotent by team name:
 * teams that already exist are skipped, so re-running never duplicates.
 * Provider-agnostic — works today on localStorage, unchanged on Supabase.
 */
export function loadPvl2025(store: DataProvider): SeedResult {
  const result: SeedResult = { teamsAdded: 0, playersAdded: 0, skipped: [] };
  const existing = new Set(store.db.teams.map((t) => t.name.toLowerCase()));

  for (const { team: t, players } of PVL_2025) {
    if (existing.has(t.name.toLowerCase())) {
      result.skipped.push(t.name);
      continue;
    }
    const created = store.insert("teams", t);
    result.teamsAdded++;
    for (const pl of players) {
      store.insert("players", { ...pl, teamId: created.id });
      result.playersAdded++;
    }
  }
  return result;
}
