-- Owned-account data, Phase 0 (Architecture/Owned-Data-Plan 2026-07-08) — the
-- client's own social accounts become a first-class data source. Additive:
-- owned posts/comments land in the existing videos/comments tables tagged
-- source='owned'; account-level metric series live in account_snapshots; and
-- Step 2c's detected-then-explained metric events live in account_events.
-- Passes A–D are untouched. All columns nullable/defaulted — safe to apply live.

-- 1. Source tag: 'discovered' (Apify keyword search — everything to date) vs
--    'owned' (the client's own accounts, Layer 0/1). The SoV guard filters
--    source='owned' out of discovered-corpus metrics so a client's own posting
--    never inflates their share of conversation.
alter table public.videos
  add column if not exists source text not null default 'discovered'
    check (source in ('discovered', 'owned'));

alter table public.comments
  add column if not exists source text not null default 'discovered'
    check (source in ('discovered', 'owned'));

-- 2. Account snapshots — the owned metric series (followers, post counts,
--    platform extras in jsonb). Code-only: the numeric-grounding rule keeps
--    these numbers out of GPT entirely. run_id is nullable on purpose — the
--    cadence decision (weekly-with-run vs daily snapshots) is still open, and
--    daily snapshots would not belong to a run.
create table if not exists public.account_snapshots (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  run_id        uuid references public.pipeline_runs(id) on delete set null,
  platform      text not null,
  handle        text,
  snapshot_date date not null,
  followers     integer,
  posts_count   integer,
  metrics       jsonb,
  created_at    timestamptz not null default now(),
  unique (client_id, platform, snapshot_date)
);

create index if not exists account_snapshots_client_platform_idx
  on public.account_snapshots (client_id, platform, snapshot_date);

alter table public.account_snapshots enable row level security;

drop policy if exists "Users see their own account_snapshots" on public.account_snapshots;
create policy "Users see their own account_snapshots"
  on public.account_snapshots for select
  using (client_id = get_my_client_id());

-- 3. Account events — Step 2c output. Code detects events on the snapshot
--    series (thresholds decide whether there is anything to explain) and
--    renders magnitude_label + severity; one GPT call per run explains from
--    the run's themes + owned comments. "Unexplained" is a first-class outcome:
--    explained=false with a null explanation renders honestly — never a
--    confabulated cause. Replaced per (client, run), like competitive_insights.
create table if not exists public.account_events (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.clients(id) on delete cascade,
  run_id                  uuid not null references public.pipeline_runs(id) on delete cascade,
  platform                text not null,
  metric                  text not null check (metric in ('followers', 'post_performance')),
  event_date              date not null,
  direction               text not null check (direction in ('up', 'down')),
  magnitude_pct           numeric,
  magnitude_label         text not null,
  severity                integer not null check (severity between 1 and 3),
  video_id                uuid references public.videos(id) on delete cascade,
  explained               boolean not null default false,
  explanation             text,
  supporting_theme_labels text[] not null default '{}',
  hero_quote              text,
  created_at              timestamptz not null default now()
);

create index if not exists account_events_client_run_idx
  on public.account_events (client_id, run_id);

alter table public.account_events enable row level security;

drop policy if exists "Users see their own account_events" on public.account_events;
create policy "Users see their own account_events"
  on public.account_events for select
  using (client_id = get_my_client_id());
