# Per-set starting rotation — design

One match, all its sets. Between sets the collector may change either team's
starting six before the next serve, and every set already played keeps the
rotation it was played with.

## The problem this removes

The starting six was captured once, by the setup wizard, into
`MatchState.setup` — and every set start reset both lineups back to it. There
was no screen, no action and no field anywhere that could say "set 2 started
differently". Teams rotate differently for set 2 all the time, so the only way
to record it was to log each set as a **separate match**. That splits one
match's events across several match ids, so match totals, the set navigator,
standings and every season aggregate read the wrong thing.

## The one idea

**`setup` stops being the answer to "what does this set start from".**

```ts
setup: MatchSetup                 // set 1's — unchanged, still the wizard's
setSetups?: Record<number, MatchSetup>   // only sets that were ENTERED
```

`setupForSet(set, setup, setSetups)` resolves the question in one place: the
rotation entered for that set, else the most recent one entered before it,
else `setup`. Two consequences fall straight out of that rule:

- **An edit stands until changed.** Change the six for set 2 and set 3 starts
  from it too — like a substitution, not like a one-off.
- **An old session is unchanged.** No `setSetups` means every set resolves to
  `setup`, which is exactly the behaviour that shipped before. `hydrate` fills
  in `{}`, and nothing else in either tracker had to care.

## The pause that makes it possible

Banking a set and opening the next used to be one atomic action, so there was
no moment in the state machine where a rotation could be entered. It is now
two, joined by one flag:

```ts
awaitingSetStart?: boolean
```

`bankSet` records the set score, opens the next set on the **carried-forward**
rotation, and sets the flag. `SetRotationGate` renders while it is true.
Confirming records the rotation against *this* set (`withSetSetup`) and clears
the flag.

The court underneath is opened either way, so the flag only decides what is on
screen — a session resumed mid-pause is a playable set, not a half-state. That
is also why nothing here can lose data: it runs **after** `recordSetScore`, and
every `StatEvent` already carries its own `setNo`.

Order at a set boundary, in the trackers that have both gates:

1. set score banked (`match_sets`)
2. deciding-set toss, if this is the deciding set (FIVB 6.3.2/7.1)
3. rotation gate

The toss comes first because who serves first decides which libero walks on.

## Shared engine, two trackers

Both trackers had their own near-identical set-transition code. The reset is
now one pure function so they cannot drift:

```ts
openSetCourt(setup) // both lineups, both liberos benched, both sub counters 0
```

`rally.ts` stays free of runtime imports (the type-stripping test runner), so
`LIBERO_OFF` / `NO_SUBS` are written out as literals there, as
`initialMatchState` already did.

Callers still owe the ordering contract from `substitution.ts`: open the court,
**then** `syncCourt` — and sync with the *incoming* set's libero ids, not the
match's, because a side may designate a different libero for a later set. That
last point is the subtle one; `liberoIds` in both trackers now derives from
`setupForSet`, not from `state.setup`.

## The screen

`SetRotationGate` (`src/components/set-rotation.tsx`) shows both sixes
pre-filled with the carried rotation over a read-only `CourtBoard`, with the
first server highlighted. A team that has not changed anything is one tap from
playing; a team that has is two. Editing reuses the wizard's `SixPicker`
rather than growing a second picker that could drift from it.

`lineupComplete` is new and is the reason it can: building a six from empty
cannot produce a duplicate, but *editing* one can, so completeness is now six
filled slots **and** six different people.

## Scoresheet

Confirming a rotation unions the new starters into `match_rosters.is_starter`
rather than overwriting it — a player benched for set 2 still started the
match. Per-set rotations themselves live in the live-state JSONB
(`match_live_state`, localStorage), which the schema already classes as
working state. No migration.

## One thing fixed on the way

The rally tracker's `bankSet` never checked `matchWinner`, so at 2–0 in a
best-of-three it opened a set 3 that could not be played. Harmless while that
just reset the court; with a rotation gate in front of it, it would have parked
the collector on the line-up screen of a set that does not exist. It now
completes the match, as the free-rally tracker always has. A completed match
with no live session also stops offering the setup wizard — a fresh toss for a
played match invites overwriting a finished scoresheet.

## Not covered by automated tests

The gate itself, as with every React screen here. The pure rules underneath —
resolution, carry-forward, non-mutation of earlier sets, the set-open reset,
duplicate rejection — are in `rally.test.mjs`.
