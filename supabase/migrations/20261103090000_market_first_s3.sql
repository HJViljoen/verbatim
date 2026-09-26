-- MF3 · market-first Stage 3 (plan §4.1, §4.2; WP3.3, WP3.4, WP3.5, WP3.6,
-- WP3.10; applied by Heinrich, Tue 3 Nov, through
-- scripts/apply-market-first-migrations.sh --set mf3, from the data tag the
-- lead cuts on the deployed code).
--
-- WHAT IT ADDS. New tables, two new columns and two new trigger functions; no
-- month table, no audience CASE body and no existing function signature
-- changes (plan §4.1). The existing guard functions are attached, never
-- replaced.
--   month_lens_readings    the lens rows (WP3.3): the month's readings over
--                          one lens (buyers, makers, all_but_noise, dense20,
--                          same_searches:<prev YYYY-MM>, …), frozen with the
--                          month. Its insert guard is NEW:
--                          month_lens_frozen_insert_guard, a copy of
--                          month_reading_frozen_insert_guard whose "already
--                          held" test and mark carry the lens, so each lens
--                          back-reads each closed audience-month exactly once
--                          and another lens still can (feasibility must-fix 8)
--   month_brand_readings   brand topic rows (WP3.5), with the existing three
--                          guards attached unchanged
--   video_surfacings       every search that surfaced a video, per run
--                          (WP3.4); append-only
--   tracking_configs       watched_brands and market_description (WP3.5,
--                          WP3.10): operator-only
--   tracking_config_queue  queued tracking edits (WP3.10, decision I), applied
--                          on the 1st by the run's open-run; its rows are its
--                          own history
--   own_post_subjects      which subject each of the client's own posts (or
--                          one of its claims) touches (WP3.6). A RECORDED
--                          DEVIATION: WP3.6 writes these rows and §4.1 names
--                          no table for them, so MF3 carries it, in the shape
--                          pinned for mf/s3-moves on 27 Sep
--
-- THE CONVENTIONS ARE MF1's (20260928090000_market_first_s1.sql, Phase 1 plan
-- §2). Every table: RLS on, a get_my_client_id() select policy, every
-- privilege revoked from anon and authenticated and then column-level SELECT
-- for authenticated, service_role insert and select. What service_role keeps
-- beyond that depends on the table:
--   video_surfacings, own_post_subjects  append-only: UPDATE, DELETE and
--       TRUNCATE revoked; a newer row supersedes an older one
--   tracking_config_queue  the same, except that service_role may stamp
--       applied_at, once (a column grant, and a trigger that refuses a second
--       stamp or any other change): every other column of a queued edit is
--       history
--   month_lens_readings, month_brand_readings  month tables, with the month
--       tables' grants: UPDATE and DELETE kept (the writer is an upsert that
--       merges against what is stored, and the stale sweep deletes filling
--       rows), TRUNCATE revoked. What refuses a correction or an erasure of a
--       frozen row is the guards, which judge the row's status, not the role
-- A foreign-key cascade still works: referential actions run as the owner, and
-- the delete guard lets a tenant's own removal through.
--
-- THE OPERATOR COLUMNS. watched_brands and market_description carry no column
-- grant for a tenant: authenticated lost table-level UPDATE on tracking_configs
-- on 20 Aug (20260820120000) and holds column UPDATE on last_actor,
-- report_emails and updated_at only, so no tenant session can write either.
-- They are written by the operator through recordConfigChange (surface
-- 'other'), because the audit trigger's column list (20260915091000:265-268)
-- does not watch them. A tenant still READS them on its own row, through the
-- table-level SELECT every tracking_configs column has: Settings reads the row
-- with select('*') on the tenant's own session (lib/settings/tracking-load.ts),
-- which a column it could not read would break on the day this applies.
--
-- IDEMPOTENT. `if not exists`, `create or replace`, drop-then-create for the
-- policies and triggers; applied twice on a throwaway PG 17.11 cluster (after
-- MF1, R12, MF2 and MF4) with an empty catalogue diff and checked by
-- scripts/pg-shim/mf3-checks.sql. No CONCURRENTLY, no BEGIN/COMMIT: the runner
-- wraps the file in one transaction.

-- =============================================================================
-- 1. month_lens_readings (WP3.3)
-- =============================================================================

-- One month's readings over one lens, per audience (the month_denominators
-- keys: the caller pools, decision E). A lens row compares only with a row of
-- the same rule_version. Written by the run's lens-readings step, before
-- freeze-months, for the filling months and the month that freezes in the same
-- run (marked frozen before freeze-months writes the denominator marker), and
-- once by scripts/lens-backread.ts for the closed months June to September.
create table if not exists public.month_lens_readings (
  client_id    uuid not null references public.clients(id) on delete cascade,
  month        date not null,
  audience     text not null,
  -- 'buyers' | 'makers' | 'all_but_noise' | 'dense20' | 'same_searches:<prev YYYY-MM>' | …
  lens         text not null,
  object_kind  text not null,
  object_id    text not null,
  k            int not null,
  n            int not null,
  comments     int,
  status       text not null check (status in ('filling', 'frozen')),
  origin       text not null check (origin in ('live', 'back_read')),
  read_at      timestamptz not null,
  run_id       uuid references public.pipeline_runs(id) on delete set null,
  rule_version text not null,
  frozen_at    timestamptz,
  primary key (client_id, month, audience, lens, object_kind, object_id),
  -- Guards the plan does not pin, so a writer's slip is refused rather than
  -- frozen: a month is its first day; a lens is a lower-case name with an
  -- optional ':YYYY-MM'; the object kinds are lens_readings' own five; counts
  -- are counts; a row is frozen exactly when it carries frozen_at (the rule
  -- of lib/reading/monthly.ts freezeFor); the version is named.
  constraint month_lens_readings_month_check check (month = date_trunc('month', month)::date),
  constraint month_lens_readings_lens_check check (lens ~ '^[a-z][a-z0-9_]*(:[0-9]{4}-(0[1-9]|1[0-2]))?$'),
  constraint month_lens_readings_object_kind_check
    check (object_kind in ('denominator', 'subject', 'kind', 'mood', 'theme')),
  constraint month_lens_readings_counts_check check (k >= 0 and n >= 0 and (comments is null or comments >= 0)),
  constraint month_lens_readings_frozen_at_check check ((status = 'frozen') = (frozen_at is not null)),
  constraint month_lens_readings_rule_version_check check (rule_version <> '')
);
create index if not exists month_lens_readings_lens_idx
  on public.month_lens_readings (client_id, lens, month);

comment on table public.month_lens_readings is
  'A month''s denominator, subject, kind, mood and theme readings over one lens (buyers, makers, all but noise, well read, the same searches), per audience. A month table: filling until the month freezes, then the record; each lens reads a closed audience-month once (month_lens_frozen_insert_guard).';

-- BEFORE INSERT on month_lens_readings. A copy of
-- month_reading_frozen_insert_guard (20260918092000:575-690), clause for clause,
-- with the lens added where the audience-month was:
--   (a) has this audience-month closed? The same test: the month_denominators
--       row is frozen (freezeMonths writes it last, so it is the commit marker).
--   (b) is this row genuinely new? An upsert's refresh of a row that exists
--       fires BEFORE INSERT first; it goes on to the DO UPDATE path, where
--       month_reading_frozen_guard judges it. It is remembered, with its LENS,
--       so a new key behind it in the same statement cannot slip in.
--   (c) does this LENS already hold a reading of this audience-month from an
--       earlier transaction? If not, this is the lens's one back-read of a
--       month that closed before the lens existed (decision K), and it is let
--       in. If it does, the audience-month is already held for this lens and
--       the row is refused.
-- So a second back-read of the same audience-month and lens is refused, and a
-- first back-read of ANOTHER lens is not: the old guard's test, keyed on the
-- audience-month alone, would refuse every lens after the first. Static SQL on
-- the one table it guards (the original reads its key from the catalogue so
-- that five tables can share it); marks go to a setting of their own,
-- transaction-local and reset on a rollback, a savepoint's included. The
-- audience and the lens are hashed into the mark, not interpolated, for the
-- original's reason: a rival's name is free text, and the mark is matched as a
-- substring.
create or replace function public.month_lens_frozen_insert_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
declare
  v_mark text;
  v_seen text;
begin
  if tg_table_name <> 'month_lens_readings' then
    raise exception 'month_lens_frozen_insert_guard guards month_lens_readings only, not %', tg_table_name
      using errcode = 'restrict_violation';
  end if;

  -- (a) Closed is closed, including to the transaction that closed it.
  if not exists (
    select 1 from public.month_denominators d
    where d.client_id = new.client_id
      and d.month     = new.month
      and d.audience  = new.audience
      and d.status    = 'frozen'
  ) then
    return new;
  end if;

  v_mark := format('|%s/%s/%s|', new.month, md5(new.audience), md5(new.lens));

  -- (b) The row's key is already there: not an addition to the record.
  if exists (
    select 1 from public.month_lens_readings t
    where t.client_id   = new.client_id
      and t.month       = new.month
      and t.audience    = new.audience
      and t.lens        = new.lens
      and t.object_kind = new.object_kind
      and t.object_id   = new.object_id
  ) then
    v_seen := coalesce(current_setting('verbatim.month_lens_refreshed', true), '');
    if position(v_mark in v_seen) = 0 then
      perform set_config('verbatim.month_lens_refreshed', v_seen || v_mark, true);
    end if;
    return new;
  end if;

  -- (c) This lens holds no reading of the audience-month from an earlier
  -- transaction, and none of its rows was refreshed by this one: the first
  -- back-read. Rows this transaction wrote do not count as "already" (a first
  -- population must not refuse itself on its second row); the test is
  -- month_reading_written_here, subtransaction-safe.
  if not exists (
    select 1 from public.month_lens_readings t
    where t.client_id = new.client_id
      and t.month     = new.month
      and t.audience  = new.audience
      and t.lens      = new.lens
      and not public.month_reading_written_here(t.xmin)
  ) and position(v_mark in coalesce(current_setting('verbatim.month_lens_refreshed', true), '')) = 0 then
    return new;
  end if;

  raise exception 'frozen monthly reading takes no new rows: month_lens_readings, month %, audience %, lens % is already held',
    new.month, new.audience, new.lens
    using errcode = 'restrict_violation',
          hint = 'That audience-month closed, and this lens has read it. Each lens back-reads a closed audience-month once (plan WP3.3); a late reading is never added to a frozen one.';
  return null;
end
$guard$;

comment on function public.month_lens_frozen_insert_guard() is
  'BEFORE INSERT on month_lens_readings: month_reading_frozen_insert_guard with the lens in its already-held test and its mark. Refuses a row for a closed audience-month (month_denominators frozen) when that LENS already holds a reading of it from an earlier transaction; lets in the first back-read of each lens, and an upsert''s refresh of a key that exists (judged by month_reading_frozen_guard on the update).';

drop trigger if exists month_lens_readings_frozen_guard on public.month_lens_readings;
create trigger month_lens_readings_frozen_guard
  before update on public.month_lens_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_lens_readings_frozen_insert_guard on public.month_lens_readings;
create trigger month_lens_readings_frozen_insert_guard
  before insert on public.month_lens_readings
  for each row
  execute function public.month_lens_frozen_insert_guard();

drop trigger if exists month_lens_readings_delete_guard on public.month_lens_readings;
create trigger month_lens_readings_delete_guard
  before delete on public.month_lens_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_delete_guard();

-- =============================================================================
-- 2. month_brand_readings (WP3.5)
-- =============================================================================

-- A brand's month as a topic, per audience: the market videos it comes up in
-- (in any way, in the content, in a comment, and those not posted by the brand
-- itself) out of the month's videos (and those not the brand's own). Read from
-- brand_mentions by the run's brand-readings step (before freeze-months, as the
-- lens step) and once by the back-read. The existing three guards attach
-- unchanged: a closed audience-month takes its brand rows once.
create table if not exists public.month_brand_readings (
  client_id    uuid not null references public.clients(id) on delete cascade,
  month        date not null,
  audience     text not null,
  -- 'client' | competitors.id::text | 'watched:<slug>' (brand_mentions' key)
  brand_key    text not null,
  k_any        int not null,
  k_content    int not null,
  k_comment    int not null,
  k_organic    int not null,
  n            int not null,
  n_organic    int not null,
  status       text not null check (status in ('filling', 'frozen')),
  origin       text not null check (origin in ('live', 'back_read')),
  read_at      timestamptz not null,
  run_id       uuid references public.pipeline_runs(id) on delete set null,
  rule_version text not null,
  frozen_at    timestamptz,
  primary key (client_id, month, audience, brand_key),
  -- Guards the plan does not pin: a month is its first day, the key is
  -- brand_mentions' identity, counts are counts, frozen exactly when it
  -- carries frozen_at, the version is named.
  constraint month_brand_readings_month_check check (month = date_trunc('month', month)::date),
  constraint month_brand_readings_brand_key_check check (
    brand_key = 'client'
    or brand_key like 'watched:_%'
    or brand_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint month_brand_readings_counts_check check (
    k_any >= 0 and k_content >= 0 and k_comment >= 0 and k_organic >= 0 and n >= 0 and n_organic >= 0),
  constraint month_brand_readings_frozen_at_check check ((status = 'frozen') = (frozen_at is not null)),
  constraint month_brand_readings_rule_version_check check (rule_version <> '')
);
create index if not exists month_brand_readings_brand_idx
  on public.month_brand_readings (client_id, brand_key, month);

comment on table public.month_brand_readings is
  'A brand''s month as a topic, per audience: the videos it comes up in (any, in the content, in a comment, organic) out of the month''s videos. A month table: filling until the month freezes, then the record.';

drop trigger if exists month_brand_readings_frozen_guard on public.month_brand_readings;
create trigger month_brand_readings_frozen_guard
  before update on public.month_brand_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_brand_readings_frozen_insert_guard on public.month_brand_readings;
create trigger month_brand_readings_frozen_insert_guard
  before insert on public.month_brand_readings
  for each row
  execute function public.month_reading_frozen_insert_guard();

drop trigger if exists month_brand_readings_delete_guard on public.month_brand_readings;
create trigger month_brand_readings_delete_guard
  before delete on public.month_brand_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_delete_guard();

-- =============================================================================
-- 3. video_surfacings (WP3.4)
-- =============================================================================

-- Every search that surfaced a video on each run: the terms and the
-- communities, written by the gather. With it "outside the searches both
-- months ran" is exact: a video is inside when an unchanged search surfaced it
-- in the month. One row per video and run, written once (ON CONFLICT DO
-- NOTHING, which needs INSERT alone): the gather gathers a run's terms and
-- communities for a video before it writes the row. A video surfaced by a
-- tracked account alone carries neither.
create table if not exists public.video_surfacings (
  client_id  uuid not null references public.clients(id) on delete cascade,
  video_id   uuid not null references public.videos(id) on delete cascade,
  run_id     uuid not null references public.pipeline_runs(id) on delete cascade,
  terms      text[] not null default '{}',
  subreddits text[] not null default '{}',
  primary key (client_id, video_id, run_id)
);
create index if not exists video_surfacings_run_idx
  on public.video_surfacings (client_id, run_id);

comment on table public.video_surfacings is
  'Every search (terms and communities) that surfaced a video, per run. Append-only: one row per video and run, never rewritten.';

-- =============================================================================
-- 4. tracking_configs: the two operator columns (WP3.5, WP3.10)
-- =============================================================================

alter table public.tracking_configs add column if not exists watched_brands text[] not null default '{}';
alter table public.tracking_configs add column if not exists market_description text;

comment on column public.tracking_configs.watched_brands is
  'Brands the operator watches beyond the rivals (WP3.5): matched as brand_mentions key ''watched:<slug>''. Operator-only: no tenant column grant; written through recordConfigChange (surface ''other''), since the audit trigger does not watch it.';
comment on column public.tracking_configs.market_description is
  'The market in the client''s words, for the briefs'' {market} (WP3.11). Operator-only: no tenant column grant; written through recordConfigChange (surface ''other''), since the audit trigger does not watch it.';

-- =============================================================================
-- 5. tracking_config_queue (WP3.10, decision I)
-- =============================================================================

-- A tracking edit asked for while the tenant's tracking is locked
-- (lib/tenant-locks.ts): queued by the settings action through the admin
-- client after its own role and lock checks, with an actor, and applied by the
-- run's open-run on its effective month's 1st (the first no earlier than
-- January 2027), which stamps applied_at. The queue is its own history: a
-- queued edit is never rewritten or removed; a change of mind is a newer
-- queued edit to the same field. The field is one of the search set's columns,
-- so a queued edit can never reach a cost knob or an operator column.
create table if not exists public.tracking_config_queue (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  field           text not null,
  after           jsonb not null,
  effective_month date not null,
  queued_by       uuid,
  queued_label    text not null,
  queued_at       timestamptz not null default now(),
  applied_at      timestamptz,
  constraint tracking_config_queue_field_check check (field in (
    'brand_keywords', 'competitor_keywords', 'industry_keywords', 'exclude_terms',
    'competitor_names', 'own_handles', 'competitor_handles', 'platforms', 'subreddits')),
  constraint tracking_config_queue_after_check check (jsonb_typeof(after) in ('array', 'object')),
  constraint tracking_config_queue_month_check check (effective_month = date_trunc('month', effective_month)::date),
  constraint tracking_config_queue_label_check check (queued_label <> '')
);
create index if not exists tracking_config_queue_due_idx
  on public.tracking_config_queue (client_id, effective_month) where applied_at is null;

comment on table public.tracking_config_queue is
  'Tracking edits asked for while the tenant''s tracking is locked, each with its effective month and who asked; applied on that month''s 1st by the run, which stamps applied_at once. Its own history: never rewritten or removed.';

-- BEFORE UPDATE: the one change a queued edit takes is its applied_at stamp,
-- from empty, once. service_role holds UPDATE on applied_at alone; this also
-- holds for a role that holds more.
create or replace function public.tracking_config_queue_applied_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $once$
begin
  if old.applied_at is not null then
    raise exception 'a queued tracking edit is applied once: % was applied at %', old.id, old.applied_at
      using errcode = 'restrict_violation',
            hint = 'Queue a newer edit to the same field instead. The queue is its own history.';
  end if;
  if (to_jsonb(new) - 'applied_at') is distinct from (to_jsonb(old) - 'applied_at') then
    raise exception 'a queued tracking edit is never rewritten: %', old.id
      using errcode = 'restrict_violation',
            hint = 'Only applied_at is stamped, once, by the run''s open-run.';
  end if;
  return new;
end
$once$;

comment on function public.tracking_config_queue_applied_once() is
  'BEFORE UPDATE on tracking_config_queue: lets applied_at be stamped once, from empty, and refuses every other change.';

drop trigger if exists tracking_config_queue_applied_once on public.tracking_config_queue;
create trigger tracking_config_queue_applied_once
  before update on public.tracking_config_queue
  for each row
  execute function public.tracking_config_queue_applied_once();

-- =============================================================================
-- 6. own_post_subjects (WP3.6; the recorded deviation above)
-- =============================================================================

-- Which subject each of the client's own posts touches, and each of its claims
-- (claim_id null: the post as a whole), as the post-and-claim-to-subject judge
-- (scripts/own-post-subjects.ts) or an operator's override filed it, with the
-- words that matched. Append-only; the newest decided_at wins, an override
-- over a judge row (the video_segments precedence). One judge row per post,
-- claim, subject and judge version. An id is the key because claim_id is
-- nullable (brand_mentions' shape). A claim is re-extracted when its post is
-- read again in the same run (pass-a deletes and rewrites it), and its rows go
-- with it.
create table if not exists public.own_post_subjects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  video_id      uuid not null references public.videos(id) on delete cascade,
  claim_id      uuid references public.video_claims(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  touches       boolean not null,
  matched_words text[] not null default '{}',
  method        text not null check (method in ('judge', 'override')),
  judge_version text,
  reason        text,
  decided_at    timestamptz not null default now(),
  actor_label   text not null,
  -- Guards the plan does not pin: a judge row names its version (the unique
  -- index below keys on it, and a null would never collide), and a row names
  -- who filed it.
  constraint own_post_subjects_judge_version_check check (method <> 'judge' or coalesce(judge_version, '') <> ''),
  constraint own_post_subjects_actor_label_check check (actor_label <> '')
);
create unique index if not exists own_post_subjects_one_judge on public.own_post_subjects
  (client_id, video_id, coalesce(claim_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_id, judge_version)
  where method = 'judge';

comment on table public.own_post_subjects is
  'Which subject each of the client''s own posts, and each of its claims, touches, with the matched words, as the judge or an override filed it. Append-only; the newest decided_at wins, an override over a judge row.';

-- =============================================================================
-- 7. RLS, policies and grants (MF1's conventions)
-- =============================================================================

alter table public.month_lens_readings   enable row level security;
alter table public.month_brand_readings  enable row level security;
alter table public.video_surfacings      enable row level security;
alter table public.tracking_config_queue enable row level security;
alter table public.own_post_subjects     enable row level security;

drop policy if exists "Members read their month lens readings" on public.month_lens_readings;
create policy "Members read their month lens readings" on public.month_lens_readings
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their month brand readings" on public.month_brand_readings;
create policy "Members read their month brand readings" on public.month_brand_readings
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their video surfacings" on public.video_surfacings;
create policy "Members read their video surfacings" on public.video_surfacings
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their queued tracking edits" on public.tracking_config_queue;
create policy "Members read their queued tracking edits" on public.tracking_config_queue
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their own post subjects" on public.own_post_subjects;
create policy "Members read their own post subjects" on public.own_post_subjects
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.month_lens_readings, public.month_brand_readings, public.video_surfacings,
  public.tracking_config_queue, public.own_post_subjects from anon, authenticated;

-- Column-level SELECT. Every column of the month tables, the surfacings and the
-- queue is a reading or the tenant's own request (who asked is theirs, as
-- config_changes' actor_label is). Left out of own_post_subjects: the
-- operator's words (reason, actor_label), MF1's rule for video_segments.
grant select (client_id, month, audience, lens, object_kind, object_id, k, n, comments, status, origin, read_at,
              run_id, rule_version, frozen_at)
  on public.month_lens_readings to authenticated;
grant select (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status,
              origin, read_at, run_id, rule_version, frozen_at)
  on public.month_brand_readings to authenticated;
grant select (client_id, video_id, run_id, terms, subreddits)
  on public.video_surfacings to authenticated;
grant select (id, client_id, field, after, effective_month, queued_by, queued_label, queued_at, applied_at)
  on public.tracking_config_queue to authenticated;
grant select (id, client_id, video_id, claim_id, subject_id, touches, matched_words, method, judge_version, decided_at)
  on public.own_post_subjects to authenticated;

-- The month tables keep the month tables' four (month_evidence_refs' reasons,
-- 20260918095000:280-296): the upsert needs UPDATE even when nothing conflicts,
-- the stale sweep needs DELETE on filling rows, and the guards refuse a frozen
-- row whatever the role.
grant select, insert, update, delete on public.month_lens_readings, public.month_brand_readings to service_role;
revoke truncate on public.month_lens_readings, public.month_brand_readings from service_role;

-- Append-only.
grant select, insert on public.video_surfacings, public.tracking_config_queue, public.own_post_subjects to service_role;
revoke update, delete, truncate on public.video_surfacings, public.tracking_config_queue, public.own_post_subjects
  from service_role;
-- The queue's one stamp. After the revoke above, which also takes any column
-- grant away, so a second application ends where the first did.
grant update (applied_at) on public.tracking_config_queue to service_role;

-- The two trigger functions fire whatever the writer's role; nobody calls them.
revoke all on function public.month_lens_frozen_insert_guard() from public, anon, authenticated;
revoke all on function public.tracking_config_queue_applied_once() from public, anon, authenticated;
