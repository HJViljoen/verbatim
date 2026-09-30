-- The written read (plan "Verbatim, writing back", T4): one row per run and
-- kind, holding the week's written read of the market (and, from T8, the
-- month's), as lib/written/compose.ts composed it.
--
-- WHAT A ROW IS. The run's week pool and where the market stands, written by
-- one model call, scrubbed, self-checked and composed by code
-- (lib/written/step.ts, the pipeline's `write-week-read` step, or
-- scripts/week-read.ts --write as the fallback). `data` is `WeekReadData`
-- (lib/written/types.ts): the model's sentences after scrub, code's lines as
-- `[[key]]` bodies with their printed figures beside them, and every quote as
-- a REF with `text: ''`. No comment's words are ever stored here: they
-- resolve at render (AGENTS.md, "Exports and reports freeze numbers, never
-- words").
--
-- STATUS. `ready` (findings to print), `thin` (none: a thin week makes no
-- model call, and a week whose written findings were all held stores what it
-- has), `failed` (the step could not write it; `data` is null and the operator
-- was alerted). A surface prints a read only when it is `ready`.
--
-- ONE ROW PER (run, kind), REPLACEABLE. The step upserts on (run_id, kind): a
-- retried step, or the Monday fallback over a failed Sunday, replaces the
-- run's row rather than adding a second. So the service role holds INSERT and
-- UPDATE (an upsert needs both) and not DELETE or TRUNCATE; a row goes only
-- with its run or its client (the cascades run as the owner).
--
-- RLS: the tenant's members read their own client's rows (the
-- get_my_client_id() policy every tenant table carries); only the service role
-- writes. Additive: a new table, nothing existing changes, so it can go live
-- before the code that writes it.
--
-- IDEMPOTENT: `if not exists`, drop-then-create for the policy, grants that
-- are no-ops the second time. Applied twice on a throwaway PostgreSQL 17
-- cluster (scripts/pg-shim/throwaway.sh) with an empty catalogue diff, and
-- exercised by scripts/pg-shim/week-reads-checks.sql. No BEGIN/COMMIT.

create table if not exists public.week_reads (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  run_id       uuid not null references public.pipeline_runs(id) on delete cascade,
  -- 'week' each run; 'month' when a run closes a month (plan T8).
  kind         text not null default 'week' check (kind in ('week', 'month')),
  -- The reading month (the first of it) and the run's frozen window,
  -- half-open [window_start, window_end). Null only on a failed row the step
  -- could not read the run for.
  month        date,
  window_start timestamptz,
  window_end   timestamptz,
  data         jsonb,
  status       text not null check (status in ('ready', 'thin', 'failed')),
  cost_usd     numeric not null default 0,
  created_at   timestamptz not null default now(),
  constraint week_reads_run_kind unique (run_id, kind),
  -- A read that is not a failure says what it is of.
  constraint week_reads_complete check (
    status = 'failed' or (data is not null and month is not null and window_start is not null and window_end is not null)
  )
);

comment on table public.week_reads is
  'The written read of the market, one row per run and kind (week, month), composed by lib/written. Quotes are refs with empty text; words resolve at render. Only a ready row prints.';

-- The front page and the reports read a client's latest read of a kind.
create index if not exists week_reads_client_latest_idx
  on public.week_reads (client_id, kind, window_end desc nulls last);

alter table public.week_reads enable row level security;

drop policy if exists "Members read their week reads" on public.week_reads;
create policy "Members read their week reads" on public.week_reads
  for select to authenticated using (client_id = public.get_my_client_id());

revoke all on public.week_reads from anon, authenticated;
grant select on public.week_reads to authenticated;
grant select, insert, update on public.week_reads to service_role;
revoke delete, truncate on public.week_reads from service_role;
