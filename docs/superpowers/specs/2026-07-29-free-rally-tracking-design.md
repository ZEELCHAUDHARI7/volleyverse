# Free-Rally Tracking — Design

**Date:** 2026-07-29
**Status:** Approved for implementation
**Supersedes:** the live screen defined in `2026-07-28-spiker-tracking-demo-design.md`. That spec's
metric definitions and charts survive unchanged; its manual scoreboard and player-grid screen do not.

## Problem

The spiker-only screen removed too much. It dropped the toss, the six-position lineups, the libero
and rotation, and because it logged nothing but spikes it could not tell who won a rally — so the
score had to be tapped in by hand on a `+1` button. A scorer running a real match ends up
maintaining the scoreboard twice: once on the app, once in their head.

The original complaint stands, though. The rally tracker walks a fixed
serve → receive → set → attack sequence (`rally.ts:143`) and asks who received and who set even
when nobody did. Real rallies do not obey that sequence, and the same attacker can spike twice in
one rally — which that model cannot represent at all (`rally.ts:221`, `:225`).

Both are fixable at once: keep the court, drop the sequence.

## Decision

The court comes back in full — toss, both lineups, both liberos, automatic rotation. The fixed
touch sequence does not. Every on-court player is tappable at all times, in any order, any number
of times per rally. The app never asks who received or who set.

Scoring becomes automatic, because every rally-ending event now has a tap behind it.

## The tap model

One tap arms a player. The second records the outcome.

The app already knows who is serving: P1 of the serving side's lineup (`rally.ts:66`), which
rotation keeps current. That single fact removes the last ambiguity — no phase model is needed to
tell a serve from a spike.

```
the tap is a SERVE  ⟺  no tap has been logged yet in this rally
                       AND the tapped player is the serving side's P1

anything else       →  SPIKE
```

| Tap | Condition | Event | Point |
|---|---|---|---|
| ✓ | serve | `SERVE_ACE` | serving side |
| O | serve | `SERVE_IN` | none — play on |
| ✗ | serve | `SERVE_ERR` | receiving side |
| ✓ | spike | `SPIKE_POINT` | the tapped player's own team |
| O | spike | `SPIKE_IN` | none — play on |
| ✗ | spike | `SPIKE_ERR` | the other team |
| ⚠ | any player, any time | `FAULT_NET` / `FAULT_FOUR_HITS` / `FAULT_DOUBLE` / `FAULT_ROTATION` | the other team |

✓ always awards to the tapped player's own team, whichever side of the net they are on. That is
what makes a return rally work: the serving team can win the point on their own attack without any
special case.

A tap on the serving P1 *later* in the rally is a spike, because the serve slot closed on the
first tap. A first tap on anyone else is also a spike. There is no state in which the app has to
guess.

## Scoring, serve and rotation

Every point runs the same three steps, none of them asked for:

1. The winning side's score increments.
2. The winner serves next.
3. The winner rotates one position clockwise **only if they were receiving** — a side-out earns
   the serve and the rotation. `resolvePoint` (`rally.ts:349`) returns exactly this, and `rotate`
   (`rally.ts:54`) applies it.

A set ends at 25, win by two; 15 in the deciding set (`setPointReached`, `rally.ts:357`). The
deciding set requires a fresh toss — `firstServerForSet` (`rally.ts:121`) returns `null` until one
is entered rather than silently alternating, and that behaviour is preserved.

## Setup

Unchanged from the current rally tracker: toss → home six → home libero → away six → away libero.
`SetupWizard` already implements this, including persisting starters and liberos to the match
roster and flipping the match to `live`.

## Screen

Top to bottom: scoreboard, court, outcome buttons, charts.

```
  AHMEDABAD  15 – 11  SURAT        SET 2      ↶ UNDO
  ──────────────────────────────────────────────────
                  [ SURAT — P1 P6 P5 / P2 P3 P4 ]
  ─────────────────────── net ──────────────────────
                  [ AHMEDABAD — P4 P3 P2 / P5 P6 P1 ]
                    ● serving · #12 Ravi
  ─────────────────── tap a player ─────────────────
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ ✓ POINT  │  │ O RALLY  │  │ ✗ FAILED │
        │   WON    │  │ CONTINUES│  │ NET/OUT  │
        └──────────┘  └──────────┘  └──────────┘
        ┌────────────────────────────────────────┐
        │ ⚠ FAULT  net · 4 hits · double · rot.  │
        └────────────────────────────────────────┘
  ────────────────────── scroll ────────────────────
   ATTEMPTS · POINTS WON · SUCCESS RATE · ERROR RATE
```

`CourtBoard` renders the court and already supports everything needed: `tappableIds={null}` makes
every on-court player tappable (`rally/page.tsx:594-596`), `armedId` dims the rest, libero chips
render per side, and P1 of the serving side is marked "· serve" with a live dot.

The fault control is visually subordinate to the three outcome buttons — it is an exception
handler used a few times a set, not a peer of ✓ O ✗. It lives in the same armed-player panel, so a
fault follows the same two-step shape as every other entry: arm the player who committed it, then
choose the kind. A fault is never recorded without a player.

Charts sit below the court and update on every tap.

## Data model

Four new values in `EventType` (`src/lib/types.ts`):

```
FAULT_NET | FAULT_FOUR_HITS | FAULT_DOUBLE | FAULT_ROTATION
```

A fault must not be recorded as `SPIKE_ERR`. Error rate is `SPIKE_ERR / attempts`, the figure the
product defines, and a net touch is not a spike attempt.

`COUNTERS` in `src/lib/metrics.ts:75` is a `Record<EventType, …>`, so the compiler refuses to build
until all four are handled. Each increments `errors` and nothing else, leaving every existing
statistic untouched.

### Migration — required before deploy

`stat_events.type` carries a `CHECK` constraint listing all valid types
(`supabase/schema.sql:197-205`). It must be widened before any fault reaches the database:

The constraint is unnamed in `schema.sql`, so PostgreSQL generated its name. Confirm it before
running the migration rather than assuming the conventional one:

```sql
select conname from pg_constraint
where conrelid = 'stat_events'::regclass and contype = 'c';
```

```sql
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

Skipping this does not produce a visible error. `SupabaseStoreProvider.addEvent`
(`src/lib/providers/supabase-store.ts:512`) updates local state optimistically and enqueues the
write, so a rejected insert fails inside the queue while the screen carries on as if it succeeded.
`schema.sql` is updated to match, so a fresh project provisions correctly.

## Code layout

**New — `src/lib/free-rally.ts`.** Pure, no React, no storage, no DOM, type-only imports, tested the
way `rally.ts` is. Holds the rally state (`serving`, whether the serve slot is still open, the taps
logged in the current rally for undo) and the two resolvers:

```ts
resolveTap(state, tappedSide, isServer, outcome) → { event, pointTo }
resolveFault(tappedSide, kind)                   → { event, pointTo }
```

**Extracted from `rally/page.tsx` into `src/components/`.** `CourtBoard` and `SetupWizard` are
module-private today; both screens need them. Extraction is a move, not a rewrite — the parked
rally tracker keeps working and imports from the new location. Copying instead would leave two
courts to fix whenever one changes.

`SetupWizard` currently ends by calling `onStart(initialMatchState(us, opp, toss))`, binding it to
the old state shape. It changes to hand back `{ us, opp, toss }` and let each caller build its own
state.

**Rewritten.** `src/app/console/matches/[id]/spikes/page.tsx` — the live screen.

**Deleted.** `src/lib/spike-session.ts` and `src/lib/spike-session.test.mjs`. Their only job was the
manual scoreboard and its undo stack; the score is derived from play now.

**Unchanged.** `src/lib/rally.ts`, `src/lib/spikes.ts`, `src/components/spike-charts.tsx`, and the
old rally tracker's phase-driven `LiveScreen`.

## Charts

The four charts are unchanged and read `SPIKE_*` events only. Aces and service errors move the
score but never appear in spike attempts, because they are serves. Faults appear in neither —
they are recorded against the player and surface only in the score.

## Undo

Two levels, as the current tracker has: undo the last tap within the rally in progress, and undo
the last completed rally (restoring score, serve and both lineups). A tap undo deletes the
`StatEvent` it wrote via `store.removeEvent` — an exact removal, not a compensating entry.

## Known limits

- **No substitutions.** Lineups freeze after the wizard. A real match makes six substitutions a
  set, and a substitution changes who occupies P1 and therefore who serves. Until this is added, a
  substituted-in player's serve is attributed to whoever the wizard placed there.
- **Faults are recorded but not charted.** They count toward `errors` in `metrics.ts` and decide
  points; no chart shows them.
- **Blocks are not attributed.** A spike stopped by a block is logged as the attacker's
  `SPIKE_ERR`; the blocker gets no credit.
- **Receives, sets and digs are not tracked at all.** This is deliberate and is the original
  requirement.

## Acceptance

Two scenarios, both from the people who asked for this.

**The customer's — the same attacker twice in one rally:**

```
tap Arjun → O    SPIKE_IN
tap Arjun → ✓    SPIKE_POINT

Arjun: 2 attempts · 1 point · 50% success · 0% error
```

**The user's — the ball returns to the serving team's court:**

```
Ahmedabad serving, Ravi at P1.

tap Ravi (AHM P1) → O    SERVE_IN,   play on
( Surat digs and returns it — no tap )
tap Arjun (AHM)   → ✓    SPIKE_POINT

→ point to AHMEDABAD
→ Ahmedabad were already serving, so no rotation
→ Ravi serves again
```

## Testing

`src/lib/free-rally.test.mjs`, appended to the `npm test` chain, Node 22 with
`--experimental-strip-types`.

- Both acceptance scenarios above, as named cases
- The serve slot: first tap on serving P1 is a serve; the same player tapped later in the rally is
  a spike; a first tap on anyone else is a spike
- ✓ awards to the tapped player's own team on both sides of the net
- ✗ awards to the other team on both sides of the net
- All four fault kinds award to the other team and produce distinct event types
- Rotation happens on side-out and does not happen when the serving team wins
- A test that would fail if `resolveTap` ignored `serveOpen`

`rally.test.mjs`, `auth-routes.test.mjs` and `spikes.test.mjs` must stay green.

## Out of scope

Substitutions. Block attribution. Receive, set and dig tracking. Fault charts. Season-wide charts.
Reworking the fan-facing live page. Any change to `rally.ts` or the parked rally tracker's own
live screen.
