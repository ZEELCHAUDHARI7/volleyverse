-- =====================================================================
-- VOLLEYVERSE — CONSOLE ADMIN ALLOWLIST + RLS HARDENING
--
-- Paste this whole file into the Supabase SQL editor and press Run.
--
-- WHY
-- Real Supabase Auth just landed: /login, /fans/sign-in and /fans/join
-- create and verify real accounts. But every write policy in this
-- database (schema.sql's originals, then loosened further by
-- 2026-08-11-open-console-writes.sql) is currently `using (true)` for
-- BOTH anon and authenticated — i.e. anyone, including someone with no
-- session at all, can still write match data directly via the Supabase
-- REST API. Gating /console in Next.js middleware alone would be
-- cosmetic: a fan account (or anyone) could still write straight to the
-- database, bypassing the app entirely.
--
-- WHAT THIS DOES
--   1. Creates `console_admins` — a tiny allowlist table, keyed by
--      email, that middleware and these policies both check.
--   2. Adds `is_console_admin()`, checking whether the CALLING user's
--      own email is in that table.
--   3. Re-points every write policy this app has at
--      is_console_admin() instead of `true`. Reads stay public
--      (`using (true)`) — unchanged, out of scope, the showcase is
--      meant to be readable by anyone.
--
-- Policies are dropped by CATALOGUE (whatever pg_policies actually
-- lists for the table), not by name — this project has had several
-- migrations plus an ad hoc FIX-RLS-NOW.sql create differently-named
-- policies over time, and only a catalogue-based drop is guaranteed to
-- remove whatever is actually live.
--
-- RUN ORDER MATTERS: insert your own email into console_admins BEFORE
-- (or in the same session as) running this file, or your own writes —
-- including the console you're using to run this migration's smoke
-- test — start failing the moment it runs.
--
--     insert into console_admins (email) values ('you@example.com');
--
-- Safe to re-run: every step is idempotent (create if not exists / drop
-- then recreate).
-- =====================================================================

-- ---------- 1. The allowlist table ----------
create table if not exists console_admins (
  email text primary key
);

alter table console_admins enable row level security;

drop policy if exists "self reads own admin row" on console_admins;
create policy "self reads own admin row"
  on console_admins for select
  using (auth.jwt() ->> 'email' = email);

-- No insert/update/delete policy at all, on purpose: this table is only
-- ever managed by hand in the SQL editor (or a service-role key), never
-- from the app.

create or replace function is_console_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from console_admins where email = auth.jwt() ->> 'email'
  );
$$;

-- ---------- 2. Re-point every write policy at the allowlist ----------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    -- Publish-boundary tables.
    'matches', 'stat_events', 'match_sets', 'match_live_state',
    -- League reference tables.
    'leagues', 'seasons', 'divisions', 'venues', 'courts', 'tournaments',
    'tournament_groups', 'teams', 'team_honours', 'staff', 'players',
    'team_players', 'match_officials', 'match_rosters'
  ] loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy "public reads %1$s" on %1$I for select using (true)', t);
    execute format(
      'create policy "console admin writes %1$s" on %1$I for all '
      'using (is_console_admin()) with check (is_console_admin())', t);
  end loop;
end $$;

-- ---------- 3. Prove it took ----------
-- Every table above should show exactly two policies: a public select
-- (qual = true) and a console-admin-gated `for all` (qual references
-- is_console_admin).

select tablename, policyname, cmd, qual::text as using_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
