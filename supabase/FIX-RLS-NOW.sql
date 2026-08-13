-- =====================================================================
-- VOLLEYVERSE — FIX "new row violates row-level security policy"
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Safe to run more than once. It never deletes, rewrites or rejects any
-- row already stored; it only changes who is allowed to write.
--
-- WHY YOU ARE HERE
-- The console shows:
--
--     NOT SAVED TO THE SERVER
--     The database rejected a write to matches: permission denied by
--     row-level security (new row violates row-level security policy
--     for table "matches").
--
-- Your database was created from a schema whose write policies demanded
-- auth.role() = 'authenticated'. The console has no sign-in — nothing in
-- src/lib/providers/ ever creates a session — so the browser reaches
-- PostgREST as the anon role and every insert is refused. Reads still
-- work, which is why the app looks fine until it tries to save.
--
-- WHY THIS FILE AND NOT supabase/migrations/2026-08-11-open-console-writes.sql
-- That migration drops the old policies BY NAME. If your database has
-- policies under any other name — an earlier schema, a hand-edit in the
-- dashboard, a RESTRICTIVE policy — they survive and keep refusing the
-- write. This file drops every policy it finds in the catalogue, so it
-- works no matter what the table currently carries.
--
-- WHAT YOU GIVE UP — read this before running it
--   · The anon key ships inside the public JavaScript bundle. Anyone who
--     opens the site can extract it and write to this database directly,
--     bypassing every screen. The console's only protection becomes the
--     obscurity of its URL.
--   · `published` stops being a security boundary and becomes a display
--     filter: the showcase still shows only published matches, but an
--     unpublished match is no longer hidden at the database level.
--
-- Acceptable for a demo, a college project, or a league on a private URL.
-- Before a real go-live, restore a sign-in and swap these policies back
-- to auth.role() = 'authenticated'.
--
-- AFTER RUNNING THIS
-- Open the console in the SAME browser you collected in. Press RETRY on
-- the red banner and the parked writes replay. Do not clear that
-- browser's site data first — the queue lives there.
-- =====================================================================


-- ---------- 1. Open every league table to the anon role ----------
-- Handles tables that do not exist in your database (older schema) by
-- skipping them rather than failing the whole script.

do $$
declare
  t    text;
  pol  record;
  tables text[] := array[
    -- publish-boundary tables
    'matches','stat_events','match_sets','match_live_state',
    -- league reference tables
    'leagues','seasons','divisions','venues','courts','tournaments',
    'tournament_groups','teams','team_honours','staff','players',
    'team_players','match_officials','match_rosters'
  ];
begin
  foreach t in array tables loop

    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skip % — table not in this database', t;
      continue;
    end if;

    -- RLS on, so the policies below are the whole story.
    execute format('alter table public.%I enable row level security', t);

    -- Drop EVERY existing policy, whatever it is called and whether it is
    -- permissive or restrictive. A single leftover RESTRICTIVE policy that
    -- tests auth.role() would keep refusing the insert no matter how many
    -- permissive policies we add.
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy "open console reads %1$s" on public.%1$I '
      'for select to anon, authenticated using (true)', t);

    execute format(
      'create policy "open console writes %1$s" on public.%1$I '
      'for all to anon, authenticated using (true) with check (true)', t);

    -- RLS decides which ROWS; grants decide whether the role may touch the
    -- TABLE at all. Supabase normally grants these by default, but a table
    -- created outside the dashboard can miss them — and the resulting
    -- "permission denied for table" is also SQLSTATE 42501, so it looks
    -- like the same bug.
    execute format(
      'grant select, insert, update, delete on public.%I to anon, authenticated', t);

    raise notice 'opened %', t;
  end loop;
end $$;

-- Views the app reads (roster_view, match_statistics, standings) inherit
-- the policies of their base tables, but still need the table grant.
do $$
declare v text;
begin
  foreach v in array array['roster_view','match_statistics','standings'] loop
    if to_regclass(format('public.%I', v)) is not null then
      execute format('grant select on public.%I to anon, authenticated', v);
    end if;
  end loop;
end $$;

grant usage on schema public to anon, authenticated;


-- ---------- 2. The full policy listing ----------
-- The SQL editor only shows the result of the LAST select in a file, and
-- the last one here is the inventory in section 4 — the more useful of the
-- two when something is wrong. Run this one on its own when you want to
-- read the policies themselves. Every row should say `true` under
-- using_expr and with_check; anything still naming auth. is a policy this
-- script did not reach, and it will go on refusing writes.
--
--   select tablename, policyname, cmd, permissive, roles::text,
--          coalesce(qual::text, '—')       as using_expr,
--          coalesce(with_check::text, '—') as with_check
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;


-- ---------- 3. Smoke-test an actual anon insert into matches ----------
-- This is the exact write the console failed on. It rolls itself back, so
-- nothing is left behind.
--
--   'anon insert into matches accepted'  → fixed, go press RETRY.
--   'STILL BLOCKED'                      → a policy or grant was missed.
--   'skipping'                           → the tables it needs are absent;
--                                          section 4 says which.
--
-- NOTHING BELOW MAY RAISE. The SQL editor runs this file as ONE
-- transaction: a diagnostic that throws would roll back the policy fix
-- above and leave the console exactly as broken as it was, while the
-- error message talks about something else entirely. Every failure here
-- is reported as a notice.

do $$
declare
  tour uuid;
  home uuid;
  away uuid;
begin
  -- Check the tables exist before naming them. A missing relation is a
  -- parse-time-ish failure that no exception handler can soften, so it has
  -- to be avoided rather than caught.
  if to_regclass('public.tournaments') is null
     or to_regclass('public.teams') is null
     or to_regclass('public.matches') is null then
    raise notice 'skipping the insert test — this database is missing one of '
                 'tournaments/teams/matches. See section 4.';
    return;
  end if;

  execute 'select id from tournaments limit 1' into tour;
  execute 'select id from teams limit 1' into home;
  execute 'select id from teams where id is distinct from $1 limit 1'
    into away using home;

  if tour is null or home is null or away is null then
    raise notice 'No tournament/teams seeded yet — skipping the insert test. '
                 'The policy listing is still the answer.';
    return;
  end if;

  set local role anon;
  execute 'insert into matches (tournament_id, home_team_id, away_team_id, date) '
          'values ($1, $2, $3, current_date)' using tour, home, away;
  reset role;

  raise notice 'anon insert into matches accepted — the console will sync.';
  raise exception using errcode = 'triggered_action_exception',
                        message = 'rollback: smoke test only';
exception
  when triggered_action_exception then
    reset role;
    raise notice 'Smoke test passed and rolled back cleanly. Nothing was stored.';
  when insufficient_privilege then
    reset role;
    raise notice 'STILL BLOCKED (42501): a policy or grant was missed. %', sqlerrm;
  when others then
    reset role;
    raise notice 'Insert test could not run [%]: %. The policies above were '
                 'still applied.', sqlstate, sqlerrm;
end $$;


-- ---------- 4. What is actually in this database ----------
-- Run this on its own if the fix does not take. `present` false means the
-- app expects a table your database has never had — the console will fail
-- on that table with 42P01 ("relation does not exist"), which is a missing
-- migration, not a security problem. Fix it by running schema.sql.

with expected(name) as (
  select unnest(array[
    'leagues','seasons','divisions','venues','courts','tournaments',
    'tournament_groups','teams','team_honours','staff','players',
    'team_players','matches','match_officials','match_sets',
    'match_rosters','stat_events','match_live_state'
  ])
)
select e.name                                          as expected_table,
       to_regclass('public.' || quote_ident(e.name)) is not null as present,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = e.name) as policies
from expected e
order by present, e.name;


-- ---------- 5. Tables of these names in OTHER schemas ----------
-- If section 4 says a table is absent but you know you created it, it may
-- live outside `public` — where PostgREST cannot see it and none of the
-- policies above apply to it. Run this one on its own too.
--
--   select table_schema, table_name
--   from information_schema.tables
--   where table_name in (
--           'tournaments','matches','teams','players','stat_events',
--           'team_players','match_rosters','match_sets')
--     and table_schema not in ('pg_catalog','information_schema')
--   order by table_schema, table_name;
