/**
 * Pure block-tally tests. Run: node --experimental-strip-types src/lib/blocks.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { blockLine, blockLines, blockLeaders, duels, bestSetBlocks } from "./blocks.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Block Tally Verification Suite",
  file: "src/lib/blocks.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

let seq = 0;
/** Minimal StatEvent for tallying. `vs` is the opponent in the duel. */
const ev = (playerId, type, vs = null, setNo = 1, matchId = "m1") => ({
  id: `e${++seq}`,
  matchId,
  teamId: "t1",
  playerId,
  setNo,
  type,
  ts: seq,
  vsPlayerId: vs,
});

qa.suite("A Blocker's Line");

t("a block is counted, and the spiker it beat is remembered", () => {
  const line = blockLine("B7", [ev("B7", "BLOCK_WIN", "S9")]);
  assert.equal(line.blocks, 1);
  assert.equal(line.attempts, 1);
  assert.equal(line.successRate, 100);
  assert.deepEqual(line.topVictim, { playerId: "S9", blocks: 1 });
});

t("being tooled is a duel lost, not an error against the blocker", () => {
  const line = blockLine("B7", [
    ev("B7", "BLOCK_WIN", "S9"),
    ev("B7", "BLOCK_TOOLED", "S9"),
  ]);
  assert.equal(line.blocks, 1);
  assert.equal(line.tooled, 1);
  assert.equal(line.attempts, 2);
  assert.equal(line.successRate, 50);
});

t("no duels gives a null rate, not zero", () => {
  const line = blockLine("B7", []);
  assert.equal(line.attempts, 0);
  assert.equal(line.successRate, null);
  assert.equal(line.topVictim, null);
});

t("the phase tracker's beaten block (BLOCK_MISS) counts against the rate", () => {
  const line = blockLine("B7", [ev("B7", "BLOCK_WIN"), ev("B7", "BLOCK_MISS")]);
  assert.equal(line.missed, 1);
  assert.equal(line.attempts, 2);
  assert.equal(line.successRate, 50);
});

t("a block with no spiker named still counts as a block", () => {
  // What the phase-based /rally tracker writes: it never asks who was hitting.
  const line = blockLine("B7", [ev("B7", "BLOCK_WIN")]);
  assert.equal(line.blocks, 1);
  assert.equal(line.topVictim, null);
});

t("the spiker's own half of the duel is not a block for the blocker", () => {
  const line = blockLine("B7", [
    ev("S9", "SPIKE_BLOCKED", "B7"),
    ev("B7", "BLOCK_WIN", "S9"),
  ]);
  assert.equal(line.blocks, 1, "one rally, one block — not two");
});

t("attacks and digs never count as blocks", () => {
  const line = blockLine("B7", [
    ev("B7", "SPIKE_POINT"),
    ev("B7", "SPIKE_TOOL", "S9"),
    ev("B7", "DIG_SAVE"),
    ev("B7", "BLOCK_WIN", "S9"),
  ]);
  assert.equal(line.attempts, 1);
});

t("the most-blocked spiker is the one blocked most, not the last one blocked", () => {
  const line = blockLine("B7", [
    ev("B7", "BLOCK_WIN", "S9"),
    ev("B7", "BLOCK_WIN", "S9"),
    ev("B7", "BLOCK_WIN", "S4"),
  ]);
  assert.deepEqual(line.topVictim, { playerId: "S9", blocks: 2 });
});

t("blocks are split by set", () => {
  const line = blockLine("B7", [
    ev("B7", "BLOCK_WIN", "S9", 1),
    ev("B7", "BLOCK_WIN", "S9", 2),
    ev("B7", "BLOCK_WIN", "S4", 2),
  ]);
  assert.deepEqual(line.blocksBySet, { 1: 1, 2: 2 });
});

qa.suite("Leaderboard");

t("blockLines returns one line per id, in the order given", () => {
  const lines = blockLines(["B4", "B7"], [ev("B7", "BLOCK_WIN", "S9")]);
  assert.equal(lines[0].playerId, "B4");
  assert.equal(lines[0].blocks, 0);
  assert.equal(lines[1].blocks, 1);
});

t("the leaderboard drops everyone who never blocked", () => {
  const leaders = blockLeaders(
    ["B4", "B7"],
    [ev("B7", "BLOCK_WIN", "S9"), ev("B4", "BLOCK_TOOLED", "S9")],
  );
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0].playerId, "B7");
});

t("level on blocks, the blocker tooled less often ranks higher", () => {
  const leaders = blockLeaders(
    ["B4", "B7"],
    [
      ev("B4", "BLOCK_WIN", "S9"),
      ev("B4", "BLOCK_TOOLED", "S9"),
      ev("B7", "BLOCK_WIN", "S9"),
    ],
  );
  assert.equal(leaders[0].playerId, "B7");
});

qa.suite("Spiker vs Blocker");

t("a duel records both directions from the blocker's events alone", () => {
  const cells = duels([
    ev("S9", "SPIKE_BLOCKED", "B7"),
    ev("B7", "BLOCK_WIN", "S9"),
    ev("S9", "SPIKE_TOOL", "B7"),
    ev("B7", "BLOCK_TOOLED", "S9"),
  ]);
  assert.equal(cells.length, 1, "one matchup, not one per event");
  assert.deepEqual(cells[0], { blockerId: "B7", spikerId: "S9", blocks: 1, tools: 1 });
});

t("an unattributed block is left out of the matrix", () => {
  assert.deepEqual(duels([ev("B7", "BLOCK_WIN")]), []);
});

t("matchups sort by blocks, so the strongest reads first", () => {
  const cells = duels([
    ev("B4", "BLOCK_WIN", "S9"),
    ev("B7", "BLOCK_WIN", "S9"),
    ev("B7", "BLOCK_WIN", "S9"),
  ]);
  assert.equal(cells[0].blockerId, "B7");
  assert.equal(cells[0].blocks, 2);
});

qa.suite("Records");

t("the best set is the best single set, not the best match", () => {
  const best = bestSetBlocks("B7", [
    ev("B7", "BLOCK_WIN", "S9", 1),
    ev("B7", "BLOCK_WIN", "S9", 1),
    ev("B7", "BLOCK_WIN", "S9", 2),
  ]);
  assert.deepEqual(best, { matchId: "m1", setNo: 1, blocks: 2 });
});

t("set 1 of two different matches is two different sets", () => {
  const best = bestSetBlocks("B7", [
    ev("B7", "BLOCK_WIN", "S9", 1, "m1"),
    ev("B7", "BLOCK_WIN", "S9", 1, "m2"),
  ]);
  assert.equal(best.blocks, 1, "not 2 — a season has many set 1s");
});

t("a player who never blocked has no best set", () => {
  assert.equal(bestSetBlocks("B7", [ev("B7", "BLOCK_TOOLED", "S9")]), null);
});

qa.finish();
