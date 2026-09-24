-- M13 · the audience denominator counts the comments Pass A READ, not the
-- comments it was handed. (Phase 1, fix/client-audience, 2026-09-24.)
--
-- WHAT WAS WRONG. `monthly_denominators`, `window_denominators` and
-- `window_span_denominators` each opened with `where v.analyzed_run_id is not
-- null`, under a comment that gave the right reason for the wrong test:
-- "counting it would put a denominator under a numerator that can never reach
-- it". `analyzed_run_id` is set by BOTH Pass A lanes. The claims lane
-- (lib/pipeline/pass-a.ts passALane) enters with NO comments in the prompt — it
-- exists to read a brand-side transcript for claims — so a claims-lane video's
-- comments are in n and structurally absent from k. So are a skip-lane video's.
--
-- MEASURED, read-only, on the Phase 1 preview branch 2026-09-24. The rows
-- below are SEALAND's -- this block said "both tenants" and gave one tenant's
-- numbers, which is a mislabel worth correcting because these are the figures
-- the decision rests on. Both tenants, and then each:
--
--   lane           both tenants          Ossur              Sealand
--   full           2,303 v / 6,848 i   1,222 / 3,129     1,081 / 3,719
--   claims_only      588 v /     0 i     290 /     0       298 /     0
--   skip             278 v /     0 i     187 /     0        91 /     0
--
-- The CLAIM holds on both and on each, which is the only thing that had to:
-- a claims-lane and a skip-lane video carry ZERO audience insights, always.
-- (Counted over audience_insights_current joined on source_video_id.)
--
-- and on Sealand's own audiences, all-time dated comments:
--   client            16 videos /   194 comments  ->   8 /   126
--   industry-other 1,104 videos / 30,268 comments -> 1,012 / 29,581
--   Cotopaxi          63 /   912 -> 38 / 795    Patagonia 11 / 208 -> 5 / 122
--   Freitag           14 /   169 ->  9 / 148    North Face 12 / 78 -> 6 / 44
-- September 2026's `client` audience-month was 4 videos / 40 comments / 0
-- themes; every one of those four videos is claims-only, so the month now reads
-- 0 / 0 — "we could not read this" rather than a 0% share printed as a finding.
-- The "You" share on every subject was being divided by a denominator 54%
-- larger than the readable one.
--
-- WHAT THIS DOES NOT TOUCH. `monthly_theme_readings`, `window_theme_readings`,
-- the subject, kind and evidence-ref readings all use the same predicate as a
-- JOIN FILTER on videos that produced insights; a claims-lane video has none,
-- so the filter is already a no-op there and the functions are left alone
-- rather than churned. `monthly_audience_stats` counts `videos.sentiment`,
-- which the claims lane leaves untouched (lib/pipeline/pass-a.ts omits
-- `sentiment` entirely on that lane), so its `judged` is already right.
--
-- ONE RESIDUAL THERE, NAMED RATHER THAN CHASED. `monthly_audience_stats`
-- (20260918094000_kind_mood_attention.sql) still opens on `analyzed_run_id is
-- not null`, under a comment calling it "The month_denominators video set,
-- exactly". After this file the two sets differ: `judged` is unaffected for
-- the reason above, but `judged_framing`, `panel_videos` and
-- `attention_comments` are counted over the wider set. NOTHING RENDERED MIXES
-- THEM -- `framingShare` (lib/reading/mood.ts) is a ratio inside one stats
-- row, and `attentionSplit` / `standings` divide by `attentionTotals`, never
-- by a denominator row -- so this is a stale sentence in an APPLIED migration
-- and not a wrong number. It is recorded here instead of edited there: that
-- comment sits inside a function body, so changing it would change
-- `pg_get_functiondef` on a file already applied to the branch and break the
-- byte-identical catalogue diff the thirteen were checked with.
--
-- A SECOND RESIDUAL, IN THE OTHER DIRECTION, AND IT IS THIS FILE'S OWN RULE
-- BENDING. A video that hit PASS_A_MAX_OUTPUT_TOKENS is re-asked once on half
-- its comments (lib/pipeline/pass-a.ts lengthRetryRefs) and is still stamped
-- `analyzed_lane = 'full'`, so every one of its comments enters n while only
-- half were ever in a prompt -- the same shape as the claims-lane defect, at a
-- few videos a run rather than 298. Not worth a column: the honest fix would
-- be to record how many comments a video was actually read on, and that is a
-- schema change with its own migration. It is reported instead -- the run
-- records a finding naming the count (`noteFinding('pass-a', …)`), so a month
-- read over a run that retried is explainable after the fact.
--
-- FROZEN MONTHS ARE NOT REWRITTEN. The three guards stand: a frozen
-- audience-month keeps the number that was read at the time. Only `filling`
-- months and future reads take the corrected denominator, which is what the
-- freeze is for.
--
-- The bodies below are the shipped bodies, byte-for-byte, with one predicate
-- and its comment changed. Nothing else in them moved.

create or replace function public.monthly_denominators(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  month            date,
  audience         text,
  videos           int,
  comments         int,
  platform_mix     jsonb,
  dual_mention     int,
  excluded_undated int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid as (
    -- Only videos whose COMMENTS WERE READ count. `analyzed_run_id is not
    -- null` was the old test and it kept the claims lane in: a claims-only
    -- video enters Pass A with no comments in the prompt (lib/pipeline/pass-a.ts
    -- passALane), so its comments land in n and can never land in k — exactly
    -- the thing the old comment said it was avoiding. `analyzed_lane = 'full'`
    -- is that rule stated; lib/pipeline/pass-a.ts COMMENTS_READ_LANE is its
    -- one TypeScript copy and pass-a.test.ts pins the two together.
    select v.id, v.platform, v.video_id,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
  ),
  -- The tenant's tracked rival names, folded the way lib/gather/util.ts fold()
  -- folds them: lowercase, diacritics stripped ('Össur' -> 'ossur'). The
  -- combining-mark range is written as ARE escapes, not as the marks
  -- themselves: this file is applied by hand through the Supabase MCP, and a
  -- copy, a paste or an editor normalising invisible bytes would change the
  -- fold with no error raised anywhere.
  rivals as (
    select distinct regexp_replace(normalize(lower(cn), NFD), '[\u0300-\u036f]', '', 'g') as name
    from public.tracking_configs tc, unnest(coalesce(tc.competitor_names, '{}'::text[])) cn
    where tc.client_id = p_client and coalesce(cn, '') <> ''
  ),
  -- The client's own videos that also name a rival, over the same haystack
  -- lib/gather/tagging.ts matchEntities reads: account + caption + hashtags.
  -- There is no "mentions both" column in the schema; the naive fallback the
  -- plan allows (is_client AND competitor_name is not null) is 0 on every row
  -- in production, because tagVideo gives the client tag priority and clears
  -- competitor_name when it fires. This rule finds the 24 Össur videos that
  -- fallback would have missed.
  dual as (
    select v.id
    from public.videos v
    where v.client_id = p_client
      and v.is_client
      and exists (
        select 1 from rivals r
        -- A plain substring test, which is what matchEntities does in JS
        -- (hay.includes(fold(name)), no word boundary). NOT like '%'||name||'%':
        -- competitor_names is free text a tenant types in Settings, and a name
        -- holding _ or % would be a LIKE wildcard — silently inflating a count
        -- that then freezes. Today's four names are clean; the next one need
        -- not be.
        where position(r.name in regexp_replace(
                normalize(lower(coalesce(v.account_name, '') || ' ' || coalesce(v.caption, '') || ' ' ||
                                coalesce(array_to_string(v.hashtags, ' '), '')), NFD),
                '[\u0300-\u036f]', '', 'g')) > 0
      )
  ),
  -- comments.video_id is the PLATFORM id (text), never videos.id: the join is
  -- the (client_id, platform, video_id) triple and nothing else.
  dated as (
    select date_trunc('month', c.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid, v.platform, c.id as comment_id
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client
      and c.comment_date >= p_from
      and c.comment_date <  p_to
  ),
  base as (
    select d.month, d.audience,
           count(distinct d.video_uuid) as videos,
           count(distinct d.comment_id) as comments
    from dated d group by 1, 2
  ),
  per_platform as (
    select d.month, d.audience, d.platform, count(distinct d.video_uuid) as n
    from dated d group by 1, 2, 3
  ),
  mix as (
    select p.month, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2
  ),
  duals as (
    select d.month, d.audience, count(distinct d.video_uuid) as dual_mention
    from dated d join dual on dual.id = d.video_uuid group by 1, 2
  ),
  undated_per_video as (
    select v.id as video_uuid, count(*) as n
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client and c.comment_date is null
    group by 1
  ),
  -- Undated comments belong to no month, so they are recorded against every
  -- month their video does occupy: "this month's videos also carry N comments
  -- nobody could date". A property of the row, never a sum across rows.
  undated as (
    select s.month, s.audience, sum(u.n) as excluded_undated
    from (select distinct d.month, d.audience, d.video_uuid from dated d) s
    join undated_per_video u on u.video_uuid = s.video_uuid
    group by 1, 2
  )
  select b.month,
         b.audience,
         b.videos::int,
         b.comments::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(dm.dual_mention, 0)::int,
         coalesce(un.excluded_undated, 0)::int
  from base b
  left join mix   m  on m.month  = b.month and m.audience  = b.audience
  left join duals dm on dm.month = b.month and dm.audience = b.audience
  left join undated un on un.month = b.month and un.audience = b.audience
  order by b.month, b.audience
$$;

create or replace function public.window_denominators(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  audience         text,
  videos           int,
  comments         int,
  platform_mix     jsonb,
  dual_mention     int,
  excluded_undated int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid as (
    -- Only videos whose COMMENTS WERE READ count. `analyzed_run_id is not
    -- null` was the old test and it kept the claims lane in: a claims-only
    -- video enters Pass A with no comments in the prompt (lib/pipeline/pass-a.ts
    -- passALane), so its comments land in n and can never land in k — exactly
    -- the thing the old comment said it was avoiding. `analyzed_lane = 'full'`
    -- is that rule stated; lib/pipeline/pass-a.ts COMMENTS_READ_LANE is its
    -- one TypeScript copy and pass-a.test.ts pins the two together.
    select v.id, v.platform, v.video_id,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
  ),
  -- The combining-mark range is built with chr() rather than written as \u
  -- escapes: this file is applied by hand through the Supabase MCP and that
  -- transport decodes \u sequences before Postgres ever sees them, which would
  -- change the fold with no error raised anywhere. chr(768)–chr(879) is
  -- U+0300–U+036F, the same range 20260915092000 folds on.
  rivals as (
    select distinct regexp_replace(normalize(lower(cn), NFD),
                                   '[' || chr(768) || '-' || chr(879) || ']', '', 'g') as name
    from public.tracking_configs tc, unnest(coalesce(tc.competitor_names, '{}'::text[])) cn
    where tc.client_id = p_client and coalesce(cn, '') <> ''
  ),
  dual as (
    select v.id
    from public.videos v
    where v.client_id = p_client
      and v.is_client
      and exists (
        select 1 from rivals r
        where position(r.name in regexp_replace(
                normalize(lower(coalesce(v.account_name, '') || ' ' || coalesce(v.caption, '') || ' ' ||
                                coalesce(array_to_string(v.hashtags, ' '), '')), NFD),
                '[' || chr(768) || '-' || chr(879) || ']', '', 'g')) > 0
      )
  ),
  -- No date_trunc here, and that is the whole difference: a video that carried
  -- conversation on both sides of a month boundary is ONE member of this set.
  dated as (
    select v.audience, v.id as video_uuid, v.platform, c.id as comment_id
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client
      and c.comment_date >= p_from
      and c.comment_date <  p_to
  ),
  base as (
    select d.audience,
           count(distinct d.video_uuid) as videos,
           count(distinct d.comment_id) as comments
    from dated d group by 1
  ),
  per_platform as (
    select d.audience, d.platform, count(distinct d.video_uuid) as n
    from dated d group by 1, 2
  ),
  mix as (
    select p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1
  ),
  duals as (
    select d.audience, count(distinct d.video_uuid) as dual_mention
    from dated d join dual on dual.id = d.video_uuid group by 1
  ),
  -- THE WINDOW'S VIDEOS DRIVE THIS JOIN. `undated_per_video` used to start
  -- from `public.comments` and join every comment of the tenant to every
  -- analysed video, group the lot per video, and only then be narrowed by the
  -- join below to the videos this window actually reads. The answer was right
  -- and the work was the whole corpus: measured on production 2026-09-16,
  -- Ossur is 45,316 comments of which 71 are undated and Sealand 26,100 of
  -- which 67 — so every window read scanned tens of thousands of rows to
  -- report about seventy. Driving from `dated` makes the scan the window's,
  -- which is what makes a window read cheap enough to make several of.
  window_videos as (
    select distinct d.audience, d.video_uuid from dated d
  ),
  undated_per_video as (
    select wv.video_uuid, count(*) as n
    from window_videos wv
    join vid v on v.id = wv.video_uuid
    join public.comments c
      on c.client_id = p_client
     and c.platform = v.platform
     and c.video_id = v.video_id
     and c.comment_date is null
    group by 1
  ),
  -- Recorded against the window's videos once, not once per month those videos
  -- occupy: "the videos this window reads also carry N comments nobody could
  -- date". Same sentence as the month row, one window instead of one month.
  undated as (
    select wv.audience, sum(u.n) as excluded_undated
    from window_videos wv
    join undated_per_video u on u.video_uuid = wv.video_uuid
    group by 1
  )
  select b.audience,
         b.videos::int,
         b.comments::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(dm.dual_mention, 0)::int,
         coalesce(un.excluded_undated, 0)::int
  from base b
  left join mix   m  on m.audience  = b.audience
  left join duals dm on dm.audience = b.audience
  left join undated un on un.audience = b.audience
  order by b.audience
$$;

create or replace function public.window_span_denominators(
  p_client uuid,
  p_spans  jsonb
)
returns table (
  span_key text,
  videos   int,
  comments int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with spans as (
    select s.k::text as span_key, s.f as from_ts, s.t as to_ts
    from jsonb_to_recordset(coalesce(p_spans, '[]'::jsonb)) as s(k text, f timestamptz, t timestamptz)
    where s.k is not null and s.f is not null and s.t is not null and s.f < s.t
  ),
  bounds as (
    select min(from_ts) as lo, max(to_ts) as hi from spans
  ),
  vid as (
    -- Only videos whose COMMENTS WERE READ, as in its two siblings above.
    select v.id, v.platform, v.video_id
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_lane = 'full'
  ),
  -- ONE pass over the axis. Same join and same half-open rule as
  -- `window_denominators`' `dated`, minus the audience label, which nothing
  -- here groups by.
  dated as (
    select v.id as video_uuid, c.id as comment_id, c.comment_date
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client
      and c.comment_date >= (select lo from bounds)
      and c.comment_date <  (select hi from bounds)
  )
  select s.span_key,
         count(distinct d.video_uuid)::int,
         count(distinct d.comment_id)::int
  from spans s
  left join dated d on d.comment_date >= s.from_ts and d.comment_date < s.to_ts
  group by s.span_key
  order by s.span_key
$$;

-- The function comments, re-stated because the old ones said "analysed".
comment on function public.monthly_denominators(uuid, timestamptz, timestamptz) is
  'Per month per audience in [p_from, p_to): distinct videos whose comments Pass A READ (analyzed_lane = ''full'') carrying a comment dated in the month, their comments, the platform mix, the client videos that also name a rival, and the undated comments those videos carry.';

comment on function public.window_denominators(uuid, timestamptz, timestamptz) is
  'One row per audience for the whole half-open window [p_from, p_to): the month body minus the month GROUP BY, over videos whose comments Pass A READ (analyzed_lane = ''full''). Denominators do not add, so a window is read, never summed from months.';

comment on function public.window_span_denominators(uuid, jsonb) is
  'Videos and comments per named span, across audiences, over videos whose comments Pass A READ (analyzed_lane = ''full''). An empty span comes back as a zero row, never as no row.';
