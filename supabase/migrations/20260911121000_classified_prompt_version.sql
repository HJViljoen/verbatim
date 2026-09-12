-- Which classifier regime produced a video's labels (2026-09-11).
--
-- bfe485f gave classified_type and hook_style one-clause DEFINITIONS in the
-- prompt; before it the model chose from bare enum names. That changed what
-- the labels mean, and nothing recorded which regime a row came from —
-- classify-meta writes no prompt version anywhere on the row (videos
-- .analyzed_prompt_version is Pass A's, per its own migration), and
-- ai_call_log.prompt_version is keyed by run and call index, not by video. So
-- Content's hook_style comparison averages two regimes with no way to tell
-- them apart, and no query could separate them after the fact.
--
-- This column cannot fix the rows already written — it makes the split
-- VISIBLE from here on, at zero spend: no row is re-classified (classify-meta
-- only ever picks up videos whose classified_type IS NULL), the column simply
-- records the version each future classification was written under.

alter table public.videos
  add column if not exists classified_prompt_version text;

comment on column public.videos.classified_prompt_version is
  'Classifier prompt version behind classified_type/hook_style/hook_text/topics. NULL = classified before 2026-09-11, when the model chose from bare enum names; set from CLASSIFY_META_PROMPT_VERSION (lib/pipeline/classify-meta.ts) since. Pass A owns analyzed_prompt_version; this column is classify-meta''s and no decision reads it — it exists so a comparison can exclude a regime instead of averaging both.';
