-- provider_calls: what the direct scraping providers cost (28 Nov 2026).
--
-- From about 17 Nov Instagram's hashtag pages stopped handing
-- apify/instagram-scraper a dense recent feed, and Instagram discovery
-- collapsed. TikHub's hashtag feed, called directly or through treg
-- (lib/gather/providers/), now runs first, with Apify kept as the fallback.
-- Apify's spend has apify_runs; this is the same record for the new
-- providers: ONE ROW PER PROVIDER JOB (one hashtag feed paged, later one
-- post's comments), carrying the number of HTTP calls it made and their exact
-- cost (treg's X-Treg-Cost-Micro header, or the list price on the direct
-- route). The router reads a run's sum before each search as a soft budget
-- (RUN_SCRAPE_BUDGET_USD); the costs page does not read it yet.
--
-- The insert is best-effort and non-fatal (lib/gather/providers/ledger.ts),
-- like apify_runs': bookkeeping must never fail a gather step that already
-- spent the money.
--
-- ADDITIVE AND SAFE ON EITHER SIDE OF THE DEPLOY. A new table nothing old
-- reads. New code before this is applied: the insert fails, is logged and
-- swallowed, and the budget read answers 0, so searches run as they would
-- with spend to spare.
--
-- Locked to the server: RLS on with no policy, nothing granted to anon or
-- authenticated (the Nov 2026 operator-table pattern, cost_settings'), so the
-- service role alone reads or writes it.
--
-- Apply on the staging branch (phase1-staging) first, then production, by hand.

create table if not exists public.provider_calls (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Null for a script or a one-off call: the money was still spent, it just
  -- belongs to no pipeline run. Same delete rule as apify_runs.
  run_id uuid references public.pipeline_runs(id) on delete cascade,
  -- The Inngest step id ('search:instagram:upcycled bag:reels').
  step text,
  provider text not null,
  -- 'direct' (the provider's own API) or 'treg' (relayed at the same price).
  transport text not null,
  -- What was asked, e.g. 'instagram.hashtag'.
  job text not null,
  -- What it was asked of, e.g. 'upcycledbag:recent'.
  target text,
  -- HTTP requests the job made, retries included.
  calls int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  -- Items the provider handed back, and the ones the job kept (in the window).
  items_seen int not null default 0,
  items int not null default 0,
  outcome text not null check (outcome in ('ok', 'partial', 'empty', 'error')),
  error text,
  duration_ms int,
  created_at timestamptz not null default now()
);

-- The budget read and any per-run sum.
create index if not exists provider_calls_run_idx on public.provider_calls using btree (run_id);
-- Spend by client over time (the costs page, later).
create index if not exists provider_calls_client_created_idx on public.provider_calls using btree (client_id, created_at);

alter table public.provider_calls enable row level security;

revoke all on table public.provider_calls from anon, authenticated;
grant all on table public.provider_calls to service_role;

comment on table public.provider_calls is
  'One row per direct scraping-provider job (TikHub, later ScrapeCreators), with its HTTP call count and exact cost. Operator only: RLS on with no policy, the service role alone reads or writes.';
comment on column public.provider_calls.cost_usd is
  'Exact: treg''s X-Treg-Cost-Micro header summed over the job''s calls, or the list price per billed call on the direct route.';
