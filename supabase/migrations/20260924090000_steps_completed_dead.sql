-- pipeline_runs.steps_completed is dead, and says so (2026-09-24).
--
-- Run b67b56de closed with steps_completed = '{}' while embed-insights wrote
-- 1,162 embeddings and freeze-months wrote its month_denominators, which reads
-- as a step recorder that stopped working. It never worked: the column has a
-- '{}' default, the pipeline function has never written it on any path, and
-- 20260915094000_insight_embedding.sql already recorded the measurement — 0 of
-- 49 rows had ever carried a value. The one writer in the repo was
-- scripts/seed-demo.ts, which made demo data the only place the column looked
-- alive; that write is removed in the same commit. Nothing reads it: no page,
-- no loader, no script, no view, no RPC.
--
-- NOT DROPPED, and that is the decision. A DROP COLUMN here would land on
-- production ahead of whatever else is in flight on a branch that is not
-- deployed yet, to reclaim nothing (an empty text[] with a default costs a
-- byte a row) and to take with it the only evidence of what the column was for
-- if anyone ever does want a step recorder. A comment is what makes the next
-- person reading the row stop treating '{}' as a finding, which is the whole
-- of the harm it has done.
--
-- What actually answers "which steps ran": the Inngest run history, and the
-- rows each step writes (audience_insights.embedded_at, month_denominators,
-- run_costs). pipeline_runs.errors / error_message answer "which ones failed".

comment on column public.pipeline_runs.steps_completed is
  'DEAD COLUMN. Never written by the pipeline — the default ''{}'' is the only value any production row has ever held (0 of 49 as of 2026-09-15) — and read by nothing in the application. An empty array here is NOT evidence that steps did not run; use the Inngest run history, the rows each step writes, and pipeline_runs.errors. Do not add a reader without first making a writer.';
