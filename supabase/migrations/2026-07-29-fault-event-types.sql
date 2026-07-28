-- Fault event types (FAULT_NET, FAULT_FOUR_HITS, FAULT_DOUBLE, FAULT_ROTATION).
--
-- RUN THIS BEFORE DEPLOYING the free-rally tracker. SupabaseStoreProvider
-- updates local state optimistically and enqueues the insert, so a row the
-- CHECK constraint rejects fails inside the queue: the screen shows the point
-- landing while the database refuses it. There is no visible error.
--
-- Safe to run before the deploy: widening a constraint cannot reject rows that
-- already exist, and the current build never writes the new types.
--
-- The constraint is unnamed in schema.sql, so PostgreSQL generated its name.
-- The block below finds it by its definition rather than assuming the name.

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
