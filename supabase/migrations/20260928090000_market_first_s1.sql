-- MF1 · market-first Stage 1 (plan §4.1, §4.2, WP1.4; applied by Heinrich,
-- Wed 30 Sep, through scripts/apply-market-first-migrations.sh).
--
-- WHAT IT ADDS. New tables and functions only; no month table, no audience
-- CASE body and no existing function signature changes (plan §4.1).
--   tables     video_segments, video_provenance, config_change_reach,
--              month_pair_comparability, front_page_overrides
--   functions  market_month_videos, market_month_depth, theme_maker_shares,
--              market_segment_counts (the four the plan pins), and two
--              helpers they share: segments_v1_reason (the maker and noise
--              rule, generated from lib/segments/rules.ts) and
--              segments_for_videos (the reader precedence, once)
--   CHECK      config_changes_surface_check gains 'segment', 'gate_rule' and
--              'attribution' (lib/config-log.ts CONFIG_SURFACES mirrors it)
--   grants     R12 of the deploy-1 review: `authenticated` loses column UPDATE
--              on tracking_configs' search-set and sending columns (section 5)
--
-- THE CONVENTIONS (Phase 1 plan §2). Every table: RLS on, a get_my_client_id()
-- select policy, every privilege revoked from anon and authenticated and then
-- column-level SELECT for authenticated, service_role insert and select.
-- UPDATE, DELETE and TRUNCATE are revoked from service_role on every table
-- here: each is append-only, and a newer row supersedes an older one (the
-- newest decided_at, computed_at or set_at wins). A foreign-key cascade still
-- works, because referential actions run as the table owner. Every function:
-- SECURITY DEFINER with a pinned search_path (the helper is IMMUTABLE and
-- definer-free), execute revoked from public, anon and authenticated and
-- granted to service_role, because p_client is a parameter.
--
-- IDEMPOTENT. `if not exists`, `create or replace`, drop-then-create for the
-- policies and the CHECK; applied twice on a throwaway PG 17.11 cluster with an
-- empty catalogue diff (scripts/pg-shim/throwaway.sh twice). No CONCURRENTLY,
-- no BEGIN/COMMIT: the runner wraps the file in one transaction.

-- 1. The tables ----------------------------------------------------------------

-- Labels, never deletions: a video marked maker or noise stays in every count
-- (decision F). Newer rows supersede older ones. Reader precedence, per video:
-- the newest 'override' row; else the newest 'judge' row; else the newest
-- 'rule' row; else the segments_v1 rule computed inline. "Newest" is
-- decided_at, never a text sort (segments_for_videos).
create table if not exists public.video_segments (
  client_id    uuid not null references public.clients(id) on delete cascade,
  video_id     uuid not null references public.videos(id) on delete cascade,
  -- 'segments_v1' (the maker words and the bare-name noise rule, WP1.4);
  -- 'segments_v2' will be the judge (WP3.2).
  rule_version text not null,
  segment      text not null check (segment in ('maker', 'noise', 'market')),
  method       text not null check (method in ('rule', 'judge', 'override')),
  -- 'maker_regex:sewing', 'bare_name_only:poler', 'unjudged_admission', …
  reason       text,
  decided_at   timestamptz not null default now(),
  actor_label  text not null,
  primary key (client_id, video_id, rule_version, decided_at)
);
-- One rule or judge row per video and version; overrides may repeat.
create unique index if not exists video_segments_one_rule
  on public.video_segments (client_id, video_id, rule_version) where method <> 'override';

comment on table public.video_segments is
  'Market-first segment labels (maker, noise, market) per video and rule version. Append-only: a label is superseded by a newer row, never edited, and a label never removes a video from a count.';

-- How each video was FIRST found. `videos.source_keywords` holds only the last
-- run that surfaced a video (GC F26), so this is written once per video from
-- the best evidence left (lib/provenance/reconstruct.ts): the first-stored
-- gate verdict, then the production snapshot, then the staging export, then
-- era A. Insert-if-absent; never rewritten.
create table if not exists public.video_provenance (
  client_id        uuid not null references public.clients(id) on delete cascade,
  video_id         uuid not null references public.videos(id) on delete cascade,
  first_run_id     uuid references public.pipeline_runs(id) on delete set null,
  first_stored_at  timestamptz,
  first_terms      text[] not null default '{}',
  first_subreddits text[] not null default '{}',
  method           text not null check (method in ('exact', 'reconstructed', 'ambiguous')),
  -- 'gather' | 'gate_verdicts' | 'staging@2026-09-20' | 'snapshot@<date>' | 'era_a'
  evidence         text not null,
  recorded_at      timestamptz not null default now(),
  primary key (client_id, video_id)
);

comment on table public.video_provenance is
  'How each video was first found: the search terms and communities, and how sure we are (exact, reconstructed, ambiguous). Written once per video; never rewritten.';

-- The change list's "brought in N of the month": one change's reach in one
-- month, pointing at the EXISTING config_changes row (no duplicate change row
-- is ever written to carry it).
create table if not exists public.config_change_reach (
  client_id        uuid not null references public.clients(id) on delete cascade,
  change_id        uuid not null references public.config_changes(id) on delete cascade,
  month            date not null,
  -- 'market' (the pooled market, decision E) or 'category' (the n themes are
  -- divided by). A change measured over the market only is unmeasured for themes.
  population       text not null default 'market',
  videos_touched   int not null check (videos_touched >= 0),
  videos_in_month  int not null check (videos_in_month >= 0),
  method           text not null,
  read_through_run uuid,
  computed_at      timestamptz not null default now(),
  primary key (change_id, month, population, computed_at)
);
create index if not exists config_change_reach_client_month_idx
  on public.config_change_reach (client_id, month);

comment on table public.config_change_reach is
  'How many of a month''s videos one change of ours brought in or re-filed, out of the month''s videos. Append-only; the newest computed_at wins.';

-- Derived and recomputable: one row per (prev_month, month) per computation;
-- the newest computed_at wins (lib/reading/read.ts pairRowFromStored).
create table if not exists public.month_pair_comparability (
  client_id           uuid not null references public.clients(id) on delete cascade,
  prev_month          date not null,
  month               date not null,
  search_outside_prev int not null,
  videos_prev         int not null,
  search_outside_curr int not null,
  videos_curr         int not null,
  -- [{change_id, surface, population, prev: {k, n}, curr: {k, n}}]
  code_changes        jsonb not null default '[]',
  depth_prev_median   numeric,
  depth_curr_median   numeric,
  -- [{month, runs, partial, searches_short}]
  gather              jsonb not null default '[]',
  -- {month, comments, of}
  late_capture        jsonb,
  read_through_run    uuid,
  method_version      text not null,
  computed_at         timestamptz not null default now(),
  primary key (client_id, prev_month, month, computed_at)
);

comment on table public.month_pair_comparability is
  'Whether two months were read the same way: videos found outside the searches both months ran, each change of ours and its reach, depth medians, gather health and late capture. Derived; append-only; the newest computed_at wins.';

-- Heinrich's "never lead with this theme" (the trial's safety valve). The
-- newest row per registry_id wins.
create table if not exists public.front_page_overrides (
  client_id   uuid not null references public.clients(id) on delete cascade,
  registry_id uuid not null,
  action      text not null check (action in ('exclude_lead', 'allow_lead')),
  note        text,
  actor_label text not null,
  set_at      timestamptz not null default now(),
  primary key (client_id, registry_id, set_at)
);

comment on table public.front_page_overrides is
  'Which themes may not lead the front page, set by the operator. Append-only; the newest row per registry_id wins.';

-- 2. RLS, policies and grants ----------------------------------------------------

alter table public.video_segments           enable row level security;
alter table public.video_provenance         enable row level security;
alter table public.config_change_reach      enable row level security;
alter table public.month_pair_comparability enable row level security;
alter table public.front_page_overrides     enable row level security;

drop policy if exists "Members read their video segments" on public.video_segments;
create policy "Members read their video segments" on public.video_segments
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their video provenance" on public.video_provenance;
create policy "Members read their video provenance" on public.video_provenance
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their change reach" on public.config_change_reach;
create policy "Members read their change reach" on public.config_change_reach
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their month pairs" on public.month_pair_comparability;
create policy "Members read their month pairs" on public.month_pair_comparability
  for select to authenticated using (client_id = public.get_my_client_id());
drop policy if exists "Members read their front page overrides" on public.front_page_overrides;
create policy "Members read their front page overrides" on public.front_page_overrides
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.video_segments, public.video_provenance, public.config_change_reach,
  public.month_pair_comparability, public.front_page_overrides from anon, authenticated;

-- Column-level SELECT. Left out: the operator's own words and evidence
-- (actor_label, note, reason, evidence, method), which a tenant has no use for
-- and which the product never prints (the config_changes.actor_label rule).
grant select (client_id, video_id, rule_version, segment, method, decided_at)
  on public.video_segments to authenticated;
grant select (client_id, video_id, first_run_id, first_stored_at, first_terms, first_subreddits, method, recorded_at)
  on public.video_provenance to authenticated;
grant select (client_id, change_id, month, population, videos_touched, videos_in_month, read_through_run, computed_at)
  on public.config_change_reach to authenticated;
grant select (client_id, prev_month, month, search_outside_prev, videos_prev, search_outside_curr, videos_curr,
              code_changes, depth_prev_median, depth_curr_median, gather, late_capture, read_through_run,
              method_version, computed_at)
  on public.month_pair_comparability to authenticated;
grant select (client_id, registry_id, action, set_at)
  on public.front_page_overrides to authenticated;

grant select, insert on public.video_segments, public.video_provenance, public.config_change_reach,
  public.month_pair_comparability, public.front_page_overrides to service_role;
revoke update, delete, truncate on public.video_segments, public.video_provenance, public.config_change_reach,
  public.month_pair_comparability, public.front_page_overrides from service_role;

-- 3. The functions ------------------------------------------------------------------

-- The segments_v1 rule, generated from lib/segments/rules.ts (lib/segments/
-- rules.test.ts fails when this block and the generator disagree). Returns the
-- reason: 'maker_regex:<word>', 'bare_name_only:<term>', or null (the market).
-- p_terms: the video's first-found terms and communities where provenance holds
-- any, else its source_keywords.
-- >>> segments_v1 (generated by lib/segments/rules.ts segmentsV1Sql; do not edit by hand)
create or replace function public.segments_v1_reason(
  p_caption text, p_hashtags text[], p_topics text[], p_terms text[])
returns text
language sql
immutable
set search_path = public, pg_temp
as $segments_v1$
  select case
    when m.hay ~ '(^|[^a-z0-9_])(sew|sewing|costura|crochet|knit|uncinetto|ganchillo|tutorial|diy|pattern|patterns|stitch|stitching|thrift flip|refashion|crafts|crafting|quilting|embroidery|plarn|reciclaje|how to make|best out of waste|daur ulang|kerajinan)([^a-z0-9_]|$)'
      then 'maker_regex:' || (regexp_match(m.hay, '(^|[^a-z0-9_])(sew|sewing|costura|crochet|knit|uncinetto|ganchillo|tutorial|diy|pattern|patterns|stitch|stitching|thrift flip|refashion|crafts|crafting|quilting|embroidery|plarn|reciclaje|how to make|best out of waste|daur ulang|kerajinan)([^a-z0-9_]|$)'))[2]
    when cardinality(coalesce(p_terms, '{}'::text[])) > 0
     and not exists (select 1 from unnest(p_terms) t
                      where lower(btrim(t)) <> all (array['poler', 'patagonia', 'cotopaxi', 'freitag', 'topo designs', 'sealand gear', '#sealandgear', 'sealandgear']::text[]))
      then 'bare_name_only:' || lower(btrim(p_terms[1]))
  end
  from (select lower(coalesce(p_caption, '') || ' ' || coalesce(array_to_string(p_hashtags, ' '), '')
                    || ' ' || coalesce(array_to_string(p_topics, ' '), '')) as hay) m
$segments_v1$;
-- <<< segments_v1

-- Each video's segment by the reader precedence (the newest override, else the
-- newest judge row, else the newest rule row, else segments_v1 computed inline
-- on the video's first-found terms and communities where provenance holds any,
-- else its source_keywords). `labelled` says a
-- stored row decided it. One place, so theme_maker_shares and
-- market_segment_counts cannot disagree about a video.
create or replace function public.segments_for_videos(p_client uuid, p_video_ids uuid[])
returns table (video_id uuid, segment text, labelled boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ids as (
    select distinct u.id from unnest(p_video_ids) u(id) where u.id is not null
  ),
  stored as (
    select distinct on (s.video_id) s.video_id, s.segment
    from public.video_segments s
    join ids on ids.id = s.video_id
    where s.client_id = p_client
    order by s.video_id,
             case s.method when 'override' then 0 when 'judge' then 1 else 2 end,
             s.decided_at desc
  ),
  inline as (
    select v.id as video_id,
           public.segments_v1_reason(
             v.caption, v.hashtags, v.topics,
             case when cardinality(p.first_terms) + cardinality(p.first_subreddits) > 0
                  then p.first_terms || p.first_subreddits else v.source_keywords end) as reason
    from ids
    join public.videos v on v.id = ids.id and v.client_id = p_client
    left join public.video_provenance p on p.client_id = p_client and p.video_id = v.id
    where not exists (select 1 from stored s where s.video_id = v.id)
  )
  select s.video_id, s.segment, true from stored s
  union all
  select i.video_id,
         case when i.reason like 'maker\_regex:%' then 'maker'
              when i.reason like 'bare\_name\_only:%' then 'noise'
              else 'market' end,
         false
  from inline i
$$;

-- M13's denominator set for one month, the client arm dropped (decision E: the
-- market is everything we read except the client's own posts): full-lane
-- videos (the comments Pass A read) with a comment dated in the month (UTC),
-- filed under a tracked rival or in the category. The audience strings are
-- monthly_denominators' own, so the per-audience counts match its rows.
create or replace function public.market_month_videos(p_client uuid, p_month date)
returns table (video_id uuid, audience text, platform text, dated_comments int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select (date_trunc('month', p_month)::date)::timestamp at time zone 'UTC' as t0,
           ((date_trunc('month', p_month) + interval '1 month')::date)::timestamp at time zone 'UTC' as t1
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
  )
  select v.id, v.audience, v.platform, count(distinct c.id)::int
  from public.comments c
  join vid v on v.platform = c.platform and v.video_id = c.video_id
  cross join bounds b
  where c.client_id = p_client
    and c.comment_date >= b.t0
    and c.comment_date <  b.t1
  group by v.id, v.audience, v.platform
$$;

-- How deeply the month's market videos were read: the videos, how many carry
-- under ten dated comments, and the median dated comments a video (the
-- comparability depth rule, DEPTH_RATIO_MIN). Null median on an empty month.
create or replace function public.market_month_depth(p_client uuid, p_month date)
returns table (videos int, under_10 int, median_dated numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int,
         (count(*) filter (where m.dated_comments < 10))::int,
         (percentile_cont(0.5) within group (order by m.dated_comments))::numeric
  from public.market_month_videos(p_client, p_month) m
$$;

-- Per category theme in the month: its videos (month_evidence_refs, the ids
-- the month's reading rested on) and how many are maker or noise by the reader
-- precedence, the rule computed inline for any video with no stored label, so
-- coverage never decays. One read for the board. p_run is the themed run the
-- board reads under: when the month holds no stored theme refs yet, the ids
-- come from monthly_evidence_refs over that run instead. maker / videos is the
-- theme's maker share (lib/pages/overview.ts makerSharesOf).
create or replace function public.theme_maker_shares(p_client uuid, p_month date, p_run uuid)
returns table (registry_id uuid, videos int, maker int, noise int, labelled int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with m as (
    select date_trunc('month', p_month)::date as m0
  ),
  stored_refs as (
    select r.object_id, r.video_ids
    from public.month_evidence_refs r, m
    where r.client_id = p_client and r.month = m.m0
      and r.audience = 'industry-other' and r.object_kind = 'theme'
  ),
  run_refs as (
    select e.theme_id::text as object_id, e.video_ids
    from m, public.monthly_evidence_refs(
           p_client, p_run,
           m.m0::timestamp at time zone 'UTC',
           (m.m0 + interval '1 month')::date::timestamp at time zone 'UTC') e
    where p_run is not null
      and not exists (select 1 from stored_refs)
      and e.audience = 'industry-other'
  ),
  members as (
    select distinct t.object_id, u.vid
    from (select * from stored_refs union all select * from run_refs) t, unnest(t.video_ids) u(vid)
    where t.object_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  seg as (
    select * from public.segments_for_videos(p_client, (select array_agg(distinct vid) from members))
  )
  select mb.object_id::uuid,
         count(*)::int,
         (count(*) filter (where s.segment = 'maker'))::int,
         (count(*) filter (where s.segment = 'noise'))::int,
         (count(*) filter (where s.labelled))::int
  from members mb
  join seg s on s.video_id = mb.vid
  group by mb.object_id
$$;

-- The month's market videos per audience and segment, by the same precedence.
create or replace function public.market_segment_counts(p_client uuid, p_month date)
returns table (audience text, segment text, videos int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mv as (
    select * from public.market_month_videos(p_client, p_month)
  ),
  seg as (
    select * from public.segments_for_videos(p_client, (select array_agg(video_id) from mv))
  )
  select mv.audience, s.segment, count(*)::int
  from mv join seg s on s.video_id = mv.video_id
  group by mv.audience, s.segment
  order by mv.audience, s.segment
$$;

revoke all on function public.segments_v1_reason(text, text[], text[], text[]) from public, anon, authenticated;
revoke all on function public.segments_for_videos(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.market_month_videos(uuid, date) from public, anon, authenticated;
revoke all on function public.market_month_depth(uuid, date) from public, anon, authenticated;
revoke all on function public.theme_maker_shares(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.market_segment_counts(uuid, date) from public, anon, authenticated;
grant execute on function public.segments_v1_reason(text, text[], text[], text[]) to service_role;
grant execute on function public.segments_for_videos(uuid, uuid[]) to service_role;
grant execute on function public.market_month_videos(uuid, date) to service_role;
grant execute on function public.market_month_depth(uuid, date) to service_role;
grant execute on function public.theme_maker_shares(uuid, date, uuid) to service_role;
grant execute on function public.market_segment_counts(uuid, date) to service_role;

-- 4. Three more surfaces on the change log ----------------------------------------
-- 'segment' (a segment rule version or label run), 'gate_rule' (the relevance
-- gate fix), 'attribution' (attribution v3). The list is the 20260918090000
-- list plus these three; lib/config-log.test.ts pins CONFIG_SURFACES to the
-- newest migration that writes it. PANEL_STALING_SURFACES
-- (lib/reading/attention.ts) is NOT changed before the 4 Oct run.
alter table public.config_changes drop constraint if exists config_changes_surface_check;
alter table public.config_changes add constraint config_changes_surface_check
  check (surface in (
    'terms','rivals','handles','platforms','subreddits','cadence','knobs',
    'schedule','subjects','entity_retag','regate','prompt_version','rival_rename','other',
    'segment','gate_rule','attribution'));

-- 5. R12: a tenant cannot change the search set or the sending cadence around
-- the app --------------------------------------------------------------------
-- The tenant lock (lib/tenant-locks.ts) is enforced in the server actions, and
-- until now `authenticated` held column UPDATE on these tracking_configs
-- columns under the "Owners and admins update config" policy, so a Sealand
-- owner or admin holding their session token could PATCH rivals, exclusions,
-- communities or cadence through PostgREST and never meet assertTenantMay (the
-- audit trigger would still log it). The three settings writes that used these
-- grants (updateTrackingConfig's first update, updateSearchTerms' exclude_terms
-- update, updateCommunity's update) now go out on the admin client after their
-- role and lock checks, so nothing in the app needs them. The term columns were
-- already revoked by 20260820120000 (T0-2); naming them again keeps this list
-- whole if a later migration ever re-grants one. last_actor, updated_at and
-- report_emails keep their grants: none of them moves a search or a send.
revoke update (competitor_names, exclude_terms, subreddits, report_period, report_day,
               brand_keywords, competitor_keywords, industry_keywords)
  on public.tracking_configs from authenticated;
