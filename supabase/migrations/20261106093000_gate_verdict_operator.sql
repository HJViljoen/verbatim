-- An operator's relevance verdict (the backfill, 1 Oct night; the lead's
-- ruling). `gate_verdicts.source` names who judged a video: the free
-- heuristic, the model, or nobody (`default`, the gate failed open). A fourth
-- judge joins them: the operator, a person who read the video and said it
-- belongs in the market (`scripts/backfill-platform.ts --keep <ids> --yes`).
-- The regate keeps a video the model drops when stored work cites it, for a
-- person to decide; this is how that person decides, as an appended verdict
-- (the log is append-only; the earlier rows stay as the record). The newest
-- verdict governs (`market_week_volumes`, 20261106091000), so an operator's
-- keep makes the video checked.
--
-- ADDITIVE AND IDEMPOTENT: the check constraint dropped if it exists and added
-- again with one more value; every existing row satisfies it. No BEGIN/COMMIT
-- (the runner wraps one transaction per file). Applied twice on a throwaway
-- PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an empty
-- catalogue diff.

alter table public.gate_verdicts drop constraint if exists gate_verdicts_source_check;
alter table public.gate_verdicts add constraint gate_verdicts_source_check
  check (source in ('heuristic', 'gpt', 'default', 'operator'));

comment on column public.gate_verdicts.source is
  'Who judged it: heuristic (the free denylist), gpt (the model), operator (a person, scripts/backfill-platform.ts --keep), or default (nobody: the gate failed open). The newest verdict of a video governs.';
