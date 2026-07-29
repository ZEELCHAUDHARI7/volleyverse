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
  openingRally,
  initialMatchState,
  skipPhase,
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

qa.finish();
