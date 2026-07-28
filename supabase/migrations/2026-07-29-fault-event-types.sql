-- Fault event types (FAULT_NET, FAULT_FOUR_HITS, FAULT_DOUBLE, FAULT_ROTATION).
--
-- RUN THIS BEFORE DEPLOYING the free-rally tracker. SupabaseStoreProvider
-- updates local state optimistically and enqueues the insert, so a row the
-- CHECK constraint rejects fails inside the queue: the screen shows the point
-- landing while the database refuses it. There is no visible error.
--
-- The constraint is unnamed in schema.sql, so PostgreSQL generated the name.
-- Confirm it first:
--
--   select conname from pg_constraint
--   where conrelid = 'stat_events'::regclass and contype = 'c';
--
-- Substitute the name below if it differs.

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
