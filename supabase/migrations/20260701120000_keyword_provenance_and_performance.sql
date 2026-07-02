-- Per-keyword provenance + value tracking (v5-Ideas: "Keyword Value Tracking →
-- Self-Improving Targeting"). Enabled by the 2026-07-01 per-keyword search change
-- in lib/gather/gather.ts (every keyword now gets its own search on every platform).

-- 1. Which keyword(s) surfaced each video. The gather orchestrator unions this
--    across a run's per-keyword searches; overwritten on each re-gather.
alter table public.videos
  add column if not exists source_keywords text[] not null default '{}';

-- 2. Per-keyword, per-platform, per-run performance — the raw signal for scoring
--    keyword value and suggesting keyword adds/removals. value_score is provisional
--    (gate-survival rate x eligible videos); insights_contributed is filled by a
--    later analysis pass, so it stays null until then.
create table if not exists public.keyword_performance (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients(id) on delete cascade,
  run_id                uuid not null references public.pipeline_runs(id) on delete cascade,
  platform              text not null,
  keyword               text not null,
  bucket                text not null check (bucket in ('brand', 'competitor', 'industry')),
  videos_found          integer not null default 0,
  gate_survived         integer not null default 0,
  eligible_videos       integer not null default 0,
  insights_contributed  integer,
  value_score           numeric(6,2),
  created_at            timestamptz not null default now(),
  unique (client_id, run_id, platform, keyword)
);

create index if not exists keyword_performance_client_run_idx
  on public.keyword_performance (client_id, run_id);

-- Tenant isolation: mirror the videos SELECT policy exactly (get_my_client_id()).
-- The pipeline writes via the service role, which bypasses RLS, so no write policy
-- is needed for app users.
alter table public.keyword_performance enable row level security;

drop policy if exists "Users see their own keyword_performance" on public.keyword_performance;
create policy "Users see their own keyword_performance"
  on public.keyword_performance for select
  using (client_id = get_my_client_id());
