import type { Db, EventType, Match, Player, StatEvent } from "./types";

/**
 * Seed data derived from the client's reference Excel
 * (Volleyball_Analytics_.xlsx): heights, reaches and success-rate
 * profiles mirror the sample rows, condensed to a realistic 12-man
 * roster. Three completed matches are generated deterministically so
 * the demo opens with real-looking history and trends.
 *
 * NOTE (planning Phase 8, risk #5): the Excel's correlations are
 * synthetic-clean. The generator adds mild per-match variance so
 * charts look plausible rather than fabricated.
 */

// ---- Roster (attributes from the Excel's SPIKERS/SETTERS/CENTERS sheets) ----
const P = (
  id: string,
  name: string,
  jersey: number,
  role: Player["role"],
  heightM: number,
  reachM: number,
): Player => ({ id, name, jersey, role, heightM, reachM });

export const SEED_PLAYERS: Player[] = [
  // Spikers — height/reach pairs from Excel rows; rate profile below
  P("sp1", "Rohit Singh", 7, "SPIKER", 2.15, 3.25),
  P("sp2", "Arjun Nair", 11, "SPIKER", 2.14, 3.22),
  P("sp3", "Vikram Rane", 4, "SPIKER", 2.12, 3.2),
  P("sp4", "Dev Kamat", 9, "SPIKER", 2.08, 3.15),
  P("sp5", "Karan Shetty", 14, "SPIKER", 2.05, 3.1),
  P("sp6", "Aman D'Souza", 2, "SPIKER", 2.03, 3.08),
  // Setters
  P("st1", "Neel Parab", 5, "SETTER", 2.0, 2.85),
  P("st2", "Sagar Naik", 10, "SETTER", 1.96, 2.8),
  P("st3", "Ishaan Verma", 8, "SETTER", 1.9, 2.71),
  // Centres
  P("ct1", "Pranav Gaonkar", 12, "CENTRE", 2.18, 3.15),
  P("ct2", "Aditya Kale", 6, "CENTRE", 2.15, 3.12),
  P("ct3", "Joel Fernandes", 3, "CENTRE", 2.1, 3.08),
];

// Per-player per-match target profile (from Excel rates, lightly varied)
interface Profile {
  // spiker: [attempts, successRate 0-1, pointShare of successes 0-1]
  // setter: [attempts, successRate 0-1, assistShare of successes 0-1]
  // centre: [blockAttempts, blockRate 0-1, saves]
  a: number;
  r: number;
  x: number;
}
const PROFILES: Record<string, Profile> = {
  sp1: { a: 31, r: 0.78, x: 0.8 }, // Excel Spiker 4: 78%, 24 pts
  sp2: { a: 30, r: 0.76, x: 0.78 },
  sp3: { a: 28, r: 0.73, x: 0.75 },
  sp4: { a: 26, r: 0.72, x: 0.72 },
  sp5: { a: 25, r: 0.68, x: 0.7 },
  sp6: { a: 24, r: 0.65, x: 0.67 },
  st1: { a: 35, r: 0.92, x: 0.95 }, // Excel Setter E: 92%, 32 assists profile scaled
  st2: { a: 33, r: 0.88, x: 0.9 },
  st3: { a: 30, r: 0.81, x: 0.85 },
  ct1: { a: 19, r: 0.68, x: 10 }, // Excel Center 4
  ct2: { a: 18, r: 0.65, x: 9 },
  ct3: { a: 15, r: 0.58, x: 7 },
};

export const SEED_MATCHES: Match[] = [
  {
    id: "m1",
    opponent: "Kochi Blue Spikers",
    dateISO: "2026-06-12",
    venue: "Panaji, Goa",
    totalSets: 4,
    status: "completed",
    published: true,
    roster: SEED_PLAYERS.map((p) => p.id),
  },
  {
    id: "m2",
    opponent: "Kolkata Thunderbolts",
    dateISO: "2026-06-21",
    venue: "Kolkata",
    totalSets: 5,
    status: "completed",
    published: true,
    roster: SEED_PLAYERS.map((p) => p.id),
  },
  {
    id: "m3",
    opponent: "Ahmedabad Defenders",
    dateISO: "2026-07-02",
    venue: "Panaji, Goa",
    totalSets: 4,
    status: "completed",
    published: false,
    roster: SEED_PLAYERS.map((p) => p.id),
  },
];

// Deterministic PRNG so every fresh install seeds identical data
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateEvents(): StatEvent[] {
  const rand = mulberry32(20260710);
  const events: StatEvent[] = [];
  let ts = Date.parse("2026-06-12T18:00:00Z");
  let n = 0;

  const push = (matchId: string, playerId: string, set: number, type: EventType) => {
    events.push({ id: `e${++n}`, matchId, playerId, set, type, ts: (ts += 20000) });
  };

  SEED_MATCHES.forEach((match, mi) => {
    const variance = [0.92, 1.06, 1.0][mi]; // form dips and peaks across matches
    for (const player of SEED_PLAYERS) {
      const prof = PROFILES[player.id];
      const attempts = Math.round(prof.a * variance * (0.9 + rand() * 0.2));
      const rate = Math.min(0.97, prof.r * (0.94 + rand() * 0.12));

      for (let i = 0; i < attempts; i++) {
        const set = 1 + Math.floor(rand() * match.totalSets);
        const success = rand() < rate;
        if (player.role === "SPIKER") {
          push(match.id, player.id, set, !success ? "SPIKE_ERR" : rand() < prof.x ? "SPIKE_POINT" : "SPIKE_IN");
        } else if (player.role === "SETTER") {
          push(match.id, player.id, set, !success ? "SET_ERR" : rand() < prof.x ? "SET_ASSIST" : "SET_GOOD");
        } else {
          push(match.id, player.id, set, success ? "BLOCK_WIN" : "BLOCK_MISS");
        }
      }
      // ---- Serve (universal): everyone rotates through service ----
      // Story beat: Rohit Singh (sp1) has an ace-storm game in match 2,
      // seeding a season record the client can see get broken live.
      const serves = 8 + Math.floor(rand() * 6);
      const aceRate =
        player.id === "sp1" && mi === 1
          ? 0.42
          : player.role === "SPIKER"
            ? 0.12
            : 0.07;
      for (let i = 0; i < serves; i++) {
        const set = 1 + Math.floor(rand() * match.totalSets);
        const roll = rand();
        push(
          match.id,
          player.id,
          set,
          roll < aceRate ? "SERVE_ACE" : roll < aceRate + 0.08 ? "SERVE_ERR" : "SERVE_IN",
        );
      }

      // ---- Defence (universal): centres carry the load ----
      // Story beat: Joel Fernandes (ct3) has a super-dig heroics game.
      const digs =
        player.role === "CENTRE"
          ? 9 + Math.floor(rand() * 5)
          : 3 + Math.floor(rand() * 3);
      const superRate = player.id === "ct3" && mi === 2 ? 0.4 : 0.1;
      for (let i = 0; i < digs; i++) {
        const set = 1 + Math.floor(rand() * match.totalSets);
        const roll = rand();
        push(
          match.id,
          player.id,
          set,
          roll < superRate ? "DIG_SUPER" : roll < superRate + 0.62 ? "DIG_SAVE" : "DIG_FAIL",
        );
      }
    }
  });

  return events;
}

export function buildSeed(): Db {
  return {
    players: SEED_PLAYERS,
    matches: SEED_MATCHES,
    events: generateEvents(),
  };
}
