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

/** The English rendering beside the original, clipped to the SAME prompt budget
 *  (WP6, 2026-09-11). It is a reading aid, never evidence: Pass A reasons from
 *  it and quotes only from usableTranscript's original, so nothing downstream
 *  ever stores or displays these words. Gated on the same 'ok' status — a
 *  translation of text the content gate rejected would be a way back in for
 *  exactly the lyrics and noise that gate exists to keep out. */
export function usableTranslation(
  v: Pick<VideoRow, 'transcript_en' | 'transcript_status'>,
): string | null {
  if (v.transcript_status !== 'ok' || !v.transcript_en) return null
  return clipText(v.transcript_en, TRANSCRIPT_PROMPT_CHARS) || null
}
