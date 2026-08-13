/**
 * Pure substitution + libero tests.
 * Run: node --experimental-strip-types src/lib/substitution.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  LIBERO_OFF,
  applySub,
  liberoStateFrom,
  liberoTargetPosition,
  positionOf,
  subCountFrom,
  subOptions,
  syncBothLiberos,
  syncCourt,
  syncLibero,
} from "./substitution.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Substitution & Libero Verification Suite",
  file: "src/lib/substitution.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

/**
 * A standard 5-1 court. Rotation order is the SLOT order P1→P2→…→P6, and the
 * paired positions sit three slots apart in it (S/OPP, MB1/MB2, OH1/OH2) —
 * which is exactly why one Middle Blocker is always in the back row and the
 * other always in the front:
 *   P1 setter · P2 oh1 · P3 mb1 (front) · P4 opp · P5 oh2 · P6 mb2 (back)
 */
const LINE = { 1: "setter", 2: "oh1", 3: "mb1", 4: "opp", 5: "oh2", 6: "mb2" };
const MBS = new Set(["mb1", "mb2"]);
const isMB = (id) => MBS.has(id);

/** Rotate clockwise — same rule as rally.ts, restated to keep this file pure. */
const rotate = (l) => ({ 1: l[2], 2: l[3], 3: l[4], 4: l[5], 5: l[6], 6: l[1] });

// =====================================================================
qa.suite("Court reading");

t("positionOf finds a player's slot and reports null off court", () => {
  assert.equal(positionOf(LINE, "mb2"), 6);
  assert.equal(positionOf(LINE, "setter"), 1);
  assert.equal(positionOf(LINE, "bench7"), null);
});

t("the libero enters for the BACK-ROW middle blocker, never the front one", () => {
  assert.equal(liberoTargetPosition(LINE, isMB), 6); // mb2, back row
  assert.equal(positionOf(LINE, "mb1"), 3); // mb1 is front row — skipped
  // One rotation on: mb1 has moved to P2, still front, and mb2 down to P5.
  const later = rotate(LINE);
  assert.equal(later[2], "mb1");
  assert.equal(liberoTargetPosition(later, isMB), 5);
  assert.equal(later[5], "mb2");
});

t("no middle blocker behind the attack line means no swap is offered", () => {
  const noMbBack = { 1: "setter", 2: "mb1", 3: "mb2", 4: "opp", 5: "oh1", 6: "oh2" };
  assert.equal(liberoTargetPosition(noMbBack, isMB), null);
});

// =====================================================================
qa.suite("Regular substitution");

t("the incoming player takes the outgoing player's exact slot", () => {
  const r = applySub({ lineup: LINE, libero: LIBERO_OFF, liberoId: "lib", outId: "oh2", inId: "sub7" });
  assert.equal(r.ok, true);
  assert.equal(r.lineup[5], "sub7"); // oh2's slot, to the slot
  assert.equal(positionOf(r.lineup, "oh2"), null);
  // Nothing else moved.
  assert.equal(r.lineup[1], "setter");
  assert.equal(r.lineup[6], "mb2");
});

t("rotation continues from that slot — the new player inherits it completely", () => {
  const after = applySub({ lineup: LINE, libero: LIBERO_OFF, liberoId: null, outId: "setter", inId: "sub7" }).lineup;
  assert.equal(after[1], "sub7");
  // Six rotations later the substitute is back in the slot they inherited.
  let l = after;
  for (let i = 0; i < 6; i++) l = rotate(l);
  assert.deepEqual(l, after);
  // And one rotation moves them exactly where the replaced player would have gone.
  assert.equal(rotate(after)[6], "sub7");
});

t("a substitution is refused when it would corrupt the court", () => {
  const base = { lineup: LINE, libero: LIBERO_OFF, liberoId: "lib" };
  assert.equal(applySub({ ...base, outId: "oh2", inId: "oh2" }).ok, false); // same player
  assert.equal(applySub({ ...base, outId: "oh2", inId: "mb1" }).ok, false); // already on
  assert.equal(applySub({ ...base, outId: "bench7", inId: "sub8" }).ok, false); // not on court
  // Refused swaps return the court untouched.
  assert.deepEqual(applySub({ ...base, outId: "bench7", inId: "sub8" }).lineup, LINE);
});

t("the SUB button never touches the libero — in either direction", () => {
  const on = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  // Libero out via SUB: refused.
  assert.equal(
    applySub({ lineup: on.lineup, libero: on.libero, liberoId: "lib", outId: "lib", inId: "sub7" }).ok,
    false,
  );
  // Libero in via SUB: refused.
  assert.equal(
    applySub({ lineup: LINE, libero: LIBERO_OFF, liberoId: "lib", outId: "oh2", inId: "lib" }).ok,
    false,
  );
});

t("the middle blocker held off court cannot come on somewhere else", () => {
  // They already own the libero's slot; letting them on elsewhere would put the
  // same player on court twice the moment the serve came back.
  const on = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  const r = applySub({ lineup: on.lineup, libero: on.libero, liberoId: "lib", outId: "oh1", inId: "mb2" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.lineup, on.lineup);
  assert.deepEqual(r.libero, on.libero);
});

t("substituting the middle blocker held off court hands over the return", () => {
  const on = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  assert.equal(on.libero.replacedId, "mb2");
  const r = applySub({ lineup: on.lineup, libero: on.libero, liberoId: "lib", outId: "mb2", inId: "sub7" });
  assert.equal(r.ok, true);
  assert.equal(r.libero.replacedId, "sub7"); // sub7 now owns the return
  assert.deepEqual(r.lineup, on.lineup); // nobody on court moved
  // When the serve comes back it is sub7 who walks on, not mb2.
  const off = syncLibero({
    side: "US", serving: "US", liberoId: "lib", lineup: r.lineup, libero: r.libero, isMiddleBlocker: isMB,
  });
  assert.equal(off.lineup[6], "sub7");
});

t("the sheet offers the six on court and a bench without the libero", () => {
  const roster = ["setter", "oh1", "mb1", "opp", "oh2", "mb2", "sub7", "sub8", "lib"];
  const o = subOptions(roster, LINE, "lib", LIBERO_OFF);
  assert.equal(o.onCourt.length, 6);
  assert.deepEqual(o.bench, ["sub7", "sub8"]); // no libero, nobody on court
  assert.equal(o.liberoHeld, null);
  assert.equal(o.onCourt.every((s) => !s.isLibero), true);
});

t("with the libero on, their slot is locked and the held MB is listed apart", () => {
  const roster = ["setter", "oh1", "mb1", "opp", "oh2", "mb2", "sub7", "lib"];
  const on = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  const o = subOptions(roster, on.lineup, "lib", on.libero);
  assert.equal(o.onCourt.find((s) => s.position === 6).isLibero, true);
  assert.equal(o.liberoHeld, "mb2");
  assert.deepEqual(o.bench, ["sub7"]); // mb2 is surfaced separately, not as bench
});

// =====================================================================
qa.suite("Libero auto-swap");

t("receiving puts the libero on court in the back-row MB's slot", () => {
  const r = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  assert.equal(r.lineup[6], "lib");
  assert.equal(r.libero.onCourt, true);
  assert.equal(r.libero.replacedId, "mb2");
  assert.deepEqual(r.event, { change: "IN", inId: "lib", outId: "mb2", position: 6 });
});

t("serving keeps the middle blocker on and the libero off", () => {
  const r = syncLibero({
    side: "US", serving: "US", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  assert.deepEqual(r.lineup, LINE);
  assert.equal(r.event, null);
  assert.equal(positionOf(r.lineup, "lib"), null);
});

t("winning the serve back sends the libero off and the MB on in that slot", () => {
  const on = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  const off = syncLibero({
    side: "US", serving: "US", liberoId: "lib", lineup: on.lineup, libero: on.libero, isMiddleBlocker: isMB,
  });
  assert.deepEqual(off.lineup, LINE); // exactly the court we started from
  assert.equal(off.libero.onCourt, false);
  assert.deepEqual(off.event, { change: "OUT", inId: "mb2", outId: "lib", position: 6 });
});

t("rotate-then-sync returns the MB to the slot the rotation gives them", () => {
  // Receiving: libero holds mb2's slot (P6).
  const on = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  // Side-out: the receiving team wins the serve, so it rotates FIRST.
  const rotated = rotate(on.lineup);
  assert.equal(rotated[5], "lib"); // libero carried P6 → P5
  const off = syncLibero({
    side: "US", serving: "US", liberoId: "lib", lineup: rotated, libero: on.libero, isMiddleBlocker: isMB,
  });
  // mb2 lands in P5 — precisely where rotating the original court puts them.
  assert.equal(off.lineup[5], "mb2");
  assert.deepEqual(off.lineup, rotate(LINE));
});

t("the cycle repeats every change of serve, all set long", () => {
  let lineup = LINE;
  let libero = LIBERO_OFF;
  let serving = "US";
  const seen = [];
  for (let point = 0; point < 8; point++) {
    // Alternate the serve every point — the worst case for the swap.
    serving = serving === "US" ? "OPP" : "US";
    if (serving === "US" && libero.onCourt) lineup = rotate(lineup); // side-out
    const r = syncLibero({ side: "US", serving, liberoId: "lib", lineup, libero, isMiddleBlocker: isMB });
    lineup = r.lineup;
    libero = r.libero;
    seen.push(`${serving}:${libero.onCourt ? "L" : "MB"}`);
    // The invariant: the libero is on court exactly when the side is receiving.
    assert.equal(libero.onCourt, serving === "OPP");
    // And never, ever in the front row.
    if (libero.onCourt) assert.ok([5, 6, 1].includes(positionOf(lineup, "lib")));
  }
  assert.deepEqual(seen.slice(0, 4), ["OPP:L", "US:MB", "OPP:L", "US:MB"]);
});

t("syncing twice changes nothing — it is safe to call after every point", () => {
  const once = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  const twice = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: once.lineup, libero: once.libero, isMiddleBlocker: isMB,
  });
  assert.deepEqual(twice.lineup, once.lineup);
  assert.equal(twice.event, null);
  assert.equal(twice.lineup === once.lineup, true); // same object: no re-render
});

t("a libero holding a slot with nobody owed it converges instead of churning", () => {
  // Corrupt state — unreachable through the app, but the self-healing sync in
  // both trackers relies on repeated syncs settling, so it must not oscillate.
  const lineup = { ...LINE, 6: "lib" };
  const broken = { onCourt: false, replacedId: null };
  const first = syncLibero({
    side: "US", serving: "US", liberoId: "lib", lineup, libero: broken, isMiddleBlocker: isMB,
  });
  assert.equal(first.lineup[6], "lib"); // nobody is invented, no slot is blanked
  assert.equal(first.libero.onCourt, true); // the flag now agrees with the court
  const second = syncLibero({
    side: "US", serving: "US", liberoId: "lib", lineup: first.lineup, libero: first.libero, isMiddleBlocker: isMB,
  });
  assert.equal(second.lineup === first.lineup, true);
  assert.equal(second.libero === first.libero, true); // settled: same objects
});

t("a side with no libero designated is left alone", () => {
  const r = syncLibero({
    side: "US", serving: "OPP", liberoId: null, lineup: LINE, libero: LIBERO_OFF, isMiddleBlocker: isMB,
  });
  assert.deepEqual(r.lineup, LINE);
  assert.equal(r.event, null);
});

t("both sides sync in one call, and only the receiving side moves", () => {
  const r = syncBothLiberos({
    serving: "US",
    usLineup: LINE,
    oppLineup: LINE,
    usLibero: LIBERO_OFF,
    oppLibero: LIBERO_OFF,
    usLiberoId: "usLib",
    oppLiberoId: "oppLib",
    isMiddleBlocker: isMB,
  });
  assert.deepEqual(r.usLineup, LINE); // US serves — MB stays
  assert.equal(r.oppLineup[6], "oppLib"); // OPP receives — libero in
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].side, "OPP");
});

t("syncCourt reads the serve off the match state and rewrites the court", () => {
  const state = {
    rally: { serving: "OPP" },
    usLineup: LINE,
    oppLineup: LINE,
    usLibero: LIBERO_OFF,
    oppLibero: LIBERO_OFF,
    extra: "untouched",
  };
  const r = syncCourt(state, { us: "usLib", opp: "oppLib" }, isMB);
  assert.equal(r.state.usLineup[6], "usLib"); // US receives
  assert.deepEqual(r.state.oppLineup, LINE); // OPP serves
  assert.equal(r.state.extra, "untouched"); // the rest of the state is carried
  assert.equal(r.events.length, 1);
  // Already correct → the SAME object comes back.
  assert.equal(syncCourt(r.state, { us: "usLib", opp: "oppLib" }, isMB).state === r.state, true);
});

// =====================================================================
qa.suite("Sessions saved before this feature");

t("a missing libero state reads as 'on the bench', never as a crash", () => {
  assert.deepEqual(liberoStateFrom(undefined), LIBERO_OFF);
  assert.deepEqual(liberoStateFrom(null), LIBERO_OFF);
  assert.deepEqual(liberoStateFrom("nonsense"), LIBERO_OFF);
  assert.deepEqual(liberoStateFrom({ onCourt: true, replacedId: "mb2" }), {
    onCourt: true,
    replacedId: "mb2",
  });
  assert.deepEqual(liberoStateFrom({ onCourt: "yes" }), LIBERO_OFF);
});

t("missing substitution counters read as zero", () => {
  assert.deepEqual(subCountFrom(undefined), { us: 0, opp: 0 });
  assert.deepEqual(subCountFrom({ us: 3 }), { us: 3, opp: 0 });
});

t("an old session's court is repaired by the first sync", () => {
  // Old model: the libero was never in a lineup, so the first sync walks them on.
  const r = syncLibero({
    side: "US", serving: "OPP", liberoId: "lib", lineup: LINE, libero: liberoStateFrom(undefined), isMiddleBlocker: isMB,
  });
  assert.equal(r.lineup[6], "lib");
  assert.equal(r.libero.onCourt, true);
});

qa.finish();
