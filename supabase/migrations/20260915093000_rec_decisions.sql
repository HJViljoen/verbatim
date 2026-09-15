-- The recommendation decision ledger (Phase 0, design item 17, decision D11, 2026-09-15).
--
-- WHAT IS MISSING TODAY. `recommendations.status` has been granted to tenants
-- since 2026-08-18 and written by nobody: 121 rows in production, all `new`,
-- `updated_at = created_at` on every one of them. There is no `decided_at`
-- column and never has been — the grant is `status` and nothing else, so a
-- client's "Done" is recorded today with no timestamp at all, and the only
-- place it lives is a row Pass D-b deletes and reinserts every update.
--
-- WHY IT GOES IN ITS OWN TABLE. The column cannot be the record. A new update
-- mints a fresh UUID for every recommendation and carries the status across
-- only if `lib/pipeline/rec-lineage.ts` re-finds the row — on the mechanism's
-- first production outing that was 1 prior in 10. A miss does not degrade the
-- client's word; it erases it, leaving nothing behind to say it was ever
-- spoken. A decision is a historical fact about a moment, so it is stored as
-- one: append-only, dated, attributed, and keyed on the identity that survives
-- the update rather than on the row that does not.
--
-- NO FOREIGN KEY ON EITHER ID, DELIBERATELY. `recommendation_id` names the row
-- the client actually clicked — the next update deletes it, and a FK would take
-- the decision with it, which is precisely the record this table exists to
-- keep. `lineage_id` names a lineage, and a lineage is not a row anywhere: it
-- is a value that points at whichever recommendation started the chain, and
-- that row is deleted too. `run_id` DOES carry a FK (on delete set null),
-- because `pipeline_runs` rows are not churned and a decision outliving its
-- update is the normal case.
--
-- APPEND-ONLY, AND SAID TO EVERY ROLE. Members select and insert; nobody
-- updates or deletes — the pipeline's service role included. A decision that
-- can be edited afterwards is not a ledger, and "they marked this Done three
-- weeks ago" has to be answerable from what was written at the time. `id` and
-- `decided_at` are not in the insert grant, so a client cannot backdate a
-- decision or overwrite one by reusing its id.
--
-- The service role needs saying out loud because this project's `pg_default_acl`
-- grants `arwdDxtm` on every new public table to anon, authenticated AND
-- service_role. Revoking from the first two (which RLS covers anyway) while
-- leaving the third would make append-only a property of the application rather
-- than of the database — and the service role is the one that bypasses RLS.
-- Deleting a tenant still takes their decisions with them: the cascade from
-- `clients` is a referential action, which is not permission-checked against
-- the role doing the delete.

-- 1. The ledger -----------------------------------------------------------------
create table if not exists public.rec_decisions (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  -- The recommendation's identity ACROSS updates (recommendations.lineage_id).
  -- No FK: see the header.
  lineage_id        uuid not null,
  -- The per-update row the decision was made on. No FK: it is deleted by the
  -- next update. Kept because "which wording were they looking at" is part of
  -- what a decision means.
  recommendation_id uuid not null,
  -- The update that produced that row, where it still exists.
  run_id            uuid references public.pipeline_runs(id) on delete set null,
  -- The same vocabulary as recommendations.status (lib/calibration.ts
  -- REC_STATUSES). 'new' is a real decision here, not an absence: it is a
  -- client moving something BACK to New, and the ledger has to be able to say so
  -- or a reset would be silently undone by the previous "Done".
  status            text not null check (status in ('new','acknowledged','in_progress','acted_on','dismissed')),
  decided_by        uuid references public.users(id) on delete set null,
  -- The timestamp the schema has never had.
  decided_at        timestamptz not null default now(),
  note              text
);

comment on table public.rec_decisions is
  'Append-only record of a client moving a recommendation through its lifecycle. Keyed on lineage_id (the identity that survives Pass D-b''s delete-and-reinsert), not on recommendation_id (which does not). The next update reads the latest decision per lineage and carries it onto the row that inherits that lineage — lib/pipeline/rec-lineage.ts inheritedStatus. recommendations.status is the copy the page reads; this table is the record.';
comment on column public.rec_decisions.lineage_id is
  'recommendations.lineage_id. No foreign key: the row that started the lineage is deleted by the next update, and a decision must outlive it.';
comment on column public.rec_decisions.status is
  'new | acknowledged | in_progress | acted_on | dismissed — the same words as recommendations.status. A ''new'' row means the client moved it back to New.';

-- The one read pattern: the latest decision per lineage, for this tenant.
create index if not exists rec_decisions_lineage_idx
  on public.rec_decisions (client_id, lineage_id, decided_at desc);

-- 2. RLS — members read and append their own tenant's decisions ------------------
alter table public.rec_decisions enable row level security;

drop policy if exists "Members read their decisions" on public.rec_decisions;
create policy "Members read their decisions" on public.rec_decisions
  for select to authenticated using (client_id = public.get_my_client_id());

-- The insert check pins the ACTOR as well as the tenant. `decided_by` is in the
-- column grant because the browser's own client writes it, and a table whose
-- entire value is attribution may not let one member file a decision under
-- another member's name. The workspace switcher is unaffected: a platform admin
-- viewing another tenant arrives on the SERVICE-ROLE client (lib/auth.ts
-- applyOperatorView), which bypasses RLS, and the action still passes the real
-- person's id.
drop policy if exists "Members record their own decisions" on public.rec_decisions;
create policy "Members record their own decisions" on public.rec_decisions
  for insert to authenticated
  with check (client_id = public.get_my_client_id() and decided_by = (select auth.uid()));

-- No update policy and no delete policy: append-only is enforced by their
-- absence, and by the grants below.
revoke all on public.rec_decisions from authenticated, anon;
grant select on public.rec_decisions to authenticated;
grant insert (client_id, lineage_id, recommendation_id, run_id, status, decided_by, note)
  on public.rec_decisions to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be:
-- the pipeline reads this table through the service-role key on every update,
-- and a silent "permission denied" there would carry no status forward while
-- the browser half kept working.
grant select, insert on public.rec_decisions to service_role;
-- And the other half of stating it. This project's default ACL hands every new
-- public table to service_role with all privileges, so append-only is only true
-- of the role that bypasses RLS if it is taken away here. Nothing in the repo
-- updates or deletes a decision; if something ever must, it is a migration and a
-- conversation, not a quiet write. TRUNCATE goes with them — emptying the ledger
-- in one statement is the same act as deleting it row by row.
revoke update, delete, truncate on public.rec_decisions from service_role;

-- 3. Backfill — NULL stops meaning two different things --------------------------
-- 111 of 121 recommendations predate the 2026-09-12 lineage migration, so a NULL
-- lineage_id today means either "written before the feature existed" or "the
-- write failed". The matcher already treats a null-lineage prior as its own
-- lineage (`prior.lineage_id ?? prior.id`), so writing that value down changes
-- no behaviour and leaves NULL meaning exactly one thing afterwards. Idempotent
-- by its own WHERE clause.
update public.recommendations set lineage_id = id where lineage_id is null;

-- Post-apply checks (run by hand, read-only):
--   select count(*) from public.rec_decisions;                                  -- 0
--   select count(*) from public.recommendations where lineage_id is null;       -- 0 (was 111)
--   select count(*) from public.recommendations where lineage_id = id;          -- 120 (111 backfilled + 9 self-lineage)
--   select policyname, cmd from pg_policies where tablename = 'rec_decisions';  -- SELECT + INSERT only
--   select column_name, privilege_type from information_schema.column_privileges
--     where table_name = 'rec_decisions' and grantee = 'authenticated' order by 2, 1;
--   select grantee, privilege_type from information_schema.table_privileges
--     where table_name = 'rec_decisions' order by 1, 2;
--     -- service_role: SELECT + INSERT only. UPDATE or DELETE here means the
--     -- revoke above did not run, and append-only is application-level again.
--   select indexname from pg_indexes where tablename = 'rec_decisions';
