-- Deploy 4 and the 4 Oct freeze, on the throwaway cluster (MF1, R12, MF2,
-- MF4 and MF3 all applied: the worst case, where every new step writes):
--
--   bash scripts/pg-shim/d4-freeze-checks.sh <scratch dir>
--
-- THE QUESTION. The Sun 4 Oct run freezes August for good, and deploy 4 puts
-- four steps (segment-videos, comparability, lens-readings, brand-readings)
-- before freeze-months, the queue apply in open-run and the gather's
-- provenance and surfacings before them. Can any of it change what
-- freeze-months writes for August?
--
-- THE CHECK. Two tenants, seeded identically (videos, comments, insights,
-- evidence, a run's themes, a subject and its memberships, the stored filling
-- denominators the 27 Sep run left): A is deploy 3's run, B is deploy 4's.
-- On B only, every write the new code makes, in its statement shapes, as
-- service_role, each in its own transaction as PostgREST sends them:
-- video_segments, video_provenance, video_surfacings, config_change_reach,
-- month_pair_comparability, comparability_checks, week_line_reads and
-- week_line_points, brand_mentions, month_lens_readings and
-- month_brand_readings (August written FROZEN, before freeze-months' marker,
-- as the steps do on the run that closes it) and a queued tracking edit.
-- Then:
--   D1. the six month functions freeze-months reads answer the same, row for
--       row, on A and on B;
--   D2. freeze-months' own writes (every numerator first, frozen for August,
--       then the denominators, the marker) land on B with no guard refusal;
--   D3. A's and B's six month tables are the same, row for row (the tenant
--       aside);
--   D4. the tables freeze-months reads carry no trigger a step's write could
--       fire into, and the steps' tables carry guards only.
-- The tenants and their counts are made up; the arithmetic is the test's own.
\set ON_ERROR_STOP 1

delete from public.clients where id in ('00000000-0000-4000-8000-00000000d4a1', '00000000-0000-4000-8000-00000000d4b1');

-- F1. The seed, once per tenant, from one function so the two cannot differ.
create or replace function pg_temp.d4_id(c uuid, what text) returns uuid language sql immutable as
$$ select md5(c::text || '/' || what)::uuid $$;

create or replace function pg_temp.d4_seed(c uuid) returns void language plpgsql as $seed$
declare
  r0 uuid := pg_temp.d4_id(c, 'run-0927');
  r1 uuid := pg_temp.d4_id(c, 'run-1004');
  subj uuid := pg_temp.d4_id(c, 'subject');
  th uuid;
  v record;
  g int;
begin
  insert into public.clients (id, company_name) values (c, 'd4 freeze check');
  insert into public.tracking_configs (client_id, competitor_names, competitor_keywords, platforms)
    values (c, '{Cotopaxi}', '{cotopaxi backpack}', '{youtube,tiktok,reddit}');
  insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
    (r0, c, 'completed', '2026-09-27 04:00Z', '2026-09-27 07:28Z'),
    (r1, c, 'running',   '2026-10-04 04:00Z', null);
  -- Twenty videos: sixteen in the category, three filed under Cotopaxi, one of
  -- the client's own. Comments in August (all), September (every other) and one
  -- undated on the last. Every video analysed by the running run.
  for g in 1..20 loop
    insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name,
                               analyzed_lane, analyzed_run_id, sentiment, sentiment_source, caption, hashtags, upload_date, scraped_at)
    values (pg_temp.d4_id(c, 'v' || g), c, (array['youtube','tiktok','reddit','instagram'])[1 + g % 4], 'vid-' || g, 'u',
            'acct-' || (g % 6), g = 20, g between 17 and 19, case when g between 17 and 19 then 'Cotopaxi' end,
            'full', r1, (array['positive','negative','neutral','mixed'])[1 + g % 4], 'audience',
            case when g % 5 = 0 then 'sewing my own tote, pattern in bio' else 'which carry-on bag lasts' end, '{}',
            ('2026-08-0' || (1 + g % 9))::date, case when g <= 6 then '2026-06-20 05:00Z'::timestamptz else '2026-08-10 05:00Z'::timestamptz end);
  end loop;
  for v in select id, platform, video_id, split_part(video_id, '-', 2)::int as n from public.videos where client_id = c loop
    for g in 1..3 loop
      insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
      values (pg_temp.d4_id(c, 'c-aug-' || v.video_id || '-' || g), c, r0, v.platform, v.video_id, v.video_id || '-a' || g,
              ('2026-08-' || lpad((10 + g + v.n % 9)::text, 2, '0') || ' 12:00Z')::timestamptz, '2026-09-27 05:00Z', 'august words');
    end loop;
    if v.n % 2 = 0 then
      insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
      values (pg_temp.d4_id(c, 'c-sep-' || v.video_id), c, r1, v.platform, v.video_id, v.video_id || '-s', '2026-09-21 12:00Z', '2026-10-04 05:00Z', 'september words');
    end if;
  end loop;
  insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
    select pg_temp.d4_id(c, 'c-undated'), c, r1, platform, video_id, 'undated-1', null, '2026-10-04 05:00Z', 'no date'
      from public.videos where client_id = c and video_id = 'vid-12';
  -- Twelve insights (a kind each), their comment evidence, three themes of the
  -- running run and one subject with half of them as members.
  for g in 1..12 loop
    insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id)
    values (pg_temp.d4_id(c, 'ai' || g), c, r1, (array['praise','question','complaint','request'])[1 + g % 4], 't' || g, 'd', pg_temp.d4_id(c, 'v' || g));
    insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id)
    values (pg_temp.d4_id(c, 'ai' || g), pg_temp.d4_id(c, 'c-aug-vid-' || g || '-1'), 'august words', 'comment', null);
    if g % 2 = 0 then
      insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id)
      values (pg_temp.d4_id(c, 'ai' || g), pg_temp.d4_id(c, 'c-sep-vid-' || g), 'september words', 'comment', null);
    end if;
  end loop;
  for g in 1..3 loop
    th := pg_temp.d4_id(c, 'theme' || g);
    insert into public.theme_registry (id, client_id, bucket, canonical_label) values (th, c, 'industry-other', 'theme ' || g);
    insert into public.theme_observations (theme_id, client_id, run_id, label, member_insight_ids, match_kind)
    values (th, c, r1, 'theme ' || g, array(select pg_temp.d4_id(c, 'ai' || gx.x) from generate_series(1 + (g - 1) * 4, g * 4) gx(x)), 'exact');
  end loop;
  insert into public.subjects (id, client_id, name, origin, status) values (subj, c, 'Durability', 'category_theme', 'active');
  insert into public.subject_memberships (subject_id, audience_insight_id, client_id, member, method, judge_version, run_id)
    select subj, pg_temp.d4_id(c, 'ai' || gs.n), c, true, 'judge', 'subject_judge_v1', r1 from generate_series(1, 12, 2) gs(n);
  -- The stored rows the 27 Sep run left: August and September filling.
  insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, run_id, frozen_at) values
    (c, '2026-08-01', 'industry-other',      15, 45, '{}', 'filling', 'live', '2026-09-27 07:20Z', r0, null),
    (c, '2026-08-01', 'competitor:Cotopaxi',  3,  9, '{}', 'filling', 'live', '2026-09-27 07:20Z', r0, null),
    (c, '2026-09-01', 'industry-other',       8,  8, '{}', 'filling', 'live', '2026-09-27 07:20Z', r0, null);
end
$seed$;

begin;
select pg_temp.d4_seed('00000000-0000-4000-8000-00000000d4a1');
select pg_temp.d4_seed('00000000-0000-4000-8000-00000000d4b1');
commit;

-- What freeze-months reads, per tenant, as comparable text (the tenant's ids
-- stripped to their seed labels so A and B line up).
create or replace function pg_temp.d4_reads(c uuid) returns table (what text, line text) language plpgsql as $reads$
declare
  r1 uuid := pg_temp.d4_id(c, 'run-1004');
  f timestamptz := '2026-08-01'; t timestamptz := '2026-11-01';
begin
  return query select 'denominators', format('%s|%s|%s|%s|%s', d.month, d.audience, d.videos, d.comments, d.platform_mix) from public.monthly_denominators(c, f, t) d;
  return query select 'themes', format('%s|%s|%s|%s|%s|%s|%s', x.month, x.audience, (select canonical_label from public.theme_registry r where r.id = x.theme_id), x.videos, x.comments, x.excluded_on_camera, x.excluded_undated)
    from public.monthly_theme_readings(c, r1, f, t) x;
  return query select 'kinds', format('%s|%s|%s|%s', k.month, k.audience, k.kind, k.videos) from public.monthly_kind_readings(c, f, t) k;
  return query select 'stats', format('%s|%s|%s|%s|%s', s.month, s.audience, s.judged, s.positive, s.panel_videos) from public.monthly_audience_stats(c, null, f, t) s;
  return query select 'subjects', format('%s|%s|%s|%s', s.month, s.audience, s.videos, s.comments) from public.monthly_subject_readings(c, f, t) s;
  return query select 'refs', format('%s|%s|%s|%s|%s', e.month, e.audience, (select canonical_label from public.theme_registry r where r.id = e.theme_id),
                                      cardinality(e.video_ids), cardinality(e.comment_ids)) from public.monthly_evidence_refs(c, r1, f, t) e;
end
$reads$;

create temp table d4_before as
  select 'A' as tenant, * from pg_temp.d4_reads('00000000-0000-4000-8000-00000000d4a1')
  union all
  select 'B', * from pg_temp.d4_reads('00000000-0000-4000-8000-00000000d4b1');

do $$
begin
  if (select count(*) from d4_before where tenant = 'A') < 20 then
    raise exception 'seed FAILED: the six functions read only % lines for A', (select count(*) from d4_before where tenant = 'A');
  end if;
  if exists (select what, line from d4_before where tenant = 'A' except select what, line from d4_before where tenant = 'B')
     or exists (select what, line from d4_before where tenant = 'B' except select what, line from d4_before where tenant = 'A') then
    raise exception 'seed FAILED: the two tenants do not read the same before the steps';
  end if;
  raise notice 'ok  seed: two identical tenants; the six functions read % lines each (denominators, themes, kinds, stats, subjects, refs over August to October)',
    (select count(*) from d4_before where tenant = 'A');
end $$;

-- F2. Deploy 4's writes, on B only, as the new code makes them. Each block is
-- one PostgREST request's transaction, as service_role.
-- open-run: a queued tracking edit (it applies nothing before 2027; the row
-- is what Settings writes).
begin;
insert into public.tracking_config_queue (id, client_id, field, after, effective_month, queued_label) values
  ('00000000-0000-4000-8000-00000000d4f1', '00000000-0000-4000-8000-00000000d4b1', 'competitor_names', '["Cotopaxi", "Topo Designs"]', '2027-01-01', 'Owner (check)');
commit;
-- the gather: exact provenance for the fresh videos, a surfacing for each
begin;
set local role service_role;
insert into public.video_provenance (client_id, video_id, first_run_id, first_stored_at, first_terms, first_subreddits, method, evidence)
  select client_id, id, pg_temp.d4_id(client_id, 'run-1004'), '2026-10-04 04:30Z', '{upcycled bag}', '{}', 'exact', 'gather'
    from public.videos where client_id = '00000000-0000-4000-8000-00000000d4b1'
on conflict (client_id, video_id) do nothing;
insert into public.video_surfacings (client_id, video_id, run_id, terms, subreddits)
  select client_id, id, pg_temp.d4_id(client_id, 'run-1004'), '{upcycled bag}', '{}' from public.videos where client_id = '00000000-0000-4000-8000-00000000d4b1'
on conflict (client_id, video_id, run_id) do nothing;
commit;
-- segment-videos: a segments_v1 rule row for every video (makers where the caption says so)
begin;
set local role service_role;
insert into public.video_segments (client_id, video_id, rule_version, segment, method, reason, actor_label)
  select client_id, id, 'segments_v1', case when caption like 'sewing%' then 'maker' when video_id = 'vid-7' then 'noise' else 'market' end, 'rule',
         case when caption like 'sewing%' then 'maker_regex:sewing' end, 'pipeline · segment-videos'
    from public.videos where client_id = '00000000-0000-4000-8000-00000000d4b1';
commit;
-- comparability: the pair rows, the reach rows and the checks
begin;
set local role service_role;
insert into public.config_changes (id, client_id, surface, field, before, after, changed_at, actor_kind, actor_label)
  values ('00000000-0000-4000-8000-00000000d4c1', '00000000-0000-4000-8000-00000000d4b1', 'attribution', 'attribution_v3', null, null, '2026-09-25 16:18:47Z', 'script', 'log-tracking-eras')
on conflict do nothing;
insert into public.month_pair_comparability (client_id, prev_month, month, search_outside_prev, videos_prev, search_outside_curr, videos_curr,
                                             code_changes, depth_prev_median, depth_curr_median, gather, late_capture, read_through_run, method_version, computed_at) values
  ('00000000-0000-4000-8000-00000000d4b1', '2026-08-01', '2026-09-01', 0, 18, 0, 8, '[]', 3, 1, '[]', '{"month":"2026-08-01","comments":0,"of":54}',
   pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), 'mf1_v1', '2026-10-04 07:40Z');
insert into public.config_change_reach (client_id, change_id, month, population, videos_touched, videos_in_month, method, read_through_run, computed_at) values
  ('00000000-0000-4000-8000-00000000d4b1', '00000000-0000-4000-8000-00000000d4c1', '2026-08-01', 'market', 1, 18, 'code_reach_v1',
   pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), '2026-10-04 07:40Z');
insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, k_prev, n_prev, k_curr, n_curr,
                                         population_makers, population_noise, verdict, outcome, read_through_run, method_version, computed_at) values
  ('00000000-0000-4000-8000-00000000d4b1', '2026-08-01', '2026-09-01', 'same_searches_clean', 'kind', 'praise', 4, 18, 2, 8, 0.2, 0.05, '{}', 'too_few',
   pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), 'recheck_v2', '2026-10-04 07:41Z');
commit;
-- comparability's weekly keep
begin;
set local role service_role;
insert into public.week_line_reads (client_id, week, age_days, captured_before, read_through_run, conditions, method_version, computed_at) values
  ('00000000-0000-4000-8000-00000000d4b1', '2026-09-14', 14, '2026-09-29 00:00Z', pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), '{}', 'week_line_v1', '2026-10-04 07:42Z')
on conflict (client_id, week, age_days, method_version) do nothing;
insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n) values
  ('00000000-0000-4000-8000-00000000d4b1', '2026-09-14', 14, 'week_line_v1', 'industry-other', 'kind', 'praise', '5-19', 2, 8)
on conflict do nothing;
commit;
-- lens-readings: August written FROZEN (it closes in this run), September and
-- October filling, each month its own request
begin;
set local role service_role;
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, run_id, rule_version, frozen_at)
  select '00000000-0000-4000-8000-00000000d4b1', '2026-08-01', a, l, 'denominator', 'videos', n, n, 'frozen', 'live', '2026-10-04 07:43Z',
         pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), 'segments_v1', '2026-10-04 07:43Z'
    from (values ('industry-other', 15), ('competitor:Cotopaxi', 3)) aud(a, n), unnest(array['market', 'buyers', 'makers', 'all_but_noise']) l
on conflict (client_id, month, audience, lens, object_kind, object_id) do update
  set k = excluded.k, n = excluded.n, status = excluded.status, read_at = excluded.read_at, run_id = excluded.run_id, frozen_at = excluded.frozen_at;
commit;
begin;
set local role service_role;
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, run_id, rule_version, frozen_at) values
  ('00000000-0000-4000-8000-00000000d4b1', '2026-09-01', 'industry-other', 'market', 'denominator', 'videos', 8, 8, 'filling', 'live', '2026-10-04 07:43Z',
   pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), 'segments_v1', null);
commit;
-- brand-readings: the month's new mentions, then August's rows FROZEN
begin;
set local role service_role;
insert into public.brand_mentions (client_id, video_id, brand_key, source, field, comment_id, comment_month, method, rule_version)
  select client_id, id, pg_temp.d4_id(client_id, 'cotopaxi')::text, 'content', 'caption', null, null, 'rule', 'brands_v1'
    from public.videos where client_id = '00000000-0000-4000-8000-00000000d4b1' and is_competitor;
commit;
begin;
set local role service_role;
insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                         status, origin, read_at, run_id, rule_version, frozen_at) values
  ('00000000-0000-4000-8000-00000000d4b1', '2026-08-01', 'industry-other',      pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'cotopaxi')::text, 0, 0, 0, 0, 15, 15, 'frozen', 'live', '2026-10-04 07:44Z',
   pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), 'brands_v1', '2026-10-04 07:44Z'),
  ('00000000-0000-4000-8000-00000000d4b1', '2026-08-01', 'competitor:Cotopaxi', pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'cotopaxi')::text, 3, 3, 0, 0,  3,  0, 'frozen', 'live', '2026-10-04 07:44Z',
   pg_temp.d4_id('00000000-0000-4000-8000-00000000d4b1', 'run-1004'), 'brands_v1', '2026-10-04 07:44Z')
on conflict (client_id, month, audience, brand_key) do update
  set k_any = excluded.k_any, n = excluded.n, status = excluded.status, read_at = excluded.read_at, run_id = excluded.run_id, frozen_at = excluded.frozen_at;
commit;

-- D1. The six functions read the same on A and on B.
create temp table d4_after as
  select 'A' as tenant, * from pg_temp.d4_reads('00000000-0000-4000-8000-00000000d4a1')
  union all
  select 'B', * from pg_temp.d4_reads('00000000-0000-4000-8000-00000000d4b1');
do $$
declare diff text;
begin
  select string_agg(format('%s %s', what, line), E'\n') into diff from (
    (select what, line from d4_after where tenant = 'A' except select what, line from d4_after where tenant = 'B')
    union all
    (select what, line from d4_after where tenant = 'B' except select what, line from d4_after where tenant = 'A')) x;
  if diff is not null then raise exception E'D1 FAILED: after deploy 4''s writes the month functions read differently on B:\n%', diff; end if;
  if exists (select what, line from d4_after where tenant = 'B' except select what, line from d4_before where tenant = 'B') then
    raise exception 'D1 FAILED: B reads differently from itself before the writes';
  end if;
  if (select count(*) from public.video_segments where client_id = '00000000-0000-4000-8000-00000000d4b1') <> 20
     or (select count(*) from public.month_lens_readings where client_id = '00000000-0000-4000-8000-00000000d4b1' and month = '2026-08-01' and status = 'frozen') <> 8
     or (select count(*) from public.month_brand_readings where client_id = '00000000-0000-4000-8000-00000000d4b1' and status = 'frozen') <> 2 then
    raise exception 'D1 FAILED: the steps'' writes did not all land on B';
  end if;
  raise notice 'ok  D1: after every deploy-4 write on B (20 segments, provenance, surfacings, pair, reach and check rows, a kept week, 3 mentions, August''s lens and brand rows frozen, a queued edit), the six month functions read the same on A and on B, % lines each', (select count(*) from d4_after where tenant = 'B');
end $$;

-- D2. freeze-months' writes on each tenant: every numerator first (August
-- frozen, September and October filling, the 4 Oct clock), then the
-- denominators, the marker. The statements freezeMonths sends: an upsert on
-- each table's key, in its own transaction.
create or replace function pg_temp.d4_freeze(c uuid) returns void language plpgsql as $freeze$
declare
  r1 uuid := pg_temp.d4_id(c, 'run-1004');
  f timestamptz := '2026-08-01'; t timestamptz := '2026-11-01';
  at timestamptz := '2026-10-04 08:20Z';
begin
  insert into public.month_theme_readings (client_id, month, audience, theme_id, videos, comments, platform_mix, excluded_on_camera, excluded_undated,
                                           status, origin, read_at, run_id, frozen_at, clustering_key)
    select c, x.month, x.audience, x.theme_id, x.videos, x.comments, x.platform_mix, x.excluded_on_camera, x.excluded_undated,
           case when x.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when x.month = '2026-08-01' then at end, 'ck-1004'
      from public.monthly_theme_readings(c, r1, f, t) x
  on conflict (client_id, month, audience, theme_id) do update set videos = excluded.videos, comments = excluded.comments, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_kind_readings (client_id, month, audience, kind, videos, comments, platform_mix, excluded_on_camera, excluded_undated,
                                          status, origin, read_at, run_id, frozen_at)
    select c, k.month, k.audience, k.kind, k.videos, k.comments, k.platform_mix, k.excluded_on_camera, k.excluded_undated,
           case when k.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when k.month = '2026-08-01' then at end
      from public.monthly_kind_readings(c, f, t) k
  on conflict (client_id, month, audience, kind) do update set videos = excluded.videos, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_subject_readings (client_id, month, audience, subject_id, videos, comments, platform_mix, excluded_on_camera, excluded_undated,
                                             status, origin, read_at, run_id, frozen_at, judge_version)
    select c, s.month, s.audience, s.subject_id, s.videos, s.comments, s.platform_mix, s.excluded_on_camera, s.excluded_undated,
           case when s.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when s.month = '2026-08-01' then at end, 'subject_judge_v1'
      from public.monthly_subject_readings(c, f, t) s
  on conflict (client_id, month, audience, subject_id) do update set videos = excluded.videos, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_audience_stats (client_id, month, audience, judged, positive, negative, neutral, mixed, judged_framing,
                                           panel_videos, attention_comments, panel_platform_mix, panel_id, status, origin, read_at, run_id, frozen_at)
    select c, s.month, s.audience, s.judged, s.positive, s.negative, s.neutral, s.mixed, s.judged_framing,
           s.panel_videos, s.attention_comments, s.panel_platform_mix, null,
           case when s.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when s.month = '2026-08-01' then at end
      from public.monthly_audience_stats(c, null, f, t) s
  on conflict (client_id, month, audience) do update set judged = excluded.judged, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
  insert into public.month_evidence_refs (client_id, month, audience, object_kind, object_id, video_ids, comment_ids, platform_mix,
                                          status, origin, read_at, run_id, frozen_at, clustering_key)
    select c, e.month, e.audience, 'theme', e.theme_id::text, e.video_ids, e.comment_ids, e.platform_mix,
           case when e.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when e.month = '2026-08-01' then at end, 'ck-1004'
      from public.monthly_evidence_refs(c, r1, f, t) e
  on conflict (client_id, month, audience, object_kind, object_id) do update set video_ids = excluded.video_ids, status = excluded.status, frozen_at = excluded.frozen_at, read_at = excluded.read_at;
end
$freeze$;

create or replace function pg_temp.d4_mark(c uuid) returns void language plpgsql as $mark$
declare
  r1 uuid := pg_temp.d4_id(c, 'run-1004');
  at timestamptz := '2026-10-04 08:20Z';
begin
  insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, run_id, frozen_at)
    select c, d.month, d.audience, d.videos, d.comments, d.platform_mix,
           case when d.month = '2026-08-01' then 'frozen' else 'filling' end, 'live', at, r1, case when d.month = '2026-08-01' then at end
      from public.monthly_denominators(c, '2026-08-01', '2026-11-01') d
  on conflict (client_id, month, audience) do update
    set videos = excluded.videos, comments = excluded.comments, platform_mix = excluded.platform_mix, status = excluded.status,
        read_at = excluded.read_at, run_id = excluded.run_id, frozen_at = excluded.frozen_at;
end
$mark$;

begin; set local role service_role; select pg_temp.d4_freeze('00000000-0000-4000-8000-00000000d4a1'); commit;
begin; set local role service_role; select pg_temp.d4_mark('00000000-0000-4000-8000-00000000d4a1'); commit;
begin; set local role service_role; select pg_temp.d4_freeze('00000000-0000-4000-8000-00000000d4b1'); commit;
begin; set local role service_role; select pg_temp.d4_mark('00000000-0000-4000-8000-00000000d4b1'); commit;
do $$
begin
  if (select count(*) from public.month_denominators where client_id = '00000000-0000-4000-8000-00000000d4b1' and month = '2026-08-01' and status = 'frozen') < 2 then
    raise exception 'D2 FAILED: B''s August did not freeze';
  end if;
  raise notice 'ok  D2: freeze-months'' writes landed on B after deploy 4''s (numerators, then the marker): no guard refused a row, and August froze';
end $$;

-- D3. The six tables, A against B, row for row (the tenant and the run id,
-- which are each tenant's own, aside).
create or replace function pg_temp.d4_frozen(c uuid) returns table (tbl text, line text) language sql as $frozen$
  select 'denominators', format('%s|%s|%s|%s|%s|%s|%s', month, audience, videos, comments, platform_mix, status, frozen_at) from public.month_denominators where client_id = c
  union all
  select 'themes', format('%s|%s|%s|%s|%s|%s', month, audience, (select canonical_label from public.theme_registry r where r.id = theme_id), videos, comments, status) from public.month_theme_readings where client_id = c
  union all
  select 'kinds', format('%s|%s|%s|%s|%s', month, audience, kind, videos, status) from public.month_kind_readings where client_id = c
  union all
  select 'subjects', format('%s|%s|%s|%s', month, audience, videos, status) from public.month_subject_readings where client_id = c
  union all
  select 'stats', format('%s|%s|%s|%s|%s', month, audience, judged, positive, status) from public.month_audience_stats where client_id = c
  union all
  select 'refs', format('%s|%s|%s|%s|%s', month, audience, cardinality(video_ids), cardinality(comment_ids), status) from public.month_evidence_refs where client_id = c
$frozen$;
do $$
declare diff text; n int;
begin
  select string_agg(format('%s %s', tbl, line), E'\n') into diff from (
    (select * from pg_temp.d4_frozen('00000000-0000-4000-8000-00000000d4a1') except all select * from pg_temp.d4_frozen('00000000-0000-4000-8000-00000000d4b1'))
    union all
    (select * from pg_temp.d4_frozen('00000000-0000-4000-8000-00000000d4b1') except all select * from pg_temp.d4_frozen('00000000-0000-4000-8000-00000000d4a1'))) x;
  if diff is not null then raise exception E'D3 FAILED: the six month tables differ between A (deploy 3) and B (deploy 4):\n%', diff; end if;
  select count(*) into n from pg_temp.d4_frozen('00000000-0000-4000-8000-00000000d4b1') where line like '2026-08-01|%';
  raise notice 'ok  D3: A''s and B''s six month tables are the same row for row (% rows each, % of them August, frozen)',
    (select count(*) from pg_temp.d4_frozen('00000000-0000-4000-8000-00000000d4b1')), n;
end $$;

-- D4. No trigger reaches from a step's table into freeze-months' inputs: on
-- every table the new code writes, only BEFORE guards (they raise or pass,
-- and write nothing); and the tables freeze-months reads carry no trigger
-- that a write elsewhere could fire.
do $$
declare bad text;
begin
  select string_agg(format('%s: %s → %s', c.relname, t.tgname, p.proname), '; ') into bad
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal
     and c.relname in ('video_segments', 'video_provenance', 'video_surfacings', 'config_change_reach', 'month_pair_comparability', 'comparability_checks',
                       'week_line_reads', 'week_line_points', 'brand_mentions', 'month_lens_readings', 'month_brand_readings', 'tracking_config_queue')
     and p.proname not in ('month_reading_frozen_guard', 'month_reading_frozen_insert_guard', 'month_lens_frozen_insert_guard', 'month_reading_delete_guard', 'tracking_config_queue_applied_once');
  if bad is not null then raise exception 'D4 FAILED: a step''s table fires a trigger that is not a guard: %', bad; end if;
  raise notice 'ok  D4: the tables deploy 4''s steps write carry guards only (no trigger that writes)';
end $$;

-- The tenants go.
delete from public.clients where id in ('00000000-0000-4000-8000-00000000d4a1', '00000000-0000-4000-8000-00000000d4b1');
do $$ begin raise notice 'ok  d4 freeze checks: all passed'; end $$;
