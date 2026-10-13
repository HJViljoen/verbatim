-- Your moves: the database refuses a member's writes (decision 6a; Heinrich,
-- 13 Oct, "agree 3-8"). Applied by Heinrich through
-- scripts/apply-market-first-migrations.sh --set moves-role, after the
-- products set (20261109090000), from the deployed tree. NOT APPLIED ANYWHERE
-- when it was written.
--
-- WHAT WAS OPEN. Since depth v2 (T7, lib/moves-access.ts `mayDecideMoves`)
-- accepting advice, setting it aside ("Not for us"), dating a move, tracking a
-- subject and changing a move's status are an owner's or an admin's in the
-- app. The database did not agree: four write policies keyed on the tenant
-- and never on the role, so a member's own JWT could PATCH or POST straight
-- through PostgREST and put a line on the record every page reads:
--   moves            "Members declare their own moves"      INSERT
--                    "Members move their moves along"       UPDATE (status)
--   rec_decisions    "Members record their own decisions"   INSERT
--   recommendations  "Users can update own recommendations" UPDATE (status)
-- (20260918093000_subjects.sql, 20260915093000_rec_decisions.sql, the
-- schema baseline and 20260823150000's initplan rewrite of the last one.)
--
-- WHAT THIS CHANGES: THE FOUR POLICIES, AND NOTHING ELSE. Each is replaced by
-- one with the same tenant pin, the same actor pin where it had one
-- (`declared_by`, `decided_by` = the caller), and the role: the caller's
-- `get_my_role()` is owner or admin (the Block B shape `subjects` got in
-- 20260918093000, and `tracking_configs`' and `invitations`' since the
-- baseline), or the caller is a platform admin (`is_superadmin()`, the
-- `platform_admins` test held-snapshots and platform-publish use). The
-- tenant pin stays on that arm too: a platform admin's own session writes its
-- own tenant only; viewing another tenant arrives on the service role
-- (lib/auth.ts applyOperatorView). No grant changes, so the columns a writer
-- may touch are exactly what they were (moves: INSERT on the ten columns,
-- UPDATE on status and updated_at; rec_decisions: INSERT on its seven;
-- recommendations: UPDATE on status). No SELECT policy changes: every member
-- reads what they read before. The service role bypasses RLS and is untouched,
-- so the pipeline, the operator and the scripts write as before.
--
-- WHY THE APP KEEPS WORKING. Every app write to these tables is made after
-- `mayDecideMoves` on the session client (lib/actions/accept-advice.ts,
-- rec-status.ts, date-move.ts, and setMoveStatusAction / trackSubjectAction in
-- lib/actions/subjects.ts), so an owner's or an admin's write passes the new
-- policy, and a member's is refused by the app before it reaches here. An
-- UPDATE the policy filters out comes back as zero rows (setMoveStatus reads
-- `select('id')` and says so), an INSERT it refuses as 42501.
--
-- The wrapped calls (`(select …)`) are evaluated once per statement, not per
-- row (the initplan rule 20260823150000 applied across the schema).
--
-- IDEMPOTENT. Every policy is `drop policy if exists` under both its old and
-- its new name, then created; applied twice on a throwaway PG 17.11 cluster
-- with an empty catalogue diff and checked by
-- scripts/pg-shim/moves-role-gate-checks.sql (a member refused on all four,
-- an owner, an admin and a platform admin let through, the service role let
-- through, and every read unchanged). No BEGIN/COMMIT, no CONCURRENTLY: the
-- runner wraps the file in one transaction.
--
-- UNDO (only if a write a member must make turns up): re-create the four old
-- policies from the files named above, by their old names, and drop the four
-- below.

-- moves: declaring a move ("Date a move", "Track this", Accept) ---------------
drop policy if exists "Members declare their own moves" on public.moves;
drop policy if exists "Owners and admins declare moves" on public.moves;
create policy "Owners and admins declare moves" on public.moves
  for insert to authenticated
  with check (
    client_id = (select public.get_my_client_id())
    and declared_by = (select auth.uid())
    and ((select public.get_my_role()) = any (array['owner', 'admin']) or (select public.is_superadmin()))
  );

-- moves: a move's status (done, dropped, running again) -------------------------
drop policy if exists "Members move their moves along" on public.moves;
drop policy if exists "Owners and admins move moves along" on public.moves;
create policy "Owners and admins move moves along" on public.moves
  for update to authenticated
  using (
    client_id = (select public.get_my_client_id())
    and ((select public.get_my_role()) = any (array['owner', 'admin']) or (select public.is_superadmin()))
  )
  with check (
    client_id = (select public.get_my_client_id())
    and ((select public.get_my_role()) = any (array['owner', 'admin']) or (select public.is_superadmin()))
  );

-- rec_decisions: a decision on a piece of advice (Accept, Not for us) ------------
drop policy if exists "Members record their own decisions" on public.rec_decisions;
drop policy if exists "Owners and admins record decisions" on public.rec_decisions;
create policy "Owners and admins record decisions" on public.rec_decisions
  for insert to authenticated
  with check (
    client_id = (select public.get_my_client_id())
    and decided_by = (select auth.uid())
    and ((select public.get_my_role()) = any (array['owner', 'admin']) or (select public.is_superadmin()))
  );

-- recommendations: the status copy the pages read ---------------------------------
drop policy if exists "Users can update own recommendations" on public.recommendations;
drop policy if exists "Owners and admins update recommendations" on public.recommendations;
create policy "Owners and admins update recommendations" on public.recommendations
  for update to authenticated
  using (
    client_id = (select public.get_my_client_id())
    and ((select public.get_my_role()) = any (array['owner', 'admin']) or (select public.is_superadmin()))
  )
  with check (
    client_id = (select public.get_my_client_id())
    and ((select public.get_my_role()) = any (array['owner', 'admin']) or (select public.is_superadmin()))
  );

-- Post-apply checks, read-only:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename in ('moves', 'rec_decisions', 'recommendations') order by 1, 3, 2;
--     -- moves: "Members read their moves" SELECT, "Owners and admins declare moves" INSERT,
--     --        "Owners and admins move moves along" UPDATE; rec_decisions: "Members read their decisions"
--     --        SELECT, "Owners and admins record decisions" INSERT; recommendations: "Users can view own
--     --        recommendations" SELECT, "Owners and admins update recommendations" UPDATE
--   select count(*) from pg_policies where schemaname = 'public'
--    and tablename in ('moves', 'rec_decisions', 'recommendations') and cmd in ('INSERT', 'UPDATE')
--    and (with_check not like '%get_my_role()%' or (qual is not null and qual not like '%get_my_role()%'));  -- 0
--   select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
--    where table_schema = 'public' and table_name = 'moves' and grantee = 'authenticated' and privilege_type = 'UPDATE';  -- status, updated_at
