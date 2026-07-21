-- Executive brief (2026-07-18): the woven exec-briefing narrative that leads the
-- dashboard. Pass D-a authors numberless prose — a headline_finding plus a few
-- metric-tagged beats carrying `[[n]]` tokens — and the dashboard substitutes the
-- authoritative figures from run_summary at render (lib/dashboard-narrative.ts).
-- Additive + nullable: rows written before this (and any run whose brief fails
-- validation) simply carry null and the dashboard falls back to a code-composed
-- narrative. Shape mirrors consumer_intelligence_summary — one jsonb blob on the
-- run's summary row.
alter table public.run_summary
  add column if not exists executive_brief jsonb;
