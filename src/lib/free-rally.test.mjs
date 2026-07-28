/**
 * Pure free-rally tests. Run: node --experimental-strip-types src/lib/free-rally.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  openRally,
  isServeTap,
  resolveTap,
  resolveFault,
  closeServe,
  FAULT_EVENT,
} from "./free-rally.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Free Rally Engine Verification Suite",
  file: "src/lib/free-rally.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

/** US is serving, no tap logged yet. */
const open = () => openRally("US");
/** US is serving, the serve slot has closed. */
const mid = () => closeServe(openRally("US"));

qa.suite("The Serve Slot");

t("a rally opens with the serve slot available", () => {
  const s = open();
  assert.equal(s.serving, "US");
  assert.equal(s.serveOpen, true);
});

t("the serving side's P1 tapped first is a serve", () => {
  assert.equal(isServeTap(open(), "US", true), true);
});

t("the same player tapped later in the rally is not a serve", () => {
  assert.equal(isServeTap(mid(), "US", true), false);
});

t("a first tap on someone other than P1 is not a serve", () => {
  assert.equal(isServeTap(open(), "US", false), false);
});

t("the receiving side's P1 is never a serve", () => {
  assert.equal(isServeTap(open(), "OPP", true), false);
});

t("closeServe is idempotent and preserves the serving side", () => {
  const once = closeServe(open());
  const twice = closeServe(once);
  assert.equal(twice.serveOpen, false);
  assert.equal(twice.serving, "US");
  assert.equal(twice, once); // already closed → same object back
});

t("closeServe does not mutate the state it was given", () => {
  const s = open();
  closeServe(s);
  assert.equal(s.serveOpen, true);
});

qa.suite("Serve Outcomes");

t("serve + ✓ is an ace, point to the server", () => {
  assert.deepEqual(resolveTap(open(), "US", true, "WIN"), {
    event: "SERVE_ACE",
    pointTo: "US",
  });
});

t("serve + O is a serve in play, rally continues", () => {
  assert.deepEqual(resolveTap(open(), "US", true, "CONT"), {
    event: "SERVE_IN",
    pointTo: null,
  });
});

t("serve + ✗ is a service error, point to the receiver", () => {
  assert.deepEqual(resolveTap(open(), "US", true, "LOSE"), {
    event: "SERVE_ERR",
    pointTo: "OPP",
  });
});

qa.suite("Spike Outcomes");

t("✓ awards the point to the tapped player's own team, both sides", () => {
  assert.deepEqual(resolveTap(mid(), "US", false, "WIN"), {
    event: "SPIKE_POINT",
    pointTo: "US",
  });
  assert.deepEqual(resolveTap(mid(), "OPP", false, "WIN"), {
    event: "SPIKE_POINT",
    pointTo: "OPP",
  });
});

t("✗ awards the point to the other team, both sides", () => {
  assert.deepEqual(resolveTap(mid(), "US", false, "LOSE"), {
    event: "SPIKE_ERR",
    pointTo: "OPP",
  });
  assert.deepEqual(resolveTap(mid(), "OPP", false, "LOSE"), {
    event: "SPIKE_ERR",
    pointTo: "US",
  });
});

t("O keeps the rally alive on both sides", () => {
  assert.deepEqual(resolveTap(mid(), "US", false, "CONT"), {
    event: "SPIKE_IN",
    pointTo: null,
  });
  assert.deepEqual(resolveTap(mid(), "OPP", false, "CONT"), {
    event: "SPIKE_IN",
    pointTo: null,
  });
});

t("the serving P1 tapped after the serve slot closed is a spike", () => {
  assert.deepEqual(resolveTap(mid(), "US", true, "WIN"), {
    event: "SPIKE_POINT",
    pointTo: "US",
  });
});

t("a first tap on the receiving side is a spike, never a serve", () => {
  assert.deepEqual(resolveTap(open(), "OPP", true, "WIN"), {
    event: "SPIKE_POINT",
    pointTo: "OPP",
  });
});

qa.suite("Faults");

t("every fault kind maps to its own event and concedes the point", () => {
  assert.deepEqual(resolveFault("US", "NET"), {
    event: "FAULT_NET",
    pointTo: "OPP",
  });
  assert.deepEqual(resolveFault("US", "FOUR_HITS"), {
    event: "FAULT_FOUR_HITS",
    pointTo: "OPP",
  });
  assert.deepEqual(resolveFault("OPP", "DOUBLE"), {
    event: "FAULT_DOUBLE",
    pointTo: "US",
  });
  assert.deepEqual(resolveFault("OPP", "ROTATION"), {
    event: "FAULT_ROTATION",
    pointTo: "US",
  });
});

t("the four fault kinds produce four distinct event types", () => {
  const events = Object.values(FAULT_EVENT);
  assert.equal(events.length, 4);
  assert.equal(new Set(events).size, 4);
});

t("no fault event is a SPIKE_ event", () => {
  for (const e of Object.values(FAULT_EVENT)) {
    assert.equal(e.startsWith("SPIKE_"), false);
  }
});

qa.suite("Acceptance");

t("the same attacker twice in one rally is two spike attempts", () => {
  const first = resolveTap(mid(), "US", false, "CONT");
  const second = resolveTap(mid(), "US", false, "WIN");
  assert.equal(first.event, "SPIKE_IN");
  assert.equal(first.pointTo, null);
  assert.equal(second.event, "SPIKE_POINT");
  assert.equal(second.pointTo, "US");
});

t("the ball returns to the serving team's court and they win it", () => {
  // US serves and it goes in.
  let state = openRally("US");
  const serve = resolveTap(state, "US", true, "CONT");
  assert.deepEqual(serve, { event: "SERVE_IN", pointTo: null });
  state = closeServe(state);

  // OPP digs and returns it — not tapped. A US player then kills it.
  const kill = resolveTap(state, "US", false, "WIN");
  assert.deepEqual(kill, { event: "SPIKE_POINT", pointTo: "US" });
});

qa.finish();
