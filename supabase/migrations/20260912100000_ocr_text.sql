-- On-screen text from the cover frame (WP7b, 2026-09-12).
--
-- The 2026-09-02 blind benchmark found, from two agents independently, that
-- every incumbent listening tool misses on-screen text on TikTok/YouTube, and
-- that hooks and claims there are very often TYPED and never spoken. We
-- transcribe speech; a video whose whole argument is a title card has reached
-- Pass A as silence. This reads the text on the one frame that is actually
-- reachable — the cover.
--
-- WHAT THIS IS NOT, and no copy may ever say otherwise (standing rule,
-- v5-Ideas.md): scene understanding, thumbnail analysis, or "we analyse the
-- visuals". It is on-screen text from the COVER FRAME. Reading every frame
-- needs a video download plus ffmpeg, which Vercel serverless does not have.
--
-- WHY AT GATHER TIME: verified on real video_raw rows on 2026-09-12, the cover
-- is `video.cover` on TikTok (p16-common-sign.tiktokcdn.com) and `displayUrl`
-- on Instagram (*.fbcdn.net) — signed links with the same days-long expiry as
-- every media URL in there, the wall transcription already hit in production.
-- YouTube's cover is https://i.ytimg.com/vi/<id>/hqdefault.jpg, derived from the
-- id and durable, which is why it — and only it — also gets a backfill wave.
--
-- Four additive columns:
--   ocr_text          the extracted text, one block per line (OCR_MAX_CHARS)
--   ocr_status        the verdict; 'none' is a REAL ANSWER, not a failure — the
--                     model saw the frame and there was no legible text on it,
--                     and re-reading those every week would pay forever for the
--                     same no. Every status is terminal; NULL means not yet read.
--   ocr_error         last failure. A tombstone, exactly like
--                     transcript_en_error: needsOcr skips any row that has a
--                     status, so clearing the columns is the deliberate retry.
--   analyzed_with_ocr incremental Pass A bookkeeping, parallel to
--                     analyzed_with_transcript / analyzed_with_translation.

alter table public.videos
  add column if not exists ocr_text text,
  add column if not exists ocr_status text,
  add column if not exists ocr_error text,
  add column if not exists analyzed_with_ocr boolean not null default false;

-- NULL passes a CHECK, which is what "not read yet" needs to mean.
alter table public.videos
  drop constraint if exists videos_ocr_status_check;
alter table public.videos
  add constraint videos_ocr_status_check
  check (ocr_status is null or ocr_status in ('ok', 'none', 'no_image', 'failed'));

comment on column public.videos.ocr_text is
  'Text read off the video''s COVER FRAME (OCR_MODEL, lib/config.ts), one text block per line, in reading order. Not a full-video read: the cover is the only frame we can reach. The creator''s own words, so Pass A may cite it verbatim with the label [o] on industry/other videos — read through transcript-input.usableOcr.';

comment on column public.videos.ocr_status is
  '''ok'' text found · ''none'' the frame was read and carried no legible text (a verdict, not a miss) · ''no_image'' the item had no cover handle · ''failed'' the fetch or model call errored. NULL = not read. Every non-null value is terminal; clear the column to retry.';

comment on column public.videos.ocr_error is
  'Message from the LAST failed cover-frame read, and a tombstone: needsOcr (lib/pipeline/ocr.ts) skips any row that already has an ocr_status. Clear ocr_status to retry.';

comment on column public.videos.analyzed_with_ocr is
  'Did Pass A''s current analysis of this video see an ON-SCREEN TEXT block? Drives the ''ocr'' re-read in lib/pipeline/pass-a-plan.ts — the per-video alternative to a corpus-wide prompt-version bump.';

-- Partial index on exactly the backfill plan's candidate set (client + platform
-- among unread rows). Without it plan-ocr-backfill seq-scans a tenant's whole
-- videos table every run to find the YouTube rows still to read; with it the
-- steady-state plan touches almost nothing, which is the point — after the
-- backlog clears, the answer is "none".
create index if not exists videos_ocr_pending_idx
  on public.videos (client_id, platform)
  where ocr_status is null;

-- ---------------------------------------------------------------------------
-- A typed line is NOT something said on camera (WP7b B1, 2026-09-12).
--
-- WP7a (merged on the integration branch) reads insight_evidence.source ==
-- 'video' to mean "a creator SPOKE this in their own video" and acts on it in
-- three places: lib/pipeline/pass-d.ts appends '(said on camera)' to the quote
-- in the Pass B brief, lib/pipeline/step-a2.ts counts those rows into
-- themes.video_evidence_count and the WP7a rank bonus, and lib/voice-tiles.ts
-- renders 'N said on camera' on a client-facing tile.
--
-- Text typed on a cover frame is the creator's own words, so it is evidence —
-- but nobody said it out loud, and it must earn neither the on-camera label nor
-- the on-camera weight. Storing it as 'video' would have made every one of
-- those three surfaces claim something the code cannot support (repo rule:
-- copy claims about behavior must match the code).
--
-- So it gets its own value. WP7a's two reads stay literally unchanged and keep
-- their exact current meaning; after the branches merge the two features are
-- disjoint BY VALUE, not by convention. Anything that means "this citation is a
-- video rather than a comment" keys on source_video_id being non-null — which
-- is already how lib/quotes.ts resolves a `v:` ref, and why that file needs no
-- change.
alter table public.insight_evidence
  drop constraint if exists insight_evidence_source_check;
alter table public.insight_evidence
  add constraint insight_evidence_source_check
  check (source in ('comment', 'video', 'video_text'));

-- The shape rule is the same for both video kinds: a source video, no comment.
alter table public.insight_evidence
  drop constraint if exists insight_evidence_source_shape;
alter table public.insight_evidence
  add constraint insight_evidence_source_shape check (
    (source = 'comment' and comment_id is not null and source_video_id is null)
    or
    (source in ('video', 'video_text') and source_video_id is not null and comment_id is null)
  );

comment on column public.insight_evidence.source is
  '''comment'' a commenter wrote it · ''video'' a creator SPOKE it in the video (WP7a weighs and labels these as "said on camera") · ''video_text'' it was TYPED on the video''s cover frame (WP7b). The last two both carry source_video_id and no comment_id; they are deliberately different values so on-screen text earns neither the on-camera label nor the on-camera weight.';

-- RETENTION/ERASURE: ocr_text rides the same (non-)policy as transcript and
-- transcript_en — nothing automated reaches any of them today
-- (inngest/functions/retention.ts purges video_raw and ai_call_log bodies;
-- scripts/erase-commenter.ts is scoped to comment authors, not video creators).
-- If a creator-erasure or video-text retention path is ever built, transcript,
-- transcript_en and ocr_text must be added to it TOGETHER: they are all the
-- creator's own words about the same video.
