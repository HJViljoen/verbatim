-- Video as signal (WP7a, 2026-09-12): record how much of a theme's evidence was
-- said on camera, not typed in a comment.
--
-- The costly-signal thesis has been in the Pass A prompt since 2026-08-08 ("a
-- produced video is a deliberate, costly act of opinion, a STRONGER signal than
-- a passing comment") and was read nowhere downstream: `insight_evidence.source`
-- ('comment' | 'video') existed and no ranking or selection function queried it.
-- Step A2 now counts, per theme, the distinct supporting videos carrying at
-- least one `source = 'video'` citation, and weights each of them at
-- VIDEO_EVIDENCE_WEIGHT (lib/config.ts) inside rank_score. This column persists
-- that count so the pages can say it out loud ("3 said on camera") instead of
-- re-deriving it from evidence rows on every read.
--
-- Additive and nullable: rows written before this reads as "not recorded", the
-- pages fall back to saying nothing, and rank_score is unaffected for any run
-- whose themes were aggregated before the weight existed.
alter table public.themes
  add column if not exists video_evidence_count integer;

comment on column public.themes.video_evidence_count is
  'Of evidence_count, the distinct supporting videos where the finding was spoken on camera (an insight_evidence row with source = ''video''). Weighted above comment evidence inside rank_score. Null on runs aggregated before 2026-09-12.';
