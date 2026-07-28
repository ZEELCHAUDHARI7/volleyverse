# Free-Rally Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back the court — toss, both lineups, liberos and automatic rotation — while keeping taps free-form, so the score, serve order and rotation all follow from ✓ / O / ✗ with no manual scoreboard.

**Architecture:** One new pure module, `free-rally.ts`, answers a single question: given the rally state and who was tapped, what event is this and who gets the point. It has no runtime imports, so the Node type-stripping test runner loads it directly. The screen composes that answer with `rotate`, `resolvePoint` and `setPointReached` — all already tested in `rally.ts` — and with `CourtBoard` and `SetupWizard`, extracted from the parked rally tracker so both screens share one court.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, TypeScript 5, Tailwind 4, Recharts 2, PostgreSQL via Supabase, Node 22 test runner with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-07-29-free-rally-tracking-design.md`

## Global Constraints

- Node 22. Run `source ~/.nvm/nvm.sh && nvm use 22` before any `npm test`.
- Never run `npm run build` — a dev server may be running.
- No test framework. Tests are `.test.mjs` using `node:assert/strict` plus `createRunner` from `src/lib/console-ui.mjs`, ending in `qa.finish()`. Reference: `src/lib/rally.test.mjs`.
- **A `.ts` file that a `.test.mjs` imports must have no runtime imports of local modules.** Node's type-stripping does not resolve extensionless TypeScript paths. Type-only imports (`import type { … }`) are erased and therefore fine. `src/lib/rally.ts` and `src/lib/spikes.ts` are the references.
- A fault is never `SPIKE_ERR`. Error rate is `SPIKE_ERR / attempts` and a net touch is not a spike attempt.
- ✓ awards the point to **the tapped player's own team**, on either side of the net. ✗ awards it to the other team.
- A team rotates only when it wins the serve back. `resolvePoint` (`rally.ts:349`) already encodes this — do not reimplement it.
- Chart colours come from CSS custom properties via `theme()`. Never hardcode a hex value.
- Conventional Commits, no `Co-Authored-By` trailer. Confirm `git var GIT_AUTHOR_IDENT` reports `DabhiDhruvraj <dhruvrajsinhdabhi92@gmail.com>` before committing; the global git config is a different identity.
- Do not modify `src/lib/rally.ts`, `src/lib/spikes.ts` or `src/components/spike-charts.tsx`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/types.ts` | **Modify.** Four new `EventType` values for faults. |
| `src/lib/metrics.ts` | **Modify.** Four new `COUNTERS` entries, each incrementing `errors`. |
| `supabase/schema.sql` | **Modify.** Widen the `stat_events` type constraint. |
| `supabase/migrations/2026-07-29-fault-event-types.sql` | **Create.** The same widening as a runnable migration for the live database. |
| `src/lib/spikes.test.mjs` | **Modify.** Prove faults never count as spike attempts. |
| `src/lib/free-rally.ts` | **Create.** Pure tap resolver — serve vs spike, and who gets the point. |
| `src/lib/free-rally.test.mjs` | **Create.** Its tests. |
| `src/components/court-board.tsx` | **Create.** `CourtBoard`, moved out of the rally page. |
| `src/components/court-setup.tsx` | **Create.** `SetupWizard` and its helpers, moved out of the rally page. |
| `src/app/console/matches/[id]/rally/page.tsx` | **Modify.** Delete the moved blocks, import them instead. |
| `src/app/console/matches/[id]/spikes/page.tsx` | **Rewrite.** The live screen. |
| `src/lib/spike-session.ts`, `src/lib/spike-session.test.mjs` | **Delete.** The manual scoreboard they served is gone. |
| `package.json` | **Modify.** Swap `spike-session.test.mjs` for `free-rally.test.mjs` in the test chain. |

---

### Task 1: Fault event types and the migration

Faults need their own event types so a net touch can never inflate a spike error rate.

**Files:**
- Modify: `src/lib/types.ts:229-253`
- Modify: `src/lib/metrics.ts:75`
- Modify: `supabase/schema.sql:197-205`
- Create: `supabase/migrations/2026-07-29-fault-event-types.sql`
- Modify: `src/lib/spikes.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: four `EventType` values — `FAULT_NET`, `FAULT_FOUR_HITS`, `FAULT_DOUBLE`, `FAULT_ROTATION`.

- [ ] **Step 1: Write the failing test**

In `src/lib/spikes.test.mjs`, add this case to the `Spike Tallies` suite, directly after the test named `non-spike events never count`:

```js
t("faults are not spike attempts", () => {
  const line = spikeLine("A", [
    ev("A", "FAULT_NET"),
    ev("A", "FAULT_FOUR_HITS"),
    ev("A", "FAULT_DOUBLE"),
    ev("A", "FAULT_ROTATION"),
    ev("A", "SPIKE_ERR"),
  ]);
  assert.equal(line.attempts, 1);
  assert.equal(line.failed, 1);
  assert.equal(line.errorRate, 100);
});
```

- [ ] **Step 2: Run it and confirm it passes for the wrong reason**

```bash
source ~/.nvm/nvm.sh && nvm use 22
node --experimental-strip-types src/lib/spikes.test.mjs
```

Expected: PASS. `spikeLine` counts only the three `SPIKE_*` strings, so unknown strings are already ignored. The test is a regression guard, not a red-to-green cycle — it locks the behaviour in before the new types exist, so a later change that widens the spike branch gets caught.

- [ ] **Step 3: Add the four event types**

In `src/lib/types.ts`, extend the `EventType` union. Add this block immediately after the `// Defence` group, before the closing `;`:

```ts
  // Faults — points conceded with no serve or spike behind them.
  // Deliberately NOT SPIKE_ERR: error rate is SPIKE_ERR / spike attempts,
  // and a net touch is not a spike attempt.
  | "FAULT_NET" // touched the net
  | "FAULT_FOUR_HITS" // four contacts on one side
  | "FAULT_DOUBLE" // double contact / lift
  | "FAULT_ROTATION"; // out of rotation at service
```

The existing `| "DIG_FAIL"; // ball hits the floor` becomes `| "DIG_FAIL" // ball hits the floor` — move the semicolon to the end of the new block.

- [ ] **Step 4: Run the typecheck and watch it fail**

```bash
npx tsc --noEmit
```

Expected: FAIL. `COUNTERS` at `src/lib/metrics.ts:75` is a `Record<EventType, …>`, so it now has four missing keys. This is the compiler enforcing that every event type is accounted for.

- [ ] **Step 5: Handle the new types in metrics**

In `src/lib/metrics.ts`, add these four entries to the `COUNTERS` object, after the `DIG_FAIL` entry:

```ts
  // Faults cost the team a point but belong to no skill line — they count
  // as errors and nothing else, so spike and serve percentages stay clean.
  FAULT_NET: (l) => {
    l.errors++;
  },
  FAULT_FOUR_HITS: (l) => {
    l.errors++;
  },
  FAULT_DOUBLE: (l) => {
    l.errors++;
  },
  FAULT_ROTATION: (l) => {
    l.errors++;
  },
```

- [ ] **Step 6: Typecheck and run the suite**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors; four test files pass.

- [ ] **Step 7: Widen the schema**

In `supabase/schema.sql`, replace the `check (type in (…))` list on `stat_events` with:

```sql
  type text not null check (type in (
    'SPIKE_POINT','SPIKE_IN','SPIKE_ERR',
    'RECV_PERFECT','RECV_GOOD','RECV_POOR','RECV_ERR',
    'SET_ASSIST','SET_GOOD','SET_ERR',
    'BLOCK_WIN','BLOCK_MISS',
    'SERVE_ACE','SERVE_IN','SERVE_ERR',
    'DIG_SUPER','DIG_SAVE','DIG_FAIL',
    'FAULT_NET','FAULT_FOUR_HITS','FAULT_DOUBLE','FAULT_ROTATION'
  )),
```

- [ ] **Step 8: Write the migration for the live database**

Create `supabase/migrations/2026-07-29-fault-event-types.sql`:

```sql
-- Fault event types (FAULT_NET, FAULT_FOUR_HITS, FAULT_DOUBLE, FAULT_ROTATION).
--
-- RUN THIS BEFORE DEPLOYING the free-rally tracker. SupabaseStoreProvider
-- updates local state optimistically and enqueues the insert, so a row the
-- CHECK constraint rejects fails inside the queue: the screen shows the point
-- landing while the database refuses it. There is no visible error.
--
-- The constraint is unnamed in schema.sql, so PostgreSQL generated the name.
-- Confirm it first:
--
--   select conname from pg_constraint
--   where conrelid = 'stat_events'::regclass and contype = 'c';
--
-- Substitute the name below if it differs.

alter table stat_events drop constraint stat_events_type_check;

alter table stat_events add constraint stat_events_type_check
  check (type in (
    'SPIKE_POINT','SPIKE_IN','SPIKE_ERR',
    'RECV_PERFECT','RECV_GOOD','RECV_POOR','RECV_ERR',
    'SET_ASSIST','SET_GOOD','SET_ERR',
    'BLOCK_WIN','BLOCK_MISS',
    'SERVE_ACE','SERVE_IN','SERVE_ERR',
    'DIG_SUPER','DIG_SAVE','DIG_FAIL',
    'FAULT_NET','FAULT_FOUR_HITS','FAULT_DOUBLE','FAULT_ROTATION'
  ));
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/lib/metrics.ts src/lib/spikes.test.mjs supabase/schema.sql supabase/migrations/2026-07-29-fault-event-types.sql
git commit -m "feat(events): fault event types for points no spike decided

A net touch, four hits, a double contact or a rotation fault ends a rally
with nobody having spiked or served. Recording those as SPIKE_ERR would
inflate the error rate the product is defined by, so they get four types
of their own and count only toward errors.

stat_events has a CHECK constraint listing every valid type, so this
needs a migration before deploy — the Supabase provider queues writes and
a rejected insert fails silently."
```

---

### Task 2: The free-rally engine

One pure module deciding what a tap means. No runtime imports, so the Node test runner loads it directly.

**Files:**
- Create: `src/lib/free-rally.ts`
- Create: `src/lib/free-rally.test.mjs`
- Modify: `package.json:9`

**Interfaces:**
- Consumes: `EventType` from `src/lib/types.ts` and `Side` from `src/lib/rally.ts`, both type-only. `Side` is `"US" | "OPP"`.
- Produces:
  - `type Outcome = "WIN" | "CONT" | "LOSE"`
  - `type FaultKind = "NET" | "FOUR_HITS" | "DOUBLE" | "ROTATION"`
  - `const FAULT_EVENT: Record<FaultKind, EventType>`
  - `interface FreeRallyState { serving: Side; serveOpen: boolean }`
  - `interface TapResolution { event: EventType; pointTo: Side | null }`
  - `interface FaultResolution { event: EventType; pointTo: Side }` — narrower than `TapResolution` on purpose: a fault always ends the rally, so callers need no null check
  - `openRally(serving: Side): FreeRallyState`
  - `isServeTap(state: FreeRallyState, tappedSide: Side, isServer: boolean): boolean`
  - `resolveTap(state: FreeRallyState, tappedSide: Side, isServer: boolean, outcome: Outcome): TapResolution`
  - `resolveFault(tappedSide: Side, kind: FaultKind): FaultResolution`
  - `closeServe(state: FreeRallyState): FreeRallyState`

- [ ] **Step 1: Write the failing test**

Create `src/lib/free-rally.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
node --experimental-strip-types src/lib/free-rally.test.mjs
```

Expected: FAIL — `Cannot find module .../src/lib/free-rally.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/free-rally.ts`:

```ts
import type { EventType } from "./types";
import type { Side } from "./rally";

/**
 * FREE RALLY — what a tap means when there is no phase model.
 *
 * The rally tracker infers the action from a fixed serve → receive → set →
 * attack sequence, which real rallies do not follow: a team may send the ball
 * back on one touch, and the same attacker can spike twice in one rally. This
 * engine drops the sequence and keeps exactly one inference, the only one that
 * is always safe:
 *
 *   rotation decides who serves, so the serving side's P1 is known. A tap on
 *   that player, before anything else in the rally, is a serve. Everything
 *   else is a spike.
 *
 * Scoring is not decided here — this returns which side won the point, and the
 * screen applies it with resolvePoint and rotate from rally.ts.
 *
 * Pure: no React, no storage, no DOM, and no runtime imports at all, so the
 * Node type-stripping test runner loads this file without resolving anything
 * else. Both imports above are type-only and are erased.
 */

/** The three buttons. WIN = ✓, CONT = O, LOSE = ✗. */
export type Outcome = "WIN" | "CONT" | "LOSE";

/** Faults a scorer can attribute — a point conceded with no serve or spike. */
export type FaultKind = "NET" | "FOUR_HITS" | "DOUBLE" | "ROTATION";

export const FAULT_EVENT: Record<FaultKind, EventType> = {
  NET: "FAULT_NET",
  FOUR_HITS: "FAULT_FOUR_HITS",
  DOUBLE: "FAULT_DOUBLE",
  ROTATION: "FAULT_ROTATION",
};

export interface FreeRallyState {
  serving: Side;
  /** True until the first tap of this rally; while true, serving P1 = serve. */
  serveOpen: boolean;
}

export interface TapResolution {
  event: EventType;
  /** Side that won the point. null = the rally continues. */
  pointTo: Side | null;
}

/** Narrower than TapResolution: a fault always ends the rally. */
export interface FaultResolution {
  event: EventType;
  pointTo: Side;
}

/**
 * Local rather than imported from rally.ts: a runtime import would make the
 * type-stripping test runner resolve an extensionless path, which it cannot do.
 */
const other = (side: Side): Side => (side === "US" ? "OPP" : "US");

export function openRally(serving: Side): FreeRallyState {
  return { serving, serveOpen: true };
}

/** A serve is the serving side's P1, tapped before anything else this rally. */
export function isServeTap(
  state: FreeRallyState,
  tappedSide: Side,
  isServer: boolean,
): boolean {
  return state.serveOpen && isServer && tappedSide === state.serving;
}

export function resolveTap(
  state: FreeRallyState,
  tappedSide: Side,
  isServer: boolean,
  outcome: Outcome,
): TapResolution {
  if (isServeTap(state, tappedSide, isServer)) {
    if (outcome === "WIN") return { event: "SERVE_ACE", pointTo: tappedSide };
    if (outcome === "LOSE") return { event: "SERVE_ERR", pointTo: other(tappedSide) };
    return { event: "SERVE_IN", pointTo: null };
  }
  // ✓ always awards to the tapped player's own team, whichever side of the net
  // they are on — that is what makes a return rally work with no special case.
  if (outcome === "WIN") return { event: "SPIKE_POINT", pointTo: tappedSide };
  if (outcome === "LOSE") return { event: "SPIKE_ERR", pointTo: other(tappedSide) };
  return { event: "SPIKE_IN", pointTo: null };
}

/** A fault always ends the rally against the player who committed it. */
export function resolveFault(tappedSide: Side, kind: FaultKind): FaultResolution {
  return { event: FAULT_EVENT[kind], pointTo: other(tappedSide) };
}

/** After any tap the serve slot closes for the rest of the rally. */
export function closeServe(state: FreeRallyState): FreeRallyState {
  return state.serveOpen ? { ...state, serveOpen: false } : state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --experimental-strip-types src/lib/free-rally.test.mjs
```

Expected: PASS, 19 checks across 5 suites.

- [ ] **Step 5: Swap the test chain entry**

In `package.json` line 9, replace `src/lib/spike-session.test.mjs` with `src/lib/free-rally.test.mjs`, leaving the other three files and their order untouched. `spike-session.ts` is deleted in Task 4; removing it from the chain now keeps every commit green.

- [ ] **Step 6: Run everything**

```bash
npm test && npx tsc --noEmit
```

Expected: four test files pass; no type errors. `spike-session.test.mjs` still exists on disk but is no longer in the chain — that is intentional and Task 4 deletes it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/free-rally.ts src/lib/free-rally.test.mjs package.json
git commit -m "feat(rally): free-form tap resolution without a phase model

Rotation already tells the app who serves, so the serving side's P1 tapped
before anything else in a rally is a serve and everything else is a spike.
That is the only inference needed — no serve/receive/set/attack sequence,
so a team can send the ball back on one touch and the same attacker can
spike twice in one rally.

The module has no runtime imports so the type-stripping test runner loads
it directly; that is why other() is local rather than imported."
```

---

### Task 3: Extract the court and the setup wizard

`CourtBoard` and `SetupWizard` are private to the rally page. Both screens need them. This is a move, not a rewrite — the parked rally tracker must behave identically afterwards.

**Files:**
- Create: `src/components/court-board.tsx`
- Create: `src/components/court-setup.tsx`
- Modify: `src/app/console/matches/[id]/rally/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `court-board.tsx` exports `interface CourtPlayer { id: string; name: string; jersey?: number; side: Side }` and `CourtBoard` with its existing props unchanged: `{ homeName, awayName, usLineup, oppLineup, players, serving, highlightId?, armedId?, tappableIds?, onTap?, liberos? }`.
  - `court-setup.tsx` exports `SetupWizard` with props `{ match, homeTeam, awayTeam, homeRoster, awayRoster, store, onReady }` where `onReady: (setup: { us: TeamSetup; opp: TeamSetup; toss: Toss }) => void`.

- [ ] **Step 1: Move CourtBoard**

Create `src/components/court-board.tsx`. Start it with `"use client";`, then move these blocks out of `src/app/console/matches/[id]/rally/page.tsx` **verbatim**:

- lines 63-69 — the `CourtPlayer` interface. Add `export` to it.
- lines 563-567 — `OPP_ROWS` and `US_ROWS`.
- lines 569-713 — the whole `CourtBoard` function. Add `export` to it.

Give the new file these imports:

```tsx
import { BACK_ROW, FRONT_ROW, type Lineup, type Position, type Side } from "@/lib/rally";
```

Add this docblock above `CourtPlayer`:

```tsx
/**
 * THE COURT — both teams, net between them, tap to act.
 *
 * Shared by the rally tracker and the free-rally tracker. `tappableIds`
 * decides what may be touched: undefined for a read-only preview, null for an
 * open rally where every on-court player is live, or a Set to restrict it.
 */
```

- [ ] **Step 2: Move the setup wizard**

Create `src/components/court-setup.tsx`, starting with `"use client";`. Move these blocks out of the rally page verbatim:

- line 180 — the `WizardStep` type
- lines 182-185 — the `SixState` interface
- lines 187-386 — `SetupWizard`. Add `export` to it.
- lines 388-487 — `SixPicker`
- lines 489-498 — `StepTitle`
- lines 500-515 — `MiniSlot`
- lines 517-561 — `WizardNext`

Give the new file these imports:

```tsx
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Match, Player, Team } from "@/lib/types";
import type { useStore } from "@/lib/store";
import {
  POSITIONS,
  type Lineup,
  type Position,
  type Side,
  type TeamSetup,
  type Toss,
  servingFromToss,
} from "@/lib/rally";
import { PositionTag } from "@/components/ui";
import { CourtBoard, type CourtPlayer } from "@/components/court-board";
```

- [ ] **Step 3: Change the wizard's completion callback**

`SetupWizard` currently ends by building the old screen's state itself, which binds it to one caller. In `court-setup.tsx`, change the prop from `onStart` to `onReady` and have it hand back the raw setup.

Change the prop type in the `SetupWizard` signature from:

```tsx
  onStart: (m: MatchState) => void;
```

to:

```tsx
  onReady: (setup: { us: TeamSetup; opp: TeamSetup; toss: Toss }) => void;
```

and rename the destructured `onStart` parameter to `onReady`. Then change the last line of the `start` function from:

```tsx
    onStart(initialMatchState(us, opp, toss));
```

to:

```tsx
    onReady({ us, opp, toss });
```

Remove `MatchState` and `initialMatchState` from that file's imports — they are no longer referenced there.

- [ ] **Step 4: Rewire the rally page**

In `src/app/console/matches/[id]/rally/page.tsx`, delete every block listed in Steps 1 and 2, then add:

```tsx
import { CourtBoard, type CourtPlayer } from "@/components/court-board";
import { SetupWizard } from "@/components/court-setup";
```

Update its `SetupWizard` usage so behaviour is unchanged — replace `onStart={persist}` with:

```tsx
        onReady={({ us, opp, toss }) => persist(initialMatchState(us, opp, toss))}
```

Then remove any import in that file that is now unused. After the move it no longer references `POSITIONS`, `PositionTag`, or `Link` at the top level unless the live screen still uses them — let `npx tsc --noEmit` and the editor tell you which, and delete exactly those.

- [ ] **Step 5: Typecheck and test**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors; four test files pass.

- [ ] **Step 6: Verify the rally tracker still works**

This task must change nothing a user can see. With the dev server running, open `/console/matches/<id>/rally` directly by URL and confirm: the toss step, both starting-six pickers with the libero option, the court preview, and that starting the match lands on the live phase screen exactly as before. A visual difference here means the move was not verbatim.

- [ ] **Step 7: Commit**

```bash
git add src/components/court-board.tsx src/components/court-setup.tsx "src/app/console/matches/[id]/rally/page.tsx"
git commit -m "refactor(court): extract CourtBoard and SetupWizard into components

Both trackers need the same court and the same toss-and-lineup flow.
Copying would leave two courts to fix whenever one changes.

SetupWizard used to build the rally tracker's own state object, which tied
it to one caller; it now hands back { us, opp, toss } and each screen
builds what it needs. No behaviour changes."
```

---

### Task 4: The free-rally live screen

**Files:**
- Rewrite: `src/app/console/matches/[id]/spikes/page.tsx`
- Delete: `src/lib/spike-session.ts`, `src/lib/spike-session.test.mjs`

**Interfaces:**
- Consumes: everything produced by Tasks 1-3, plus from `src/lib/rally.ts` — `rotate(lineup)`, `serverId(lineup)`, `resolvePoint(serving, winner) → { nextServing, rotateWinner }`, `setPointReached(us, opp, target?)`, `isDecidingSet(set, totalSets)`, `firstServerForSet(set, totalSets, toss, decidingToss)`; from `src/lib/store.tsx` — `useMatch`, `useStore`; and `SpikeChartGrid` from `src/components/spike-charts.tsx`.
- Produces: the route `/console/matches/[id]/spikes`.

- [ ] **Step 1: Write the screen**

Replace the entire contents of `src/app/console/matches/[id]/spikes/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import { CourtBoard, type CourtPlayer } from "@/components/court-board";
import { SetupWizard } from "@/components/court-setup";
import { SpikeChartGrid } from "@/components/spike-charts";
import { Button, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import {
  type Lineup,
  type Side,
  type TeamSetup,
  type Toss,
  firstServerForSet,
  resolvePoint,
  rotate,
  serverId,
  servingFromToss,
  setPointReached,
  isDecidingSet,
} from "@/lib/rally";
import {
  type FaultKind,
  type FreeRallyState,
  type Outcome,
  closeServe,
  openRally,
  resolveFault,
  resolveTap,
} from "@/lib/free-rally";
import type { Player } from "@/lib/types";

/**
 * FREE-RALLY TRACKER — the court, without the fixed touch sequence.
 *
 * Tap whoever touched the ball, in any order, as many times as it happened.
 * The only thing the app infers is the serve, and it does that from rotation:
 * the serving side's P1 tapped before anything else in a rally is a serve.
 *
 * Score, serve order and rotation all follow from ✓ and ✗ — there is no
 * manual scoreboard, because every rally-ending event has a tap behind it.
 */

const STATE_KEY = (matchId: string) => `volleyverse:free:${matchId}`;

interface Snapshot {
  usScore: number;
  oppScore: number;
  serving: Side;
  usLineup: Lineup;
  oppLineup: Lineup;
  eventIds: string[];
}

interface FreeMatchState {
  setup: { us: TeamSetup; opp: TeamSetup };
  toss: Toss;
  /** FIVB 6.3.2/7.1 — the deciding set takes a fresh toss. null until taken. */
  decidingToss: Toss | null;
  set: number;
  usScore: number;
  oppScore: number;
  usSets: number;
  oppSets: number;
  usLineup: Lineup;
  oppLineup: Lineup;
  setScores: { us: number; opp: number }[];
  rally: FreeRallyState;
  /** Event ids logged in the rally in progress — tap-level undo. */
  current: string[];
  /** Completed rallies this set, newest last — rally-level undo. */
  history: Snapshot[];
}

function initialState(us: TeamSetup, opp: TeamSetup, toss: Toss): FreeMatchState {
  return {
    setup: { us, opp },
    toss,
    decidingToss: null,
    set: 1,
    usScore: 0,
    oppScore: 0,
    usSets: 0,
    oppSets: 0,
    usLineup: us.lineup,
    oppLineup: opp.lineup,
    setScores: [],
    rally: openRally(servingFromToss(toss)),
    current: [],
    history: [],
  };
}

const OUTCOMES: { outcome: Outcome; glyph: string; label: string; cls: string }[] = [
  {
    outcome: "WIN",
    glyph: "✓",
    label: "Point won",
    cls: "border-ok/40 bg-ok/10 text-ok hover:border-ok",
  },
  {
    outcome: "CONT",
    glyph: "O",
    label: "Rally continues",
    cls: "border-azure/40 bg-azure/10 text-azure hover:border-azure",
  },
  {
    outcome: "LOSE",
    glyph: "✗",
    label: "Failed",
    cls: "border-err/40 bg-err/10 text-err hover:border-err",
  },
];

const FAULTS: { kind: FaultKind; label: string }[] = [
  { kind: "NET", label: "Net touch" },
  { kind: "FOUR_HITS", label: "Four hits" },
  { kind: "DOUBLE", label: "Double" },
  { kind: "ROTATION", label: "Rotation" },
];

export default function FreeRallyTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } = useMatch(id);
  const store = useStore();

  const [state, setState] = useState<FreeMatchState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [armed, setArmed] = useState<{ player: Player; side: Side } | null>(null);
  const [faulting, setFaulting] = useState(false);

  // Resume mid-match after a reload. Keyed on the route id, not the match
  // object — useMatch returns a fresh object on every db change, so keying on
  // it would re-read storage after each logged event and fight its own writes.
  useEffect(() => {
    if (!store.ready) return;
    try {
      const raw = window.localStorage.getItem(STATE_KEY(id));
      if (raw) {
        const parsed = JSON.parse(raw) as FreeMatchState;
        if (parsed.usLineup && parsed.oppLineup && parsed.rally) setState(parsed);
      }
    } catch {
      // corrupted payload — fall back to the setup wizard
    }
    setLoaded(true); // unconditional, so a missing match reaches its empty state
  }, [store.ready, id]);

  const persist = useCallback(
    (next: FreeMatchState) => {
      setState(next);
      try {
        window.localStorage.setItem(STATE_KEY(id), JSON.stringify(next));
      } catch {
        // storage unavailable — state stays in memory for this session
      }
    },
    [id],
  );

  const players = useMemo(() => {
    const map = new Map<string, CourtPlayer>();
    for (const p of homeRoster)
      map.set(p.id, {
        id: p.id,
        name: p.fullName.split(" ")[0],
        jersey: p.jerseyNo ?? undefined,
        side: "US",
      });
    for (const p of awayRoster)
      map.set(p.id, {
        id: p.id,
        name: p.fullName.split(" ")[0],
        jersey: p.jerseyNo ?? undefined,
        side: "OPP",
      });
    return map;
  }, [homeRoster, awayRoster]);

  const byId = useMemo(
    () => new Map([...homeRoster, ...awayRoster].map((p) => [p.id, p])),
    [homeRoster, awayRoster],
  );

  if (!store.ready || !loaded) return <PageSkeleton />;

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="Match not found"
          hint="It may have been deleted, or the link is out of date."
          action={<LinkButton href="/console">Back to console</LinkButton>}
        />
      </div>
    );
  }

  if (!state) {
    return (
      <SetupWizard
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        store={store}
        onReady={({ us, opp, toss }) => persist(initialState(us, opp, toss))}
      />
    );
  }

  const teamIdFor = (side: Side) => (side === "US" ? homeTeam.id : awayTeam.id);
  const currentServerId = serverId(
    state.rally.serving === "US" ? state.usLineup : state.oppLineup,
  );

  /** Apply a point: score, serve, rotation — all from resolvePoint. */
  const applyPoint = (s: FreeMatchState, winner: Side, eventIds: string[]): FreeMatchState => {
    const snapshot: Snapshot = {
      usScore: s.usScore,
      oppScore: s.oppScore,
      serving: s.rally.serving,
      usLineup: s.usLineup,
      oppLineup: s.oppLineup,
      eventIds,
    };
    const { nextServing, rotateWinner } = resolvePoint(s.rally.serving, winner);
    const usLineup = rotateWinner && winner === "US" ? rotate(s.usLineup) : s.usLineup;
    const oppLineup = rotateWinner && winner === "OPP" ? rotate(s.oppLineup) : s.oppLineup;
    return {
      ...s,
      usScore: winner === "US" ? s.usScore + 1 : s.usScore,
      oppScore: winner === "OPP" ? s.oppScore + 1 : s.oppScore,
      usLineup,
      oppLineup,
      rally: openRally(nextServing),
      current: [],
      history: [...s.history, snapshot],
    };
  };

  const onOutcome = (outcome: Outcome) => {
    if (!armed) return;
    const { player, side } = armed;
    const isServer = player.id === currentServerId;
    const res = resolveTap(state.rally, side, isServer, outcome);
    const e = store.addEvent(match.id, teamIdFor(side), player.id, state.set, res.event);
    const ids = [...state.current, e.id];

    persist(
      res.pointTo
        ? applyPoint(state, res.pointTo, ids)
        : { ...state, rally: closeServe(state.rally), current: ids },
    );
    setArmed(null);
    setFaulting(false);
  };

  const onFault = (kind: FaultKind) => {
    if (!armed) return;
    const { player, side } = armed;
    const res = resolveFault(side, kind);
    const e = store.addEvent(match.id, teamIdFor(side), player.id, state.set, res.event);
    persist(applyPoint(state, res.pointTo as Side, [...state.current, e.id]));
    setArmed(null);
    setFaulting(false);
  };

  /** Undo the last tap in the rally in progress, else the last whole rally. */
  const onUndo = () => {
    if (state.current.length > 0) {
      const ids = [...state.current];
      const last = ids.pop()!;
      store.removeEvent(last);
      persist({
        ...state,
        current: ids,
        rally: ids.length === 0 ? openRally(state.rally.serving) : state.rally,
      });
      setArmed(null);
      return;
    }
    const prev = state.history[state.history.length - 1];
    if (!prev) return;
    for (const eid of prev.eventIds) store.removeEvent(eid);
    persist({
      ...state,
      usScore: prev.usScore,
      oppScore: prev.oppScore,
      usLineup: prev.usLineup,
      oppLineup: prev.oppLineup,
      // Back to the START of that rally, so the serve slot reopens — its taps
      // were just deleted, and the first of them may have been the serve.
      rally: openRally(prev.serving),
      current: [],
      history: state.history.slice(0, -1),
    });
    setArmed(null);
  };

  /** Bank the set once it is won and move to the next. */
  const onBankSet = () => {
    store.recordSetScore(match.id, {
      setNo: state.set,
      homePoints: state.usScore,
      awayPoints: state.oppScore,
    });
    const usSets = state.usScore > state.oppScore ? state.usSets + 1 : state.usSets;
    const oppSets = state.oppScore > state.usScore ? state.oppSets + 1 : state.oppSets;
    const nextSet = state.set + 1;
    // First service alternates by set, and the deciding set takes a fresh toss.
    // firstServerForSet returns null in that case rather than guessing; the
    // render below then blocks play until the toss is entered.
    const nextServer = firstServerForSet(
      nextSet,
      match.totalSets,
      state.toss,
      state.decidingToss,
    );
    persist({
      ...state,
      set: nextSet,
      usScore: 0,
      oppScore: 0,
      usSets,
      oppSets,
      setScores: [...state.setScores, { us: state.usScore, opp: state.oppScore }],
      usLineup: state.setup.us.lineup,
      oppLineup: state.setup.opp.lineup,
      rally: openRally(nextServer ?? state.rally.serving),
      current: [],
      history: [],
    });
  };

  const target = isDecidingSet(state.set, match.totalSets) ? 15 : 25;
  const setOver = setPointReached(state.usScore, state.oppScore, target);
  const allPlayers = [...homeRoster, ...awayRoster];

  // FIVB 6.3.2/7.1: the deciding set needs its own toss. Play is blocked until
  // it is entered rather than silently carrying the previous set's server over.
  if (isDecidingSet(state.set, match.totalSets) && state.decidingToss === null) {
    const choose = (winner: Side, choice: Toss["choice"]) => {
      const toss: Toss = { winner, choice };
      persist({
        ...state,
        decidingToss: toss,
        rally: openRally(servingFromToss(toss)),
      });
    };
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
          Set {state.set} · deciding set
        </p>
        <h1 className="stat-display text-2xl font-extrabold uppercase tracking-wide text-ink">
          New toss
        </h1>
        <p className="text-sm text-dim">
          The deciding set takes a fresh toss. Who won it, and what did they take?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => choose("US", "SERVE")}>{homeTeam.shortName} · serve</Button>
          <Button onClick={() => choose("US", "RECEIVE")}>{homeTeam.shortName} · receive</Button>
          <Button onClick={() => choose("OPP", "SERVE")}>{awayTeam.shortName} · serve</Button>
          <Button onClick={() => choose("OPP", "RECEIVE")}>{awayTeam.shortName} · receive</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-4">
      <header className="card-premium rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right">
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {homeTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-accent">
              {state.usScore}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.25em] text-dim">
              Set {state.set}
            </p>
            <p className="tnum text-xs text-dim">
              {state.usSets}–{state.oppSets}
            </p>
          </div>
          <div>
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {awayTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-azure">
              {state.oppScore}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-line/60 pt-3">
          <Button
            variant="ghost"
            onClick={onUndo}
            disabled={state.current.length === 0 && state.history.length === 0}
          >
            ↶ Undo
          </Button>
          {setOver && <Button onClick={onBankSet}>Bank set {state.set}</Button>}
          <LinkButton href="/console" variant="ghost">
            Console
          </LinkButton>
        </div>
      </header>

      <CourtBoard
        homeName={homeTeam.name}
        awayName={awayTeam.name}
        usLineup={state.usLineup}
        oppLineup={state.oppLineup}
        players={players}
        serving={state.rally.serving}
        armedId={armed?.player.id ?? null}
        tappableIds={null}
        onTap={(playerId, side) => {
          const p = byId.get(playerId);
          if (!p) return;
          if (armed?.player.id === playerId) {
            setArmed(null);
            setFaulting(false);
            return;
          }
          setArmed({ player: p, side });
          setFaulting(false);
        }}
        liberos={[
          ...(state.setup.us.liberoId
            ? [{ side: "US" as Side, playerId: state.setup.us.liberoId, enabled: true }]
            : []),
          ...(state.setup.opp.liberoId
            ? [{ side: "OPP" as Side, playerId: state.setup.opp.liberoId, enabled: true }]
            : []),
        ]}
      />

      {armed && (
        <div className="card-premium sticky bottom-2 z-10 rounded-2xl border-accent/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="stat-display text-lg font-extrabold uppercase text-ink">
              {armed.player.jerseyNo !== null ? `#${armed.player.jerseyNo} ` : ""}
              {armed.player.fullName}
              {armed.player.id === currentServerId && state.rally.serveOpen && (
                <span className="ml-2 text-xs font-bold uppercase tracking-wider text-accent">
                  serving
                </span>
              )}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setArmed(null);
                setFaulting(false);
              }}
            >
              Cancel
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.outcome}
                type="button"
                onClick={() => onOutcome(o.outcome)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border transition-all duration-200 ${o.cls}`}
              >
                <span className="stat-display text-3xl font-extrabold">{o.glyph}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {o.label}
                </span>
              </button>
            ))}
          </div>

          {faulting ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FAULTS.map((f) => (
                <button
                  key={f.kind}
                  type="button"
                  onClick={() => onFault(f.kind)}
                  className="min-h-12 rounded-xl border border-violet/40 bg-violet/10 text-xs font-bold uppercase tracking-wider text-violet"
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFaulting(true)}
              className="mt-2 min-h-10 w-full rounded-xl border border-line text-[11px] font-bold uppercase tracking-wider text-dim hover:border-violet/40 hover:text-violet"
            >
              ⚠ Fault — point to the other team
            </button>
          )}
        </div>
      )}

      <SpikeChartGrid
        players={allPlayers}
        events={events}
        homeTeamId={homeTeam.id}
        homeLabel={homeTeam.name}
        awayLabel={awayTeam.name}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the manual scoreboard module**

```bash
git rm src/lib/spike-session.ts src/lib/spike-session.test.mjs
```

Its only job was the manual scoreboard and its undo stack. The score is derived from play now, and `package.json` stopped referencing its tests in Task 2.

- [ ] **Step 3: Typecheck and test**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors; four test files pass (`rally`, `auth-routes`, `spikes`, `free-rally`).

- [ ] **Step 4: Verify by hand**

There is no React component test framework in this repo and this task must not add one. Start the dev server (`source ~/.nvm/nvm.sh && nvm use 22 && npm run dev`) and confirm each of these on `/console/matches/<id>/spikes`:

1. The setup wizard runs: toss, home six, home libero, away six, away libero.
2. The court appears with both teams, and P1 of the side that won the serve is marked "· serve".
3. Tapping any on-court player arms them; tapping them again cancels.
4. Tap the marked server → **O**. The score does not change and the rally stays open.
5. Tap a player on the *serving* team → **✓**. That team's score goes up by one, and because they were already serving they do **not** rotate — the same player is still marked as server.
6. Tap a player on the *receiving* team → **✓**. Their score goes up, they take the serve, and their lineup rotates so a new player is marked as server.
7. Tap the server → **✗** on a fresh rally. The other team scores — a service error.
8. Arm a player → **⚠ Fault** → **Net touch**. The other team scores, and that player's spike attempts in the charts are unchanged.
9. **↶ Undo** removes the last tap; pressing it again after a completed rally restores the previous score, serve and lineups.
10. Scroll down: the four charts reflect only spikes. An ace moved the score but added no spike attempt.
11. Reload mid-match — score, set, lineups and serve all survive.
12. Win a set and press **Bank set**. The next set starts 0–0 with the lineups reset to the starting six, and first service alternates — the team that did *not* serve first in set 1 serves first in set 2.
13. Reach the deciding set (set 5 of 5, or set 3 of 3). Play is blocked by a new-toss prompt; picking a winner and their choice starts the set with the right server. This is FIVB 6.3.2/7.1 and the reason `firstServerForSet` returns `null` rather than guessing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(rally): free-rally live screen with automatic scoring

The court is back — toss, both lineups, liberos and rotation — but taps
are free-form: tap whoever touched the ball, in any order. The score,
serve order and rotation all follow from ✓ and ✗ through resolvePoint, so
there is no manual scoreboard.

Deletes spike-session.ts, whose only job was the manual +1 scoreboard."
```

---

## Verification of the whole feature

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test          # four files, all green
npx tsc --noEmit  # no type errors
git log --oneline -6
```

Both acceptance scenarios from the spec must hold in the browser:

- The same attacker tapped **O** then **✓** in one rally shows 2 attempts, 1 point, 50% success.
- The serving team winning the rally on their own attack scores without rotating, and the same player serves again.

**Before deploying:** run `supabase/migrations/2026-07-29-fault-event-types.sql` against the live database. Without it every fault write is rejected inside the Supabase write queue, with nothing shown on screen.
