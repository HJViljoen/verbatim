import { clipText } from '../gather/transcript'
import { TRANSCRIPT_PROMPT_CHARS } from '../config'
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
