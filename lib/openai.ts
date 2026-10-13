import OpenAI from 'openai'
import { ANALYSIS_TEMPERATURE, SYNTHESIS_REASONING_EFFORT } from './config'

// Shared OpenAI client for the analysis passes. Reads OPENAI_API_KEY from the
// environment (.env.local locally; Vercel env in production). Construction is
// lazy at import — keep imports of this module on server-only code paths.
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * Per-model sampling params. gpt-5.x are reasoning models: they REJECT
 * `temperature` and take `reasoning_effort` instead; 4.x take temperature 0
 * for reproducible iteration. Spread into chat.completions calls.
 */
export function samplingParams(model: string): { temperature: number } | { reasoning_effort: typeof SYNTHESIS_REASONING_EFFORT } {
  return model.startsWith('gpt-5')
    ? { reasoning_effort: SYNTHESIS_REASONING_EFFORT }
    : { temperature: ANALYSIS_TEMPERATURE }
}

/**
 * Did this call die because the model generated until it ran out of room?
 *
 * The SDK raises `LengthFinishReasonError` from `chat.completions.parse` when
 * `finish_reason === 'length'`, and that class carries nothing but its message
 * (no completion, no usage), so the name and the message are all there is to
 * match on. Matched by NAME first because the class is not exported from a
 * stable path, and by message second because a proxy or a re-thrown error
 * keeps the text and loses the prototype (the SDK's own class leaves `name`
 * as 'Error', so its message is what matches it today).
 *
 * Pass A's per-video retry and classify-meta's batch split read it (moved here
 * from lib/pipeline/pass-a.ts on 13 Oct, when classify-meta became the second
 * caller).
 */
export function isLengthLimitError(e: unknown): boolean {
  if ((e as { name?: unknown })?.name === 'LengthFinishReasonError') return true
  const msg = e instanceof Error ? e.message : String(e)
  return /length limit was reached|finish_reason.*length/i.test(msg)
}
