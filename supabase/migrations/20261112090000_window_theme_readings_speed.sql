-- window_theme_readings, fast again on Sealand (fix/window-readings-speed,
-- 2026-11-05). Same signature, same return type, same rows.
--
-- WHAT WAS WRONG. 62c54155 (19 Sep) narrowed the undated pass of both window
-- functions to "drive from the window's own rows". In `window_denominators`
-- that is right and it stays: the inner side of its join is `public.comments`,
-- reached through the (client_id, platform, video_id) index. In this function
-- the inner side is `cited_all`, a CTE, which has no index, and a SQL
-- function's statement is planned without its parameter values, so the
-- planner estimates ONE (theme, video) pair in the window and runs the join as
-- a nested loop: every pair the window names re-scans every citation the
-- run's themes hold. That is quadratic, and it grows with the window. Plain
-- EXPLAIN (GENERIC_PLAN) on production showed the node; measured on
-- production 2026-11-05, Sealand (26,644 comment citations against Össur's
-- 14,483): 7.1 s for October and 15 to 23 s for August to October (two
-- readings an hour apart), against the API's 8 s statement cap
-- (`authenticator`), on each of the three `selectAll` pages, since PostgREST
-- re-runs the whole function for every page.
--
-- THE FIX, THREE PASSES AND NOTHING ELSE.
--   1. `undated_per_video` goes back to the month function's shape
--      (20260915092000), which is also this function's shape before
--      62c54155: count the UNDATED citations first, per (theme, video), then
--      keep the pairs the window names. `cited_all` is read once whatever the
--      window. The kept pairs are `cited`'s pairs, as before, so the count
--      per (theme, audience) is the same number. It also restores the rule
--      the M3 file states: the window bodies are the month bodies with the
--      month taken out, line for line.
--   2. `undated_per_video`, `denom` and `dated_ever` are MATERIALIZED. Each
--      is the inner side of a join the planner may run once per outer row
--      under the same one-row estimates; `denom` and `dated_ever` are the
--      on-camera passes, re-read once per on-camera-only member, and
--      unmaterialised that re-read walks every window comment of those
--      videos instead of the few hundred videos it reduces to. MATERIALIZED
--      never changes a result, only that the rows are computed once.
-- Every other line of the body is byte-identical to the shipped one
-- (20260918092000 after 62c54155). No index, no table, no new object.
--
-- PROVEN. Offline, on a local PostgreSQL 17.11 cluster with a fixture shaped
-- like Sealand and Össur, at their size and at three times Sealand's, with the
-- planner's estimates matched to production's so it picks production's plan:
-- old EXCEPT ALL new and new EXCEPT ALL old are empty for every tenant, run
-- and window tried (scripts/pg-shim/window-theme-speed-checks.sql holds the
-- edge cases as checks). On production, read-only, 2026-11-05 (no EXPLAIN
-- ANALYZE): the new body run as a plain SELECT, its parameters written as
-- scalar subqueries so that it is planned blind exactly as the function is
-- (the same plan shape as EXPLAIN (GENERIC_PLAN), checked offline), beside the
-- shipped function's output, EXCEPT ALL both ways, per window:
--
--   tenant   window                    rows   shipped   this body   differ
--   Sealand  26 Oct - 2 Nov (week)      563    2.04 s     0.28 s     0 / 0
--   Sealand  5 Oct - 2 Nov (28 days)   1,365    6.46 s     0.33 s     0 / 0
--   Sealand  October (filling)         1,484    7.13 s     0.33 s     0 / 0
--   Sealand  September (frozen)        1,135    5.29 s     0.32 s     0 / 0
--   Sealand  August - October          2,401   23.07 s     0.41 s     0 / 0
--   Össur    26 Oct - 2 Nov (week)        187    0.67 s     0.17 s     0 / 0
--   Össur    August - October          1,136    7.38 s     0.26 s     0 / 0
--
-- (Sealand August to October alone, cold: 0.44 s.) Offline at three times
-- Sealand's corpus the shipped body takes 60.7 s for a quarter and this one
-- 0.55 s; without the two on-camera MATERIALIZEDs it would take 2.3 s.
--
-- APPLYING IT. `create or replace` of a SQL function: no table is touched and
-- nothing is rebuilt. It takes a brief lock on the function's catalogue row
-- only; a call already running finishes on the old body and the next call
-- plans the new one. Idempotent: the comment, the revoke and the grant are
-- restated exactly as 20260918092000 left them.

create or replace function public.window_theme_readings(
  p_client uuid,
  p_run    uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  audience           text,
  theme_id           uuid,
  videos             int,
  comments           int,
  platform_mix       jsonb,
  excluded_on_camera int,
  excluded_undated   int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid_all as (
    select v.id, v.platform, v.video_id,
           v.analyzed_run_id is not null as analysed,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
  ),
  mem as (
    select o.theme_id, u.insight_id
    from public.theme_observations o, unnest(o.member_insight_ids) u(insight_id)
    where o.client_id = p_client and o.run_id = p_run
  ),
  ins as (
    select m.theme_id, ai.id as insight_id, ai.source_video_id
    from mem m
    join public.audience_insights ai on ai.id = m.insight_id
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.theme_id, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.theme_id, v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  -- THE UNDATED CITATIONS ARE COUNTED FROM THE UNDATED ROWS, AS THE MONTH
  -- FUNCTION COUNTS THEM (20260915092000), and only then matched to the
  -- window's (theme, video) pairs. 62c54155 (19 Sep) turned this pass round to
  -- drive from the pairs, copying the denominator's copy of it; there the inner
  -- side is `public.comments`, indexed on (client_id, platform, video_id), but
  -- here it is `cited_all`, a CTE with no index, and the planner, which sees one
  -- pair where a quarter holds thousands, nested-looped: every pair re-read
  -- every citation the run's themes hold. Measured on production 2026-11-05,
  -- Sealand: 7.1 s for October and 15 to 23 s for August to October, against
  -- the API's 8 s statement cap. This shape reads `cited_all` once whatever the
  -- window, and the pairs it keeps are the same pairs, so the rows are the
  -- same. MATERIALIZED here and on `denom` and `dated_ever` below for the one
  -- reason: each is the inner side of a join the planner may run once per
  -- outer row, and a materialised CTE is re-read as its handful of finished
  -- rows rather than re-computed. It never changes a result.
  undated_per_video as materialized (
    select ca.theme_id, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.theme_id, s.audience, sum(u.n) as n
    from (select distinct c.theme_id, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.theme_id = s.theme_id and u.video_uuid = s.video_uuid
    group by 1, 2
  ),
  oncam as (
    select i.theme_id, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  -- Window-scoped: which of these videos the window can attribute the member to
  -- at all. The month function asks the same question per month; here the answer
  -- is one row per video.
  denom as materialized (
    select distinct v.audience, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date >= p_from and c.comment_date < p_to
      and v.id in (select o.video_uuid from oncam o)
  ),
  -- Window-FREE, exactly as in the month function: "no month could ever take
  -- this citation" is a fact about the video, not about the caller's window, and
  -- the number it produces has already been frozen onto month rows. Keeping the
  -- pass identical is what makes a window read and a month read agree on this
  -- column instead of quietly disagreeing.
  dated_ever as materialized (
    select distinct v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date is not null
      and v.id in (select o.video_uuid from oncam o)
  ),
  oncam_in as (
    select o.theme_id, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  oncam_out as (
    select o.theme_id, o.audience, count(*) as n
    from oncam o
    where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)
    group by 1, 2
  ),
  vids as (
    select c.theme_id, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.theme_id, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.theme_id, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2
  ),
  cmt as (
    select c.theme_id, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2
  ),
  per_platform as (
    select x.theme_id, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3
  ),
  mix as (
    select p.theme_id, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2
  )
  select b.audience,
         b.theme_id,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.theme_id = b.theme_id and c.audience = b.audience
  left join mix m on m.theme_id = b.theme_id and m.audience = b.audience
  left join oncam_out oo on oo.theme_id = b.theme_id and oo.audience = b.audience
  left join undated   u  on u.theme_id  = b.theme_id and u.audience = b.audience
  order by b.audience, b.theme_id
$$;

comment on function public.window_theme_readings(uuid, uuid, timestamptz, timestamptz) is
  'Per audience per theme over the whole half-open window [p_from, p_to), for one run''s clustering: DISTINCT videos and comments the theme''s member insights cite, the platform mix, the undated citations those videos carry, and the on-camera-only members no month can carry (window-independent, identical to the month function''s column). theme_id is theme_registry.id. The month sibling writes the record; this one answers a windowed figure.';

revoke all on function public.window_theme_readings(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.window_theme_readings(uuid, uuid, timestamptz, timestamptz) to service_role;
