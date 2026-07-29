-- =====================================================================
-- VOLLEYVERSE — RECOVER LOST MATCH DATA
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Safe to run more than once. It only widens what the table accepts;
-- it never deletes, rewrites or rejects anything already stored.
--
-- WHY
-- Your database was created from a schema whose stat_events.type CHECK
-- constraint predates the fault events (FAULT_NET, FAULT_FOUR_HITS,
-- FAULT_DOUBLE, FAULT_ROTATION). The tracker writes those types. Postgres
-- refuses the row, the screen shows the point landing anyway, and the
-- write sits at the head of the offline queue blocking every write behind
-- it — the rest of the match never reaches the server.
--
-- AFTER RUNNING THIS
-- Open the console in the SAME browser you collected in and let it load.
-- The queued writes flush automatically and the events reappear. Do not
-- clear that browser's site data first — the queue lives there.
-- =====================================================================

-- ---------- 1. Widen the stat_events type constraint ----------
-- The constraint is unnamed in schema.sql, so PostgreSQL generated its
-- name. Find it by its definition rather than assuming the name.

do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'stat_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%SPIKE_POINT%';

  if c is null then
    raise notice 'No type CHECK found on stat_events — nothing to drop.';
  else
    execute format('alter table stat_events drop constraint %I', c);
    raise notice 'Dropped constraint %', c;
  end if;
end $$;

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

-- ---------- 2. Prove the fix took ----------
-- Expect one row whose definition contains FAULT_ROTATION.

select conname as constraint_name,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'stat_events'::regclass
  and contype = 'c';

-- ---------- 3. Smoke-test that a fault row is now accepted ----------
-- Inserts one throwaway fault event against any existing match/player and
-- rolls it straight back, so nothing is left behind. If this block raises,
-- the cause is NOT the constraint — read the error text, it names the real
-- blocker (23503 = missing reference, 42501 = row-level security).

do $$
declare m uuid; t uuid; p uuid;
begin
  select id into m from matches limit 1;
  select team_id, player_id into t, p from match_rosters limit 1;

  if m is null or p is null then
    raise notice 'No match/roster yet — skipping the smoke test.';
    return;
  end if;

  insert into stat_events (match_id, team_id, player_id, set_no, type)
  values (m, t, p, 1, 'FAULT_ROTATION');

  raise notice 'OK — stat_events now accepts fault events.';
  raise exception using errcode = 'triggered_action_exception',
                        message = 'rollback: smoke test only';
exception
  when triggered_action_exception then
    raise notice 'Smoke test rolled back cleanly. Nothing was stored.';
end $$;

-- ---------- 4. What is actually in there now ----------

select type, count(*) as rows
from stat_events
group by type
order by rows desc;
