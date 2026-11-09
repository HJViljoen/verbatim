-- "What I'd take from that", written again on each weekly re-reading of a plan
-- (Heinrich, 9 Nov 2026).
--
-- The judgement was written once, at upload (`plan_checks.judgement`), and
-- never again, so it reasoned from verdicts that later re-readings had moved.
-- `ask-reevaluate` now writes it again on each new reading (one gpt-5.4 call a
-- check, at most ASK_REEVALUATE_MAX_CHECKS = 3 a run) and keeps it ON THAT
-- READING'S ROW. Nothing is overwritten: the upload's judgement stays on
-- `plan_checks`, and every week's on its own evaluation row.
--
-- NULL is meaningful: that week's rewrite was not made (not started in time,
-- failed, or came back empty), and the thread prints the newest judgement
-- written before it, with that one's own date. Every row written before this
-- migration is NULL.
--
-- ADDITIVE AND SAFE BEFORE ITS CODE OR AFTER IT. Until this is applied, the
-- step probes for the column and makes no judgement call (nothing is spent on
-- a judgement that cannot be kept), and the thread reads the evaluations
-- without it and prints the upload's judgement as before.
--
-- Grants: the table's existing grants (select to authenticated, all four to
-- service_role, 20260918098000_sent_figures.sql) are table-level and cover a
-- new column. RLS is unchanged.
--
-- NOT APPLIED by the branch that wrote it. Apply with the operator's usual
-- path, then check by hand:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'plan_check_evaluations'
--      and column_name = 'judgement';                        -- one row, jsonb

alter table public.plan_check_evaluations
  add column if not exists judgement jsonb;

comment on column public.plan_check_evaluations.judgement is
  'The model''s own proposals ("What I''d take from that") written on THIS reading, each citing the claim refs it reasons from: [{ text, basedOnRefs }]. NULL where that week''s rewrite was not made; the thread then prints the newest one written before, with its date. The upload''s stays on plan_checks.judgement.';
