-- A video let in unjudged stops counting as unchecked once today's check has
-- judged it and kept it (the backfill's regate, 1 Oct evening; lead's ruling).
--
-- WHAT WAS WRONG. `market_week_volumes` (20261005091000) counts a video as
-- `unchecked` when ANY of its gate verdicts is a kept `default`: a GPT batch
-- that failed before the 24 Sep fix (commit 6efc8588) let it in unjudged. A
-- resurfaced video is never judged again, so the flag was permanent, and every
-- week in which one of those videos drew a comment was kept off the
-- Dashboard's chart for good (`weeksSinceOurChanges`): 27, 56 and 19 of them
-- in the weeks of 7, 14 and 21 Sep, out of 66 such videos in Sealand's market.
--
-- THE RULE NOW. A video is unchecked while its NEWEST verdict is not a clean
-- keep: still the fail-open default, or a later judgement that drops it.
-- `scripts/backfill-platform.ts --regate --yes` appends today's verdict for
-- those videos (`gate_verdicts`, run_id null; the default rows stay as the
-- record) and removes the ones it drops (`regate_videos`, 20261106092000,
-- with a backup). A video today's check keeps is then checked. Nothing else
-- in the function changes, byte for byte.
--
-- WHO READS IT. The Dashboard's chart (lib/pages/home.ts) and the run's kept
-- weeks (lib/reading/week-keep.ts, the comparability step), which records the
-- `unchecked` count in week_line_reads.conditions. Both mean "let in without a
-- check that still stands", which is what this now counts.
--
-- IDEMPOTENT: create or replace with the same signature and return type, then
-- the comment, the revoke and the grant as before. Applied twice on a
-- throwaway PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an
-- empty catalogue diff; exercised by scripts/pg-shim/week-unchecked-checks.sql,
-- and scripts/pg-shim/mf4-checks.sql still passes.

create or replace function public.market_week_volumes(
  p_client          uuid,
  p_from            date,
  p_to              date,
  p_captured_before timestamptz default null
)
returns table (week date, audience text, videos int, comments int, comments_next_month int,
               under_5 int, median_dated numeric, mean_dated numeric, older_videos int, unchecked int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select (date_trunc('week', p_from)::date)::timestamp at time zone 'UTC' as t0,
           ((date_trunc('week', p_to - 1) + interval '7 days')::date)::timestamp at time zone 'UTC' as t1
  ),
  vid as (
    select v.id, v.platform, v.video_id, v.upload_date,
           case when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
      and v.is_client is not true
  ),
  wk as (
    select date_trunc('week', c.comment_date at time zone 'UTC')::date as week,
           date_trunc('month', c.comment_date at time zone 'UTC')::date as month,
           v.id as video_uuid, v.audience, c.id as comment_id
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    cross join bounds b
    where c.client_id = p_client
      and p_from < p_to
      and c.comment_date >= b.t0
      and c.comment_date <  b.t1
      and (p_captured_before is null or c.created_at < p_captured_before)
  ),
  per_video as (
    select w.week, w.audience, w.video_uuid,
           count(distinct w.comment_id) as dated,
           count(distinct w.comment_id) filter (where w.month > w.week) as next_month
    from wk w
    group by w.week, w.audience, w.video_uuid
  ),
  market as (
    select p.week,
           (percentile_cont(0.5) within group (order by p.dated))::numeric as median_dated,
           avg(p.dated)::numeric as mean_dated
    from per_video p
    group by p.week
  ),
  unchecked_ids as (
    -- A video is unchecked while its NEWEST verdict is not a clean keep: let
    -- in by the fail-open default and never judged since, or dropped when it
    -- was judged later (20261106091000). The verdicts are append-only, so the
    -- default row stays as the record of how it came in.
    select n.platform, n.video_id
    from (
      select distinct on (g.platform, g.video_id) g.platform, g.video_id, g.kept, g.source
      from public.gate_verdicts g
      where g.client_id = p_client
      order by g.platform, g.video_id, g.created_at desc, g.id desc
    ) n
    where not n.kept or n.source = 'default'
  ),
  flags as (
    select p.week, p.audience, p.dated, p.next_month,
           (v.upload_date is not null and v.upload_date < p.week - 7) as older,
           (u.video_id is not null) as unchecked
    from per_video p
    join vid v on v.id = p.video_uuid
    left join unchecked_ids u on u.platform = v.platform and u.video_id = v.video_id
  )
  select f.week,
         f.audience,
         count(*)::int,
         sum(f.dated)::int,
         sum(f.next_month)::int,
         (count(*) filter (where f.dated < 5))::int,
         m.median_dated,
         m.mean_dated,
         (count(*) filter (where f.older))::int,
         (count(*) filter (where f.unchecked))::int
  from flags f
  join market m on m.week = f.week
  group by f.week, f.audience, m.median_dated, m.mean_dated
  order by f.week, f.audience
$$;

comment on function public.market_week_volumes(uuid, date, date, timestamptz) is
  'Per ISO week (Monday, UTC, by comment date) overlapping [p_from, p_to) and per market audience (the client''s own posts dropped; full-lane videos): videos and comments dated in the week, those dated in a month that starts inside it, videos under 5, the market''s median and mean dated comments a video (repeated on each row of the week), older and unchecked videos (newest relevance verdict not a clean keep). Only comments first captured before p_captured_before count. Counts only.';

revoke all on function public.market_week_volumes(uuid, date, date, timestamptz) from public, anon, authenticated;
grant execute on function public.market_week_volumes(uuid, date, date, timestamptz) to service_role;
