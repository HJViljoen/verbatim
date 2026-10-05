-- The unchecked videos' own counts, so the weekly bars can leave them out
-- (the lead's ruling, 5 Oct: "one unchecked video must not blank a week").
--
-- WHAT WAS WRONG. `market_week_volumes` (20261106091000) says how many of a
-- week's videos are `unchecked` (the newest relevance verdict not a clean
-- keep) but not how many of the week's comments are theirs, so a reader could
-- only drop the whole week. On 5 Oct Sealand's week of 28 Sep held 266 market
-- videos and 5,029 comments, one video unchecked (a heuristic default of the
-- 20 Sep gather, with one comment that week), and the Dashboard drew nothing.
--
-- THE CHANGE. Four columns at the END of the result: the unchecked videos'
-- own share of the counts the row already returns, so every count can be
-- restated without them. `unchecked_comments` (their comments dated in the
-- week, the same distinct count `comments` sums), `unchecked_comments_next_month`,
-- `unchecked_under_5` and `unchecked_older_videos`; 0 where none is unchecked.
-- Every other column, every row and the function's body are unchanged, byte
-- for byte; a caller that does not read the new columns reads what it read
-- before (lib/reading/week-keep.ts, scripts/week-points.ts). The weekly bars
-- (the Dashboard's `homeWeeks`, Your market's and This week's
-- `weekVolumesBlock`, through `checkedRows` in lib/reading/weeks.ts) subtract
-- them with `unchecked` from each row; until this is applied they read none
-- and keep dropping such a week (fail closed).
--
-- WHY A DROP. `create or replace` cannot change a function's result columns,
-- so the function is dropped and created again in this one transaction, then
-- its comment, revoke and grant restated exactly as before. Nothing depends on
-- it in the catalogue (no view, and the SQL functions that mention it do so in
-- comments only).
--
-- IDEMPOTENT: `drop function if exists` then `create function`, so a second
-- application ends where the first did. Applied twice on a throwaway
-- PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an empty
-- catalogue diff; exercised by scripts/pg-shim/week-unchecked-comments-checks.sql,
-- and scripts/pg-shim/mf4-checks.sql and week-unchecked-checks.sql still pass.

drop function if exists public.market_week_volumes(uuid, date, date, timestamptz);

create function public.market_week_volumes(
  p_client          uuid,
  p_from            date,
  p_to              date,
  p_captured_before timestamptz default null
)
returns table (week date, audience text, videos int, comments int, comments_next_month int,
               under_5 int, median_dated numeric, mean_dated numeric, older_videos int, unchecked int,
               unchecked_comments int, unchecked_comments_next_month int, unchecked_under_5 int, unchecked_older_videos int)
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
         (count(*) filter (where f.unchecked))::int,
         (coalesce(sum(f.dated) filter (where f.unchecked), 0))::int,
         (coalesce(sum(f.next_month) filter (where f.unchecked), 0))::int,
         (count(*) filter (where f.unchecked and f.dated < 5))::int,
         (count(*) filter (where f.unchecked and f.older))::int
  from flags f
  join market m on m.week = f.week
  group by f.week, f.audience, m.median_dated, m.mean_dated
  order by f.week, f.audience
$$;

comment on function public.market_week_volumes(uuid, date, date, timestamptz) is
  'Per ISO week (Monday, UTC, by comment date) overlapping [p_from, p_to) and per market audience (the client''s own posts dropped; full-lane videos): videos and comments dated in the week, those dated in a month that starts inside it, videos under 5, the market''s median and mean dated comments a video (repeated on each row of the week), older and unchecked videos (newest relevance verdict not a clean keep), and the unchecked videos'' own comments dated in the week, of them dated in the next month, videos under 5 and older videos. Only comments first captured before p_captured_before count. Counts only.';

revoke all on function public.market_week_volumes(uuid, date, date, timestamptz) from public, anon, authenticated;
grant execute on function public.market_week_volumes(uuid, date, date, timestamptz) to service_role;
