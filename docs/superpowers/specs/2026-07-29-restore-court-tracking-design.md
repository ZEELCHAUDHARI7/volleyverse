# Restore court tracking, keep the sync fix

Date: 2026-07-29. Branch: `fix/restore-court-tracking`, off `origin/main` (`cfc1192`).

## Problem

`cfc1192` ("drop the rally sequence — tap a player, say what happened") deleted the
court tracker: the toss wizard, starting-six and libero selection, the court board,
rotation, the fault menu, automatic scoring, the `/rally` route, and 429 lines of
tests. It also removed `rally.test.mjs` and `free-rally.test.mjs` from the `npm test`
script, so those suites stopped running.

The stated rationale is that rallies do not follow a fixed serve → receive → set →
spike sequence: a team may return the ball on one touch, and the same attacker may
swing twice before the point is decided. That is correct, and it is the exact problem
`free-rally.ts` solved in `d4e0f02` — the direct parent of `cfc1192`. Two tests in
`free-rally.test.mjs` assert precisely those two cases:

- *the same attacker twice in one rally is two attempts*
- *the ball returns to the serving team's side on one touch*

The sequence was already gone. What `cfc1192` removed was the fix, not the defect.

## What is kept

The same commit introduced genuine sync error-surfacing work, which stays:

- `supabase-store.ts` distinguishes a Postgres refusal (SQLSTATE `23514`, `23503`,
  `42501`) from a network drop. A refused row is parked durably instead of retried.
- Previously a refused row sat at the head of the FIFO queue and blocked every write
  behind it, so one rejected fault event silently discarded the rest of the match.
- `sync-indicator.tsx` raises a blocking alert instead of a badge; the warning
  survives a reload.
- `repository.ts` adds the `error` sync status and `lastError` / `clearErrors` to
  `DataProvider`.
- `supabase/RUN-THIS-NOW.sql` is an idempotent recovery migration for databases whose
  `stat_events.type` CHECK predates the fault events.

Reverting `cfc1192` wholesale would have removed this. It is the fix for the data-loss
bug that prompted the change.

## Split

Every file resolves wholesale to one side. No file required hand-merging.

Restored from `388a257`:

```
src/components/court-setup.tsx            toss, starting six, libero
src/components/court-board.tsx
src/lib/rally.ts             + rally.test.mjs
src/lib/free-rally.ts        + free-rally.test.mjs
src/lib/providers/live-state.ts
src/app/console/matches/[id]/rally/page.tsx
src/app/console/matches/[id]/spikes/page.tsx
src/app/(showcase)/live/page.tsx
src/components/live-match.tsx, live-now.tsx
src/lib/spikes.ts            + spikes.test.mjs
README.md
package.json                              all four suites back in `npm test`
```

Kept from `cfc1192`:

```
src/lib/providers/supabase-store.ts
src/components/sync-indicator.tsx
src/lib/repository.ts
src/lib/store.tsx
supabase/RUN-THIS-NOW.sql
```

### Why the split compiles

- The only interface change is `DataProvider` gaining `lastError` and `clearErrors`.
  Both implementations — `store.tsx` and `supabase-store.ts` — are on the keep list and
  already satisfy it. `providers/supabase.ts` is a documentation stub.
- `live-state.ts` imports only `MatchState` from `rally.ts` and `getSupabase`.
- `spike-charts.tsx` is untouched by either side and imports `spikeLines` / `SpikeLine`,
  which exist in the restored `spikes.ts`.
- The `Outcome` / `OUTCOMES` / `OUTCOME_EVENT` / `spikeLog` additions to `spikes.ts` were
  consumed only by the rewritten pages, which are reverted. They would be dead code.

## Method

Branch off `origin/main`, then `git checkout 388a257 -- <restored paths>`. A forward
commit, not a `git revert`: `cfc1192` stays in history, nothing is force-pushed to a
repository another contributor owns, and the diff reads as a restore rather than a
two-step revert-and-reapply.

## Verification

Node 22 (per `.nvmrc`; a Node 20 shell fails on `--experimental-strip-types`).

| Gate | Result |
|---|---|
| `npm test` | exit 0 — 4 suites, 56 checks, each file exit 0 individually |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 — `/console/matches/[id]/rally` and `/spikes` both routed |

Manual check outstanding: Start Match → toss step → both lineups → tap a player →
score and rotation advance.

## Out of scope

`RUN-THIS-NOW.sql` implies a collected match whose events Postgres refused and which
remain queued in one browser's `localStorage`. Those rows are recoverable only from
that browser profile, and only before its site data is cleared. Tracked separately.
