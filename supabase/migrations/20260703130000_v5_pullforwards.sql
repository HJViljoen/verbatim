-- v5 pull-forwards (Redesign Spec 2026-07-03 §8) — additive schema for the
-- approved pipeline changes: Pass A v3 (journey stage + language samples),
-- cross-reference detection, persisted themes (Step A2 + Pass B + first-seen
-- matching), and the Pass D consumer-intelligence summary. Existing rows keep
-- null/default values until the next scheduled run backfills them.

-- 1. Pass A v3: journey-stage tag on insights. App-level vocab like category
--    (awareness / consideration / purchase / ownership / advocacy), no CHECK.
alter table public.audience_insights
  add column if not exists journey_stage text;

-- 2. Pass A v3: verbatim language samples — customer phrasings worth reusing in
--    marketing copy, each validated (verbatim) against a real comment like
--    insight evidence. Surfaces on Voice of Customer "How your customers talk".
create table if not exists public.language_samples (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  run_id          uuid not null references public.pipeline_runs(id) on delete cascade,
  platform        text,
  source_video_id uuid references public.videos(id) on delete cascade,
  comment_id      uuid references public.comments(id) on delete cascade,
  phrase          text not null,
  created_at      timestamptz not null default now()
);

create index if not exists language_samples_client_run_idx
  on public.language_samples (client_id, run_id);

alter table public.language_samples enable row level security;

drop policy if exists "Users see their own language_samples" on public.language_samples;
create policy "Users see their own language_samples"
  on public.language_samples for select
  using (client_id = get_my_client_id());

-- 3. Cross-reference detection: client-brand mentions in comments under
--    competitor/industry videos — switching signals attributed to the client
--    (Competitive "what their customers say about you"). Deterministic regex
--    pass, re-derived each run (idempotent).
alter table public.comments
  add column if not exists client_brand_mention boolean not null default false,
  add column if not exists brand_mention_keyword text;

-- 4. Persisted themes — Step A2 clusters carrying Pass B labels/descriptions,
--    the single-source badge (kept instead of dropped at the evidence floor),
--    and the first_seen flag from mini theme-matching ("New" badges + email
--    delta). embedding stores the label+description vector so next run's
--    matching never re-embeds the previous run. Replaced per (client, run).
create table if not exists public.themes (
  id                        uuid primary key default gen_random_uuid(),
  client_id                 uuid not null references public.clients(id) on delete cascade,
  run_id                    uuid not null references public.pipeline_runs(id) on delete cascade,
  bucket                    text not null,
  category                  text not null,
  label                     text not null,
  description               text,
  member_themes             text[] not null default '{}',
  supporting_insight_ids    uuid[] not null default '{}',
  supporting_video_ids      uuid[] not null default '{}',
  evidence_count            integer not null default 0,
  strength_score            integer check (strength_score >= 1 and strength_score <= 10),
  dominant_emotion          text,
  dominant_sentiment_impact text,
  single_source             boolean not null default false,
  first_seen                boolean not null default true,
  embedding                 jsonb,
  created_at                timestamptz not null default now()
);

create index if not exists themes_client_run_idx
  on public.themes (client_id, run_id);

alter table public.themes enable row level security;

drop policy if exists "Users see their own themes" on public.themes;
create policy "Users see their own themes"
  on public.themes for select
  using (client_id = get_my_client_id());

-- 5. Pass D consumer-intelligence summary (top unmet needs / buying triggers /
--    differentiators / emotional snapshot / threats). Lives on run_summary,
--    which the pipeline back half now populates each run (it was previously
--    unwritten) — also the data source for the weekly-email delta block.
alter table public.run_summary
  add column if not exists consumer_intelligence_summary jsonb;
