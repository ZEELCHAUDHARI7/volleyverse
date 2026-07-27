-- =====================================================================
-- VolleyVerse — professional volleyball league management platform
-- PostgreSQL / Supabase schema. Mirrors src/lib/types.ts 1:1
-- (snake_case ↔ camelCase). stat_events is the single source of truth:
-- statistics and standings are VIEWS, never hand-stored numbers.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Competition structure ----------

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed'))
);

create table divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  name text not null
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  capacity integer,
  map_url text
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  name text not null
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  division_id uuid references divisions (id) on delete set null,
  name text not null,
  logo_url text,
  organizer text,
  venue_id uuid references venues (id) on delete set null,
  start_date date,
  end_date date,
  format text not null default 'LEAGUE' check (format in ('LEAGUE', 'GROUPS_KNOCKOUT', 'KNOCKOUT')),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed'))
);

create table tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  name text not null
);

-- ---------- Teams & people ----------

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  logo_url text,
  city text,
  founded integer
);

create table team_honours (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  title text not null,
  season_label text not null
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  name text not null,
  role text not null check (role in ('HEAD_COACH', 'ASSISTANT_COACH', 'MANAGER', 'PHYSIO', 'ANALYST'))
);

-- Person data lives here; per-team registration in team_players.
create table players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  height_cm integer,
  nationality text,
  photo_url text
);

create table team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  season_id uuid references seasons (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  -- jersey_no / position are nullable: some rosters list neither
  -- ("Not listed"). The frontend renders null as "Not listed", never a guess
  -- (src/lib/types.ts Player).
  jersey_no integer,
  position text check (position in ('OH', 'OPP', 'MB', 'S', 'L', 'DS')),
  is_captain boolean not null default false,
  -- Registered as a reserve/standby rather than a main-squad player.
  is_reserve boolean not null default false,
  unique (team_id, season_id, jersey_no)
);

-- Frontend consumes this flattened shape (src/lib/types.ts Player).
-- `id` is the team_players (registration) id — the identifier the app
-- carries as Player.id. The person row id (players.id) is exposed as
-- person_id so the provider can update person vs registration fields
-- in the correct table on a write.
create view roster_view as
select
  tp.id,
  tp.player_id as person_id,
  p.full_name,
  tp.jersey_no,
  tp.position,
  p.height_cm,
  p.nationality,
  p.photo_url,
  tp.team_id,
  tp.is_captain,
  tp.is_reserve
from team_players tp
join players p on p.id = tp.player_id;

-- ---------- Matches ----------

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  group_id uuid references tournament_groups (id) on delete set null,
  match_no integer,
  date date not null,
  time time,
  venue_id uuid references venues (id) on delete set null,
  court_id uuid references courts (id) on delete set null,
  home_team_id uuid not null references teams (id),
  away_team_id uuid not null references teams (id),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'postponed', 'cancelled')),
  total_sets integer not null default 5 check (total_sets in (3, 5)),
  published boolean not null default false,
  winner_team_id uuid references teams (id),
  check (home_team_id <> away_team_id)
);

create table match_officials (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  name text not null,
  role text not null check (role in ('FIRST_REFEREE', 'SECOND_REFEREE', 'SCORER', 'LINE_JUDGE'))
);

create table match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  set_no integer not null,
  home_points integer not null,
  away_points integer not null,
  unique (match_id, set_no)
);

create table match_rosters (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid not null references teams (id),
  player_id uuid not null references team_players (id),
  is_starter boolean not null default false,
  is_libero boolean not null default false,
  unique (match_id, player_id)
);

-- ---------- Stat events: THE single source of truth ----------

create table stat_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid not null references teams (id),
  player_id uuid not null references team_players (id),
  set_no integer not null,
  type text not null check (type in (
    'SPIKE_POINT','SPIKE_IN','SPIKE_ERR',
    'RECV_PERFECT','RECV_GOOD','RECV_POOR','RECV_ERR',
    'SET_ASSIST','SET_GOOD','SET_ERR',
    'BLOCK_WIN','BLOCK_MISS',
    'SERVE_ACE','SERVE_IN','SERVE_ERR',
    'DIG_SUPER','DIG_SAVE','DIG_FAIL'
  )),
  ts timestamptz not null default now()
);

create index stat_events_match_idx on stat_events (match_id);
create index stat_events_player_idx on stat_events (player_id);
create index matches_tournament_idx on matches (tournament_id);

-- ---------- Derived views (mirror src/lib/metrics.ts) ----------

-- Per-side match statistics: sets, points, aces, blocks, errors,
-- attack % / service % / reception %.
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
  count(*) filter (where e.type in ('SPIKE_ERR','SERVE_ERR','RECV_ERR','SET_ERR','BLOCK_MISS','DIG_FAIL')) as errors,
  round(100.0 * count(*) filter (where e.type = 'SPIKE_POINT')
    / nullif(count(*) filter (where e.type in ('SPIKE_POINT','SPIKE_IN','SPIKE_ERR')), 0), 1) as attack_pct,
  round(100.0 * count(*) filter (where e.type in ('SERVE_ACE','SERVE_IN'))
    / nullif(count(*) filter (where e.type in ('SERVE_ACE','SERVE_IN','SERVE_ERR')), 0), 1) as service_pct,
  round(100.0 * count(*) filter (where e.type in ('RECV_PERFECT','RECV_GOOD'))
    / nullif(count(*) filter (where e.type in ('RECV_PERFECT','RECV_GOOD','RECV_POOR','RECV_ERR')), 0), 1) as reception_pct
from matches m
join teams t on t.id in (m.home_team_id, m.away_team_id)
left join stat_events e on e.match_id = m.id and e.team_id = t.id
group by m.id, t.id;

-- Standings per tournament: FIVB points (3-0/3-1 → 3pts; 3-2 → 2/1).
create view standings as
with per_match as (
  select
    m.tournament_id,
    m.id as match_id,
    t.id as team_id,
    ms.sets_won,
    ms.points as points_for,
    (select ms2.points from match_statistics ms2
      where ms2.match_id = m.id and ms2.team_id <> t.id) as points_against,
    (select ms2.sets_won from match_statistics ms2
      where ms2.match_id = m.id and ms2.team_id <> t.id) as sets_lost,
    (m.winner_team_id = t.id) as won
  from matches m
  join teams t on t.id in (m.home_team_id, m.away_team_id)
  join match_statistics ms on ms.match_id = m.id and ms.team_id = t.id
  where m.status = 'completed'
)
select
  tournament_id,
  team_id,
  count(*) as played,
  count(*) filter (where won) as won,
  count(*) filter (where not won) as lost,
  sum(sets_won) as sets_won,
  sum(sets_lost) as sets_lost,
  sum(points_for) as points_for,
  sum(points_against) as points_against,
  sum(case
    when won and sets_won - sets_lost >= 2 then 3
    when won then 2
    when not won and sets_lost - sets_won = 1 then 1
    else 0
  end) as points,
  rank() over (
    partition by tournament_id
    order by sum(case
      when won and sets_won - sets_lost >= 2 then 3
      when won then 2
      when not won and sets_lost - sets_won = 1 then 1
      else 0
    end) desc, count(*) filter (where won) desc
  ) as rank
from per_match
group by tournament_id, team_id;

-- ---------- Row Level Security: the publish boundary ----------
-- Public (anon) readers see only published, completed matches and the
-- events/sets attached to them. Authenticated league staff see all and
-- write through their role. Adjust to your auth model before go-live.

alter table matches enable row level security;
alter table stat_events enable row level security;
alter table match_sets enable row level security;

create policy "public reads published matches"
  on matches for select
  using (published = true or auth.role() = 'authenticated');

create policy "public reads events of published matches"
  on stat_events for select
  using (
    exists (select 1 from matches m where m.id = match_id
      and (m.published = true or auth.role() = 'authenticated'))
  );

create policy "public reads sets of published matches"
  on match_sets for select
  using (
    exists (select 1 from matches m where m.id = match_id
      and (m.published = true or auth.role() = 'authenticated'))
  );

create policy "staff writes matches"
  on matches for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "staff writes events"
  on stat_events for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "staff writes sets"
  on match_sets for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =====================================================================
-- REAL-TIME SYNCHRONISATION (Issue #3)
-- =====================================================================
-- Everything below turns the schema above into a collaborative,
-- multi-user, multi-device platform: any change by one client is pushed
-- to every other connected client over Supabase Realtime, with no manual
-- refresh. The web client (src/lib/providers/*) is the reference
-- implementation; native Android/iOS clients converge by subscribing to
-- the same publication and obeying the same contract (see REALTIME_SYNC.md).

-- ---------- Live courtside state: the broadcast channel for live scores ----------
-- The Rally Tracker owns a rich, ephemeral MatchState (lineups, current
-- rally, running score) that is NOT normalised into the tables above —
-- it is working state, not the historical record. To let fans on other
-- devices watch the score move in real time we mirror that state as one
-- JSONB row per match. The provider writes it on every scoring tap; every
-- viewer subscribes. `stat_events` remains the durable source of truth;
-- this row is a live projection that can always be rebuilt from events.
create table if not exists match_live_state (
  match_id uuid primary key references matches (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table match_live_state enable row level security;

-- A live match's scoreboard is broadcast content (public the way the gym
-- scoreboard is), but only once the match is published. Staff see all.
create policy "public reads live state of published matches"
  on match_live_state for select
  using (
    exists (select 1 from matches m where m.id = match_id
      and (m.published = true or auth.role() = 'authenticated'))
  );

create policy "staff writes live state"
  on match_live_state for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Keep updated_at fresh so late joiners can tell how stale the projection is.
create or replace function touch_live_state() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists match_live_state_touch on match_live_state;
create trigger match_live_state_touch
  before update on match_live_state
  for each row execute function touch_live_state();

-- ---------- Realtime publication ----------
-- Supabase streams row changes (INSERT/UPDATE/DELETE) for tables added to
-- the `supabase_realtime` publication. We add every shared entity so that
-- new matches, edits, live scores, events, teams, players, tournaments,
-- analytics inputs, status changes AND deletes all propagate live.
--
-- REPLICA IDENTITY FULL makes DELETE / UPDATE events carry the full old
-- row, so clients can react to deletions (e.g. remove a match) using the
-- old primary key rather than only the changed columns.
do $$
declare t text;
begin
  foreach t in array array[
    'leagues','seasons','divisions','tournaments','tournament_groups',
    'venues','courts','teams','team_honours','staff',
    'players','team_players',
    'matches','match_officials','match_sets','match_rosters',
    'stat_events','match_live_state'
  ] loop
    execute format('alter table %I replica identity full', t);
    -- add_to_publication is idempotent-guarded: ignore "already member"
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- RLS HARDENING — the remaining reference tables
-- =====================================================================
-- matches / stat_events / match_sets / match_live_state are already
-- policied above (the publish boundary). Everything else is league
-- reference data: publicly readable (the showcase site renders it
-- anonymously) and writable only by authenticated staff. This is what
-- makes the console lock real — without it the public anon key can write
-- straight past the UI.

alter table leagues            enable row level security;
alter table seasons            enable row level security;
alter table divisions          enable row level security;
alter table venues             enable row level security;
alter table courts             enable row level security;
alter table tournaments        enable row level security;
alter table tournament_groups  enable row level security;
alter table teams              enable row level security;
alter table team_honours       enable row level security;
alter table staff              enable row level security;
alter table players            enable row level security;
alter table team_players       enable row level security;
alter table match_officials    enable row level security;
alter table match_rosters      enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'leagues','seasons','divisions','venues','courts','tournaments',
    'tournament_groups','teams','team_honours','staff','players',
    'team_players','match_officials','match_rosters'
  ] loop
    execute format(
      'drop policy if exists "public reads %1$s" on %1$I', t);
    execute format(
      'drop policy if exists "staff writes %1$s" on %1$I', t);
    execute format(
      'create policy "public reads %1$s" on %1$I for select using (true)', t);
    execute format(
      'create policy "staff writes %1$s" on %1$I for all '
      'using (auth.role() = ''authenticated'') '
      'with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- Views bypass RLS unless they run as the caller. Without this, the
-- publish boundary on matches/stat_events leaks straight through
-- match_statistics and standings.
alter view roster_view       set (security_invoker = true);
alter view match_statistics  set (security_invoker = true);
alter view standings         set (security_invoker = true);
