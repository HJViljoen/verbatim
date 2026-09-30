import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'

import { SYNTHESIS_MODEL, SYNTHESIS_REASONING_EFFORT, estimateCost } from '../config'
import { openai } from '../openai'
import { logAiCall } from '../pipeline/ai-log'
import {
  buildWeekReadPrompts, weekReadSchema, WEEK_READ_PASS, WEEK_READ_PROMPT_VERSION,
  type WeekReadOutput, type WeekWriterArgs, type WriterSubject,
} from './write'

// The writing call (plan T3): the document writer's (lib/reports/documents/
// write-model.ts), pointed at the week. The reasoning model at the synthesis
// effort, one strict structured call, one retry on a parse failure or an API
// error, every attempt logged to `ai_call_log` as pass `week_read` with the
// prompt version `week_read_v1`. There is no code fallback for the words: a
// week the writer could not write is a failed read, said plainly by the
// caller, never an empty one sent.

export const WEEK_READ_MODEL = SYNTHESIS_MODEL

export class WeekReadWriteError extends Error {}

/** The one method the call needs, so a test can hand in a stand-in. */
export interface ParseClient {
  chat: { completions: { parse: typeof openai.chat.completions.parse } }
}

export interface WeekReadCall {
  written: WeekReadOutput
  /** The subjects the writer was shown, by the handle it answers with. */
  subjects: WriterSubject[]
  costUsd: number
  ms: number
  promptTokens: number
  completionTokens: number
  attempts: number
}

export async function generateWeekRead(
  admin: SupabaseClient,
  args: WeekWriterArgs & {
    clientId: string
    runId: string
    /** Write the `ai_call_log` rows. False only for a dry run that must not
     *  write to any database (scripts/week-read.ts without --write). */
    log?: boolean
    client?: ParseClient
  },
): Promise<WeekReadCall> {
  const client = args.client ?? openai
  if (!args.client && !process.env.OPENAI_API_KEY) throw new WeekReadWriteError('OPENAI_API_KEY is not set')
  const { system, user, subjects } = buildWeekReadPrompts(args)
  const log = args.log !== false
  let lastError = ''
  let costUsd = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now()
    try {
      const completion = await client.chat.completions.parse({
        model: WEEK_READ_MODEL,
        reasoning_effort: SYNTHESIS_REASONING_EFFORT,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: zodResponseFormat(weekReadSchema(), 'week_read'),
      })
      const usage = completion.usage
        ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
        : { prompt_tokens: 0, completion_tokens: 0 }
      const parsed = (completion.choices[0]?.message?.parsed ?? null) as WeekReadOutput | null
      const ms = Date.now() - startedAt
      costUsd += estimateCost(WEEK_READ_MODEL, usage.prompt_tokens, usage.completion_tokens)
      if (log) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: WEEK_READ_PASS, callIndex: attempt, model: WEEK_READ_MODEL,
          promptVersion: WEEK_READ_PROMPT_VERSION, systemPrompt: system, userPrompt: user,
          // The model's own prose, whole: it carries no comment's words (the
          // writer never saw one), and a read checked line by line needs it.
          response: parsed, error: parsed ? null : 'no parsed output', usage, durationMs: ms,
          validationStatus: parsed ? 'ok' : 'parse_error',
        }).catch((e) => console.warn('[week_read] log failed:', e))
      }
      if (!parsed) { lastError = 'no parsed output'; continue }
      return { written: parsed, subjects, costUsd, ms, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, attempts: attempt }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.warn(`[week_read] attempt ${attempt} failed:`, lastError)
      if (log) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: WEEK_READ_PASS, callIndex: attempt, model: WEEK_READ_MODEL,
          promptVersion: WEEK_READ_PROMPT_VERSION, systemPrompt: system, userPrompt: user, response: null,
          error: lastError, usage: { prompt_tokens: 0, completion_tokens: 0 }, durationMs: Date.now() - startedAt, validationStatus: 'parse_error',
        }).catch(() => {})
      }
    }
  }
  throw new WeekReadWriteError(`The week's read could not be written twice over: ${lastError}`)
}
