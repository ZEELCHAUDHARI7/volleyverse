# Substitutions & the automatic libero swap — design

Complete player management during a live match, split by who owns the
decision: the **coach** substitutes through a SUB button, the **system**
handles the libero with no input at all.

## The one idea that makes both work

**A rotation slot is the identity, not the player in it.**

`Lineup` is already `Record<Position, playerId>` and rotation already only
shuffles slots. So every change of personnel is a single write to one slot,
and rotation carries on with no special case:

- a substitute takes the exact slot of the player leaving;
- the libero takes the back-row Middle Blocker's slot and inherits their
  place in the rotation;
- when the Middle Blocker comes back they take whatever slot the libero has
  rotated into — which is exactly the slot the rotation owes them.

Nothing in `rotate()`, `serverId()` or the scoring engine changed.

## PART 1 — Substitutions (coach-driven)

`SubControl` (`src/components/sub-sheet.tsx`) is on screen for the whole
match, next to Undo. Tap it → pick the team → the six on court and the bench
appear → pick who goes off and who comes on → confirm. The court redraws in
the same state update, so there is no intermediate frame.

`applySub` (`src/lib/substitution.ts`) is the whole rule, and it refuses
rather than corrupts: the same player both ways, an incoming player already
on court (or held off court for the libero — they already own a slot), an
outgoing player who is not on court, or **the libero in either direction** —
the libero is the system's business.

The button is live only at a dead ball (FIVB 15.2.1: a substitution is
requested with the ball out of play). That is also what keeps Undo honest —
the court a rally was played with never changes halfway through it.

One deliberate extra: while the libero is on, the Middle Blocker they
replaced is off court but still owed the slot back. That player is listed
separately in the sheet and **is** substitutable; doing so hands the return
to the incoming player, so when the serve comes back it is they who walk on.

Substitutions are unrestricted — the sheet shows a per-set counter per team
rather than blocking a collector mid-match. Counters reset each set.

## PART 2 — The libero (system-driven)

The rule is the serve, and nothing else:

| Our team is | On court | On the bench |
| --- | --- | --- |
| serving | Middle Blocker | libero |
| receiving | libero | Middle Blocker |

`syncCourt(state, liberoIds, isMiddleBlocker)` is the single call a live
screen makes. It runs after **every** point, at every set start, after the
deciding-set toss and after a substitution (which can change *which* Middle
Blocker is in the back row). It is idempotent — calling it when the court is
already right returns the same object, so React does not even re-render.

Each tracker also runs it from an effect on `state`, as a backstop for court
changes that arrive from outside a handler: a session resumed from storage
(including one saved before this feature existed), another tab's update, or a
roster whose positions were only just filled in. Because it is
identity-preserving, that effect settles in one pass and cannot loop. It is
skipped while a rally is in progress — the court a rally is being scored on
must not move under the collector, and the next dead ball is moments away.

### Which Middle Blocker

The one in the **back row** (`LIBERO_SLOTS = [5, 6, 1]`). FIVB 19.3.2.1
allows a libero to replace a back-row player only, and in a standard
rotation exactly one Middle Blocker is behind the attack line at any moment
(the paired positions sit three slots apart in the rotation order). If no
Middle Blocker is in the back row the swap is skipped rather than made
illegal, and the SUB sheet says so when no Middle Blocker is in the six at
all — a silent dead feature is worse than a warning.

### The ordering contract

**Rotate first, sync second.** On a side-out the receiving team wins the
serve and rotates; rotating first carries the libero one slot clockwise, so
the returning Middle Blocker lands where the rotation puts them. Syncing
first would return the Middle Blocker to the pre-rotation slot and then
rotate them again — the right player in the wrong place. Both trackers do it
in that order, in one state update, and `substitution.ts` says so at the top
of the file.

## State

`MatchState` (rally tracker) and `FreeMatchState` (spike tracker) each gain:

- `usLibero` / `oppLibero`: `{ onCourt, replacedId }` — whether the swap is
  active and who is owed the slot. The **lineups stay the single truth of who
  is where**; while a libero plays they simply occupy a slot.
- `subs`: `{ us, opp }` — regular substitutions this set. Libero swaps never
  increment it.

Rally snapshots carry the libero states and the substitution counters too, so
Undo rewinds the whole court and the counter can never disagree with the six
standing on it. A substitution made after the undone rally rewinds with it —
the honest reading of "undo that rally" — and because SUB is only live at a
dead ball, no rally can ever have been played with two different courts.

Sessions saved before this feature have none of these fields.
`liberoStateFrom` / `subCountFrom` read them as "libero on the bench, no subs
yet", which is correct: the old model never put a libero in a lineup, so the
first sync walks the receiving libero on.

## Where it lives

| File | Role |
| --- | --- |
| `src/lib/substitution.ts` | The whole engine. Pure, no runtime imports. |
| `src/lib/substitution.test.mjs` | 24 checks: slot inheritance, the serve cycle, refusals, convergence, legacy sessions. |
| `src/components/sub-sheet.tsx` | The SUB button and its sheet. |
| `src/components/court-board.tsx` | Libero badge on the tile, on-court/bench status row. |
| `…/matches/[id]/spikes/page.tsx` | Wiring for the primary live tracker. |
| `…/matches/[id]/rally/page.tsx` | Wiring for the phase-based tracker. |

## Consequences worth naming

- A libero on the bench cannot be tapped. That is the point of the swap: while
  their team serves they are genuinely off court. Their chip stays visible, dim,
  so the collector can see the system tracking it.
- SUB is disabled while the ball is live. That is the rule (15.2.1), and it is
  the reason Undo is uniform rather than "it depends when you subbed".
- Undo rewinds substitutions along with the rally (see State above).
- Nothing about substitutions or libero swaps is written to `StatEvent`.
  Statistics stay derived from contacts alone, exactly as before.
