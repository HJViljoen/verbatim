-- The kind mix, the mood and the attention panel (Phase 1 WP5, design items 10
-- and 11, decision T, 2026-09-18).
--
-- THREE READINGS THAT SHARE ONE MONTH AND DO NOT SHARE ONE CLOCK. That is the
-- fact this file exists to make legible, and it is the only thing about it that
-- is subtle:
--
--   * the KIND MIX is comment-dated, over ANALYSED videos — the same population
--     and the same clock as month_denominators, because its share's denominator
--     IS month_denominators.videos. A video belongs to the month its comments
--     were written in.
--   * the MOOD is comment-dated too, over exactly that same video set, because
--     it is a property of the videos the denominator already counted.
--   * the ATTENTION half is UPLOAD-dated, over every TRACKED video by a panel
--     account, analysed or not. It answers "how much of the category's
--     attention did each brand's posts take in the month they were posted",
--     which is not a question about comments and cannot be keyed by them.
--
-- The mood and the attention halves live in ONE table (month_audience_stats)
-- because the plan says so and because both are per (tenant, month, audience)
-- with no third key — but they are two populations, and the column names say
-- which is which: judged/positive/negative/neutral/mixed are the comment-dated
-- analysed set, panel_videos/attention_comments/panel_platform_mix are the
-- upload-dated panel set. They are never added together and neither is a
-- denominator for the other.
--
-- WHY A KIND READING CARRIES NO p_run, WHERE A THEME READING DOES.
-- audience_insights.category is an ENUM the Pass A writer emits
-- (lib/pipeline/schemas.ts INSIGHT_CATEGORIES), not a clustering artefact: a
-- re-clustering moves which comments sit under a theme and cannot move which
-- kind an insight is. So a kind month is comparable across a clustering
-- boundary where a theme month is not, month_kind_readings.run_id records which
-- run happened to write the row rather than which clustering it belongs to, and
-- a reader does not need run_id equality to compare two kind months. That is a
-- real asymmetry between two tables that otherwise look identical, and it is
-- deliberate.
--
-- WHY THE MOOD COUNTS ARE STORED AND NOT COMPUTED ON READ. videos.sentiment is
-- rewritten by every re-analysis — a Pass A prompt-version bump re-judges the
-- whole corpus — and the retention sweep deletes videos outright. A mood figure
-- computed on read would therefore move every historical month silently, which
-- is the one thing the freeze rule exists to stop. The same argument the month
-- tables were built on (20260915092000, head), applied to a second column.
--
-- WHY THE PANEL IS A FROZEN SET OF ACCOUNTS AND NOT A FILTER.
-- An attention share over "every account we have ever seen" measures our own
-- gathering: 559 of Össur's 2,329 accounts were first seen before August 2026
-- and the rest arrived with later keyword changes, so a month-over-month
-- "attention moved" would mostly be "we looked in more places". The panel is
-- the accounts we were already watching before the window opened, frozen into a
-- row with its cutoff and its reason, so a series is read inside one panel era
-- and a re-freeze is a rule on the axis rather than a silent re-base.
--
-- REDDIT IS NOT IN THE PANEL, AND THE DATA FORCED THAT. Measured 2026-09-15:
-- ZERO Reddit accounts on either tenant were first seen before 2026-08-01
-- (Reddit gathering began with 20260814120000_subreddits), and a Reddit thread
-- has no engagement denominator comparable to a video's anyway. The exclusion
-- is enforced where the panel is derived (lib/reading/attention.ts) and stated
-- once wherever the block prints. The kind mix and the mood keep Reddit: they
-- are comment-dated reads of the same corpus every other reading uses, and
-- Reddit is 17.0% of Össur's category denominator.
--
-- WHAT IS DELIBERATELY NOT HERE. No pie, no composition and no "other" bucket:
-- a video carries several kinds, so the kind shares of one month's denominator
-- sum to 175% (Össur category Sep 2026: 680 kind-videos over 388 videos) and
-- 228% (Sealand). They are independent shares of one denominator (decision T),
-- and any surface that draws them as parts of a whole is drawing a number that
-- does not exist.

-- 1. The indexes the two new reads need ----------------------------------------
-- Neither exists today and both new reads are sequential scans without them:
-- the panel derivation groups every video by (client_id, platform,
-- account_name), and the attention half groups by (client_id, upload_date).
-- Plain `create index`, not `concurrently`: the same choice
-- 20260915092000 made on comments (71k rows), on a table of 8,377 rows across
-- both tenants, applied by hand with no run in flight.
create index if not exists videos_client_account_idx
  on public.videos (client_id, platform, account_name);
create index if not exists videos_client_upload_date_idx
  on public.videos (client_id, upload_date);

-- 2. The kind mix --------------------------------------------------------------
create table if not exists public.month_kind_readings (
  client_id          uuid not null references public.clients(id) on delete cascade,
  -- First day of the calendar month, UTC, by the COMMENT's date. The same key
  -- and the same clock as month_denominators, whose `videos` is this row's
  -- denominator.
  month              date not null,
  audience           text not null,
  -- audience_insights.category — the Pass A enum, ten values today
  -- (lib/pipeline/schemas.ts INSIGHT_CATEGORIES). NOT constrained to those ten
  -- here on purpose: the vocabulary already grew once (the v5 pull-forwards
  -- added switching_signal and buying_trigger), and a CHECK would turn the next
  -- addition into a migration and, until it landed, into a freeze step that
  -- fails on the one tenant that has the new kind. The writer's contract is the
  -- enum; the record takes what the writer wrote.
  kind               text not null check (kind <> ''),
  -- Distinct videos in this audience and month whose comments carry an insight
  -- of this kind, and those comments. Never a share: the denominator is
  -- month_denominators.videos for the same (month, audience), and a share of a
  -- stored numerator over a stored denominator is a division a reader can check.
  videos             int not null,
  comments           int not null,
  platform_mix       jsonb not null,
  -- The same two exclusions month_theme_readings carries, with the same rules:
  -- excluded_on_camera is a property of this kind's evidence in this audience
  -- (identical on every month row, never summed); excluded_undated is per
  -- month.
  excluded_on_camera int not null default 0,
  excluded_undated   int not null default 0,
  status             text not null check (status in ('filling','frozen')),
  origin             text not null check (origin in ('live','back_read')),
  read_at            timestamptz not null,
  run_id             uuid references public.pipeline_runs(id) on delete set null,
  frozen_at          timestamptz,
  clustering_key     text,
  primary key (client_id, month, audience, kind)
);

comment on table public.month_kind_readings is
  'One row per tenant per month per audience per insight kind: distinct comment-dated videos carrying an insight of that kind, over the same population as month_denominators. Shares are independent — a video carries several kinds, so a month''s kind shares sum well past 100% and are never a composition.';
comment on column public.month_kind_readings.kind is
  'audience_insights.category, the Pass A enum (lib/pipeline/schemas.ts INSIGHT_CATEGORIES). Deliberately unconstrained here: the enum has grown once already and a CHECK would make the next kind a migration.';
comment on column public.month_kind_readings.run_id is
  'The run that wrote the row — bookkeeping, not identity. Unlike month_theme_readings.run_id this is NOT a clustering stamp: a kind is an enum the Pass A writer emits, so two kind months are comparable whether or not their run_ids match.';

create index if not exists month_kind_readings_kind_idx
  on public.month_kind_readings (client_id, kind, month);

-- 3. The mood and the attention half -------------------------------------------
-- The panel first: month_audience_stats.panel_id points at it.
create table if not exists public.attention_panels (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  -- When this panel was frozen. The CURRENT panel of a tenant is the one with
  -- the greatest frozen_at; there is no `closed_at` and no `is_current`,
  -- because this table takes no UPDATEs at all (see the grants below) and a
  -- flag nobody may flip is a lie waiting to happen.
  frozen_at     timestamptz not null default now(),
  -- Accounts first seen strictly before this date are in. Measured per tenant
  -- rather than fixed: at a 2026-07-01 cutoff Sealand's panel holds 0 of its
  -- own videos and 1-2 Cotopaxi videos and is unusable; at 2026-08-01 Össur is
  -- workable and Sealand is thin (research/kind-mix-attention-standings.md §8.2).
  cutoff        date not null,
  -- [{"platform": "tiktok", "account_name": "…", "first_seen": "2026-06-02T…"}]
  -- — the members, written down rather than re-derived, because
  -- min(videos.scraped_at) is the only account first-seen fact in the schema
  -- and a retention sweep that removes a tenant's oldest video by an account
  -- would move that account's first_seen forward and quietly re-shape a panel
  -- that has already been read from.
  accounts      jsonb not null,
  account_count int not null,
  -- Why this panel exists: the first freeze, a tracking change that re-based it
  -- (a rival renamed or retired, terms or platforms moved), or a hand freeze.
  reason        text not null check (reason in ('first_freeze','tracking_change','manual','backfill')),
  -- The actor, in the shape lib/config-log.ts writes ('script:…', 'pipeline:…',
  -- a user id). Every configuration write carries one (AGENTS.md).
  created_by    text,
  created_at    timestamptz not null default now()
);

comment on table public.attention_panels is
  'A frozen set of accounts, per tenant: the accounts first seen before `cutoff` that the attention index is read over. Append-only — a re-freeze inserts a new row and the current panel is the one with the greatest frozen_at. Reddit accounts are never members (zero of them were first seen before either tenant''s cutoff, and a thread has no engagement denominator).';
comment on column public.attention_panels.accounts is
  'The members, written down: [{platform, account_name, first_seen}]. Derived once from min(videos.scraped_at) per (client_id, platform, account_name) — which is "first seen by our gather", never the account''s own start — and never re-derived, because the retention sweep can move that minimum forward.';

create index if not exists attention_panels_client_idx
  on public.attention_panels (client_id, frozen_at desc);

create table if not exists public.month_audience_stats (
  client_id          uuid not null references public.clients(id) on delete cascade,
  month              date not null,
  audience           text not null,
  -- ---- the mood half: comment-dated, over the month_denominators video set --
  -- Videos in this audience-month carrying an AUDIENCE-family sentiment —
  -- provenance when stamped, else the lane, because only the full lane reads
  -- comments (20260820110000_sentiment_split.sql; lib/reading/mood.ts
  -- isAudienceSentiment is the one rule and this SQL mirrors it). The four
  -- values sum to `judged` exactly.
  judged             int not null default 0,
  positive           int not null default 0,
  negative           int not null default 0,
  neutral            int not null default 0,
  mixed              int not null default 0,
  -- Videos whose sentiment is the FRAMING family instead — what the video's own
  -- caption and transcript claim, not how it was received. Recorded so a reader
  -- can see how much of the month was judged the other way, and never mixed in:
  -- run_summary's headline was 59% framing on Össur before the split and a pass
  -- reorder read as "sentiment up 6.2 pts" in a sent subject line.
  judged_framing     int not null default 0,
  -- ---- the attention half: UPLOAD-dated, over the panel ---------------------
  -- Null on a row written before any panel was frozen: the mood half stands on
  -- its own and does not wait for one.
  panel_id           uuid references public.attention_panels(id) on delete cascade,
  -- Videos by a panel account in this audience UPLOADED in this month, and the
  -- platform-reported comments_count on them. comments_count, never
  -- comments_count_at_scrape: the latter is null on 35-50% of rows and means
  -- "as at the last paid scrape" rather than "as at this month" (decision C12
  -- of the research). It drifts upward for any video still being re-found,
  -- which is exactly why this number is frozen and printed beside its read_at.
  panel_videos       int not null default 0,
  attention_comments bigint not null default 0,
  panel_platform_mix jsonb not null default '{}'::jsonb,
  status             text not null check (status in ('filling','frozen')),
  origin             text not null check (origin in ('live','back_read')),
  read_at            timestamptz not null,
  run_id             uuid references public.pipeline_runs(id) on delete set null,
  frozen_at          timestamptz,
  clustering_key     text,
  primary key (client_id, month, audience)
);

comment on table public.month_audience_stats is
  'One row per tenant per month per audience holding TWO readings on two clocks: the mood counts (comment-dated, over the same analysed video set as month_denominators) and the attention counts (upload-dated, over the frozen account panel). They are never summed and neither is a denominator for the other.';
comment on column public.month_audience_stats.attention_comments is
  'Sum of videos.comments_count over this audience''s panel videos uploaded in this month — the platform''s own count as at read_at, not a count of stored comments. It moves upward while those videos are still being re-found, which is why the row freezes.';
comment on column public.month_audience_stats.panel_id is
  'The panel this row''s attention half was read over. A series is like-for-like only where panel_id is equal; a re-freeze starts a new era and draws a rule on the axis rather than re-basing the history.';

create index if not exists month_audience_stats_panel_idx
  on public.month_audience_stats (client_id, panel_id, month);

-- 4. Both guards on both tables ------------------------------------------------
-- The same two functions 20260915092000 and 20260918092000 installed, unchanged:
-- month_reading_frozen_guard (BEFORE UPDATE — a frozen row is never rewritten)
-- and month_reading_frozen_insert_guard (BEFORE INSERT — a closed audience-month
-- takes no new rows, unless this is the first back-read of a table that did not
-- exist when the month closed, which is decision K and is exactly the state
-- these two tables are in for every month already frozen). The insert guard
-- reads its primary key from the catalogue rather than naming it
-- (20260918092000:519-528), so it attaches here with nothing to change.
--
-- attention_panels gets NEITHER. It is append-only at the grant level, which is
-- a stronger promise than a trigger, and it has no month.
drop trigger if exists month_kind_readings_frozen_guard on public.month_kind_readings;
create trigger month_kind_readings_frozen_guard
  before update on public.month_kind_readings
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_kind_readings_frozen_insert_guard on public.month_kind_readings;
create trigger month_kind_readings_frozen_insert_guard
  before insert on public.month_kind_readings
  for each row
  execute function public.month_reading_frozen_insert_guard();

drop trigger if exists month_audience_stats_frozen_guard on public.month_audience_stats;
create trigger month_audience_stats_frozen_guard
  before update on public.month_audience_stats
  for each row when (old.status = 'frozen')
  execute function public.month_reading_frozen_guard();

drop trigger if exists month_audience_stats_frozen_insert_guard on public.month_audience_stats;
create trigger month_audience_stats_frozen_insert_guard
  before insert on public.month_audience_stats
  for each row
  execute function public.month_reading_frozen_insert_guard();

-- 5. RLS and grants ------------------------------------------------------------
-- The month-table shape: a tenant reads its own rows and writes none; the
-- service role (the pipeline step and the operator scripts) bypasses RLS and
-- has its grants stated rather than inherited.
alter table public.month_kind_readings  enable row level security;
alter table public.month_audience_stats enable row level security;
alter table public.attention_panels     enable row level security;

drop policy if exists "Members read their month kind readings" on public.month_kind_readings;
create policy "Members read their month kind readings" on public.month_kind_readings
  for select to authenticated using (client_id = public.get_my_client_id());

drop policy if exists "Members read their month audience stats" on public.month_audience_stats;
create policy "Members read their month audience stats" on public.month_audience_stats
  for select to authenticated using (client_id = public.get_my_client_id());

-- The panel is shown to a tenant beside its own attention series ("a fixed set
-- of N accounts, first seen before …"), so it reads the row. `accounts` holds
-- other people's handles, which the tenant already sees on every video in the
-- category feed, so no column is withheld — but the column grant is written out
-- rather than left as `grant select on the table`, so adding a column later is
-- a decision instead of an accident.
drop policy if exists "Members read their attention panels" on public.attention_panels;
create policy "Members read their attention panels" on public.attention_panels
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.month_kind_readings  from authenticated, anon;
revoke all on public.month_audience_stats from authenticated, anon;
revoke all on public.attention_panels     from authenticated, anon;

grant select on public.month_kind_readings  to authenticated;
grant select on public.month_audience_stats to authenticated;
grant select (id, client_id, frozen_at, cutoff, accounts, account_count, reason, created_at)
  on public.attention_panels to authenticated;

grant select, insert, update, delete on public.month_kind_readings  to service_role;
grant select, insert, update, delete on public.month_audience_stats to service_role;
-- APPEND-ONLY, and the grant is the whole enforcement: a panel that could be
-- edited would let a re-freeze rewrite the era a frozen month was read under,
-- and every attention figure in the record would silently change denominator.
-- A mistake is corrected by freezing a new panel, which is a dated row, not by
-- editing the old one. DELETE is revoked too; the clients cascade is a FK and
-- does not need it.
revoke update, delete, truncate on public.attention_panels from service_role;
grant select, insert on public.attention_panels to service_role;

-- 6. The kind read, month by month ---------------------------------------------
-- The body is monthly_theme_readings (20260915092000:396-...) with the
-- theme_observations hop removed and `ai.category` in its place. Line for line
-- otherwise: same audience precedence, same (client_id, platform, video_id)
-- join, same analysed-only filter, same two evidence arms, same on-camera rule.
-- Every substantive comment lives in that file and is not repeated here.
--
-- ONE SUBSTANTIVE DIFFERENCE. The population is audience_insights_current, the
-- view — "all current insights", which is what a population read means
-- (AGENTS.md). monthly_theme_readings reaches the BASE table instead because it
-- resolves an ID SET off theme_observations.member_insight_ids and must still
-- find rows an in-flight run has superseded but not yet pruned. There is no id
-- set here, so the view is both correct and cheaper.
create or replace function public.monthly_kind_readings(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  month              date,
  audience           text,
  kind               text,
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
  ins as (
    select ai.category as kind, ai.id as insight_id, ai.source_video_id
    from public.audience_insights_current ai
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.kind, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.kind,
           date_trunc('month', ca.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  undated_per_video as (
    select ca.kind, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.kind, s.month, s.audience, sum(u.n) as n
    from (select distinct c.kind, c.month, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.kind = s.kind and u.video_uuid = s.video_uuid
    group by 1, 2, 3
  ),
  oncam as (
    select i.kind, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  denom as (
    select distinct date_trunc('month', c.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date >= p_from and c.comment_date < p_to
      and v.id in (select o.video_uuid from oncam o)
  ),
  -- Window-FREE on purpose, exactly as the theme function's is: "no month could
  -- take this citation" is a fact about the video, not about how wide a window
  -- the caller batched, and the number it produces is frozen for ever.
  dated_ever as (
    select distinct v.id as video_uuid
    from public.comments c
    join vid_all v on v.platform = c.platform and v.video_id = c.video_id and v.analysed
    where c.client_id = p_client
      and c.comment_date is not null
      and v.id in (select o.video_uuid from oncam o)
  ),
  oncam_in as (
    select o.kind, d.month, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  oncam_out as (
    select o.kind, o.audience, count(*) as n
    from oncam o
    where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)
    group by 1, 2
  ),
  vids as (
    select c.kind, c.month, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.kind, oi.month, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.kind, x.month, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2, 3
  ),
  cmt as (
    select c.kind, c.month, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2, 3
  ),
  per_platform as (
    select x.kind, x.month, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3, 4
  ),
  mix as (
    select p.kind, p.month, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2, 3
  )
  select b.month,
         b.audience,
         b.kind,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.kind = b.kind and c.month = b.month and c.audience = b.audience
  left join mix m on m.kind = b.kind and m.month = b.month and m.audience = b.audience
  left join oncam_out oo on oo.kind = b.kind and oo.audience = b.audience
  left join undated   u  on u.kind  = b.kind and u.month = b.month and u.audience = b.audience
  order by b.month, b.audience, b.kind
$$;

comment on function public.monthly_kind_readings(uuid, timestamptz, timestamptz) is
  'Per month per audience per insight kind in [p_from, p_to): distinct comment-dated videos carrying an insight of that kind, their comments, the platform mix, the undated citations those videos carry (per month) and the on-camera-only insights no month can carry (per kind and audience, window-independent). No p_run: a kind is an enum, not a clustering artefact.';

revoke all on function public.monthly_kind_readings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.monthly_kind_readings(uuid, timestamptz, timestamptz) to service_role;

-- 7. The kind read over a window -----------------------------------------------
-- The same body with the month grouping taken out, for the one windowed FIGURE
-- a page prints in prose. Videos do not sum across months and comments do
-- (20260918092000, head), so a "last three months" kind share has to be read,
-- not added up.
create or replace function public.window_kind_readings(
  p_client uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  audience           text,
  kind               text,
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
  ins as (
    select ai.category as kind, ai.id as insight_id, ai.source_video_id
    from public.audience_insights_current ai
    where ai.client_id = p_client
  ),
  cited_all as (
    select i.kind, c.id as comment_id, c.comment_date, c.platform, c.video_id
    from ins i
    join public.insight_evidence ie on ie.audience_insight_id = i.insight_id and ie.source = 'comment'
    join public.comments c on c.id = ie.comment_id
    where c.client_id = p_client
  ),
  cited as (
    select ca.kind, v.audience, v.id as video_uuid, v.platform, ca.comment_id
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id and v.analysed
    where ca.comment_date >= p_from and ca.comment_date < p_to
  ),
  undated_per_video as (
    select ca.kind, v.id as video_uuid, count(distinct ca.comment_id) as n
    from cited_all ca
    join vid_all v on v.platform = ca.platform and v.video_id = ca.video_id
    where ca.comment_date is null
    group by 1, 2
  ),
  undated as (
    select s.kind, s.audience, sum(u.n) as n
    from (select distinct c.kind, c.audience, c.video_uuid from cited c) s
    join undated_per_video u on u.kind = s.kind and u.video_uuid = s.video_uuid
    group by 1, 2
  ),
  oncam as (
    select i.kind, i.insight_id, v.id as video_uuid, v.audience, v.platform
    from ins i
    join vid_all v on v.id = i.source_video_id
    where exists (select 1 from public.insight_evidence ie
                   where ie.audience_insight_id = i.insight_id and ie.source in ('video', 'video_text'))
      and not exists (select 1 from public.insight_evidence ie
                       where ie.audience_insight_id = i.insight_id and ie.source = 'comment')
  ),
  denom as (
    select distinct v.audience, v.id as video_uuid
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
    select o.kind, d.audience, o.video_uuid, o.platform
    from oncam o
    join denom d on d.video_uuid = o.video_uuid and d.audience = o.audience
  ),
  oncam_out as (
    select o.kind, o.audience, count(*) as n
    from oncam o
    where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)
    group by 1, 2
  ),
  vids as (
    select c.kind, c.audience, c.video_uuid, c.platform from cited c
    union
    select oi.kind, oi.audience, oi.video_uuid, oi.platform from oncam_in oi
  ),
  base as (
    select x.kind, x.audience, count(distinct x.video_uuid) as videos
    from vids x group by 1, 2
  ),
  cmt as (
    select c.kind, c.audience, count(distinct c.comment_id) as comments
    from cited c group by 1, 2
  ),
  per_platform as (
    select x.kind, x.audience, x.platform, count(distinct x.video_uuid) as n
    from vids x group by 1, 2, 3
  ),
  mix as (
    select p.kind, p.audience, jsonb_object_agg(p.platform, p.n) as platform_mix
    from per_platform p group by 1, 2
  )
  select b.audience,
         b.kind,
         b.videos::int,
         coalesce(c.comments, 0)::int,
         coalesce(m.platform_mix, '{}'::jsonb),
         coalesce(oo.n, 0)::int,
         coalesce(u.n, 0)::int
  from base b
  left join cmt c on c.kind = b.kind and c.audience = b.audience
  left join mix m on m.kind = b.kind and m.audience = b.audience
  left join oncam_out oo on oo.kind = b.kind and oo.audience = b.audience
  left join undated   u  on u.kind  = b.kind and u.audience = b.audience
  order by b.audience, b.kind
$$;

comment on function public.window_kind_readings(uuid, timestamptz, timestamptz) is
  'monthly_kind_readings with the month grouping taken out: one row per audience per kind for the whole half-open window. For the single windowed figure a page states in prose; the series on a chart stays a read of the stored month rows.';

revoke all on function public.window_kind_readings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.window_kind_readings(uuid, timestamptz, timestamptz) to service_role;

-- 8. The mood and attention read -----------------------------------------------
-- TWO POPULATIONS ON TWO CLOCKS, joined only by (month, audience) — see the head
-- of this file. p_panel may be null, and then the attention half is absent
-- (nulls, not zeros: "we have no panel" is not "the panel saw nothing"). The
-- mood half never depends on a panel.
create or replace function public.monthly_audience_stats(
  p_client uuid,
  p_panel  uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  month              date,
  audience           text,
  judged             int,
  positive           int,
  negative           int,
  neutral            int,
  mixed              int,
  judged_framing     int,
  panel_videos       int,
  attention_comments bigint,
  panel_platform_mix jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vid as (
    select v.id, v.platform, v.video_id, v.sentiment, v.sentiment_source, v.analyzed_lane,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience
    from public.videos v
    where v.client_id = p_client
      and v.analyzed_run_id is not null
  ),
  -- The month_denominators video set, exactly: distinct analysed videos
  -- carrying a comment dated in the month.
  dated as (
    select distinct date_trunc('month', c.comment_date at time zone 'UTC')::date as month,
           v.audience, v.id as video_uuid, v.sentiment, v.sentiment_source, v.analyzed_lane
    from public.comments c
    join vid v on v.platform = c.platform and v.video_id = c.video_id
    where c.client_id = p_client
      and c.comment_date >= p_from
      and c.comment_date <  p_to
  ),
  -- The provenance rule, mirrored from lib/reading/mood.ts isAudienceSentiment
  -- (itself the rule 20260820110000_sentiment_split.sql backfilled with):
  -- stamped provenance wins; with none, only the full lane read the comments.
  judged_rows as (
    select d.month, d.audience,
           d.sentiment,
           (d.sentiment_source = 'audience'
             or (d.sentiment_source is null and d.analyzed_lane = 'full')) as is_audience,
           d.video_uuid
    from dated d
    where d.sentiment in ('positive', 'negative', 'neutral', 'mixed')
  ),
  mood as (
    select j.month, j.audience,
           count(*) filter (where j.is_audience)                                 as judged,
           count(*) filter (where j.is_audience and j.sentiment = 'positive')    as positive,
           count(*) filter (where j.is_audience and j.sentiment = 'negative')    as negative,
           count(*) filter (where j.is_audience and j.sentiment = 'neutral')     as neutral,
           count(*) filter (where j.is_audience and j.sentiment = 'mixed')       as mixed,
           count(*) filter (where not j.is_audience)                             as judged_framing
    from judged_rows j group by 1, 2
  ),
  -- The panel: the frozen member list, read as rows. Empty when p_panel is null
  -- or names another tenant's panel, and then every attention column is null.
  members as (
    select distinct a->>'platform' as platform, a->>'account_name' as account_name
    from public.attention_panels p, lateral jsonb_array_elements(p.accounts) a
    where p.id = p_panel and p.client_id = p_client
  ),
  -- EVERY tracked video by a panel account, analysed or not, dated by UPLOAD.
  -- Not the analysed set: attention is what the category's audience did with a
  -- post, and whether we got round to reading its comments is our business, not
  -- the month's.
  panel_vids as (
    select date_trunc('month', v.upload_date)::date as month,
           case when v.is_client     then 'client'
                when v.is_competitor then 'competitor:' || coalesce(v.competitor_name, 'unknown')
                else 'industry-other'
           end as audience,
           v.id as video_uuid, v.platform, coalesce(v.comments_count, 0) as comments_count
    from public.videos v
    join members m on m.platform = v.platform and m.account_name = v.account_name
    where v.client_id = p_client
      and v.upload_date is not null
      and v.upload_date >= (p_from at time zone 'UTC')::date
      and v.upload_date <  (p_to   at time zone 'UTC')::date
  ),
  attention as (
    select pv.month, pv.audience,
           count(*) as n_videos,
           sum(pv.comments_count)::bigint as attention_comments
    from panel_vids pv group by 1, 2
  ),
  attention_mix as (
    select pv.month, pv.audience, jsonb_object_agg(pv.platform, pv.n) as platform_mix
    from (select month, audience, platform, count(*) as n from panel_vids group by 1, 2, 3) pv
    group by 1, 2
  ),
  keys as (
    select month, audience from mood
    union
    select month, audience from attention
  )
  select k.month,
         k.audience,
         coalesce(mo.judged, 0)::int,
         coalesce(mo.positive, 0)::int,
         coalesce(mo.negative, 0)::int,
         coalesce(mo.neutral, 0)::int,
         coalesce(mo.mixed, 0)::int,
         coalesce(mo.judged_framing, 0)::int,
         coalesce(atn.n_videos, 0)::int,
         coalesce(atn.attention_comments, 0)::bigint,
         coalesce(amx.platform_mix, '{}'::jsonb)
  from keys k
  left join mood          mo on mo.month = k.month and mo.audience = k.audience
  left join attention     atn on atn.month = k.month and atn.audience = k.audience
  left join attention_mix amx on amx.month = k.month and amx.audience = k.audience
  order by k.month, k.audience
$$;

comment on function public.monthly_audience_stats(uuid, uuid, timestamptz, timestamptz) is
  'Per month per audience in [p_from, p_to): the four-way AUDIENCE-family sentiment counts over the comment-dated analysed video set (the month_denominators population) plus the framing count for the record, and — over the frozen panel p_panel — the upload-dated panel video count, their platform-reported comments_count and their platform mix. Two clocks, never summed.';

revoke all on function public.monthly_audience_stats(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.monthly_audience_stats(uuid, uuid, timestamptz, timestamptz) to service_role;

-- Applied by hand in window W1, only with pipeline_runs.status in
-- ('running','analyzing') empty and outside 04:00-09:00 SAST. Post-apply checks,
-- read-only:
--   select tablename from pg_tables where tablename in
--     ('month_kind_readings','month_audience_stats','attention_panels');
--   select count(*) from public.month_kind_readings;                  -- 0
--   select indexname from pg_indexes where tablename = 'videos'
--     and indexname in ('videos_client_account_idx','videos_client_upload_date_idx');
--   select policyname, cmd from pg_policies where tablename in
--     ('month_kind_readings','month_audience_stats','attention_panels');
--   select tgname, tgrelid::regclass from pg_trigger where not tgisinternal
--     and tgrelid::regclass::text in ('month_kind_readings','month_audience_stats');
--   select has_table_privilege('service_role','public.attention_panels','update'); -- false
--   select has_function_privilege('service_role',
--     'public.monthly_kind_readings(uuid,timestamptz,timestamptz)','execute');     -- true
--   select has_function_privilege('authenticated',
--     'public.monthly_kind_readings(uuid,timestamptz,timestamptz)','execute');     -- false
