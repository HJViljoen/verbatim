-- Owned census (2026-09-09). The client's own post count for the update window
-- has to be a CENSUS, not a sample: it is the number behind "you published n
-- posts this update", and until now the owned read stopped at the 12 most
-- recent posts per platform (Sealand published 28 on Instagram in a 30-day
-- window). The gather side now reads every in-window post; this column is where
-- the resulting count is frozen alongside the window it is true for, so a
-- report rendered months later still says what was counted and over what dates.
--
-- Shape: { "<platform>": { "posts": n, "since": "YYYY-MM-DD",
--                          "until": "YYYY-MM-DD", "handle": "…" } }
-- Additive and nullable — every run written before this has no census, and the
-- share tile falls back to its previous wording for those.

alter table public.run_summary add column if not exists owned_census jsonb;

comment on column public.run_summary.owned_census is
  'Exact count of the client''s own posts per platform for this run''s window, with the window and handle each count is true for. Null on runs written before 2026-09-09.';

-- Post-apply check (run by hand):
--   select column_name, data_type from information_schema.columns
--    where table_name = 'run_summary' and column_name = 'owned_census';
