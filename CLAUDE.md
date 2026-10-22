# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VolleyVerse: a volleyball **league management platform** — competition
structure (League → Season → Tournament → Match), two-team live match
tracking, derived statistics, standings, and a broadcast-styled public
showcase. Next.js 15 (App Router) + React 19 + TypeScript, Tailwind v4,
Supabase (Postgres) as the optional backend.

## Commands

```bash
npm install
npm run dev      # dev server
npm run build    # production build (also the closest thing to a typecheck gate)
npm run start    # run the production build
npm test         # runs every suite in package.json's test script, sequentially
```

There is no lint script and no test framework/runner — tests are plain
Node scripts using `node:assert/strict`, executed directly via
`node --experimental-strip-types <file>.test.mjs` against the `.ts` source
they import (Node 22.6 or later). `npm test` chains every suite listed in
`package.json`; a new `*.test.mjs` file only runs once it is added there.

To run a single suite: `node --experimental-strip-types src/lib/rally.test.mjs`.
`src/lib/console-ui.mjs` is a zero-dependency terminal renderer for these
test suites' output only — no test logic lives there.

There's no `.env` file in the repo. With no `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` set, the app silently runs fully local
(localStorage-backed) — this is the normal/default dev mode. See
`REALTIME_SYNC.md` for wiring up a real Supabase project.

## Architecture

### Event-sourced statistics — the core invariant

`StatEvent` (append-only) is the single source of truth. **No statistic,
score, or standing is ever hand-stored.** Every number shown anywhere —
match stats, attack/serve/reception percentages, standings, season
records — is derived from `StatEvent`s (+ set scores) in `src/lib/metrics.ts`
and `src/lib/analytics/`. When adding a feature that needs a new number,
derive it from events rather than adding a stored field.

### Repository boundary

The UI talks only to the `DataProvider` interface defined in
`src/lib/repository.ts`. Two implementations satisfy it, chosen once at
load by `StoreProvider`:

- **LocalProvider** (`src/lib/store.tsx`) — localStorage-backed,
  offline-first; the whole DB is one JSON document; cross-tab sync via the
  browser `storage` event. Used whenever Supabase env vars are absent.
- **SupabaseBackend** (`src/lib/providers/supabase-store.ts`) — Postgres
  as source of truth, Supabase Realtime for cross-client sync, RLS for
  access (see **Access** below). `src/lib/providers/mappers.ts` handles all
  camelCase (`types.ts`) ↔ snake_case (`schema.sql`) translation.

Because both satisfy `DataProvider`, **swapping providers requires no
screen/component changes** — never bypass this boundary by having a
component reach into either implementation directly. Full read/write/
conflict/offline semantics are documented in `REALTIME_SYNC.md`; read it
before touching sync, live-state, or provider code.

Live courtside match state (lineups, running score, current rally) is
separate from the relational tables: it's mirrored as one JSONB row per
match in `match_live_state` (`src/lib/providers/live-state.ts`) so other
devices can watch the score move live. It's a rebuildable projection, not
a source of truth — `stat_events` remains authoritative.

### Relational model

`src/lib/types.ts` (camelCase) mirrors `supabase/schema.sql` (snake_case)
1:1: leagues, seasons, divisions, tournaments, groups, venues, courts,
teams, staff, players (`roster_view`), matches, officials, match_sets,
match_rosters, stat_events — plus derived `match_statistics` and
`standings` views and RLS policies. `schema.sql` predates the dated files
in `supabase/migrations/`, which the live database has applied. There
is no seed data in production paths — everything is created via
**League Setup** in the console (`src/lib/seed/pvl-2025.ts` is demo-only
seed data, not used at runtime by default).

### Rules engine

`src/lib/rally.ts` is a pure FIVB state machine (rotation for both teams,
side-out, toss alternation, set targets). The console's scorer, `/spikes`,
plays every set to 15 (`SET_TARGET`); the parked `/rally` tracker plays to
25 with a 15-point deciding set. It works in abstract sides `US`/`OPP`,
which the page level maps to home/away team ids.

`src/lib/substitution.ts` handles everything that changes the court
without a rally, on one principle: **a rotation slot is the identity, not
the player in it.**

- **Substitutions** are the coach's, via an always-visible SUB button. The
  incoming player takes the outgoing player's exact slot and inherits
  their place in the rotation. Unrestricted, with a per-set counter per
  team.
- **The libero swap is automatic**, driven only by who holds serve:
  serving → Middle Blocker on court, libero on the bench; receiving →
  libero on court in the **back-row** Middle Blocker's slot (FIVB
  19.3.2.1). It never counts as a substitution and never prompts the user.
- **Ordering contract:** on a side-out, rotate first, then sync the
  liberos. Getting this order wrong is the most common bug class in this
  file. Design note: `docs/superpowers/specs/2026-08-11-substitution-libero-design.md`.

### App structure (route → purpose)

| Route | Purpose |
| --- | --- |
| `/` | Public league homepage: live strip, next fixture, standings, records |
| `/live` | Live Match Centre (read-only second screen) |
| `/matches`, `/matches/[id]` | Published results and match reports |
| `/team`, `/players/[id]` | Teams, rosters and player profiles |
| `/login` | Staff sign-in |
| `/fans/sign-in`, `/fans/join` | Fan sign-in and sign-up |
| `/reset-password`, `/auth/callback` | Password reset; landing route for Supabase Auth links |
| `/console` | Match day home |
| `/console/league` | League setup: competition, venues, teams, players, staff |
| `/console/matches/new` | Schedule a match (tournament, teams, rosters) |
| `/console/matches/[id]/spikes` | Courtside scorer every console link opens (toss → line-ups → live) |
| `/console/matches/[id]/rally` | Earlier full rally tracker: parked, loads by URL only |
| `/console/matches/[id]` | Match dashboard + publish control |
| `/console/matches/[id]/review` | Post-match corrections |
| `/console/players`, `/console/analytics` | Player and season analytics |
| `/admin` | Super-admin panel: who holds which role |

`/` through `/players/[id]` and `/fans/*` live under the `(showcase)` route group.

### Access

`src/middleware.ts` gates routes with the predicates in
`src/lib/auth/routes.ts`. `/console/*` needs an `admin` or `super_admin`
row in `user_roles` (or a legacy `console_admins` row), `/admin` needs
`super_admin`, every other page needs a signed-in account, and the sign-in
pages are open. Staff and fans are one Supabase Auth account system. With
no Supabase env vars, `next dev` lets every route through.

Middleware is routing; RLS is the security boundary. Writes need a console
admin, but reads are open to the anon key, unpublished matches included,
so `published` is a filter the showcase honours rather than a boundary the
database enforces. Keep that in mind when reasoning about data exposure.

### Path alias

`@/*` maps to `./src/*` (see `tsconfig.json`).
