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

## Rules engine

`src/lib/rally.ts` is a pure FIVB state machine (rotation for both
teams, side-out, toss alternation, 25/15 set targets). The engine's
abstract sides `US`/`OPP` map to the **home**/**away** team at the page
level. Tests: `node src/lib/rally.test.mjs`.

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
`src/lib/providers/supabase.ts` (queries, mutations, realtime channels,
auth). The publish boundary is enforced by RLS.
