-- Person rows (players) that no team registration (team_players) uses.
--
-- Removing a player used to delete only the registration, so every removal and
-- every U21 re-load left its person row behind. The app now deletes the person
-- with its last registration; this clears the rows left before that fix.
--
-- Safe: in schema.sql only team_players references players (on delete cascade),
-- and only people with no team_players row are deleted, so no registration,
-- line-up or stat event can go with them. Step 1 shows both facts before
-- anything is deleted; run it first and read the result.

-- 1. Preview (changes nothing).
select conrelid::regclass as referencing_table, conname, confdeltype
from pg_constraint
where confrelid = 'players'::regclass and contype = 'f';

select count(*) as people_to_delete
from players p
where not exists (select 1 from team_players tp where tp.player_id = p.id);

-- 2. Delete.
begin;

delete from players p
where not exists (select 1 from team_players tp where tp.player_id = p.id);

commit;
