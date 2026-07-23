/**
 * Analytics sanity tests — pure logic, zero deps.
 *
 * Run: node --experimental-strip-types --loader ./resolver.mjs \
 *        src/lib/analytics/analytics.test.mjs
 * (Modules import sibling .ts files without extensions, matching the
 * bundler resolution the app uses; the loader supplies the .ts extension.)
 */
import assert from "node:assert/strict";
import { getSport, resolveSport } from "./framework.ts";
import { teamRecord, headToHead, setTally, seasonSummary, matchDifficulty } from "./general.ts";
import { rallyOutcomes, progression } from "./volleyball.ts";
import "./volleyball.ts"; // register the sport

let passed = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  passed++;
};

// --- Fixtures -------------------------------------------------------
const HOME = "H";
const AWAY = "A";
const player = (id, teamId, position) => ({
  id, fullName: id, jerseyNo: null, position, heightCm: null,
  nationality: null, photoUrl: null, teamId, isCaptain: false, isReserve: false,
});
const homeRoster = [player("h_oh", HOME, "OH"), player("h_s", HOME, "S"), player("h_mb", HOME, "MB"), player("h_l", HOME, "L")];
const awayRoster = [player("a_oh", AWAY, "OH"), player("a_s", AWAY, "S"), player("a_mb", AWAY, "MB"), player("a_l", AWAY, "L")];

let ts = 1_000_000;
const ev = (teamId, playerId, setNo, type) => ({
  id: `e${ts}`, matchId: "m1", teamId, playerId, setNo, type, ts: (ts += 5000),
});

// A short scripted set: home wins several rallies, away a couple.
const events = [
  ev(HOME, "h_oh", 1, "SERVE_ACE"),   // home point (serving) -> break
  ev(AWAY, "a_oh", 1, "SPIKE_ERR"),   // away error -> home point
  ev(HOME, "h_oh", 1, "SPIKE_POINT"), // home point
  ev(AWAY, "a_oh", 1, "SPIKE_POINT"), // away point (side-out)
  ev(HOME, "h_l", 1, "RECV_GOOD"),    // non-terminal
  ev(HOME, "h_oh", 1, "SPIKE_POINT"), // home point (side-out, first-ball)
  ev(AWAY, "a_s", 1, "SERVE_ERR"),    // away error -> home point
];

const match = {
  id: "m1", tournamentId: "t1", groupId: null, matchNo: 1,
  dateISO: "2026-03-10", time: null, venueId: null, courtId: null,
  homeTeamId: HOME, awayTeamId: AWAY, status: "completed", totalSets: 3,
  published: true, winnerTeamId: HOME,
  officials: [], rosters: [],
  setScores: [
    { setNo: 1, homePoints: 25, awayPoints: 20 },
    { setNo: 2, homePoints: 25, awayPoints: 18 },
  ],
};

// --- rallyOutcomes / progression -----------------------------------
const outcomes = rallyOutcomes(events, HOME);
const terminals = events.filter((e) =>
  ["SPIKE_POINT", "SERVE_ACE", "BLOCK_WIN", "SPIKE_ERR", "SERVE_ERR", "RECV_ERR", "SET_ERR", "BLOCK_MISS", "DIG_FAIL"].includes(e.type),
);
ok("one outcome per terminal event", outcomes.length === terminals.length);

const homeWins = outcomes.filter((o) => o.scorer === "home").length;
const awayWins = outcomes.filter((o) => o.scorer === "away").length;
ok("home won 5 rallies", homeWins === 5);
ok("away won 1 rally", awayWins === 1);

const prog = progression(events, HOME);
ok("progression length matches outcomes", prog.length === outcomes.length);
const last = prog[prog.length - 1];
ok("cumulative equals win counts", last.home === homeWins && last.away === awayWins);
ok("margin is home-away", last.margin === homeWins - awayWins);

// Serve classification: first rally is a break (home served set 1 & scored).
ok("first point is a break point", outcomes[0].breakPoint === true && outcomes[0].sideOut === false);
// The away SPIKE_POINT came right after a home point, so away was receiving -> side-out.
const awayOutcome = outcomes.find((o) => o.scorer === "away");
ok("away point is a side-out", awayOutcome.sideOut === true);
// First-ball side-out flagged where a good reception preceded a home kill.
ok("a first-ball side-out was detected", outcomes.some((o) => o.firstBall === true));

// --- sport module ---------------------------------------------------
const sport = getSport(resolveSport(match));
ok("volleyball module registered", !!sport && sport.id === "volleyball");
const a = sport.analyzeMatch({
  match, homeTeam: { id: HOME, name: "Home", shortName: "HOM" },
  awayTeam: { id: AWAY, name: "Away", shortName: "AWY" },
  homeRoster, awayRoster, events,
});
ok("winner resolved to home", a.result.winner === "home");
ok("scoreline reflects set tally", a.result.scoreline === "2–0");
ok("total points KPI = sum of set scores", a.headline.find((k) => k.key === "points").value === 25 + 20 + 25 + 18);
ok("team stat sheet has both sides", a.teamStats.home.stats.length > 5 && a.teamStats.away.stats.length > 5);
ok("distributions include court heatmap", a.distributions.some((d) => d.shape === "court"));
ok("box score built", Array.isArray(a.boxScore.rows));

// --- general season maths ------------------------------------------
const t = setTally(match);
ok("setTally reads set scores", t.home === 2 && t.away === 0);

const matches = [
  match,
  { ...match, id: "m2", dateISO: "2026-03-12", winnerTeamId: AWAY,
    setScores: [{ setNo: 1, homePoints: 20, awayPoints: 25 }, { setNo: 2, homePoints: 18, awayPoints: 25 }] },
  { ...match, id: "m3", dateISO: "2026-04-01", homeTeamId: AWAY, awayTeamId: HOME, winnerTeamId: HOME,
    setScores: [{ setNo: 1, homePoints: 20, awayPoints: 25 }, { setNo: 2, homePoints: 22, awayPoints: 25 }] },
];
const rec = teamRecord(matches, HOME);
ok("home played 3", rec.played === 3);
ok("home won 2, lost 1", rec.won === 2 && rec.lost === 1);
ok("win pct computed", rec.winPct === Math.round((2 / 3) * 1000) / 10);
ok("home/away split adds up", rec.home.played + rec.away.played === 3);
ok("longest win streak >= 1", rec.longestWinStreak >= 1);

const h2h = headToHead(matches, HOME, AWAY);
ok("h2h counts all 3 meetings", h2h.played === 3);
ok("h2h wins sum to played", h2h.aWins + h2h.bWins === 3);

const summary = seasonSummary(matches);
ok("season summary counts matches", summary.matchesPlayed === 3);
ok("avg points per set positive", summary.avgPointsPerSet > 0);

const diff = matchDifficulty(matches, match, HOME);
ok("difficulty rating in range", diff.rating >= 0 && diff.rating <= 100);

console.log(`\n✓ analytics.test.mjs — ${passed} assertions passed\n`);
