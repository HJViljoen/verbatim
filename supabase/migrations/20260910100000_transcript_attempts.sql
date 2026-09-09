-- Transcript as a precondition of analysis (Phase 2, 2026-09-09).
--
-- A transcript used to be a single shot. Whatever transcript_status the gather
-- wrote was final, and 'failed' was permanent: an expired CDN link, a flaky
-- actor or a provider timeout excluded a video from ever carrying its own
-- words. That is the opposite of the rule the pipeline is meant to hold —
-- every video that enters analysis enters WITH its transcript — so failures
-- are now retried, and a retry budget has to live on the row.
--
-- Two additive columns. transcript_attempts is the number of attempts made by
-- ANY path (this run's media via AssemblyAI or Whisper, the caption actor, the
-- platform-URL backfill); at TRANSCRIPT_MAX_ATTEMPTS (lib/config.ts) 'failed'
-- becomes terminal again. transcript_error keeps the last failure's message so
-- a human can see what the attempts actually hit.

alter table public.videos
  add column if not exists transcript_attempts int not null default 0,
  add column if not exists transcript_error text;

comment on column public.videos.transcript_attempts is
  'Transcript attempts made for this video by any path. ''failed'' is terminal only at TRANSCRIPT_MAX_ATTEMPTS (lib/config.ts); below it the video is re-attempted from its platform URL.';

comment on column public.videos.transcript_error is
  'Message from the LAST failed transcript attempt. Diagnostic only — no decision reads it.';

-- A row that already carries a resolved status was attempted at least once, so
-- the backfill states a fact rather than inventing one. It matters for exactly
-- the rows the retry loop will look at: without it every historical 'failed'
-- would silently get a full three fresh attempts instead of two.
update public.videos
   set transcript_attempts = 1
 where transcript_status is not null
   and transcript_attempts = 0;
