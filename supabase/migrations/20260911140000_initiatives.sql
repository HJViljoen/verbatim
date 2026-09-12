-- Initiative tracking (WP7c, 2026-09-11). Two layers, both on data that
-- already exists per update.
--
-- LAYER 1 — the recommendation lifecycle, woken up. `recommendations.status`
-- has existed (and been granted to `authenticated`) since 20260820120000 and
-- has never been written: 86 real recommendations, 0 statuses. It stayed
-- dormant for a structural reason as much as a UI one — Pass D-b clears and
-- reinserts every recommendation each update, so a status a client set on
-- Monday would be deleted by Sunday's update. `lineage_id` is the missing
-- cross-run identity: the same recommendation, re-generated, keeps one id
-- across updates and therefore keeps the client's status.
--
-- LAYER 2 — `initiatives`: the client declares what it is trying to move
-- ("shift tech-advancement perception vs Ottobock") and the product answers,
-- weekly, off `theme_observations` — the corpus it already has. Tenant-
-- writable, unlike almost everything else here, because an initiative is the
-- client's own statement and not analysis we produced.

-- 1. Recommendation lineage ---------------------------------------------------
alter table public.recommendations
  add column if not exists lineage_id uuid;

comment on column public.recommendations.lineage_id is
  'The recommendation''s identity ACROSS updates. recommendations.id is a per-update row id (Pass D-b deletes and reinserts every update); lineage_id is stable, so a status the client set survives the next update. Set on insert by lib/pipeline/rec-lineage.ts: matched to the previous update''s recommendation (same type + title match) → inherit its lineage_id; otherwise the row''s own id, which starts a new lineage.';

create index if not exists recommendations_client_lineage_idx
  on public.recommendations using btree (client_id, lineage_id);

-- 'in_progress' — the client has started, not finished. The four existing
-- words have no way to say that, and "acted_on" is the end of the lifecycle
-- ("Done" in the UI), not the middle of it. Widening a CHECK accepts every
-- existing row unchanged.
alter table public.recommendations drop constraint if exists recommendations_status_check;
alter table public.recommendations add constraint recommendations_status_check
  check (status in ('new', 'acknowledged', 'in_progress', 'acted_on', 'dismissed'));

comment on column public.recommendations.status is
  'new | acknowledged | in_progress | acted_on | dismissed — the client''s own lifecycle, never written by the pipeline except to inherit a prior update''s status through lineage_id. Shown as New / Acknowledged / Working on it / Done / Dismissed (lib/calibration.ts REC_STATUS_LABEL).';

-- The grant is left exactly as 20260820120000 wrote it: `status`, and nothing
-- else. It was tempting to add `updated_at` so the action could stamp when a
-- recommendation moved, but a client-facing write must work on the schema that
-- is DEPLOYED, and a deploy can land before its migration — with `updated_at`
-- in the write and not yet in the grant, every status change 403s. There is no
-- BEFORE UPDATE trigger on this table (checked live), so `updated_at` simply
-- keeps the insert's timestamp; nothing reads it. Restated here rather than
-- left implicit, because the revoke/grant pair below is what a reader greps
-- for when they ask "what may a tenant write?".
revoke update on public.recommendations from authenticated;
grant update (status) on public.recommendations to authenticated;

-- 2. Initiatives ---------------------------------------------------------------
create table if not exists public.initiatives (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- The client's own words for what they are trying to move. Prefilled with a
  -- theme label when declared from Voice of Customer, then theirs to edit.
  title text not null,
  goal text,
  -- WHAT is measured: theme_registry ids (the cross-update identity — never a
  -- label, which churns ~88% update to update). 1–5, so an initiative stays a
  -- thing you can point at.
  registry_ids uuid[] not null default '{}'::uuid[],
  -- Optional scope note ("vs Ottobock") — copy only. Competitor themes carry
  -- their own registry ids, so scoping is done by picking those ids.
  competitor_name text,
  -- Which way counts as progress. There is no "good" direction in the data:
  -- growing share of a pain-point theme is a loss, growing share of a
  -- capability theme is a win, and only the client knows which they declared.
  direction text not null default 'up' check (direction in ('up', 'down')),
  started_at date not null default current_date,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_by uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint initiatives_title_len_check check (char_length(title) between 1 and 120),
  constraint initiatives_goal_len_check check (goal is null or char_length(goal) <= 400),
  constraint initiatives_competitor_len_check check (competitor_name is null or char_length(competitor_name) <= 80),
  constraint initiatives_registry_ids_check
    check (cardinality(registry_ids) between 1 and 5)
);

create index if not exists initiatives_client_status_idx
  on public.initiatives using btree (client_id, status, created_at desc);

comment on table public.initiatives is
  'A client-declared initiative: what they are trying to move, measured from theme_observations since started_at (lib/initiatives/measure.ts). Declared and edited by the tenant — this is their statement, not our analysis.';
comment on column public.initiatives.registry_ids is
  'theme_registry ids. Identity, never labels: themes.id is a per-update row id and labels churn (AGENTS.md).';
comment on column public.initiatives.started_at is
  'The line the measurement is drawn from. Points before it are not the initiative''s.';

-- 3. RLS — the tenant reads AND writes its own ---------------------------------
-- The exception to the rule everywhere else in this schema. An initiative is
-- declared by the client, so insert/update are theirs; delete is not (a dropped
-- initiative goes to status 'dropped', so the measurement it made is never
-- silently removed from an already-sent report).
alter table public.initiatives enable row level security;

drop policy if exists "Users see their own initiatives" on public.initiatives;
create policy "Users see their own initiatives" on public.initiatives
  for select using (client_id = (select u.client_id from public.users u where u.id = (select auth.uid())));

drop policy if exists "Users create their own initiatives" on public.initiatives;
create policy "Users create their own initiatives" on public.initiatives
  for insert with check (client_id = (select u.client_id from public.users u where u.id = (select auth.uid())));

drop policy if exists "Users update their own initiatives" on public.initiatives;
create policy "Users update their own initiatives" on public.initiatives
  for update
  using      (client_id = (select u.client_id from public.users u where u.id = (select auth.uid())))
  with check (client_id = (select u.client_id from public.users u where u.id = (select auth.uid())));

-- Column privileges, the T0-2 idiom: the policy says WHOSE row, the grant says
-- WHICH columns. client_id is insertable (RLS pins it to the caller's tenant)
-- and never updatable — an initiative cannot be moved between workspaces.
revoke all on public.initiatives from authenticated, anon;
grant select on public.initiatives to authenticated;
grant insert (client_id, title, goal, registry_ids, competitor_name, direction, started_at, created_by)
  on public.initiatives to authenticated;
grant update (title, goal, registry_ids, competitor_name, direction, status, updated_at)
  on public.initiatives to authenticated;

-- Post-apply check (run by hand):
--   select count(*) from public.initiatives;                                  -- 0
--   select count(*) from public.recommendations where lineage_id is not null; -- 0 until the next update
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'recommendations_status_check';                         -- includes in_progress
--   select tablename, policyname, cmd from pg_policies where tablename = 'initiatives';
--   select column_name, privilege_type from information_schema.column_privileges
--     where table_name = 'initiatives' and grantee = 'authenticated' order by 2, 1;
