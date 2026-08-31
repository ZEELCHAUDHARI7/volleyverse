-- =====================================================================
-- VOLLEYVERSE — 3-ROLE ACCESS CONTROL & SUPER ADMIN MIGRATION
-- =====================================================================

-- 1. Create user_roles table
create table if not exists user_roles (
  email text primary key,
  role text not null check (role in ('super_admin', 'admin', 'simple_user')) default 'simple_user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_roles enable row level security;

-- 2. Migrate existing console_admins table entries into user_roles
insert into user_roles (email, role)
select email, 'admin' from console_admins
on conflict (email) do update set role = 'admin';

-- 3. Seed primary Super Admin
insert into user_roles (email, role)
values ('dhruv.khalasi.hti@gmail.com', 'super_admin')
on conflict (email) do update set role = 'super_admin';

-- 4. RLS Policies on user_roles
drop policy if exists "allow read own or super admin read all" on user_roles;
drop policy if exists "read user roles" on user_roles;
create policy "read user roles" on user_roles for select using (true);

drop policy if exists "super admin full write user_roles" on user_roles;
create policy "super admin full write user_roles"
  on user_roles for all
  using (
    exists (
      select 1 from user_roles ur 
      where ur.email = auth.jwt() ->> 'email' and ur.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from user_roles ur 
      where ur.email = auth.jwt() ->> 'email' and ur.role = 'super_admin'
    )
  );

-- 5. Helper Functions
create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles where email = auth.jwt() ->> 'email' and role = 'super_admin'
  );
$$;

create or replace function is_console_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles where email = auth.jwt() ->> 'email' and role in ('super_admin', 'admin')
  );
$$;

-- 6. Update write policies across matches, teams, players, stat_events, etc.
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'matches', 'stat_events', 'match_sets', 'match_live_state',
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
