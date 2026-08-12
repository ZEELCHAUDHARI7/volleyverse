-- Attack detail (SPIKE_TOOL, SPIKE_BLOCKED, BLOCK_TOOLED) and the duel column
-- that names the opponent on the other side of the net.
--
-- RUN THIS BEFORE DEPLOYING the ✓/✗ sub-options. SupabaseStoreProvider updates
-- local state optimistically and enqueues the insert, so a row the CHECK
-- constraint rejects fails inside the queue: the screen shows the point landing
-- while the database refuses it. The collector sees no error.
--
-- Safe to run early: widening a constraint cannot reject rows that already
-- exist, an added nullable column changes no existing row, and the build in
-- production today writes neither the new types nor the new column.
--
-- The constraint is unnamed in the original schema.sql, so PostgreSQL generated
-- its name. The block below finds it by its definition rather than guessing.

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
    'SPIKE_POINT','SPIKE_TOOL','SPIKE_IN','SPIKE_ERR','SPIKE_BLOCKED',
    'RECV_PERFECT','RECV_GOOD','RECV_POOR','RECV_ERR',
    'SET_ASSIST','SET_GOOD','SET_ERR',
    'BLOCK_WIN','BLOCK_MISS','BLOCK_TOOLED',
    'SERVE_ACE','SERVE_IN','SERVE_ERR',
    'DIG_SUPER','DIG_SAVE','DIG_FAIL',
    'FAULT_NET','FAULT_FOUR_HITS','FAULT_DOUBLE','FAULT_ROTATION'
  ));

-- The other half of a duel: the blocker on a SPIKE_TOOL or SPIKE_BLOCKED, the
-- spiker on a BLOCK_WIN or BLOCK_TOOLED. Nullable on purpose — most contacts
-- have no opponent to name, and the phase-based tracker's block wins never
-- asked who was hitting. Every spiker-vs-blocker matchup is derived from it.
alter table stat_events
  add column if not exists vs_player_id uuid references team_players (id);

-- The matchup matrix reads every duel of a match at once.
create index if not exists stat_events_vs_player_idx
  on stat_events (vs_player_id) where vs_player_id is not null;

-- Attack % and the error count have to agree with
-- src/lib/analytics/volleyball.ts: a tool is a point, a blocked attack is an
-- attempt that cost one. Recreated rather than patched — a view's body cannot
-- be altered in place.
drop view if exists match_statistics;

create view match_statistics as
select
  m.id as match_id,
  t.id as team_id,
  (select count(*) from match_sets s
    where s.match_id = m.id
      and ((t.id = m.home_team_id and s.home_points > s.away_points)
        or (t.id = m.away_team_id and s.away_points > s.home_points))) as sets_won,
  (select coalesce(sum(case when t.id = m.home_team_id then s.home_points else s.away_points end), 0)
    from match_sets s where s.match_id = m.id) as points,
  count(*) filter (where e.type = 'SERVE_ACE') as aces,
  count(*) filter (where e.type = 'BLOCK_WIN') as blocks,
  count(*) filter (where e.type in ('SPIKE_ERR','SPIKE_BLOCKED','SERVE_ERR','RECV_ERR','SET_ERR','BLOCK_MISS','DIG_FAIL')) as errors,
  round(100.0 * count(*) filter (where e.type in ('SPIKE_POINT','SPIKE_TOOL'))
    / nullif(count(*) filter (where e.type in ('SPIKE_POINT','SPIKE_TOOL','SPIKE_IN','SPIKE_ERR','SPIKE_BLOCKED')), 0), 1) as attack_pct,
  round(100.0 * count(*) filter (where e.type in ('SERVE_ACE','SERVE_IN'))
    / nullif(count(*) filter (where e.type in ('SERVE_ACE','SERVE_IN','SERVE_ERR')), 0), 1) as service_pct,
  round(100.0 * count(*) filter (where e.type in ('RECV_PERFECT','RECV_GOOD'))
    / nullif(count(*) filter (where e.type in ('RECV_PERFECT','RECV_GOOD','RECV_POOR','RECV_ERR')), 0), 1) as reception_pct
from matches m
join teams t on t.id in (m.home_team_id, m.away_team_id)
left join stat_events e on e.match_id = m.id and e.team_id = t.id
group by m.id, t.id;
