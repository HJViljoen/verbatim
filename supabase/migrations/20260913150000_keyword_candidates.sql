-- Keyword candidate discovery (2026-09-13). The other half of keyword value
-- tracking: keyword_performance says which CONFIGURED terms earn their spend,
-- this says which terms the corpus keeps showing us that nobody configured.
--
-- Mined per run from the gate-kept videos of that run (classifier topics and
-- hashtags), with everything already tracked excluded. Pure aggregation — no
-- model call — so a row is cheap, reproducible, and safe to recompute.
-- Written by the keyword-discovery pipeline step (service role) and repaired
-- by scripts/backfill-keyword-candidates.ts; read by scripts/keyword-candidates.ts.

create table if not exists public.keyword_candidates (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  run_id              uuid not null references public.pipeline_runs(id) on delete cascade,
  -- Lowercased, folded-for-comparison but stored as it was tagged; a hashtag
  -- is stored WITHOUT its leading '#'.
  term                text not null,
  kind                text not null check (kind in ('topic', 'hashtag')),
  videos              integer not null,
  comments            integer not null,
  insights            integer not null default 0,
  platforms           text[] not null,
  -- Configured term -> how many of these videos that term found. Says which
  -- existing search a candidate rides in on; empty for owned-only terms, which
  -- no search found.
  found_by            jsonb not null default '{}',
  owned_videos        integer not null default 0,
  client_videos       integer not null default 0,
  competitor_videos   integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (client_id, run_id, kind, term)
);

create index if not exists keyword_candidates_client_run_idx
  on public.keyword_candidates (client_id, run_id);

-- Tenant isolation: same shape as keyword_performance (get_my_client_id()).
-- The pipeline writes via the service role, which bypasses RLS, so no write
-- policy is needed for app users.
alter table public.keyword_candidates enable row level security;

drop policy if exists "Users see their own keyword_candidates" on public.keyword_candidates;
create policy "Users see their own keyword_candidates"
  on public.keyword_candidates for select
  using (client_id = get_my_client_id());
