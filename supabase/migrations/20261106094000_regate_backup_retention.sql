-- The regate's backup goes at 30 days, like every other YouTube row we keep
-- (the fresh review of release/oct2, item 2: "regate_backup keeps YouTube
-- comment text with no expiry").
--
-- WHY. `regate_videos()` (20261106092000) copies every row it removes into
-- `regate_backup` as jsonb, comments and their text included. The YouTube API
-- Services Developer Policy (III.E.4.d) allows Non-Authorized Data to be kept
-- for at most 30 days without a refresh, and a jsonb copy can never be
-- refreshed. The retention cron (inngest/functions/retention.ts) refreshes or
-- deletes YouTube rows in `comments` and `videos`; until now nothing reached
-- their copies here. A restore after 30 days would also bring back data the
-- API no longer vouches for.
--
-- WHAT. The retention cron gets one more step, `purge-regate-backup` (after
-- `purge-stale-youtube-comments`), which deletes every backup row whose
-- `backed_up_at` is past YOUTUBE_RETENTION_DAYS (30). A batch is written in one
-- transaction, so its rows share one `backed_up_at` (now()) and a batch goes
-- whole: a half-pruned batch would restore an insight without its comment.
-- Every platform's rows go with it, not YouTube's alone, for the same reason.
-- After that the undo for the batch is gone (`regate_restore` says "no batch").
--
-- This migration: 20261106092000 granted the service role select, insert and
-- update on the table and named no delete, so the step's delete is granted here
-- explicitly rather than left to Supabase's default privileges. And an index on
-- `backed_up_at` for the nightly range delete.
--
-- ADDITIVE AND IDEMPOTENT: a grant (repeatable), an index (if not exists) and a
-- comment (replaced). Nothing is dropped or rewritten. Applied twice on a
-- throwaway PostgreSQL 17 cluster (scripts/pg-shim/throwaway.sh twice) with an
-- empty catalogue diff, and exercised by
-- scripts/pg-shim/regate-backup-retention-checks.sql.

grant delete on public.regate_backup to service_role;

create index if not exists regate_backup_backed_up_at_idx on public.regate_backup (backed_up_at);

comment on table public.regate_backup is
  'Every row regate_videos() removed, whole, before it was removed (row_data = to_jsonb of the row, source_table = where it lived). regate_restore(batch_id) puts a batch back. Kept 30 days from backed_up_at, then deleted whole by the retention cron (purge-regate-backup; YouTube API policy III.E.4.d). Service role only.';
