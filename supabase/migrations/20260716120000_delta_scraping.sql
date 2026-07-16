-- Delta-scraping (2026-07-16): remember the platform-reported comment count at
-- the moment we last actually scraped a video's comments. A later run that
-- re-finds the video compares the fresh search-metadata count against this
-- baseline: no growth → skip the paid comment scrape; enough growth → re-scrape
-- (the "active video" re-check), even when the video has aged out of the weekly
-- window. Nullable — null means "never comment-scraped" (or pre-feature row),
-- and the delta logic falls back to comments_count (find-time == scrape-time
-- for every pre-feature row, since the old pipeline scraped on every re-find).
alter table videos add column if not exists comments_count_at_scrape integer;

comment on column videos.comments_count_at_scrape is
  'Platform-reported comments_count when comments were last scraped. Baseline for delta-scraping: skip re-scrapes without growth, re-check active videos with it. Null = never scraped.';
