-- =====================================================================
-- VOLLEYVERSE — SUPER ADMIN MANAGEMENT QUICK SCRIPTS
-- =====================================================================
-- Copy and paste any of these 1-line queries into your Supabase SQL Editor:

-- 1. MAKE ANY USER A SUPER ADMIN (Full Control over /admin and /console)
insert into user_roles (email, role)
values ('user@example.com', 'super_admin')
on conflict (email) do update set role = 'super_admin';

-- 2. MAKE ANY USER A CONSOLE ADMIN (Scorekeeper / Staff for /console)
insert into user_roles (email, role)
values ('user@example.com', 'admin')
on conflict (email) do update set role = 'admin';

-- 3. REVOKE ADMIN RIGHTS (Demote back to Simple User / Fan)
update user_roles 
set role = 'simple_user' 
where email = 'user@example.com';

-- 4. DELETE USER ROLE ENTRY ENTIRELY
delete from user_roles 
where email = 'user@example.com';

-- 5. VIEW ALL REGISTERED ROLES
select * from user_roles order by created_at desc;
