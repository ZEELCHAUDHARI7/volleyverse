# VolleyVerse — Dummy Data Audit & Refactor Plan

**Date:** 2026-07-14 · **Status:** Awaiting approval — no code changed yet.
Goal: prototype → production-ready professional volleyball league management platform (Supabase/PostgreSQL-ready).

---

## 1. Complete Audit of Dummy Data

Good news first: the architecture is already event-sourced with a repository boundary. **No stats, standings, or schedules are hardcoded in components** — every number derives from `StatEvent`s via `metrics.ts`. The dummy data is concentrated in three lib files plus scattered brand literals.

### 1.1 Data & state layer

| File | Component/Module | Purpose | Recommendation |
|---|---|---|---|
| `src/lib/seed.ts` | Entire file | 12 fake players, 3 fake matches (Kochi/Kolkata/Ahmedabad), PRNG-generated fake stat events, scripted "story beats" (ace-storm, super-dig game) | **Delete** |
| `src/lib/club.ts` | `CLUB` constant | Hardcoded club identity ("Goa Guardians"), fake next fixture ("Chennai Blitz"), 5 Unsplash placeholder photos, 3 fake honours | **Replace** — becomes `Team`, `Match` (fixture), `Venue` DB entities |
| `src/lib/store.tsx` | `StoreProvider` | localStorage repository; auto-seeds via `buildSeed()`; `resetDemoData()` action | **Replace** — keep repository pattern, remove seeding/reset, add data-provider interface |
| `src/lib/types.ts` | Domain types | Single-club model (`Match.opponent` is a string, `OppPlayer`, `opp` flag); non-standard roles (SPIKER/SETTER/CENTRE) | **Replace** — new league-level domain model (§3) |
| `src/lib/metrics.ts` | Pure derivations | Clean and prop-driven. Flag: "Contribution Index" weights (L169–178) are an acknowledged placeholder formula; "Guardians" comment L408 | **Keep** (rework opp-filtering to team-id filtering; formula needs product sign-off) |
| `src/lib/rally.ts` + `rally.test.mjs` | Rally engine | Pure FIVB rules state machine (6 positions, 25/15 targets). Test fixtures are abstract (`a`–`f`) | **Keep** — generalize "US/THEM" to home/away team ids |

### 1.2 Components

| File | Component | Issue | Recommendation |
|---|---|---|---|
| `src/components/charts.tsx` | All charts | Fully prop-driven ✓. "Guardians of the Floor" label (L375); fixed 3-role branching | **Keep** — parameterize label, generalize roles |
| `src/components/live-match.tsx` | `LiveMatch` | Imports `CLUB` (L5, L174); "US" side = the one club (L87–121) | **Replace** — props: `homeTeam`/`awayTeam` |
| `src/components/live-now.tsx` | `LiveNow` | Imports `CLUB` (L18, L40) | **Replace** — team via props |
| `src/components/showcase.tsx` | Nav/Footer | Hardcoded "Goa Guardians" wordmarks (L238–241, 278, 282); 3-role `PlayerCard` branch | **Replace literals** — read from entity data |
| `src/components/match-night.tsx` | Effects kit | Fake names in doc comments only ("Chennai Blitz", "R. Naik") | **Keep** — scrub comments |
| `src/components/ui.tsx` | Primitives | Token-driven ✓. `ROLE_COLOR` hardcodes exactly 3 roles (L69–73) | **Keep** — extend role map |
| `src/components/smooth-scroll.tsx` | — | Clean | **Keep** |

### 1.3 Pages & layouts

| File | Issue | Recommendation |
|---|---|---|
| `src/app/layout.tsx` | "Goa Guardians" metadata (L6–10) | Replace — dynamic metadata |
| `src/app/(showcase)/layout.tsx` | "Goa Guardians" metadata (L8–10) | Replace — dynamic metadata |
| `src/app/(showcase)/page.tsx` | Hero wordmark "Goa/Guardians" hardcoded (L131–141) despite `CLUB` existing; "FT" ticker tag; 3-role branch | Replace literals |
| `src/app/(showcase)/live/page.tsx` | `CLUB` import (6 usages); "to 25/to 15" display literals | Replace |
| `src/app/(showcase)/matches/page.tsx` | "Guardians vs {opponent}" (L67) | Replace |
| `src/app/(showcase)/matches/[id]/page.tsx` | Same literal (L71) | Replace |
| `src/app/(showcase)/players/[id]/page.tsx` | "Guardians #{jersey}" (L66); 3-role branches | Replace |
| `src/app/(showcase)/team/page.tsx` | "Guardians Roster" (L38); fixed role filter list | Replace |
| `src/app/console/layout.tsx` | "Goa Guardians" wordmarks (L78–80, 103) | Replace |
| `src/app/console/analytics/page.tsx` | `resetDemoData` button (L94); "seeded three-match season" prose (L90–91) | Delete demo-reset; reword |
| `src/app/console/matches/new/page.tsx` | Default venue "Panaji, Goa" (L19); placeholder "e.g. Chennai Blitz" (L60) | Replace — venue picker from DB |
| `src/app/console/matches/[id]/rally/page.tsx` | ~9 "Goa Guardians"/"Guardians" literals (L235–944); temp opponent IDs `${matchId}_oppN` (L184–200); auto-names "Player N" | Replace — real away-team rosters |
| `src/app/console/page.tsx`, `players/*`, `matches/[id]/page.tsx` | Fully store-driven ✓; 3-role branches only | Keep — generalize roles |
| `README.md` | "3-match demo season", "Rohit Singh", "Ahmedabad match" demo script | Replace — rewrite for the platform |
| `public/` | Empty — all imagery is hot-loaded Unsplash placeholders | Needs media storage strategy |

**Not found anywhere** (clean): JSON mock files, fake leaderboard constants, hardcoded standings, fabricated numeric claims in UI.

---

## 2. Files to Update

**Delete:** `src/lib/seed.ts`
**Rewrite:** `src/lib/types.ts`, `src/lib/club.ts` (→ removed, superseded by entities), `src/lib/store.tsx`, `README.md`
**Edit (literals/generalization):** `metrics.ts`, `rally.ts`, all 7 components except `smooth-scroll.tsx`, all layouts, all showcase pages, `console/layout.tsx`, `console/analytics`, `console/matches/new`, `console/matches/[id]/rally`
**New:** `src/lib/domain/` (entities), `src/lib/repository.ts` (data-provider interface), `src/lib/providers/local.ts` (empty-state dev provider), `src/lib/providers/supabase.ts` (stub), `supabase/schema.sql`, empty-state components, league/tournament/standings/venue screens

---

## 3. Proposed Real-World Data Architecture

Standard volleyball positions replace the demo's SPIKER/SETTER/CENTRE:
`OH` (Outside Hitter), `OPP` (Opposite), `MB` (Middle Blocker), `S` (Setter), `L` (Libero), `DS` (Defensive Specialist).

Core principle kept from the prototype: **`stat_event` remains the single source of truth**. Match statistics, standings, rankings, and records are always derived (SQL views / materialized views), never stored by hand.

### Entities (TypeScript interfaces mirror tables 1:1)

```
League        id, name, logo_url, status (active|archived)
Season        id, league_id, name, start_date, end_date, status
Division      id, season_id, name, level
Tournament    id, season_id, division_id?, name, logo_url, organizer,
              start_date, end_date, format (league|groups+knockout), status
TournamentGroup  id, tournament_id, name
KnockoutRound    id, tournament_id, name, ordinal
Venue         id, name, address, city, capacity, lat, lng
Court         id, venue_id, name
Team          id, name, short_name, logo_url, club_city, founded
TeamSeason    id, team_id, season_id           -- registration per season
Staff         id, team_season_id, person_name, role (head_coach|assistant_coach|physio|manager)
Player        id, full_name, dob, height_cm, nationality, photo_url
TeamPlayer    id, team_season_id, player_id, jersey_no, position, is_captain
Match         id, tournament_id, group_id?, round_id?, match_no, date, time,
              venue_id, court_id, home_team_id, away_team_id,
              status (scheduled|live|completed|postponed|cancelled),
              winner_team_id?, published
MatchOfficial id, match_id, person_name, role (first_referee|second_referee|scorer|line_judge)
MatchSet      id, match_id, set_no, home_points, away_points
MatchRoster   id, match_id, team_id, player_id, is_starter, rotation_slot?, is_libero
StatEvent     id, match_id, set_no, team_id, player_id, type, ts
              -- replaces the `opp` flag: every event belongs to a real team
Honour        id, team_id, title, season_label   -- replaces CLUB.honours
```

**Derived (views, not tables):** `match_statistics` (sets, points, aces, blocks, errors, attack/serve/reception %) aggregated from `stat_event` + `match_set`; `standings` (played, won, lost, sets won/lost, points, rank) per tournament/group from completed matches; season records/leaderboards.

### 3.1 Entity Relationship Overview

```
League 1─N Season 1─N Division
Season 1─N Tournament ─N TournamentGroup / KnockoutRound
Tournament 1─N Match N─1 Venue 1─N Court
Match ─ home/away → Team ; 1─N MatchSet ; 1─N MatchOfficial
Team 1─N TeamSeason 1─N TeamPlayer N─1 Player ; TeamSeason 1─N Staff
Match 1─N MatchRoster (starters + bench + rotation)
Match 1─N StatEvent N─1 Player, N─1 Team
Standings / MatchStatistics = derived views over Match + MatchSet + StatEvent
```

Hierarchy: League → Seasons → Tournaments → Matches → (Home/Away Teams, Rosters, Bench, Sets, Events → Statistics).

### 3.2 Repository boundary

```ts
interface DataProvider {
  getLeagues() / getSeason(id) / getTournament(id) ...
  getMatch(id): Match + sets + rosters + officials
  getStandings(tournamentId, groupId?)
  streamMatchEvents(matchId, cb)          // realtime
  createMatch / addEvent / removeEvent / publishMatch ...
}
```

UI components never import constants — they receive entities via props from pages that call the provider. Ships with `LocalProvider` (in-memory/localStorage, starts **empty**, drives proper empty states) and a `SupabaseProvider` stub with identical signatures.

---

## 4. Migration Plan (dummy → real)

**Phase 1 — Domain model.** Add new types + `DataProvider` interface. No UI changes. New position enum with label/color maps.

**Phase 2 — Kill the seed.** Delete `seed.ts`; remove `buildSeed`/`resetDemoData`; bump storage key to `v3` (intentional wipe). Add empty states everywhere ("No matches yet — create your first match").

**Phase 3 — De-brand.** Remove `club.ts`; replace every hardcoded "Goa Guardians"/"Guardians"/"Prime Volleyball League" literal (≈25 sites listed in §1) with entity data (`team.name`, `league.name`). Metadata becomes dynamic. Scrub README + comments.

**Phase 4 — Two-team model.** `Match.opponent: string` → `home_team_id`/`away_team_id`; drop `OppPlayer` + `opp` flag; rally engine "US/THEM" → team ids; both sides get real rosters and benches (`MatchRoster`). Persist set scores (`MatchSet`) — currently they only exist live. Update `metrics.ts` filtering + `rally.test.mjs`.

**Phase 5 — League screens.** New pages: leagues/seasons, tournament detail (groups, knockout bracket, standings), venues, team management (staff, captain, bench). Console gains CRUD forms with DB-backed pickers (venue, opponent, officials).

**Phase 6 — Supabase.** `schema.sql` with the tables in §3, RLS (`published` boundary → row-level policy), standings/statistics views; implement `SupabaseProvider`; realtime channel replaces the cross-tab `storage` event hack.

Each phase leaves the app compiling and usable. Phases 1–3 are low-risk; Phase 4 is the structural one.

---

## 5. Risks & Breaking Changes

1. **App opens empty.** No seed means no demo. The pitch/demo flow in README and the analytics "reset demo" button die. Mitigation: optional `fixtures.dev.ts` importable only in dev, never bundled.
2. **Local data wipe.** Storage key bump discards anything entered in the prototype. Acceptable now; not after real entry begins — do it in this refactor or never.
3. **Single-club → two-team is invasive.** Rally engine, metrics, live scoreboard, and every "Guardians vs X" screen change shape. Largest regression surface; `rally.test.mjs` must pass, and live/review screens need manual QA.
4. **Position enum change breaks derived stats.** SPIKER/SETTER/CENTRE branching exists in 7+ files; old events typed against old roles won't map. Safe only because we're wiping data anyway.
5. **Set scores were never persisted.** Completed matches currently have no set-score record; the new `MatchSet` entity is required for standings math (sets won/lost, 3-0/3-1 vs 3-2 point rules).
6. **Contribution Index is a made-up formula.** Migrating it as-is would ship fake methodology into a professional product — needs product sign-off or removal.
7. **Imagery.** All photos are hot-loaded Unsplash URLs; `public/` is empty. Real platform needs media upload/storage (Supabase Storage) for team logos and player photos.
8. **SEO metadata** goes from static to dynamic — verify Next.js `generateMetadata` on all public routes.

---

**Awaiting your approval before any refactoring begins.** Confirm (a) the entity model in §3, (b) the standard-positions change, and (c) acceptance of the local-data wipe, and I'll start with Phase 1.
