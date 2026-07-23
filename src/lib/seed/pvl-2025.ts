/**
 * PVL 2025 seed data — Prime Volleyball League squads.
 *
 * This is REAL, current roster data (all 10 franchises, main squad + reserves).
 * It lives outside the core platform on purpose: the product itself ships
 * empty and reusable, and this module is one opt-in dataset a league can load.
 *
 * DATA-FIDELITY RULES (see the loader button in the console):
 *  - Position and squad number are NOT published for these players in any
 *    single public source, so they are left `null` → shown as "Not listed".
 *    We never fabricate a position or a jersey number.
 *  - `nationality` is set only where the source names a country. Everyone
 *    else is a domestic player in an Indian league, so we ASSUME "India".
 *    (Stated assumption — correct individually via the console if needed.)
 *  - Reserve / standby players carry `isReserve: true`.
 *  - Height and photo are unknown → left null.
 *  - `founded` = the franchise's first PVL season (Wikipedia "Debut" column).
 *    Note PVL's inaugural edition was 2022; the 2019 six-team league was a
 *    separate, defunct predecessor (Pro Volleyball League).
 *  - `isCaptain` is set ONLY for the five 2025 (Season 4) captains that could
 *    be verified AND are present in this squad list: Muthusamy Appavu (AHM),
 *    Saqlain Tariq (DEL), Chirag Yadav (GOA), Ashwal Rai (KOL), Amit Gulia
 *    (MUM). Other franchises' listed captains did not match the loaded roster
 *    (likely a different season/source), so they are left unset rather than
 *    guessed. Brand colours are unpublished by any reliable source → omitted.
 */

import type { DataProvider } from "../repository";
import type { Player, Team } from "../types";

type SeedPlayer = Omit<Player, "id" | "teamId">;
type SeedTeam = { team: Omit<Team, "id">; players: SeedPlayer[] };

/** Build a player row from just a name plus the few knowable overrides. */
function p(
  fullName: string,
  opts: { nationality?: string; reserve?: boolean; captain?: boolean } = {},
): SeedPlayer {
  return {
    fullName,
    jerseyNo: null, // not listed in source
    position: null, // not listed in source
    heightCm: null,
    nationality: opts.nationality ?? "India", // assumed for domestic players
    photoUrl: null,
    isCaptain: opts.captain ?? false, // set only where verified for 2025 (Season 4)
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

/** All 10 Prime Volleyball League franchises with their 2025 squads. */
export const PVL_2025: SeedTeam[] = [
  team("Ahmedabad Defenders", "AHM", "Ahmedabad", 2022, [
    p("Muthusamy Appavu", { captain: true }),
    p("Battur Batsuuri", { nationality: "Mongolia" }),
    p("Dhruvil Patel"),
    p("Nandhagopal Subramaniam"),
    p("Shon T John"),
    p("Angamuthu Ramaswamy"),
    p("Harsh Chaudhari"),
    p("Abhinav BS"),
    p("Akhin GS"),
    p("Arshak Sinan"),
    p("Prabagaran"),
    p("Ronald Martinez", { nationality: "Venezuela" }),
    p("Abhishek Soni", { reserve: true }),
    p("Ayush Chaudhari", { reserve: true }),
  ]),
  team("Bengaluru Torpedoes", "BEN", "Bengaluru", 2022, [
    p("Matt West", { nationality: "USA" }),
    p("Sandeep"),
    p("Himanshu Tyagi"),
    p("Jibin Sebastian"),
    p("Joel Benjamin J"),
    p("Rohit Kumar"),
    p("Sethu TR"),
    p("Jalen Penrose", { nationality: "USA" }),
    p("Jishnu PV"),
    p("Mujeeb Mc"),
    p("Nitin Minhas"),
    p("Midhunkumar Balasubramaniyan"),
    p("Arshad KS", { reserve: true }),
    p("Naji Ahmed", { reserve: true }),
  ]),
  team("Calicut Heroes", "CAL", "Calicut", 2022, [
    p("Haris"),
    p("Mohan Ukkrapandian"),
    p("Kiranraj Thevalil"),
    p("Santosh S"),
    p("Ussama Rehamat"),
    p("Abdul Raheem"),
    p("Ashok Bishnoi"),
    p("Shameemudheen"),
    p("Vikas Maan"),
    p("Mukesh Kumar"),
    p("Dete Bosco", { nationality: "Benin" }),
    p("Tharusha Chamath", { nationality: "Sri Lanka" }),
    p("Sivanesan V", { reserve: true }),
    p("Adarsh K", { reserve: true }),
  ]),
  team("Chennai Blitz", "CHE", "Chennai", 2022, [
    p("Nanjil Surya"),
    p("Sameer Chaudhary"),
    p("Luiz Felipe Perotto", { nationality: "Brazil" }),
    p("M Ashwin Raj"),
    p("Tarun Gowda K"),
    p("Dhilip Kumar"),
    p("Jerome Vinith C"),
    p("K Vishnu Vardhan Babu"),
    p("Aditya Rana"),
    p("Leandro Jose", { nationality: "Colombia" }),
    p("Suraj Chaudhary"),
    p("T Srikanth"),
    p("Pranav K Dev", { reserve: true }),
    p("Venu Chikkanna", { reserve: true }),
  ]),
  team("Delhi Toofans", "DEL", "Delhi", 2024, [
    p("Avinash"),
    p("Saqlain Tariq", { captain: true }),
    p("Anu James"),
    p("George Antony"),
    p("Mannat Choudhary"),
    p("Abhishek Rajeev"),
    p("Aayush"),
    p("Jesus Chourio", { nationality: "Venezuela" }),
    p("Muhammed Jasim"),
    p("Rijas K R"),
    p("Anand K"),
    p("Carlos Berrios", { nationality: "Venezuela" }),
    p("Ajay Kumar", { reserve: true }),
    p("Aljo Sabu", { reserve: true }),
  ]),
  team("Goa Guardians", "GOA", "Goa", 2025, [
    p("Aravindhan S"),
    p("Rohit Yadav"),
    p("Amit Chhoker"),
    p("Chirag Yadav", { captain: true }),
    p("Jeffrey Menzel", { nationality: "USA" }),
    p("Jerry Daniel"),
    p("Nathaniel Dickinson", { nationality: "USA" }),
    p("Vikram Choudhary"),
    p("Dushyant Singh"),
    p("LM Manoj"),
    p("Prince Malik"),
    p("Ramanathan Ramamoorthy"),
    p("Shakti Singh", { reserve: true }),
  ]),
  team("Hyderabad Black Hawks", "HYD", "Hyderabad", 2022, [
    p("Paulo Lamounier", { nationality: "Brazil" }),
    p("Preet Karan"),
    p("Aman Kumar"),
    p("Athul"),
    p("Rajneesh Singh"),
    p("Vitor Yamamoto", { nationality: "Brazil" }),
    p("Guru Prashanth"),
    p("Sahil Kumar"),
    p("Digvijay Singh"),
    p("John Joseph"),
    p("Shikhar Singh"),
    p("Deepu Venugopal"),
    p("Niyas Abdul Salam", { reserve: true }),
    p("Shibin TS", { reserve: true }),
  ]),
  team("Kochi Blue Spikers", "KOC", "Kochi", 2022, [
    p("Byron Keturakis", { nationality: "Canada" }),
    p("Janshad U"),
    p("Amal K Thomas"),
    p("Erin Varghese"),
    p("Hemanth P"),
    p("Nicholas Marechal", { nationality: "France" }),
    p("Vinit Kumar"),
    p("Amrinderpal Singh"),
    p("Jasjodh Singh"),
    p("Nirmal George"),
    p("Alan Ashiqe VL"),
    p("Soorya Santhosh"),
    p("Abhishek CK", { reserve: true }),
    p("Bibin Binoy", { reserve: true }),
  ]),
  team("Kolkata Thunderbolts", "KOL", "Kolkata", 2022, [
    p("Jithin Neelathazha"),
    p("Lal Sujan MV"),
    p("Pankaj Sharma"),
    p("Rahul K"),
    p("Suryansh Tomar"),
    p("Ashwal Rai", { captain: true }),
    p("Muhammad Fawaz M"),
    p("Muhammed Iqbal"),
    p("Srajan Shetty"),
    p("Hari Prasad BS"),
    p("Matin Takavar", { nationality: "Iran" }),
    p("Sebastian Gomez", { nationality: "Colombia" }),
    p("Anush", { reserve: true }),
    p("Soham Dinesh More", { reserve: true }),
  ]),
  team("Mumbai Meteors", "MUM", "Mumbai", 2023, [
    p("Lad Om Vasant"),
    p("Vipul Kumar"),
    p("Amit Gulia", { captain: true }),
    p("Mritunjoy Mahanta"),
    p("Nikhil Choudhary"),
    p("Sonu"),
    p("Nikhil"),
    p("Shubham Chaudhary"),
    p("Abhinav Salar"),
    p("Karthik A"),
    p("Yogesh Kumar"),
    p("Petter Alstad", { nationality: "Norway" }),
    p("Mathias Loftesnes", { nationality: "Norway" }),
    p("Kush Singh", { reserve: true }),
    p("Kamlesh Khatik", { reserve: true }),
  ]),
];

export interface SeedResult {
  teamsAdded: number;
  playersAdded: number;
  skipped: string[]; // team names skipped because they already exist
}

/**
 * Insert the PVL 2025 squads through the repository. Idempotent by team name:
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
