# Spiker-Only Data Collection — Design

**Date:** 2026-07-28
**Status:** Approved for implementation
**Origin:** Customer priority update — strip the demo to spiker performance only.

## Problem

The courtside tracker models every rally as a fixed sequence: serve → receive → set →
attack → defend → dig. `src/lib/rally.ts:143` makes `Phase` a first-class type and
`src/app/console/matches/[id]/rally/page.tsx` is driven entirely by it. Real volleyball
does not obey that sequence. A team may return the ball on one touch. A player may pass
straight over the net with no setter involved. The tracker still demands a receiver and a
setter every rally, so scorers are forced to log contacts that never happened.

The model also cannot represent a repeated attack by the same player. Every post-attack
path hands the ball to the opposing side (`rally.ts:221`), and a block touch resolves to
`cont(null, "DIG", side)` where `side` is the *blocking* team (`rally.ts:225`). A spike
that is deflected back, dug, and spiked again by the same player has nowhere to be
recorded. That second attempt is precisely the data the customer wants.

Setup compounds it. Before a single stat is entered: pick two teams, fill the fixture
form, run the toss, place six home players into court positions, name a home libero,
place six away players, name an away libero. Roughly twenty interactions before the
first spike.

## Decision

Collect one thing: **who spiked, and what happened**. Three outcomes per attempt.

| Button | Meaning | Event |
|---|---|---|
| ✓ | Point won — the spike landed | `SPIKE_POINT` |
| O | Rally continues — the opponent defended it | `SPIKE_IN` |
| ✗ | Failed — into the net or out of court | `SPIKE_ERR` |

No receiver. No setter. No phases. No rotation. Every tap is exactly one attempt, and
consecutive attempts by the same player in one rally are simply consecutive taps.

The three event types already exist in the schema (`supabase/schema.sql:198`) and in
`EventType` (`src/lib/types.ts:231-233`). Nothing about the data model changes.

## Scope

New screen at `/console/matches/[id]/spikes`, reached from the existing fixture form.
The toss-and-lineup wizard is dropped. The rally tracker remains in the codebase at its
current URL but nothing links to it — the customer's own framing was "that is the entire
app *for now*", so the fuller tracker is parked, not deleted.

## Screen

One page, four zones, top to bottom.

```
  MUMBAI  14  –  11  CHENNAI    SET 1
     [ +1 ]        [ +1 ]      [END SET]      ↶ UNDO
  ────────────────────────────────────────────────
   MUMBAI                    │   CHENNAI
   ┌─────┐ ┌─────┐ ┌─────┐  │  ┌─────┐ ┌─────┐
   │4 Roh│ │7 Arj│ │9 Vik│  │  │2 Sur│ │6 Ily│     … all players, always
   └─────┘ └─────┘ └─────┘  │  └─────┘ └─────┘
  ──────────────── tap a player ───────────────────
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ ✓ POINT  │  │ O RALLY  │  │ ✗ FAILED │
        │   WON    │  │ CONTINUES│  │ NET/OUT  │
        └──────────┘  └──────────┘  └──────────┘
  ─────────────────── scroll ──────────────────────
   ATTEMPTS · POINTS WON · SUCCESS RATE · ERROR RATE
```

**Header.** Manual scoreboard, a `+1` per team, `END SET`, the current set number, and
undo.

**Players.** Both rosters side by side, every player visible at all times — jersey number
and first name, sized for a thumb. No positions, no court diagram, no libero, no bench
distinction. `useMatch` already falls back to the full team roster when no match roster is
set (`src/lib/store.tsx:264-267`), so all players appear with zero setup.

**Outcome buttons.** Tapping a player highlights that button and reveals the three
outcomes. Tapping an outcome writes one event and collapses back to the roster. Tapping
the same player again, or outside the group, cancels without logging.

**Charts.** Below the fold, updating on every tap.

## Writes

| Action | Call |
|---|---|
| ✓ / O / ✗ | `store.addEvent(matchId, teamId, playerId, setNo, SPIKE_POINT \| SPIKE_IN \| SPIKE_ERR)` |
| `+1` | increment local counter, persist |
| `END SET` | `store.recordSetScore(matchId, { setNo, homePoints, awayPoints })`, reset to 0–0, set number +1 |
| first action of a match | `store.startMatch(matchId)` when status is still `scheduled` |
| `↶ Undo` | pop one action: spike → `store.removeEvent(id)`, `+1` → decrement |

Spike events carry the set number shown in the header at the moment of the tap.

Undo is a single stack covering both kinds, so the most recent action reverses regardless
of type. `addEvent` is a plain append and `removeEvent` a plain delete in both providers
(`src/lib/store.tsx:199`, `src/lib/providers/supabase-store.ts:512`), so undo is an exact
removal rather than a compensating entry.

Score, current set number and the undo stack persist together to
`volleyverse:spikes:<matchId>`, so a reload mid-match loses nothing and undo still works.
This must **not** reuse `volleyverse:rally:<matchId>` — `src/components/live-match.tsx:30`
reads that key and expects a full `MatchState` with both lineups.

Three constraints confirmed against the schema:

- `stat_events` requires only `match_id`, `team_id`, `player_id`, `set_no`, `type`
  (`supabase/schema.sql:191-206`). No rosters, lineups or set scores are needed to write
  one, which is what makes the wizard droppable.
- `set_no` is `not null`, so the set indicator is a requirement, not polish.
- `Player.id` is `team_players.id` (`src/lib/providers/mappers.ts:248`), which is exactly
  what `stat_events.player_id` references (`schema.sql:195`). Tapping a player straight
  off the roster writes a valid row.

## Metrics

`src/lib/spikes.ts` — pure functions, no React and no store access, mirroring the
discipline of `rally.ts`.

```
attempts(p)    = SPIKE_POINT + SPIKE_IN + SPIKE_ERR
pointsWon(p)   = SPIKE_POINT
successRate(p) = pointsWon / attempts     → null when attempts = 0
errorRate(p)   = SPIKE_ERR  / attempts    → null when attempts = 0
```

Rates return `null` rather than `0` for a player with no attempts, so charts can exclude
them instead of showing a bench full of 0% bars.

### Why this cannot reuse `metrics.ts`

`PlayerLine.spikeSuccesses` counts `SPIKE_POINT + SPIKE_IN` (`src/lib/metrics.ts:18`,
`:76-84`) and `successRate` divides that by attempts (`:162`). Applied to the customer's
own worked example:

| | attempts | success by `metrics.ts` | success by this spec |
|---|---|---|---|
| One `SPIKE_IN`, one `SPIKE_POINT` | 2 | **100%** | **50%** |

The customer states this case must read 50%. Reusing `playerLine().successRate` would
silently ship 100%. `metrics.ts` is therefore left untouched — `SpikeSuccessRate`,
`SetterAccuracyVsAssists` and `ReachVsSuccess` all share that field, and redefining it
would quietly change three other charts.

## Charts

`src/components/spike-charts.tsx` — four bar charts, sorted descending, bars coloured by
team so both sides read clearly in one chart. Players with zero attempts are excluded.

1. Total spike attempts per player
2. Points won per player
3. Success rate per player
4. Error rate per player

Existing `charts.tsx` components are not modified.

## Routing

Four entry points currently lead to the rally tracker and are repointed at `/spikes`:

| File | Line |
|---|---|
| `src/app/console/matches/new/page.tsx` | 118 |
| `src/app/console/page.tsx` | 552, 571 |
| `src/app/console/matches/[id]/live/page.tsx` | 15 |

The fixture form itself is unchanged: two teams, then tournament/date/best-of. It ends at
the spike screen instead of the toss.

## Consequences

**Accepted, no work planned.**

- The public homepage live strip renders nothing — `LiveNow` returns `null` without live
  state (`src/components/live-now.tsx:21`). Clean degradation.
- The public `/live` page shows its empty state. Its copy at
  `src/app/(showcase)/live/page.tsx:240` still references "the rally tracker"; cosmetic.
- Per-match analytics partially recovers, since `END SET` banks real set scores: the
  result banner and set-score chips work. Score timeline and momentum stay sparse because
  they derive from events and only spikes are logged. Nothing calls `completeMatch`, so it
  reads "No winner recorded" while its status chip is hardcoded to "Completed"
  (`src/app/console/matches/[id]/analytics/page.tsx:144`). The link at
  `src/app/console/page.tsx:559` stays — partial and honest beats missing.
- Matches remain `live` indefinitely. No finish control in this build.

## Acceptance

The customer's worked example is the acceptance criterion.

```
Player A spikes → O   ⇒ SPIKE_IN
Opponent spikes       ⇒ nothing logged (or logged against their own team)
Player A spikes → ✓   ⇒ SPIKE_POINT

A's line: 2 attempts · 1 point · 50% success · 0% error
```

Against the original complaints:

| Complaint | Resolution |
|---|---|
| Assumes serve → receive → set → spike | No phase model exists |
| Forces selecting a receiver | No receive concept |
| Forces selecting a setter | No set concept |
| One touch straight back over | Not modelled, so not a problem |
| Same spiker attacks twice in a rally | Two taps, two events |
| Every tap is one attempt | Each tap writes exactly one `SPIKE_*` event |
| All players visible at all times | Both full rosters, always |

## Testing

`src/lib/spikes.test.mjs`, appended to the `npm test` chain (`package.json:9`), run under
Node 22 with `--experimental-strip-types` to match `rally.test.mjs`.

- The acceptance example above, as a named case
- Zero attempts → `null` rates, not `0`
- All errors → 0% success, 100% error
- Events belonging to other players are ignored, which is what keeps two
  teams' players separate in a single event list

`rally.test.mjs` and `auth-routes.test.mjs` must stay green; nothing they cover is
touched.

## Out of scope

Blocks, serves, digs, receptions, setting. Rotation and lineups. Automatic scoring.
Season-wide spike charts. A match-finish control. Reworking the fan-facing live page to
show the manual score.
