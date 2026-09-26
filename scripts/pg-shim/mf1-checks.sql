-- MF1 on the throwaway cluster: the checks WP1.4's done-when names, run after
-- the migration has been applied twice (scripts/pg-shim/throwaway.sh check).
-- Every check raises on failure, so psql -v ON_ERROR_STOP=1 exits non-zero; the
-- synthetic rows live inside one transaction that is rolled back.
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/mf1-checks.sql
--
-- Run it BEFORE the R12 file (20260928091000_market_first_r12_grants.sql):
-- section 1 checks that MF1 alone leaves the tenant's tracking_configs grants
-- as deploy 1's code needs them. The R12 revoke has its own checks,
-- scripts/pg-shim/r12-checks.sql.
--
-- The synthetic month is September 2026 with made-up ids. Its counts are the
-- test's own arithmetic (four videos, a handful of comments), not a claim about
-- any tenant.
\set ON_ERROR_STOP 1
begin;

-- 1. MF1 changes no tracking_configs grant ---------------------------------------------
-- Deploy 1's settings saves (rivals and cadence, exclusions, communities) still
-- go out on the tenant's session and need these five; the R12 file takes them
-- away once deploy 2 is live. The term columns were revoked by T0-2 already.
do $$
declare col text;
begin
  foreach col in array array['competitor_names', 'exclude_terms', 'subreddits', 'report_period', 'report_day'] loop
    if not has_column_privilege('authenticated', 'public.tracking_configs', col, 'UPDATE') then
      raise exception 'MF1 FAILED: authenticated lost UPDATE on tracking_configs.% (deploy 1 saves through it)', col;
    end if;
  end loop;
  foreach col in array array['brand_keywords', 'competitor_keywords', 'industry_keywords'] loop
    if has_column_privilege('authenticated', 'public.tracking_configs', col, 'UPDATE') then
      raise exception 'MF1 FAILED: authenticated holds UPDATE on tracking_configs.%', col;
    end if;
  end loop;
  raise notice 'ok  MF1 leaves the tenant''s tracking_configs grants as deploy 1 needs them';
end $$;

-- 2. The five tables: RLS on, tenant SELECT only, service role append-only --------
do $$
declare t text; p text;
begin
  foreach t in array array['video_segments', 'video_provenance', 'config_change_reach',
                           'month_pair_comparability', 'front_page_overrides'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'tables FAILED: RLS is off on %', t;
    end if;
    foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('authenticated', 'public.' || t, p) or has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'tables FAILED: a tenant role holds % on %', p, t;
      end if;
    end loop;
    foreach p in array array['UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('service_role', 'public.' || t, p) then
        raise exception 'tables FAILED: service_role holds % on % (append-only)', p, t;
      end if;
    end loop;
    if not (has_table_privilege('service_role', 'public.' || t, 'SELECT') and has_table_privilege('service_role', 'public.' || t, 'INSERT')) then
      raise exception 'tables FAILED: service_role cannot select and insert on %', t;
    end if;
    if has_any_column_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception 'tables FAILED: anon can read %', t;
    end if;
    if not has_any_column_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'tables FAILED: authenticated cannot read any column of %', t;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.video_segments', 'actor_label', 'SELECT')
     or has_column_privilege('authenticated', 'public.front_page_overrides', 'note', 'SELECT')
     or has_column_privilege('authenticated', 'public.video_provenance', 'evidence', 'SELECT') then
    raise exception 'tables FAILED: a tenant can read the operator''s words';
  end if;
  raise notice 'ok  tables: RLS on, tenant column SELECT only, service role select and insert only';
end $$;

-- 3. The functions: service role only --------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.segments_v1_reason(text, text[], text[], text[])', 'public.segments_for_videos(uuid, uuid[])',
                           'public.market_month_videos(uuid, date)', 'public.market_month_depth(uuid, date)',
                           'public.theme_maker_shares(uuid, date, uuid)', 'public.market_segment_counts(uuid, date)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'functions FAILED: a tenant role can execute %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'functions FAILED: service_role cannot execute %', f;
    end if;
  end loop;
  raise notice 'ok  functions: execute for service_role only';
end $$;

-- 4. The segments_v1 rule, in SQL -----------------------------------------------------
do $$
begin
  if public.segments_v1_reason('Turning old jeans into a crossbody bag, a DIY tutorial', null, null, array['upcycled bag']) <> 'maker_regex:diy'
     or public.segments_v1_reason('crochet bag pattern', '{}', '{}', '{}') <> 'maker_regex:crochet'
     or public.segments_v1_reason(null, array['#Sewing'], null, null) <> 'maker_regex:sewing'
     or public.segments_v1_reason('How To Make a tote', null, null, null) <> 'maker_regex:how to make'
     or public.segments_v1_reason('poker night highlights', null, null, array['poler']) <> 'bare_name_only:poler'
     or public.segments_v1_reason('Ecuador news', null, null, array['Cotopaxi ', 'patagonia']) <> 'bare_name_only:cotopaxi'
     or public.segments_v1_reason('handmade bag', null, array['sewn'], null) is not null
     or public.segments_v1_reason('diybag', null, null, null) is not null
     or public.segments_v1_reason('Navy SEAL podcast', null, null, array['sealand gear', 'travel gear']) is not null
     or public.segments_v1_reason('Navy SEAL podcast', null, null, '{}') is not null then
    raise exception 'segments FAILED: segments_v1_reason disagrees with lib/segments/rules.ts';
  end if;
  raise notice 'ok  segments_v1_reason: maker words word-bounded, bare names only when every term is one';
end $$;

-- 5. The readers, on a synthetic tenant ------------------------------------------------
-- Ids: c001 the tenant, a1 its run, b1..b6 its videos, d1/d2 two themes, e1 a user.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e1', 'owner@check.example');
insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-00000000c001', 'MF1 check');
insert into public.users (id, client_id, full_name, email, role)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000c001', 'Owner', 'owner@check.example', 'owner');
insert into public.tracking_configs (client_id, competitor_names, report_period, report_day)
  values ('00000000-0000-4000-8000-00000000c001', array['Cotopaxi'], 'weekly', 'sunday');
insert into public.pipeline_runs (id, client_id, status)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'completed');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name,
                           analyzed_lane, caption, hashtags, topics, source_keywords) values
  -- b1: category, a maker by its caption, and labelled maker by a stored rule row
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y1', 'u', 'a', false, false, null,
   'full', 'Jeans to bag, easy sewing tutorial', '{}', '{}', '{upcycled bag}'),
  -- b2: category, found only by a bare name: noise, computed inline
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y2', 'u', 'a', false, false, null,
   'full', 'Poker night', '{}', '{}', '{poler}'),
  -- b3: filed under a rival: the market
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000c001', 'tiktok', 't3', 'u', 'a', false, true, 'Cotopaxi',
   'full', 'Allpa 35 review', '{}', '{}', '{cotopaxi backpack}'),
  -- b4: the client's own post: never in the market
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-00000000c001', 'instagram', 'i4', 'u', 'a', true, false, null,
   'full', 'Our new bag', '{}', '{}', '{}'),
  -- b5: category on the claims lane: its comments were not read, never in the market
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y5', 'u', 'a', false, false, null,
   'claims_only', 'A haul', '{}', '{}', '{}'),
  -- b6: category, the market by the rule, labelled maker by an operator override
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000c001', 'reddit', 'r6', 'u', 'a', false, false, null,
   'full', 'Which daypack for Japan', '{}', '{}', '{r/onebag}');

-- Comments: b1 three in September (the last a second before October), one in
-- August and one on 1 Oct 00:00 UTC; b2 one; b3 twelve; b4 two; b5 two; b6
-- twenty. So September's market is b1, b2, b3, b6 with 3, 1, 12 and 20.
insert into public.comments (client_id, run_id, platform, video_id, comment_id, comment_date)
select '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', x.platform, x.video_id,
       x.video_id || '-' || to_char(x.at, 'MMDDHH24MISS') || '-' || g, x.at + (g || ' seconds')::interval
from (values ('youtube', 'y1', timestamptz '2026-09-02 10:00Z', 1), ('youtube', 'y1', timestamptz '2026-09-15 10:00Z', 1),
             ('youtube', 'y1', timestamptz '2026-09-30 23:59:58Z', 1), ('youtube', 'y1', timestamptz '2026-08-20 10:00Z', 1),
             ('youtube', 'y2', timestamptz '2026-09-05 10:00Z', 1),
             ('tiktok', 't3', timestamptz '2026-09-10 10:00Z', 12),
             ('instagram', 'i4', timestamptz '2026-09-10 10:00Z', 2),
             ('youtube', 'y5', timestamptz '2026-09-10 10:00Z', 2),
             ('reddit', 'r6', timestamptz '2026-09-11 10:00Z', 20)) x(platform, video_id, at, n),
     generate_series(1, x.n) g;
-- The two month-boundary comments: 1 Oct 00:00 UTC belongs to October.
insert into public.comments (client_id, run_id, platform, video_id, comment_id, comment_date) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y1', 'y1-oct', '2026-10-01 00:00:00Z');

do $$
declare got text; want text;
begin
  -- market_month_videos: the client's own post and the claims lane are out; the
  -- per-audience counts equal monthly_denominators' rows for the same month.
  select string_agg(v.audience || '=' || v.n || '/' || v.c, ' ' order by v.audience) into got
    from (select audience, count(*) n, sum(dated_comments) c
            from public.market_month_videos('00000000-0000-4000-8000-00000000c001', '2026-09-15') group by 1) v;
  if got is distinct from 'competitor:Cotopaxi=1/12 industry-other=3/24' then
    raise exception 'market_month_videos FAILED: got %', got;
  end if;
  select string_agg(d.audience || '=' || d.videos || '/' || d.comments, ' ' order by d.audience) into want
    from public.monthly_denominators('00000000-0000-4000-8000-00000000c001', '2026-09-01 00:00Z', '2026-10-01 00:00Z') d
   where d.audience <> 'client';
  if got is distinct from want then
    raise exception 'market_month_videos FAILED: % against monthly_denominators %', got, want;
  end if;
  select string_agg(v.audience || '=' || v.n, ' ') into got
    from (select audience, count(*) n from public.market_month_videos('00000000-0000-4000-8000-00000000c001', '2026-08-01') group by 1) v;
  if got is distinct from 'industry-other=1' then raise exception 'market_month_videos FAILED (August): got %', got; end if;

  -- market_month_depth: four videos, two under ten, median of 1, 3, 12, 20 = 7.5.
  select d.videos || '/' || d.under_10 || '/' || d.median_dated into got
    from public.market_month_depth('00000000-0000-4000-8000-00000000c001', '2026-09-01') d;
  if got is distinct from '4/2/7.5' then raise exception 'market_month_depth FAILED: got %', got; end if;
  select d.videos || '/' || d.under_10 || '/' || coalesce(d.median_dated::text, 'null') into got
    from public.market_month_depth('00000000-0000-4000-8000-00000000c001', '2026-11-01') d;
  if got is distinct from '0/0/null' then raise exception 'market_month_depth FAILED (empty month): got %', got; end if;
  raise notice 'ok  market_month_videos equals monthly_denominators per audience, client and claims lane out; depth 4/2/7.5';
end $$;

-- Labels: b1 a stored rule row (maker); b6 an older rule row (market) and a newer override (maker).
insert into public.video_segments (client_id, video_id, rule_version, segment, method, reason, decided_at, actor_label) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b1', 'segments_v1', 'maker', 'rule', 'maker_regex:sewing', '2026-09-30 10:00Z', 'check'),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b6', 'segments_v1', 'market', 'rule', null, '2026-09-30 10:00Z', 'check'),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b6', 'segments_v1', 'maker', 'override', 'operator', '2026-09-30 11:00Z', 'check');
-- The month's theme refs: d1 on b1, b2, b6; d2 on b6.
insert into public.month_evidence_refs (client_id, month, audience, object_kind, object_id, video_ids, comment_ids, platform_mix,
                                        status, origin, read_at, run_id) values
  ('00000000-0000-4000-8000-00000000c001', '2026-09-01', 'industry-other', 'theme', '00000000-0000-4000-8000-0000000000d1',
   array['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b6']::uuid[],
   '{}', '{}', 'filling', 'live', now(), '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-00000000c001', '2026-09-01', 'industry-other', 'theme', '00000000-0000-4000-8000-0000000000d2',
   array['00000000-0000-4000-8000-0000000000b6']::uuid[], '{}', '{}', 'filling', 'live', now(), '00000000-0000-4000-8000-0000000000a1');

do $$
declare got text;
begin
  select string_agg(t.registry_id || '=' || t.videos || '/' || t.maker || '/' || t.noise || '/' || t.labelled, ' ' order by t.registry_id) into got
    from public.theme_maker_shares('00000000-0000-4000-8000-00000000c001', '2026-09-20', '00000000-0000-4000-8000-0000000000a1') t;
  if got is distinct from '00000000-0000-4000-8000-0000000000d1=3/2/1/2 00000000-0000-4000-8000-0000000000d2=1/1/0/1' then
    raise exception 'theme_maker_shares FAILED: got %', got;
  end if;
  select string_agg(s.audience || ':' || s.segment || '=' || s.videos, ' ' order by s.audience, s.segment) into got
    from public.market_segment_counts('00000000-0000-4000-8000-00000000c001', '2026-09-01') s;
  if got is distinct from 'competitor:Cotopaxi:market=1 industry-other:maker=2 industry-other:noise=1' then
    raise exception 'market_segment_counts FAILED: got %', got;
  end if;
  raise notice 'ok  theme_maker_shares and market_segment_counts: override over judge over rule over inline';
end $$;

-- First-found terms win over source_keywords: b2 first found by a search that is not a bare name.
insert into public.video_provenance (client_id, video_id, first_terms, method, evidence)
  values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b2', '{upcycled bag}', 'exact', 'gate_verdicts');
do $$
declare got text;
begin
  select string_agg(t.videos || '/' || t.maker || '/' || t.noise, ' ') into got
    from public.theme_maker_shares('00000000-0000-4000-8000-00000000c001', '2026-09-01', null) t
   where t.registry_id = '00000000-0000-4000-8000-0000000000d1';
  if got is distinct from '3/2/0' then raise exception 'theme_maker_shares FAILED (first-found terms): got %', got; end if;
  -- first found in a community: no bare name found it
  update public.video_provenance set first_terms = '{}', first_subreddits = '{r/onebag}'
   where video_id = '00000000-0000-4000-8000-0000000000b2';
  select string_agg(t.videos || '/' || t.maker || '/' || t.noise, ' ') into got
    from public.theme_maker_shares('00000000-0000-4000-8000-00000000c001', '2026-09-01', null) t
   where t.registry_id = '00000000-0000-4000-8000-0000000000d1';
  if got is distinct from '3/2/0' then raise exception 'theme_maker_shares FAILED (first-found community): got %', got; end if;
  -- no stored refs and no run: nothing, never an error
  select count(*)::text into got from public.theme_maker_shares('00000000-0000-4000-8000-00000000c001', '2026-07-01', null);
  if got <> '0' then raise exception 'theme_maker_shares FAILED (empty month): got % rows', got; end if;
  raise notice 'ok  first-found terms and communities decide the noise rule where provenance holds them';
end $$;

-- 6. The change log takes the three new surfaces and nothing else -----------------------
insert into public.config_changes (client_id, surface, actor_kind, source, note)
select '00000000-0000-4000-8000-00000000c001', s, 'script', 'reconstructed', 'check'
from unnest(array['segment', 'gate_rule', 'attribution']) s;
do $$
begin
  begin
    insert into public.config_changes (client_id, surface, actor_kind) values ('00000000-0000-4000-8000-00000000c001', 'bogus', 'script');
    raise exception 'surfaces FAILED: an unknown surface was accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok  config_changes takes segment, gate_rule and attribution, and refuses an unknown surface';
end $$;

-- 7. Behaviour, not only the catalogue ---------------------------------------------------
-- A tenant owner's session still saves the five columns deploy 1 writes
-- through it (the grant is there; the lock is the app's), so MF1 on Wed 30 Sep
-- breaks no save before deploy 2.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
do $$
declare col text; n int;
begin
  foreach col in array array['competitor_names', 'exclude_terms', 'subreddits', 'report_period', 'report_day'] loop
    begin
      execute format('update public.tracking_configs set %I = %I where client_id = %L', col, col, '00000000-0000-4000-8000-00000000c001');
      get diagnostics n = row_count;
    exception when insufficient_privilege then
      raise exception 'MF1 FAILED: a tenant owner''s session was refused on tracking_configs.% before deploy 2', col;
    end;
    if n <> 1 then raise exception 'MF1 FAILED: a tenant owner''s session saved % rows of tracking_configs.%, not 1', n, col; end if;
  end loop;
  raise notice 'ok  MF1: a tenant owner''s session still saves every column deploy 1 writes through it';
end $$;
reset role;

-- The service role inserts and never rewrites or deletes.
set local role service_role;
do $$
begin
  begin
    update public.video_segments set segment = 'market' where client_id = '00000000-0000-4000-8000-00000000c001';
    raise exception 'append-only FAILED: service_role updated video_segments';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.month_pair_comparability where client_id = '00000000-0000-4000-8000-00000000c001';
    raise exception 'append-only FAILED: service_role deleted from month_pair_comparability';
  exception when insufficient_privilege then null;
  end;
  insert into public.front_page_overrides (client_id, registry_id, action, actor_label)
    values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000d1', 'exclude_lead', 'check');
  raise notice 'ok  append-only: the service role inserts, and cannot update or delete';
end $$;
reset role;

-- A cascade still works: a video removed with its tenant's data takes its labels.
do $$
declare n int;
begin
  delete from public.videos where id = '00000000-0000-4000-8000-0000000000b1';
  select count(*) into n from public.video_segments where video_id = '00000000-0000-4000-8000-0000000000b1';
  if n <> 0 then raise exception 'cascade FAILED: % label rows outlived their video', n; end if;
  raise notice 'ok  the foreign-key cascade still removes a deleted video''s labels';
end $$;

rollback;
\echo 'mf1-checks: all passed'
