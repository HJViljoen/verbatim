-- Transcript translation (WP6, 2026-09-11).
--
-- `transcript_en` was designed on 2026-07-23 and deliberately not built on
-- 2026-08-08: non-English transcripts were read as-is, and the call on record
-- was "build translation only if measurement demands it". About 27% of the bed
-- is non-English, and the standing instruction since is accuracy and quality of
-- output first — so the English rendering is built now, and the measurement
-- (scripts/translate-transcripts.ts, dry-run by default) ships beside it.
--
-- WHAT THIS IS NOT: a replacement for `transcript`. The original stays the
-- evidence. Pass A is handed BOTH blocks and told to reason from the
-- translation and quote only from the original, verbatim — which is what keeps
-- the verbatim-quote validator working (it matches against the clipped original
-- the model saw) and what keeps the "in their own words" promise (2026-08-09:
-- a hero quote never translates). Nothing downstream stores, freezes or
-- displays a translated word; insight_evidence.quote is still the original.
--
-- Three additive columns:
--   transcript_en            the English rendering (null = not translated, and
--                            for an English or unknown-language video, never
--                            will be)
--   transcript_en_error      last failure, and a tombstone: a row with an error
--                            is not retried, so a weekly run cannot re-pay for
--                            the same failure forever. Clearing it is the
--                            deliberate retry.
--   analyzed_with_translation  incremental Pass A bookkeeping, exactly parallel
--                            to analyzed_with_transcript: did the read that
--                            produced this video's current insights see an
--                            ENGLISH TRANSLATION block? A video whose
--                            translation lands later is re-read once, via the
--                            new 'translated' SelectReason — which is why the
--                            Pass A prompt version is NOT bumped and the corpus
--                            is not re-read wholesale.
--
-- RETENTION/ERASURE: nothing automated reaches videos.transcript today
-- (inngest/functions/retention.ts purges video_raw and ai_call_log bodies;
-- scripts/erase-commenter.ts is scoped to comment authors, not video creators).
-- transcript_en rides exactly that same (non-)policy. If a transcript retention
-- or creator-erasure path is ever built, transcript and transcript_en must be
-- added to it TOGETHER — the translation is the same speech.

alter table public.videos
  add column if not exists transcript_en text,
  add column if not exists transcript_en_error text,
  add column if not exists analyzed_with_translation boolean not null default false;

comment on column public.videos.transcript_en is
  'English rendering of transcript, for non-English videos (TRANSLATE_MODEL, lib/config.ts). A reading aid for Pass A and classify-meta — never evidence, never displayed, never frozen into a snapshot. The original transcript is what a quote is validated against.';

-- One existing column changes meaning slightly: `transcript_lang` is now also
-- WRITTEN by the translate wave, not only by the transcription providers. The
-- model reports the language it actually read, and that value is stored when
-- the provider gave none (317 such rows across the two tenants at time of
-- writing, including Sealand's two largest transcripts, both Chinese) or when
-- the provider's label said non-English and the text is plainly English. A
-- provider label that merely disagrees about WHICH non-English language is left
-- alone — the translation is written either way, so nothing depends on it.

comment on column public.videos.transcript_en_error is
  'Message from the LAST failed translation attempt, and a tombstone: needsTranslation (lib/pipeline/translate.ts) skips any row that has one. Clear it to retry.';

comment on column public.videos.analyzed_with_translation is
  'Did Pass A''s current analysis of this video see an ENGLISH TRANSLATION block? Drives the ''translated'' re-read in lib/pipeline/pass-a-plan.ts — the per-video alternative to a corpus-wide prompt-version bump.';

-- Partial index on exactly the plan step's candidate set. Without it
-- plan-translate seq-scans a tenant's whole videos table every run to find the
-- handful that gained a transcript since the last one; with it the steady-state
-- plan touches almost nothing, which is the point — after the first wave the
-- answer is usually "none".
create index if not exists videos_translate_pending_idx
  on public.videos (client_id, transcript_lang)
  where transcript_status = 'ok' and transcript_en is null and transcript_en_error is null;
