# Spiker-Only Data Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phase-driven rally tracker with a screen where tapping a player and one of three outcome buttons records a spike attempt, backed by four live charts and a manual scoreboard.

**Architecture:** All logic lives in two pure modules — `spikes.ts` (tallies derived from `StatEvent[]`) and `spike-session.ts` (scoreboard, set number, undo stack) — both unit-tested with no React, storage or DOM. The screen at `/console/matches/[id]/spikes` is a thin renderer that calls the existing `DataProvider` (`store.addEvent` / `removeEvent` / `recordSetScore` / `startMatch`). Nothing in the rally engine, `metrics.ts` or the existing charts is modified.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, TypeScript 5, Tailwind 4, Recharts 2, Node 22 test runner with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-07-28-spiker-tracking-demo-design.md`

## Global Constraints

- Node 22. Run `nvm use 22` before any `npm test` — the runner needs `--experimental-strip-types`.
- Never run `npm run build` while `npm run dev` is running.
- No test framework. Tests are `.test.mjs` files using `node:assert/strict` plus `createRunner` from `src/lib/console-ui.mjs`, ending in `qa.finish()`.
- Any `.ts` file imported by a `.test.mjs` must use **type-only** imports (`import type { … }`) so Node's type-stripping never has to resolve another module at runtime. `src/lib/rally.ts:1` is the reference.
- Commits use Conventional Commits. No `Co-Authored-By` trailer. Before the first commit, confirm `git var GIT_AUTHOR_IDENT` reports `DabhiDhruvraj <dhruvrajsinhdabhi92@gmail.com>` — the global git config is a different identity and will mis-attribute the work.
- Success rate is `pointsWon / attempts`. Never reuse `PlayerLine.successRate` from `src/lib/metrics.ts`; it counts `SPIKE_IN` as a success and returns 100% where this feature requires 50%.
- Chart colours come from CSS custom properties via the existing `theme()` helper, never hardcoded hex.
- UI uses the primitives in `src/components/ui.tsx` (`Button`, `LinkButton`, `Card`, `PageSkeleton`, `EmptyState`, `StatusChip`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/spikes.ts` | **Create.** Pure per-player spike tallies from an event list. |
| `src/lib/spikes.test.mjs` | **Create.** Unit tests for the above. |
| `src/lib/spike-session.ts` | **Create.** Pure scoreboard / set number / undo stack. |
| `src/lib/spike-session.test.mjs` | **Create.** Unit tests for the above. |
| `src/components/charts.tsx` | **Modify.** Export five existing private helpers (lines 48, 59, 71, 78, 82) so the new charts reuse them. No component behaviour changes. |
| `src/components/spike-charts.tsx` | **Create.** The four bar charts plus a grid wrapper. |
| `src/app/console/matches/[id]/spikes/page.tsx` | **Create.** The screen. Thin renderer over the two pure modules and the store. |
| `src/app/console/matches/new/page.tsx` | **Modify.** Line 118 redirect, plus the stale doc comment. |
| `src/app/console/page.tsx` | **Modify.** Lines 552 and 571 links. |
| `src/app/console/matches/[id]/live/page.tsx` | **Modify.** Line 15 redirect, plus the stale doc comment. |
| `package.json` | **Modify.** Line 9 test chain. |

---

### Task 1: Spike tallies

The four charts all read from this. Pure functions over `StatEvent[]`, no knowledge of players, teams or matches beyond the ids on the events.

**Files:**
- Create: `src/lib/spikes.ts`
- Create: `src/lib/spikes.test.mjs`
- Modify: `package.json:9`
- Modify: `docs/superpowers/specs/2026-07-28-spiker-tracking-demo-design.md` (one testing bullet)

**Interfaces:**
- Consumes: `StatEvent` from `src/lib/types.ts` (type-only).
- Produces:
  - `interface SpikeLine { playerId: string; attempts: number; pointsWon: number; rallyContinued: number; failed: number; successRate: number | null; errorRate: number | null }`
  - `spikeLine(playerId: string, events: StatEvent[]): SpikeLine`
  - `spikeLines(playerIds: string[], events: StatEvent[]): SpikeLine[]`

- [ ] **Step 1: Correct two spec bullets before implementing**

The spec's testing section lists two bullets these functions cannot honour. "Events from other matches excluded" — they receive an already match-scoped list from `useMatch`, so filtering by match here is impossible and would be dead code. "Both teams tallied independently from one event list" — tallies are keyed by player id and carry no team, because team is presentational and belongs to the chart layer. Both collapse into one honest bullet. In `docs/superpowers/specs/2026-07-28-spiker-tracking-demo-design.md`, replace those two lines with:

```
- Events belonging to other players are ignored, which is what keeps two
  teams' players separate in a single event list
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/spikes.test.mjs`:

```js
/**
 * Pure spike-tally tests. Run: node --experimental-strip-types src/lib/spikes.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import { spikeLine, spikeLines } from "./spikes.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Spike Tally Verification Suite",
  file: "src/lib/spikes.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

let seq = 0;
/** Minimal StatEvent for tallying — only playerId and type are read. */
const ev = (playerId, type) => ({
  id: `e${++seq}`,
  matchId: "m1",
  teamId: "t1",
  playerId,
  setNo: 1,
  type,
  ts: seq,
});

qa.suite("Spike Tallies");

t("one O then one ✓ is 2 attempts, 1 point, 50% success, 0% error", () => {
  const line = spikeLine("A", [ev("A", "SPIKE_IN"), ev("A", "SPIKE_POINT")]);
  assert.equal(line.attempts, 2);
  assert.equal(line.pointsWon, 1);
  assert.equal(line.rallyContinued, 1);
  assert.equal(line.failed, 0);
  assert.equal(line.successRate, 50);
  assert.equal(line.errorRate, 0);
});

t("every outcome counts as an attempt", () => {
  const line = spikeLine("A", [
    ev("A", "SPIKE_POINT"),
    ev("A", "SPIKE_IN"),
    ev("A", "SPIKE_ERR"),
  ]);
  assert.equal(line.attempts, 3);
});

t("no attempts gives null rates, not zero", () => {
  const line = spikeLine("A", []);
  assert.equal(line.attempts, 0);
  assert.equal(line.successRate, null);
  assert.equal(line.errorRate, null);
});

t("all failures is 0% success and 100% error", () => {
  const line = spikeLine("A", [ev("A", "SPIKE_ERR"), ev("A", "SPIKE_ERR")]);
  assert.equal(line.successRate, 0);
  assert.equal(line.errorRate, 100);
});

t("events belonging to other players are ignored", () => {
  const events = [ev("A", "SPIKE_POINT"), ev("B", "SPIKE_POINT"), ev("B", "SPIKE_ERR")];
  assert.equal(spikeLine("A", events).attempts, 1);
  assert.equal(spikeLine("B", events).attempts, 2);
});

t("non-spike events never count", () => {
  const line = spikeLine("A", [
    ev("A", "SERVE_ACE"),
    ev("A", "DIG_SAVE"),
    ev("A", "BLOCK_WIN"),
    ev("A", "SPIKE_POINT"),
  ]);
  assert.equal(line.attempts, 1);
  assert.equal(line.pointsWon, 1);
});

t("rates round to whole percent", () => {
  const line = spikeLine("A", [
    ev("A", "SPIKE_POINT"),
    ev("A", "SPIKE_IN"),
    ev("A", "SPIKE_IN"),
  ]);
  assert.equal(line.successRate, 33);
});

qa.suite("Multiple Players");

t("spikeLines returns one line per id, in the order given", () => {
  const events = [ev("A", "SPIKE_POINT"), ev("B", "SPIKE_ERR")];
  const lines = spikeLines(["B", "A"], events);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].playerId, "B");
  assert.equal(lines[0].failed, 1);
  assert.equal(lines[1].playerId, "A");
  assert.equal(lines[1].pointsWon, 1);
});

t("players with no events still get a zeroed line", () => {
  const lines = spikeLines(["A", "Z"], [ev("A", "SPIKE_POINT")]);
  assert.equal(lines[1].playerId, "Z");
  assert.equal(lines[1].attempts, 0);
  assert.equal(lines[1].successRate, null);
});

qa.finish();
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
nvm use 22 && node --experimental-strip-types src/lib/spikes.test.mjs
```

Expected: FAIL — `Cannot find module .../src/lib/spikes.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/spikes.ts`:

```ts
import type { StatEvent } from "./types";

/**
 * SPIKE TALLIES — the only statistics the spiker demo derives.
 *
 * Deliberately separate from metrics.ts. PlayerLine.spikeSuccesses counts
 * SPIKE_IN as a success, so PlayerLine.successRate reads 100% for the
 * one-O-then-one-✓ case the product defines as 50%. Three existing charts
 * depend on that field, so it is left untouched and the definitions the
 * spiker screen needs live here.
 *
 * Pure: no React, no storage, no DOM. Type-only import so the Node
 * type-stripping test runner can load this file directly.
 */

export interface SpikeLine {
  playerId: string;
  /** Every tap: point + rally-continued + failed. */
  attempts: number;
  pointsWon: number; // SPIKE_POINT
  rallyContinued: number; // SPIKE_IN
  failed: number; // SPIKE_ERR
  /** pointsWon / attempts as whole percent. null when attempts === 0. */
  successRate: number | null;
  /** failed / attempts as whole percent. null when attempts === 0. */
  errorRate: number | null;
}

/** null rather than 0 for "no attempts" — charts drop them instead of drawing 0% bars. */
const rate = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 100);

export function spikeLine(playerId: string, events: StatEvent[]): SpikeLine {
  let pointsWon = 0;
  let rallyContinued = 0;
  let failed = 0;

  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.type === "SPIKE_POINT") pointsWon++;
    else if (e.type === "SPIKE_IN") rallyContinued++;
    else if (e.type === "SPIKE_ERR") failed++;
  }

  const attempts = pointsWon + rallyContinued + failed;
  return {
    playerId,
    attempts,
    pointsWon,
    rallyContinued,
    failed,
    successRate: rate(pointsWon, attempts),
    errorRate: rate(failed, attempts),
  };
}

export function spikeLines(playerIds: string[], events: StatEvent[]): SpikeLine[] {
  return playerIds.map((id) => spikeLine(id, events));
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --experimental-strip-types src/lib/spikes.test.mjs
```

Expected: PASS, 9 checks across 2 suites.

- [ ] **Step 6: Add the file to the test chain**

In `package.json`, replace line 9 with:

```json
    "test": "node --experimental-strip-types src/lib/rally.test.mjs && node --experimental-strip-types src/lib/auth-routes.test.mjs && node --experimental-strip-types src/lib/spikes.test.mjs"
```

- [ ] **Step 7: Run the whole suite**

```bash
npm test
```

Expected: all three files PASS. `rally.test.mjs` and `auth-routes.test.mjs` must be unchanged and green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/spikes.ts src/lib/spikes.test.mjs package.json docs/superpowers/specs/2026-07-28-spiker-tracking-demo-design.md
git commit -m "feat(spikes): pure per-player spike tallies

Success rate is points won over attempts. metrics.ts computes something
different — spikeSuccesses counts SPIKE_IN — so these definitions live in
their own module rather than changing a field three other charts read."
```

---

### Task 2: Spike session state

Everything the screen holds that is not a `StatEvent`: the manual scoreboard, the current set number, and one undo stack covering both spike taps and score taps.

**Files:**
- Create: `src/lib/spike-session.ts`
- Create: `src/lib/spike-session.test.mjs`
- Modify: `package.json:9`
- Modify: `docs/superpowers/specs/2026-07-28-spiker-tracking-demo-design.md` (add the undo boundary rule)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ScoreSide = "home" | "away"`
  - `type SpikeAction = { kind: "EVENT"; eventId: string } | { kind: "POINT"; side: ScoreSide }`
  - `interface SpikeSession { setNo: number; homePoints: number; awayPoints: number; undoStack: SpikeAction[] }`
  - `newSession(): SpikeSession`
  - `recordEvent(s: SpikeSession, eventId: string): SpikeSession`
  - `addPoint(s: SpikeSession, side: ScoreSide): SpikeSession`
  - `undo(s: SpikeSession): { session: SpikeSession; undone: SpikeAction | null }`
  - `endSet(s: SpikeSession): SpikeSession`

- [ ] **Step 1: Record the undo boundary rule in the spec**

`endSet` clears the undo stack, so undo never reaches back across a banked set. Without this, undoing a point after `END SET` would decrement a fresh 0–0 to −1. Add this line to the spec's **Writes** section, directly after the paragraph beginning "Undo is a single stack":

```
Undo does not cross a set boundary: `END SET` banks the score and clears the
stack, so the first action of a new set is the oldest thing undo can reach.
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/spike-session.test.mjs`:

```js
/**
 * Pure session tests. Run: node --experimental-strip-types src/lib/spike-session.test.mjs
 * No test framework — tiny asserts, zero deps. Presentation lives in console-ui.mjs.
 */
import assert from "node:assert/strict";
import { createRunner } from "./console-ui.mjs";
import {
  newSession,
  recordEvent,
  addPoint,
  undo,
  endSet,
} from "./spike-session.ts";

const qa = createRunner({
  title: "VOLLEYVERSE QA AGENT",
  subtitle: "Spike Session Verification Suite",
  file: "src/lib/spike-session.test.mjs",
});
const t = (name, fn) => qa.test(name, fn);

qa.suite("Scoreboard");

t("a new session starts at set 1, 0-0, nothing to undo", () => {
  const s = newSession();
  assert.equal(s.setNo, 1);
  assert.equal(s.homePoints, 0);
  assert.equal(s.awayPoints, 0);
  assert.deepEqual(s.undoStack, []);
});

t("addPoint raises only the side given", () => {
  const s = addPoint(addPoint(newSession(), "home"), "away");
  assert.equal(s.homePoints, 1);
  assert.equal(s.awayPoints, 1);
  const h = addPoint(s, "home");
  assert.equal(h.homePoints, 2);
  assert.equal(h.awayPoints, 1);
});

t("session values are never mutated in place", () => {
  const s = newSession();
  addPoint(s, "home");
  recordEvent(s, "e1");
  assert.equal(s.homePoints, 0);
  assert.deepEqual(s.undoStack, []);
});

qa.suite("Undo");

t("undo of a point lowers that side's score", () => {
  const s = addPoint(newSession(), "away");
  const { session, undone } = undo(s);
  assert.equal(session.awayPoints, 0);
  assert.deepEqual(undone, { kind: "POINT", side: "away" });
  assert.deepEqual(session.undoStack, []);
});

t("undo of a spike returns the event id and leaves the score alone", () => {
  const s = recordEvent(addPoint(newSession(), "home"), "e42");
  const { session, undone } = undo(s);
  assert.deepEqual(undone, { kind: "EVENT", eventId: "e42" });
  assert.equal(session.homePoints, 1);
  assert.equal(session.undoStack.length, 1);
});

t("undo pops in reverse order across mixed actions", () => {
  let s = newSession();
  s = addPoint(s, "home");
  s = recordEvent(s, "e1");
  s = addPoint(s, "away");

  const first = undo(s);
  assert.deepEqual(first.undone, { kind: "POINT", side: "away" });
  const second = undo(first.session);
  assert.deepEqual(second.undone, { kind: "EVENT", eventId: "e1" });
  const third = undo(second.session);
  assert.deepEqual(third.undone, { kind: "POINT", side: "home" });
  assert.equal(third.session.homePoints, 0);
});

t("undo on an empty stack is a no-op returning null", () => {
  const s = newSession();
  const { session, undone } = undo(s);
  assert.equal(undone, null);
  assert.deepEqual(session, s);
});

qa.suite("Ending a Set");

t("endSet advances the set, resets the score and clears undo", () => {
  let s = newSession();
  s = addPoint(s, "home");
  s = recordEvent(s, "e1");
  const next = endSet(s);
  assert.equal(next.setNo, 2);
  assert.equal(next.homePoints, 0);
  assert.equal(next.awayPoints, 0);
  assert.deepEqual(next.undoStack, []);
});

t("undo cannot reach back across a banked set", () => {
  const banked = endSet(addPoint(newSession(), "home"));
  const { session, undone } = undo(banked);
  assert.equal(undone, null);
  assert.equal(session.homePoints, 0);
  assert.equal(session.setNo, 2);
});

qa.finish();
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node --experimental-strip-types src/lib/spike-session.test.mjs
```

Expected: FAIL — `Cannot find module .../src/lib/spike-session.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/spike-session.ts`:

```ts
/**
 * SPIKE SESSION — everything the spiker screen holds that is not a StatEvent:
 * the manual scoreboard, the current set number, and one undo stack covering
 * both spike taps and score taps.
 *
 * The scoreboard is manual on purpose. A volleyball point can come from a
 * kill, an ace, a block or the opponent's error; the screen only logs spikes,
 * so a score derived from events alone would be wrong. Tapping +1 keeps the
 * scoreboard truthful without reintroducing the phase model.
 *
 * Pure: no React, no storage, no DOM. Every function returns a new value.
 */

export type ScoreSide = "home" | "away";

export type SpikeAction =
  | { kind: "EVENT"; eventId: string }
  | { kind: "POINT"; side: ScoreSide };

export interface SpikeSession {
  setNo: number;
  homePoints: number;
  awayPoints: number;
  /** Most recent action last. */
  undoStack: SpikeAction[];
}

export function newSession(): SpikeSession {
  return { setNo: 1, homePoints: 0, awayPoints: 0, undoStack: [] };
}

/** Remember a written StatEvent so undo can delete it again. */
export function recordEvent(s: SpikeSession, eventId: string): SpikeSession {
  return { ...s, undoStack: [...s.undoStack, { kind: "EVENT", eventId }] };
}

export function addPoint(s: SpikeSession, side: ScoreSide): SpikeSession {
  return {
    ...s,
    homePoints: side === "home" ? s.homePoints + 1 : s.homePoints,
    awayPoints: side === "away" ? s.awayPoints + 1 : s.awayPoints,
    undoStack: [...s.undoStack, { kind: "POINT", side }],
  };
}

/**
 * Reverse the most recent action. A POINT is reversed here; an EVENT is
 * returned so the caller can delete the StatEvent it created. `undone` is
 * null when there is nothing left to undo.
 */
export function undo(s: SpikeSession): {
  session: SpikeSession;
  undone: SpikeAction | null;
} {
  const last = s.undoStack[s.undoStack.length - 1];
  if (!last) return { session: s, undone: null };

  const undoStack = s.undoStack.slice(0, -1);
  if (last.kind === "POINT") {
    return {
      session: {
        ...s,
        homePoints: last.side === "home" ? s.homePoints - 1 : s.homePoints,
        awayPoints: last.side === "away" ? s.awayPoints - 1 : s.awayPoints,
        undoStack,
      },
      undone: last,
    };
  }
  return { session: { ...s, undoStack }, undone: last };
}

/**
 * Bank the set. Scores reset, the set number advances, and the undo stack is
 * cleared — undo must not reach back past a banked set, or it would decrement
 * a fresh 0-0 into negative points.
 */
export function endSet(s: SpikeSession): SpikeSession {
  return { setNo: s.setNo + 1, homePoints: 0, awayPoints: 0, undoStack: [] };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --experimental-strip-types src/lib/spike-session.test.mjs
```

Expected: PASS, 9 checks across 3 suites.

- [ ] **Step 6: Add to the test chain and run everything**

In `package.json` line 9, append ` && node --experimental-strip-types src/lib/spike-session.test.mjs`, then:

```bash
npm test
```

Expected: four files PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/spike-session.ts src/lib/spike-session.test.mjs package.json docs/superpowers/specs/2026-07-28-spiker-tracking-demo-design.md
git commit -m "feat(spikes): pure scoreboard, set and undo state

The scoreboard is manual because only spikes are logged — points from
aces, blocks and opponent errors would otherwise be invisible. Ending a
set clears the undo stack so undo cannot decrement a fresh 0-0."
```

---

### Task 3: The four charts

Reuse the existing chart theming rather than duplicating it. `theme`, `axisProps`, `tooltipStyle`, `firstName` and `ChartShell` are already defined in `charts.tsx` but not exported; exporting them changes no behaviour.

**Files:**
- Modify: `src/components/charts.tsx:48`, `:59`, `:71`, `:78`, `:82` (add `export`)
- Create: `src/components/spike-charts.tsx`

**Interfaces:**
- Consumes: `spikeLines`, `SpikeLine` from Task 1. `Player`, `StatEvent` from `src/lib/types.ts`.
- Produces: `SpikeChartGrid({ players, events, homeTeamId, homeLabel, awayLabel }): JSX.Element`

- [ ] **Step 1: Export the shared chart helpers**

In `src/components/charts.tsx`, add the `export` keyword to exactly these five declarations, changing nothing else:

```tsx
export const theme = () => ({          // line 48
export const tooltipStyle = () => ({   // line 59
export const axisProps = () => ({      // line 71
export function firstName(name: string) {   // line 78
export function ChartShell({                // line 82
```

`css` at line 42 stays private — `theme()` is its only caller and the new charts never need it.

- [ ] **Step 2: Create the charts**

Create `src/components/spike-charts.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { Player, StatEvent } from "@/lib/types";
import { spikeLines, type SpikeLine } from "@/lib/spikes";
import { ChartShell, axisProps, firstName, theme, tooltipStyle } from "./charts";

/**
 * THE FOUR DEMO CHARTS — attempts, points won, success rate, error rate.
 *
 * Every chart shows both teams in one plot, coloured by side, sorted by
 * value. Players with no attempts are dropped: a bench sitting at zero
 * crowds out the attackers the charts exist to compare.
 */

interface Row {
  name: string;
  value: number;
  home: boolean;
}

function rows(
  players: Player[],
  events: StatEvent[],
  homeTeamId: string,
  pick: (l: SpikeLine) => number | null,
): Row[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return spikeLines(
    players.map((p) => p.id),
    events,
  )
    .filter((l) => l.attempts > 0)
    .map((l) => {
      const p = byId.get(l.playerId)!;
      return {
        name: firstName(p.fullName),
        value: pick(l) ?? 0,
        home: p.teamId === homeTeamId,
      };
    })
    .sort((a, b) => b.value - a.value);
}

function TeamBars({
  data,
  unit,
  domain,
  tooltipLabel,
}: {
  data: Row[];
  unit?: string;
  domain?: [number, number];
  tooltipLabel: string;
}) {
  const t = theme();
  return (
    <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={t.line} vertical={false} />
      <XAxis dataKey="name" {...axisProps()} />
      <YAxis
        {...axisProps()}
        unit={unit}
        domain={domain}
        allowDecimals={unit === "%"}
      />
      <Tooltip
        {...tooltipStyle()}
        formatter={(v) => [`${v}${unit ?? ""}`, tooltipLabel]}
      />
      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44}>
        {data.map((d, i) => (
          <Cell key={i} fill={d.home ? t.accent : t.azure} />
        ))}
      </Bar>
    </BarChart>
  );
}

/** All four charts, with a colour key for the two teams. */
export function SpikeChartGrid({
  players,
  events,
  homeTeamId,
  homeLabel,
  awayLabel,
}: {
  players: Player[];
  events: StatEvent[];
  homeTeamId: string;
  homeLabel: string;
  awayLabel: string;
}) {
  const attempts = rows(players, events, homeTeamId, (l) => l.attempts);
  const points = rows(players, events, homeTeamId, (l) => l.pointsWon);
  const success = rows(players, events, homeTeamId, (l) => l.successRate);
  const errors = rows(players, events, homeTeamId, (l) => l.errorRate);
  const t = theme();

  if (attempts.length === 0) {
    return (
      <div className="card-premium rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-ink">No spikes logged yet.</p>
        <p className="mt-1 text-xs text-dim">
          Tap a player, then ✓, O or ✗. Charts appear from the first attempt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider text-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: t.accent }} />
          {homeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: t.azure }} />
          {awayLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartShell title="Spike Attempts" insight="Every tap counts as one attempt.">
          <TeamBars data={attempts} tooltipLabel="Attempts" />
        </ChartShell>

        <ChartShell title="Points Won" insight="Attacks that ended the rally.">
          <TeamBars data={points} tooltipLabel="Points" />
        </ChartShell>

        <ChartShell title="Success Rate" insight="Points won ÷ attempts.">
          <TeamBars data={success} unit="%" domain={[0, 100]} tooltipLabel="Success" />
        </ChartShell>

        <ChartShell title="Error Rate" insight="Into the net or out ÷ attempts.">
          <TeamBars data={errors} unit="%" domain={[0, 100]} tooltipLabel="Errors" />
        </ChartShell>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If `npm run dev` is running, leave it running — `tsc --noEmit` is safe alongside it.

- [ ] **Step 4: Confirm existing tests still pass**

```bash
npm test
```

Expected: four files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/charts.tsx src/components/spike-charts.tsx
git commit -m "feat(spikes): four spiker charts sharing the existing chart theming

Exports the private theme/axis/tooltip/shell helpers from charts.tsx so
the new charts reuse them rather than copying. No existing component
changes behaviour."
```

---

### Task 4: The spike screen

A thin renderer: session state from Task 2, tallies from Task 1, charts from Task 3, writes through the existing `DataProvider`.

**Files:**
- Create: `src/app/console/matches/[id]/spikes/page.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–3. `useMatch`, `useStore` from `src/lib/store.tsx`. `Button`, `LinkButton`, `EmptyState`, `PageSkeleton` from `src/components/ui.tsx`.
- Produces: the route `/console/matches/[id]/spikes`.

Store methods used, with their existing signatures from `src/lib/repository.ts`:

```ts
addEvent(matchId: string, teamId: string, playerId: string, setNo: number, type: EventType): StatEvent
removeEvent(eventId: string): void
recordSetScore(matchId: string, set: { setNo: number; homePoints: number; awayPoints: number }): void
startMatch(matchId: string): void
```

- [ ] **Step 1: Create the page**

Create `src/app/console/matches/[id]/spikes/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMatch, useStore } from "@/lib/store";
import { SpikeChartGrid } from "@/components/spike-charts";
import { Button, EmptyState, LinkButton, PageSkeleton } from "@/components/ui";
import {
  addPoint,
  endSet,
  newSession,
  recordEvent,
  undo,
  type ScoreSide,
  type SpikeSession,
} from "@/lib/spike-session";
import type { EventType, Player } from "@/lib/types";

/**
 * SPIKE TRACKER — the whole demo on one screen.
 *
 * Tap a player, tap one of three outcomes, done. No receiver, no setter,
 * no phase model: real rallies do not follow a fixed touch sequence, and
 * the same attacker can spike twice in one rally. Every tap is exactly one
 * attempt.
 *
 * The scoreboard is manual and independent of the taps, because only
 * spikes are logged — points from aces, blocks and opponent errors would
 * otherwise never appear.
 */

const SESSION_KEY = (matchId: string) => `volleyverse:spikes:${matchId}`;

const OUTCOMES: { type: EventType; glyph: string; label: string; sub: string; cls: string }[] = [
  {
    type: "SPIKE_POINT",
    glyph: "✓",
    label: "Point won",
    sub: "The spike landed",
    cls: "border-ok/40 bg-ok/10 text-ok hover:border-ok",
  },
  {
    type: "SPIKE_IN",
    glyph: "O",
    label: "Rally continues",
    sub: "They defended it",
    cls: "border-azure/40 bg-azure/10 text-azure hover:border-azure",
  },
  {
    type: "SPIKE_ERR",
    glyph: "✗",
    label: "Failed",
    sub: "Net or out",
    cls: "border-err/40 bg-err/10 text-err hover:border-err",
  },
];

export default function SpikeTracker() {
  const { id } = useParams<{ id: string }>();
  const { match, homeTeam, awayTeam, homeRoster, awayRoster, events } = useMatch(id);
  const store = useStore();

  const [session, setSession] = useState<SpikeSession>(newSession);
  const [loaded, setLoaded] = useState(false);
  const [armed, setArmed] = useState<Player | null>(null);

  // Resume mid-match after a reload: score, set number and undo stack.
  // Keyed on the route id, not the match object — `useMatch` hands back a
  // fresh object every time the db changes, and re-reading storage on every
  // logged event would fight the writes below.
  useEffect(() => {
    if (!store.ready) return;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY(id));
      if (raw) {
        const parsed = JSON.parse(raw) as SpikeSession;
        if (typeof parsed.setNo === "number" && Array.isArray(parsed.undoStack)) {
          setSession(parsed);
        }
      }
    } catch {
      // corrupted payload — start a fresh session
    }
    setLoaded(true); // unconditional, so a missing match reaches its empty state
  }, [store.ready, id]);

  const persist = useCallback(
    (next: SpikeSession) => {
      setSession(next);
      try {
        window.localStorage.setItem(SESSION_KEY(id), JSON.stringify(next));
      } catch {
        // storage unavailable — state stays in memory for this session
      }
    },
    [id],
  );

  /** A match becomes live on its first recorded action, not on a setup wizard. */
  const ensureStarted = useCallback(() => {
    if (match && match.status === "scheduled") store.startMatch(match.id);
  }, [match, store]);

  const onOutcome = (player: Player, type: EventType) => {
    if (!match) return;
    ensureStarted();
    const e = store.addEvent(match.id, player.teamId, player.id, session.setNo, type);
    persist(recordEvent(session, e.id));
    setArmed(null);
  };

  const onPoint = (side: ScoreSide) => {
    ensureStarted();
    persist(addPoint(session, side));
  };

  const onUndo = () => {
    const { session: next, undone } = undo(session);
    if (!undone) return;
    if (undone.kind === "EVENT") store.removeEvent(undone.eventId);
    persist(next);
    setArmed(null);
  };

  const onEndSet = () => {
    if (!match) return;
    store.recordSetScore(match.id, {
      setNo: session.setNo,
      homePoints: session.homePoints,
      awayPoints: session.awayPoints,
    });
    persist(endSet(session));
    setArmed(null);
  };

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

  const allPlayers = [...homeRoster, ...awayRoster];

  return (
    <div className="space-y-5">
      {/* Scoreboard — manual, independent of the spike taps */}
      <header className="card-premium rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right">
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {homeTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-accent">
              {session.homePoints}
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-dim">
            Set {session.setNo}
          </p>
          <div>
            <p className="stat-display text-sm font-extrabold uppercase text-ink">
              {awayTeam.name}
            </p>
            <p className="stat-display tnum text-4xl font-extrabold text-azure">
              {session.awayPoints}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-line/60 pt-3">
          <Button onClick={() => onPoint("home")}>+1 {homeTeam.shortName}</Button>
          <Button onClick={() => onPoint("away")}>+1 {awayTeam.shortName}</Button>
          <Button variant="ghost" onClick={onEndSet}>
            End set
          </Button>
          <Button
            variant="ghost"
            onClick={onUndo}
            disabled={session.undoStack.length === 0}
          >
            ↶ Undo
          </Button>
          <LinkButton href="/console" variant="ghost">
            Console
          </LinkButton>
        </div>
      </header>

      {/* Outcome buttons for the armed player */}
      {armed && (
        <div className="card-premium sticky top-2 z-10 rounded-2xl border-accent/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="stat-display text-lg font-extrabold uppercase text-ink">
              {armed.jerseyNo !== null ? `#${armed.jerseyNo} ` : ""}
              {armed.fullName}
            </p>
            <Button variant="ghost" onClick={() => setArmed(null)}>
              Cancel
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => onOutcome(armed, o.type)}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border transition-all duration-200 ${o.cls}`}
              >
                <span className="stat-display text-3xl font-extrabold">{o.glyph}</span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {o.label}
                </span>
                <span className="text-[10px] text-dim">{o.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Both rosters, always visible */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RosterPanel
          label={homeTeam.name}
          players={homeRoster}
          armedId={armed?.id ?? null}
          onPick={setArmed}
          tone="accent"
        />
        <RosterPanel
          label={awayTeam.name}
          players={awayRoster}
          armedId={armed?.id ?? null}
          onPick={setArmed}
          tone="azure"
        />
      </div>

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

function RosterPanel({
  label,
  players,
  armedId,
  onPick,
  tone,
}: {
  label: string;
  players: Player[];
  armedId: string | null;
  onPick: (p: Player | null) => void;
  tone: "accent" | "azure";
}) {
  const ring = tone === "accent" ? "border-accent bg-accent/10" : "border-azure bg-azure/10";
  return (
    <div className="card-premium rounded-2xl p-4">
      <h2 className="stat-display mb-3 text-sm font-bold uppercase tracking-wide text-dim">
        {label}
      </h2>
      {players.length === 0 ? (
        <p className="text-xs text-dim">
          No players registered for this team. Add them in League Setup.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((p) => {
            const active = p.id === armedId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPick(active ? null : p)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-all duration-200 ${
                  active ? ring : "border-line bg-surface2 hover:border-accent/40"
                }`}
              >
                <span className="stat-display tnum text-lg font-extrabold text-ink">
                  {p.jerseyNo ?? "–"}
                </span>
                <span className="truncate text-[11px] text-dim">
                  {p.fullName.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify by hand**

The repo has no React component test framework, so this task is verified in the browser. Start the dev server (`nvm use 22 && npm run dev`) and open an existing match at `/console/matches/<id>/spikes`. Confirm each of the following:

1. Both rosters render with every player visible, no court diagram, no lineup prompt.
2. Tapping a player reveals the three outcome buttons with that player's name.
3. Tapping ✓ writes an event: the Attempts and Points Won charts both grow by one.
4. Tapping the same player then O grows Attempts to 2 and drops Success Rate to 50% — the acceptance case from the spec.
5. Tapping ✗ leaves Points Won unchanged and raises Error Rate.
6. `+1` on each side moves only that side's score.
7. `↶ Undo` after a spike removes the bar; after a `+1` lowers that score; it is disabled when there is nothing to undo.
8. `End set` resets the score to 0–0, advances to Set 2, and disables Undo.
9. Reload the page mid-match: score, set number and undo availability survive.
10. A match that was `scheduled` shows as `Live` on `/console` after the first tap.

- [ ] **Step 4: Commit**

```bash
git add "src/app/console/matches/[id]/spikes/page.tsx"
git commit -m "feat(spikes): tap-a-player spike tracking screen

Both rosters stay on screen, a tap arms a player and three buttons record
the outcome. No receiver, setter or phase model: rallies do not follow a
fixed touch sequence and the same attacker can spike twice in one rally."
```

---

### Task 5: Point the console at the new screen

Four links currently lead to the rally tracker. The tracker itself stays in the tree, reachable only by typing its URL.

**Files:**
- Modify: `src/app/console/matches/new/page.tsx:15-26`, `:118`
- Modify: `src/app/console/page.tsx:552`, `:571`
- Modify: `src/app/console/matches/[id]/live/page.tsx:7-9`, `:15`

**Interfaces:**
- Consumes: the route created in Task 4.
- Produces: nothing.

- [ ] **Step 1: Redirect the fixture form**

In `src/app/console/matches/new/page.tsx`, change line 118:

```tsx
    router.push(`/console/matches/${match.id}/spikes`);
```

Replace the stale paragraph in the file's doc comment (lines 20-22) with:

```
 * On confirm we createMatch() and hand straight off to the Spike Tracker
 * (/console/matches/[id]/spikes). There is no toss or lineup step — the
 * tracker needs neither.
```

Change the third step dot's label at line 141 from `Toss` to `Track`, and the button label at line 326 from `Start match → Toss` to `Start match → Track`. Change the header hint at line 133 from `Pick two teams, set the details, then run the toss courtside.` to `Pick two teams, set the details, then start tapping spikes.`

- [ ] **Step 2: Redirect the dashboard links**

In `src/app/console/page.tsx`, change line 552:

```tsx
          <LinkButton href={`/console/matches/${match.id}/spikes`} variant={match.status === "live" ? "primary" : "ghost"}>
```

and line 571:

```tsx
              href={`/console/matches/${match.id}/spikes`}
```

Leave the Analytics link at line 559 alone — set scores are still banked by `End set`, so that page keeps working in part.

- [ ] **Step 3: Redirect the retired live route**

In `src/app/console/matches/[id]/live/page.tsx`, change line 15:

```tsx
    router.replace(`/console/matches/${id}/spikes`);
```

and replace the doc comment (lines 6-10) with:

```
/**
 * The form-based Live Entry screen is retired. The route stays as a
 * redirect so old links and bookmarks keep working — it now lands on the
 * Spike Tracker.
 */
```

- [ ] **Step 4: Typecheck and test**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors, four test files PASS.

- [ ] **Step 5: Verify the full path by hand**

With the dev server running, walk the whole flow: `/console` → **Start Match** → pick two teams → **Next: Details** → **Start match → Track**. Confirm it lands on the spike screen with both rosters showing and no toss or lineup step anywhere. Then confirm nothing in the console links to `/rally` any more, while `/console/matches/<id>/rally` still loads if typed directly.

- [ ] **Step 6: Commit**

```bash
git add "src/app/console/matches/new/page.tsx" src/app/console/page.tsx "src/app/console/matches/[id]/live/page.tsx"
git commit -m "feat(spikes): route the console to the spike tracker

Every console entry point now lands on the spike screen. The rally
tracker stays in the tree and still loads by URL, since the fuller
tracking model is parked rather than dropped."
```

---

## Verification of the whole feature

After Task 5, the spec's acceptance criterion should be reproducible end to end:

```
Player A spikes → O   ⇒ SPIKE_IN
Player A spikes → ✓   ⇒ SPIKE_POINT

A's charts: 2 attempts · 1 point · 50% success · 0% error
```

50% is the number that proves `metrics.ts` was not accidentally reused; it would show 100%.

Final checks:

```bash
nvm use 22
npm test          # four files, all green
npx tsc --noEmit  # no type errors
git log --oneline -5
```
