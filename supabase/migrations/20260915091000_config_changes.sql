-- The configuration change log (Phase 0, design item 16, 2026-09-15).
--
-- Nothing in this database has ever recorded that a configuration changed.
-- There is no audit table, no history table, no row versioning and — until this
-- migration — not one trigger anywhere in the public schema. `tracking_configs`
-- is a single mutable row per tenant with one `updated_at` that four of its ten
-- writers never set, so both tenants' timestamps today name one human moment
-- and hide every earlier one. The two changes that most need explaining are
-- invisible: Sealand's rival set was rewritten on 2026-09-09 (three rivals out,
-- one in) and the corpus re-tag that followed moved 253 stored videos out of
-- their buckets, taking 84 themes with them.
--
-- TWO MECHANISMS, NOT ONE. They answer different questions and neither is
-- sufficient:
--
--   * The TRIGGER below is the only path that catches a write nobody wrote code
--     for. The tenth write path to `tracking_configs` is not in this repo at
--     all — a hand-typed UPDATE, executed as `postgres` in the SQL editor at
--     2026-09-13 10:00:58.571, 104 ms from Sealand's stored `updated_at`. No
--     inventory built by reading the codebase can find that path, and no
--     instrumentation at an application write site can cover it. A trigger
--     fires whoever connects.
--
--   * The trigger can never name a HUMAN for the writes that matter. Measured
--     in production: a tenant's session client presents as `authenticated` with
--     auth.uid() = that person; the service role presents as `service_role`
--     with auth.uid() NULL; the SQL editor carries no JWT claims at all and
--     logs in as `postgres`. The workspace switcher (lib/auth.ts) hands a platform
--     admin's writes to the SERVICE-ROLE client, so exactly the operator edits
--     worth logging arrive as an anonymous robot — indistinguishable from the
--     pipeline's own subreddit write. So `tracking_configs.last_actor` carries
--     the actor from the write site, in the same UPDATE, and the trigger reads
--     it (lib/config-log.ts `actorStamp` / `withActor`).
--
-- Surfaces the trigger cannot see at all — a schedule save, a corpus re-tag, a
-- re-gate, the birth of a tenant's config — are written directly by
-- `recordConfigChange` with source = 'logged'.

-- 1. The log ------------------------------------------------------------------
create table if not exists public.config_changes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  changed_at    timestamptz not null default now(),
  -- WHICH configuration moved. Grouped by what a reader would go looking for,
  -- not by column: 'terms' covers all four keyword arrays, 'knobs' the three
  -- volume levers. 'entity_retag' and 'regate' are corpus operations rather
  -- than configuration — they are here because they are the two changes that
  -- destroy evidence, and a log that omits them explains nothing.
  surface       text not null check (surface in (
                  'terms','rivals','handles','platforms','subreddits','cadence',
                  'knobs','schedule','subjects','entity_retag','regate','other')),
  -- The column, where a column is what changed. NULL for the surfaces that are
  -- not a single column (a schedule, a re-tag).
  field         text,
  before        jsonb,
  after         jsonb,
  -- user      a tenant member, through the product
  -- operator  a platform admin, usually inside the workspace switcher
  -- script    an operator CLI under the service-role key
  -- pipeline  the pipeline writing its own configuration (subreddit discovery)
  -- sql       hand-run SQL: caught by the trigger, never nameable
  -- reconstructed  inferred after the fact by scripts/reconstruct-config-log.ts
  actor_kind    text not null check (actor_kind in
                  ('user','operator','script','pipeline','sql','reconstructed')),
  actor_user_id uuid references public.users(id) on delete set null,
  -- e.g. 'scripts/run-tagging.ts --write --method substring', 'postgres',
  -- an email address. Free text: the actor is not always a row anywhere.
  actor_label   text,
  -- The update this change belongs to, where one does (the pipeline's own
  -- writes). Never a period key — see AGENTS.md.
  run_id        uuid references public.pipeline_runs(id) on delete set null,
  -- logged        an application write site said so
  -- trigger       the database saw the row move
  -- reconstructed inferred from gather records long afterwards; a label, not a record
  source        text not null default 'logged'
                  check (source in ('logged','trigger','reconstructed')),
  -- How many rows a corpus operation moved. NULL for a configuration edit,
  -- which moves exactly one.
  rows_affected int,
  note          text
);

comment on table public.config_changes is
  'One row per configuration change: what moved, when, from what to what, and who moved it. Written three ways — the tracking_configs AFTER UPDATE trigger (source ''trigger'', the only path that catches hand-run SQL), lib/config-log.ts recordConfigChange at write sites the trigger cannot see (source ''logged''), and scripts/reconstruct-config-log.ts for the history that predates the log (source ''reconstructed'', where every row''s note names its evidence).';
comment on column public.config_changes.actor_kind is
  'Who moved it. A trigger row can only ever say ROLE, not person, unless the write site stamped tracking_configs.last_actor in the same UPDATE.';
comment on column public.config_changes.source is
  'reconstructed rows are inference, at gather granularity, with blind windows of 35 days (Össur, 5 Jul–9 Aug) and 39 days (Sealand, 9 Jul–17 Aug). Never read one as a record of what happened.';

-- The log's one read pattern: this tenant's changes, newest first.
create index if not exists config_changes_client_time_idx
  on public.config_changes (client_id, changed_at desc);

-- 2. RLS — members read their own tenant's log, and write nothing -------------
-- Inserts belong to the service role and to the trigger function (SECURITY
-- DEFINER, so it writes as the table's owner). A log a tenant could append to
-- is not a log.
alter table public.config_changes enable row level security;

drop policy if exists "Members read their change log" on public.config_changes;
create policy "Members read their change log" on public.config_changes
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.config_changes from authenticated, anon;
grant select on public.config_changes to authenticated;

-- 3. The actor, carried by the write site -------------------------------------
-- {kind, user_id, label, at, run_id?} — set in the same UPDATE that changes the
-- configuration, so the trigger can name a person the database cannot see.
-- `at` is part of the stamp on purpose: two identical saves by the same person
-- would otherwise write an identical jsonb, and the trigger's "is this stamp
-- fresh" test (NEW.last_actor is distinct from OLD.last_actor) would read the
-- second one as unstamped.
alter table public.tracking_configs add column if not exists last_actor jsonb;

comment on column public.tracking_configs.last_actor is
  'Who made the most recent write to this row: {kind, user_id, label, at, run_id?}, set by the write site (lib/config-log.ts withActor). Read by the tracking_configs_audit trigger and then of no further interest — the log is the record, this column is only the channel. A session-client write cannot forge it: the trigger pins kind and user_id from the JWT whenever the caller''s JWT role is ''authenticated''.';

-- The tenant's own settings form writes two of the four term columns through
-- the session client (T0-2 revoked the rest), so without this grant every
-- settings save 403s the moment the code starts stamping.
grant update (last_actor) on public.tracking_configs to authenticated;

-- 4. The trigger ---------------------------------------------------------------
-- SECURITY DEFINER so it can insert into a table nobody else may write, and
-- `set search_path` so a caller cannot redirect it.
--
-- It does NOT swallow errors. An audit insert that fails aborts the
-- configuration write with it — configuration changes are logged, or they do
-- not happen. Every way the insert could fail on data is closed by
-- construction instead: the actor kind is normalised to the CHECK vocabulary, a
-- user id that is not in `users` and a run id that is not in `pipeline_runs`
-- are dropped to NULL rather than violating their foreign keys.
--
-- `report_emails` is deliberately not watched: no code path has written it
-- since recipients moved to report_schedules (T0-10), and a column with no
-- writer produces no changes to log.
create or replace function public.tracking_configs_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old    jsonb := to_jsonb(OLD);
  v_new    jsonb := to_jsonb(NEW);
  v_actor  jsonb := null;
  v_col    text;
  v_kind   text;
  v_user   uuid := null;
  v_label  text := null;
  v_run    uuid := null;
  v_uid    uuid := null;
  v_caller text;
begin
  -- A stamp only counts when it is fresh. A row re-saved with the same actor
  -- jsonb it already had is a write that did not say who made it.
  if NEW.last_actor is distinct from OLD.last_actor
     and jsonb_typeof(NEW.last_actor) = 'object' then
    v_actor := NEW.last_actor;
  end if;

  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;

  -- WHO CONNECTED. Not `current_user` — inside a SECURITY DEFINER function it
  -- names the function's OWNER, so every caller would read as `postgres` and
  -- the forgery guard below would never fire (found by exercising this trigger
  -- on a throwaway cluster before it was ever applied). The JWT's role claim is set
  -- per request by PostgREST and is untouched by SECURITY DEFINER; a connection
  -- with no claims at all — the SQL editor, the management API — falls back to
  -- the login role, which is `postgres` for exactly those.
  begin
    v_caller := nullif(auth.role(), '');
  exception when others then
    v_caller := null;
  end;
  v_caller := coalesce(v_caller, session_user);

  if v_actor is not null then
    v_kind  := coalesce(v_actor ->> 'kind', '');
    v_label := nullif(v_actor ->> 'label', '');
    begin v_user := nullif(v_actor ->> 'user_id', '')::uuid; exception when others then v_user := null; end;
    begin v_run  := nullif(v_actor ->> 'run_id', '')::uuid;  exception when others then v_run  := null; end;
  else
    -- No stamp: the role is all the database knows. `service_role` covers the
    -- pipeline, every operator script AND a platform admin in the switcher —
    -- they are mutually indistinguishable here, which is the whole reason
    -- last_actor exists. 'pipeline' is the honest default for it because the
    -- pipeline is the only UNSTAMPED service-role writer left in the repo.
    v_kind  := case v_caller
                 when 'service_role'  then 'pipeline'
                 when 'authenticated' then 'user'
                 else 'sql'
               end;
    v_user  := v_uid;
    v_label := v_caller;
  end if;

  -- A browser-reachable write may not claim to be anything but the person
  -- holding the JWT. The column grant makes last_actor writable by the tenant's
  -- own session, so identity here comes from auth.uid(), never from the payload.
  if v_caller = 'authenticated' then
    v_user := v_uid;
    v_run  := null;
    if v_kind not in ('user', 'operator') then v_kind := 'user'; end if;
  end if;

  if v_kind not in ('user','operator','script','pipeline','sql','reconstructed') then
    v_kind := 'script';
  end if;
  if v_user is not null and not exists (select 1 from public.users u where u.id = v_user) then
    v_user := null;
  end if;
  if v_run is not null and not exists (select 1 from public.pipeline_runs r where r.id = v_run) then
    v_run := null;
  end if;

  -- One row per column that actually moved. A write that only re-stamps
  -- last_actor (or only bumps updated_at) therefore logs nothing at all —
  -- neither column is in this list.
  foreach v_col in array array[
    'brand_keywords','competitor_keywords','industry_keywords','exclude_terms',
    'competitor_names','own_handles','competitor_handles','platforms','subreddits',
    'report_period','report_day','max_videos','max_comments','comment_depth'
  ] loop
    if (v_old -> v_col) is distinct from (v_new -> v_col) then
      insert into public.config_changes
        (client_id, surface, field, before, after,
         actor_kind, actor_user_id, actor_label, run_id, source)
      values (
        NEW.client_id,
        case v_col
          when 'brand_keywords'      then 'terms'
          when 'competitor_keywords' then 'terms'
          when 'industry_keywords'   then 'terms'
          when 'exclude_terms'       then 'terms'
          when 'competitor_names'    then 'rivals'
          when 'own_handles'         then 'handles'
          when 'competitor_handles'  then 'handles'
          when 'platforms'           then 'platforms'
          when 'subreddits'          then 'subreddits'
          when 'report_period'       then 'cadence'
          when 'report_day'          then 'cadence'
          else 'knobs'
        end,
        v_col,
        v_old -> v_col,
        v_new -> v_col,
        v_kind, v_user, v_label, v_run, 'trigger'
      );
    end if;
  end loop;

  return null;  -- AFTER trigger: the return value is ignored
end
$$;

comment on function public.tracking_configs_audit() is
  'Writes config_changes rows for every watched tracking_configs column that moved. The ONLY path that catches a write no code made — hand-run SQL in the Studio arrives as `postgres` and is logged with actor_kind ''sql''.';

drop trigger if exists tracking_configs_audit on public.tracking_configs;
create trigger tracking_configs_audit
  after update on public.tracking_configs
  for each row execute function public.tracking_configs_audit();

-- Exercised before it was ever applied, on a throwaway PostgreSQL 17 cluster
-- with a stub of this schema: hand-run SQL logs `sql`/postgres; the service
-- role unstamped logs `pipeline`; the switcher (service role + an operator
-- stamp) logs `operator` with the real person's id; a browser session cannot
-- forge a kind, a user or a run; a malformed stamp is normalised rather than
-- aborting the config write; an updated_at-only write logs nothing; a member
-- reads only their own tenant's log and can insert none of it; and the file
-- applies twice without error. That is also how the current_user bug above was
-- found.
--
-- Post-apply checks (run by hand, read-only):
--   select count(*) from public.config_changes;                                  -- 0
--   select tgname from pg_trigger where tgrelid = 'public.tracking_configs'::regclass and not tgisinternal;
--   select column_name from information_schema.column_privileges
--     where table_name = 'tracking_configs' and grantee = 'authenticated' and privilege_type = 'UPDATE';
--     -- competitor_names, exclude_terms, last_actor, report_day, report_emails, report_period, updated_at
--   select policyname, cmd from pg_policies where tablename = 'config_changes';
