-- MF2 on the throwaway cluster (20261005090000_market_first_s2.sql): every
-- table's RLS, policy, grants and CHECKs, every function's grants, and what
-- each function returns, run after the file has been applied twice:
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/mf2-checks.sql
--
-- Every check raises on failure, so psql -v ON_ERROR_STOP=1 exits non-zero; the
-- synthetic rows live inside one transaction that is rolled back.
--
-- The synthetic tenant is made up (ids, words and counts): its numbers are the
-- test's own arithmetic, a few videos and comments in September 2026, not a
-- claim about any tenant. The parity half compares lens_readings with the five
-- month functions it copies, on the same rows, so it holds whatever the rows.
\set ON_ERROR_STOP 1
begin;
-- Every instant below is written in UTC, and the session runs fourteen hours
-- ahead of it, so a function that read a date in the session's zone would put
-- 1 Oct 00:00 UTC in September and fail here.
set local time zone 'Pacific/Kiritimati';

-- 1. The two tables: RLS on, tenant SELECT only, service role append-only --------
do $$
declare t text; p text;
begin
  foreach t in array array['comparability_checks', 'brand_mentions'] loop
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
    if not has_any_column_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'tables FAILED: authenticated cannot read any column of %', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t) <> 1
       or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT'
                        and roles = '{authenticated}' and qual = '(client_id = get_my_client_id())') then
      raise exception 'tables FAILED: % does not carry exactly one get_my_client_id() select policy for authenticated', t;
    end if;
  end loop;
  -- Every column a tenant can read, and none it cannot (neither table holds operator words).
  if (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'comparability_checks'
        and not has_column_privilege('authenticated', 'public.comparability_checks', c.column_name, 'SELECT')) <> 0
     or (select count(*) from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'brand_mentions'
        and not has_column_privilege('authenticated', 'public.brand_mentions', c.column_name, 'SELECT')) <> 0 then
    raise exception 'tables FAILED: a column of comparability_checks or brand_mentions is not readable by its tenant';
  end if;
  raise notice 'ok  tables: RLS on, one get_my_client_id() select policy each, tenant column SELECT only, service role select and insert only';
end $$;

-- 2. The functions: definer, pinned search_path, service role only --------------------
do $$
declare f text;
begin
  foreach f in array array['public.lens_readings(uuid, date, uuid, uuid[], int, timestamptz)',
                           'public.brand_mention_candidates(uuid, text, date, date)',
                           'public.update_arrivals(uuid, uuid, date[])'] loop
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

-- 3. sent_figures: the three new kinds, and nothing else ---------------------------------
insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-00000000c001', 'MF2 check'),
  ('00000000-0000-4000-8000-00000000c002', 'MF2 other tenant');
insert into public.report_snapshots (id, client_id, kind, ref, title, data) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000c001', 'report', '{}', 'check', '{}');
do $$
declare k text;
begin
  foreach k in array array['subject', 'theme', 'rival', 'kind', 'figure', 'mood', 'brand', 'denominator'] loop
    insert into public.sent_figures (client_id, snapshot_id, month, audience, object_kind, object_id, label, value, unit,
                                     denominator, month_status, artefact, reading_at)
    values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000f1', '2026-09-01', 'industry-other',
            k, 'x', 'x', 1, 'videos', 'the market''s videos', 'filling', 'monthly', now());
  end loop;
  begin
    insert into public.sent_figures (client_id, snapshot_id, month, audience, object_kind, object_id, label, value, unit,
                                     denominator, month_status, artefact, reading_at)
    values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000f1', '2026-09-01', 'industry-other',
            'bogus', 'y', 'y', 1, 'videos', 'x', 'filling', 'monthly', now());
    raise exception 'sent_figures FAILED: an unknown object kind was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from pg_constraint where conrelid = 'public.sent_figures'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%object_kind%') <> 1 then
    raise exception 'sent_figures FAILED: not exactly one object_kind CHECK';
  end if;
  raise notice 'ok  sent_figures takes subject, theme, rival, kind, figure, mood, brand and denominator, and refuses an unknown kind';
end $$;

-- 4. The synthetic tenant ----------------------------------------------------------------
-- Runs: a1 completed 13 Sep, a2 completed 20 Sep, a3 failed 24 Sep, a4 partial
-- 27 Sep, a5 still running (4 Oct); x1 the other tenant's.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'owner@check.example'),
  ('00000000-0000-4000-8000-0000000000e2', 'other@check.example');
insert into public.users (id, client_id, full_name, email, role) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000c001', 'Owner', 'owner@check.example', 'owner'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000c002', 'Other', 'other@check.example', 'owner');
insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'completed', '2026-09-13 04:00Z', '2026-09-13 06:00Z'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c001', 'completed', '2026-09-20 04:00Z', '2026-09-20 06:00Z'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000c001', 'failed',    '2026-09-24 04:00Z', '2026-09-24 05:00Z'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000c001', 'partial',   '2026-09-27 04:00Z', '2026-09-27 06:00Z'),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-00000000c001', 'running',   '2026-10-04 04:00Z', null),
  ('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-00000000c002', 'completed', '2026-09-13 04:00Z', '2026-09-13 06:00Z');
-- Videos. scraped_at is the first-stored stamp.
--   b1 category, full, analysed by a2, positive (audience), stored by a1
--   b2 category, full, analysed by a2, negative (no source: the full lane reads as audience), stored by a2
--   b3 filed under Cotopaxi, full, mixed (framing), stored by a1
--   b4 the client's own post, full, positive, stored by a1
--   b5 category, claims lane, neutral (no source: the claims lane reads as framing), stored by a1
--   b6 category, full, analysed by a4, positive, 20 September comments, stored by a4
--   b7 category, never analysed (no lane), stored by the failed a3
--   b9 category, full, only an August comment
--   b8 the other tenant's
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name,
                           analyzed_lane, analyzed_run_id, sentiment, sentiment_source, caption, hashtags, transcript,
                           transcript_en, ocr_text, upload_date, scraped_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y1', 'u', 'packlight', false, false, null,
   'full', '00000000-0000-4000-8000-0000000000a2', 'positive', 'audience', 'My Cotopaxi Allpa after a year', '{}', null,
   null, null, '2026-09-01', '2026-09-13 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y2', 'u', 'carryon', false, false, null,
   'full', '00000000-0000-4000-8000-0000000000a2', 'negative', null, 'Airline size rules', '{}', null,
   null, null, '2026-09-15', '2026-09-20 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-00000000c001', 'tiktok', 't3', 'u', 'cotopaxi', false, true, 'Cotopaxi',
   'full', '00000000-0000-4000-8000-0000000000a1', 'mixed', 'framing', 'New drop', array['#cotopaxi', '#travel'], null,
   null, null, '2026-09-08', '2026-09-13 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-00000000c001', 'instagram', 'i4', 'u', 'sealandgear', true, false, null,
   'full', '00000000-0000-4000-8000-0000000000a1', 'positive', 'audience', 'Sealand x Cotopaxi? Not quite', '{}', null,
   null, null, '2026-09-09', '2026-09-13 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y5', 'u', 'haul', false, false, null,
   'claims_only', '00000000-0000-4000-8000-0000000000a1', 'neutral', null, 'cotopaxi haul', '{}', null,
   null, null, '2026-09-05', '2026-09-13 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-00000000c001', 'reddit', 'r6', 'u', 'r/onebag', false, false, null,
   'full', '00000000-0000-4000-8000-0000000000a4', 'positive', 'audience', 'Which daypack for Japan', '{}',
   repeat('We walked every day and the bag held up fine. ', 6) || 'Then I switched to the COTOPAXI Batac and never looked back. ' || repeat('Pack light. ', 10),
   null, null, '2026-08-20', '2026-09-27 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b7', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y7', 'u', 'late', false, false, null,
   null, null, null, null, 'cotopaxi late find', '{}', null,
   null, null, '2026-09-20', '2026-09-24 04:30Z'),
  ('00000000-0000-4000-8000-0000000000b9', '00000000-0000-4000-8000-00000000c001', 'youtube', 'y9', 'u', 'august', false, false, null,
   'full', '00000000-0000-4000-8000-0000000000a1', 'positive', 'audience', 'august only', '{}', null,
   'a Cotopaxi in the translation', 'COTOPAXI on screen', '2026-08-01', '2026-09-13 05:00Z'),
  ('00000000-0000-4000-8000-0000000000b8', '00000000-0000-4000-8000-00000000c002', 'youtube', 'y1', 'u', 'other', false, false, null,
   'full', '00000000-0000-4000-8000-0000000000a9', 'positive', 'audience', 'cotopaxi for the other tenant', '{}', null,
   null, null, '2026-09-01', '2026-09-13 05:00Z');

-- Comments: (video, comment_id, comment_date, created_at = first capture).
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
select x.id::uuid, x.client::uuid, x.run::uuid, x.platform, x.video_id, x.cid, (x.at || ' 00:00Z')::timestamptz, x.cap::timestamptz, x.body
from (values
  -- b1: 2 and 10 Sep captured by a1, 18 Sep captured by a2, and one August comment naming Cotopaxi
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y1', 'y1-a', '2026-09-02', '2026-09-13 05:10Z', 'love it'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y1', 'y1-b', '2026-09-10', '2026-09-13 05:10Z', 'the zip broke'),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y1', 'y1-c', '2026-09-18', '2026-09-20 05:10Z', 'what size is it?'),
  ('00000000-0000-4000-8000-000000001104', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y1', 'y1-d', '2026-08-25', '2026-09-13 05:10Z', 'my Cotopaxi did the same'),
  -- b2: two on 16 and 17 Sep captured by a2, one naming Cotopaxi
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y2', 'y2-a', '2026-09-16', '2026-09-20 05:10Z', 'I use the cotopaxi 14 sleeve'),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'youtube', 'y2', 'y2-b', '2026-09-17', '2026-09-20 05:10Z', 'too big for Ryanair'),
  -- and one on 21 Sep captured by the FAILED a3: it came in with the next update, a4
  ('00000000-0000-4000-8000-000000001203', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a3', 'youtube', 'y2', 'y2-c', '2026-09-21', '2026-09-24 04:40Z', 'ok'),
  -- b4: two, captured by a1
  ('00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'instagram', 'i4', 'i4-a', '2026-09-10', '2026-09-13 05:10Z', 'nice'),
  ('00000000-0000-4000-8000-000000001402', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'instagram', 'i4', 'i4-b', '2026-09-11', '2026-09-13 05:10Z', 'nice too'),
  -- b5 (claims lane): two, captured by a1
  ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y5', 'y5-a', '2026-09-10', '2026-09-13 05:10Z', 'cotopaxi!'),
  ('00000000-0000-4000-8000-000000001502', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y5', 'y5-b', '2026-09-10', '2026-09-13 05:10Z', 'ok'),
  -- b7 (never analysed): three, captured by the failed a3
  ('00000000-0000-4000-8000-000000001701', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a3', 'youtube', 'y7', 'y7-a', '2026-09-23', '2026-09-24 04:40Z', 'cotopaxi'),
  ('00000000-0000-4000-8000-000000001702', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a3', 'youtube', 'y7', 'y7-b', '2026-09-23', '2026-09-24 04:40Z', 'a'),
  ('00000000-0000-4000-8000-000000001703', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a3', 'youtube', 'y7', 'y7-c', '2026-09-23', '2026-09-24 04:40Z', 'b'),
  -- b9: one August comment only
  ('00000000-0000-4000-8000-000000001901', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'youtube', 'y9', 'y9-a', '2026-08-12', '2026-09-13 05:10Z', 'fine'),
  -- the other tenant: two September comments on its y1
  ('00000000-0000-4000-8000-000000001801', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000a9', 'youtube', 'y1', 'o-a', '2026-09-05', '2026-09-13 05:10Z', 'cotopaxi'),
  ('00000000-0000-4000-8000-000000001802', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000a9', 'youtube', 'y1', 'o-b', '2026-09-06', '2026-09-13 05:10Z', 'x')
) x(id, client, run, platform, video_id, cid, at, cap, body);
-- b3: twelve on 10 Sep, captured by a1; the first is cited.
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
select ('00000000-0000-4000-8000-0000000013' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-00000000c001',
       '00000000-0000-4000-8000-0000000000a1', 'tiktok', 't3', 't3-' || g, '2026-09-10 00:00Z', '2026-09-13 05:10Z', 'so good'
from generate_series(1, 12) g;
-- b6: twenty on 26 Sep captured by a4, and two on 1 Oct captured by the running a5.
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
select ('00000000-0000-4000-8000-0000000016' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-00000000c001',
       '00000000-0000-4000-8000-0000000000a4', 'reddit', 'r6', 'r6-' || g, '2026-09-26 00:00Z', '2026-09-27 05:10Z', 'where is it made?'
from generate_series(1, 20) g;
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
select ('00000000-0000-4000-8000-0000000016' || (90 + g)::text)::uuid, '00000000-0000-4000-8000-00000000c001',
       '00000000-0000-4000-8000-0000000000a5', 'reddit', 'r6', 'r6-oct-' || g, '2026-10-01 00:00Z', '2026-10-04 05:00Z', 'october'
from generate_series(1, 2) g;

-- Insights. Current = run_id equals the video's analyzed_run_id.
--   i1 praise on b1 (current), cites 2 Sep       i2 question on b1 (current), cites 18 Sep
--   i3 praise on b2 (current), cites 16 Sep      i4 praise on b3 (current), cites b3's first
--   i5 praise on b4 (current), cites i4-a        i6 question on b6 (current), cites r6-1
--   i7 feature_request on b6 (current), on camera only (no comment evidence)
--   i8 pain_point on b1, a SUPERSEDED row (run a1, b1 is analysed by a2): not in the
--      current view, so no kind reading; a subject reads the base table, so it counts there
insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id) values
  ('00000000-0000-4000-8000-0000000021a1', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000021a2', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'question',        't', 'd', '00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000021a3', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000021a4', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000021a5', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'praise',          't', 'd', '00000000-0000-4000-8000-0000000000b4'),
  ('00000000-0000-4000-8000-0000000021a6', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a4', 'question',        't', 'd', '00000000-0000-4000-8000-0000000000b6'),
  ('00000000-0000-4000-8000-0000000021a7', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a4', 'feature_request', 't', 'd', '00000000-0000-4000-8000-0000000000b6'),
  ('00000000-0000-4000-8000-0000000021a8', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'pain_point',      't', 'd', '00000000-0000-4000-8000-0000000000b1');
insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id) values
  ('00000000-0000-4000-8000-0000000021a1', '00000000-0000-4000-8000-000000001101', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000021a2', '00000000-0000-4000-8000-000000001103', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000021a3', '00000000-0000-4000-8000-000000001201', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000021a4', '00000000-0000-4000-8000-000000001301', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000021a5', '00000000-0000-4000-8000-000000001401', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000021a6', '00000000-0000-4000-8000-000000001601', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000021a7', null,                                   'q', 'video',   '00000000-0000-4000-8000-0000000000b6'),
  ('00000000-0000-4000-8000-0000000021a8', '00000000-0000-4000-8000-000000001102', 'q', 'comment', null);

-- Subjects: s1 active (members i1, i3, i7, i8); s2 retired (member i2, never read);
-- s3 active with a judged NO on i6 (never read).
insert into public.subjects (id, client_id, name, origin, status) values
  ('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-00000000c001', 'Looks and style', 'client', 'active'),
  ('00000000-0000-4000-8000-0000000031a2', '00000000-0000-4000-8000-00000000c001', 'Retired one', 'client', 'active'),
  ('00000000-0000-4000-8000-0000000031a3', '00000000-0000-4000-8000-00000000c001', 'Judged no', 'client', 'active');
insert into public.subject_memberships (subject_id, audience_insight_id, client_id, member, method, judge_version) values
  ('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-0000000021a1', '00000000-0000-4000-8000-00000000c001', true,  'client', 'check'),
  ('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-0000000021a3', '00000000-0000-4000-8000-00000000c001', true,  'client', 'check'),
  ('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-0000000021a7', '00000000-0000-4000-8000-00000000c001', true,  'client', 'check'),
  ('00000000-0000-4000-8000-0000000031a1', '00000000-0000-4000-8000-0000000021a8', '00000000-0000-4000-8000-00000000c001', true,  'client', 'check'),
  ('00000000-0000-4000-8000-0000000031a2', '00000000-0000-4000-8000-0000000021a2', '00000000-0000-4000-8000-00000000c001', true,  'client', 'check'),
  ('00000000-0000-4000-8000-0000000031a3', '00000000-0000-4000-8000-0000000021a6', '00000000-0000-4000-8000-00000000c001', false, 'client', 'check');
update public.subjects set status = 'retired' where id = '00000000-0000-4000-8000-0000000031a2';

-- Themes: under run a4, d1 = i1, i3, i4 (a Cotopaxi video) and i7 (on camera), d2 = i6;
-- under run a2, d1 = i1 only (so p_run picks the clustering).
insert into public.theme_registry (id, client_id, bucket, canonical_label) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000c001', 'industry-other', 'one'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000c001', 'industry-other', 'two');
insert into public.theme_observations (theme_id, client_id, run_id, label, member_insight_ids, match_kind) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a4', 'one',
   array['00000000-0000-4000-8000-0000000021a1', '00000000-0000-4000-8000-0000000021a3', '00000000-0000-4000-8000-0000000021a4',
         '00000000-0000-4000-8000-0000000021a7']::uuid[], 'new'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a4', 'two',
   array['00000000-0000-4000-8000-0000000021a6']::uuid[], 'new'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a2', 'one',
   array['00000000-0000-4000-8000-0000000021a1']::uuid[], 'new');

-- 5. lens_readings with its defaults IS the five month functions -----------------------
do $$
declare
  c   constant uuid := '00000000-0000-4000-8000-00000000c001';
  run constant uuid := '00000000-0000-4000-8000-0000000000a4';
  t0  constant timestamptz := '2026-09-01 00:00Z';
  t1  constant timestamptz := '2026-10-01 00:00Z';
  got text; want text;
begin
  select string_agg(format('%s|%s|%s|%s|%s', l.audience, l.object_kind, l.object_id, l.k, l.n), E'\n'
                    order by l.audience, l.object_kind, l.object_id) into got
    from public.lens_readings(c, '2026-09-17', run) l;
  with d as (
    select audience, videos, comments from public.monthly_denominators(c, t0, t1)
  ),
  want_rows as (
    select audience, 'denominator' as object_kind, 'videos' as object_id, videos as k, videos as n from d
    union all
    select audience, 'denominator', 'comments', comments, comments from d
    union all
    select s.audience, 'subject', s.subject_id::text, s.videos, coalesce((select videos from d where d.audience = s.audience), 0)
      from public.monthly_subject_readings(c, t0, t1) s
    union all
    select r.audience, 'kind', r.kind, r.videos, coalesce((select videos from d where d.audience = r.audience), 0)
      from public.monthly_kind_readings(c, t0, t1) r
    union all
    select r.audience, 'theme', r.theme_id::text, r.videos, coalesce((select videos from d where d.audience = r.audience), 0)
      from public.monthly_theme_readings(c, run, t0, t1) r where r.audience = 'industry-other'
    union all
    select m.audience, 'mood', x.mood, x.k, m.judged
      from public.monthly_audience_stats(c, null, t0, t1) m
      cross join lateral (values ('positive', m.positive), ('negative', m.negative), ('neutral', m.neutral), ('mixed', m.mixed)) x(mood, k)
    union all
    select m.audience, 'mood', 'framing', m.judged_framing, m.judged + m.judged_framing
      from public.monthly_audience_stats(c, null, t0, t1) m
  )
  select string_agg(format('%s|%s|%s|%s|%s', audience, object_kind, object_id, k, n), E'\n'
                    order by audience, object_kind, object_id) into want
    from want_rows;
  if got is distinct from want then
    raise exception E'lens_readings FAILED: it is not the month functions on the same rows.\nlens:\n%\nmonth functions:\n%', got, want;
  end if;
  -- And the arithmetic by hand, so the parity is not two copies of one mistake.
  want := concat_ws(E'\n',
    'client|denominator|comments|2|2', 'client|denominator|videos|1|1', 'client|kind|praise|1|1',
    'client|mood|framing|0|1', 'client|mood|mixed|0|1', 'client|mood|negative|0|1', 'client|mood|neutral|0|1', 'client|mood|positive|1|1',
    'competitor:Cotopaxi|denominator|comments|12|12', 'competitor:Cotopaxi|denominator|videos|1|1', 'competitor:Cotopaxi|kind|praise|1|1',
    'competitor:Cotopaxi|mood|framing|1|1', 'competitor:Cotopaxi|mood|mixed|0|0', 'competitor:Cotopaxi|mood|negative|0|0',
    'competitor:Cotopaxi|mood|neutral|0|0', 'competitor:Cotopaxi|mood|positive|0|0',
    'industry-other|denominator|comments|26|26', 'industry-other|denominator|videos|3|3',
    'industry-other|kind|feature_request|1|3', 'industry-other|kind|praise|2|3', 'industry-other|kind|question|2|3',
    'industry-other|mood|framing|1|4', 'industry-other|mood|mixed|0|3', 'industry-other|mood|negative|1|3',
    'industry-other|mood|neutral|0|3', 'industry-other|mood|positive|2|3',
    'industry-other|subject|00000000-0000-4000-8000-0000000031a1|3|3',
    'industry-other|theme|00000000-0000-4000-8000-0000000000d1|3|3', 'industry-other|theme|00000000-0000-4000-8000-0000000000d2|1|3');
  if got is distinct from want then
    raise exception E'lens_readings FAILED (by hand): got\n%', got;
  end if;
  -- Themes come from p_run's clustering only, and none without a run.
  select string_agg(l.object_id || '=' || l.k, ' ') into got
    from public.lens_readings(c, '2026-09-01', '00000000-0000-4000-8000-0000000000a2') l where l.object_kind = 'theme';
  if got is distinct from '00000000-0000-4000-8000-0000000000d1=1' then raise exception 'lens_readings FAILED (p_run): got %', got; end if;
  if exists (select 1 from public.lens_readings(c, '2026-09-01', null) l where l.object_kind = 'theme') then
    raise exception 'lens_readings FAILED: theme rows with no run';
  end if;
  -- A month with nothing returns nothing; another tenant's rows are its own.
  if exists (select 1 from public.lens_readings(c, '2026-11-01', run)) then raise exception 'lens_readings FAILED: rows in an empty month'; end if;
  select string_agg(l.audience || '|' || l.object_kind || '|' || l.object_id || '|' || l.k, ' ' order by l.object_kind, l.object_id) into got
    from public.lens_readings('00000000-0000-4000-8000-00000000c002', '2026-09-01', null) l where l.object_kind = 'denominator';
  if got is distinct from 'industry-other|denominator|comments|2 industry-other|denominator|videos|1' then
    raise exception 'lens_readings FAILED (tenant): got %', got;
  end if;
  raise notice 'ok  lens_readings with its defaults equals monthly_denominators, _subject_, _kind_, _theme_readings and the mood half of monthly_audience_stats, row for row';
end $$;

-- 6. lens_readings' three filters cut k and n together ----------------------------------
do $$
declare
  c   constant uuid := '00000000-0000-4000-8000-00000000c001';
  run constant uuid := '00000000-0000-4000-8000-0000000000a4';
  got text;
begin
  -- p_video_ids: b1 and b6 only.
  select string_agg(format('%s|%s|%s|%s|%s', l.audience, l.object_kind, l.object_id, l.k, l.n), ' '
                    order by l.audience, l.object_kind, l.object_id) into got
    from public.lens_readings(c, '2026-09-01', run,
           array['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b6']::uuid[]) l;
  if got is distinct from concat_ws(' ',
      'industry-other|denominator|comments|23|23', 'industry-other|denominator|videos|2|2',
      'industry-other|kind|feature_request|1|2', 'industry-other|kind|praise|1|2', 'industry-other|kind|question|2|2',
      'industry-other|mood|framing|0|2', 'industry-other|mood|mixed|0|2', 'industry-other|mood|negative|0|2',
      'industry-other|mood|neutral|0|2', 'industry-other|mood|positive|2|2',
      'industry-other|subject|00000000-0000-4000-8000-0000000031a1|2|2',
      'industry-other|theme|00000000-0000-4000-8000-0000000000d1|2|2', 'industry-other|theme|00000000-0000-4000-8000-0000000000d2|1|2') then
    raise exception 'lens_readings FAILED (p_video_ids): got %', got;
  end if;
  -- p_min_dated_comments 20: only b6 (20 in September) is dense enough; b3 has 12.
  select string_agg(format('%s|%s|%s|%s|%s', l.audience, l.object_kind, l.object_id, l.k, l.n), ' '
                    order by l.audience, l.object_kind, l.object_id) into got
    from public.lens_readings(c, '2026-09-01', run, null, 20) l;
  if got is distinct from concat_ws(' ',
      'industry-other|denominator|comments|20|20', 'industry-other|denominator|videos|1|1',
      'industry-other|kind|feature_request|1|1', 'industry-other|kind|question|1|1',
      'industry-other|mood|framing|0|1', 'industry-other|mood|mixed|0|1', 'industry-other|mood|negative|0|1',
      'industry-other|mood|neutral|0|1', 'industry-other|mood|positive|1|1',
      'industry-other|subject|00000000-0000-4000-8000-0000000031a1|1|1',
      'industry-other|theme|00000000-0000-4000-8000-0000000000d1|1|1', 'industry-other|theme|00000000-0000-4000-8000-0000000000d2|1|1') then
    raise exception 'lens_readings FAILED (p_min_dated_comments): got %', got;
  end if;
  -- p_captured_before 20 Sep 00:00: b1 keeps 2 and 10 Sep (its 18 Sep comment, which
  -- carries the question, came later), b2 and b6 were not captured yet; b3, b4, b5 stay.
  select string_agg(format('%s|%s|%s|%s|%s', l.audience, l.object_kind, l.object_id, l.k, l.n), ' '
                    order by l.audience, l.object_kind, l.object_id) into got
    from public.lens_readings(c, '2026-09-01', run, null, 1, '2026-09-20 00:00Z') l where l.audience = 'industry-other';
  if got is distinct from concat_ws(' ',
      'industry-other|denominator|comments|2|2', 'industry-other|denominator|videos|1|1',
      'industry-other|kind|praise|1|1',
      'industry-other|mood|framing|1|2', 'industry-other|mood|mixed|0|1', 'industry-other|mood|negative|0|1',
      'industry-other|mood|neutral|0|1', 'industry-other|mood|positive|1|1',
      'industry-other|subject|00000000-0000-4000-8000-0000000031a1|1|1',
      'industry-other|theme|00000000-0000-4000-8000-0000000000d1|1|1') then
    raise exception 'lens_readings FAILED (p_captured_before): got %', got;
  end if;
  -- A floor of 0 or null is a floor of 1: a video with no comment in the month is never in it.
  if (select count(*) from public.lens_readings(c, '2026-09-01', run, null, 0)) <> (select count(*) from public.lens_readings(c, '2026-09-01', run))
     or (select count(*) from public.lens_readings(c, '2026-09-01', run, null, null)) <> (select count(*) from public.lens_readings(c, '2026-09-01', run)) then
    raise exception 'lens_readings FAILED: a floor under 1 changed the reading';
  end if;
  -- k never exceeds n anywhere.
  if exists (select 1 from public.lens_readings(c, '2026-09-01', run) l where l.k > l.n or l.k < 0) then
    raise exception 'lens_readings FAILED: a row with k outside [0, n]';
  end if;
  raise notice 'ok  lens_readings: p_video_ids, p_min_dated_comments and p_captured_before cut k and n together';
end $$;

-- 7. update_arrivals: what came in with each update, adding up to the month ------------
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-00000000c001';
  got text;
begin
  select string_agg(a.month || '=' || a.videos_first_read || '/' || a.comments_captured, ' ' order by a.month) into got
    from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000a1', array['2026-09-15', '2026-08-01', '2026-09-01']::date[]) a;
  if got is distinct from '2026-08-01=2/2 2026-09-01=2/14' then raise exception 'update_arrivals FAILED (a1, the first update): got %', got; end if;
  select string_agg(a.month || '=' || a.videos_first_read || '/' || a.comments_captured, ' ' order by a.month) into got
    from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000a2', array['2026-09-01']::date[]) a;
  if got is distinct from '2026-09-01=1/3' then raise exception 'update_arrivals FAILED (a2): got %', got; end if;
  -- a4's span starts at a2's finish: the failed a3 is not an update, so the b2 comment
  -- it captured came in with a4, and what it stored (b7, never read) is not the market.
  -- The October comments came after a4 finished.
  select string_agg(a.month || '=' || a.videos_first_read || '/' || a.comments_captured, ' ' order by a.month) into got
    from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000a4', array['2026-09-01', '2026-10-01']::date[]) a;
  if got is distinct from '2026-09-01=1/21 2026-10-01=0/0' then raise exception 'update_arrivals FAILED (a4): got %', got; end if;
  select string_agg(a.month || '=' || a.videos_first_read || '/' || a.comments_captured, ' ' order by a.month) into got
    from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000a3', array['2026-09-01']::date[]) a;
  if got is distinct from '2026-09-01=0/1' then raise exception 'update_arrivals FAILED (the failed a3): got %', got; end if;
  -- A run still going reads what has arrived so far.
  select string_agg(a.month || '=' || a.videos_first_read || '/' || a.comments_captured, ' ' order by a.month) into got
    from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000a5', array['2026-10-01']::date[]) a;
  if got is distinct from '2026-10-01=0/2' then raise exception 'update_arrivals FAILED (the running a5): got %', got; end if;
  -- Update after update, the counts add to the month's market (the category plus the
  -- rival audiences in lens_readings: 3 + 1 videos, 26 + 12 comments).
  select sum(a.videos_first_read) || '/' || sum(a.comments_captured) into got
    from unnest(array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
                      '00000000-0000-4000-8000-0000000000a4']::uuid[]) r(id),
         lateral public.update_arrivals(c, r.id, array['2026-09-01']::date[]) a;
  if got is distinct from (select sum(l.k) filter (where l.object_id = 'videos') || '/' || sum(l.k) filter (where l.object_id = 'comments')
                             from public.lens_readings(c, '2026-09-01', null) l
                            where l.object_kind = 'denominator' and l.audience <> 'client') then
    raise exception 'update_arrivals FAILED: the updates add to % and not to the month''s market', got;
  end if;
  -- Another tenant's run, or a run that is not there, returns no rows at all.
  if exists (select 1 from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000a9', array['2026-09-01']::date[]))
     or exists (select 1 from public.update_arrivals(c, '00000000-0000-4000-8000-0000000000ff', array['2026-09-01']::date[]))
     or exists (select 1 from public.update_arrivals('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000a1', array['2026-09-01']::date[])) then
    raise exception 'update_arrivals FAILED: rows for a run that is not the tenant''s';
  end if;
  raise notice 'ok  update_arrivals: the span since the previous update, market only, adding up to the month; nothing for another tenant''s run';
end $$;

-- 8. brand_mention_candidates: content and comments, readable videos, the window ------
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-00000000c001';
  got text;
begin
  select string_agg(right(m.video_id::text, 2) || ':' || m.source || ':' || coalesce(m.field, '-') || ':' || coalesce(m.comment_month::text, '-'), ' '
                    order by m.video_id, m.source, m.field) into got
    from public.brand_mention_candidates(c, 'cotopaxi', '2026-09-01', '2026-10-01') m;
  -- b1 caption, b2 a September comment, b3 account and hashtags, b4 (the client's own
  -- post) caption, b6 transcript. Not b5 (claims lane), not b7 (never read), not b9
  -- (no September comment), not b1's August comment, not the other tenant's video.
  if got is distinct from 'b1:content:caption:- b2:comment:-:2026-09-01 b3:content:account:- b3:content:hashtags:- b4:content:caption:- b6:content:transcript:-' then
    raise exception 'brand_mention_candidates FAILED: got %', got;
  end if;
  select string_agg(right(m.video_id::text, 2) || ':' || m.source || ':' || coalesce(m.field, '-'), ' ' order by m.video_id, m.source, m.field) into got
    from public.brand_mention_candidates(c, 'COTOPAXI', '2026-08-01', '2026-09-01') m;
  if got is distinct from 'b1:comment:- b1:content:caption b9:content:ocr b9:content:transcript_en' then
    raise exception 'brand_mention_candidates FAILED (August, case-insensitive): got %', got;
  end if;
  -- The excerpt: at most 160 characters, around the first hit.
  select m.excerpt into got from public.brand_mention_candidates(c, 'cotopaxi', '2026-09-01', '2026-10-01') m where m.field = 'transcript';
  if length(got) > 160 or got not like '%COTOPAXI Batac%' or got like 'We walked every day%' then
    raise exception 'brand_mention_candidates FAILED (excerpt): %', got;
  end if;
  if exists (select 1 from public.brand_mention_candidates(c, '', '2026-09-01', '2026-10-01'))
     or exists (select 1 from public.brand_mention_candidates(c, null, '2026-09-01', '2026-10-01')) then
    raise exception 'brand_mention_candidates FAILED: an empty pattern matched';
  end if;
  raise notice 'ok  brand_mention_candidates: six content fields and the window''s comments, readable videos only, excerpt under 160';
end $$;

-- 9. brand_mentions: the key, the shape, the unique index, the cascade -----------------
do $$
declare c constant uuid := '00000000-0000-4000-8000-00000000c001';
begin
  insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version) values
    (c, '00000000-0000-4000-8000-0000000000b1', 'client', 'content', 'caption', 'rule', 'brands_v1'),
    (c, '00000000-0000-4000-8000-0000000000b1', '7b0f6c1e-0000-4000-8000-000000000001', 'content', 'caption', 'rule', 'brands_v1'),
    (c, '00000000-0000-4000-8000-0000000000b1', 'watched:peak-design', 'content', 'ocr', 'rule', 'brands_v1'),
    (c, '00000000-0000-4000-8000-0000000000b1', 'client', 'content', 'transcript', 'rule', 'brands_v2');
  insert into public.brand_mentions (client_id, video_id, brand_key, source, comment_id, comment_month, method, rule_version) values
    (c, '00000000-0000-4000-8000-0000000000b2', 'client', 'comment', '00000000-0000-4000-8000-000000001201', '2026-09-01', 'rule', 'brands_v1'),
    (c, '00000000-0000-4000-8000-0000000000b2', 'client', 'comment', '00000000-0000-4000-8000-000000001202', '2026-09-01', 'rule', 'brands_v1');
  -- One content row per video, brand and version, whatever the field.
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b1', 'client', 'content', 'transcript', 'rule', 'brands_v1');
    raise exception 'brand_mentions FAILED: a second content row for one video, brand and version';
  exception when unique_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, comment_id, comment_month, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b2', 'client', 'comment', '00000000-0000-4000-8000-000000001201', '2026-09-01', 'confirmed', 'brands_v1');
    raise exception 'brand_mentions FAILED: a second row for one comment, brand and version';
  exception when unique_violation then null;
  end;
  -- The CHECKs.
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b1', 'competitor:Cotopaxi', 'content', 'caption', 'rule', 'x');
    raise exception 'brand_mentions FAILED: an audience string was taken as a brand key';
  exception when check_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b1', 'client', 'content', 'ocr_text', 'rule', 'x');
    raise exception 'brand_mentions FAILED: a content field outside the six';
  exception when check_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, comment_id, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b2', 'client', 'comment', '00000000-0000-4000-8000-000000001201', 'rule', 'x');
    raise exception 'brand_mentions FAILED: a comment row with no month';
  exception when check_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, comment_id, comment_month, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b2', 'client', 'content', 'caption', '00000000-0000-4000-8000-000000001201', '2026-09-01', 'rule', 'x');
    raise exception 'brand_mentions FAILED: a content row naming a comment';
  exception when check_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, comment_id, comment_month, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b2', 'client', 'comment', '00000000-0000-4000-8000-000000001202', '2026-09-17', 'rule', 'x');
    raise exception 'brand_mentions FAILED: a comment month that is not a month''s first day';
  exception when check_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b1', 'client', 'content', 'caption', 'maybe', 'x');
    raise exception 'brand_mentions FAILED: an unknown method';
  exception when check_violation then null;
  end;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
      values (c, '00000000-0000-4000-8000-0000000000b1', 'client', 'content', 'caption', 'rule', '');
    raise exception 'brand_mentions FAILED: an empty rule version';
  exception when check_violation then null;
  end;
  raise notice 'ok  brand_mentions: identity keys only, one content row per video, brand and version, one row per comment, content and comment shapes';
end $$;

-- 10. comparability_checks: the vocabularies and the sides -----------------------------
do $$
declare c constant uuid := '00000000-0000-4000-8000-00000000c001';
begin
  insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id,
                                           k_prev, n_prev, k_curr, n_curr, population_makers, population_noise,
                                           verdict, outcome, method_version, computed_at) values
    (c, '2026-08-01', '2026-09-01', 'same_searches_clean', 'kind', 'feature_request', 3, 40, 9, 50, 0.3, 0.1,
     '{"state": "too_little_data"}', 'too_few', 'recheck_v1', '2026-10-06 08:00Z'),
    (c, '2026-08-01', '2026-09-01', 'dense20', 'denominator', 'videos', 189, 189, 147, 147, null, null,
     '{"state": "refused"}', 'follows_depth', 'recheck_v1', '2026-10-06 08:00Z'),
    -- a recompute is a new row, and the old one stays
    (c, '2026-08-01', '2026-09-01', 'same_searches_clean', 'kind', 'feature_request', 3, 41, 9, 52, 0.3, 0.1,
     '{"state": "too_little_data"}', 'too_few', 'recheck_v1', '2026-10-12 08:00Z');
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id,
                                             verdict, outcome, method_version, computed_at)
      values (c, '2026-08-01', '2026-09-01', 'same_searches_clean', 'kind', 'feature_request',
              '{}', 'too_few', 'recheck_v1', '2026-10-06 08:00Z');
    raise exception 'comparability_checks FAILED: the same key written twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'buyers', 'kind', 'x', '{}', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: an unknown population';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'all', 'rival', 'x', '{}', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: an unknown object kind';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'all', 'kind', 'x', '{}', 'holds_up', 'v');
    raise exception 'comparability_checks FAILED: an unknown outcome';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, k_prev, n_prev, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'all', 'kind', 'x', 41, 40, '{}', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: k over n';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, k_curr, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'all', 'kind', 'x', 4, '{}', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: a k with no n';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, verdict, outcome, method_version)
      values (c, '2026-09-01', '2026-09-01', 'all', 'kind', 'x', '{}', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: a pair that does not run forward';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, population_makers, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'all', 'kind', 'x', 1.5, '{}', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: a share over 1';
  exception when check_violation then null;
  end;
  begin
    insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, verdict, outcome, method_version)
      values (c, '2026-08-01', '2026-09-01', 'all', 'kind', 'x', '[]', 'too_few', 'v');
    raise exception 'comparability_checks FAILED: a verdict that is not an object';
  exception when check_violation then null;
  end;
  raise notice 'ok  comparability_checks: the pinned vocabularies, forward pairs, k within n, shares within 0 and 1, append-only by computed_at';
end $$;

-- 11. Behaviour: a tenant reads its own rows, and the service role never rewrites -------
insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, verdict, outcome, method_version)
  values ('00000000-0000-4000-8000-00000000c002', '2026-08-01', '2026-09-01', 'all', 'kind', 'praise', '{}', 'too_few', 'v');
insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
  values ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000b8', 'client', 'content', 'caption', 'rule', 'brands_v1');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
do $$
declare n_checks int; n_mentions int;
begin
  select count(*) into n_checks from public.comparability_checks;
  select count(*) into n_mentions from public.brand_mentions;
  if n_checks <> 3 or n_mentions <> 6 then
    raise exception 'RLS FAILED: the tenant sees % checks and % mentions, not its own 3 and 6', n_checks, n_mentions;
  end if;
  if exists (select 1 from public.comparability_checks where client_id <> '00000000-0000-4000-8000-00000000c001')
     or exists (select 1 from public.brand_mentions where client_id <> '00000000-0000-4000-8000-00000000c001') then
    raise exception 'RLS FAILED: the tenant sees another tenant''s rows';
  end if;
  begin
    insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
      values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b3', 'client', 'content', 'caption', 'rule', 'x');
    raise exception 'grants FAILED: a tenant session inserted a brand mention';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_arrivals('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', array['2026-09-01']::date[]);
    raise exception 'grants FAILED: a tenant session executed update_arrivals';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  a tenant session reads its own checks and mentions only, writes neither, and cannot call the functions';
end $$;
reset role;

set local role service_role;
do $$
begin
  begin
    update public.comparability_checks set outcome = 'moved';
    raise exception 'append-only FAILED: service_role updated comparability_checks';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.brand_mentions;
    raise exception 'append-only FAILED: service_role deleted from brand_mentions';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.brand_mentions set method = 'confirmed';
    raise exception 'append-only FAILED: service_role updated brand_mentions';
  exception when insufficient_privilege then null;
  end;
  insert into public.brand_mentions (client_id, video_id, brand_key, source, field, method, rule_version)
    values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000b3', 'client', 'content', 'hashtags', 'rule', 'brands_v1');
  perform public.lens_readings('00000000-0000-4000-8000-00000000c001', '2026-09-01', null);
  raise notice 'ok  append-only: the service role inserts and reads, and cannot update or delete';
end $$;
reset role;

-- A cascade still works: a comment removed by retention takes its mention; a video, all of its.
do $$
declare n int;
begin
  delete from public.comments where id = '00000000-0000-4000-8000-000000001202';
  select count(*) into n from public.brand_mentions where comment_id = '00000000-0000-4000-8000-000000001202';
  if n <> 0 then raise exception 'cascade FAILED: a mention outlived its comment'; end if;
  delete from public.videos where id = '00000000-0000-4000-8000-0000000000b1';
  select count(*) into n from public.brand_mentions where video_id = '00000000-0000-4000-8000-0000000000b1';
  if n <> 0 then raise exception 'cascade FAILED: % mentions outlived their video', n; end if;
  delete from public.clients where id = '00000000-0000-4000-8000-00000000c002';
  select count(*) into n from public.comparability_checks where client_id = '00000000-0000-4000-8000-00000000c002';
  if n <> 0 then raise exception 'cascade FAILED: checks outlived their tenant'; end if;
  raise notice 'ok  the foreign-key cascades still remove a deleted comment''s, video''s and tenant''s rows';
end $$;

rollback;
\echo 'mf2-checks: all passed'
