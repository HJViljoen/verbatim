-- Undo of supabase/migrations/20261110090000_moves_role_gate.sql (decision
-- 6a), kept beside its checks (scripts/pg-shim/moves-role-gate-checks.sql).
-- Written from the four old definitions as the catalogue held them before the
-- migration (20260918093000_subjects.sql, 20260915093000_rec_decisions.sql,
-- the schema baseline and 20260823150000's initplan rewrite); proved on a
-- throwaway PG 17 cluster: migration, then this file, gives back the
-- pre-migration catalogue line for line, and the migration applies again over
-- it. Idempotent: every policy is dropped if it exists, then created.
--
-- Use it only if a write a member must make turns up. It hands a member's own
-- JWT the four writes again (declare a move, change a move's status, record a
-- decision, set a recommendation's status); the app still refuses a member
-- (`mayDecideMoves`, lib/moves-access.ts). No BEGIN/COMMIT: run it in one
-- transaction (`psql --single-transaction`). Not a migration: nothing records
-- it in the history.

drop policy if exists "Owners and admins declare moves" on public.moves;
drop policy if exists "Owners and admins move moves along" on public.moves;
drop policy if exists "Owners and admins record decisions" on public.rec_decisions;
drop policy if exists "Owners and admins update recommendations" on public.recommendations;

drop policy if exists "Members declare their own moves" on public.moves;
create policy "Members declare their own moves" on public.moves
  for insert to authenticated
  with check (client_id = public.get_my_client_id() and declared_by = (select auth.uid()));

drop policy if exists "Members move their moves along" on public.moves;
create policy "Members move their moves along" on public.moves
  for update to authenticated
  using (client_id = public.get_my_client_id())
  with check (client_id = public.get_my_client_id());

drop policy if exists "Members record their own decisions" on public.rec_decisions;
create policy "Members record their own decisions" on public.rec_decisions
  for insert to authenticated
  with check (client_id = public.get_my_client_id() and decided_by = (select auth.uid()));

drop policy if exists "Users can update own recommendations" on public.recommendations;
create policy "Users can update own recommendations" on public.recommendations
  for update to authenticated
  using (client_id = (select u.client_id from public.users u where u.id = (select auth.uid())))
  with check (client_id = (select u.client_id from public.users u where u.id = (select auth.uid())));
