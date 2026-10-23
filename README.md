# Volleytics

A professional volleyball **league management platform**: competition
structure (League → Season → Tournament → Match), two-team live match
tracking, derived statistics, standings and a broadcast-styled public
showcase.

## Architecture

- **Event-sourced statistics.** `StatEvent` is the single source of
  truth. Every number on the platform — match stats, attack/serve/
  reception percentages, standings, season records — is derived in
  `src/lib/metrics.ts`. Nothing is hand-stored.
- **Repository boundary.** The UI talks only to the `DataProvider`
  surface (`src/lib/repository.ts`). `StoreProvider` picks one
  implementation at load: the localStorage `LocalProvider`
  (`src/lib/store.tsx`, offline-first) when no Supabase env vars are set,
  otherwise the Supabase backend (`src/lib/providers/supabase-store.ts`,
  Postgres plus Realtime). Screens are the same either way.
- **Relational model.** TypeScript entities (`src/lib/types.ts`) mirror
  the PostgreSQL schema (`supabase/schema.sql`) 1:1: leagues, seasons,
  divisions, tournaments, groups, venues, courts, teams, staff,
  players (`roster_view`), matches, officials, match_sets,
  match_rosters, stat_events — plus derived `match_statistics` and
  `standings` views and RLS policies (see **Access** below).
- **No seed data in the platform itself.** Everything is created in the
  console under **League Setup**. The one exception is first run offline:
  an empty localStorage store seeds itself with the Guardians Trophy U21
  league (`src/lib/seed/u21-guardians-trophy.ts`) so a shared build opens
  with a tournament in it rather than a blank registry. It happens once per
  browser, never when a team already exists, and never on the Supabase path
  — a shared database is seeded once, by hand, from League Setup. Set
  `NEXT_PUBLIC_AUTOSEED=off` to start clean.

## App structure

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

## Access

Routes are gated in `src/middleware.ts`, with the predicates in
`src/lib/auth/routes.ts`:

| Route | Needs |
| --- | --- |
| `/login`, `/fans/sign-in`, `/fans/join`, `/auth/callback` | nothing |
| `/console/*` | an `admin` or `super_admin` row in `user_roles` (or a legacy `console_admins` row) |
| `/admin` | `super_admin` |
| everything else | any signed-in account |

Staff and fans are one Supabase Auth account system
(`src/lib/auth/temporary-auth.ts` and `temporary-fan-auth.ts`; the names
outlived the stand-ins they replaced). Fans create their own accounts at
`/fans/join`; console access comes from a role in `user_roles`, which a
super admin grants at `/admin`.
With no Supabase env vars nothing can be verified, so `next dev` lets every
route through and a production build refuses instead.

Middleware is routing; row-level security is the boundary. Writes need a
console admin. Reads are still open to the anon key, which ships in the
public JS bundle, so anyone can read every table, unpublished matches
included: `published` is a filter the showcase honours, not a boundary the
database enforces.

## Rules engine

`src/lib/rally.ts` is a pure FIVB state machine (rotation for both
teams, side-out, toss alternation, set targets). The console's scorer,
`/spikes`, plays every set to 15 (`SET_TARGET`); the parked `/rally`
tracker plays to 25 with a 15-point deciding set. The engine's abstract
sides `US`/`OPP` map to the **home**/**away** team at the page level.
Tests: `node --experimental-strip-types src/lib/rally.test.mjs`.

`src/lib/substitution.ts` handles everything that changes the court
without a rally, on one principle: **a rotation slot is the identity, not
the player in it.**

- **Substitutions** are the coach's, through an always-visible SUB button on
  both live trackers. The incoming player takes the outgoing player's exact
  slot and inherits their place in the rotation completely. Unrestricted,
  with a per-set counter per team.
- **The libero swap is automatic**, driven only by who holds the serve:
  serving → Middle Blocker on court, libero on the bench; receiving → libero
  on court in the **back-row** Middle Blocker's slot (FIVB 19.3.2.1). When
  the serve comes back the Middle Blocker returns to the slot the rotation
  owes them. It never counts as a substitution and never asks the user
  anything.

Ordering contract: on a side-out, **rotate first, then sync the liberos**.
Design note: `docs/superpowers/specs/2026-08-11-substitution-libero-design.md`.
Tests: `node --experimental-strip-types src/lib/substitution.test.mjs`.

## Development

```bash
npm install
npm run dev
npm test     # Node 22.6 or later
```

First run: open `/console/league` (with Supabase configured, sign in at
`/login` first), create your league, season, a tournament, venues, at
least two teams with 6+ players each, then schedule a match from Match Day.

## Supabase

Apply `supabase/schema.sql` to a new project, then the dated files in
`supabase/migrations/`: the schema file predates them, and its row-level
security notes say which migrations replace its open policies. Set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to switch the
app from local mode to the database. `REALTIME_SYNC.md` covers reads,
writes, the offline queue and conflicts.
