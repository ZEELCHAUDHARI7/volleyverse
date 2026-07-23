# Real-Time Synchronization (Issue #3)

VolleyVerse now behaves as a collaborative real-time platform: data created or
updated by one user becomes visible to every other connected user within a
moment, with no manual refresh. This document explains how it works, how to
turn it on, how conflicts and offline edits are handled, and the contract that
keeps Web, Android and iOS clients consistent.

## How to turn it on

The app is env-driven and degrades gracefully. With no configuration it runs
exactly as before — offline-first, backed by `localStorage`, synced across tabs
of one browser. Point it at a Supabase project and the same UI becomes a
multi-user realtime app with no code changes.

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql` in full. It creates every
   table, the derived views (`match_statistics`, `standings`, `roster_view`),
   the Row Level Security policies (the publish boundary), the
   `match_live_state` broadcast table, and — at the bottom — adds every shared
   table to the `supabase_realtime` publication so row changes stream to
   clients.
3. Copy `.env.local.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project
   Settings → API).
4. Restart `npm run dev`. The sync badge (bottom-right) should move from
   "Connecting…" to "Synced". Open the app in two browsers and confirm a change
   in one appears in the other without a refresh.

If either variable is missing the app silently uses the local provider, so
development and demos work with zero backend.

## Architecture

Every screen talks only to one interface — `DataProvider` in
`src/lib/repository.ts` (the "repository boundary"). There are two
implementations behind it, chosen once at load by `StoreProvider`
(`src/lib/store.tsx`):

- **LocalProvider** (`src/lib/store.tsx`) — the original offline-first store:
  the whole database is one JSON document in `localStorage`, and the browser's
  cross-tab `storage` event propagates writes between tabs. Used when Supabase
  is not configured.
- **SupabaseBackend** (`src/lib/providers/supabase-store.ts`) — Postgres is the
  source of truth; Supabase Realtime replaces the `storage` event and the 2s
  poll. Used when Supabase is configured.

Because both satisfy the same `DataProvider` surface, none of the console or
showcase screens changed. The casing translation between the camelCase domain
types (`src/lib/types.ts`) and the snake_case schema lives entirely in
`src/lib/providers/mappers.ts`.

### Reads — convergence, not guesswork

On mount the backend loads the full snapshot (all entities, matches with their
embedded officials/sets/rosters, the flattened `roster_view`, and stat events).
It then opens one realtime channel subscribed to every shared table. When any
row changes — from any user — the affected collection is re-fetched (debounced
~150ms) and the local snapshot is replaced. Re-fetching the whole collection on
each change trades a little bandwidth for guaranteed convergence with the
server: there is no incremental patch logic to drift out of sync. This is what
keeps all clients synchronized with the server.

Coverage is complete: new matches, match updates, live scores, match events,
teams, players, tournaments, the inputs to analytics/standings, match status
changes, and deletes all propagate. Deletes work because the tables use
`REPLICA IDENTITY FULL`, so delete events carry the old primary key.

### Writes — optimistic, with client-minted ids

Mutations update local state immediately, then persist to Postgres; the realtime
echo reconciles. To preserve the synchronous `DataProvider` contract (e.g.
`createMatch` returns the new `Match`, `addEvent` returns the `StatEvent`), ids
are minted client-side with `crypto.randomUUID()` and sent in the write, rather
than waiting for a server-generated id.

### Live scores

The Rally Tracker's rich courtside `MatchState` (lineups, running score, current
rally) is not normalized into the relational tables — it is working state. To
let fans on other devices watch the score move live, it is mirrored as one JSONB
row per match in `match_live_state`. The scorer's `persist` pushes it
(`pushLiveState`); every viewer subscribes (`subscribeLiveState`, wired into
`useLiveMatch`). `stat_events` remains the durable source of truth — this row is
a live projection and can always be rebuilt from events.

## Concurrent updates & conflict handling

The data model is deliberately conflict-resistant:

- **Statistics are event-sourced.** `stat_events` is append-only; every
  statistic, score and standing is a *derived view*, never a hand-stored number
  that two users could clobber. Two scorers appending events simply produce two
  rows — no lost update.
- **Keyed upserts.** Set scores upsert on `(match_id, set_no)`; entity edits
  upsert on primary key. Concurrent edits resolve last-write-wins per row, which
  is the right semantic for independent fields, and the realtime echo means both
  users immediately see the resulting value.
- **Cascading deletes.** Deleting a match issues a single `DELETE`; the schema's
  `ON DELETE CASCADE` removes its sets, rosters, officials, stat events and live
  state, so no orphaned derived data survives on any client.

For the rare case of two people scoring the *same* match simultaneously, the
recommended operational model is one active scorer per match (enforceable later
via RLS or an advisory lock on `match_live_state`); events from a second device
still merge safely because they are append-only.

## Offline support

Writes never block on the network. Each mutation updates local state and enqueues
a durable, serializable operation in `localStorage`
(`volleyverse:sync-queue:v1`). The queue flushes in order whenever the browser
regains connectivity (`online` event) or on next load. Because queued operations
are idempotent upserts/deletes keyed by id, replaying them after a reconnect —
even after a page refresh mid-outage — is safe. The sync badge shows "Offline —
changes saved" while the queue is non-empty, then "Syncing…", then "Synced".

## Cross-platform consistency (Web, Android, iOS)

This repository contains the Next.js web client only. Consistency across
platforms is achieved by making Supabase the single shared source of truth:
any client that connects to the same project and honours the contract below sees
the same data. Native clients (using `supabase-js`, `supabase-kt`, or
`supabase-swift`) should:

1. Read the same tables/views; treat `stat_events` as append-only and derive
   statistics from `match_statistics` / `standings` rather than storing them.
2. Subscribe to the `supabase_realtime` publication for live updates, and to
   `match_live_state` (filtered by `match_id`) for the moving scoreboard.
3. Mint row ids client-side (UUID) for optimistic writes and use keyed upserts.
4. Respect the RLS publish boundary — unpublished matches and their events are
   staff-only.
5. Queue writes locally when offline and replay idempotently on reconnect.

## Verification notes

The web client type-checks and builds against this implementation. Live
end-to-end realtime testing requires a provisioned Supabase project (URL + anon
key with `schema.sql` applied); it cannot be exercised without one. The local
fallback path is unaffected and continues to pass the existing unit tests.
