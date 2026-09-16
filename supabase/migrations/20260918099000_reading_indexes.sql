-- M10 · Reading-layer performance: two indexes, and nothing else (Phase 1 WP23)
--
-- WHAT THIS IS FOR. Every reading page was measured against production on
-- 15-16 September, loader by loader and read by read: Overview 9.9 s (Össur) /
-- 7.3 s (Sealand), This week 8.9 / 10.7, Market ~78 s once, and one statement
-- timeout in loadRecordInputs -> loadLanguage. Almost all of that was the
-- NUMBER of round trips and the order they were made in, and almost all of the
-- fix is in TypeScript — reads folded together, reads memoised for one request,
-- reads started when they stop depending on anything. `pg_stat_statements` says
-- the same thing from the database's side: the single most expensive statement
-- on this instance is PostgREST's own per-request `set_config(...)`, 80,938
-- calls for 155 s, which is the cost of ASKING, not of answering.
--
-- SO THIS FILE IS DELIBERATELY SMALL. An index goes in only where `explain
-- (analyze, buffers)` against production shows the plan is the problem. Two
-- did. Everything else the reading layer touches already has the index it
-- wants: `comments (client_id, comment_date)` exists, `comments_pkey` serves
-- the cited-comment reads (110 ms for a 100-id chunk),
-- `idx_insight_evidence_insight` serves the evidence reads (216 ms for 120
-- insights, a nested loop over the index), `month_denominators_pkey` and
-- `month_theme_readings_theme_idx` serve the month reads (10 ms and 34 ms), and
-- `config_changes_client_time_idx`, `pipeline_runs_client_id_idx` and
-- `videos_client_id_platform_video_id_key` serve the rest. Adding an index
-- there would cost write time on the gather path and buy nothing.
--
-- NOT `concurrently`. Both tables are small (videos 8,377 rows / 27 MB,
-- gate_verdicts 4,477 rows / 2.5 MB) so each build takes milliseconds, and a
-- CONCURRENTLY build cannot run inside the transaction a migration is applied
-- in. `if not exists` on both, so the file is idempotent and can be re-applied.

-- ============================================================================
-- 1 · videos — the record's corpus read, as an INDEX-ONLY scan
-- ============================================================================
--
-- lib/reading/record.ts reads every analysed non-Reddit video for two records:
-- how much of each video was read (speech / translation / on-screen text) and
-- what language it was spoken in. It is one read now rather than seven (five
-- `count: exact` head queries plus a paged read over the same population), and
-- the remaining one is the biggest read on the Overview.
--
-- The plan today:
--
--   Index Scan using videos_analyzed_run_idx on videos
--     Index Cond: (client_id = … AND analyzed_run_id IS NOT NULL)
--     Filter: (platform <> 'reddit')
--     rows=1596  Buffers: shared hit=1267  actual time=886 ms
--
-- 1,267 buffers for 1,596 rows, every one of them already in cache. That is
-- the HEAP: a `videos` row averages 3.3 KB because it carries transcripts and
-- OCR text, so barely more than one row fits on a page, and the scan visits a
-- page per row to read five narrow columns. The index below carries those five
-- columns as payload, so the same read is an Index Only Scan that never opens
-- the heap.
--
-- The key is `videos_analyzed_run_idx`'s plus `id`, and the INCLUDE columns are
-- the five the record selects. `platform` is among them because it is a FILTER
-- on this read, and a filter that sends the scan back to the heap is not an
-- index-only scan at all. `id` is in the KEY rather than the payload because
-- the read pages with `selectAll`, which needs a unique order to range over:
-- with `id` in the key, `order by analyzed_run_id, id` is the index's own
-- order, so the scan neither sorts nor opens the heap. loadCorpus orders by
-- exactly that pair for this reason, and the pair is unique because the read's
-- own filter excludes the null `analyzed_run_id`s.
--
-- MEASURED on a throwaway PostgreSQL 17.11 cluster (port 5465) over
-- schema-baseline plus every migration, with 38,400 videos across two tenants
-- at production's row width and the target tenant at production's share of
-- them. The same read:
--
--   with this index      Index Only Scan  Heap Fetches: 0  Buffers: 60
--   without it           Index Scan       (heap)           Buffers: 702
--
-- — a twelfth of the pages, and on production those 702-equivalent pages are
-- 1,267 of them because the rows are fatter still.
--
-- The cost is on the write side: `videos` is upserted by every gather, and this
-- index adds ~500 KB and one more index to maintain per row written. Measured
-- against what it saves on the one page every client opens first, that is the
-- right trade; if a gather ever slows for it, this is the index to question.
create index if not exists videos_analysed_record_idx
  on public.videos (client_id, analyzed_run_id, id)
  include (platform, transcript_lang, analyzed_with_transcript, analyzed_with_translation, analyzed_with_ocr);

comment on index public.videos_analysed_record_idx is
  'Covering index for the record''s corpus read (lib/reading/record.ts loadCorpus): the five columns the read-depth and language records are computed from, carried as INCLUDE payload, with `id` in the key so the read''s paging order (analyzed_run_id, id) is the index''s own and the scan is index-only with no sort. Without it the same read visits 1,267 heap pages for 1,596 rows, because a videos row averages 3.3 KB. Phase 1 WP23.';

-- ============================================================================
-- 2 · gate_verdicts — the discard record's window, by time
-- ============================================================================
--
-- lib/reading/record.ts loadDiscard reads what the gate judged inside the
-- record's window. The five indexes gate_verdicts has all lead with
-- `client_id` and continue with `run_id` or `keyword`; none of them carries
-- `created_at`, and PostgreSQL 17 has no skip scan, so the window is a
-- sequential scan of the whole table:
--
--   Seq Scan on gate_verdicts
--     Filter: (created_at >= … AND created_at <= … AND client_id = …)
--     rows=2777  Rows Removed by Filter: 1700  Buffers: shared hit=213
--     actual time=235 ms
--
-- That was FIVE such scans until this package folded the five head counts into
-- one read; it is one now, and with this index it is an index scan over the
-- rows the window actually holds.
--
-- `created_at desc` rather than ascending, because the other read on this table
-- in the same loader is "when was the first verdict ever recorded" — a
-- `limit 1` on the ascending end, which this index serves backwards — and every
-- window a page asks for is a recent one.
create index if not exists gate_verdicts_client_time_idx
  on public.gate_verdicts (client_id, created_at desc);

comment on index public.gate_verdicts_client_time_idx is
  'The discard record''s window read (lib/reading/record.ts loadDiscard) filters client_id and a created_at range; no other index on this table carries created_at, so the window was a full sequential scan. Phase 1 WP23.';
