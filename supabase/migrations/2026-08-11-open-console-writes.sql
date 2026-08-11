-- =====================================================================
-- VOLLEYVERSE — OPEN THE CONSOLE'S WRITES
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Safe to run more than once: it only replaces policies by name.
--
-- WHY
-- The schema was written for a console behind a sign-in: every write
-- policy demanded auth.role() = 'authenticated'. The sign-in was later
-- removed (commit 9a9b65b, "the console is open again"), and nothing in
-- src/lib/providers/ ever creates a session — so the browser reaches
-- PostgREST as role 'anon' and every insert is refused:
--
--     new row violates row-level security policy for table "stat_events"
--
-- That rejection is not limited to the tracker. Teams, players, matches
-- and sets are all policied the same way, so "Load roster" fails just as
-- silently as a tapped spike.
--
-- WHAT THIS DOES
-- Grants the anon role full read and write on the league tables, which is
-- what "the console has no sign-in" actually means at the database level.
--
-- WHAT YOU GIVE UP — read this before running it
--   · The anon key ships inside the public JavaScript bundle. Anyone who
--     opens the site can extract it and write to this database directly,
--     bypassing every screen. The console's only protection is now the
--     obscurity of its URL.
--   · The publish flag stops being a security boundary and becomes a
--     display filter: the showcase still shows only published matches,
--     but an unpublished match is no longer hidden at the database level.
--     Reads must open too, or the console cannot load the very match it
--     is in the middle of collecting.
--
-- Acceptable for a demo, a college project or a league running on a
-- private URL. Before a real go-live, restore a sign-in and re-run
-- schema.sql's original policies instead.
-- =====================================================================

-- ---------- 1. The publish-boundary tables ----------
do $$
declare t text;
begin
  foreach t in array array[
    'matches','stat_events','match_sets','match_live_state'
  ] loop
    -- Old, authenticated-only policies, dropped by their schema.sql names.
    execute format('drop policy if exists "public reads published matches" on %I', t);
    execute format('drop policy if exists "public reads events of published matches" on %I', t);
    execute format('drop policy if exists "public reads sets of published matches" on %I', t);
    execute format('drop policy if exists "public reads live state of published matches" on %I', t);
    execute format('drop policy if exists "staff writes matches" on %I', t);
    execute format('drop policy if exists "staff writes events" on %I', t);
    execute format('drop policy if exists "staff writes sets" on %I', t);
    execute format('drop policy if exists "staff writes live state" on %I', t);
    execute format('drop policy if exists "open console reads %1$s" on %1$I', t);
    execute format('drop policy if exists "open console writes %1$s" on %1$I', t);

    execute format(
      'create policy "open console reads %1$s" on %1$I for select using (true)', t);
    execute format(
      'create policy "open console writes %1$s" on %1$I for all '
      'using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 2. The league reference tables ----------
-- These were already publicly readable; only the write side changes.
do $$
declare t text;
begin
  foreach t in array array[
    'leagues','seasons','divisions','venues','courts','tournaments',
    'tournament_groups','teams','team_honours','staff','players',
    'team_players','match_officials','match_rosters'
  ] loop
    execute format('drop policy if exists "staff writes %1$s" on %1$I', t);
    execute format('drop policy if exists "open console writes %1$s" on %1$I', t);
    execute format('drop policy if exists "public reads %1$s" on %1$I', t);

    execute format(
      'create policy "public reads %1$s" on %1$I for select using (true)', t);
    execute format(
      'create policy "open console writes %1$s" on %1$I for all '
      'using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 3. Prove it took ----------
-- Every table below should report at least one policy whose qualifier is
-- `true` rather than an auth.role() test.

select tablename, policyname, cmd, qual::text as using_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ---------- 4. Smoke-test an actual insert as anon ----------
-- Rolls itself back, so nothing is left behind. If this raises 42501 the
-- policies did not apply; any other error names a different cause.
do $$
declare m uuid; t uuid; p uuid;
begin
  select id into m from matches limit 1;
  select team_id, player_id into t, p from match_rosters limit 1;

  if m is null or p is null then
    raise notice 'No match/roster yet — skipping the smoke test.';
    return;
  end if;

  set local role anon;
  insert into stat_events (match_id, team_id, player_id, set_no, type)
  values (m, t, p, 1, 'SPIKE_POINT');
  reset role;

  raise notice 'anon insert accepted — the tracker will sync.';
  raise exception 'rollback: smoke test only';
exception
  when sqlstate 'P0001' then
    raise notice 'Smoke test passed and rolled back cleanly.';
end $$;
