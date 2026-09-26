-- The deploy-4 run steps' writes on the throwaway cluster (market-first plan
-- WP3.3, WP3.4, WP3.5, WP3.10; mf/s3-run), after MF1, R12, MF2, MF4 and MF3:
--
--   bash scripts/pg-shim/s3-run-checks.sh <scratch dir>
--
-- The writes are the statements the steps make through PostgREST (an upsert on
-- the primary key is INSERT … ON CONFLICT DO UPDATE; an insert-if-absent is
-- ON CONFLICT DO NOTHING), as service_role, in the order and the transactions
-- the pipeline makes them. Every check raises on failure.
--
-- The guards tell an earlier transaction's rows from this one's, so the
-- checks commit their synthetic tenant, run each "run" in a transaction of its
-- own, and remove the tenant at the end through the cascade (and first, in
-- case an earlier run stopped half way). The tenant, its ids and its small
-- counts are made up, and their numbers are the test's own arithmetic; the
-- brand rows (R6) are Sealand's September staging figures (plan §2.5 B1), and
-- the August buyer lens's 91 videos is decision F's figure.
\set ON_ERROR_STOP 1

-- R0. Leftovers from a run that stopped half way.
delete from public.clients where id = '00000000-0000-4000-8000-0000000005c1';

-- R1. The tenant: runs, five October videos with comments, two insights, and
-- the month rows freeze-months keeps (September frozen, October and November
-- filling), as the 8 Nov run left them.
begin;
insert into public.clients (id, company_name) values ('00000000-0000-4000-8000-0000000005c1', 's3-run check');
insert into public.pipeline_runs (id, client_id, status, started_at, completed_at) values
  ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005c1', 'completed', '2026-11-08 04:00Z', '2026-11-08 08:30Z'),
  ('00000000-0000-4000-8000-0000000005a2', '00000000-0000-4000-8000-0000000005c1', 'running',   '2026-12-06 04:00Z', null);
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, competitor_name,
                           analyzed_lane, analyzed_run_id, sentiment, sentiment_source, caption, hashtags, upload_date, scraped_at) values
  ('00000000-0000-4000-8000-0000000005b1', '00000000-0000-4000-8000-0000000005c1', 'youtube', 'y1', 'u', 'packlight', false, false, null, 'full', '00000000-0000-4000-8000-0000000005a1', 'positive', 'audience', 'carry-on daypack', '{}', '2026-10-02', '2026-10-04 05:00Z'),
  ('00000000-0000-4000-8000-0000000005b2', '00000000-0000-4000-8000-0000000005c1', 'tiktok',  't2', 'u', 'maker',     false, false, null, 'full', '00000000-0000-4000-8000-0000000005a1', 'positive', 'audience', 'sewing a tote', '{}', '2026-10-05', '2026-10-11 05:00Z'),
  ('00000000-0000-4000-8000-0000000005b3', '00000000-0000-4000-8000-0000000005c1', 'tiktok',  't3', 'u', 'cotopaxi',  false, true, 'Cotopaxi', 'full', '00000000-0000-4000-8000-0000000005a1', 'negative', 'audience', 'new drop', '{}', '2026-10-07', '2026-10-11 05:00Z'),
  ('00000000-0000-4000-8000-0000000005b4', '00000000-0000-4000-8000-0000000005c1', 'youtube', 'y4', 'u', 'own',       true,  false, null, 'full', '00000000-0000-4000-8000-0000000005a1', 'positive', 'audience', 'our bag', '{}', '2026-10-09', '2026-10-11 05:00Z'),
  ('00000000-0000-4000-8000-0000000005b5', '00000000-0000-4000-8000-0000000005c1', 'reddit',  'r5', 'u', 'r/onebag',  false, false, null, 'full', '00000000-0000-4000-8000-0000000005a1', 'positive', 'audience', 'which bag', '{}', '2026-10-12', '2026-10-18 05:00Z');
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
select ('00000000-0000-4000-8000-00000005' || lpad(v.n::text, 2, '0') || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000005c1',
       '00000000-0000-4000-8000-0000000005a1', v.platform, v.video_id, v.video_id || '-' || g, ('2026-10-' || lpad((10 + g)::text, 2, '0') || ' 00:00Z')::timestamptz,
       '2026-11-01 05:00Z', 'comment'
from (values (1, 'youtube', 'y1', 3), (2, 'tiktok', 't2', 2), (3, 'tiktok', 't3', 4), (4, 'youtube', 'y4', 2), (5, 'reddit', 'r5', 1)) v(n, platform, video_id, k)
cross join lateral generate_series(1, v.k) g;
insert into public.audience_insights (id, client_id, run_id, category, theme, description, source_video_id) values
  ('00000000-0000-4000-8000-0000000005e1', '00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005a1', 'praise',   't', 'd', '00000000-0000-4000-8000-0000000005b1'),
  ('00000000-0000-4000-8000-0000000005e2', '00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005a1', 'question', 't', 'd', '00000000-0000-4000-8000-0000000005b3');
insert into public.insight_evidence (audience_insight_id, comment_id, quote, source, source_video_id) values
  ('00000000-0000-4000-8000-0000000005e1', '00000000-0000-4000-8000-000000050101', 'q', 'comment', null),
  ('00000000-0000-4000-8000-0000000005e2', '00000000-0000-4000-8000-000000050301', 'q', 'comment', null);
insert into public.month_denominators (client_id, month, audience, videos, comments, platform_mix, status, origin, read_at, run_id, frozen_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other',      30, 400, '{}', 'frozen',  'live', '2026-10-25 06:00Z', null, '2026-11-01 06:00Z'),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'competitor:Cotopaxi', 10, 120, '{}', 'frozen',  'live', '2026-10-25 06:00Z', null, '2026-11-01 06:00Z'),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other',       3,   6, '{}', 'filling', 'live', '2026-11-08 06:00Z', null, null),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'competitor:Cotopaxi',  1,   4, '{}', 'filling', 'live', '2026-11-08 06:00Z', null, null),
  ('00000000-0000-4000-8000-0000000005c1', '2026-11-01', 'industry-other',       2,   5, '{}', 'filling', 'live', '2026-11-08 06:00Z', null, null);
-- The 8 Nov run's lens rows for October (filling), as the lens-readings step wrote them.
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, run_id, rule_version) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', 'market', 'denominator', 'videos', 3, 3, 'filling', 'live', '2026-11-08 06:00Z', '00000000-0000-4000-8000-0000000005a1', 'segments_v1'),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', 'buyers', 'denominator', 'videos', 2, 2, 'filling', 'live', '2026-11-08 06:00Z', '00000000-0000-4000-8000-0000000005a1', 'segments_v1'),
  ('00000000-0000-4000-8000-0000000005c1', '2026-11-01', 'industry-other', 'market', 'denominator', 'videos', 2, 2, 'filling', 'live', '2026-11-08 06:00Z', '00000000-0000-4000-8000-0000000005a1', 'segments_v1');
insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                         status, origin, read_at, run_id, rule_version) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', '00000000-0000-4000-8000-00000000050c', 1, 1, 0, 1, 3, 3, 'filling', 'live', '2026-11-08 06:00Z', '00000000-0000-4000-8000-0000000005a1', 'brands_v1');
commit;

-- R2. Parity: the market lens (lens_readings, no filter) pooled over the
-- market's audiences equals the pooled month functions for the filling
-- month, October: videos, comments and every kind.
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-0000000005c1';
  got text; want text;
begin
  select string_agg(format('%s|%s|%s', object_kind, object_id, k), ' ' order by object_kind, object_id) into got
    from (select object_kind, object_id, sum(k) as k from public.lens_readings(c, '2026-10-01', null) l
           where l.audience <> 'client' and l.object_kind in ('denominator', 'kind') group by object_kind, object_id) x;
  select string_agg(format('%s|%s|%s', object_kind, object_id, k), ' ' order by object_kind, object_id) into want
    from (select 'denominator' as object_kind, 'videos' as object_id, sum(videos) as k from public.monthly_denominators(c, '2026-10-01', '2026-11-01') where audience <> 'client'
          union all
          select 'denominator', 'comments', sum(comments) from public.monthly_denominators(c, '2026-10-01', '2026-11-01') where audience <> 'client'
          union all
          select 'kind', kind, sum(videos) from public.monthly_kind_readings(c, '2026-10-01', '2026-11-01') where audience <> 'client' group by kind) y;
  if got is distinct from want then
    raise exception E'parity FAILED: the market lens is not the pooled month rows.\nlens: %\nmonth: %', got, want;
  end if;
  if got is distinct from 'denominator|comments|10 denominator|videos|4 kind|praise|1 kind|question|1' then
    raise exception 'parity FAILED (by hand): got %', got;
  end if;
  raise notice 'ok  parity: the market lens with no segment filter pools to the month rows for October (videos 4, comments 10, praise 1, question 1)';
end $$;

-- R3. The 6 Dec run freezes October. lens-readings and brand-readings write
-- October's rows frozen (the rows the 8 Nov run left, and a key first seen
-- now), each in a statement of its own; then freeze-months writes the
-- denominator marker. No restrict_violation.
begin;
set local role service_role;
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, run_id, rule_version, frozen_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', 'market', 'denominator', 'videos', 3, 3, 'frozen', 'live',      now(), '00000000-0000-4000-8000-0000000005a2', 'segments_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', 'market', 'kind',        'praise', 1, 3, 'frozen', 'back_read', now(), '00000000-0000-4000-8000-0000000005a2', 'segments_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', 'buyers', 'denominator', 'videos', 2, 2, 'frozen', 'live',      now(), '00000000-0000-4000-8000-0000000005a2', 'segments_v1', now())
on conflict (client_id, month, audience, lens, object_kind, object_id) do update
  set k = excluded.k, n = excluded.n, status = excluded.status, read_at = excluded.read_at, run_id = excluded.run_id, frozen_at = excluded.frozen_at;
commit;
begin;
set local role service_role;
insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                         status, origin, read_at, run_id, rule_version, frozen_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other',      '00000000-0000-4000-8000-00000000050c', 1, 1, 0, 1, 3, 3, 'frozen', 'live',      now(), '00000000-0000-4000-8000-0000000005a2', 'brands_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'competitor:Cotopaxi', '00000000-0000-4000-8000-00000000050c', 0, 0, 0, 0, 1, 1, 'frozen', 'back_read', now(), '00000000-0000-4000-8000-0000000005a2', 'brands_v1', now())
on conflict (client_id, month, audience, brand_key) do update
  set k_any = excluded.k_any, n = excluded.n, status = excluded.status, read_at = excluded.read_at, run_id = excluded.run_id, frozen_at = excluded.frozen_at;
commit;
begin;
update public.month_denominators set status = 'frozen', frozen_at = now()
 where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-10-01';
commit;
do $$
begin
  if exists (select 1 from public.month_lens_readings where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-10-01' and status <> 'frozen')
     or exists (select 1 from public.month_brand_readings where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-10-01' and status <> 'frozen') then
    raise exception 'order FAILED: an October lens or brand row is still filling after the run froze the month';
  end if;
  if (select count(*) from public.month_lens_readings where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-10-01') <> 3 then
    raise exception 'order FAILED: October should hold three lens rows';
  end if;
  raise notice 'ok  the run that freezes October writes its lens and brand rows frozen before freeze-months writes the denominator marker: no restrict_violation, a key first seen on that run included';
end $$;

-- R3b. And after the marker: a new October key is a late addition, refused
-- ("already held"); a frozen lens row is never rewritten.
do $$
begin
  begin
    set local role service_role;
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', 'industry-other', 'market', 'kind', 'question', 1, 3, 'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'guard FAILED: a new October market key was let in after the marker';
  exception when restrict_violation then
    if sqlerrm not like '%already held%' then raise exception 'guard FAILED: refused, but not as already held: %', sqlerrm; end if;
  end;
  reset role;
  begin
    set local role service_role;
    update public.month_lens_readings set k = 9
     where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-10-01' and lens = 'market' and object_kind = 'denominator';
    raise exception 'guard FAILED: a frozen lens row was rewritten';
  exception when restrict_violation or raise_exception then
    if sqlerrm like 'guard FAILED%' then raise; end if;
  end;
  reset role;
  raise notice 'ok  after the marker a new October key is refused as already held, and a frozen lens row is never rewritten';
end $$;

-- R3c. Why the order matters: November, frozen FIRST (the marker), and only
-- then a lens key first seen: refused, and the month would stay half-frozen.
begin;
update public.month_denominators set status = 'frozen', frozen_at = now()
 where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-11-01';
commit;
do $$
begin
  begin
    set local role service_role;
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values ('00000000-0000-4000-8000-0000000005c1', '2026-11-01', 'industry-other', 'market', 'kind', 'praise', 1, 2, 'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'order FAILED: a lens key written after the marker was let in';
  exception when restrict_violation then null;
  end;
  reset role;
  raise notice 'ok  in the other order (the marker first) a first-seen lens key is refused: the step has to sit before freeze-months';
end $$;

-- R4. The one back-read of a closed month (September, no lens or brand rows):
-- the first lands, lens by lens; a second is refused as already held; a lens
-- never read before still lands once.
begin;
set local role service_role;
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other', 'buyers', 'denominator', 'videos', 21, 21, 'frozen', 'back_read', now(), 'segments_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other', 'buyers', 'kind',        'praise',  9, 21, 'frozen', 'back_read', now(), 'segments_v1', now());
commit;
do $$
begin
  begin
    set local role service_role;
    insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
      values ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other', 'buyers', 'kind', 'question', 3, 21, 'frozen', 'back_read', now(), 'segments_v1', now());
    raise exception 'back-read FAILED: a second back-read of September''s buyers lens was let in';
  exception when restrict_violation then
    if sqlerrm not like '%already held%' then raise exception 'back-read FAILED: refused, but not as already held: %', sqlerrm; end if;
  end;
  reset role;
  raise notice 'ok  a second lens-backread of September is refused as already held';
end $$;
begin;
set local role service_role;
insert into public.month_lens_readings (client_id, month, audience, lens, object_kind, object_id, k, n, status, origin, read_at, rule_version, frozen_at)
  values ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other', 'makers', 'denominator', 'videos', 9, 9, 'frozen', 'back_read', now(), 'segments_v1', now());
commit;

-- R5. The August buyer lens under 100: lens_readings over decision F's 91
-- buyer videos pools to 91, which the scripts print as a count.
begin;
insert into public.videos (id, client_id, platform, video_id, video_url, account_name, is_client, is_competitor, analyzed_lane, analyzed_run_id, caption, hashtags, scraped_at)
select ('00000000-0000-4000-8000-00000006' || lpad(g::text, 4, '0'))::uuid, '00000000-0000-4000-8000-0000000005c1', 'youtube', 'aug-' || g, 'u', 'a', false, false,
       'full', '00000000-0000-4000-8000-0000000005a1', 'august', '{}', '2026-08-20 05:00Z'
from generate_series(1, 91) g;
insert into public.comments (id, client_id, run_id, platform, video_id, comment_id, comment_date, created_at, text)
select ('00000000-0000-4000-8000-00000007' || lpad(g::text, 4, '0'))::uuid, '00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005a1',
       'youtube', 'aug-' || g, 'aug-c-' || g, '2026-08-21 00:00Z', '2026-08-22 05:00Z', 'fine'
from generate_series(1, 91) g;
commit;
do $$
declare n int;
begin
  select sum(l.n) into n from public.lens_readings('00000000-0000-4000-8000-0000000005c1', '2026-08-01', null,
    (select array_agg(id) from public.videos where client_id = '00000000-0000-4000-8000-0000000005c1' and video_id like 'aug-%'), 1, '2026-10-04 06:00Z') l
   where l.object_kind = 'denominator' and l.object_id = 'videos' and l.audience <> 'client';
  if n is distinct from 91 then raise exception 'buyers FAILED: August''s buyer lens pools to %, not 91', n; end if;
  raise notice 'ok  the August buyer lens pools to 91 videos (under 100: printed as a count), pinned to what August held at its freeze';
end $$;

-- R6. month_brand_readings on Sealand's September staging figures (plan §2.5
-- B1): per audience as brandReadingRows writes them, the category's 625 and
-- Cotopaxi's 29 (a label for the rival-filed 29). Pooled: Patagonia 47 and 33
-- of 654, The North Face 36 and 11, Cotopaxi 31 and 11. The first back-read
-- of the closed month lands; a second is refused.
begin;
set local role service_role;
insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                         status, origin, read_at, rule_version, frozen_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other',      '00000000-0000-4000-8000-00000000050a', 47, 47, 0, 33, 625, 611, 'frozen', 'back_read', now(), 'brands_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'competitor:Cotopaxi', '00000000-0000-4000-8000-00000000050a',  0,  0, 0,  0,  29,  29, 'frozen', 'back_read', now(), 'brands_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other',      '00000000-0000-4000-8000-00000000050b', 36, 36, 0, 11, 625, 600, 'frozen', 'back_read', now(), 'brands_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'competitor:Cotopaxi', '00000000-0000-4000-8000-00000000050b',  0,  0, 0,  0,  29,  29, 'frozen', 'back_read', now(), 'brands_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other',      '00000000-0000-4000-8000-00000000050c', 31, 31, 0, 11, 625, 605, 'frozen', 'back_read', now(), 'brands_v1', now()),
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'competitor:Cotopaxi', '00000000-0000-4000-8000-00000000050c',  0,  0, 0,  0,  29,  29, 'frozen', 'back_read', now(), 'brands_v1', now());
commit;
do $$
declare got text;
begin
  select string_agg(format('%s %s %s %s %s %s %s', right(brand_key, 1), sum_any, sum_content, sum_comment, sum_organic, sum_n, sum_n_organic), ' · ' order by brand_key) into got
    from (select brand_key, sum(k_any) sum_any, sum(k_content) sum_content, sum(k_comment) sum_comment, sum(k_organic) sum_organic, sum(n) sum_n, sum(n_organic) sum_n_organic
            from public.month_brand_readings where client_id = '00000000-0000-4000-8000-0000000005c1' and month = '2026-09-01' group by brand_key) x;
  if got is distinct from 'a 47 47 0 33 654 640 · b 36 36 0 11 654 629 · c 31 31 0 11 654 634' then
    raise exception 'brands FAILED: September pools to %', got;
  end if;
  begin
    set local role service_role;
    insert into public.month_brand_readings (client_id, month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic,
                                             status, origin, read_at, rule_version, frozen_at)
      values ('00000000-0000-4000-8000-0000000005c1', '2026-09-01', 'industry-other', 'watched:osprey', 11, 11, 0, 11, 625, 625, 'frozen', 'back_read', now(), 'watched_v1', now());
    raise exception 'brands FAILED: a second back-read of September''s brands was let in';
  exception when restrict_violation then null;
  end;
  reset role;
  raise notice 'ok  brand rows: k_any, k_content, k_comment, k_organic, n and n_organic pool to Patagonia 47 and 33, The North Face 36 and 11, Cotopaxi 31 and 11 of 654; a second back-read is refused';
end $$;

-- R7. The comparability step's rows: append-only, the newest computed_at wins;
-- equal_age is a population comparability_checks takes.
begin;
set local role service_role;
insert into public.month_pair_comparability (client_id, prev_month, month, search_outside_prev, videos_prev, search_outside_curr, videos_curr,
                                             code_changes, depth_prev_median, depth_curr_median, gather, late_capture, read_through_run, method_version, computed_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', '2026-11-01', 0, 3, 0, 2, '[]', 3, 2, '[{"month":"2026-10-01","runs":4,"partial":0,"searches_short":0}]', '{"month":"2026-10-01","comments":0,"of":6}',
   '00000000-0000-4000-8000-0000000005a1', 'mf1_v1', '2026-11-08 07:10Z'),
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', '2026-11-01', 0, 3, 0, 2, '[]', 3, 3, '[{"month":"2026-10-01","runs":4,"partial":0,"searches_short":0}]', '{"month":"2026-10-01","comments":0,"of":6}',
   '00000000-0000-4000-8000-0000000005a2', 'mf1_v1', '2026-12-06 07:10Z');
insert into public.comparability_checks (client_id, prev_month, month, population, object_kind, object_id, k_prev, n_prev, k_curr, n_curr,
                                         population_makers, population_noise, verdict, outcome, read_through_run, method_version, computed_at) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-10-01', '2026-11-01', 'equal_age', 'kind', 'praise', 1, 3, 1, 2, 0.2, 0, '{}', 'too_few',
   '00000000-0000-4000-8000-0000000005a2', 'recheck_v1', '2026-12-06 07:10Z');
commit;
do $$
begin
  if (select read_through_run from public.month_pair_comparability where client_id = '00000000-0000-4000-8000-0000000005c1'
        and prev_month = '2026-10-01' and month = '2026-11-01' order by computed_at desc limit 1) <> '00000000-0000-4000-8000-0000000005a2' then
    raise exception 'pairs FAILED: the newest computed_at is not the one read';
  end if;
  begin
    set local role service_role;
    update public.month_pair_comparability set videos_curr = 9 where client_id = '00000000-0000-4000-8000-0000000005c1';
    raise exception 'pairs FAILED: a pair row was rewritten';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'ok  the comparability step''s pair rows are append-only (the newest computed_at wins); comparability_checks takes equal_age';
end $$;

-- R8. Gather-time provenance and surfacings: insert-if-absent with INSERT
-- alone, so a replayed gather writes nothing twice and never rewrites a first find.
begin;
set local role service_role;
insert into public.video_provenance (client_id, video_id, first_run_id, first_stored_at, first_terms, first_subreddits, method, evidence) values
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005b5', '00000000-0000-4000-8000-0000000005a1', '2026-10-18 05:00Z', '{}', '{r/onebag}', 'exact', 'gather')
on conflict (client_id, video_id) do nothing;
insert into public.video_provenance (client_id, video_id, first_run_id, first_stored_at, first_terms, first_subreddits, method, evidence) values
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005b5', '00000000-0000-4000-8000-0000000005a2', '2026-12-06 05:00Z', '{travel gear}', '{}', 'exact', 'gather')
on conflict (client_id, video_id) do nothing;
insert into public.video_surfacings (client_id, video_id, run_id, terms, subreddits) values
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005b5', '00000000-0000-4000-8000-0000000005a1', '{}', '{r/onebag}'),
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005b5', '00000000-0000-4000-8000-0000000005a2', '{travel gear}', '{r/onebag}')
on conflict (client_id, video_id, run_id) do nothing;
insert into public.video_surfacings (client_id, video_id, run_id, terms, subreddits) values
  ('00000000-0000-4000-8000-0000000005c1', '00000000-0000-4000-8000-0000000005b5', '00000000-0000-4000-8000-0000000005a2', '{travel gear}', '{r/onebag}')
on conflict (client_id, video_id, run_id) do nothing;
commit;
do $$
begin
  if (select first_subreddits from public.video_provenance where client_id = '00000000-0000-4000-8000-0000000005c1' and video_id = '00000000-0000-4000-8000-0000000005b5') <> '{r/onebag}'
     or (select count(*) from public.video_surfacings where client_id = '00000000-0000-4000-8000-0000000005c1') <> 2 then
    raise exception 'provenance FAILED: a first find was rewritten or a surfacing written twice';
  end if;
  raise notice 'ok  gather provenance and surfacings: insert-if-absent with INSERT alone; a first find is never rewritten, a surfacing never doubled';
end $$;

-- R9. The queue: applied once, by open-run, and never again.
begin;
insert into public.tracking_config_queue (id, client_id, field, after, effective_month, queued_label) values
  ('00000000-0000-4000-8000-0000000005f1', '00000000-0000-4000-8000-0000000005c1', 'industry_keywords', '["handmade bag", "travel gear"]', '2027-01-01', 'Owner (check)');
commit;
begin;
set local role service_role;
update public.tracking_config_queue set applied_at = '2027-01-03 04:00Z' where id = '00000000-0000-4000-8000-0000000005f1' and applied_at is null;
commit;
do $$
begin
  begin
    set local role service_role;
    update public.tracking_config_queue set applied_at = '2027-01-10 04:00Z' where id = '00000000-0000-4000-8000-0000000005f1';
    raise exception 'queue FAILED: a queued edit was applied twice';
  exception when restrict_violation then null;
  end;
  reset role;
  raise notice 'ok  a queued edit is stamped applied once; a second stamp is refused';
end $$;

-- R9b. The weekly keep inside the comparability step (WP3.13): a week that
-- reached its age on this run goes to week_line_reads / week_line_points
-- through mf/s3-weekline's store, ON CONFLICT DO NOTHING (INSERT alone); a
-- second keep of the same week inserts nothing and rewrites nothing.
begin;
set local role service_role;
with r as (
  insert into public.week_line_reads (client_id, week, age_days, captured_before, read_through_run, conditions, method_version, computed_at) values
    ('00000000-0000-4000-8000-0000000005c1', '2026-09-28', 21, '2026-10-26 00:00Z', '00000000-0000-4000-8000-0000000005a1', '{"runs_in_week":1}', 'week_line_v1', '2026-10-25 08:00Z')
  on conflict (client_id, week, age_days, method_version) do nothing returning 1
)
select count(*) from r;
insert into public.week_line_points (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n) values
  ('00000000-0000-4000-8000-0000000005c1', '2026-09-28', 21, 'week_line_v1', 'industry-other', 'kind', 'praise', '5-19', 3, 5)
on conflict do nothing;
commit;
do $$
declare got int;
begin
  set local role service_role;
  with r as (
    insert into public.week_line_reads (client_id, week, age_days, captured_before, read_through_run, conditions, method_version, computed_at) values
      ('00000000-0000-4000-8000-0000000005c1', '2026-09-28', 21, '2026-10-26 00:00Z', '00000000-0000-4000-8000-0000000005a2', '{"runs_in_week":9}', 'week_line_v1', '2026-11-01 08:00Z')
    on conflict (client_id, week, age_days, method_version) do nothing returning 1
  )
  select count(*) into got from r;
  reset role;
  if got <> 0 then raise exception 'weeks FAILED: a second keep of the week of 28 Sep inserted a read'; end if;
  if (select read_through_run from public.week_line_reads where client_id = '00000000-0000-4000-8000-0000000005c1' and week = '2026-09-28') <> '00000000-0000-4000-8000-0000000005a1' then
    raise exception 'weeks FAILED: a kept read was rewritten';
  end if;
  raise notice 'ok  the weekly keep: a week kept once, a second keep inserts nothing and rewrites nothing';
end $$;

-- R10. The tenant goes; the cascade takes its frozen rows with it.
delete from public.clients where id = '00000000-0000-4000-8000-0000000005c1';
do $$
begin
  if exists (select 1 from public.month_lens_readings where client_id = '00000000-0000-4000-8000-0000000005c1') then
    raise exception 'cleanup FAILED';
  end if;
  raise notice 'ok  s3-run checks: all passed';
end $$;
