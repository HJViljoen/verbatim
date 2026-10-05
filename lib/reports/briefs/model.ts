import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { z } from 'zod'

import { SYNTHESIS_MODEL, SYNTHESIS_REASONING_EFFORT, estimateCost } from '../../config'
import { openai } from '../../openai'
import { logAiCall } from '../../pipeline/ai-log'
import { asTimeout, isTimeout } from '../../written/deadline'
import type { ParseClient } from '../../written/write-model'
import { callOptions, type BriefCall, type BriefClock } from './clock'
import { REPEATS_PROMPT_VERSION, buildRepeatsPrompts, repeatsSchema, type RepeatsOutput } from './repeats'
import type { BriefRole } from './types'
import { BRIEF_PROMPT_VERSION, IDEAS_PROMPT_VERSION, briefSchema, buildBriefPrompts, buildIdeasPrompts, ideasSchema, type BriefArgs, type BriefOutput, type IdeasArgs, type IdeasOutput } from './write'

// The two calls (the document writer's shape, lib/reports/documents/
// write-model.ts): the reasoning model at the synthesis effort, one strict
// structured call, one retry on a parse failure or an API error, each attempt
// logged to `ai_call_log` where `log` is on (a dry run passes false and writes
// nothing). There is no code fallback for the words: a brief the writer could
// not write is a failed brief, said plainly by the caller.
//
// HELD TO TIME (the pipeline's `briefs:*` steps, clock.ts): every attempt is
// capped and has no silent SDK retry, and inside a step it starts only where
// the step's clock has room for it and for the calls still to come
// (`reserveMs`). A call that times out, or cannot start, is thrown at once as
// a timeout (transient): the step retries, never this loop. The error behind
// a failed attempt is kept as the thrown error's `cause`, so the step can tell
// a dropped call (429, 5xx) from an answer that would not parse.

export const BRIEF_MODEL = SYNTHESIS_MODEL

export class BriefWriteError extends Error {}

interface CallArgs {
  admin: SupabaseClient
  clientId: string
  runId: string | null
  log: boolean
  client?: ParseClient
  /** The step's clock; absent outside a step (the script). */
  clock?: BriefClock
}

async function structured<T>(
  c: CallArgs,
  pass: string,
  version: string,
  schema: z.ZodTypeAny,
  name: string,
  prompts: { system: string; user: string },
  timing: { call: BriefCall; reserveMs?: number },
): Promise<{ output: T; costUsd: number; ms: number }> {
  const client = c.client ?? openai
  if (!c.client && !process.env.OPENAI_API_KEY) throw new BriefWriteError('OPENAI_API_KEY is not set')
  let lastError = ''
  let lastCause: unknown
  let cost = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    // A second attempt is for an answer that would not parse or an API error,
    // and only where the clock has room for it (a timeout is thrown here).
    const options = callOptions(c.clock, timing.call, timing.reserveMs ?? 0)
    const started = Date.now()
    try {
      const completion = await client.chat.completions.parse({
        model: BRIEF_MODEL,
        reasoning_effort: SYNTHESIS_REASONING_EFFORT,
        messages: [{ role: 'system', content: prompts.system }, { role: 'user', content: prompts.user }],
        response_format: zodResponseFormat(schema, name),
      }, options)
      const usage = completion.usage
        ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
        : { prompt_tokens: 0, completion_tokens: 0 }
      cost += estimateCost(BRIEF_MODEL, usage.prompt_tokens, usage.completion_tokens)
      const parsed = (completion.choices[0]?.message?.parsed ?? null) as T | null
      const ms = Date.now() - started
      if (c.log) {
        await logAiCall(c.admin, {
          clientId: c.clientId, runId: c.runId, pass, callIndex: attempt, model: BRIEF_MODEL, promptVersion: version,
          systemPrompt: prompts.system, userPrompt: prompts.user, response: parsed, error: parsed ? null : 'no parsed output',
          usage, durationMs: ms, validationStatus: parsed ? 'ok' : 'parse_error',
        }).catch((e) => console.warn(`[${pass}] log failed:`, e))
      }
      if (!parsed) { lastError = 'no parsed output'; continue }
      return { output: parsed, costUsd: cost, ms }
    } catch (e) {
      if (isTimeout(e)) throw asTimeout(e, 'writer', options.timeout)
      lastError = e instanceof Error ? e.message : String(e)
      lastCause = e
      console.warn(`[${pass}] attempt ${attempt} failed:`, lastError)
    }
  }
  throw new BriefWriteError(`${pass} failed twice: ${lastError}`, { cause: lastCause })
}

export async function draftIdeas(c: CallArgs, args: IdeasArgs): Promise<{ output: IdeasOutput; costUsd: number; ms: number; prompts: { system: string; user: string } }> {
  const prompts = buildIdeasPrompts(args)
  // The self-check follows the ideas in the same step: its reserve is kept.
  const r = await structured<IdeasOutput>(c, 'brief_ideas', IDEAS_PROMPT_VERSION, ideasSchema(), 'brief_ideas', prompts, { call: 'ideas', reserveMs: 45_000 })
  return { ...r, prompts }
}

export async function writeBrief(c: CallArgs, args: BriefArgs): Promise<{ output: BriefOutput; costUsd: number; ms: number; prompts: { system: string; user: string } }> {
  const prompts = buildBriefPrompts(args)
  const r = await structured<BriefOutput>(c, `monthly_brief_${args.role satisfies BriefRole}`, BRIEF_PROMPT_VERSION, briefSchema(args.role), 'monthly_brief', prompts, { call: 'writer' })
  return { ...r, prompts }
}

/** The set's repeat judge (repeats.ts): the printed prose only. */
export async function judgeRepeats(c: CallArgs, args: Parameters<typeof buildRepeatsPrompts>[0]): Promise<{ output: RepeatsOutput; costUsd: number; ms: number; prompts: { system: string; user: string } }> {
  const prompts = buildRepeatsPrompts(args)
  // The summaries' self-check and the embeddings after it follow in the same step.
  const r = await structured<RepeatsOutput>(c, 'brief_repeats', REPEATS_PROMPT_VERSION, repeatsSchema(), 'brief_repeats', prompts, { call: 'judge', reserveMs: 65_000 })
  return { ...r, prompts }
}
