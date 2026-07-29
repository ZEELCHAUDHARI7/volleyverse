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
| `/console/matches/[id]/spikes` | Courtside spike tracker (tap a player → ✓ O ✗) |
| `/console/matches/[id]` | Match dashboard + publish control |
| `/console/matches/[id]/review` | Post-match corrections |
| `/console/players`, `/console/analytics` | Player and season analytics |

## Tracking model

There is no rally phase model. Real rallies do not follow a fixed
serve → receive → set → spike sequence — a team may send the ball back
on one touch, and the same attacker can swing twice in one rally — so
the tracker never asks who received or who set.

Every player on both rosters stays on screen. Tap whoever spiked, then
say what happened:

| Button | Meaning | Recorded as |
| --- | --- | --- |
| `✓` | Won the point | `SPIKE_POINT` |
| `O` | Rally continues | `SPIKE_IN` |
| `✗` | Failed — net or out | `SPIKE_ERR` |

One tap is one attempt. A rally where a spiker needs two swings to win
the point is two taps, which is what makes that spiker read 1-for-2 —
50% — instead of 100%. `src/lib/spikes.ts` is the pure module that maps
buttons to events and derives every tally. Tests:
`node --experimental-strip-types src/lib/spikes.test.mjs`.

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
