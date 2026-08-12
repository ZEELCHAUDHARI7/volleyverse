/**
 * Pure-engine tests. Run: node --experimental-strip-types src/lib/rally.test.mjs
 * (rally.ts has only a type-only import so node's type-stripping handles it.)
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  rotate,
  serverId,
  isFrontRow,
  other,
  servingFromToss,
  servingForSet,
  isDecidingSet,
  firstServerForSet,
  inferAction,
  resolveTrio,
  resolvePoint,
  setPointReached,
  SET_TARGET,
  matchTarget,
  matchWinner,
  openingRally,
  initialMatchState,
  skipPhase,
  setupForSet,
  withSetSetup,
  openSetCourt,
  lineupComplete,
  TRIOS,
  POSITIONS,
} from "./rally.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Rally Engine Verification Suite",
  file: "src/lib/rally.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

qa.suite("Rotation Engine");
const L = { 1: "a", 2: "b", 3: "c", 4: "d", 5: "e", 6: "f" };

t("rotate shifts clockwise; P2 moves to the serving slot", () => {
  const r = rotate(L);
  assert.equal(r[1], "b");
  assert.equal(r[6], "a");
  assert.equal(r[2], "c");
});

t("six rotations return to the start", () => {
  let r = L;
  for (let i = 0; i < 6; i++) r = rotate(r);
  assert.deepEqual(r, L);
});

t("serverId reads position 1; front row is 2/3/4", () => {
  assert.equal(serverId(L), "a");
  assert.equal(serverId(rotate(L)), "b");
  assert.equal(isFrontRow(L, "c"), true); // P3
  assert.equal(isFrontRow(L, "a"), false); // P1
});

t("lineup covers all six positions uniquely", () => {
  assert.equal(new Set(POSITIONS.map((p) => L[p])).size, 6);
});

qa.suite("Coin Toss & Serve Order");

t("toss: winner chooses serve → they serve; chooses receive → other serves", () => {
  assert.equal(servingFromToss({ winner: "US", choice: "SERVE" }), "US");
  assert.equal(servingFromToss({ winner: "US", choice: "RECEIVE" }), "OPP");
  assert.equal(servingFromToss({ winner: "OPP", choice: "SERVE" }), "OPP");
  assert.equal(servingFromToss({ winner: "OPP", choice: "RECEIVE" }), "US");
});

t("non-deciding sets: first serve alternates from the set-1 toss (convention)", () => {
  const toss = { winner: "OPP", choice: "RECEIVE" }; // US serves set 1
  assert.equal(servingForSet(toss, 1), "US");
  assert.equal(servingForSet(toss, 2), "OPP");
  assert.equal(servingForSet(toss, 3), "US");
});

qa.suite("Deciding Set - FIVB 6.3.2 / 7.1");

t("isDecidingSet: the last set of the match is the deciding set", () => {
  assert.equal(isDecidingSet(5, 5), true); // best-of-5
  assert.equal(isDecidingSet(3, 5), false);
  assert.equal(isDecidingSet(3, 3), true); // best-of-3
  assert.equal(isDecidingSet(2, 3), false);
});

t("firstServerForSet: set 1 from toss, non-deciding sets alternate", () => {
  const toss = { winner: "OPP", choice: "RECEIVE" }; // US serves set 1
  assert.equal(firstServerForSet(1, 5, toss, null), "US");
  assert.equal(firstServerForSet(2, 5, toss, null), "OPP");
  assert.equal(firstServerForSet(4, 5, toss, null), "OPP");
});

t("firstServerForSet: deciding set returns null until a NEW toss is taken", () => {
  const toss = { winner: "US", choice: "SERVE" };
  // No fresh toss yet -> caller MUST run one; engine never alternates in.
  assert.equal(firstServerForSet(5, 5, toss, null), null);
  assert.equal(firstServerForSet(3, 3, toss, null), null);
});

t("firstServerForSet: deciding set uses the fresh toss, not alternation", () => {
  const toss = { winner: "OPP", choice: "RECEIVE" }; // set-1 alternation would give US for set 5
  const decidingToss = { winner: "OPP", choice: "SERVE" }; // fresh toss -> OPP serve
  assert.equal(servingForSet(toss, 5), "US"); // what the old (buggy) logic did
  assert.equal(firstServerForSet(5, 5, toss, decidingToss), "OPP"); // correct per fresh toss
});

t("initial state carries a null decidingToss (no deciding toss taken yet)", () => {
  const us = { lineup: L, liberoId: null };
  const opp = { lineup: { 1: "o1", 2: "o2", 3: "o3", 4: "o4", 5: "o5", 6: "o6" }, liberoId: null };
  const st = initialMatchState(us, opp, { winner: "US", choice: "SERVE" });
  assert.equal(st.decidingToss, null);
});

qa.suite("Side-Out & Rotation Trigger");

t("server wins → keeps serving, nobody rotates", () => {
  const { nextServing, rotateWinner } = resolvePoint("US", "US");
  assert.equal(nextServing, "US");
  assert.equal(rotateWinner, false);
});

t("receiver wins → side-out: winner rotates and gains serve", () => {
  for (const [serving, winner] of [["OPP", "US"], ["US", "OPP"]]) {
    const r = resolvePoint(serving, winner);
    assert.equal(r.nextServing, winner);
    assert.equal(r.rotateWinner, true);
  }
});

qa.suite("Action Inference");

t("DEFEND infers block for front row, dig for back row/libero", () => {
  assert.equal(inferAction("DEFEND", true), "BLOCK");
  assert.equal(inferAction("DEFEND", false), "DIG");
  assert.equal(inferAction("DIG", true), "DIG"); // after a touch, anyone digs
  assert.equal(inferAction("ATTACK", true), "ATTACK");
  assert.equal(inferAction("SERVE", false), "SERVE");
});

qa.suite("Trio Resolution (✓ O ✗ Table)");

t("every action × trio resolves to a point OR a next phase, never neither", () => {
  for (const action of ["SERVE", "RECEIVE", "SET", "ATTACK", "BLOCK", "DIG"]) {
    for (const trio of TRIOS) {
      const r = resolveTrio(action, "US", trio);
      if (r.pointTo) assert.equal(r.nextPhase, "OVER", `${action}/${trio} scoring must end rally`);
      else assert.notEqual(r.nextPhase, "OVER", `${action}/${trio} must advance`);
    }
  }
});

t("✗ always gives the point to the other side, for either team", () => {
  for (const action of ["SERVE", "RECEIVE", "SET", "ATTACK", "BLOCK", "DIG"]) {
    assert.equal(resolveTrio(action, "US", "LOSE").pointTo, "OPP");
    assert.equal(resolveTrio(action, "OPP", "LOSE").pointTo, "US");
  }
});

t("serve: ✓ ace scores, O passes the ball to the receivers", () => {
  assert.deepEqual(resolveTrio("SERVE", "OPP", "WIN"), {
    event: "SERVE_ACE", pointTo: "OPP", nextPhase: "OVER", nextSide: "OPP",
  });
  const o = resolveTrio("SERVE", "US", "CONT");
  assert.equal(o.event, "SERVE_IN");
  assert.equal(o.nextPhase, "RECEIVE");
  assert.equal(o.nextSide, "OPP");
});

t("attack: ✓ kill scores; O sends play to the other side's defence", () => {
  assert.equal(resolveTrio("ATTACK", "US", "WIN").pointTo, "US");
  const c = resolveTrio("ATTACK", "US", "CONT");
  assert.equal(c.event, "SPIKE_IN");
  assert.equal(c.nextPhase, "DEFEND");
  assert.equal(c.nextSide, "OPP");
});

t("block: ✓ stuffs for a point; O is a no-stat touch into own dig", () => {
  assert.equal(resolveTrio("BLOCK", "OPP", "WIN").pointTo, "OPP");
  const touch = resolveTrio("BLOCK", "US", "CONT");
  assert.equal(touch.event, null);
  assert.equal(touch.nextPhase, "DIG");
  assert.equal(touch.nextSide, "US");
});

t("dig: ✓ super dig SAVES (continues), never scores", () => {
  const s = resolveTrio("DIG", "US", "WIN");
  assert.equal(s.event, "DIG_SUPER");
  assert.equal(s.pointTo, null);
  assert.equal(s.nextPhase, "SET");
});

t("receive/set quality maps ✓=perfect/playable, O=good, both continue", () => {
  assert.equal(resolveTrio("RECEIVE", "US", "WIN").event, "RECV_PERFECT");
  assert.equal(resolveTrio("RECEIVE", "US", "CONT").event, "RECV_GOOD");
  assert.equal(resolveTrio("SET", "US", "WIN").nextPhase, "ATTACK");
});

qa.suite("Phase Skipping");

t("skip advances the flow without logging", () => {
  assert.deepEqual(skipPhase("SERVE", "US"), { nextPhase: "RECEIVE", nextSide: "OPP" });
  assert.deepEqual(skipPhase("DEFEND", "OPP"), { nextPhase: "SET", nextSide: "OPP" });
});

qa.suite("Match State");

t("initial state: toss decides who serves, rally opens at their SERVE", () => {
  const us = { lineup: L, liberoId: null };
  const opp = { lineup: { 1: "o1", 2: "o2", 3: "o3", 4: "o4", 5: "o5", 6: "o6" }, liberoId: null };
  const st = initialMatchState(us, opp, { winner: "OPP", choice: "SERVE" });
  assert.equal(st.rally.serving, "OPP");
  assert.equal(st.rally.phase, "SERVE");
  assert.equal(st.rally.side, "OPP");
  assert.equal(serverId(st.oppLineup), "o1");
});

t("openingRally always starts at SERVE for the serving side", () => {
  const r = openingRally("US");
  assert.equal(r.phase, "SERVE");
  assert.equal(r.side, "US");
  assert.equal(other(r.side), "OPP");
});

qa.suite("Set Point");

t("25-23 is set; 25-24 is not (win by 2); deciding-set 15 respected", () => {
  assert.equal(setPointReached(25, 23), true);
  assert.equal(setPointReached(25, 24), false);
  assert.equal(setPointReached(26, 24), true);
  assert.equal(setPointReached(15, 10, 15), true);
  assert.equal(setPointReached(14, 10, 15), false);
});

qa.suite("Set & Match Completion");

t("every set is played to 15, win by two", () => {
  assert.equal(SET_TARGET, 15);
  assert.equal(setPointReached(15, 13, SET_TARGET), true);
  assert.equal(setPointReached(15, 14, SET_TARGET), false);
  assert.equal(setPointReached(16, 14, SET_TARGET), true);
});

t("the deciding set is played to 15 like every other set", () => {
  // isDecidingSet still governs the fresh toss, never the point target.
  assert.equal(isDecidingSet(5, 5), true);
  assert.equal(setPointReached(15, 13, SET_TARGET), true);
});

t("winning the match takes a majority of the sets on offer", () => {
  assert.equal(matchTarget(5), 3);
  assert.equal(matchTarget(3), 2);
});

t("the match is undecided until a side reaches that majority", () => {
  assert.equal(matchWinner(2, 1, 5), null);
  assert.equal(matchWinner(2, 2, 5), null);
  assert.equal(matchWinner(0, 0, 5), null);
});

t("the third set won decides a best-of-five", () => {
  assert.equal(matchWinner(3, 0, 5), "US");
  assert.equal(matchWinner(1, 3, 5), "OPP");
});

t("a best-of-three is decided by the second set, not the third", () => {
  assert.equal(matchWinner(2, 0, 3), "US");
  assert.equal(matchWinner(1, 1, 3), null);
});

qa.suite("Per-set starting rotation");

const SIX_A = { 1: "s", 2: "oh1", 3: "mb1", 4: "opp", 5: "oh2", 6: "mb2" };
const SIX_B = { 1: "oh2", 2: "mb2", 3: "s", 4: "oh1", 5: "mb1", 6: "opp" };
const SIX_C = { 1: "mb1", 2: "opp", 3: "oh2", 4: "mb2", 5: "s", 6: "oh1" };
const setupOf = (usSix, oppSix, usLib = null, oppLib = null) => ({
  us: { lineup: usSix, liberoId: usLib },
  opp: { lineup: oppSix, liberoId: oppLib },
});
const MATCH_SETUP = setupOf(SIX_A, SIX_A);

t("with nothing entered, every set starts from the match setup", () => {
  // The whole back-compatibility story: a session saved before rotation could
  // change between sets has no setSetups at all, and must behave as it did.
  assert.deepEqual(setupForSet(1, MATCH_SETUP, undefined), MATCH_SETUP);
  assert.deepEqual(setupForSet(4, MATCH_SETUP, undefined), MATCH_SETUP);
  assert.deepEqual(setupForSet(3, MATCH_SETUP, {}), MATCH_SETUP);
});

t("a rotation entered for a set is the one that set starts from", () => {
  const entered = withSetSetup({}, 2, setupOf(SIX_B, SIX_C));
  assert.deepEqual(setupForSet(2, MATCH_SETUP, entered).us.lineup, SIX_B);
  assert.deepEqual(setupForSet(2, MATCH_SETUP, entered).opp.lineup, SIX_C);
});

t("an entered rotation carries forward to later sets until changed", () => {
  const entered = withSetSetup({}, 2, setupOf(SIX_B, SIX_B));
  // Set 3 was never entered, so it inherits set 2's — not set 1's.
  assert.deepEqual(setupForSet(3, MATCH_SETUP, entered).us.lineup, SIX_B);
  assert.deepEqual(setupForSet(5, MATCH_SETUP, entered).us.lineup, SIX_B);
});

t("a later entry overrides the carry-forward from an earlier one", () => {
  const entered = withSetSetup(
    withSetSetup({}, 2, setupOf(SIX_B, SIX_B)),
    4,
    setupOf(SIX_C, SIX_C),
  );
  assert.deepEqual(setupForSet(3, MATCH_SETUP, entered).us.lineup, SIX_B);
  assert.deepEqual(setupForSet(4, MATCH_SETUP, entered).us.lineup, SIX_C);
  assert.deepEqual(setupForSet(5, MATCH_SETUP, entered).us.lineup, SIX_C);
});

t("entering set 3 leaves sets 1 and 2 exactly as they were", () => {
  // Editing the rotation must never rewrite the record of a set already played.
  const before = withSetSetup({}, 2, setupOf(SIX_B, SIX_B));
  const after = withSetSetup(before, 3, setupOf(SIX_C, SIX_C));
  assert.deepEqual(setupForSet(1, MATCH_SETUP, after), MATCH_SETUP);
  assert.deepEqual(setupForSet(2, MATCH_SETUP, after).us.lineup, SIX_B);
  assert.deepEqual(before[3], undefined); // the input was not mutated
});

t("opening a set puts both teams on the given rotation", () => {
  const court = openSetCourt(setupOf(SIX_B, SIX_C));
  assert.deepEqual(court.usLineup, SIX_B);
  assert.deepEqual(court.oppLineup, SIX_C);
});

t("opening a set benches both liberos and clears the sub counters", () => {
  // FIVB 15.6/19.3.2: substitution counts are per set, and the libero swap is
  // re-decided by whoever serves first — so a set opens with both on the bench.
  const court = openSetCourt(setupOf(SIX_B, SIX_C, "lib1", "lib2"));
  assert.deepEqual(court.usLibero, { onCourt: false, replacedId: null });
  assert.deepEqual(court.oppLibero, { onCourt: false, replacedId: null });
  assert.deepEqual(court.subs, { us: 0, opp: 0 });
});

t("opening a set is pure — the setup handed in is not touched", () => {
  const setup = setupOf({ ...SIX_A }, { ...SIX_A });
  const court = openSetCourt(setup);
  court.usLineup = SIX_C;
  assert.deepEqual(setup.us.lineup, SIX_A);
});

t("a six is ready only when all six slots are filled", () => {
  assert.equal(lineupComplete(SIX_A), true);
  assert.equal(lineupComplete({ 1: "a", 2: "b", 3: "c" }), false);
  assert.equal(lineupComplete({ ...SIX_A, 4: undefined }), false);
});

t("the same player cannot hold two slots", () => {
  // Building a six from empty cannot produce a duplicate, but EDITING one can:
  // this is the check that only matters once rotations change between sets.
  assert.equal(lineupComplete({ ...SIX_A, 6: SIX_A[1] }), false);
});

t("a match still starts on its set-1 six, liberos benched", () => {
  const s = initialMatchState(
    { lineup: SIX_A, liberoId: "lib1" },
    { lineup: SIX_B, liberoId: null },
    { winner: "US", choice: "SERVE" },
  );
  assert.deepEqual(s.usLineup, SIX_A);
  assert.deepEqual(s.oppLineup, SIX_B);
  assert.equal(s.usLibero.onCourt, false);
  assert.deepEqual(s.subs, { us: 0, opp: 0 });
  // Set 1's rotation comes from the wizard, so no set start is ever owed.
  assert.equal(s.awaitingSetStart, false);
  assert.deepEqual(setupForSet(1, s.setup, s.setSetups).us.lineup, SIX_A);
});

qa.finish();
