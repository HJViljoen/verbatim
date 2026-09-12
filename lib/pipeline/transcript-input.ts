import { clipText } from '../gather/transcript'
import { OCR_PROMPT_CHARS, TRANSCRIPT_PROMPT_CHARS } from '../config'
import type { VideoRow } from './types'

// The single door transcript text enters analysis through: only content-gated
// speech (transcript_status 'ok') is ever readable — no_speech / lyrics /
// garbled / no_media / failed / not-attempted all read as "no transcript"
// (the 2026-08-08 backfill measured 33% of letter-gate survivors as lyrics or
// noise; feeding those to Pass A is worse than no transcript). Clipped
// code-point-safe to the prompt budget; validation checks quotes against the
// same clipped text the model saw.
export function usableTranscript(v: Pick<VideoRow, 'transcript' | 'transcript_status'>): string | null {
  if (v.transcript_status !== 'ok' || !v.transcript) return null
  return clipText(v.transcript, TRANSCRIPT_PROMPT_CHARS) || null
}

/** The English rendering beside the original (WP6, 2026-09-11). It is a reading
 *  aid, never evidence: Pass A reasons from it and quotes only from
 *  usableTranscript's original, so nothing downstream ever stores or displays
 *  these words. Gated on the same 'ok' status — a translation of text the
 *  content gate rejected would be a way back in for exactly the lyrics and
 *  noise that gate exists to keep out.
 *
 *  Returned WHOLE, deliberately (2026-09-12). What matters is not that the two
 *  blocks are the same LENGTH but that they cover the same SPEECH, and equal
 *  character budgets do not buy that: 2,051 characters of Traditional Chinese
 *  became 6,508 of English, so clipping the English to the original's 2,400
 *  left Pass A reading ~37% of the video in English and the rest "as-is". The
 *  bound lives on the input instead — buildTranslatePrompt translates exactly
 *  TRANSCRIPT_PROMPT_CHARS of the original — so whatever comes back is the
 *  English for exactly the span the ORIGINAL block shows, and clipping it again
 *  here could only cut speech the model is expected to have read. */
export function usableTranslation(
  v: Pick<VideoRow, 'transcript_en' | 'transcript_status'>,
): string | null {
  if (v.transcript_status !== 'ok' || !v.transcript_en) return null
  return v.transcript_en.trim() || null
}

/** On-screen text read off the video's COVER FRAME (WP7b, 2026-09-12).
 *
 *  The one door this text enters analysis through, and the same shape as
 *  usableTranscript: only a resolved 'ok' is readable — 'none' (the frame
 *  carried no legible text), 'no_image' and 'failed' all read as "no on-screen
 *  text". Clipped code-point-safe to the prompt budget, and the validator checks
 *  [o] quotes against exactly this clipped string, so the model can never be
 *  credited with a quote from text it was not shown.
 *
 *  It is EVIDENCE, unlike a translation: these are the creator's own words,
 *  typed rather than spoken, which is precisely the material the 2026-09-02
 *  benchmark found every incumbent missing. It is not a full-video read — the
 *  cover is the only frame we can reach, and every surface must say exactly
 *  that. */
export function usableOcr(v: Pick<VideoRow, 'ocr_text' | 'ocr_status'>): string | null {
  if (v.ocr_status !== 'ok' || !v.ocr_text) return null
  // NOT clipText: that collapses every run of whitespace, and the newlines here
  // are the reading order — one text block per line. Flattening them would join
  // two unrelated cards into one sentence the frame never showed, and the
  // validator would then happily accept that sentence as a verbatim quote.
  // Code-point-safe, like clipText, so an emoji is never split in half.
  const points = [...v.ocr_text.trim()]
  const text = points.length <= OCR_PROMPT_CHARS ? points.join('') : points.slice(0, OCR_PROMPT_CHARS).join('').trimEnd()
  return text || null
}
