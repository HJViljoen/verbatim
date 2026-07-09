-- Period (per-run) metrics on run_summary — fixes the cumulative-metrics
-- semantics flaw (Teardown 2026-07-09): the existing total_* / sentiment /
-- share_of_voice columns are computed over the client's ALL-TIME corpus, so
-- week-over-week deltas diffed cumulative stocks and damped toward zero as the
-- corpus grew. These columns hold the same metrics computed over ONLY the rows
-- gathered by this run (videos.run_id / comments.run_id = this run): the
-- honest "what happened this update" layer for the email delta and Trends.
-- The corpus columns stay — the dashboard's market-map state legitimately
-- reads the accumulated view. Additive + nullable: old rows simply lack
-- period data and every consumer degrades per-field.

alter table public.run_summary
  add column if not exists period_videos integer,
  add column if not exists period_comments integer,
  add column if not exists period_client_videos integer,
  add column if not exists period_competitor_videos integer,
  add column if not exists period_avg_engagement_rate numeric,
  add column if not exists period_share_of_voice jsonb,
  add column if not exists period_sentiment_positive numeric,
  add column if not exists period_sentiment_neutral numeric,
  add column if not exists period_sentiment_negative numeric,
  add column if not exists period_sentiment_drivers jsonb;
