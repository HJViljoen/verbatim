-- MF2 · market-first Stage 2 (plan §4.1, §4.2; WP2.3 part A, WP2.6 part B,
-- WP2.7 part C, WP2.1; applied by Heinrich, Tue 6 Oct, through
-- scripts/apply-market-first-migrations.sh --set mf2, with MF4 in the same
-- Terminal session).
--
-- WHAT IT ADDS. New tables and functions and one widened CHECK; no month
-- table, no existing audience CASE body and no existing function signature
-- changes (plan §4.1).
--   part A (WP2.3)  function lens_readings (the five month reads over a chosen
--                   video set, a depth floor and a capture cut-off);
--                   table comparability_checks
--   part B (WP2.6)  table brand_mentions; function brand_mention_candidates
--   part C (WP2.7)  function update_arrivals
--   CHECK  (WP2.1)  sent_figures_object_kind_check gains 'mood', 'brand' and
--                   'denominator'. recordSend is non-fatal (run.ts:495), so a
--                   kind the CHECK refused would silently lose its rows.
--
-- THE CONVENTIONS ARE MF1's (20260928090000_market_first_s1.sql, Phase 1 plan
-- §2). Every table: RLS on, a get_my_client_id() select policy, every
-- privilege revoked from anon and authenticated and then column-level SELECT
-- for authenticated, service_role insert and select. UPDATE, DELETE and
-- TRUNCATE are revoked from service_role on both tables here: rows written by
-- market-first scripts are append-only and versioned (plan §4.0, rollback rule
-- 4), so a newer row supersedes an older one (comparability_checks: the newest
-- computed_at; brand_mentions: a new rule_version, and in Stage 3 a confirm
-- verdict is a row of its own version, never an edit). A foreign-key cascade
-- still works, because referential actions run as the table owner. Every
-- function: SECURITY DEFINER with a pinned search_path, execute revoked from
-- public, anon and authenticated and granted to service_role, because p_client
-- is a parameter.
--
-- THE AUDIENCE KEY. lens_readings reproduces stored month rows, so it builds
-- the audience with the same three-way CASE as monthly_denominators and its
-- siblings (client, 'competitor:' || coalesce(competitor_name, 'unknown'),
-- 'industry-other'), byte for byte; the caller pools the market (decision E,
-- lib/reading/market.ts). update_arrivals reads the market itself, so it drops
-- the client arm the way MF1's market_month_videos does.
--
-- IDEMPOTENT. `if not exists`, `create or replace`, drop-then-create for the
-- policies and the CHECK; applied twice on a throwaway PG 17.11 cluster with an
-- empty catalogue diff (scripts/pg-shim/throwaway.sh twice) and checked by
-- scripts/pg-shim/mf2-checks.sql. No CONCURRENTLY, no BEGIN/COMMIT: the runner
-- wraps the file in one transaction.

-- =============================================================================
-- Part A (WP2.3) · the lens reading and the re-check's results
-- =============================================================================

-- The month's readings over a chosen set of videos, for decision D's secondary
-- line (the re-check) and the per-kind maker tags. The bodies of
-- monthly_denominators (M13), monthly_subject_readings (M4),
-- monthly_kind_readings and the mood half of monthly_audience_stats (M5), and
-- monthly_theme_readings, for ONE month, per audience, with three filters on
-- every half:
--   p_video_ids            only these videos (null: every video);
--   p_min_dated_comments   only videos with at least this many comments dated
--                          in the month (the HAVING; 20 is the dense20 lens);
--   p_captured_before      only comments first captured before this instant
--                          (comments.created_at is first capture: the gather's
--                          upsert never writes it), on n and k alike: the
--                          same-age comparison and the frozen-month pin.
-- With the three at their defaults it returns the stored month's numbers, row
-- for row (scripts/pg-shim/mf2-checks.sql holds the parity on a synthetic
-- tenant; WP2.3 holds it on staging). Readings (sentiment, insights,
-- memberships) are today's, as the month functions' are: only the comments are
-- cut, which is why a point is kept when it is read (MF4 part B).
--
-- ROWS. Per audience; the caller pools.
--   denominator  object_id 'videos' | 'comments': the count (k = n = the
--                count; a count has no share). The month_denominators set:
--                full-lane videos (analyzed_lane = 'full').
--   subject      object_id subjects.id; k = its videos (the month rule: cited
--                comments dated in the month, and on-camera-only members on a
--                video that occupies the month); n = the audience's
--                denominator videos. Retired subjects are not read.
--   kind         object_id the insight kind; k and n as for a subject.
--   theme        object_id theme_registry.id of p_run's clustering (null
--                p_run: no theme rows); the CATEGORY bucket only (audience
--                'industry-other'), n the category's denominator videos.
--   mood         object_id positive | negative | neutral | mixed: k = that
--                mood's videos, n = judged; 'framing': k = judged_framing,
--                n = judged + judged_framing (lib/reading/mood.ts
--                framingShare). Over monthly_audience_stats' own video set
--                (analysed videos) and its provenance CASE.
-- An object row exists only where k > 0, as a stored month row does; a
-- missing object reads 0 over the audience's denominator row.
create or replace function public.lens_readings(
  p_client             uuid,
  p_month              date,
  p_run                uuid,
  p_video_ids          uuid[]      default null,
  p_min_dated_comments int         default 1,
  p_captured_before    timestamptz default null
)
returns table (audience text, object_kind text, object_id text, k int, n int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select (date_trunc('month', p_month)::date)::timestamp at time zone 'UTC' as t0,
           ((date_trunc('month', p_month) + interval '1 month')::date)::timestamp at time zone 'UTC' as t1
  ),
  vid_all as (
    select v.id, v.platform, v.video_id,
           v.analyzed_run_id is not null as analysed,
           coalesce(v.analyzed_lane = 'full', false) as readable,
           v.sentiment, v.sentiment_source, v.analyzed_lane,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and (p_video_ids is null or v.id = any(p_video_ids))
  ),
  -- Every comment dated in the month and first captured before the cut. The
  -- join is the (client_id, platform, video_id) triple, as in every month read.
  dated as (
    select c.id as comment_id, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id
    cross join bounds b
    where c.client_id = p_client
      and c.comment_date >= b.t0
      and c.comment_date <  b.t1
      and (p_captured_before is null or c.created_at < p_captured_before)
  ),
  -- The HAVING: the videos that occupy the month at the requested depth. Every
  -- half below reads only these, so k and n are cut the same way.
  depth as (
    select d.video_uuid, count(distinct d.comment_id) as dated
    from dated d
    group by d.video_uuid
    having count(distinct d.comment_id) >= greatest(coalesce(p_min_dated_comments, 1), 1)
  ),
  -- monthly_denominators: full-lane videos only (M13, the comments Pass A read).
  denom as (
    select v.audience,
           count(distinct d.video_uuid)::int as videos,
           count(distinct d.comment_id)::int as comments
    from dated d
    join depth e on e.video_uuid = d.video_uuid
    join vid_all v on v.id = d.video_uuid and v.readable
    group by v.audience
  ),
  -- The three object populations, each exactly as its month function reads
  -- it: subjects from subject_memberships (non-retired subjects, member rows)
  -- over the BASE insights table, kinds over audience_insights_current, themes
  -- from p_run's theme_observations over the base table (id-set lookups stay on
  -- the base table, AGENTS.md).
  ins as (
    select 'subject'::text as object_kind, m.subject_id::text as object_id,
           ai.id as insight_id, ai.source_video_id
    from public.subject_memberships m
    join public.subjects sub on sub.id = m.subject_id and sub.status <> 'retired'
    join public.audience_insights ai on ai.id = m.audience_insight_id
    where m.client_id = p_client and m.member and ai.client_id = p_client
    union all
    select 'kind', ai.category, ai.id, ai.source_video_id
    from public.audience_insights_current ai
    where ai.client_id = p_client
    union all
    select 'theme', o.theme_id::text, ai.id, ai.source_video_id
    from public.theme_observations o
    cross join lateral unnest(o.member_insight_ids) u(insight_id)
    join public.audience_insights ai on ai.id = u.insight_id
    where p_run is not null and o.client_id = p_client and o.run_id = p_run and ai.client_id = p_client
  ),
  -- The cited arm: a member insight's evidence comment, dated in the month and
  -- captured before the cut, counted on THAT comment's video (analysed).
  cited as (
    select i.object_kind, i.object_id, v.audience, v.id as video_uuid
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join dated d on d.comment_id = ie.comment_id
    join depth e on e.video_uuid = d.video_uuid
    join vid_all v on v.id = d.video_uuid and v.analysed
  ),
  -- The on-camera arm: a member whose only evidence is spoken on camera or on
  -- the cover frame counts on its own video when that video occupies the month.
  oncam as (
    select i.object_kind, i.object_id, v.audience, v.id as video_uuid
    from ins i
    join vid_all v on v.id = i.source_video_id and v.analysed
    join depth e on e.video_uuid = v.id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  objects as (
    select x.object_kind, x.object_id, x.audience, count(distinct x.video_uuid)::int as k
    from (select * from cited union select * from oncam) x
    where x.object_kind <> 'theme' or x.audience = 'industry-other'
    group by x.object_kind, x.object_id, x.audience
  ),
  -- The mood half of monthly_audience_stats: its video set (analysed videos
  -- with a comment dated in the month) and its provenance CASE, arm for arm.
  judged_rows as (
    select v.audience, v.sentiment,
           case
             when v.sentiment_source = 'audience' then true
             when v.sentiment_source = 'framing'  then false
             else coalesce(v.analyzed_lane, '') = 'full'
           end as is_audience
    from depth e
    join vid_all v on v.id = e.video_uuid and v.analysed
    where v.sentiment in ('positive', 'negative', 'neutral', 'mixed')
  ),
  mood as (
    select j.audience,
           (count(*) filter (where j.is_audience))::int                              as judged,
           (count(*) filter (where j.is_audience and j.sentiment = 'positive'))::int as positive,
           (count(*) filter (where j.is_audience and j.sentiment = 'negative'))::int as negative,
           (count(*) filter (where j.is_audience and j.sentiment = 'neutral'))::int  as neutral,
           (count(*) filter (where j.is_audience and j.sentiment = 'mixed'))::int    as mixed,
           (count(*) filter (where not j.is_audience))::int                          as judged_framing
    from judged_rows j
    group by j.audience
  )
  select r.audience, r.object_kind, r.object_id, r.k, r.n
  from (
    select d.audience, 'denominator'::text as object_kind, 'videos'::text as object_id, d.videos as k, d.videos as n
    from denom d
    union all
    select d.audience, 'denominator', 'comments', d.comments, d.comments
    from denom d
    union all
    select o.audience, o.object_kind, o.object_id, o.k, coalesce(dn.videos, 0)
    from objects o
    left join denom dn on dn.audience = o.audience
    union all
    select mo.audience, 'mood', x.mood, x.k, mo.judged
    from mood mo
    cross join lateral (values ('positive', mo.positive), ('negative', mo.negative),
                               ('neutral', mo.neutral), ('mixed', mo.mixed)) x(mood, k)
    union all
    select mo.audience, 'mood', 'framing', mo.judged_framing, mo.judged + mo.judged_framing
    from mood mo
  ) r
  order by r.audience, r.object_kind, r.object_id
$$;

comment on function public.lens_readings(uuid, date, uuid, uuid[], int, timestamptz) is
  'One month''s denominator, subject, kind, theme (category, p_run) and mood readings per audience, over only p_video_ids, only videos with p_min_dated_comments dated comments, and only comments first captured before p_captured_before. With the defaults: the stored month rows. Denominator rows are counts (k = n); an object row exists where k > 0.';

-- The re-check's results (decision D's secondary line, WP2.3): one row per
-- object per population per computation. Derived and recomputable; the newest
-- computed_at wins, and a recompute is a new row.
create table if not exists public.comparability_checks (
  client_id         uuid not null references public.clients(id) on delete cascade,
  prev_month        date not null,
  month             date not null,
  population        text not null check (population in (
                      'all', 'same_searches', 'same_searches_clean', 'dense20', 'equal_age', 'all_but_noise')),
  object_kind       text not null check (object_kind in ('denominator', 'subject', 'kind', 'mood', 'theme', 'brand')),
  object_id         text not null,
  k_prev            int,
  n_prev            int,
  k_curr            int,
  n_curr            int,
  -- The population's maker and noise shares, printed beside every result.
  population_makers numeric,
  population_noise  numeric,
  -- The Verdict as bandVerdict returned it (lib/reading/verdicts.ts).
  verdict           jsonb not null,
  outcome           text not null check (outcome in ('moved', 'no_clear_change', 'too_few', 'follows_depth')),
  read_through_run  uuid,
  method_version    text not null,
  computed_at       timestamptz not null default now(),
  primary key (client_id, prev_month, month, population, object_kind, object_id, computed_at),
  -- Guards the plan does not pin, added so a writer's slip is refused rather
  -- than stored: the pair runs forward, each side is a count inside its
  -- base, the two shares are shares, and the verdict is a Verdict object.
  constraint comparability_checks_pair_check check (prev_month < month),
  constraint comparability_checks_prev_side_check
    check ((n_prev is null or n_prev >= 0) and (k_prev is null or (n_prev is not null and k_prev between 0 and n_prev))),
  constraint comparability_checks_curr_side_check
    check ((n_curr is null or n_curr >= 0) and (k_curr is null or (n_curr is not null and k_curr between 0 and n_curr))),
  constraint comparability_checks_shares_check
    check ((population_makers is null or population_makers between 0 and 1)
       and (population_noise  is null or population_noise  between 0 and 1)),
  constraint comparability_checks_verdict_check check (jsonb_typeof(verdict) = 'object')
);

comment on table public.comparability_checks is
  'The re-check of a refused month pair on a narrower population (the searches both months ran without makers and off-topic videos, well-read videos, equal age, all but noise): both sides, the population''s maker and noise shares, the verdict and its outcome. Derived; append-only; the newest computed_at wins.';

-- =============================================================================
-- Part B (WP2.6) · brands counted in every video they come up in
-- =============================================================================

-- A brand comes up in a video when its content names it (account, caption,
-- hashtags, transcript, its English translation, on-screen text) or when a
-- comment on it does; each match is checked for other meanings before it
-- counts (decision E). Derived and versioned; not a month table: a brand's
-- month count is read at read time from these rows and the month's market set.
-- ONE content row per video, brand and rule version (the unique index): the
-- writer picks the field it records; brand_mention_candidates lists every
-- field that matched, for the hand check.
create table if not exists public.brand_mentions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  video_id      uuid not null references public.videos(id) on delete cascade,
  -- 'client' | competitors.id::text | 'watched:<slug>' (Stage 3). An identity,
  -- never the 'competitor:<name>' audience string, which a rename splits.
  brand_key     text not null,
  source        text not null check (source in ('content', 'comment')),
  -- account | caption | hashtags | transcript | transcript_en | ocr (content)
  field         text,
  comment_id    uuid references public.comments(id) on delete cascade,
  comment_month date,
  method        text not null check (method in ('rule', 'confirmed', 'rejected')),
  rule_version  text not null,
  found_at      timestamptz not null default now(),
  -- Guards the plan does not pin: the key is an identity, a content row names
  -- its field and no comment, a comment row names its comment and that
  -- comment's month (the first of it), and the version is named.
  constraint brand_mentions_brand_key_check check (
    brand_key = 'client'
    or brand_key like 'watched:_%'
    or brand_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint brand_mentions_source_shape_check check (
    (source = 'content' and comment_id is null and comment_month is null
       and field in ('account', 'caption', 'hashtags', 'transcript', 'transcript_en', 'ocr'))
    or (source = 'comment' and comment_id is not null and comment_month is not null)),
  constraint brand_mentions_comment_month_check check (
    comment_month is null or comment_month = date_trunc('month', comment_month)::date),
  constraint brand_mentions_rule_version_check check (rule_version <> '')
);
create unique index if not exists brand_mentions_uniq on public.brand_mentions
  (client_id, video_id, brand_key, source, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_version);

comment on table public.brand_mentions is
  'Every video a tracked, client or watched brand comes up in: named in the video''s content, or in a comment on it (with the comment''s month). Derived and versioned; append-only: a new rule version or a confirm verdict is a row of its own, never an edit.';

-- The candidates for one brand pattern (POSIX ARE, matched case-insensitively;
-- the caller builds it from lib/brands/aliases.ts): every content field of the
-- window's readable videos (full lane, any audience, the client's own posts
-- included so the caller can count them as own posts) that matches, and every
-- comment dated in [p_from, p_to) on a readable video that matches. The window's
-- readable videos are those with a comment dated in it: the videos a month in
-- the window can count. excerpt: at most 160 characters around the first hit,
-- for the hand check only; it is returned, never stored. An empty or null
-- pattern returns nothing.
create or replace function public.brand_mention_candidates(p_client uuid, p_pattern text, p_from date, p_to date)
returns table (video_id uuid, source text, field text, comment_id uuid, comment_month date, excerpt text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select p_from::timestamp at time zone 'UTC' as t0,
           p_to::timestamp   at time zone 'UTC' as t1
  ),
  vid as (
    select v.id, v.platform, v.video_id, v.account_name, v.caption, v.hashtags,
           v.transcript, v.transcript_en, v.ocr_text
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
      and coalesce(p_pattern, '') <> ''
  ),
  wcom as (
    select c.id, v.id as video_uuid, c.text, c.comment_date
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    cross join bounds b
    where c.client_id = p_client
      and c.comment_date >= b.t0
      and c.comment_date <  b.t1
  ),
  hits as (
    select v.id as video_uuid, f.field, f.body
    from vid v
    cross join lateral (values ('account', v.account_name),
                               ('caption', v.caption),
                               ('hashtags', array_to_string(v.hashtags, ' ')),
                               ('transcript', v.transcript),
                               ('transcript_en', v.transcript_en),
                               ('ocr', v.ocr_text)) f(field, body)
    where exists (select 1 from wcom w where w.video_uuid = v.id)
      and f.body ~* p_pattern
  )
  select h.video_uuid, 'content'::text, h.field, null::uuid, null::date,
         substr(h.body, greatest(regexp_instr(h.body, p_pattern, 1, 1, 0, 'i') - 60, 1), 160)
  from hits h
  union all
  select w.video_uuid, 'comment', null, w.id,
         date_trunc('month', w.comment_date at time zone 'UTC')::date,
         substr(w.text, greatest(regexp_instr(w.text, p_pattern, 1, 1, 0, 'i') - 60, 1), 160)
  from wcom w
  where w.text ~* p_pattern
$$;

comment on function public.brand_mention_candidates(uuid, text, date, date) is
  'Content fields of the window''s readable videos, and comments dated in [p_from, p_to) on readable videos, that match p_pattern (case-insensitive), with an excerpt of at most 160 characters around the first hit for the hand check. Never writes.';

-- =============================================================================
-- Part C (WP2.7) · what came in with this update
-- =============================================================================

-- For each month in p_months: the market's videos first stored by p_run that
-- had a comment dated in the month by the end of the run, and the market's
-- comments dated in the month first captured by p_run. Counts that add to
-- months, never a week-alone verdict (§9.1 #5).
--
-- "BY p_run" IS A SPAN OF TIME, because both stamps are first-capture stamps
-- (videos.scraped_at and comments.created_at are insert defaults the gather's
-- upserts never write) while the run ids on those rows are overwritten by every
-- later run that re-reads them. The span runs from the previous update's finish
-- (the newest completed or partial run of the tenant finishing before p_run
-- does, lib/reading/read.ts loadUpdateRuns) to p_run's finish: what came in
-- since the last update. A failed run's captures fall into the next update's
-- span; a run that has not finished reads what has arrived so far. A run that
-- is not the tenant's returns no rows (not zeros).
--
-- The market: full-lane videos (the month denominator's set), not the client's
-- own posts (decision E, MF1's market_month_videos). So comments_captured adds
-- up, update after update, to the month's market comments; videos_first_read
-- counts only the videos new to the corpus, not an older video whose first
-- comment in the month arrived with this update.
create or replace function public.update_arrivals(p_client uuid, p_run uuid, p_months date[])
returns table (month date, videos_first_read int, comments_captured int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with run as (
    select coalesce(r.completed_at, r.started_at) as at,
           coalesce(r.completed_at, 'infinity'::timestamptz) as hi
    from public.pipeline_runs r
    where r.id = p_run and r.client_id = p_client
  ),
  span as (
    select coalesce((select max(coalesce(p.completed_at, p.started_at))
                       from public.pipeline_runs p
                      where p.client_id = p_client
                        and p.id <> p_run
                        and p.status in ('completed', 'partial')
                        and coalesce(p.completed_at, p.started_at) < run.at),
                    '-infinity'::timestamptz) as lo,
           run.hi
    from run
  ),
  months as (
    select distinct date_trunc('month', u.m)::date as m0
    from unnest(p_months) u(m)
    where u.m is not null
  ),
  vid as (
    select v.id, v.platform, v.video_id, v.scraped_at
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
      and v.is_client is not true
  ),
  cm as (
    select mo.m0, c.id as comment_id, c.created_at, v.id as video_uuid, v.scraped_at
    from months mo
    join public.comments c
      on c.client_id = p_client
     and c.comment_date >= mo.m0::timestamp at time zone 'UTC'
     and c.comment_date <  (mo.m0 + interval '1 month')::date::timestamp at time zone 'UTC'
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    cross join span s
    where c.created_at <= s.hi
  )
  select mo.m0,
         (select count(distinct cm.video_uuid) from cm
           where cm.m0 = mo.m0 and cm.scraped_at > s.lo and cm.scraped_at <= s.hi)::int,
         (select count(*) from cm
           where cm.m0 = mo.m0 and cm.created_at > s.lo)::int
  from months mo
  cross join span s
  order by mo.m0
$$;

comment on function public.update_arrivals(uuid, uuid, date[]) is
  'Per requested month: the market videos first stored since the previous update and by p_run''s finish that carry a comment dated in the month, and the market comments dated in the month first captured in that span. No rows for a run that is not the tenant''s.';

-- =============================================================================
-- RLS, policies and grants (MF1's conventions)
-- =============================================================================

alter table public.comparability_checks enable row level security;
alter table public.brand_mentions       enable row level security;

drop policy if exists "Members read their comparability checks" on public.comparability_checks;
create policy "Members read their comparability checks" on public.comparability_checks
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their brand mentions" on public.brand_mentions;
create policy "Members read their brand mentions" on public.brand_mentions
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.comparability_checks, public.brand_mentions from anon, authenticated;

-- Column-level SELECT. Neither table holds operator words: every column is a
-- reading the product prints or joins on.
grant select (client_id, prev_month, month, population, object_kind, object_id, k_prev, n_prev, k_curr, n_curr,
              population_makers, population_noise, verdict, outcome, read_through_run, method_version, computed_at)
  on public.comparability_checks to authenticated;
grant select (id, client_id, video_id, brand_key, source, field, comment_id, comment_month, method, rule_version, found_at)
  on public.brand_mentions to authenticated;

grant select, insert on public.comparability_checks, public.brand_mentions to service_role;
revoke update, delete, truncate on public.comparability_checks, public.brand_mentions from service_role;

revoke all on function public.lens_readings(uuid, date, uuid, uuid[], int, timestamptz) from public, anon, authenticated;
revoke all on function public.brand_mention_candidates(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.update_arrivals(uuid, uuid, date[]) from public, anon, authenticated;
grant execute on function public.lens_readings(uuid, date, uuid, uuid[], int, timestamptz) to service_role;
grant execute on function public.brand_mention_candidates(uuid, text, date, date) to service_role;
grant execute on function public.update_arrivals(uuid, uuid, date[]) to service_role;

-- =============================================================================
-- WP2.1 · three more object kinds a sent figure may be about
-- =============================================================================
-- 'mood' (a mood share of the judged videos), 'brand' (a brand_mentions
-- brand_key) and 'denominator' (a count the month's market is read over). The
-- list is 20260918098000's five plus these three; lib/market-first-migrations.test.ts
-- pins lib/reports/sent-figures.ts SentObjectKind inside it.
alter table public.sent_figures drop constraint if exists sent_figures_object_kind_check;
alter table public.sent_figures add constraint sent_figures_object_kind_check
  check (object_kind in (
    'subject','theme','rival','kind','figure',
    'mood','brand','denominator'));

comment on column public.sent_figures.object_kind is
  'subject | theme | rival | kind | figure | mood | brand | denominator. ''figure'' means object_id is a figure TOKEN and the row is about no object: the artefact-level numbers (a month''s own denominator) that "the report of {date} read X" is most often about. ''mood'' is a mood share of the judged videos, ''brand'' a brand_mentions brand_key, ''denominator'' a count the month''s market is read over (MF2, market-first WP2.1).';
