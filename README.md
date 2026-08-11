# VolleyVerse

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
  surface (`src/lib/repository.ts`). Today that is the localStorage
  `LocalProvider` (`src/lib/store.tsx`, offline-first courtside queue);
  `src/lib/providers/supabase.ts` is the stub for the PostgreSQL
  swap — no screen changes required.
- **Relational model.** TypeScript entities (`src/lib/types.ts`) mirror
  the PostgreSQL schema (`supabase/schema.sql`) 1:1: leagues, seasons,
  divisions, tournaments, groups, venues, courts, teams, staff,
  players (`roster_view`), matches, officials, match_sets,
  match_rosters, stat_events — plus derived `match_statistics` and
  `standings` views and RLS policies for the publish boundary.
- **No seed data.** The platform starts empty; everything is created in
  the console under **League Setup**.

## App structure

| Route | Purpose |
| --- | --- |
| `/` | Public league homepage: live strip, next fixture, standings, records |
| `/live` | Live Match Centre (read-only second screen) |
| `/matches`, `/matches/[id]` | Published results and match reports |
| `/team`, `/players/[id]` | Teams, rosters and player profiles |
| `/console` | Match day home |
| `/console/league` | League setup: competition, venues, teams, players, staff |
| `/console/matches/new` | Schedule a match (tournament, teams, rosters) |
| `/console/matches/[id]/rally` | Courtside rally tracker (toss → line-ups → live) |
| `/console/matches/[id]` | Match dashboard + publish control |
| `/console/matches/[id]/review` | Post-match corrections |
| `/console/players`, `/console/analytics` | Player and season analytics |

The console has **no sign-in**: there is no login route, no auth middleware
and no route guard. Everything under `/console` is open to whoever can reach
the deployment — put it behind a network boundary if that matters. The
publish flag still decides what the public routes show.

## Rules engine

`src/lib/rally.ts` is a pure FIVB state machine (rotation for both
teams, side-out, toss alternation, 25/15 set targets). The engine's
abstract sides `US`/`OPP` map to the **home**/**away** team at the page
level. Tests: `node src/lib/rally.test.mjs`.

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
Tests: `node src/lib/substitution.test.mjs`.

## Development

```bash
npm install
npm run dev
```

First run: open `/console/league`, create your league, season, a
tournament, venues, at least two teams with 6+ players each — then
schedule a match from Match Day.

## Backend integration (next step)

Apply `supabase/schema.sql` to a Supabase project and implement
`createSupabaseProvider()` per the notes in
`src/lib/providers/supabase.ts` (queries, mutations, realtime channels).
Everything runs on the anon key — there is no console sign-in — so the
publish boundary is enforced entirely by RLS.
