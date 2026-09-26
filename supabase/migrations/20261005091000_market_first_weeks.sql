-- MF4 · market-first, week by week (plan §4.1, §4.2; decision M; WP2.9 part A,
-- WP3.13 part B; applied by Heinrich, Tue 6 Oct, through
-- scripts/apply-market-first-migrations.sh --set mf4, in MF2's runner session).
--
-- WHAT IT ADDS. New functions and tables only; no month table, no existing
-- audience CASE body and no existing function signature changes (plan §4.1).
--   part A (WP2.9)   function market_week_volumes: the market's videos and
--                    comments for each week, as counts (the weekly volume bars)
--   part B (WP3.13)  function market_week_readings (the same-age cut) and the
--                    tables week_line_reads and week_line_points, append-only:
--                    each week's point is kept once, at its age, and never
--                    recomputed
-- Numbered after MF2 and applied before MF3, so the file order is still the
-- order of application. The two parts are separate sections: if part B is not
-- through review by Mon 5 Oct, it moves whole to its own file
-- (20261014090000_market_first_week_line.sql, plan §4.1), still before the
-- first capture on Mon 19 Oct.
--
-- THE WEEK. date_trunc('week', comment_date at time zone 'UTC'): an ISO week,
-- Monday to Sunday, at UTC, by the day the comment was written. Comment dates
-- carry no time part (none on staging); the explicit zone keeps the 338
-- production rows that do carry one in the right week.
--
-- THE MARKET. Decision E: the category plus the rival audiences, the client's
-- own posts dropped, over full-lane videos (the month denominator's set,
-- analyzed_lane = 'full', M13). The audience strings are MF1's
-- market_month_videos' own ('competitor:' || coalesce(competitor_name,
-- 'unknown') | 'industry-other'), so a week's rows pool the way a month's do.
--
-- THE CONVENTIONS ARE MF1's (20260928090000_market_first_s1.sql). Both tables:
-- RLS on, a get_my_client_id() select policy, every privilege revoked from
-- anon and authenticated and then column-level SELECT for authenticated,
-- service_role insert and select, UPDATE, DELETE and TRUNCATE revoked (a
-- foreign-key cascade still works: referential actions run as the owner). A
-- held key is never written twice: the primary key refuses it, and the writer
-- (scripts/week-points.ts, then WP3.4's comparability step) inserts with ON
-- CONFLICT DO NOTHING, which needs INSERT alone, and reports it. A corrected
-- method is a NEW method_version, read only once lib/config.ts WEEK_LINE names
-- it; the old rows stay. Both functions: SECURITY DEFINER with a pinned
-- search_path, execute revoked from public, anon and authenticated and granted
-- to service_role, because p_client is a parameter.
--
-- IDEMPOTENT. `if not exists`, `create or replace`, drop-then-create for the
-- policies; applied twice on a throwaway PG 17.11 cluster with an empty
-- catalogue diff and checked by scripts/pg-shim/mf4-checks.sql. No
-- CONCURRENTLY, no BEGIN/COMMIT: the runner wraps the file in one transaction.

-- =============================================================================
-- Part A (WP2.9) · the weekly volume bars
-- =============================================================================

-- Per week and per market audience: every ISO week that overlaps
-- [p_from, p_to), each read whole, Monday to Sunday (pass Mondays; a week is
-- never cut in half by a bound).
--   videos               distinct full-lane videos with a comment dated in the week
--   comments             those comments
--   comments_next_month  those dated in a month that starts inside the week
--                        (0 when the week lies inside one month)
--   under_5              videos with fewer than 5 comments dated in the week
--   median_dated,        the dated comments a video in the week, over the WHOLE
--   mean_dated           market (every audience row of the week), repeated on
--                        each of the week's rows and never combined: a median
--                        of medians is not the market's median, and the depth
--                        rule and the hover print the market's (the
--                        excluded_on_camera precedent, 20260915092000)
--   older_videos         videos uploaded before the previous week's Monday
--   unchecked            videos with a kept gate_verdicts admission whose source
--                        is 'default' (let in before we checked relevance; the
--                        same rule as measure-comparability's gate-fix reach)
-- p_captured_before: only comments first captured before it
-- (comments.created_at) count, in every column. A week with nothing returns no
-- row; the reader keeps its slot ("none gathered").
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
    select distinct g.platform, g.video_id
    from public.gate_verdicts g
    where g.client_id = p_client and g.kept and g.source = 'default'
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
  'Per ISO week (Monday, UTC, by comment date) overlapping [p_from, p_to) and per market audience (the client''s own posts dropped; full-lane videos): videos and comments dated in the week, those dated in a month that starts inside it, videos under 5, the market''s median and mean dated comments a video (repeated on each row of the week), older and unchecked videos. Only comments first captured before p_captured_before count. Counts only.';

revoke all on function public.market_week_volumes(uuid, date, date, timestamptz) from public, anon, authenticated;
grant execute on function public.market_week_volumes(uuid, date, date, timestamptz) to service_role;

-- =============================================================================
-- Part B (WP3.13) · the same-age weekly line: the cut, and the kept points
-- =============================================================================

-- One week's kind and subject readings at its age: the bodies of
-- window_kind_readings and window_subject_readings over [week, week + 7 days),
-- each with c.created_at < (week + 7 + p_age_days) at 00:00 UTC on BOTH sides:
--   n  the market's full-lane videos with a comment dated in the week and
--      first captured before the cut;
--   k  those of them one of whose comments dated in the week and captured
--      before the cut is cited (insight_evidence source 'comment') by an
--      audience_insights_current row of that kind, or by a member insight of
--      that subject (subject_memberships, non-retired subjects, over the base
--      insights table, as window_subject_readings reads it).
-- Split by the video's dated comments in the week at the cut: '1-4', '5-19',
-- '20+'. object_kind: kind | subject. Per audience; the caller pools. Every
-- object (each kind the tenant's current insights carry, each non-retired
-- subject) gets a row in every audience and band with videos, k = 0 included,
-- so pooling the rows gives the market's n for every object and k <= n holds
-- row by row (week_line_points' CHECK).
-- p_week is read as its ISO week (a Monday is expected); a null p_age_days
-- reads with no cut (today's corpus: the staging parity with decision M's
-- measurement). It reads CURRENT readings, which is why a point is kept when it
-- reaches its age and never recomputed from this function later.
create or replace function public.market_week_readings(
  p_client    uuid,
  p_week      date,
  p_age_days  int,
  p_video_ids uuid[] default null
)
returns table (audience text, object_kind text, object_id text, depth_band text, k int, n int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select w.w0::timestamp at time zone 'UTC' as t0,
           (w.w0 + 7)::timestamp at time zone 'UTC' as t1,
           case when p_age_days is null then null::timestamptz
                else (w.w0 + 7 + p_age_days)::timestamp at time zone 'UTC'
           end as cut
    from (select date_trunc('week', p_week)::date as w0) w
  ),
  vid as (
    select v.id, v.platform, v.video_id,
           case when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
      and v.is_client is not true
      and (p_video_ids is null or v.id = any(p_video_ids))
  ),
  wk as (
    select c.id as comment_id, v.id as video_uuid, v.audience
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    cross join bounds b
    where c.client_id = p_client
      and c.comment_date >= b.t0
      and c.comment_date <  b.t1
      and (b.cut is null or c.created_at < b.cut)
  ),
  per_video as (
    select w.video_uuid, w.audience,
           case when count(distinct w.comment_id) >= 20 then '20+'
                when count(distinct w.comment_id) >= 5  then '5-19'
                else '1-4'
           end as depth_band
    from wk w
    group by w.video_uuid, w.audience
  ),
  base as (
    select p.audience, p.depth_band, count(*)::int as n
    from per_video p
    group by p.audience, p.depth_band
  ),
  ins as (
    select 'kind'::text as object_kind, ai.category as object_id, ai.id as insight_id
    from public.audience_insights_current ai
    where ai.client_id = p_client
    union all
    select 'subject', m.subject_id::text, ai.id
    from public.subject_memberships m
    join public.subjects sub on sub.id = m.subject_id and sub.status <> 'retired'
    join public.audience_insights ai on ai.id = m.audience_insight_id
    where m.client_id = p_client and m.member and ai.client_id = p_client
  ),
  objects as (
    select distinct i.object_kind, i.object_id from ins i where i.object_kind = 'kind'
    union
    select 'subject', s.id::text
    from public.subjects s
    where s.client_id = p_client and s.status <> 'retired'
  ),
  hits as (
    select distinct i.object_kind, i.object_id, w.video_uuid
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join wk w on w.comment_id = ie.comment_id
  ),
  counts as (
    select h.object_kind, h.object_id, p.audience, p.depth_band, count(*)::int as k
    from hits h
    join per_video p on p.video_uuid = h.video_uuid
    group by h.object_kind, h.object_id, p.audience, p.depth_band
  )
  select b.audience, o.object_kind, o.object_id, b.depth_band, coalesce(c.k, 0), b.n
  from base b
  cross join objects o
  left join counts c
    on c.object_kind = o.object_kind and c.object_id = o.object_id
   and c.audience = b.audience and c.depth_band = b.depth_band
  order by b.audience, o.object_kind, o.object_id, b.depth_band
$$;

comment on function public.market_week_readings(uuid, date, int, uuid[]) is
  'One ISO week''s kind and subject readings over the market at its age: n the full-lane market videos with a comment dated in the week and first captured before week + 7 + p_age_days (00:00 UTC), k those whose cited comment (dated in the week, captured before the cut) belongs to the kind or subject, per audience and per depth band (1-4, 5-19, 20+). Every object in every band with videos, k = 0 included. Reads current readings: keep a point when it comes of age; never recompute it.';

-- One row per week kept at its age: the conditions it was read under, so a
-- pair can be judged "read the same way" (lib/reading/week-line.ts weekPairOf)
-- long after the corpus has moved on. Append-only.
create table if not exists public.week_line_reads (
  client_id        uuid not null references public.clients(id) on delete cascade,
  week             date not null,
  age_days         int not null check (age_days in (14, 21)),
  captured_before  timestamptz not null,
  read_through_run uuid references public.pipeline_runs(id) on delete set null,
  -- {runs_in_week, runs_after: [a, b], late_run, videos, mean_dated, median_dated,
  --  bands: [a, b, c], unchecked, older_videos, prompt_version, lane_rule, rescrape_capped}
  conditions       jsonb not null,
  method_version   text not null,
  -- When the point was read (kept from the capture file), not when it landed.
  computed_at      timestamptz not null,
  recorded_at      timestamptz not null default now(),
  primary key (client_id, week, age_days, method_version),
  -- Guards the plan does not pin: a week is its Monday, and the conditions are
  -- one object.
  constraint week_line_reads_monday_check check (extract(isodow from week) = 1),
  constraint week_line_reads_conditions_check check (jsonb_typeof(conditions) = 'object')
);

comment on table public.week_line_reads is
  'Each week kept at its age for the same-age weekly line (decision M): the capture cut, the update it was read through, and the conditions it was read under. Written once per week, age and method version; never recomputed. Append-only.';

-- k and n per depth band at the age cut, per audience and object. Append-only.
create table if not exists public.week_line_points (
  client_id      uuid not null,
  week           date not null,
  age_days       int not null,
  method_version text not null,
  audience       text not null,
  object_kind    text not null check (object_kind in ('kind', 'subject')),
  object_id      text not null,
  depth_band     text not null check (depth_band in ('1-4', '5-19', '20+')),
  k              int not null check (k >= 0),
  n              int not null check (n >= k),
  primary key (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band),
  foreign key (client_id, week, age_days, method_version)
    references public.week_line_reads (client_id, week, age_days, method_version) on delete cascade
);

comment on table public.week_line_points is
  'The kept same-age points: per week, age, method version, audience, kind or subject and depth band, the videos with a cited comment (k) of the videos with a comment (n) at the week''s age cut. Written once with their read; never recomputed. Append-only.';

-- Part B's RLS, policies and grants (MF1's conventions) ---------------------------

alter table public.week_line_reads  enable row level security;
alter table public.week_line_points enable row level security;

drop policy if exists "Members read their week line reads" on public.week_line_reads;
create policy "Members read their week line reads" on public.week_line_reads
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their week line points" on public.week_line_points;
create policy "Members read their week line points" on public.week_line_points
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.week_line_reads, public.week_line_points from anon, authenticated;

-- Column-level SELECT. Neither table holds operator words.
grant select (client_id, week, age_days, captured_before, read_through_run, conditions, method_version,
              computed_at, recorded_at)
  on public.week_line_reads to authenticated;
grant select (client_id, week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n)
  on public.week_line_points to authenticated;

grant select, insert on public.week_line_reads, public.week_line_points to service_role;
revoke update, delete, truncate on public.week_line_reads, public.week_line_points from service_role;

revoke all on function public.market_week_readings(uuid, date, int, uuid[]) from public, anon, authenticated;
grant execute on function public.market_week_readings(uuid, date, int, uuid[]) to service_role;
