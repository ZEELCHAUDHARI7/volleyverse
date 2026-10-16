-- Leagues, seasons and tournaments created twice under one name.
--
-- "Start a Match" created a default "VolleyVerse League" / "2026" / "Season
-- Fixtures" whenever it could not see a competition, including when the
-- leagues read failed. Production was left with two leagues of that name and
-- three seasons called 2026, and League Setup showed whichever the database
-- returned first. The app no longer does this; this folds what it left.
--
-- Rows with the same name (ignoring case and spacing) under the same parent
-- fold into one: the active one, then the one holding the most matches, then
-- the oldest league or lowest id, which is the rule the app uses to pick
-- (src/lib/competition.ts). Seasons move to the kept league, tournaments to
-- the kept season, matches to the kept tournament (renumbered after its own).
-- Only rows left empty are deleted, and step 2 refuses to commit if the match
-- count changes, so no match, set score or stat event can go with them.
--
-- Step 1 lists every foreign key into these tables and the tree as it stands.
-- Run it first and read the result: a table not handled below that points at
-- a season or tournament with ON DELETE CASCADE (confdeltype 'c') must be
-- added to step 2 before it runs.

-- 1. Preview (changes nothing).
select conrelid::regclass as referencing_table, conname,
       confrelid::regclass as referenced_table, confdeltype
from pg_constraint
where contype = 'f'
  and confrelid in ('leagues'::regclass, 'seasons'::regclass, 'tournaments'::regclass)
order by 3, 1;

select l.name as league, l.id as league_id, l.status as league_status,
       s.name as season, s.id as season_id, s.status as season_status,
       t.name as tournament, t.id as tournament_id,
       (select count(*) from matches m where m.tournament_id = t.id) as matches
from leagues l
left join seasons s on s.league_id = l.id
left join tournaments t on t.season_id = s.id
order by l.created_at, l.id, s.id, t.id;

-- 2. Merge.
begin;

create temp table merge_check on commit drop as
select count(*) as matches_before from matches;

-- Leagues.
create temp table league_fold on commit drop as
with weighed as (
  select l.id, l.status, l.created_at,
         lower(regexp_replace(btrim(l.name), '\s+', ' ', 'g')) as key,
         (select count(*) from matches m
            join tournaments t on t.id = m.tournament_id
            join seasons s on s.id = t.season_id
          where s.league_id = l.id) as n
  from leagues l
), ranked as (
  select id, first_value(id) over (
           partition by key
           order by (status = 'active') desc, n desc, created_at, id) as keep_id
  from weighed
)
select id as from_id, keep_id as to_id from ranked where id <> keep_id;

update seasons s set league_id = f.to_id
from league_fold f where s.league_id = f.from_id;

-- Seasons, now that each sits under its kept league.
create temp table season_fold on commit drop as
with weighed as (
  select s.id, s.league_id, s.status,
         lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) as key,
         (select count(*) from matches m
            join tournaments t on t.id = m.tournament_id
          where t.season_id = s.id) as n
  from seasons s
), ranked as (
  select id, first_value(id) over (
           partition by league_id, key
           order by (status = 'active') desc, n desc, id) as keep_id
  from weighed
)
select id as from_id, keep_id as to_id from ranked where id <> keep_id;

update tournaments t set season_id = f.to_id
from season_fold f where t.season_id = f.from_id;
update divisions d set season_id = f.to_id
from season_fold f where d.season_id = f.from_id;
update team_players tp set season_id = f.to_id
from season_fold f where tp.season_id = f.from_id;

-- Tournaments, now that each sits under its kept season.
create temp table tournament_fold on commit drop as
with weighed as (
  select t.id, t.season_id, t.status,
         lower(regexp_replace(btrim(t.name), '\s+', ' ', 'g')) as key,
         (select count(*) from matches m where m.tournament_id = t.id) as n
  from tournaments t
), ranked as (
  select id, first_value(id) over (
           partition by season_id, key
           order by (status = 'active') desc, n desc, id) as keep_id
  from weighed
)
select id as from_id, keep_id as to_id from ranked where id <> keep_id;

with last_no as (
  select f.to_id, coalesce(max(m.match_no), 0) as n
  from (select distinct to_id from tournament_fold) f
  left join matches m on m.tournament_id = f.to_id
  group by f.to_id
), moved as (
  select m.id, f.to_id,
         row_number() over (partition by f.to_id order by m.date, m.time nulls last, m.id) as rn
  from matches m join tournament_fold f on f.from_id = m.tournament_id
)
update matches m
set tournament_id = mv.to_id,
    match_no = case when m.match_no is null then null else last_no.n + mv.rn end
from moved mv join last_no on last_no.to_id = mv.to_id
where m.id = mv.id;

update tournament_groups g set tournament_id = f.to_id
from tournament_fold f where g.tournament_id = f.from_id;

-- Delete only what the moves above emptied.
delete from tournaments t using tournament_fold f
where t.id = f.from_id
  and not exists (select 1 from matches m where m.tournament_id = t.id)
  and not exists (select 1 from tournament_groups g where g.tournament_id = t.id);

delete from seasons s using season_fold f
where s.id = f.from_id
  and not exists (select 1 from tournaments t where t.season_id = s.id)
  and not exists (select 1 from divisions d where d.season_id = s.id)
  and not exists (select 1 from team_players tp where tp.season_id = s.id);

delete from leagues l using league_fold f
where l.id = f.from_id
  and not exists (select 1 from seasons s where s.league_id = l.id);

do $$
begin
  if (select matches_before from merge_check) <> (select count(*) from matches) then
    raise exception 'match count changed; nothing was committed';
  end if;
end $$;

commit;

-- 3. The tree afterwards: one row per league, season and tournament name.
select l.name as league, s.name as season, t.name as tournament,
       (select count(*) from matches m where m.tournament_id = t.id) as matches
from leagues l
left join seasons s on s.league_id = l.id
left join tournaments t on t.season_id = s.id
order by l.created_at, s.name, t.name;
