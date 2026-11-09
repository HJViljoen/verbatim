-- pipeline_runs.warnings: a step out of retries that the run does not count
-- (9 Nov 2026).
--
-- Össur's October product figures were refused on 28 Oct, 1 Nov and 8 Nov
-- (Postgres 23505) and went stale for twelve days with nothing on the run row:
-- the step only logged, and the host drops a log line within the hour. The
-- product steps now record to `errors` and close the run 'partial'. The other
-- side steps (lens and brand readings, segments, comparability, the monthly
-- freeze, subject membership, embeddings, keyword discovery, quote
-- translation, the anomaly check, the own-accounts plan) still only log, on
-- purpose: their failure must not change how a run counts.
--
-- So a warning gets its OWN column, never `errors`. `errors` is read by the
-- week charts' cadence (lib/reading/week-line.ts `gatherCompleted`: a partial
-- run counts as a completed gather only when every entry is a known after-
-- gather label, a string), and a warning there would cut chart weeks.
-- `status`, `error_message` and `errors` stay exactly as close-run has always
-- written them; nothing that judges a run reads this column.
--
-- Each entry: {step, kind ('stale-data' | 'housekeeping'), month?, week?,
-- subject?, cause, stale} (lib/pipeline/run-warnings.ts `RunWarning`). The
-- cause is an error code and a scrubbed message, never comment text.
--
-- ADDITIVE AND SAFE ON EITHER SIDE OF THE DEPLOY. A constant default is a
-- catalogue change in Postgres 11+, no table rewrite. Old code never names the
-- column and every row it writes takes '[]'. New code before this is applied
-- gets 42703 / PGRST204 for `warnings` at close-run and writes the row again
-- without it (`closeRunWrite`); the ops page reads its absence as "not
-- recorded yet" (`loadRunWarnings`). Same grants as the rest of the table, the
-- same rows as `errors` to the same readers.
--
-- Apply on the staging branch (phase1-staging) first, then production, by hand.

alter table public.pipeline_runs
  add column if not exists warnings jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pipeline_runs_warnings_array_check'
  ) then
    alter table public.pipeline_runs
      add constraint pipeline_runs_warnings_array_check
      check (jsonb_typeof(warnings) = 'array');
  end if;
end $$;

comment on column public.pipeline_runs.warnings is
  'Steps out of retries that the run does NOT count: never read by status, error_message, errors, the week charts, comparability, thin weeks, the weekly email, the briefs or the ops check. A stale-data entry sends the run''s one alert; a housekeeping one shows on the ops readiness page only. Written by close-run (lib/pipeline/run-warnings.ts).';
