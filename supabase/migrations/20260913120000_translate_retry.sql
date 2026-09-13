-- Translation retry: the index follows the selection rule (2026-09-13).
--
-- needsTranslation (lib/pipeline/translate.ts) no longer treats
-- transcript_en_error as a tombstone. A failed row is offered again until three
-- attempts are recorded in the error string itself, because the old rule made
-- every transient failure permanent AND made the one un-recorded failure path —
-- a videos PATCH that 400s after the gpt-4.1 call was already paid for — look
-- exactly like "not attempted yet".
--
-- So plan-translate's query dropped `transcript_en_error is null`, and the
-- partial index whose predicate carried that clause can no longer serve it.
-- Replaced with the same index minus that clause: still the candidate set, still
-- almost empty in the steady state, now actually used.

create index if not exists videos_translate_pending_v2_idx
  on public.videos (client_id, transcript_lang)
  where transcript_status = 'ok' and transcript_en is null;

drop index if exists public.videos_translate_pending_idx;

comment on column public.videos.transcript_en_error is
  'Message from the last failed translation attempt, prefixed "attempt N/3: " — needsTranslation (lib/pipeline/translate.ts) re-offers the row until N reaches 3. An error string WITHOUT that prefix is a permanent tombstone and is never retried; clearing the column resets the count.';
