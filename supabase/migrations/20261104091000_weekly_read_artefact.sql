-- The weekly read as an artefact (plan "Verbatim, writing back", T6/T7): a
-- schedule may name `weekly_read`, "This week in your market", the email of
-- the run's stored `week_reads` row (lib/reports/weekly-read-build.ts).
--
-- ONE CHANGE: `report_schedules_artefact_check` (20260918097000_settings.sql)
-- takes an eighth value. Dropped and rebuilt under the same name, as that file
-- rebuilt it: the constraint's name is the contract, and a second constraint
-- with a generated name would be invisible to the next reader. The seven
-- values it held are kept, in their order; nothing else changes, no row is
-- touched, and the partial unique index `report_schedules_one_per_artefact`
-- (client_id, artefact) already holds one `weekly_read` row per tenant.
--
-- ADDITIVE: it only widens what a row may say. The deployed code before it
-- never writes `weekly_read`, and the code after it reads the column the same
-- way, so it applies BEFORE the code deploy and survives a rollback.
--
-- IDEMPOTENT: drop-if-exists then add. No BEGIN/COMMIT (the runner wraps one
-- transaction per file). Applied twice on a throwaway PostgreSQL 17 cluster.

alter table public.report_schedules drop constraint if exists report_schedules_artefact_check;
alter table public.report_schedules add constraint report_schedules_artefact_check
  check (artefact is null or artefact in (
    'weekly', 'monthly', 'quarterly',
    'brief:sales', 'brief:leadership', 'brief:marketing', 'brief:content',
    'weekly_read'
  ));

comment on column public.report_schedules.artefact is
  'Which artefact this schedule sends: weekly_read | weekly | monthly | quarterly | brief:<audience> (sales, leadership, marketing, content). Null on a legacy starter schedule that predates the artefacts. One row per artefact per tenant.';

-- Post-apply check (run by hand):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'report_schedules_artefact_check';
--   -- expect the seven values and 'weekly_read'
