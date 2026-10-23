/**
 * Live scoreboard push tests — the scorer's side of `match_live_state`.
 * Run: node --experimental-strip-types src/lib/providers/live-state.test.mjs
 *
 * The Supabase client is real; only its fetch is replaced, so every assertion
 * is about the HTTP request that would actually leave the browser. The runner
 * is synchronous, so each push is awaited at top level before its checks.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createRunner } from "../console-ui.mjs";
import { pushLiveState } from "./live-state.ts";

const qa = createRunner({
  title: "VOLLEYTICS QA AGENT",
  subtitle: "Live Scoreboard Push Verification Suite",
  file: "src/lib/providers/live-state.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

const BOARD = {
  set: 2,
  usScore: 14,
  oppScore: 12,
  usSets: 1,
  oppSets: 0,
  setScores: [{ us: 25, opp: 21 }],
  usLineup: { 1: "a1", 2: "a2", 3: "a3", 4: "a4", 5: "a5", 6: "a6" },
  oppLineup: { 1: "b1", 2: "b2", 3: "b3", 4: "b4", 5: "b5", 6: "b6" },
  rally: { serving: "US" },
};

/** A real client whose network is a recorder answering with `respond()`. */
function recordingClient(respond = () => new Response(null, { status: 201 })) {
  const requests = [];
  const client = createClient("https://qa.supabase.co", "anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init = {}) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        requests.push({
          method: init.method ?? "GET",
          path: url.pathname,
          query: url.searchParams,
          body: init.body ? JSON.parse(init.body) : null,
        });
        return respond();
      },
    },
  });
  return { client, requests };
}

/** Run `fn` with console.warn captured, so expected warnings stay off the report. */
async function withWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    return { result: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

// =====================================================================
qa.suite("Scorer → shared table");

const update = recordingClient();
const updateOk = await pushLiveState("m1", BOARD, update.client);

t("a score update is sent as one request to match_live_state", () => {
  assert.equal(update.requests.length, 1);
  assert.equal(update.requests[0].method, "POST");
  assert.equal(update.requests[0].path, "/rest/v1/match_live_state");
});

t("the update is an upsert keyed on the match, carrying the board", () => {
  const [req] = update.requests;
  assert.equal(req.query.get("on_conflict"), "match_id");
  assert.deepEqual(req.body, { match_id: "m1", state: BOARD });
});

t("a delivered update reports that it reached other devices", () => {
  assert.equal(updateOk, true);
});

const clear = recordingClient(() => new Response(null, { status: 204 }));
const clearOk = await pushLiveState("m1", null, clear.client);

t("clearing the court deletes that match's row only", () => {
  assert.equal(clear.requests.length, 1);
  assert.equal(clear.requests[0].method, "DELETE");
  assert.equal(clear.requests[0].query.get("match_id"), "eq.m1");
  assert.equal(clearOk, true);
});

// =====================================================================
qa.suite("Fast taps land in order");

// Every response is held until released, so a burst of taps piles up behind
// the first request the way it does on a slow courtside connection.
const held = [];
let inFlight = 0;
let maxInFlight = 0;
const burst = recordingClient(() => {
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  return new Promise((release) =>
    held.push(() => {
      inFlight--;
      release(new Response(null, { status: 201 }));
    }),
  );
});
const tap = (usScore) => pushLiveState("m2", { ...BOARD, usScore }, burst.client);
let settled = false;
const taps = Promise.all([tap(15), tap(16), tap(17)]).then((results) => {
  settled = true;
  return results;
});
while (!settled) {
  await new Promise((r) => setTimeout(r, 5));
  held.shift()?.();
}
const tapResults = await taps;

t("only one request per match is in flight at a time", () => {
  assert.equal(maxInFlight, 1);
});

t("the newest score is the last one written", () => {
  const last = burst.requests.at(-1);
  assert.equal(last.body.state.usScore, 17);
});

t("a score superseded while waiting is skipped, not sent late", () => {
  assert.deepEqual(
    burst.requests.map((r) => r.body.state.usScore),
    [15, 17],
  );
  assert.deepEqual(tapResults, [true, true, true]);
});

// =====================================================================
qa.suite("Failure is visible, never thrown");

const refused = recordingClient(
  () =>
    new Response(JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
);
const { result: refusedOk, warnings } = await withWarnings(() =>
  pushLiveState("m1", BOARD, refused.client),
);

t("a write the database refuses resolves false instead of throwing", () => {
  assert.equal(refused.requests.length, 1);
  assert.equal(refusedOk, false);
});

t("the refusal is reported with the database's reason", () => {
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /row-level security/);
});

const localOk = await pushLiveState("m1", BOARD);

t("with Supabase not configured nothing is sent and it resolves false", () => {
  assert.equal(localOk, false);
});

qa.finish();
