-- MF4 on the throwaway cluster (20261005091000_market_first_weeks.sql): the two
-- tables' RLS, policy, grants, CHECKs and append-only rule, the two functions'
-- grants, and what each function returns, run after the file has been applied
-- twice:
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/mf4-checks.sql
--
-- Every check raises on failure; the synthetic rows live inside one transaction
-- that is rolled back. The synthetic tenant is made up (ids, words and counts):
-- its numbers are the test's own arithmetic, a few videos across the weeks of
-- 31 Aug, 7 Sep and 28 Sep 2026, not a claim about any tenant. Decision M's
-- real weeks are checked on staging, read-only (WP2.9's done-when).
\set ON_ERROR_STOP 1
begin;
-- Every instant below is written in UTC, and the session runs fourteen hours
-- ahead of it, so a function that read a date in the session's zone would move
-- a comment into the wrong week and fail here.
set local time zone 'Pacific/Kiritimati';

-- 1. The two tables: RLS on, tenant SELECT only, service role append-only --------
do $$
declare t text; p text;
begin
  foreach t in array array['week_line_reads', 'week_line_points'] loop
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
    if has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'tables FAILED: authenticated holds table-level SELECT on % (column grants only)', t;
    end if;
    if (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name = t
          and not has_column_privilege('authenticated', 'public.' || t, c.column_name, 'SELECT')) <> 0 then
      raise exception 'tables FAILED: a column of % is not readable by its tenant', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t) <> 1
       or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT'
                        and roles = '{authenticated}' and qual = '(client_id = get_my_client_id())') then
      raise exception 'tables FAILED: % does not carry exactly one get_my_client_id() select policy for authenticated', t;
    end if;
  end loop;
  raise notice 'ok  tables: RLS on, one get_my_client_id() select policy each, tenant column SELECT only, service role select and insert only';
end $$;

-- 2. The functions: definer, pinned search_path, service role only --------------------
do $$
declare f text;
begin
  foreach f in array array['public.market_week_volumes(uuid, date, date, timestamptz)',
                           'public.market_week_readings(uuid, date, int, uuid[])'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('public', f, 'EXECUTE') then
      raise exception 'functions FAILED: a tenant role (or public) can execute %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'functions FAILED: service_role cannot execute %', f;
    end if;
    if not (select p.prosecdef and p.proconfig = '{"search_path=public, pg_temp"}' and p.provolatile = 's'
              from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'functions FAILED: % is not a stable SECURITY DEFINER with search_path public, pg_temp', f;
    end if;
  end loop;
  raise notice 'ok  functions: stable, security definer, pinned search_path, execute for service_role only';
end $$;

-- 3. The synthetic tenant ----------------------------------------------------------------
--   w1 category, uploaded 1 Aug: 2 comments on 31 Aug (captured 6 Sep) and 3 on 1 Sep (captured 13 Sep)
--   w2 category, uploaded 30 Aug: 1 on 2 Sep (captured 6 Sep), 25 on 8 Sep (captured 13 Sep)
--   w3 Cotopaxi, uploaded 7 Sep: 6 on 9 Sep (captured 13 Sep); let in by a 'default' gate verdict
--   w4 the client's own post: 3 on 9 Sep          w5 category, claims lane: 3 on 9 Sep
--   w6 category, uploaded 29 Sep: 2 on 30 Sep and 1 on 1 Oct (captured 4 Oct)
--   w7 category, uploaded 5 Sep: 1 on 10 Sep (captured 13 Sep) and 1 on 10 Sep captured 29 Sep,
--      after the week's 14-day cut; its only 'default' verdict was a drop, its keep was the model's
--   w8 the other tenant's: 4 on 9 Sep
insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-00000000c001', 'MF4 check'),
  ('00000000-0000-4000-8000-00000000c002', 'MF4 other tenant');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e1', 'owner@check.example');
insert into public.users (id, client_id, full_name, email, role)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000c001', 'Owner', 'owner@check.example', 'owner');
insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'completed', '2026-09-13 04:00Z', '2026-09-13 06:00Z'),
  ('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-00000000c002', 'completed', '2026-09-13 04:00Z', '2026-09-13 06:00Z');
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name,
                           analyzed_lane, analyzed_run_id, upload_date) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001', 'youtube', 'w1', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', '2026-08-01'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c001', 'youtube', 'w2', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', '2026-08-30'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000c001', 'tiktok', 'w3', 'u', 'a', false, true, 'Cotopaxi', 'full', '00000000-0000-4000-8000-0000000000a1', '2026-09-07'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-00000000c001', 'instagram', 'w4', 'u', 'a', true, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', '2026-09-08'),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-00000000c001', 'youtube', 'w5', 'u', 'a', false, false, null, 'claims_only', '00000000-0000-4000-8000-0000000000a1', '2026-09-08'),
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000c001', 'reddit', 'w6', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', '2026-09-29'),
  ('00000000-0000-4000-8000-0000000000b7', '00000000-0000-4000-8000-00000000c001', 'youtube', 'w7', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a1', '2026-09-05'),
  ('00000000-0000-4000-8000-0000000000b8', '00000000-0000-4000-8000-00000000c002', 'youtube', 'w8', 'u', 'a', false, false, null, 'full', '00000000-0000-4000-8000-0000000000a9', '2026-09-01');
insert into public.gate_verdicts (client_id, run_id, platform, video_id, keyword, kept, source) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'tiktok', 'w3', 'cotopaxi backpack', true, 'default'),
  ('00000000-0000-4000-8000-00000000c001', null, 'youtube', 'w7', 'travel gear', false, 'default'),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'w7', 'travel gear', true, 'gpt');
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at)
select ('00000000-0000-4000-8000-' || lpad(x.tag || lpad(g::text, 2, '0'), 12, '0'))::uuid,
       x.client::uuid, x.run::uuid, x.platform, x.video_id, x.video_id || '-' || x.tag || '-' || g,
       (x.at || ' 00:00Z')::timestamptz, x.cap::timestamptz
from (values
  ('11', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w1', '2026-08-31', '2026-09-06 05:10Z', 2),
  ('12', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w1', '2026-09-01', '2026-09-13 05:10Z', 3),
  ('21', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w2', '2026-09-02', '2026-09-06 05:10Z', 1),
  ('22', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w2', '2026-09-08', '2026-09-13 05:10Z', 25),
  ('31', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'tiktok',    'w3', '2026-09-09', '2026-09-13 05:10Z', 6),
  ('41', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'instagram', 'w4', '2026-09-09', '2026-09-13 05:10Z', 3),
  ('51', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w5', '2026-09-09', '2026-09-13 05:10Z', 3),
  ('61', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'reddit',    'w6', '2026-09-30', '2026-10-04 05:10Z', 2),
  ('62', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'reddit',    'w6', '2026-10-01', '2026-10-04 05:10Z', 1),
  ('71', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w7', '2026-09-10', '2026-09-13 05:10Z', 1),
  ('72', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube',   'w7', '2026-09-10', '2026-09-29 05:10Z', 1),
  ('81', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000a9', 'youtube',   'w8', '2026-09-09', '2026-09-13 05:10Z', 4)
) x(tag, client, run, platform, video_id, at, cap, n),
generate_series(1, x.n) g;

-- 4. market_week_volumes -----------------------------------------------------------------
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-00000000c001';
  got text;
begin
  select string_agg(format('%s %s v%s c%s nm%s u5-%s med%s mean%s old%s unch%s', w.week, w.audience, w.videos, w.comments,
                           w.comments_next_month, w.under_5, w.median_dated, round(w.mean_dated, 2), w.older_videos, w.unchecked),
                    E'\n' order by w.week, w.audience) into got
    from public.market_week_volumes(c, '2026-08-31', '2026-10-05') w;
  -- 31 Aug: w1 (5: two in August, three in September, which started inside the week)
  -- and w2 (1, on 2 Sep). 7 Sep: w2 (25) and w7 (2) in the category, w3 (6) under
  -- Cotopaxi; the market's median of 25, 2 and 6 is 6 on both rows. No row for the
  -- empty weeks of 14 and 21 Sep. 28 Sep: w6, one comment in October.
  if got is distinct from concat_ws(E'\n',
      '2026-08-31 industry-other v2 c6 nm4 u5-1 med3 mean3.00 old1 unch0',
      '2026-09-07 competitor:Cotopaxi v1 c6 nm0 u5-0 med6 mean11.00 old0 unch1',
      '2026-09-07 industry-other v2 c27 nm0 u5-1 med6 mean11.00 old1 unch0',
      '2026-09-28 industry-other v1 c3 nm1 u5-1 med3 mean3.00 old0 unch0') then
    raise exception E'market_week_volumes FAILED: got\n%', got;
  end if;
  -- A capture cut: only what we held on 10 Sep. w1 keeps its two August comments;
  -- w2 its one on 2 Sep; the week of 7 Sep had not been captured at all.
  select string_agg(format('%s %s v%s c%s nm%s u5-%s med%s mean%s', w.week, w.audience, w.videos, w.comments,
                           w.comments_next_month, w.under_5, w.median_dated, round(w.mean_dated, 2)),
                    E'\n' order by w.week, w.audience) into got
    from public.market_week_volumes(c, '2026-08-31', '2026-10-05', '2026-09-10 00:00Z') w;
  if got is distinct from '2026-08-31 industry-other v2 c3 nm1 u5-2 med1.5 mean1.50' then
    raise exception E'market_week_volumes FAILED (p_captured_before): got\n%', got;
  end if;
  -- Bounds: every week that overlaps [p_from, p_to), read whole.
  select string_agg(w.week || ':' || w.audience || ':' || w.comments, ' ' order by w.week, w.audience) into got
    from public.market_week_volumes(c, '2026-09-02', '2026-09-07') w;
  if got is distinct from '2026-08-31:industry-other:6' then raise exception 'market_week_volumes FAILED (bounds, one week): got %', got; end if;
  select count(distinct w.week)::text into got from public.market_week_volumes(c, '2026-09-02', '2026-09-08') w;
  if got <> '2' then raise exception 'market_week_volumes FAILED (bounds, a week begun): got % weeks', got; end if;
  if exists (select 1 from public.market_week_volumes(c, '2026-09-07', '2026-09-07'))
     or exists (select 1 from public.market_week_volumes(c, '2026-09-14', '2026-09-07')) then
    raise exception 'market_week_volumes FAILED: rows for an empty range';
  end if;
  -- Another tenant's weeks are its own.
  select string_agg(w.week || ':' || w.videos || '/' || w.comments, ' ') into got
    from public.market_week_volumes('00000000-0000-4000-8000-00000000c002', '2026-08-31', '2026-10-05') w;
  if got is distinct from '2026-09-07:1/4' then raise exception 'market_week_volumes FAILED (tenant): got %', got; end if;
  raise notice 'ok  market_week_volumes: ISO weeks at UTC, the market only (no own posts, no claims lane), the market''s median, next-month comments, older and unchecked videos, the capture cut';
end $$;

-- 5. market_week_readings: the same-age cut ----------------------------------------------
-- Insights on the week of 7 Sep (current unless said):
--   k1 praise on w2, cites one of its 8 Sep comments       k2 question on w3, cites a 9 Sep comment
--   k3 praise on w7, cites its comment captured 13 Sep     k4 question on w7, cites its comment captured 29 Sep
--   k5 pain_point on w2, cites its 2 Sep comment (another week)
--   k6 feature_request on w2, on camera only (the week line counts cited comments only)
--   k7 objection on w2, SUPERSEDED (not current: no kind row at all)
--   k8 praise on w4, the client's own post (not the market)
-- Subjects: s1 active, member k7 (a member reads the base table) and k5; s2 retired,
-- member k2 (never read); s3 active with no members (rows with k = 0).
insert into public.pipeline_runs (id, client_id, status) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-00000000c001', 'completed');
insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id) values
  ('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000041a2', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'question',        't', 'd', '00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000041a3', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b7'),
  ('00000000-0000-4000-8000-0000000041a4', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'question',        't', 'd', '00000000-0000-4000-8000-0000000000b7'),
  ('00000000-0000-4000-8000-0000000041a5', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'pain_point',      't', 'd', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000041a6', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'feature_request', 't', 'd', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000041a7', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a0', 'objection',       't', 'd', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000041a8', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b4');
insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id) values
  ('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-000000002201', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000041a2', '00000000-0000-4000-8000-000000003101', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000041a3', '00000000-0000-4000-8000-000000007101', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000041a4', '00000000-0000-4000-8000-000000007201', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000041a5', '00000000-0000-4000-8000-000000002101', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000041a6', null,                                   'q', 'video',   '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000041a7', '00000000-0000-4000-8000-000000002202', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000041a8', '00000000-0000-4000-8000-000000004101', 'q', 'comment', null);
insert into public.subjects (id, client_id, name, origin, status) values
  ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-00000000c001', 'Looks and style', 'client', 'active'),
  ('00000000-0000-4000-8000-0000000051a2', '00000000-0000-4000-8000-00000000c001', 'Retired one', 'client', 'active'),
  ('00000000-0000-4000-8000-0000000051a3', '00000000-0000-4000-8000-00000000c001', 'Nothing yet', 'client', 'active');
insert into public.subject_memberships (subject_id, audience_insight_id, client_id, member, method, judge_version) values
  ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-0000000041a7', '00000000-0000-4000-8000-00000000c001', true, 'client', 'check'),
  ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-0000000041a5', '00000000-0000-4000-8000-00000000c001', true, 'client', 'check'),
  ('00000000-0000-4000-8000-0000000051a2', '00000000-0000-4000-8000-0000000041a2', '00000000-0000-4000-8000-00000000c001', true, 'client', 'check');
update public.subjects set status = 'retired' where id = '00000000-0000-4000-8000-0000000051a2';

do $$
declare
  c constant uuid := '00000000-0000-4000-8000-00000000c001';
  s1 constant text := '00000000-0000-4000-8000-0000000051a1';
  s3 constant text := '00000000-0000-4000-8000-0000000051a3';
  got text; want text;
begin
  -- At 14 days (cut Mon 28 Sep 00:00 UTC): w2 (26 in the week, 20+) and w7 (1 at the
  -- cut, 1-4) in the category, w3 (6, 5-19) under Cotopaxi. Every current kind and
  -- every non-retired subject gets a row in each audience-band with videos.
  select string_agg(format('%s|%s|%s|%s|%s|%s', r.audience, r.object_kind,
                           case r.object_id when s1 then 's1' when s3 then 's3' else r.object_id end,
                           r.depth_band, r.k, r.n), E'\n'
                    order by r.audience, r.object_kind, r.object_id, r.depth_band) into got
    from public.market_week_readings(c, '2026-09-07', 14) r;
  want := concat_ws(E'\n',
    'competitor:Cotopaxi|kind|feature_request|5-19|0|1', 'competitor:Cotopaxi|kind|pain_point|5-19|0|1',
    'competitor:Cotopaxi|kind|praise|5-19|0|1', 'competitor:Cotopaxi|kind|question|5-19|1|1',
    'competitor:Cotopaxi|subject|s1|5-19|0|1', 'competitor:Cotopaxi|subject|s3|5-19|0|1',
    'industry-other|kind|feature_request|1-4|0|1', 'industry-other|kind|feature_request|20+|0|1',
    'industry-other|kind|pain_point|1-4|0|1', 'industry-other|kind|pain_point|20+|0|1',
    'industry-other|kind|praise|1-4|1|1', 'industry-other|kind|praise|20+|1|1',
    'industry-other|kind|question|1-4|0|1', 'industry-other|kind|question|20+|0|1',
    'industry-other|subject|s1|1-4|0|1', 'industry-other|subject|s1|20+|1|1',
    'industry-other|subject|s3|1-4|0|1', 'industry-other|subject|s3|20+|0|1');
  if got is distinct from want then raise exception E'market_week_readings FAILED (14 days): got\n%', got; end if;
  -- No cut: w7's second comment (captured 29 Sep) is in, and its question with it;
  -- w7 still has 2 comments, still 1-4.
  select string_agg(format('%s|%s|%s', r.depth_band, r.k, r.n), ' ' order by r.depth_band) into got
    from public.market_week_readings(c, '2026-09-07', null) r
   where r.audience = 'industry-other' and r.object_kind = 'kind' and r.object_id = 'question';
  if got is distinct from '1-4|1|1 20+|0|1' then raise exception 'market_week_readings FAILED (no cut): got %', got; end if;
  -- A cut before the week was captured reads nothing; a mid-week date reads its ISO week.
  if exists (select 1 from public.market_week_readings(c, '2026-09-07', -2)) then
    raise exception 'market_week_readings FAILED: rows before anything was captured';
  end if;
  if (select string_agg(x.f, ',' order by x.f) from (select format('%s|%s|%s|%s|%s|%s', r.audience, r.object_kind, r.object_id, r.depth_band, r.k, r.n) f
        from public.market_week_readings(c, '2026-09-10', 14) r) x)
     is distinct from (select string_agg(x.f, ',' order by x.f) from (select format('%s|%s|%s|%s|%s|%s', r.audience, r.object_kind, r.object_id, r.depth_band, r.k, r.n) f
        from public.market_week_readings(c, '2026-09-07', 14) r) x) then
    raise exception 'market_week_readings FAILED: a mid-week date did not read its ISO week';
  end if;
  -- p_video_ids: w3 only.
  select string_agg(distinct r.audience, ',') into got
    from public.market_week_readings(c, '2026-09-07', 14, array['00000000-0000-4000-8000-0000000000b3']::uuid[]) r;
  if got is distinct from 'competitor:Cotopaxi' then raise exception 'market_week_readings FAILED (p_video_ids): got %', got; end if;
  -- n per audience-band equals market_week_volumes' videos at the same cut, and k <= n.
  if (select sum(x.n) from (select distinct r.audience, r.depth_band, r.n from public.market_week_readings(c, '2026-09-07', 14) r) x)
     <> (select sum(w.videos) from public.market_week_volumes(c, '2026-09-07', '2026-09-14', '2026-09-28 00:00Z') w) then
    raise exception 'market_week_readings FAILED: its n is not market_week_volumes'' videos at the same cut';
  end if;
  if exists (select 1 from public.market_week_readings(c, '2026-09-07', 14) r where r.k > r.n or r.k < 0) then
    raise exception 'market_week_readings FAILED: a row with k outside [0, n]';
  end if;
  raise notice 'ok  market_week_readings: the age cut on k and n alike, three depth bands, current kinds, non-retired subjects, cited comments only, k = 0 rows kept';
end $$;

-- 6. week_line_reads and week_line_points: kept once, never rewritten ------------------
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-00000000c001'; n int;
begin
  insert into public.week_line_reads (client_id, week, age_days, captured_before, read_through_run, conditions, method_version, computed_at)
    values (c, '2026-09-28', 14, '2026-10-19 00:00Z', '00000000-0000-4000-8000-0000000000a1',
            '{"runs_in_week": 1, "runs_after": [1, 1], "late_run": false}', 'weekline_v1', '2026-10-19 07:00Z');
  insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
  select c, '2026-09-28', 14, 'weekline_v1', r.audience, r.object_kind, r.object_id, r.depth_band, r.k, r.n
    from public.market_week_readings(c, '2026-09-07', 14) r;
  -- The writer's second --apply of the same file: ON CONFLICT DO NOTHING, INSERT alone, nothing lands.
  insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
    values (c, '2026-09-28', 14, '2026-10-19 00:00Z', '{}', 'weekline_v1', '2026-10-26 07:00Z')
    on conflict do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'append-only FAILED: a second read of a held key landed'; end if;
  insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
  select c, '2026-09-28', 14, 'weekline_v1', r.audience, r.object_kind, r.object_id, r.depth_band, r.k + 1, r.n + 1
    from public.market_week_readings(c, '2026-09-07', 14) r
  on conflict do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'append-only FAILED: % recomputed points landed over held ones', n; end if;
  -- Without ON CONFLICT the primary key refuses it.
  begin
    insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
      values (c, '2026-09-28', 14, '2026-10-19 00:00Z', '{}', 'weekline_v1', '2026-10-26 07:00Z');
    raise exception 'append-only FAILED: a held read was written twice';
  exception when unique_violation then null;
  end;
  -- A corrected method is a new version, beside the old one; 21 days is a second read.
  insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at) values
    (c, '2026-09-28', 14, '2026-10-19 00:00Z', '{}', 'weekline_v2', '2026-10-19 07:00Z'),
    (c, '2026-09-28', 21, '2026-10-26 00:00Z', '{}', 'weekline_v1', '2026-10-26 07:00Z');
  begin
    update public.week_line_points set k = 0;
    raise exception 'append-only FAILED: service_role updated week_line_points';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.week_line_reads;
    raise exception 'append-only FAILED: service_role deleted from week_line_reads';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  kept once: a second write of a held key inserts nothing, a new method is a new version, no update or delete';
end $$;
reset role;

-- 7. The CHECKs and the foreign key -----------------------------------------------------
do $$
declare c constant uuid := '00000000-0000-4000-8000-00000000c001';
begin
  begin
    insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
      values (c, '2026-10-05', 7, '2026-10-19 00:00Z', '{}', 'v', now());
    raise exception 'CHECK FAILED: an age of 7 days';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
      values (c, '2026-09-30', 14, '2026-10-21 00:00Z', '{}', 'v', now());
    raise exception 'CHECK FAILED: a week that is not a Monday';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
      values (c, '2026-10-05', 14, '2026-10-26 00:00Z', '[]', 'v', now());
    raise exception 'CHECK FAILED: conditions that are not an object';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
      values (c, '2026-10-05', 14, 'weekline_v1', 'industry-other', 'kind', 'praise', '20+', 1, 2);
    raise exception 'FK FAILED: a point with no read';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
      values (c, '2026-09-28', 21, 'weekline_v1', 'industry-other', 'kind', 'praise', '20+', 3, 2);
    raise exception 'CHECK FAILED: k over n';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
      values (c, '2026-09-28', 21, 'weekline_v1', 'industry-other', 'kind', 'praise', '20+', -1, 2);
    raise exception 'CHECK FAILED: a negative k';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
      values (c, '2026-09-28', 21, 'weekline_v1', 'industry-other', 'kind', 'praise', '10-19', 1, 2);
    raise exception 'CHECK FAILED: an unknown depth band';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
      values (c, '2026-09-28', 21, 'weekline_v1', 'industry-other', 'mood', 'positive', '20+', 1, 2);
    raise exception 'CHECK FAILED: an object kind other than kind or subject';
  exception when check_violation then null;
  end;
  raise notice 'ok  CHECKs: ages 14 and 21, Mondays, conditions an object, bands 1-4 5-19 20+, kind or subject, 0 <= k <= n, every point under a read';
end $$;

-- 8. Behaviour: a tenant reads its own points only, writes none, calls no function -----
insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
  values ('00000000-0000-4000-8000-00000000c002', '2026-09-28', 14, '2026-10-19 00:00Z', '{}', 'weekline_v1', now());
insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
  values ('00000000-0000-4000-8000-00000000c002', '2026-09-28', 14, 'weekline_v1', 'industry-other', 'kind', 'praise', '20+', 1, 1);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
do $$
declare n_reads int; n_points int;
begin
  select count(*) into n_reads from public.week_line_reads;
  select count(*) into n_points from public.week_line_points;
  if n_reads <> 3 or n_points <> 18 then
    raise exception 'RLS FAILED: the tenant sees % reads and % points, not its own 3 and 18', n_reads, n_points;
  end if;
  begin
    insert into public.week_line_reads (client_id, week, age_days, captured_before, conditions, method_version, computed_at)
      values ('00000000-0000-4000-8000-00000000c001', '2026-10-05', 14, '2026-10-26 00:00Z', '{}', 'v', now());
    raise exception 'grants FAILED: a tenant session kept a point';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.market_week_volumes('00000000-0000-4000-8000-00000000c001', '2026-08-31', '2026-10-05');
    raise exception 'grants FAILED: a tenant session executed market_week_volumes';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  a tenant session reads its own reads and points only, keeps none, and cannot call the functions';
end $$;
reset role;

-- A cascade still works: a read takes its points; a tenant takes both.
do $$
declare n int;
begin
  delete from public.week_line_reads where client_id = '00000000-0000-4000-8000-00000000c001' and method_version = 'weekline_v1' and age_days = 14;
  select count(*) into n from public.week_line_points where client_id = '00000000-0000-4000-8000-00000000c001';
  if n <> 0 then raise exception 'cascade FAILED: % points outlived their read', n; end if;
  delete from public.clients where id = '00000000-0000-4000-8000-00000000c002';
  select count(*) into n from public.week_line_points where client_id = '00000000-0000-4000-8000-00000000c002';
  if n <> 0 then raise exception 'cascade FAILED: points outlived their tenant'; end if;
  raise notice 'ok  the foreign-key cascades still remove a read''s points and a deleted tenant''s rows';
end $$;

rollback;
\echo 'mf4-checks: all passed'
