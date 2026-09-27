-- MF3 on the throwaway cluster (20261103090000_market_first_s3.sql): the five
-- tables' RLS, policies, grants, CHECKs and append-only rules, the operator
-- columns, the two new trigger functions, and the guards on the two month
-- tables, run after the file has been applied twice (after MF1, R12, MF2 and
-- MF4):
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/mf3-checks.sql
--
-- Every check raises on failure. Part A lives inside one transaction that is
-- rolled back. Part B cannot: the insert guards tell an earlier transaction's
-- rows from this one's (month_reading_written_here), so "a second back-read" is
-- only a second back-read in a transaction of its own. Part B therefore
-- commits its synthetic tenant, reads it back in later transactions, and
-- removes it at the end through the tenant cascade (and first, in case an
-- earlier run stopped half way). The synthetic tenants are made up (ids, words
-- and counts): their numbers are the test's own arithmetic, not a claim about
-- any tenant.
\set ON_ERROR_STOP 1

-- =============================================================================
-- Part A · conventions, operator columns, append-only rules, CHECKs, RLS
-- =============================================================================
begin;

-- A1. The five tables: RLS on, one select policy, tenant column SELECT only -----
do $$
declare t text; p text; hidden int;
begin
  foreach t in array array['month_lens_readings', 'month_brand_readings', 'video_surfacings',
                           'tracking_config_queue', 'own_post_subjects'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'tables FAILED: RLS is off on %', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t) <> 1
       or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT'
                        and roles = '{authenticated}' and qual = '(client_id = get_my_client_id())') then
      raise exception 'tables FAILED: % does not carry exactly one get_my_client_id() select policy for authenticated', t;
    end if;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('authenticated', 'public.' || t, p) or has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'tables FAILED: a tenant role holds table-level % on %', p, t;
      end if;
    end loop;
    foreach p in array array['INSERT', 'UPDATE'] loop
      if has_any_column_privilege('authenticated', 'public.' || t, p) or has_any_column_privilege('anon', 'public.' || t, p) then
        raise exception 'tables FAILED: a tenant role holds column % on %', p, t;
      end if;
    end loop;
    if has_any_column_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception 'tables FAILED: anon can read %', t;
    end if;
    select count(*) into hidden from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t
       and not has_column_privilege('authenticated', 'public.' || t, c.column_name, 'SELECT');
    if t = 'own_post_subjects' then
      if hidden <> 2 or has_column_privilege('authenticated', 'public.own_post_subjects', 'reason', 'SELECT')
         or has_column_privilege('authenticated', 'public.own_post_subjects', 'actor_label', 'SELECT') then
        raise exception 'tables FAILED: own_post_subjects should hide reason and actor_label from its tenant and nothing else (% hidden)', hidden;
      end if;
    elsif hidden <> 0 then
      raise exception 'tables FAILED: % column(s) of % are not readable by its tenant', hidden, t;
    end if;
    if not (has_table_privilege('service_role', 'public.' || t, 'SELECT') and has_table_privilege('service_role', 'public.' || t, 'INSERT')) then
      raise exception 'tables FAILED: service_role cannot select and insert on %', t;
    end if;
    if has_table_privilege('service_role', 'public.' || t, 'TRUNCATE') then
      raise exception 'tables FAILED: service_role holds TRUNCATE on %', t;
    end if;
  end loop;
  raise notice 'ok  tables: RLS on, one get_my_client_id() select policy each, tenant column SELECT only (own_post_subjects without reason and actor_label), service role select and insert, no truncate';
end $$;

-- A2. What service_role keeps beyond select and insert --------------------------
do $$
declare t text;
begin
  -- The month tables keep the month tables' grants: the upsert and the stale sweep.
  foreach t in array array['month_lens_readings', 'month_brand_readings'] loop
    if not (has_table_privilege('service_role', 'public.' || t, 'UPDATE') and has_table_privilege('service_role', 'public.' || t, 'DELETE')) then
      raise exception 'grants FAILED: service_role cannot update and delete on the month table %', t;
    end if;
  end loop;
  -- Append-only.
  foreach t in array array['video_surfacings', 'own_post_subjects', 'tracking_config_queue'] loop
    if has_table_privilege('service_role', 'public.' || t, 'UPDATE') or has_table_privilege('service_role', 'public.' || t, 'DELETE') then
      raise exception 'grants FAILED: service_role holds table-level UPDATE or DELETE on the append-only %', t;
    end if;
  end loop;
  if has_any_column_privilege('service_role', 'public.video_surfacings', 'UPDATE')
     or has_any_column_privilege('service_role', 'public.own_post_subjects', 'UPDATE') then
    raise exception 'grants FAILED: service_role holds a column UPDATE on video_surfacings or own_post_subjects';
  end if;
  -- The queue's one stamp.
  if not has_column_privilege('service_role', 'public.tracking_config_queue', 'applied_at', 'UPDATE') then
    raise exception 'grants FAILED: service_role cannot stamp tracking_config_queue.applied_at';
  end if;
  if (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'tracking_config_queue'
        and c.column_name <> 'applied_at'
        and has_column_privilege('service_role', 'public.tracking_config_queue', c.column_name, 'UPDATE')) <> 0 then
    raise exception 'grants FAILED: service_role can update a queued edit beyond applied_at';
  end if;
  raise notice 'ok  service role: update and delete on the two month tables; append-only surfacings, own-post subjects and queue (applied_at alone may be stamped)';
end $$;

-- A3. Functions: the two new ones, and the existing guards untouched ------------
do $$
declare f text;
begin
  foreach f in array array['public.month_lens_frozen_insert_guard()', 'public.tracking_config_queue_applied_once()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('public', f, 'EXECUTE') then
      raise exception 'functions FAILED: a tenant role (or public) can execute %', f;
    end if;
    if not (select not p.prosecdef and p.proconfig = '{"search_path=public, pg_temp"}' and l.lanname = 'plpgsql'
                   and p.prorettype = 'trigger'::regtype
              from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f::regprocedure) then
      raise exception 'functions FAILED: % is not a plpgsql trigger function, invoker, with search_path public, pg_temp', f;
    end if;
  end loop;
  -- The existing guards and the audit trigger, as MF1 to MF4 left them (md5 of
  -- pg_get_functiondef on PG 17.11 before MF3): attached, never replaced.
  if (select string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('month_reading_frozen_guard', 'month_reading_frozen_insert_guard', 'month_reading_delete_guard',
                           'month_reading_written_here', 'tracking_configs_audit'))
     <> 'month_reading_delete_guard=bbf4a228dd82343fc23cb6d751528639,month_reading_frozen_guard=c0fa1d644d1fd6de6881f9f811fe452e,'
        'month_reading_frozen_insert_guard=28c75c3d20eefd5ae176d91afc0ac258,month_reading_written_here=551cac0538949b2f6d5fae933f1d9745,'
        'tracking_configs_audit=c1b0314ed20c2411e87f2c4091ad3299' then
    raise exception 'functions FAILED: an existing guard or the audit trigger function changed';
  end if;
  -- The six month tables keep their eighteen guards, and nothing else.
  if (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
         and c.relname in ('month_denominators', 'month_theme_readings', 'month_subject_readings', 'month_kind_readings',
                           'month_audience_stats', 'month_evidence_refs')) <> 18 then
    raise exception 'functions FAILED: the six month tables do not carry exactly their eighteen guards';
  end if;
  raise notice 'ok  functions: two plpgsql trigger functions nobody can call; the existing guards, the audit trigger and the six month tables'' eighteen guards unchanged';
end $$;

-- A4. The triggers on the new tables -------------------------------------------------
do $$
declare got text;
begin
  select string_agg(format('%s:%s', t.tgname, regexp_replace(pg_get_triggerdef(t.oid), '^CREATE TRIGGER \S+ ', '')), E'\n' order by t.tgname)
    into got
    from pg_trigger t where not t.tgisinternal
     and t.tgrelid in ('public.month_lens_readings'::regclass, 'public.month_brand_readings'::regclass,
                       'public.tracking_config_queue'::regclass, 'public.video_surfacings'::regclass,
                       'public.own_post_subjects'::regclass);
  if got is distinct from
     'month_brand_readings_delete_guard:BEFORE DELETE ON public.month_brand_readings FOR EACH ROW WHEN ((old.status = ''frozen''::text)) EXECUTE FUNCTION month_reading_delete_guard()' || E'\n' ||
     'month_brand_readings_frozen_guard:BEFORE UPDATE ON public.month_brand_readings FOR EACH ROW WHEN ((old.status = ''frozen''::text)) EXECUTE FUNCTION month_reading_frozen_guard()' || E'\n' ||
     'month_brand_readings_frozen_insert_guard:BEFORE INSERT ON public.month_brand_readings FOR EACH ROW EXECUTE FUNCTION month_reading_frozen_insert_guard()' || E'\n' ||
     'month_lens_readings_delete_guard:BEFORE DELETE ON public.month_lens_readings FOR EACH ROW WHEN ((old.status = ''frozen''::text)) EXECUTE FUNCTION month_reading_delete_guard()' || E'\n' ||
     'month_lens_readings_frozen_guard:BEFORE UPDATE ON public.month_lens_readings FOR EACH ROW WHEN ((old.status = ''frozen''::text)) EXECUTE FUNCTION month_reading_frozen_guard()' || E'\n' ||
     'month_lens_readings_frozen_insert_guard:BEFORE INSERT ON public.month_lens_readings FOR EACH ROW EXECUTE FUNCTION month_lens_frozen_insert_guard()' || E'\n' ||
     'tracking_config_queue_applied_once:BEFORE UPDATE ON public.tracking_config_queue FOR EACH ROW EXECUTE FUNCTION tracking_config_queue_applied_once()' then
    raise exception E'triggers FAILED, got:\n%', got;
  end if;
  -- The month tables' own three, exactly as the six month tables carry them.
  if (select count(distinct regexp_replace(pg_get_triggerdef(t.oid), '^CREATE TRIGGER \S+ (\S+ \S+) ON \S+ ', '\1 '))
        from pg_trigger t
       where not t.tgisinternal
         and t.tgrelid in ('public.month_brand_readings'::regclass, 'public.month_subject_readings'::regclass,
                           'public.month_kind_readings'::regclass)) <> 3 then
    raise exception 'triggers FAILED: month_brand_readings does not carry the six month tables'' three guards unchanged';
  end if;
  raise notice 'ok  triggers: the lens table carries the update and delete guards and its own lens-keyed insert guard; the brand table the existing three, as the month tables do; the queue its applied-once guard';
end $$;

-- A5. The synthetic tenants ------------------------------------------------------------
--   v1 the client's own post, with claims k1 and k2      v2 a category video
--   s1, s2 the tenant's subjects                         c2: the other tenant (v9, s9, its own rows)
insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-0000000003c1', 'MF3 check'),
  ('00000000-0000-4000-8000-0000000003c2', 'MF3 other tenant');
insert into public.tracking_configs (client_id, brand_keywords) values
  ('00000000-0000-4000-8000-0000000003c1', '{travel backpack}'),
  ('00000000-0000-4000-8000-0000000003c2', '{prosthetic}');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000003e1', 'owner@mf3.example');
insert into public.users (id, client_id, full_name, email, role)
  values ('00000000-0000-4000-8000-0000000003e1', '00000000-0000-4000-8000-0000000003c1', 'Owner', 'owner@mf3.example', 'owner');
insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
  ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000003c1', 'completed', '2026-11-08 04:00Z', '2026-11-08 06:00Z'),
  ('00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-0000000003c1', 'completed', '2026-11-15 04:00Z', '2026-11-15 06:00Z'),
  ('00000000-0000-4000-8000-0000000003a9', '00000000-0000-4000-8000-0000000003c2', 'completed', '2026-11-08 04:00Z', '2026-11-08 06:00Z');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor) values
  ('00000000-0000-4000-8000-0000000003b1', '00000000-0000-4000-8000-0000000003c1', 'instagram', 'v1', 'u', 'client', true, false),
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003c1', 'youtube', 'v2', 'u', 'a', false, false),
  ('00000000-0000-4000-8000-0000000003b9', '00000000-0000-4000-8000-0000000003c2', 'youtube', 'v9', 'u', 'a', true, false);
insert into public.video_claims (id, client_id, run_id, platform, source_video_id, entity, claim, quote) values
  ('00000000-0000-4000-8000-0000000003d1', '00000000-0000-4000-8000-0000000003c1', '00000000-0000-4000-8000-0000000003a1',
   'instagram', '00000000-0000-4000-8000-0000000003b1', 'client', 'fits under an airline seat', 'q'),
  ('00000000-0000-4000-8000-0000000003d2', '00000000-0000-4000-8000-0000000003c1', '00000000-0000-4000-8000-0000000003a1',
   'instagram', '00000000-0000-4000-8000-0000000003b1', 'client', 'rain proof zips', 'q');
insert into public.subjects (id, client_id, name, origin, status) values
  ('00000000-0000-4000-8000-0000000003f1', '00000000-0000-4000-8000-0000000003c1', 'Airline bag sizes', 'client', 'active'),
  ('00000000-0000-4000-8000-0000000003f2', '00000000-0000-4000-8000-0000000003c1', 'Waterproofing', 'client', 'active'),
  ('00000000-0000-4000-8000-0000000003f9', '00000000-0000-4000-8000-0000000003c2', 'Fit', 'client', 'active');

-- A6. The operator columns: no tenant column grant, no tenant write ---------------------
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000003c1';
begin
  if exists (select 1 from pg_attribute where attrelid = 'public.tracking_configs'::regclass
               and attname in ('watched_brands', 'market_description') and attacl is not null) then
    raise exception 'operator columns FAILED: watched_brands or market_description carries a column grant';
  end if;
  if (select count(*) from pg_attribute where attrelid = 'public.tracking_configs'::regclass
        and attname in ('watched_brands', 'market_description') and not attisdropped) <> 2 then
    raise exception 'operator columns FAILED: the two columns are not both there';
  end if;
  if has_column_privilege('authenticated', 'public.tracking_configs', 'watched_brands', 'UPDATE')
     or has_column_privilege('authenticated', 'public.tracking_configs', 'market_description', 'UPDATE')
     or has_column_privilege('anon', 'public.tracking_configs', 'watched_brands', 'UPDATE')
     or has_column_privilege('anon', 'public.tracking_configs', 'market_description', 'UPDATE') then
    raise exception 'operator columns FAILED: a tenant role can update an operator column';
  end if;
  -- The tenant's column UPDATE on tracking_configs is R12's three, as before MF3.
  if (select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
       where table_schema = 'public' and table_name = 'tracking_configs' and grantee = 'authenticated' and privilege_type = 'UPDATE')
     is distinct from 'last_actor, report_emails, updated_at' then
    raise exception 'operator columns FAILED: the tenant''s column UPDATE on tracking_configs changed';
  end if;
  if (select watched_brands from public.tracking_configs where client_id = c) <> '{}'::text[]
     or (select market_description from public.tracking_configs where client_id = c) is not null then
    raise exception 'operator columns FAILED: an existing row does not read an empty watch list and no description';
  end if;
  raise notice 'ok  operator columns: no column grant, no tenant or anon UPDATE, R12''s three tenant columns unchanged, existing rows read empty';
end $$;

-- The operator writes them through the service role; the audit trigger does not
-- watch them, which is why the write goes through recordConfigChange.
set local role service_role;
update public.tracking_configs set watched_brands = '{Peak Design,Osprey}', market_description = 'travel backpacks'
 where client_id = '00000000-0000-4000-8000-0000000003c1';
reset role;
do $$
begin
  -- (The subjects above were logged by M14's insert audit; nothing else may be.)
  if exists (select 1 from public.config_changes where client_id = '00000000-0000-4000-8000-0000000003c1' and field <> 'subjects') then
    raise exception 'operator columns FAILED: the audit trigger logged an operator column (the plan says it does not watch them)';
  end if;
  raise notice 'ok  the service role writes both columns, and the audit trigger logs neither (recordConfigChange carries them)';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000003e1", "role": "authenticated"}';
do $$
declare wb text[];
begin
  begin
    update public.tracking_configs set watched_brands = '{Anything}' where client_id = '00000000-0000-4000-8000-0000000003c1';
    raise exception 'operator columns FAILED: the tenant''s owner wrote watched_brands';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tracking_configs set market_description = 'anything' where client_id = '00000000-0000-4000-8000-0000000003c1';
    raise exception 'operator columns FAILED: the tenant''s owner wrote market_description';
  exception when insufficient_privilege then null;
  end;
  -- Read on its own row, through the table-level SELECT that Settings' select('*') needs.
  select watched_brands into wb from public.tracking_configs;
  if wb is distinct from '{Peak Design,Osprey}'::text[] then
    raise exception 'operator columns FAILED: the tenant''s session does not read its own watch list (Settings reads the row with select(''*''))';
  end if;
  raise notice 'ok  a tenant owner writes neither operator column, and reads its own row whole';
end $$;
reset role;

-- A7. video_surfacings: append-only ---------------------------------------------------
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000003c1'; n int;
begin
  insert into public.video_surfacings (client_id, video_id, run_id, terms, subreddits) values
    (c, '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1', '{travel backpack,carry on}', '{onebag}'),
    (c, '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a2', '{carry on}', '{}'),
    (c, '00000000-0000-4000-8000-0000000003b1', '00000000-0000-4000-8000-0000000003a1', '{}', '{}');   -- a tracked account alone
  insert into public.video_surfacings (client_id, video_id, run_id, terms)
    values (c, '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1', '{other}')
    on conflict do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'surfacings FAILED: a second row for a video and run landed'; end if;
  begin
    insert into public.video_surfacings (client_id, video_id, run_id)
      values (c, '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1');
    raise exception 'surfacings FAILED: the key was written twice';
  exception when unique_violation then null;
  end;
  begin
    update public.video_surfacings set terms = '{}';
    raise exception 'surfacings FAILED: service_role updated a surfacing';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.video_surfacings;
    raise exception 'surfacings FAILED: service_role deleted a surfacing';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  video_surfacings: one row per video and run (ON CONFLICT DO NOTHING lands nothing), empty terms allowed, no update or delete';
end $$;

-- A8. own_post_subjects: append-only, one judge row per post, claim, subject, version ---
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000003c1';
        v constant uuid := '00000000-0000-4000-8000-0000000003b1';
        k1 constant uuid := '00000000-0000-4000-8000-0000000003d1';
        s1 constant uuid := '00000000-0000-4000-8000-0000000003f1';
        s2 constant uuid := '00000000-0000-4000-8000-0000000003f2';
        n int;
begin
  insert into public.own_post_subjects (client_id, video_id, claim_id, subject_id, touches, matched_words, method, judge_version, reason, actor_label) values
    (c, v, null, s1, true,  '{airline,carry}', 'judge', 'own_post_subjects_v1', 'names the cabin size', 'script:own-post-subjects'),
    (c, v, k1,   s1, true,  '{airline,seat}',  'judge', 'own_post_subjects_v1', null, 'script:own-post-subjects'),
    (c, v, null, s2, false, '{}',              'judge', 'own_post_subjects_v1', null, 'script:own-post-subjects'),
    -- a new judge version beside the old
    (c, v, null, s1, true,  '{airline}',       'judge', 'own_post_subjects_v2', null, 'script:own-post-subjects');
  -- A second judge row for the post as a whole (claim null) collides through the zero uuid.
  begin
    insert into public.own_post_subjects (client_id, video_id, subject_id, touches, method, judge_version, actor_label)
      values (c, v, s1, false, 'judge', 'own_post_subjects_v1', 'script:own-post-subjects');
    raise exception 'own_post_subjects FAILED: a second judge row for the post, subject and version landed';
  exception when unique_violation then null;
  end;
  begin
    insert into public.own_post_subjects (client_id, video_id, claim_id, subject_id, touches, method, judge_version, actor_label)
      values (c, v, k1, s1, false, 'judge', 'own_post_subjects_v1', 'script:own-post-subjects');
    raise exception 'own_post_subjects FAILED: a second judge row for the claim, subject and version landed';
  exception when unique_violation then null;
  end;
  insert into public.own_post_subjects (client_id, video_id, claim_id, subject_id, touches, method, judge_version, actor_label)
    values (c, v, k1, s1, false, 'judge', 'own_post_subjects_v1', 'script:own-post-subjects')
    on conflict do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'own_post_subjects FAILED: ON CONFLICT DO NOTHING landed a held judge row'; end if;
  -- Overrides repeat, and need no version; the newest decided_at wins.
  insert into public.own_post_subjects (client_id, video_id, subject_id, touches, method, reason, decided_at, actor_label) values
    (c, v, s2, true,  'override', 'the post does talk about rain', '2026-11-20 10:00Z', 'operator:heinrich'),
    (c, v, s2, false, 'override', 'second thoughts',               '2026-11-21 10:00Z', 'operator:heinrich');
  if (select o.touches from public.own_post_subjects o
       where o.client_id = c and o.video_id = v and o.claim_id is null and o.subject_id = s2
       order by (o.method = 'override') desc, o.decided_at desc limit 1) is distinct from false then
    raise exception 'own_post_subjects FAILED: the newest override does not read first';
  end if;
  begin
    insert into public.own_post_subjects (client_id, video_id, subject_id, touches, method, actor_label)
      values (c, v, s2, true, 'judge', 'script:own-post-subjects');
    raise exception 'own_post_subjects FAILED: a judge row with no judge version';
  exception when check_violation then null;
  end;
  begin
    insert into public.own_post_subjects (client_id, video_id, subject_id, touches, method, actor_label)
      values (c, v, s2, true, 'rule', 'script:own-post-subjects');
    raise exception 'own_post_subjects FAILED: a method other than judge or override';
  exception when check_violation then null;
  end;
  begin
    insert into public.own_post_subjects (client_id, video_id, subject_id, touches, method, actor_label)
      values (c, v, s2, true, 'override', '');
    raise exception 'own_post_subjects FAILED: a row that names no one';
  exception when check_violation then null;
  end;
  begin
    update public.own_post_subjects set touches = not touches;
    raise exception 'own_post_subjects FAILED: service_role updated a row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.own_post_subjects;
    raise exception 'own_post_subjects FAILED: service_role deleted a row';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  own_post_subjects: one judge row per post or claim, subject and version (null claim through the zero uuid), overrides repeat and the newest wins, no update or delete';
end $$;

-- A9. tracking_config_queue: queued by the service role, stamped once --------------------
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000003c1'; q uuid; n int;
begin
  insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_by, queued_label)
    values (c, 'brand_keywords', '["travel backpack", "carry on backpack"]', '2027-01-01',
            '00000000-0000-4000-8000-0000000003e1', 'owner@mf3.example')
    returning id into q;
  insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label) values
    (c, 'competitor_handles', '{"Cotopaxi": {"tiktok": "cotopaxi"}}', '2027-01-01', 'owner@mf3.example'),
    (c, 'subreddits', '[]', '2027-02-01', 'owner@mf3.example'),
    (c, 'report_day', '"sunday"', '2027-01-01', 'owner@mf3.example');
  update public.tracking_config_queue set applied_at = '2027-01-03 04:00Z' where id = q and applied_at is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'queue FAILED: the run could not stamp applied_at'; end if;
  begin
    update public.tracking_config_queue set applied_at = '2027-01-10 04:00Z' where id = q;
    raise exception 'queue FAILED: an applied edit was stamped twice';
  exception when restrict_violation then null;
  end;
  begin
    update public.tracking_config_queue set after = '[]' where id = q;
    raise exception 'queue FAILED: service_role rewrote a queued edit';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tracking_config_queue where id = q;
    raise exception 'queue FAILED: service_role deleted a queued edit';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'max_videos', '[50]', '2027-01-01', 'owner@mf3.example');
    raise exception 'queue FAILED: a cost knob was queued';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'watched_brands', '["Osprey"]', '2027-01-01', 'owner@mf3.example');
    raise exception 'queue FAILED: an operator column was queued';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'exclude_terms', '["x"]', '2027-01-15', 'owner@mf3.example');
    raise exception 'queue FAILED: an effective month that is not a first';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'exclude_terms', '"x"', '2027-01-01', 'owner@mf3.example');
    raise exception 'queue FAILED: a term list queued as a string';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'own_handles', '["sealand"]', '2027-01-01', 'owner@mf3.example');
    raise exception 'queue FAILED: handles queued as a list, not the column''s object';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'report_period', '["weekly"]', '2027-01-01', 'owner@mf3.example');
    raise exception 'queue FAILED: a cadence queued as a list, not the column''s string';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'last_actor', '{}', '2027-01-01', 'owner@mf3.example');
    raise exception 'queue FAILED: the actor stamp was queued';
  exception when check_violation then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'exclude_terms', '["x"]', '2027-01-01', '');
    raise exception 'queue FAILED: an edit that names no one';
  exception when check_violation then null;
  end;
  raise notice 'ok  tracking_config_queue: the service role queues and stamps applied_at once; no rewrite, no delete; the tenant''s audited columns only (no knob, operator column or stamp), each in its column''s JSON shape, a first of the month, someone named';
end $$;
reset role;
-- The applied-once guard holds for a role that holds more than the column grant.
do $$
begin
  begin
    update public.tracking_config_queue set effective_month = '2027-03-01'
     where client_id = '00000000-0000-4000-8000-0000000003c1' and field = 'subreddits';
    raise exception 'queue FAILED: the owner rewrote a queued edit';
  exception when restrict_violation then null;
  end;
  begin
    update public.tracking_config_queue set applied_at = null
     where client_id = '00000000-0000-4000-8000-0000000003c1' and applied_at is not null;
    raise exception 'queue FAILED: the owner took an applied stamp back';
  exception when restrict_violation then null;
  end;
  raise notice 'ok  the applied-once guard refuses the owner too';
end $$;

-- A10. The month tables' CHECKs (filling months, no frozen denominator: the guards let them in)
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000003c1';
begin
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, comments,
                                          status, origin, read_at, run_id, rule_version) values
    (c, '2026-11-01', 'industry-other', 'buyers',                'denominator', 'videos', 40, 40, null, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000003a1', 'segments_v1'),
    (c, '2026-11-01', 'industry-other', 'same_searches:2026-10', 'kind',        'praise', 12, 40, 30,   'filling', 'live', now(), '00000000-0000-4000-8000-0000000003a1', 'segments_v1');
  insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic,
                                           n, n_organic, status, origin, read_at, run_id, rule_version) values
    (c, '2026-11-01', 'industry-other', 'client', 3, 2, 1, 3, 40, 40, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000003a1', 'brands_v2'),
    (c, '2026-11-01', 'industry-other', 'watched:peak-design', 2, 2, 0, 2, 40, 40, 'filling', 'live', now(), null, 'brands_v2'),
    (c, '2026-11-01', 'industry-other', '8f2a3c1e-0b1d-4e5f-9a6b-7c8d9e0f1a2b', 1, 0, 1, 1, 40, 39, 'filling', 'live', now(), null, 'brands_v2');
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-15', 'industry-other', 'buyers', 'kind', 'praise', 1, 2, 'filling', 'live', now(), 'segments_v1');
    raise exception 'CHECK FAILED: a lens month that is not a first';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'Buyers', 'kind', 'praise', 1, 2, 'filling', 'live', now(), 'segments_v1');
    raise exception 'CHECK FAILED: a lens name that is not lower case';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'same_searches:2026-13', 'kind', 'praise', 1, 2, 'filling', 'live', now(), 'segments_v1');
    raise exception 'CHECK FAILED: a same-searches lens with no real month';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'buyers', 'brand', 'client', 1, 2, 'filling', 'live', now(), 'segments_v1');
    raise exception 'CHECK FAILED: an object kind lens_readings does not return';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'buyers', 'kind', 'question', -1, 2, 'filling', 'live', now(), 'segments_v1');
    raise exception 'CHECK FAILED: a negative lens count';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'buyers', 'kind', 'question', 1, 2, 'frozen', 'live', now(), 'segments_v1');
    raise exception 'CHECK FAILED: a frozen lens row with no frozen_at';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-11-01', 'industry-other', 'buyers', 'kind', 'question', 1, 2, 'filling', 'live', now(), 'segments_v1', now());
    raise exception 'CHECK FAILED: a filling lens row with a frozen_at';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'buyers', 'kind', 'question', 1, 2, 'filling', 'live', now(), '');
    raise exception 'CHECK FAILED: a lens row with no rule version';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'competitor:Cotopaxi', 1, 1, 0, 1, 2, 2, 'filling', 'live', now(), 'brands_v2');
    raise exception 'CHECK FAILED: a brand keyed on an audience string, not an identity';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'industry-other', 'watched:', 1, 1, 0, 1, 2, 2, 'filling', 'live', now(), 'brands_v2');
    raise exception 'CHECK FAILED: a watched brand with no slug';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'competitor:Cotopaxi', 'client', 1, 1, 0, -1, 2, 2, 'filling', 'live', now(), 'brands_v2');
    raise exception 'CHECK FAILED: a negative brand count';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status, origin, read_at, rule_version)
      values (c, '2026-11-01', 'competitor:Cotopaxi', 'client', 1, 1, 0, 1, 2, 2, 'frozen', 'live', now(), 'brands_v2');
    raise exception 'CHECK FAILED: a frozen brand row with no frozen_at';
  exception when check_violation then null;
  end;
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status, origin, read_at, rule_version)
      values (c, '2026-11-02', 'competitor:Cotopaxi', 'client', 1, 1, 0, 1, 2, 2, 'filling', 'live', now(), 'brands_v2');
    raise exception 'CHECK FAILED: a brand month that is not a first';
  exception when check_violation then null;
  end;
  -- A filling row is rewritten and swept as the month tables' are.
  update public.month_lens_readings set k = 13 where client_id = c and lens = 'same_searches:2026-10';
  delete from public.month_brand_readings where client_id = c and brand_key = 'watched:peak-design';
  raise notice 'ok  CHECKs: first-of-month months, lens names, lens_readings'' five object kinds, counts, frozen exactly with frozen_at, named versions, brand identities; filling rows update and sweep';
end $$;
reset role;

-- A11. A tenant reads its own rows in all five, and writes none --------------------------
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
  values ('00000000-0000-4000-8000-0000000003c2', '2026-11-01', 'industry-other', 'buyers', 'kind', 'praise', 1, 2, 'filling', 'live', now(), 'segments_v1');
insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic, status, origin, read_at, rule_version)
  values ('00000000-0000-4000-8000-0000000003c2', '2026-11-01', 'industry-other', 'client', 1, 1, 0, 1, 2, 2, 'filling', 'live', now(), 'brands_v2');
insert into public.video_surfacings (client_id, video_id, run_id, terms)
  values ('00000000-0000-4000-8000-0000000003c2', '00000000-0000-4000-8000-0000000003b9', '00000000-0000-4000-8000-0000000003a9', '{prosthetic}');
insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
  values ('00000000-0000-4000-8000-0000000003c2', 'brand_keywords', '["prosthetic"]', '2027-01-01', 'other@mf3.example');
insert into public.own_post_subjects (client_id, video_id, subject_id, touches, method, judge_version, actor_label)
  values ('00000000-0000-4000-8000-0000000003c2', '00000000-0000-4000-8000-0000000003b9', '00000000-0000-4000-8000-0000000003f9', true, 'judge', 'own_post_subjects_v1', 'script');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000003e1", "role": "authenticated"}';
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000003c1'; got text;
begin
  select format('%s/%s/%s/%s/%s',
    (select count(*) from public.month_lens_readings),
    (select count(*) from public.month_brand_readings),
    (select count(*) from public.video_surfacings),
    (select count(*) from public.tracking_config_queue),
    (select count(*) from (select id, client_id, video_id, claim_id, subject_id, touches, matched_words, method, judge_version, decided_at
                             from public.own_post_subjects) o))
    into got;
  if got <> '2/2/3/4/6' then
    raise exception 'RLS FAILED: the tenant sees % rows (lens/brand/surfacings/queue/own-post), not its own 2/2/3/4/6', got;
  end if;
  if exists (select 1 from public.month_lens_readings where client_id <> c)
     or exists (select 1 from public.tracking_config_queue where client_id <> c) then
    raise exception 'RLS FAILED: the tenant sees another tenant''s rows';
  end if;
  begin
    perform reason from public.own_post_subjects;
    raise exception 'grants FAILED: the tenant read own_post_subjects.reason';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tracking_config_queue (client_id, field, after, effective_month, queued_label)
      values (c, 'brand_keywords', '["x"]', '2027-01-01', 'owner@mf3.example');
    raise exception 'grants FAILED: a tenant session queued an edit itself (the settings action queues through the admin client)';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-12-01', 'industry-other', 'buyers', 'kind', 'praise', 1, 2, 'filling', 'live', now(), 'segments_v1');
    raise exception 'grants FAILED: a tenant session wrote a lens row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.video_surfacings (client_id, video_id, run_id)
      values (c, '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a2');
    raise exception 'grants FAILED: a tenant session wrote a surfacing';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tracking_config_queue set applied_at = now();
    raise exception 'grants FAILED: a tenant session stamped a queued edit';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  a tenant session reads its own rows in all five tables only (own_post_subjects without reason), and writes, queues and stamps none';
end $$;
reset role;

-- A12. The cascades --------------------------------------------------------------------
do $$
declare n int;
begin
  -- pass-a re-extracts a post's claims (delete, then insert): the claim's rows go with it.
  delete from public.video_claims where id = '00000000-0000-4000-8000-0000000003d1';
  select count(*) into n from public.own_post_subjects where claim_id = '00000000-0000-4000-8000-0000000003d1';
  if n <> 0 then raise exception 'cascade FAILED: % own-post rows outlived their claim', n; end if;
  delete from public.pipeline_runs where id = '00000000-0000-4000-8000-0000000003a2';
  select count(*) into n from public.video_surfacings where run_id = '00000000-0000-4000-8000-0000000003a2';
  if n <> 0 then raise exception 'cascade FAILED: surfacings outlived their run'; end if;
  delete from public.clients where id = '00000000-0000-4000-8000-0000000003c2';
  select (select count(*) from public.month_lens_readings where client_id = '00000000-0000-4000-8000-0000000003c2')
       + (select count(*) from public.month_brand_readings where client_id = '00000000-0000-4000-8000-0000000003c2')
       + (select count(*) from public.video_surfacings where client_id = '00000000-0000-4000-8000-0000000003c2')
       + (select count(*) from public.tracking_config_queue where client_id = '00000000-0000-4000-8000-0000000003c2')
       + (select count(*) from public.own_post_subjects where client_id = '00000000-0000-4000-8000-0000000003c2')
    into n;
  if n <> 0 then raise exception 'cascade FAILED: % rows outlived their tenant', n; end if;
  raise notice 'ok  cascades: a re-extracted claim takes its own-post rows, a deleted run its surfacings, a deleted tenant all five';
end $$;

rollback;
\echo 'mf3-checks part A: passed'

-- =============================================================================
-- Part B · the guards, across transactions (committed, then removed)
-- =============================================================================
--   tenant B: denominators for Aug 2026 frozen (industry-other and Cotopaxi) and
--   Oct 2026 filling (both); the back-read writes Aug, the runs write Oct.

-- B0. Leftovers from a run that stopped half way.
delete from public.clients where id = '00000000-0000-4000-8000-0000000004c1';

-- B1. The tenant and its months.
begin;
insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-0000000004c1', 'MF3 guard check');
insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
  ('00000000-0000-4000-8000-0000000004a1', '00000000-0000-4000-8000-0000000004c1', 'completed', '2026-11-08 04:00Z', '2026-11-08 06:00Z');
insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, run_id, frozen_at) values
  ('00000000-0000-4000-8000-0000000004c1', '2026-08-01', 'industry-other',      30, 400, '{}', 'frozen',  'live', '2026-09-06 06:00Z', null, '2026-10-04 06:00Z'),
  ('00000000-0000-4000-8000-0000000004c1', '2026-08-01', 'competitor:Cotopaxi', 10, 120, '{}', 'frozen',  'live', '2026-09-06 06:00Z', null, '2026-10-04 06:00Z'),
  ('00000000-0000-4000-8000-0000000004c1', '2026-10-01', 'industry-other',      40, 500, '{}', 'filling', 'live', '2026-11-08 06:00Z', null, null),
  ('00000000-0000-4000-8000-0000000004c1', '2026-10-01', 'competitor:Cotopaxi', 12, 150, '{}', 'filling', 'live', '2026-11-08 06:00Z', null, null);
commit;

-- B2. The back-read of August (lens buyers, and all_but_noise written savepoint
-- first), and the 8 Nov run's filling October rows. One transaction.
begin;
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000004c1';
begin
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at) values
    (c, '2026-08-01', 'industry-other',      'buyers',  'denominator', 'videos', 21, 21, 'frozen', 'back_read', now(), 'segments_v1', now()),
    (c, '2026-08-01', 'industry-other',      'buyers',  'kind',        'praise', 9,  21, 'frozen', 'back_read', now(), 'segments_v1', now()),
    (c, '2026-08-01', 'competitor:Cotopaxi', 'buyers',  'denominator', 'videos', 7,  7,  'frozen', 'back_read', now(), 'segments_v1', now()),
    -- a lens row a closed month still holds as filling: the mark's case below
    (c, '2026-08-01', 'industry-other',      'dense20', 'kind',        'praise', 4,  11, 'filling', 'back_read', now(), 'segments_v1', null);
  -- Savepoint first, then outer: the direction the plain xmin test got wrong.
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-08-01', 'industry-other', 'all_but_noise', 'denominator', 'videos', 27, 27, 'frozen', 'back_read', now(), 'segments_v1', now());
  exception when unique_violation then null;
  end;
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
    values (c, '2026-08-01', 'industry-other', 'all_but_noise', 'kind', 'praise', 11, 27, 'frozen', 'back_read', now(), 'segments_v1', now());
  insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                           status, origin, read_at, rule_version, frozen_at) values
    (c, '2026-08-01', 'industry-other', 'client',           2, 1, 1, 2, 30, 30, 'frozen', 'back_read', now(), 'brands_v2', now()),
    (c, '2026-08-01', 'industry-other', 'watched:osprey',   3, 3, 0, 3, 30, 30, 'frozen', 'back_read', now(), 'brands_v2', now());
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, run_id, rule_version) values
    (c, '2026-10-01', 'industry-other', 'buyers',  'denominator', 'videos', 30, 30, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1'),
    (c, '2026-10-01', 'industry-other', 'buyers',  'kind',        'praise', 12, 30, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1'),
    (c, '2026-10-01', 'industry-other', 'dense20', 'kind',        'praise', 5,  14, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1');
  insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                           status, origin, read_at, run_id, rule_version) values
    (c, '2026-10-01', 'industry-other', 'client', 4, 3, 1, 4, 40, 40, 'filling', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'brands_v2');
  raise notice 'ok  the first back-read of a closed month lands (lens by lens, a savepoint''s rows first), and the filling month''s rows with it';
end $$;
commit;

-- B3. A second back-read, and everything else a frozen row refuses. One transaction.
begin;
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000004c1'; msg text; n int;
begin
  -- The same lens, a new key: refused, and the message says it is held.
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-08-01', 'industry-other', 'buyers', 'kind', 'question', 3, 21, 'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'lens guard FAILED: a second back-read of August''s buyers lens landed a new key';
  exception when restrict_violation then
    get stacked diagnostics msg = message_text;
    if msg not like '%lens buyers is already held%' then raise exception 'lens guard FAILED: the refusal reads "%"', msg; end if;
  end;
  -- The same lens, the other audience, a new key: refused as well.
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-08-01', 'competitor:Cotopaxi', 'buyers', 'kind', 'praise', 2, 7, 'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'lens guard FAILED: a second back-read of Cotopaxi''s August landed';
  exception when restrict_violation then null;
  end;
  -- The same keys again: the upsert reaches the update guard; a plain insert the key.
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-08-01', 'industry-other', 'buyers', 'kind', 'praise', 10, 21, 'frozen', 'back_read', now(), 'segments_v1', now())
      on conflict (client_id, month, audience, lens, object_kind, object_id) do update set k = excluded.k;
    raise exception 'lens guard FAILED: a frozen lens row was rewritten by an upsert';
  exception when restrict_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-08-01', 'industry-other', 'buyers', 'kind', 'praise', 10, 21, 'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'lens guard FAILED: a held key was inserted twice';
  exception when unique_violation then null;
  end;
  -- The mark: a refresh of a filling row of a closed month lets a new key of
  -- the same lens in behind it in neither order.
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-08-01', 'industry-other', 'dense20', 'kind', 'praise',   4, 11, 'filling', 'back_read', now(), 'segments_v1'),
             (c, '2026-08-01', 'industry-other', 'dense20', 'kind', 'question', 2, 11, 'filling', 'back_read', now(), 'segments_v1')
      on conflict (client_id, month, audience, lens, object_kind, object_id) do update set k = excluded.k;
    raise exception 'lens guard FAILED: a new dense20 key slipped in behind a refreshed one';
  exception when restrict_violation then null;
  end;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version)
      values (c, '2026-08-01', 'industry-other', 'dense20', 'kind', 'question', 2, 11, 'filling', 'back_read', now(), 'segments_v1'),
             (c, '2026-08-01', 'industry-other', 'dense20', 'kind', 'praise',   4, 11, 'filling', 'back_read', now(), 'segments_v1')
      on conflict (client_id, month, audience, lens, object_kind, object_id) do update set k = excluded.k;
    raise exception 'lens guard FAILED: a new dense20 key landed ahead of a refreshed one';
  exception when restrict_violation then null;
  end;
  -- The mark is the lens's: a refresh of dense20 does not hold another lens's first back-read.
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
    values (c, '2026-08-01', 'industry-other', 'dense20',               'kind', 'praise', 4,  11, 'filling', 'back_read', now(), 'segments_v1', null),
           (c, '2026-08-01', 'industry-other', 'same_searches:2026-07', 'kind', 'praise', 6,  18, 'frozen',  'back_read', now(), 'segments_v1', now())
    on conflict (client_id, month, audience, lens, object_kind, object_id) do update set k = excluded.k;
  -- Another lens: its first back-read lands, over two statements of this transaction.
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
    values (c, '2026-08-01', 'industry-other', 'makers', 'denominator', 'videos', 9, 9, 'frozen', 'back_read', now(), 'segments_v1', now()),
           (c, '2026-08-01', 'industry-other', 'makers', 'kind',        'praise', 2, 9, 'frozen', 'back_read', now(), 'segments_v1', now());
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
    values (c, '2026-08-01', 'industry-other', 'makers', 'kind', 'question', 1, 9, 'frozen', 'back_read', now(), 'segments_v1', now());
  -- An audience whose month has not closed is not the guard's.
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
    values (c, '2026-08-01', 'client', 'buyers', 'denominator', 'videos', 2, 2, 'frozen', 'back_read', now(), 'segments_v1', now());
  -- The update and delete guards.
  begin
    update public.month_lens_readings set k = k + 1 where client_id = c and month = '2026-08-01' and lens = 'buyers' and object_id = 'praise';
    raise exception 'lens guard FAILED: a frozen lens row was updated';
  exception when restrict_violation then null;
  end;
  begin
    delete from public.month_lens_readings where client_id = c and month = '2026-08-01' and lens = 'buyers';
    raise exception 'lens guard FAILED: a frozen lens row was deleted';
  exception when restrict_violation then null;
  end;
  delete from public.month_lens_readings where client_id = c and month = '2026-10-01' and lens = 'dense20';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'lens guard FAILED: the stale sweep could not delete a filling lens row'; end if;
  -- The brand table, under the existing three: its audience-month is held.
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                             status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-08-01', 'industry-other', 'watched:peak-design', 1, 1, 0, 1, 30, 30, 'frozen', 'back_read', now(), 'brands_v2', now());
    raise exception 'brand guard FAILED: a second back-read of August''s brands landed a new brand';
  exception when restrict_violation then null;
  end;
  begin
    update public.month_brand_readings set k_any = 9 where client_id = c and month = '2026-08-01' and brand_key = 'client';
    raise exception 'brand guard FAILED: a frozen brand row was updated';
  exception when restrict_violation then null;
  end;
  begin
    delete from public.month_brand_readings where client_id = c and month = '2026-08-01';
    raise exception 'brand guard FAILED: a frozen brand row was deleted';
  exception when restrict_violation then null;
  end;
  raise notice 'ok  a second back-read of the same audience-month and lens is refused ("already held"), another lens''s first lands; frozen lens and brand rows refuse update, upsert and delete; the brand table''s audience-month is held';
end $$;
commit;

-- B4. The makers lens, read again: now held.
begin;
set local role service_role;
do $$
begin
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values ('00000000-0000-4000-8000-0000000004c1', '2026-08-01', 'industry-other', 'makers', 'kind', 'pain_point', 1, 9,
              'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'lens guard FAILED: a second back-read of the makers lens landed';
  exception when restrict_violation then null;
  end;
  raise notice 'ok  the makers lens, once read, is held too';
end $$;
commit;

-- B5. The run that freezes October (6 Dec): lens-readings and brand-readings
-- write October's rows and mark them frozen, a first-seen key included, and
-- then freeze-months writes the denominator marker. No restrict_violation.
begin;
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000004c1';
begin
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, run_id, rule_version, frozen_at) values
    (c, '2026-10-01', 'industry-other',      'buyers', 'denominator', 'videos',   31, 31, 'frozen', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1', now()),
    (c, '2026-10-01', 'industry-other',      'buyers', 'kind',        'praise',   13, 31, 'frozen', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1', now()),
    (c, '2026-10-01', 'industry-other',      'buyers', 'kind',        'question', 4,  31, 'frozen', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1', now()),
    (c, '2026-10-01', 'competitor:Cotopaxi', 'buyers', 'denominator', 'videos',   8,  8,  'frozen', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'segments_v1', now())
    on conflict (client_id, month, audience, lens, object_kind, object_id)
    do update set k = excluded.k, n = excluded.n, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                           status, origin, read_at, run_id, rule_version, frozen_at) values
    (c, '2026-10-01', 'industry-other', 'client',         5, 4, 1, 5, 40, 40, 'frozen', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'brands_v2', now()),
    (c, '2026-10-01', 'industry-other', 'watched:osprey', 2, 2, 0, 2, 40, 40, 'frozen', 'live', now(), '00000000-0000-4000-8000-0000000004a1', 'brands_v2', now())
    on conflict (client_id, month, audience, brand_key)
    do update set k_any = excluded.k_any, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  -- freeze-months: the denominator marker, last.
  update public.month_denominators set status = 'frozen', frozen_at = now()
   where client_id = c and month = '2026-10-01';
  raise notice 'ok  the freezing run writes October''s lens and brand rows frozen, a first-seen key included, before the marker, with no restrict_violation';
end $$;
commit;

-- B6. After October froze: nothing new lands behind it; a lens never read gets its one back-read.
begin;
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-0000000004c1'; frozen int;
begin
  select count(*) into frozen from public.month_lens_readings where client_id = c and month = '2026-10-01' and status = 'frozen';
  if frozen <> 4 then raise exception 'freeze FAILED: % of October''s 4 lens rows are frozen', frozen; end if;
  begin
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-10-01', 'industry-other', 'buyers', 'kind', 'objection', 1, 31, 'frozen', 'live', now(), 'segments_v1', now());
    raise exception 'lens guard FAILED: a late key landed behind October''s freeze';
  exception when restrict_violation then null;
  end;
  begin
    update public.month_lens_readings set k = 14 where client_id = c and month = '2026-10-01' and object_id = 'praise';
    raise exception 'lens guard FAILED: a frozen October lens row was updated';
  exception when restrict_violation then null;
  end;
  begin
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                             status, origin, read_at, rule_version, frozen_at)
      values (c, '2026-10-01', 'industry-other', 'watched:bellroy', 1, 1, 0, 1, 40, 40, 'frozen', 'live', now(), 'brands_v2', now());
    raise exception 'brand guard FAILED: a late brand landed behind October''s freeze';
  exception when restrict_violation then null;
  end;
  insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
    values (c, '2026-10-01', 'industry-other', 'makers', 'denominator', 'videos', 9, 9, 'frozen', 'back_read', now(), 'segments_v1', now());
  raise notice 'ok  after the freeze: no late lens or brand key, no update; a lens that never read October gets its one back-read';
end $$;
commit;

-- B7. The tenant goes, and takes its frozen rows with it (the delete guard's one exception).
delete from public.clients where id = '00000000-0000-4000-8000-0000000004c1';
do $$
begin
  if exists (select 1 from public.month_lens_readings where client_id = '00000000-0000-4000-8000-0000000004c1')
     or exists (select 1 from public.month_brand_readings where client_id = '00000000-0000-4000-8000-0000000004c1') then
    raise exception 'cascade FAILED: frozen lens or brand rows outlived their tenant';
  end if;
  raise notice 'ok  a tenant''s removal takes its frozen lens and brand rows';
end $$;

\echo 'mf3-checks: all passed'
