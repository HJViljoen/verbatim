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
