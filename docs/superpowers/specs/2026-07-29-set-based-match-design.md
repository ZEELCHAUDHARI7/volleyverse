# Set-based match resolution

Date: 2026-07-29. Branch: `feat/set-based-match`, stacked on `fix/restore-court-tracking`.

## Problem

`501b3a8` resolved a match on total points, ignoring sets. That was a deliberate
call at the time, taken so a match could be stopped at any moment and still
produce a result. It does not match how the matches are actually played.

## Rules

- A match is best of `totalSets` (3 or 5, chosen at match creation).
- A side wins by taking a majority of the sets on offer: 3 of 5, 2 of 3.
- **Every set is played to 15, win by two** — the deciding set included.
- Reaching 15 with a two-point cushion does not advance anything on its own. It
  raises a prompt; the set is banked only when the scorer confirms.

15 is not the FIVB figure of 25 with a 15-point deciding set. It is a deliberate
choice for how these matches are run.

## Model

The tracking state was already set-aware — `set`, `usSets`, `oppSets`,
`setScores` and `decidingToss` all existed, and `onBankSet` already recorded the
set score, incremented the counts, reset the scores, alternated the server and
deferred to `firstServerForSet` for the deciding-set toss. Only the rules were
wrong.

Three additions to `rally.ts`, all pure and unit-tested:

| Export | Meaning |
|---|---|
| `SET_TARGET` | 15 — points that take any set |
| `matchTarget(totalSets)` | `floor(totalSets / 2) + 1` — sets needed to win |
| `matchWinner(usSets, oppSets, totalSets)` | winning side, or null while live |

`matchTarget` is derived rather than a hard-coded 3 so that a best-of-three
chosen at match creation ends on its second set instead of never resolving.

`isDecidingSet` survives, but now governs only the fresh toss FIVB 6.3.2
requires for the last set. It no longer has any say in the point target.

## Behaviour

**Set completion.** `setOver` becomes true at 15 with a two-point lead and
renders a prompt showing the set winner, the score and the set tally as it will
stand. Its primary action reads `Start set N+1`, or `Finish match` when
`matchWinner` says the banked set would decide it. Undo sits beside it and runs
the existing rally-undo, which drops the score back under the threshold and
dismisses the prompt without any special-case code.

**Match completion.** `onBankSet` consults `matchWinner` after incrementing the
counts. Decided, it calls `store.completeMatch` with the winning team and stops;
undecided, it advances to the next set exactly as before. Sets 4 and 5 are never
played at 3–0 or 3–1.

**Abandoning.** `End match` stays, and now resolves on sets rather than points. A
side ahead on points but level on sets takes nothing — the set in progress is
unfinished and cannot count.

**Report.** The completed-match header shows sets won, counted back off
`match.setScores` rather than live state so the figure is right when the match is
reopened in another browser. Per-set scores were already listed and are unchanged.

The live scoreboard needed no work: it already showed the current set score with
a `Set N` label and a running set tally.

## Verification

Written test-first; the new suite failed on the missing `SET_TARGET` export
before any production code was written.

| Gate | Result |
|---|---|
| `npm test` | exit 0 — 4 suites, 62 checks, each file exit 0 individually |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |

New cases in `rally.test.mjs`, suite *Set & Match Completion*: 15–13 takes a set
and 15–14 does not; 16–14 does; the deciding set is 15 like the rest;
`matchTarget` is 3 of 5 and 2 of 3; a match is undecided at 2–1 and 2–2; the
third set decides a best-of-five; the second decides a best-of-three.

Not covered by automated tests: the prompt itself and the deciding-set toss gate,
both React. Manual check outstanding — run a match to 2–2 and confirm set 5
demands a fresh toss before play.
