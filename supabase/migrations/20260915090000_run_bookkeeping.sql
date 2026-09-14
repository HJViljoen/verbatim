-- Run bookkeeping: what window a run covered, and which slot it served.
-- Phase 0, design item 19 (2026-09-15).
--
-- Until now a pipeline_runs row said when a run started and stopped and nothing
-- else. The window it gathered was never stored: resolveGatherWindow recomputed
-- `Date.now() - periodWindowDays(period)` separately inside plan-owned, inside
-- every gate:<platform> and inside synthesize, so the two multi-day runs in
-- production (Össur f9548a97 18.1 d, Sealand 2039968a 8.9 d) gathered and
-- synthesised against windows 18 and 9 days apart with nothing to say so. The
-- dispatcher's 06:00 SAST slot was equally invisible: ops-check has to recompute
-- "when was this run expected" from tracking_configs because no run row names
-- the slot it was serving.
--
-- Additive only. Every column is nullable (or defaulted), so a run row written
-- by the old code — and an in-flight run replaying across the deploy — stays
-- valid exactly as it is.
--
-- Backfill is NOT done here: scripts/backfill-run-windows.ts reconstructs the
-- 49 historical rows (period from run_summary.period / options, window
-- [started_at - periodDays, started_at], basis 'reconstructed') behind a
-- --apply flag, so the labelled guess is a deliberate, reviewable act rather
-- than a side effect of a schema change.

-- The dispatcher slot this run served (06:00 SAST that day). NULL = manual run.
alter table public.pipeline_runs add column if not exists scheduled_for timestamptz;

-- The gather window, frozen once at open-run. window_start is NULL on a
-- baseline run: the first map-building run is unwindowed, and writing a bound
-- it never applied would be a lie on the row.
alter table public.pipeline_runs add column if not exists window_start timestamptz;
alter table public.pipeline_runs add column if not exists window_end timestamptz;

-- How window_start was decided:
--   anchored         the previous completed/partial run's window_end
--   anchored_capped  that anchor, pulled forward to the MAX_ANCHOR_DAYS cap
--   rolling          no previous run to anchor on: now - periodWindowDays
--   baseline         the client's first data-producing run: unwindowed
--   resume           an analysis-only resume kept the window already on the row
--   reconstructed    written after the fact by the backfill, not by the run
--   resume_reconstructed  a resume that kept a RECONSTRUCTED window: the run
--                    resumed, but the window it carries is still a label, not a
--                    record of what was gathered, and the row has to keep
--                    saying so (the backfill runs before the first resume)
alter table public.pipeline_runs add column if not exists window_basis text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pipeline_runs_window_basis_check'
  ) then
    alter table public.pipeline_runs
      add constraint pipeline_runs_window_basis_check
      check (window_basis is null or window_basis in
        ('anchored','anchored_capped','rolling','baseline','resume','reconstructed',
         'resume_reconstructed'));
  end if;
end $$;

-- The run's EFFECTIVE period string, frozen at open (options.period override
-- else tracking_configs.report_period). It already lives in run_summary.period,
-- but only for the 17 runs that reached synthesis — a failed run's period was
-- unrecoverable.
alter table public.pipeline_runs add column if not exists period text;

-- The run took longer than the window it covered (close-run). Recorded, not
-- alerted on: nothing reads this column yet.
alter table public.pipeline_runs add column if not exists stalled boolean not null default false;

-- The tracking_configs slice this run acted on: terms, rivals, handles,
-- platforms, subreddits (name + status), cadence and the volume knobs. A run
-- that read a config which has since changed can then be explained.
alter table public.pipeline_runs add column if not exists config_snapshot jsonb;

-- "The previous run's window_end for this client" is the anchored window's one
-- lookup, and it runs inside open-run on every run.
create index if not exists pipeline_runs_client_window_end_idx
  on public.pipeline_runs (client_id, window_end desc);

-- RLS is unchanged: pipeline_runs already carries "Users see their own pipeline
-- runs" (select, client_id = get_my_client_id()). The new columns are the
-- tenant's own configuration and their own run's window, so they are readable
-- by exactly the people who could already read the row, and by nobody else.
