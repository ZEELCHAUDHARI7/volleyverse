# Attack detail and automatic blocking — design

One extra question after ✓ and ✗ on the free-rally tracker. It splits a point
into a kill or a tool, a failure into an error or a block, and — for the two
of those that happened against somebody — it names that somebody. A complete
blocking record falls out of it with no second collection pass.

## The problem this removes

Every attack ended as one of three events: `SPIKE_POINT`, `SPIKE_IN`,
`SPIKE_ERR`. Three questions the app could not answer:

- **Was that point earned or given?** A kill and a block-out are both
  `SPIKE_POINT`. One says the spiker was too powerful to stop; the other says
  they were clever enough to use the blocker's hands. Different skills, one
  number.
- **Whose mistake was that?** A ball into the net and a ball stuffed by a
  middle blocker are both `SPIKE_ERR`. One is the spiker's fault. The other is
  someone else's success.
- **Who blocks well?** The free-rally tracker recorded no blocks at all.
  `BLOCK_WIN` existed and only the phase-based tracker ever wrote one, so a
  season collected on `/spikes` had an empty blocking column — and blocking is
  half of what decides a front-row rotation.

## The one idea

**A block is the only act in volleyball decided between two named players, so
it is recorded as a duel: two events, one rally, each naming the other.**

| What happened | Spiker's event | Blocker's event | Which one scores |
| --- | --- | --- | --- |
| Kill | `SPIKE_POINT` | — | `SPIKE_POINT` |
| Tool | `SPIKE_TOOL` | `BLOCK_TOOLED` | `SPIKE_TOOL` |
| Blocked | `SPIKE_BLOCKED` | `BLOCK_WIN` | `BLOCK_WIN` |
| Error | `SPIKE_ERR` | — | `SPIKE_ERR` |

```ts
vsPlayerId?: string | null   // new on StatEvent — the other end of the duel
```

**Exactly one half of a duel ends the rally.** `rallyOutcomes` in
`analytics/volleyball.ts` walks events in time order and scores every
rally-ending one it passes, so if both halves were scoring events every block
in the league would count twice — in the timeline, the momentum chart,
side-out rate, everything downstream. That is why `SPIKE_BLOCKED` is not in
`ERR_EVENTS` and `BLOCK_TOOLED` is not either: the winner's half carries the
point, the loser's half carries the attempt. `free-rally.test.mjs` pins this
down directly rather than trusting the comment.

## What the collector does

```
tap spiker
  ✓  →  Kill                    → logged
        Tool     → tap blocker  → logged
  O  →  logged
  ✗  →  Error                   → logged
        Blocked  → tap blocker  → logged
```

Three taps for the common cases, four when a blocker has to be named — and the
fourth tap is the one that produces every blocking statistic in the product.
Nothing is written until the answer is complete, so **← Back costs no undo**.

The blocker choices are the three front-row slots (P4, P3, P2) of the side the
ball was hit at, read off the live lineup, so a rotation or a substitution
changes them with no extra step. A libero can never appear among them — not by
filtering, but because `syncCourt` only ever places a libero in a back-row
slot.

Two things deliberately do **not** ask the second question: **O**, which has
nothing to refine, and the **serve**, where an ace is not a kill and there is
no blocker to name. `resolveTap` ignores a refinement on a serve rather than
trusting it, so a stale selection on screen cannot turn an ace into a tool.

Undo is unchanged in behaviour and that is the point: both event ids go into
`state.current`, so one Undo takes the whole duel back rather than leaving a
blocker credited with a block that no longer happened.

## What the numbers do

Existing figures do not move when a collector starts using the sub-options.
`points`, `spikeSuccesses` and attack % count a tool exactly like a kill;
`errors` counts a blocked attack exactly like a net error. The new detail lives
where the detail is wanted:

- `spikes.ts` — `kills`, `tools`, `errors`, `blocked` alongside the totals,
  with `pointsWon = kills + tools` and `failed = errors + blocked`.
- `blocks.ts` (new, pure) — a blocker's line, the leaderboard, the
  spiker-vs-blocker duels, the best single set.

**Getting tooled is not an error.** `BLOCK_TOOLED` grows the block denominator
and nothing else. No scoresheet in the sport charges a blocker for a ball the
attacker aimed off their hands, and `BLOCK_MISS` (the phase tracker's beaten
block) already carries the case that is a genuine fault.

**"Duels won", not "block success rate".** The app never sees a block that was
simply jumped too late, because no tap describes one — so the only honest
denominator is the duels it witnessed: blocks won plus times tooled. It answers
"when the ball came through their hands, how often did it stay down". An attack
hit past the block is invisible to it, and a name promising otherwise would be
a lie in a coach's decision.

## Where it surfaces

- **`/spikes`** — blocker cards (blocks, duels won, tooled, most-blocked
  spiker, season total) and two bar charts, under the existing spiker grid.
  Both respect the set filter.
- **Match review** — the blocker leaderboard and the spiker-vs-blocker table.
  The box score's `Blk` column says how many; these say against whom.
- **Season analytics** — "The Wall": most blocks in one set, top blockers of
  the season, the season's strongest matchups.

The matrix is one row per duel that actually happened, not a full grid: a
14-by-14 table of zeroes hides the three matchups worth a substitution.

## Migration

`2026-08-12-attack-detail-and-duels.sql` widens the `stat_events` type CHECK,
adds `vs_player_id`, and recreates `match_statistics` so attack % and the error
count agree with `teamStatLine`. **Run it before deploying.** The Supabase
provider updates local state optimistically and enqueues the insert, so a row
the constraint rejects fails inside the queue — the collector sees the point
land while the database refuses it.

Safe to run early: widening a constraint cannot reject existing rows, a
nullable column changes none of them, and the build in production writes
neither the new types nor the new column.

## Not covered by automated tests

The screen, as always. The rules underneath are in `blocks.test.mjs` and the
new suites in `free-rally.test.mjs` and `spikes.test.mjs` — including the one
that matters most, that exactly one half of a duel ever scores.
