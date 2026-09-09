-- Exact Apify cost per run (Phase 3, 2026-09-09).
--
-- Apify bills per ACCOUNT, and run-sync-get-dataset-items returned dataset
-- items and nothing else — no run id, no usage — so the only thing the product
-- could say about a run's Apify spend was "the account spent this much during
-- roughly this window". That answer is labelled 'ambiguous' the moment two
-- tenants overlap, which is every scheduled dispatch, and a floor rather than
-- a total whenever the account listing ran out of pages.
--
-- runActorWithMeta (lib/gather/apify.ts) now starts the run explicitly, so it
-- has the run id, and writes one row here per actor call. Summing these rows
-- for a run is exact by construction; the old window method stays as the
-- labelled fallback for runs that predate this table.
--
-- Insert is best-effort and non-fatal (lib/gather/apify-runs.ts): bookkeeping
-- must never fail a gather step that already spent the money. A missing row
-- therefore has to be survivable, which is why run_costs still records HOW it
-- reached its figure.

create table if not exists public.apify_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Null for a script or a one-off call: the money was still spent, it just
  -- belongs to no pipeline run.
  run_id uuid references public.pipeline_runs(id) on delete cascade,
  -- The Inngest step id ('comments:instagram:4'), so spend reads back per step.
  step text,
  actor_id text not null,
  -- Apify's own run id. Unique so a step retry that re-reads the same run, or a
  -- settle pass, can never double-count it.
  apify_run_id text not null unique,
  status text,
  -- At insert this is `usageTotalUsd` as of the moment the run ended, which
  -- UNDER-reports a pay-per-event actor (its charges settle ~a minute later).
  -- The close-run settle pass re-reads it and flips `settled`.
  usage_usd numeric(10,4),
  items int,
  started_at timestamptz,
  finished_at timestamptz,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

-- The only read pattern: every row of one pipeline run (settle pass, run_costs).
create index if not exists apify_runs_run_idx on public.apify_runs using btree (run_id);

alter table public.apify_runs enable row level security;
-- Operator-only, like run_costs: cost is not a tenant-facing number.
create policy "Superadmins read apify_runs" on public.apify_runs for select using (public.is_superadmin());

comment on table public.apify_runs is
  'One row per Apify actor run started by the pipeline. Summed by run_costs for apify_attribution=''exact''; usage_usd is a floor until settled=true.';
comment on column public.apify_runs.settled is
  'False until the close-run settle pass re-read usageTotalUsd at least 60s after the run finished. Pay-per-event charges land after the run ends, so an unsettled figure is a floor.';

-- run_costs.apify_attribution gains a fifth value and its first two change
-- meaning: 'exact' now means "summed from this run's own apify_runs rows",
-- 'exact_unsettled' the same sum while at least one row is still a floor, and
-- 'ambiguous'/'partial'/'unavailable' keep their old meanings on the fallback
-- window path. No CHECK constraint to widen — the column is free text.
comment on column public.run_costs.apify_attribution is
  '''exact'' = summed from this run''s apify_runs rows; ''exact_unsettled'' = the same sum with at least one run''s pay-per-event charges not yet settled (a floor); ''ambiguous''/''partial''/''unavailable'' = the account-window fallback for runs with no rows.';
