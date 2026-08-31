# VolleyVerse — Project Overview

A live volleyball league platform: an operator **Console** for running matches courtside, and a public **Showcase** site for fans. Every statistic on every screen is derived from a single append-only event log — nothing is hand-typed and nothing aggregated is stored.

- **Repo:** `https://github.com/ZEELCHAUDHARI7/volleyverse`
- **Stack:** Next.js 15.5 (App Router) · React 19.1 · TypeScript 5 (`strict`) · Tailwind CSS v4 · Supabase (Postgres + Auth + Realtime) · Recharts · GSAP + Lenis
- **Document generated:** 10 August 2026, from commit `687f882`

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [The two surfaces](#2-the-two-surfaces)
3. [Current features](#3-current-features)
4. [Codebase flow](#4-codebase-flow)
5. [Authentication & authorization](#5-authentication--authorization)
6. [Known gaps and inconsistencies](#6-known-gaps-and-inconsistencies)

---

## 1. Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # pure-logic test suites (no DB, no browser)
npm run build
```

### Environment variables

There are exactly **two**, both public by design:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

Put them in `.env.local`. **If either is missing the app does not throw** — it silently falls back to an offline, localStorage-backed provider, so demos and local development work with zero backend. `NODE_ENV` is also read, but only to decide whether the console fails closed when the Supabase vars are absent (see [§5.6](#56-behaviour-when-supabase-is-not-configured)).

There is no service-role key and no server-only secret anywhere in the repo. Every server-side Supabase client is built with the anon key, so server code is subject to the same RLS as the browser.

> ⚠️ `REALTIME_SYNC.md` tells you to copy `.env.local.example`. **That file does not exist in the repo** (and `.gitignore`'s `.env*` rule would block it). Create `.env.local` by hand.

### Database setup

Run `supabase/schema.sql` in the Supabase SQL editor, then any files in `supabase/migrations/`. Applying the schema **in full** matters — the `security_invoker` hardening for the three views sits at the very end of the file, and a partial apply leaks unpublished match data to anonymous readers.

`supabase/RUN-THIS-NOW.sql` is an operator recovery script for one specific incident: the `stat_events.type` check constraint predating the four `FAULT_*` event types.

---

## 2. The two surfaces

| | Showcase | Console |
| --- | --- | --- |
| Route group | `src/app/(showcase)` | `src/app/console` |
| Auth | none, ever | magic-link sign-in (when Supabase is configured) |
| Purpose | fans, broadcast, league table | league setup, courtside tracking, analytics |
| Data visibility | only matches with `published = true` **and** `status = "completed"` (plus live scoreboards of published matches) | everything |

`Match.published` is the **publish boundary**. It is enforced twice: in the UI (`usePublished()`), and in Postgres via row-level security — so an anon key cannot read an unpublished match's events even by bypassing the UI.

### Route map

**Showcase (public)**

| Route | What it is |
| --- | --- |
| `/` | Match Night homepage — 7 data-driven sections |
| `/live` | Live Match Centre (read-only scoreboard) |
| `/matches` | Match reports list |
| `/matches/[id]` | Public match report |
| `/players/[id]` | Public player profile |
| `/team` | Squads & rosters, with filters |

**Console (gated)**

| Route | What it is |
| --- | --- |
| `/console` | Dashboard — overview, scheduling, match pipeline |
| `/console/league` | League Setup — the registry (league, season, tournaments, venues, teams, players, staff) |
| `/console/analytics` | Season & historical analytics hub |
| `/console/matches/new` | Start-a-Match wizard |
| `/console/matches/[id]/spikes` | **Free-Rally / Spike Tracker** — the primary tracker |
| `/console/matches/[id]/rally` | **Rally Tracker v3** — phase-based engine (URL-only, not linked) |
| `/console/matches/[id]/review` | Post-match review + box score |
| `/console/matches/[id]/analytics` | Per-match advanced analytics |
| `/console/matches/[id]/live` | Retired — client redirect to `/spikes` |
| `/console/login` | Magic-link sign-in (public) |
| `/console/auth/callback` | Magic-link / PKCE handler (public) |

---

## 3. Current features

### 3.1 Domain model

`src/lib/types.ts` mirrors `supabase/schema.sql` 1:1 (camelCase ↔ snake_case). `null` always means "not listed" and is never guessed or filled in.

```
League → Season → Division → Tournament → TournamentGroup → Match
Venue → Court
Team → Staff, Player (denormalized players ⋈ team_players), Honour
Match → MatchSet, MatchOfficial, MatchRosterEntry
StatEvent  ← the single source of truth
```

**Positions** — `OH` Outside Hitter · `OPP` Opposite · `MB` Middle Blocker · `S` Setter · `L` Libero · `DS` Defensive Specialist.

**Staff roles** — `HEAD_COACH`, `ASSISTANT_COACH`, `MANAGER`, `PHYSIO`, `ANALYST`.

**Match status** — `scheduled`, `live`, `completed`, `postponed`, `cancelled` (only the first three are ever produced). `totalSets` is 3 or 5.

**`EventType` — 22 values, the single source of every statistic:**

| Skill | Events |
| --- | --- |
| Attack | `SPIKE_POINT`, `SPIKE_IN`, `SPIKE_ERR` |
| Reception | `RECV_PERFECT`, `RECV_GOOD`, `RECV_POOR`, `RECV_ERR` |
| Setting | `SET_ASSIST`, `SET_GOOD`, `SET_ERR` |
| Blocking | `BLOCK_WIN`, `BLOCK_MISS` |
| Serving | `SERVE_ACE`, `SERVE_IN`, `SERVE_ERR` |
| Defence | `DIG_SUPER`, `DIG_SAVE`, `DIG_FAIL` |
| Faults | `FAULT_NET`, `FAULT_FOUR_HITS`, `FAULT_DOUBLE`, `FAULT_ROTATION` |

Faults are deliberately **not** `SPIKE_ERR`: error rate is `SPIKE_ERR ÷ spike attempts`, and a net touch is not a spike attempt.

A `StatEvent` is `{ id, matchId, teamId, playerId, setNo, type, ts }`. `ts` (epoch ms) preserves entry order, which is what makes undo exact.

### 3.2 League setup (`/console/league`)

The registry. One league is supported (`db.leagues[0]`), one season per league.

- **Competition** — create league (name ≥ 2 chars), season, and tournaments (name, organizer, primary venue, start/end dates). Tournaments are always written with `format: "LEAGUE"`.
- **Venues & courts** — venue name, city, capacity; courts attached to a venue.
- **Teams** — name, short name (defaults to the first 3 characters upper-cased when blank), city. Expandable team cards manage **staff** (name + role) and **players** (full name, jersey #, position, height, nationality). "Make captain" enforces a single captain per roster. Removing a team cascades to its players and staff.
- **One-click seed** — "Load PVL 2025 roster" imports all 10 Prime Volleyball League 2025 franchises and squads from `src/lib/seed/pvl-2025.ts`. **Idempotent by lower-cased team name.** Data-fidelity rules are documented in the seed file: `jerseyNo` and `position` are always `null` (not published in any single source, so never fabricated); `nationality` defaults to the stated assumption `"India"`; `isCaptain` is set for exactly five verified 2025 captains.

### 3.3 Scheduling (`/console`)

- **Overview cards** — Teams, Players, Live now (pulsing when > 0), Published.
- **Setup checklist** — when `!league || !season || no tournaments || teams < 2` the dashboard replaces the scheduling tools with a 4-step progress checklist.
- **Schedule a match** — tournament, home/away team (each select excludes the other's pick), date, time, best-of (3 or 5, default **5**), venue, court. `matchNo` auto-increments per tournament.
- **Match pipeline** — three groups in fixed order: Live now 🔴 · Scheduled 🗓️ · Completed 🏁. Completed rows carry a publish/unpublish toggle, an Analytics link, and a confirm-guarded Delete.
- **Start-a-Match wizard** (`/console/matches/new`) — tap-to-assign teams (first tap = home, second = away), then details. If no competition exists it silently creates defaults: league "VolleyVerse League", season = current year, tournament "Season Fixtures".

### 3.4 The rules engine (`src/lib/rally.ts`)

Pure TypeScript — no React, no DOM, no storage. Fully unit-tested.

**Court model.** `Side = "US" | "OPP"` with a fixed page-level mapping: **US = home team, OPP = away team**. Positions 1–6, `FRONT_ROW = [4,3,2]`, `BACK_ROW = [5,6,1]`. `rotate()` shifts clockwise one slot (P2→P1 … P1→P6). `serverId(lineup) = lineup[1]` — whoever is in P1 serves.

**Toss and first service.** `servingFromToss` resolves the pre-match toss. `firstServerForSet(set, totalSets, toss, decidingToss)`:

- Set 1 → the pre-match toss.
- Deciding set → the fresh deciding toss, and **`null` until that toss is taken** (callers must gate on this).
- Sets 2..N−1 → alternation from the set-1 server. ⚠️ This is an **explicitly stated assumption**, not an FIVB rule: FIVB 7.1 only fixes set 1 and the deciding set. The alternation follows "the near-universal competition convention."

**Side-out and rotation.** `resolvePoint(serving, winner)` → the winner always serves next, and the winner rotates **only if it was receiving**. Losers never rotate.

**The ✓ O ✗ trio.** The operator never picks an action — it is inferred from the rally phase plus the tapped player's row (`inferAction`: `DEFEND` → `BLOCK` if front row, else `DIG`). Then `resolveTrio(action, side, trio)`:

| Action | ✓ WIN | O CONT | ✗ LOSE |
| --- | --- | --- | --- |
| SERVE | `SERVE_ACE`, point | `SERVE_IN` → Receive | `SERVE_ERR`, point to other |
| RECEIVE | `RECV_PERFECT` → Set | `RECV_GOOD` → Set | `RECV_ERR`, point to other |
| SET | `SET_GOOD` → Attack | `SET_GOOD` → Attack | `SET_ERR`, point to other |
| ATTACK | `SPIKE_POINT`, point | `SPIKE_IN` → Defend | `SPIKE_ERR`, point to other |
| BLOCK | `BLOCK_WIN`, point | *no event* → Dig | `BLOCK_MISS`, point to other |
| DIG | `DIG_SUPER` → Set | `DIG_SAVE` → Set | `DIG_FAIL`, point to other |

In words: ✓ on serve/attack/block ends the rally with a point; ✓ on receive/set/dig is a perfect contact that only keeps the rally alive. A super dig **saves, never scores**. Any point sets the next phase to `OVER`.

**Scoring.** `setPointReached(us, opp, target)` = `(us >= target || opp >= target) && |us − opp| >= 2` — win by two, **with no cap** (no 27-point ceiling). `matchTarget(totalSets) = floor(totalSets / 2) + 1` → 3 for best-of-5, 2 for best-of-3.

### 3.5 Free-Rally / Spike Tracker (`/console/matches/[id]/spikes`) — primary

The tracker every button links to. Backed by `src/lib/free-rally.ts`, which drops the fixed touch sequence and keeps **exactly one inference**: the serving side's P1, tapped before anything else in the rally, is a serve — everything else is a spike.

- **Setup wizard** first (toss → home starting six → away starting six → court preview).
- **Input** — tap any of the 12 on-court players (or either libero chip), then ✓ **Point won** / O **Rally continues** / ✗ **Failed**. Tapping the armed player again disarms.
- **Faults** — a "⚠ Fault — point to the other team" panel exposes Net touch, Four hits, Double, Rotation. A fault always ends the rally and always concedes the point.
- **Undo** — one control, two levels: within a rally, drop the last event (and reopen the serve slot if that empties the rally); between rallies, restore the previous snapshot (scores, serving, both lineups) and delete all of its events.
- **Set completion** — `SET_TARGET = 15` **for every set**, win by two. A banner offers "Start set N+1", or "Finish match" once `matchWinner` is decided.
- **Deciding-set toss gate** — when the set number equals `totalSets` and no deciding toss is recorded, the whole screen is replaced by a blocking four-button toss panel.
- **End match** — banks the in-progress set if either score is above 0, then completes the match with the leader **on sets only**.
- **Completed view** — trophy banner, per-set chips read back from `match.setScores` (correct in any browser), and the full spike chart grid.
- **Live charts** — a `SpikeChartGrid` under the court, "updates on every tap": Spike Attempts · Points Won · Success Rate · Error Rate. Players with zero attempts are dropped rather than drawn as 0%.

### 3.6 Rally Tracker v3 (`/console/matches/[id]/rally`) — phase engine

Reachable by URL only. This is the tracker that **publishes live state** to the public `/live` screen.

- Phase banner (Serve / Receive / Set / Attack / Block-Dig / Dig it up) with a **"skip contact →"** action that advances without logging.
- **Serve lock** — on `SERVE` only the serving side's P1 is tappable; on `OVER` nobody; otherwise all 12 players, "because the ball can go anywhere."
- **Auto-arm** — the server on `SERVE`; the acting side's lone on-court setter on `SET`.
- **Assist attribution** — when a tap resolves to `SPIKE_POINT`, the engine looks back through the current rally for that side's most recent `SET`, deletes the `SET_GOOD` and re-adds it as `SET_ASSIST`, recording the swapped id so undo stays exact.
- **Milestone flashes** — a 🏆 season-record toast when `breaksRecord()` fires on an ace or super dig; a 🔥 toast at exactly 3, 5 or 7 in a match.
- **Set target here is `deciding ? 15 : 25`** — different from the spikes tracker (see [§6](#6-known-gaps-and-inconsistencies)).
- **Deciding-set toss modal** — gated on a *genuine* set tie (2–2 in best-of-5, 1–1 in best-of-3), citing FIVB 6.3.2 / 7.1.
- **💾 Save** — an explicit checkpoint for hand-off or video analysis; anyone opening the match on that console resumes from there.
- Hand-off works across console tabs: a `storage` listener applies remote updates so a second collector can follow along and take over from the exact last tap.

### 3.7 Derived metrics (`src/lib/metrics.ts`)

Nothing aggregated is stored — every number recomputes from events.

- **`PlayerLine`** — one counter per event type, rolling up to spike/receive/set/block/serve/dig attempts and successes, plus `points`, `assists`, `blocks`, `aces`, `saves`, `superDigs`, `errors`. All four `FAULT_*` events increment **only** `errors`, keeping spike and serve percentages clean.
- **`positionRate`** — the position-appropriate headline rate: OH/OPP → kill %, S → set %, MB → block %, L/DS → positive first contacts `(receivesGood + saves) ÷ (receiveAttempts + digAttempts)`. `null` when position is unknown.
- **Contribution Index** — `points×2 + assists×1.5 + blocks×2 + aces×2 + superDigs×2.5 + (saves−superDigs)×1 + (spikeSuccesses−points)×0.5 + (setSuccesses−assists)×0.5 − errors`. ⚠️ Flagged in source as a **placeholder pending product sign-off**, yet it drives Player of the Season, the live MVP, the analytics MVP award and box-score ordering.
- **Season records** — best single-match count for `aces`, `superDigs`, `points`, `blocks`. `breaksRecord` only fires when a record already exists and is ≥ 2.
- **Standings** — completed matches only. FIVB league points: set margin ≥ 2 → winner 3, loser 0; otherwise winner 2, loser 1. Tie-breaks in order: points → wins → set ratio → point ratio.

### 3.8 Analytics

A small sport-agnostic framework (`src/lib/analytics/framework.ts`) with a registry; `volleyball.ts` is the one registered module. `resolveSport()` currently always returns `"volleyball"`.

**Per-match (`/console/matches/[id]/analytics`)**

1. Result banner with per-set chips.
2. **8 headline KPIs** — Winner, Sets, Total Points, Duration, Rallies, Biggest Run, MVP, Fastest Point.
3. **"AI Match Summary"** — deterministic, offline, **no model call**. `generateSummary` writes 2–4 sentences (result + margin phrase, the winner's strongest edge among attacking/serving/blocking, the MVP, and a pivotal-run line when the biggest run is ≥ 4). `generateInsights` emits up to 5 threshold-gated insight cards: Serving pressure told 🎯, Discipline gap 🧹, Passing set the platform 🛡️, Won the side-out battle 🔁, Attack efficiency 💥 — with an "An even contest" 📊 fallback.
4. **Flow of the match** — cumulative score timeline and a momentum area chart of the running margin.
5. **Team comparison** — radar + stacked proportion bars over 9 metrics.
6. **Top performers** — MVP, Best Server, Best Attacker, Best Blocker, Best Defender, Best Setter (each emitted only when the underlying stat is > 0).
7. **Team statistics** — 19 rows including side-out %, first-ball side-out % and break-point %. Three rows are honest non-values: Solo Blocks and Block Assists show "—" with the note *"Not captured courtside"*; Ball Possession shows "N/A".
8. **Visual analytics** — attack-outcome and serve-outcome donuts, attack distribution by zone, and a 6-zone court heatmap. ⚠️ Zones are **representative** (placed by player role: OH→4, OPP→2, MB→3, S→2, L→6, DS→5), not tracked coordinates — stated on-screen.
9. **Box score** — Player, Team, Pts, Aces, Blk, Ast, Dig, Err, Eff%, P/Set.
10. **Historical context** — head-to-head, plus a Match Difficulty rating `round(oppWinPct × 0.6 + closeness × 100 × 0.4)` labelled Very hard / Hard / Moderate / Comfortable.

**Rally reconstruction.** `rallyOutcomes()` replays the event log to classify every point as a side-out or a break point, and detects first-ball side-outs. Because the toss is not in the event log, it assumes **odd sets = home served first, even sets = away** — a documented assumption. `tempo()` measures gaps between rallies within a set, discarding anything ≥ 120 s as a stoppage.

**Exports** — CSV (multi-section: fixture, headline, comparison, team statistics, box score), PDF via `window.print()` against a dedicated `@media print` block, and Share via the Web Share API with a clipboard fallback.

**Season hub (`/console/analytics`)** — season overview KPIs (incl. straight-set sweeps and five-setters), win-percentage rankings, season records, a per-team deep-dive (record, recent form, home/away splits, current streak, monthly win-% trend, tournament breakdown), head-to-head, and full match history with CSV export.

### 3.9 Public showcase

- **`/` Match Night** — a floodlit, seven-section homepage: a once-per-session "lights up" intro, a broadcast ticker of the 6 most recent published results, the next fixture with an LED countdown, four count-up scoreboard tiles ("Derived live from N published matches. No hand-typed numbers."), Player of the Season, the latest full-time result, the top 6 of the league table, and up to four "rafter banner" season records. All GSAP/Lenis motion is disabled under `prefers-reduced-motion`.
- **`/live` Live Match Centre** — three states: no match (next fixture + countdown), warming up (line-ups being set courtside), and live. Live shows set/target/venue/elapsed, the score with the serving side accented, a read-only court, "Player of the match, so far", and head-to-head bars in a fixed order: Attack % · Serve % · Reception % · Block % · Aces · Blocks won · Points earned · Errors. A "reconnecting…" chip appears when reads degrade, keeping the last good state on screen.
- **`/matches`, `/matches/[id]`** — report list and full report (count-up figures, top scorer / best setter / wall of the match, points-by-spiker and success-rate charts). An unpublished or nonexistent match returns the **same** 404 panel — deliberately indistinguishable.
- **`/players/[id]`** — position-dependent stat cells (setters get Assists/Sets/Accuracy, middles get Blocks/Saves/Block rate, liberos get Digs/Perfect passes/Positive rate), a trend line across matches, and a match-by-match list.
- **`/team`** — team cards that act as roster filters, plus position filter pills (All / Outside / Opposite / Middle / Setters / Liberos / Def. Spec.).

### 3.10 Sync status surfacing

`SyncIndicator` is the honesty layer for optimistic writes. It renders nothing in offline mode. In cloud mode: a small badge for Connecting… / Syncing… / Synced / "Offline — changes saved", and — when the **database refuses** a write — a loud full-width `role="alert"` panel: *"Not saved to the server"*, the actionable reason, and a warning not to clear browser data because the queued taps live there.

---

## 4. Codebase flow

### 4.1 Layer map

```
src/
├── middleware.ts              Edge auth gate (the only server-side guard)
├── app/
│   ├── layout.tsx             Root layout (server): metadata, fonts, viewport
│   ├── globals.css            Tailwind v4 + brand tokens + @media print
│   ├── (showcase)/            Public pages   — layout is server, all pages "use client"
│   └── console/               Operator pages — layout is server, all pages "use client"
│       └── auth/callback/route.ts   Route handler (server)
├── components/                All "use client": court, charts, analytics, motion, UI kit
└── lib/
    ├── types.ts               Domain model (mirrors schema.sql 1:1)
    ├── repository.ts          The DataProvider contract — types only, no runtime code
    ├── store.tsx              Provider selection + LocalProvider (localStorage)
    ├── providers/
    │   ├── supabase-client.ts    Browser client (memoised, cookie auth)
    │   ├── supabase-server.ts    Per-request server client (never memoised)
    │   ├── supabase-store.ts     The cloud DataProvider: queue, realtime, RLS handling
    │   ├── mappers.ts            snake_case ↔ camelCase, table maps
    │   └── live-state.ts         The live-scoreboard projection channel
    ├── rally.ts               Pure FIVB state machine
    ├── free-rally.ts          Pure sequence-free engine
    ├── spikes.ts              Pure spike tallies
    ├── metrics.ts             Pure derived metrics
    ├── analytics/             Sport-agnostic framework + volleyball module + narrative + export
    ├── auth-routes.ts         Pure route-guard predicates (testable without a Next request)
    └── seed/pvl-2025.ts       Opt-in real dataset
```

**Server vs client.** Only four React/route files are *not* `"use client"`: the root layout, the two route-group layouts, and the auth callback route. Plus two server-only modules: `middleware.ts` and `supabase-server.ts`.

**Consequence: there is no server-side fetching of domain data anywhere.** Server components exist purely for metadata, layout shells, auth and the middleware gate. All reads and writes happen in the browser through `useStore()`. The console layout sets `export const dynamic = "force-dynamic"` precisely because the store is client-backed and these routes must not be statically prerendered.

### 4.2 The repository boundary

`src/lib/repository.ts` defines one interface, `DataProvider`, and contains no runtime code. Two implementations satisfy it, and **swapping them requires no screen changes**:

- `LocalStoreProvider` (in `store.tsx`) — one JSON document at `localStorage["volleyverse:db:v3"]`.
- `useSupabaseBackend()` (in `providers/supabase-store.ts`) — Postgres + Realtime.

`StoreProvider` picks between them once, on `isSupabaseConfigured()`. The branch is stable across renders because env vars don't change at runtime, so hook order stays consistent.

The interface surface:

| Group | Methods |
| --- | --- |
| State | `db`, `ready`, `syncStatus`, `lastError`, `clearErrors()` |
| Generic CRUD | `insert(collection, row)`, `update(collection, id, patch)`, `remove(collection, id)` |
| Match lifecycle | `createMatch`, `startMatch`, `recordSetScore`, `completeMatch`, `deleteMatch`, `setPublished`, `setRosters`, `setOfficials` |
| Events | `addEvent`, `removeEvent`, `removeLatestOfType` |

`insert`, `createMatch` and `addEvent` return **synchronously** — which is why the Supabase backend mints ids client-side with `crypto.randomUUID()`.

`SyncStatus` has six values with documented meanings: `local` (offline provider, no server) · `connecting` · `synced` · `syncing` (writes in flight, optimistic UI already updated) · `offline` (queued, will flush) · **`error` (the database *refused* a write — retrying cannot fix it)**. The last one must be loud, because the optimistic UI already showed the tap landing, so a silent failure looks exactly like success.

### 4.3 One courtside tap, end to end

1. **Operator arms a player and presses ✓ / O / ✗.** The action was inferred, never asked. `resolveTrio()` (pure) returns `{ event, pointTo, nextPhase, nextSide }`.
2. **`store.addEvent(...)`** is called. Assist attribution and milestone checks run here.
3. **Provider write:**
   - *Local mode* — build the event, `setDb` + persist the whole `Db` to `volleyverse:db:v3`. Other tabs of the same browser pick it up via the `storage` event.
   - *Cloud mode* — mint a UUID, **enqueue** `{ upsert, stat_events, row }` into a durable FIFO queue at `volleyverse:sync-queue:v1`, and patch local state immediately so the tap appears within a frame.
4. **Flush → Postgres.** `flush()` drains the queue in order. Three outcomes:
   - **Success** → shift, persist, and when the queue empties, `syncStatus: "synced"`.
   - **Network error** → `setOnline(false)` and stop; `syncStatus: "offline"`. A `window` `"online"` listener re-runs the flush in order.
   - **Database refusal** → the op is *parked* in `volleyverse:sync-rejected:v1` and **shifted out so draining continues**. Without this, one rejected `stat_event` at the head of a FIFO queue silently blocks every later write and the rest of the match never reaches Postgres.
5. **Realtime fan-out.** Postgres publishes the change; every other client on channel `"volleyverse:db"` maps the table to its collections, and re-fetches that **whole collection**, debounced 150 ms per collection. Convergence, not guesswork. The writer's own echo reconciles its optimistic row.
6. **Every screen re-derives.** Nothing aggregated is stored, so `metrics.ts`, `analytics/*` and the narrative generator all recompute from `db.events` + `match.setScores`.
7. **Scoreboard projection (a second, independent channel).** The tracker also calls `pushLiveState(matchId, state)`, upserting one JSONB row into `match_live_state`. On the fan side `useLiveMatch()` finds the first live match, reads the localStorage cache, layers a **2 s poll** plus a `storage` listener as a fallback, and subscribes to `volleyverse:live:<matchId>`. `stat_events` remains the durable truth — this row can always be rebuilt from it.
8. **Undo** removes the events it created, including the assist-upgrade swap.
9. **Banking a set** is a keyed upsert on `(match_id, set_no)` — which is what makes replay idempotent.

### 4.4 Error handling worth copying

Two decisions in `supabase-store.ts` carry most of the reliability weight:

- **`readTable()` throws on error rather than returning `[]`.** Mapping a refusal to an empty array makes "the server said no" indistinguishable from "there is nothing here" — and callers then write that emptiness over data already on screen. One failed refresh would blank the screen, silently. A failed refresh instead keeps the last good data and appends *"— still showing the last data that loaded."* to `lastError`.
- **`isRefusedByDatabase(err)`** separates *retry-able* from *hopeless*. Network-shaped messages → retry. A PostgREST error `code` → the database decided, and retrying can never succeed. `describe()` then turns SQLSTATEs into actionable text: `23514` → "a migration is probably missing — run the SQL in supabase/migrations/"; `23503` → "it references a row that does not exist"; `42501` → "permission denied by row-level security … Are you still signed in?".

### 4.5 Row ↔ domain mapping

`mappers.ts` is the only place snake_case ↔ camelCase happens. Two maps drive everything:

- `TABLE_FOR_COLLECTION` — note the non-obvious ones: `groups → tournament_groups`, `players → team_players` (read via the `roster_view` view), `events → stat_events`.
- `COLLECTIONS_FOR_TABLE` — the reverse fan-out that drives realtime reloads, including the joins: `team_honours → [teams]`, `match_officials`/`match_sets`/`match_rosters` → `[matches]`.

All `*ToRow` functions take a `Partial<T>` and emit **only the keys actually present**, which is what makes partial-patch upserts safe.

The `players` split is the one genuinely two-table entity: a **person** row in `players` (name, height, nationality, photo) and a **registration** row in `team_players` (team, jersey, position, captain, reserve). The app's `Player.id` is the *registration* id, so removing a player deletes the registration, not the person.

### 4.6 Database

18 tables, all UUID PKs via `pgcrypto`. Cascades are the backbone: deleting a match is a single `DELETE` that fans out to `match_sets`, `match_rosters`, `match_officials`, `stat_events` and `match_live_state`.

Notable constraints:

- `matches`: `check (total_sets in (3,5))`, `check (home_team_id <> away_team_id)`
- `match_sets`: `unique (match_id, set_no)` — the `onConflict` target for idempotent replay
- `team_players`: `unique (team_id, season_id, jersey_no)`
- `stat_events.type`: a check constraint over all 22 event types
- `match_live_state`: `match_id` is the primary key, with a `touch_live_state()` trigger stamping `updated_at` so late joiners can tell how stale the projection is

Three views: `roster_view` (the denormalized player read), `match_statistics`, and `standings` (which mirrors `metrics.ts` — 3 points for a 2+ set-margin win, else 2/1, with a `rank()` window per tournament).

Realtime: `replica identity full` + added to the `supabase_realtime` publication for 18 tables. `replica identity full` is what makes DELETE and UPDATE events carry the full old row, which is what makes delete propagation work.

### 4.7 Offline vs cloud, side by side

| | Supabase configured | Not configured |
| --- | --- | --- |
| Provider | `useSupabaseBackend()` | `LocalStoreProvider` |
| Source of truth | PostgreSQL | `localStorage["volleyverse:db:v3"]` |
| Starting data | whatever is in Postgres | empty — the platform ships with no data |
| Multi-user sync | Realtime, 17 tables, 150 ms debounce | none — only `storage` across tabs of one browser |
| Live scoreboard | `match_live_state` + dedicated channel | localStorage + `storage` + 2 s poll |
| Offline writes | durable FIFO queue, refusals parked | n/a — localStorage never refuses |
| `syncStatus` | connecting → syncing → synced / offline / error | always `local` |
| Ids | `crypto.randomUUID()` | `prefix_base36time_counter` |
| `/console` access | magic-link gated | open in dev, **fails closed in production** |

Nothing throws when unconfigured. Every `getSupabase()` call site handles `null`.

### 4.8 Tests

`npm test` runs four pure-logic suites through `node --experimental-strip-types` — no DB, no browser, no dependencies beyond `node:assert/strict`, with a zero-dependency ANSI renderer (`src/lib/console-ui.mjs`) for output.

| Suite | Covers |
| --- | --- |
| `rally.test.mjs` | 11 suites over the FIVB engine, including an **exhaustive invariant** across all 6 actions × 3 trios: a resolution either awards a point *and* ends the rally, or awards none *and* advances — never neither |
| `auth-routes.test.mjs` | Every route-guard predicate, plus the misconfiguration matrix |
| `spikes.test.mjs` | Spike-tally definitions, including "no attempts → `null`, not zero" and "faults are not spike attempts" |
| `free-rally.test.mjs` | The serve slot, serve/spike outcomes on both sides of the net, faults, and acceptance cases the phase engine cannot express |

⚠️ A fifth file, `src/lib/analytics/analytics.test.mjs`, is **not** wired into `npm test` — its header requires a `--loader ./resolver.mjs` that does not exist in the repo.

---

## 5. Authentication & authorization

### 5.1 Method

**One method only: Supabase email magic link (email OTP), invite-only.**

There is no password sign-in, no OAuth provider, no SMS, no anonymous sign-in. The single sign-in call in the codebase is:

```ts
supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false, emailRedirectTo },
});
```

`shouldCreateUser: false` means **the sign-in form can never create an account**. Staff are added via the Supabase dashboard → Authentication → Users → Invite user, with "Allow new users to sign up" disabled. If an address has not been invited, no link is sent.

Built on `@supabase/ssr` (v0.12) + `@supabase/supabase-js`. The deprecated `@supabase/auth-helpers-*` packages are explicitly forbidden.

### 5.2 Sign-in flow

1. Unauthenticated request to a console path, e.g. `GET /console/analytics`. Middleware runs and calls `supabase.auth.getClaims()`. No claims → redirect.
2. → `/console/login?next=%2Fconsole%2Fanalytics`. The `next` param is `pathname + search`; any pre-existing query on the login URL is wiped first.
3. Login page reads `next` (default `/console`) and any `?error=` message.
4. User submits their email. The page builds `emailRedirectTo = <origin>/console/auth/callback?next=<next>` and calls `signInWithOtp`.
5. Success → a "Check your email" panel that also explains the invite-only behaviour.
6. The user opens the emailed link, which points at the callback route with `token_hash` and `type`.
7. **`/console/auth/callback`** handles **both** link shapes: `?token_hash=…&type=…` → `verifyOtp()`, or `?code=…` → `exchangeCodeForSession()` (PKCE). Neither present → failure.
8. The session is written to **cookies** by the server client's `setAll` adapter.
9. Redirect to the validated destination.
10. Subsequent requests pass the middleware check. The nav's account controls call `getUser()` and subscribe to `onAuthStateChange` to display the signed-in email.

**Failures** redirect to `/console/login?error=<message>`, surfaced in a `role="alert"` on the login page.

### 5.3 Sessions and cookies

**Cookies, not localStorage** — deliberately, so the server can read the session. Three clients, each with a distinct lifecycle:

| Client | File | Notes |
| --- | --- | --- |
| Browser | `supabase-client.ts` | `createBrowserClient`, **memoised** at module scope so every hook shares one websocket. Realtime capped at `eventsPerSecond: 20` so a fast courtside tapper can't flood subscribers. **No `auth` options block is passed on purpose** — `createBrowserClient` installs its own cookie storage adapter, and passing `persistSession`/`autoRefreshToken` would override it and put the session back on localStorage. |
| Server | `supabase-server.ts` | `async`, awaits `cookies()`, and is **never memoised** — each request carries its own cookies. Its `setAll` is wrapped in try/catch because a Server Component's cookie store is read-only; swallowing is safe because middleware refreshes the session on every request. |
| Middleware | `middleware.ts` | Does the double-write dance `@supabase/ssr` requires: write cookies onto `request.cookies`, recreate the response with `NextResponse.next({ request })`, then write them onto `response.cookies`. |

All three use the `getAll`/`setAll` cookie API — the single-cookie `get`/`set`/`remove` API was removed in `@supabase/ssr` v0.12 and would break.

**Verification is `getClaims()` only.** From the source: *"getClaims() verifies the JWT signature against the project's published keys. Never use getSession() here — its cookie payload is spoofable."* There are **zero** `getSession()` calls in the repo. `getUser()` appears exactly once, client-side, for display.

**Token refresh** happens in the middleware on every matched request — which is why the matcher is deliberately wider than `/console`.

### 5.4 The gate

```ts
// src/middleware.ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
```

Everything except static assets. It runs on the public showcase too — that keeps the session cookie refreshed site-wide, and `requiresAuth()` decides what actually gets gated.

All guard logic lives in `src/lib/auth-routes.ts` as pure string functions, kept out of the middleware so it can be tested without constructing a Next request:

| Identifier | Value |
| --- | --- |
| `CONSOLE_PREFIX` | `/console` |
| `LOGIN_PATH` | `/console/login` |
| `CALLBACK_PATH` | `/console/auth/callback` |
| `PUBLIC_CONSOLE_ROUTES` | `[LOGIN_PATH, CALLBACK_PATH]` |

- **`requiresAuth(pathname)`** — true for any `/console` path except the two public ones. Prefix look-alikes are handled: `/consoles` and `/console-x/y` are not guarded; `/console/loginx` **is**.
- **`gatesWhenUnconfigured(pathname, isProduction)`** = `isProduction && requiresAuth(pathname)`.

The decision table:

| Condition | Behaviour |
| --- | --- |
| Env vars missing, `gatesWhenUnconfigured` true | redirect to login — **production fails closed** |
| Env vars missing, otherwise | pass through — dev/offline escape hatch |
| Configured, no claims, `requiresAuth` true | redirect to login with `?next=` |
| Configured, otherwise | continue with refreshed cookies |

`gatesWhenUnconfigured` exists because of a real incident, recorded verbatim in the source and the tests: *"A Vercel deploy shipped without NEXT_PUBLIC_SUPABASE_* once, and the middleware's pass-through left /console open to the public internet."*

### 5.5 Redirect safety and sign-out

**Open-redirect guard** in the callback route:

```ts
const next = searchParams.get("next") ?? "/console";
const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/console";
```

Same-origin relative paths only. The `//` check blocks protocol-relative URLs like `//evil.com`.

**Sign-out** is client-side: `auth.signOut()` → `router.replace(LOGIN_PATH)` (no `next` param, and `replace` so the back button can't return to the console URL) → `router.refresh()` to discard cached server output. The button only renders when Supabase is configured and an email is present, so it disappears entirely in offline mode.

### 5.6 Behaviour when Supabase is not configured

- **Non-production** — the console is an open pass-through, and the login page says so: *"This deployment runs in offline mode — no sign-in required."* This is intentional: it keeps the offline `LocalStoreProvider` reachable with no `.env.local`.
- **Production** — fails closed. Every console route redirects to the login page.

### 5.7 Row-level security

RLS is where authorization actually lives. It is enabled on 18 tables, and the whole model keys off **`auth.role() = 'authenticated'`** — a single implicit staff role.

**The publish boundary (4 tables, hand-written policies):**

| Policy | Table | Rule |
| --- | --- | --- |
| `public reads published matches` | `matches` | `SELECT` where `published = true OR authenticated` |
| `public reads events of published matches` | `stat_events` | `SELECT` via an `EXISTS` on the parent match |
| `public reads sets of published matches` | `match_sets` | same |
| `public reads live state of published matches` | `match_live_state` | same |
| `staff writes matches` / `events` / `sets` / `live state` | those 4 | `FOR ALL`, `USING` and `WITH CHECK` = `authenticated` |

A live match's scoreboard is treated as broadcast content — public the way the gym scoreboard is — but still only once the match is published.

**Reference-data hardening (14 tables, generated by a `DO` block):** for each of `leagues`, `seasons`, `divisions`, `venues`, `courts`, `tournaments`, `tournament_groups`, `teams`, `team_honours`, `staff`, `players`, `team_players`, `match_officials`, `match_rosters` — a `public reads <table>` policy (`SELECT USING (true)`) and a `staff writes <table>` policy (`FOR ALL`, authenticated). From the source: *"This is what makes the console lock real — without it the public anon key can write straight past the UI."*

**Views:** `alter view roster_view / match_statistics / standings set (security_invoker = true)` — because views bypass RLS unless they run as the caller, and without this the publish boundary leaks straight through `match_statistics` and `standings`.

**Net effect:**

- **anon** — reads all reference data; reads matches/events/sets/live-state **only for published matches**; **no writes anywhere.**
- **authenticated** — reads everything including unpublished matches; full write access on all 18 tables. No further distinction.

### 5.8 Security notes to be aware of

Some of these are intentional for v1, some are latent. All are worth knowing before go-live.

**Strengths worth keeping**

- No service-role key anywhere. Every server client uses the anon key, so server code is subject to the same RLS as the browser.
- `getSession()` is banned; only signature-verified `getClaims()` is used.
- Open-redirect guard on the callback.
- Production fails closed on missing env vars.

**Gaps**

1. **No role or permission model.** v1 has a single implicit "staff" role — any authenticated user gets the full console. There is no `profiles` table, no role column, no `auth.uid()` usage anywhere, and no per-league or per-team tenancy check. Any user in `auth.users` can read and write all 18 tables, including deleting leagues and editing another team's roster.
2. **`auth.role()` is a deprecated helper.** The modern equivalents are `auth.jwt() ->> 'role'` or a `TO authenticated` clause. On a Postgres version where `auth.role()` is absent or null, every `staff writes …` policy silently evaluates false (writes break for everyone) and staff lose visibility of unpublished matches. Worth verifying against the target Postgres version.
3. **`security_invoker` is set 330 lines after the views are created.** A partial apply of `schema.sql` — which the docs actively encourage in places — leaves `match_statistics` and `standings` running as owner, leaking unpublished match data to anon. Always apply the file in full.
4. **The middleware is the only gate on the console UI.** The console pages are client components with no server-side claims check, and the console layout performs no auth check. The real backstop is RLS, which is sound for *data* — but a matcher regression would expose the console shell and publicly-readable reference data to anonymous visitors.
5. **`?error=` is reflected onto the sign-in page.** React escapes it, so this is not XSS — but it is an unauthenticated, attacker-controlled message rendered in a `role="alert"` on the official login page, which enables convincing phishing text.
6. **Non-production offline mode is fully open by design.** The gate is `NODE_ENV === "production"`, so a preview or staging deploy running with `NODE_ENV=development` and missing env vars is open to the internet — precisely the class of incident that already happened once.
7. **Magic-link-only means no fallback.** If email delivery fails, or a staff member's inbox is unreachable courtside, there is no alternate credential path. Combined with invite-only, account recovery is entirely a dashboard operation.
8. **Test coverage is limited to the route predicates.** There are no automated tests for the callback route, the `safeNext` guard, the middleware itself, sign-out, or any RLS policy.

---

## 6. Known gaps and inconsistencies

Flagged honestly so nobody rediscovers them the hard way.

**Routing**

1. **`/console/matches/[id]` does not exist.** The setup wizard's "← Exit" link points at it and 404s. `README.md` also documents it, plus `/console/players`, which also doesn't exist. The publish control actually lives on the `/console` dashboard rows.

**Two trackers, two rule sets**

2. `/spikes` (free-rally) is the tracker every button links to. `/rally` (phase engine) is reachable only by typing the URL. They use different localStorage keys, different set targets, and different undo granularity.
3. **Only `/rally` publishes live state.** So with the default tracker, the public `/live` screen never leaves the "Warming up" state.
4. **Three set targets coexist:** `SET_TARGET = 15` (spikes tracker, every set), `deciding ? 15 : 25` (rally tracker), and `/live`'s "to 15 / to 25" header label.
5. **Deciding-set toss gates differ:** the rally tracker requires a genuine set tie; the spikes tracker prompts whenever `set === totalSets` regardless of the score.
6. **The rally tracker never auto-completes a match** on reaching the match target; the spikes tracker does. Banking the last set in the rally tracker pins the set number at `totalSets` with counters reset — the operator must press "End match".

**Data coverage**

7. **Free-rally coverage gap.** The default tracker only emits serve, spike and fault events. Reception, setting, block and dig statistics — and therefore assists, defensive score, Best Setter/Blocker/Defender, the Floor Defenders board, super-dig records, and the L/DS/MB/S headline rates — are structurally **zero** for matches tracked with it.
8. **Faults are invisible to analytics.** `FAULT_*` events count as `errors` in `metrics.ts`, but are excluded from the analytics module's terminal-event sets, so they never appear in progression, momentum, rally counts, side-out %, break %, or the narrative's error totals.
9. **`RECV_POOR`** is a defined event type with counters that nothing can produce.
10. **No substitution feature exists.** Liberos are modelled as a chip, not a replacement. There is no bench-in/out, no sub counter, and no rotation-fault enforcement — rotation faults are a manual button only.
11. **Officials, divisions and tournament groups have no UI.** `setOfficials` and `removeLatestOfType` are on the provider contract but called by no screen; `groupId` is always written `null` and `format` is always `"LEAGUE"`.
12. **`/console/matches/[id]/review` has no editing UI**, despite the README calling it "Post-match corrections".

**Stated assumptions in the maths**

13. **Set-to-set service alternation** (sets 2..N−1) is a competition convention, not an FIVB rule.
14. **Analytics assumes odd sets = home served first, even sets = away**, because the toss is not in the event log.
15. **Court zones are placed by player role**, not tracked coordinates — surfaced on-screen as a footnote.
16. **The Contribution Index is a placeholder** pending product sign-off, yet it drives Player of the Season, the live MVP, the analytics MVP award and box-score ordering.

**Docs and dead code**

17. **`README.md` is stale on the backend** — it still describes `providers/supabase.ts` as a stub and tells you to implement `createSupabaseProvider()`, a function that does not exist. The work shipped as `useSupabaseBackend()`. The README has no env-var section and no sign-in documentation.
18. **`REFACTOR_AUDIT.md` is a historical planning document** (dated 2026-07-14, "Awaiting approval — no code changed yet") superseded by the code. Its `DataProvider` sketch is **not** the interface that shipped. Do not quote it as current design.
19. **`REALTIME_SYNC.md` is the accurate design-of-record**, with one stale reference (`.env.local.example`).
20. **Dead code:** four chart components (`SetterAccuracyVsAssists`, `ReachVsSuccess`, `AcesByPlayer`, `SuperDigsByPlayer`) and four motion/UI components (`Marquee`, `TiltCard`, `HeroCamera`, `BigStat`) are defined but rendered nowhere. `analytics.timeline` is computed (set-end items only) and rendered nowhere.
21. **`useLiveMatch` picks the first live match only** — concurrent live matches are unsupported on the public side.

---

## Appendix: storage keys

| Key | Written by | Contents |
| --- | --- | --- |
| `volleyverse:db:v3` | `LocalStoreProvider` | the whole `Db` as one JSON document |
| `volleyverse:rally:<matchId>` | Rally Tracker | resumable `MatchState` + the live-state cache |
| `volleyverse:free:<matchId>` | Spike Tracker | resumable `FreeMatchState` |
| `volleyverse:sync-queue:v1` | Supabase backend | durable FIFO of pending writes |
| `volleyverse:sync-rejected:v1` | Supabase backend | writes the database refused |
| `vv-lights-up` (sessionStorage) | homepage | one-per-session intro flag |

The `v3` in the db key is intentional: it discards v2 prototype data.
