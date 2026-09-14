-- The comment-dated monthly reading (Phase 0, design items 1–2, 2026-09-15).
--
-- Every theme number on screen today is a per-RUN reading of a cumulative
-- corpus: step A2 clusters the whole of audience_insights_current with no run
-- filter (lib/pipeline/step-a2.ts:201-212), so "115 new themes" means "the
-- clustering we did this Sunday, over everything we have ever gathered". Two
-- readings a week apart are not two measurements of the same thing, and the
-- keys that look like a period key are not one either: theme_observations.run_date
-- is the wall clock at persist time and one production run carries two of them
-- (Sealand cb0d97b2: 21 rows on 09-09, 984 on 09-10).
--
-- The honest series is per calendar month, by the date the COMMENT was written,
-- with one clustering applied to every month. That is what these two tables
-- store and what the two functions below read.
--
-- WHY IT IS STORED AT ALL, rather than recomputed on demand. A month's reading
-- moves under four independent forces (research/gap-01.md): a re-scrape of a
-- stored video (p90 14 days, p99 37 — a month is ~97% complete 30 days after it
-- ends), a video discovered later whose whole back-thread lands at once (no
-- time constant at all: 976 Össur comments arrived more than a year after they
-- were written), the Pass A prune (which hard-deletes superseded insights and
-- cascades their citations away — older runs' member id sets are already 20–44%
-- eroded), and the retention sweep (live: 50 YouTube videos tombstoned across
-- four nights, one comment cited in a shipped report already gone). The first
-- two move the number forward and can be waited out; the last two destroy the
-- evidence a past reading rested on and cannot. So what is not written down at
-- the time is not recoverable later: history can be recomputed FORWARD from
-- today's corpus, never backfilled to what an earlier run reported.
--
-- COUNTS, NOT CITATIONS. These rows hold numbers and no comment ids on purpose.
-- Retention deletes comment rows; the prune deletes the insights that made them
-- citable. A frozen count survives both. A frozen id list would decay into a
-- record of what we can no longer show.
--
-- WHAT FREEZING DOES AND DOES NOT PROMISE. A month is `filling` until 30 days
-- after it ends and is rewritten by every run from the current clustering; the
-- first run after that window closes writes the final values and marks the row
-- `frozen`, and a frozen row is never rewritten. A late-discovered video can
-- still add comments to a month after it freezes — the frozen number does not
-- move, and the accrual shows up as the difference between the row and a fresh
-- reading. That is the design's "no artefact is silently corrected", not a
-- claim that the month cannot change.
--
-- Nothing reads these tables yet. The pipeline's freeze-months step and
-- scripts/monthly-reading.ts write them; the readiness page (WP10) and the
-- Phase 1 monthly series are the readers.

-- 1. The index the corpus-wide monthly denominator needs -----------------------
-- The theme-series read (function 2) never filters on comment_date — it reaches
-- comments by primary key off a citation, so an index on the date would do
-- nothing for it. The DENOMINATOR does filter on it, and without this index
-- "this client's comments in this month" is a sequential scan of the whole
-- table: measured 1,298 ms and 28,981 rows discarded for one client, one month,
-- at today's 71k rows.
create index if not exists comments_client_comment_date_idx
  on public.comments (client_id, comment_date);

-- 2. The denominator: how much conversation each audience had in a month -------
create table if not exists public.month_denominators (
  client_id        uuid not null references public.clients(id) on delete cascade,
  -- First day of the calendar month, UTC. comment_date is a timestamptz whose
  -- values are all UTC midnight (four normalisers go through toDateOnly), so
  -- the month is computed in UTC explicitly and never in the session's zone.
  month            date not null,
  -- 'client' | 'competitor:<name>' | 'industry-other'. The literal bucket
  -- string, competitor_name included verbatim, spaces and case and all —
  -- the same three-way precedence as lib/pipeline/metrics.ts entityOf,
  -- lib/pipeline/step-a2.ts bucketOf and lib/quotes.ts videoBucketOf.
  audience         text not null,
  -- Distinct ANALYSED videos in this audience carrying at least one comment
  -- dated in this month, and the comments on them dated in this month.
  videos           int not null,
  comments         int not null,
  -- Videos per platform, over the same distinct video set: {"tiktok": 352, …}.
  -- Never pooled — Reddit went from 6.4% to 17.0% of Össur's category
  -- denominator in two months, and a pooled total hides that.
  platform_mix     jsonb not null,
  -- Videos in this month's set that are the client's AND name a tracked rival
  -- in their own text (account + caption + hashtags). Record only: nothing
  -- reads it yet, and it is 0 by construction on every audience but 'client'.
  dual_mention     int not null default 0,
  -- Comments on this month's videos that carry no date at all (138 rows in
  -- production, every one of them YouTube) and so are counted in no month.
  excluded_undated int not null default 0,
  status           text not null check (status in ('filling','frozen')),
  -- live      first written while the month was still filling
  -- back_read written for the first time after the month had already closed —
  --           a reading of today's corpus, not a record of what we reported then
  origin           text not null check (origin in ('live','back_read')),
  read_at          timestamptz not null,
  run_id           uuid references public.pipeline_runs(id) on delete set null,
  frozen_at        timestamptz,
  primary key (client_id, month, audience)
);

comment on table public.month_denominators is
  'One row per tenant per calendar month per audience: how much conversation that audience carried, dated by comments.comment_date. Written by the pipeline''s freeze-months step and scripts/monthly-reading.ts. A row with status ''frozen'' is never rewritten.';
comment on column public.month_denominators.origin is
  'back_read rows were computed after the month had already closed, from today''s corpus — they are a reading, not the reading that was reported at the time. Nothing can recover the latter (research/gap-01.md §3.4).';

-- 3. The numerator: what each theme read in that month -------------------------
create table if not exists public.month_theme_readings (
  client_id          uuid not null references public.clients(id) on delete cascade,
  month              date not null,
  audience           text not null,
  -- theme_registry.id — the STABLE cross-run identity. Never themes.id (a
  -- per-run row id) and never the label (labels churn ~88% run to run).
  theme_id           uuid not null references public.theme_registry(id) on delete cascade,
  videos             int not null,
  comments           int not null,
  platform_mix       jsonb not null,
  -- Member insights whose only evidence is on camera or on-screen text
  -- (insight_evidence.source in ('video','video_text')) and whose video carries
  -- no dated comment at all, so no month can take them. A property of the
  -- theme's evidence in this audience, identical on every month row of that
  -- theme and never summed across them — the members it counts belong to no
  -- month by construction. It does not depend on how wide a window the writer
  -- read, so the pipeline's two-month call and the seed's whole-history call
  -- agree.
  excluded_on_camera int not null default 0,
  -- Cited comments with no date, recorded against every month their video does
  -- occupy in this theme's reading — the same rule month_denominators uses.
  -- Per month, and never summed across months.
  excluded_undated   int not null default 0,
  status             text not null check (status in ('filling','frozen')),
  origin             text not null check (origin in ('live','back_read')),
  read_at            timestamptz not null,
  run_id             uuid references public.pipeline_runs(id) on delete set null,
  frozen_at          timestamptz,
  primary key (client_id, month, audience, theme_id)
);

comment on table public.month_theme_readings is
  'One row per tenant per month per audience per theme: the months a single clustering reads, by comments.comment_date. videos, comments and platform_mix are this month''s. excluded_undated is this month''s too. excluded_on_camera counts citations no month can carry and repeats identically on every month row of the theme; neither exclusion is ever summed across months.';
comment on column public.month_theme_readings.excluded_on_camera is
  'Member insights evidenced only on camera or on screen whose video carries no dated comment at all — a property of the theme in this audience, repeated on each of its month rows, never summed. Independent of the window the writer read, so the pipeline and the back-read seed agree.';
comment on column public.month_theme_readings.excluded_undated is
  'Cited comments with no date, attributed to every month their video occupies in this theme''s reading (the month_denominators rule). Per month; never summed.';

create index if not exists month_theme_readings_theme_idx
  on public.month_theme_readings (client_id, theme_id, month);

-- 4. RLS — a tenant reads its own months, and writes none ----------------------
-- Writes are the service role's (the pipeline step and the operator scripts),
-- which bypasses RLS entirely; no write policy exists for anyone else. A
-- reading a tenant could edit would not be a record.
alter table public.month_denominators   enable row level security;
alter table public.month_theme_readings enable row level security;

drop policy if exists "Members read their month denominators" on public.month_denominators;
create policy "Members read their month denominators" on public.month_denominators
  for select to authenticated using (client_id = public.get_my_client_id());

drop policy if exists "Members read their month theme readings" on public.month_theme_readings;
create policy "Members read their month theme readings" on public.month_theme_readings
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.month_denominators   from authenticated, anon;
revoke all on public.month_theme_readings from authenticated, anon;
grant select on public.month_denominators   to authenticated;
grant select on public.month_theme_readings to authenticated;
-- Stated, not inherited from whatever the project's default ACL happens to be
-- (the config_changes precedent, 2026-09-15).
grant select, insert, update, delete on public.month_denominators   to service_role;
grant select, insert, update, delete on public.month_theme_readings to service_role;

-- 5. The denominator read ------------------------------------------------------
-- Any half-open window [p_from, p_to); the month loop and the week loop are
-- callers, and the function groups by whatever months the window covers.
--
-- SECURITY DEFINER with execute granted to service_role ONLY. It reads across
-- comments, videos and tracking_configs for one tenant, so it must not be
-- reachable by `authenticated` at all — the client_id is a parameter, and a
-- function a tenant could call is a function a tenant could call with someone
-- else's id.
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
    -- Only ANALYSED videos count. A video nobody has read yet is not part of
    -- the conversation this product measured, and counting it would put a
    -- denominator under a numerator that can never reach it.
    select v.id, v.platform, v.video_id,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_run_id is not null
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
        where regexp_replace(
                normalize(lower(coalesce(v.account_name, '') || ' ' || coalesce(v.caption, '') || ' ' ||
                                coalesce(array_to_string(v.hashtags, ' '), '')), NFD),
                '[\u0300-\u036f]', '', 'g') like '%' || r.name || '%'
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

comment on function public.monthly_denominators(uuid, timestamptz, timestamptz) is
  'Per month per audience in [p_from, p_to): distinct analysed videos carrying a comment dated in the month, their comments, the platform mix, the client videos that also name a rival, and the undated comments those videos carry. Reproduces research/subjects-readiness-data.md §4b/§4c exactly.';

revoke all on function public.monthly_denominators(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.monthly_denominators(uuid, timestamptz, timestamptz) to service_role;

-- 6. The theme read ------------------------------------------------------------
-- One run's clustering (p_run), read month by month. The chain is
--   theme_observations.member_insight_ids
--     -> audience_insights (the BASE table, never audience_insights_current:
--        an id-set lookup must still resolve rows an in-flight run has
--        superseded but not yet pruned — AGENTS.md)
--     -> insight_evidence where source = 'comment'
--     -> comments, dated
--     -> videos, for the audience and the platform
-- and the theme's identity is theme_observations.theme_id, which IS
-- theme_registry.id (FK-verified), never themes.id and never the label.
--
-- Member ids that resolve to nothing are skipped in silence, and that is the
-- honest behaviour: the Pass A prune deletes superseded insights and rewrites
-- no member array, so 18.2% of all stored member references in production
-- already point at rows that no longer exist. A reading of an OLD run is
-- therefore a reading of what survives of it, which is exactly why the freeze
-- writes the number down while the run is current.
create or replace function public.monthly_theme_readings(
  p_client uuid,
  p_run    uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  month              date,
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
  -- Every comment this run's themes cite, dated or not, read once: the comment
  -- lookups are 7,937 primary-key probes on Össur and are 70% of the cost, so
  -- the dated and the undated halves come out of the same pass.
  cited_all as (
    select i.theme_id, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.theme_id,
           date_trunc('month', ca.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  -- An undated citation belongs to no month, so it is recorded against every
  -- month its video occupies in THIS theme's reading — the same rule the
  -- denominator uses for its own undated comments: "the videos this theme reads
  -- in this month also carry N citations nobody could date". Per month, never a
  -- sum across months.
  undated_per_video as (
    select ca.theme_id, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.theme_id, s.month, s.audience, sum(u.n) as n
    from (select distinct c.theme_id, c.month, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.theme_id = s.theme_id and u.video_uuid = s.video_uuid
    group by 1, 2, 3
  ),
  -- A member insight whose only evidence is spoken on camera or typed on the
  -- cover frame carries no date of its own. Its video is dated, though, so the
  -- video counts in every month it already occupies in the denominator — and
  -- in none, if it occupies none.
  oncam as (
    select i.theme_id, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  -- The denominator, but only for the handful of videos an on-camera member
  -- hangs off (167 of 4,450 on Össur): the full month-by-video denominator is
  -- 44k rows and nothing else here needs it. Two passes, and the difference
  -- matters. The months INSIDE the window are what the member is attributed to,
  -- so that pass is window-scoped. Whether the video occupies any month at all
  -- is what decides the exclusion, and that one is deliberately window-FREE: "no
  -- month could take this citation" is a fact about the video, not about how
  -- many months the caller happened to batch into one call, and the number it
  -- produces is frozen for ever. Window-scoped it read 3 on a whole-history call
  -- (the seed) and 7 on an Aug–Sep call (the pipeline) for the same theme —
  -- one column, two meanings, decided by whoever wrote the row first.
  denom as (
    select distinct date_trunc('month', c.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date >= p_from and c.comment_date < p_to
      and v.id in (select o.video_uuid from oncam o)
  ),
  dated_ever as (
    select distinct v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date is not null
      and v.id in (select o.video_uuid from oncam o)
  ),
  oncam_in as (
    select o.theme_id, d.month, d.audience, o.video_uuid, o.platform
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
    select c.theme_id, c.month, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.theme_id, oi.month, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.theme_id, x.month, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2, 3
  ),
  cmt as (
    select c.theme_id, c.month, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2, 3
  ),
  per_platform as (
    select x.theme_id, x.month, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3, 4
  ),
  mix as (
    select p.theme_id, p.month, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2, 3
  )
  select b.month,
         b.audience,
         b.theme_id,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.theme_id = b.theme_id and c.month = b.month and c.audience = b.audience
  left join mix m on m.theme_id = b.theme_id and m.month = b.month and m.audience = b.audience
  -- excluded_on_camera is a property of the theme's evidence in this audience,
  -- not of one month — the members it counts sit on videos that occupy NO
  -- month, so no month can carry them. It repeats identically on every month
  -- row of that theme and must never be summed. It no longer depends on the
  -- window, so the seed and the pipeline write the same number.
  left join oncam_out oo on oo.theme_id = b.theme_id and oo.audience = b.audience
  left join undated   u  on u.theme_id  = b.theme_id and u.month = b.month and u.audience = b.audience
  order by b.month, b.audience, b.theme_id
$$;

comment on function public.monthly_theme_readings(uuid, uuid, timestamptz, timestamptz) is
  'Per month per audience per theme in [p_from, p_to), for one run''s clustering: distinct videos and comments the theme''s member insights cite, the platform mix, the undated citations those videos carry (per month), and the on-camera-only members no month can carry (per theme and audience, window-independent). theme_id is theme_registry.id.';

revoke all on function public.monthly_theme_readings(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.monthly_theme_readings(uuid, uuid, timestamptz, timestamptz) to service_role;

-- Applied by hand (WP12), only with pipeline_runs.status in ('running','analyzing')
-- empty and outside the Sunday envelope. Post-apply checks, read-only:
--   select indexname from pg_indexes where tablename = 'comments' and indexname = 'comments_client_comment_date_idx';
--   select count(*) from public.month_denominators;                              -- 0
--   select policyname, cmd from pg_policies where tablename like 'month_%';
--   select proname, prosecdef from pg_proc where proname in ('monthly_denominators','monthly_theme_readings');
--   select has_function_privilege('service_role', 'public.monthly_denominators(uuid,timestamptz,timestamptz)', 'execute');
--   select has_function_privilege('authenticated', 'public.monthly_denominators(uuid,timestamptz,timestamptz)', 'execute'); -- false
