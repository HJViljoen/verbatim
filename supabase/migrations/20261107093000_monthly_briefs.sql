-- The monthly department briefs' ledger (plan "Verbatim, writing back", T8
-- wired: the Sales, Marketing, Content and Leadership briefs, written by the
-- pipeline on the run that closes a month and shown in the Studio).
--
-- WHAT A ROW IS. One brief: one client, one month, one role. It says whether
-- that brief is `ready` (it prints: `snapshot_id` names its frozen
-- report_snapshots row, kind 'report', data.kind 'monthly_brief'), `thin`
-- (composed, but nothing in it stood, so there is nothing to show) or
-- `failed` (the set could not be written; `error` says why and the operator
-- was alerted once, with the script that writes it by hand). The brief's
-- words live in the snapshot, with every quote a ref and `text: ''`; nothing
-- here holds a comment's words (AGENTS.md, "Exports and reports freeze
-- numbers, never words").
--
-- ONE ROW PER (client, month, role), REPLACEABLE. The step and the script
-- upsert on that key: a retried step, or the script over a failed set,
-- replaces the month's row rather than adding a second. So the service role
-- holds INSERT and UPDATE (an upsert needs both) and not DELETE or TRUNCATE;
-- a row goes only with its client (the cascade runs as the owner). The run
-- that wrote it is kept for provenance and set null if that run is removed.
--
-- SERVICE ROLE ONLY: RLS is on with NO policy and no grant to `authenticated`
-- or `anon`, so a tenant's session reads nothing here even through PostgREST
-- (a failed row's error, a brief's cost and what it held are the operator's:
-- `held` is what a brief wrote and does not print, and why, kept here and
-- never in the snapshot's data, which a tenant reads). The Studio
-- reads it with the service role, scoped to the session's own client; the
-- briefs themselves are report_snapshots rows no send carries, which the
-- tenant reads under that table's own policy.
--
-- ADDITIVE: a new table, nothing existing changes, so it can go live before
-- the code that writes it, and the code no-ops (spending nothing) until it is
-- here. IDEMPOTENT: `if not exists`, grants that are no-ops the second time.
-- No BEGIN/COMMIT (the runner wraps one transaction per file). Applied twice
-- on a throwaway PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice)
-- with an empty catalogue diff.

create table if not exists public.monthly_briefs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  -- The month the brief is about, the first of it.
  month       date not null,
  role        text not null check (role in ('sales', 'marketing', 'content', 'leadership')),
  run_id      uuid references public.pipeline_runs(id) on delete set null,
  status      text not null check (status in ('ready', 'thin', 'failed')),
  snapshot_id uuid references public.report_snapshots(id) on delete set null,
  cost_usd    numeric not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint monthly_briefs_one unique (client_id, month, role),
  -- A month is a month's first day.
  constraint monthly_briefs_month_first check (extract(day from month) = 1)
);

comment on table public.monthly_briefs is
  'The monthly department briefs, one row per client, month and role: ready (snapshot_id names the frozen report_snapshots row), thin or failed. Written by the pipeline''s briefs:* steps and scripts/monthly-briefs.ts; read by the Studio with the service role.';

-- What the brief wrote and does not print, and why ({what, reason}[]): the
-- operator's. A column added on its own, so a database that has the table
-- without it gains it, and a second run is a no-op.
alter table public.monthly_briefs add column if not exists held jsonb not null default '[]'::jsonb;

-- The Studio lists a client's ready briefs, newest month first.
create index if not exists monthly_briefs_client_month_idx
  on public.monthly_briefs (client_id, month desc);

alter table public.monthly_briefs enable row level security;

revoke all on public.monthly_briefs from anon, authenticated;
grant select, insert, update on public.monthly_briefs to service_role;
revoke delete, truncate on public.monthly_briefs from service_role;
