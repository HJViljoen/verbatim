import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { POST_IDEAS_BUDGET_USD, SYNTHESIS_MODEL, SYNTHESIS_REASONING_EFFORT, estimateCost } from '../config'
import { openai } from '../openai'
import { logAiCall } from '../pipeline/ai-log'
import { asTimeout, isTimeout, UNTIMED_STEP, type CallBudget } from '../written/deadline'
import type { ParseClient } from '../written/write-model'
import type { IdeaCandidate } from './select'

// The post ideas' one model call (depth v2, T13). The week read's precedent
// (lib/written/write-model.ts): the synthesis model at the synthesis effort,
// one strict structured call, and ONE more attempt where the first gave
// nothing usable: an answer that would not parse, or a failed call that was
// not a timeout (a 429, a 5xx, a dropped connection). A timeout is not
// retried here: it is thrown, for the step (and Inngest) to decide. Every
// attempt is logged to `ai_call_log` as pass `post_ideas`, each held to the
// step's clock (lib/written/deadline.ts) with no SDK retry.
//
// A HARD DOLLAR CAP (Phase 4 fix round). Before each attempt, what the call
// has spent plus that attempt's worst case (`postIdeasAttemptMaxUsd`: the
// prompt and the full output ceiling) must fit `maxUsd` (the step hands in
// what the run can afford, at most `POST_IDEAS_BUDGET_USD`), or the attempt is
// not made and `PostIdeasBudgetError` is thrown: never a call the cap cannot
// cover.
//
// WHAT GOES TO THE MODEL. The company's name; for each conversation, its
// label and description (Pass B's, the analyst's words) and its question
// comments of the run's window, each under a handle, in English where the
// translation cache has it. Comment words go to a model here as they do in
// Pass A, the quote translation and the Ask engine; AGENTS.md forbids it under
// `lib/reports/` only, and this is not a report. The request is logged as
// every chat call's is (the retention sweep strips bodies past 30 days). WHAT
// COMES BACK carries no comment's words: a title, a cover, and labels over
// handles. NOTHING NUMERIC is asked for: every figure on an idea is code's.

export const POST_IDEAS_MODEL = SYNTHESIS_MODEL
export const POST_IDEAS_PASS = 'post_ideas'
export const POST_IDEAS_PROMPT_VERSION = 'post_ideas_v3'
/** The answer's ceiling, reasoning included: about $0.24 of output at most. */
export const POST_IDEAS_MAX_OUTPUT_TOKENS = 16_000

export interface WrittenSubquestion {
  label: string
  comments: string[]
}

export interface WrittenIdea {
  question: string
  title: string
  cover: string
  subquestions: WrittenSubquestion[]
}

export interface PostIdeasOutput {
  ideas: WrittenIdea[]
}

export function postIdeasSchema() {
  return z.object({
    ideas: z.array(z.object({
      question: z.string(),
      title: z.string(),
      cover: z.string(),
      subquestions: z.array(z.object({ label: z.string(), comments: z.array(z.string()) })),
    })),
  })
}

export class PostIdeasWriteError extends Error {}

/** The call was not made: its worst case would not fit what was left of the
 *  cap. Never transient (a retry would meet the same cap). */
export class PostIdeasBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PostIdeasBudgetError'
  }
}

/** Characters a prompt token is counted at for the worst case: two, well
 *  under English's four, because 41% of stored quotes are not ASCII and
 *  tokenise denser. An over-count only makes the cap stricter. */
const CHARS_PER_TOKEN_WORST = 2

/** One attempt's worst case in dollars: the whole prompt, counted densely, and
 *  the full output ceiling (`POST_IDEAS_MAX_OUTPUT_TOKENS`, reasoning
 *  included). Pure. */
export function postIdeasAttemptMaxUsd(prompts: { system: string; user: string }): number {
  const promptTokens = Math.ceil((prompts.system.length + prompts.user.length) / CHARS_PER_TOKEN_WORST)
  return estimateCost(POST_IDEAS_MODEL, promptTokens, POST_IDEAS_MAX_OUTPUT_TOKENS)
}

/** The writer's two messages. Pure. */
export function buildPostIdeaPrompts(a: { company: string; sells?: string | null; candidates: readonly IdeaCandidate[] }): { system: string; user: string } {
  const co = a.company
  const what = a.sells ? `${a.sells} like ${co}'s` : `what ${co} sells`
  const system = [
    `You suggest social media posts for ${co}'s content team. ${co}'s market is the people worldwide buying, using and talking about ${what}. Each post you suggest answers one question those people keep asking in the comments under other people's videos, a question ${co}'s own posts have not answered.`,
    '',
    'What you are given, in the user message: the questions (Q1, Q2 and so on), the biggest first. Each has the label it was grouped under and a short description, both written by an analyst and not anyone\'s words, and the comments that ask it, each under a handle (c1, c2 and so on). A comment is given in English where a translation exists.',
    '',
    'For EVERY question given, write:',
    '- question: its handle, exactly as given (Q1).',
    '- title: the question itself, as one plain question a viewer would ask, in the everyday words the comments use. One sentence, ending with a question mark, at most fourteen words. It names the thing asked about in plain words (a wheelchair, a running blade, a silicone liner): never a bare this, that or it for it, because the title is read on its own, away from the video. Not a headline, not a hook, not a claim, and never a quotation of one comment.',
    `- cover: what a post answering it should cover, as one plain fragment that lists three or four things the post explains or shows, for example "How long liners usually last, the signs it is time to replace one, and what wears them out faster". Topics only: say WHAT the post explains, never the answer. Name ${co} or its products only as things to show, never with a claim about what they do.`,
    '- subquestions: the different things people want to know inside the question, two to five of them, the one the most comments ask first. Each has a label (at most six words, a plain phrase such as "How long it should last" or "Whether insurance pays") and the handles of the comments that ask it. Use only the handles listed under that question, put a comment under one subquestion at most, and leave out a comment that asks nothing.',
    '',
    'Rules for every word you write:',
    '- No numbers at all: never a digit, a percentage, a count or a duration in figures. Counts, lengths and formats are added by code.',
    '- NEVER A MEDICAL OR CLINICAL CLAIM. Never say what a product, a treatment or a habit does to the body or to health: never that something heals, treats, cures, prevents, relieves, reduces or causes pain, swelling, an infection, a sore, an injury or a condition. Never say something is safe or unsafe. Never diagnose, and never say a sign means a condition. Never name a medicine, a painkiller or a dose. Never say something is clinically or medically proven, or that doctors or prosthetists recommend it. Never tell the reader to see a doctor or check with a medical team: that line is added by code. A health question is fine as a question; the cover says what the post explains, never the clinical answer.',
    '- Never say a question or a topic is growing, rising, trending, new, more common or anything else about how the conversation is changing.',
    `- Never use the first person (we, our, us). Call the company ${co}.`,
    '- Write the title, the cover and every label in your own words: never copy a comment, or a run of its words. A comment\'s words are never ours to print.',
    '- Put under a subquestion only a comment that asks something. A comment that answers, advises or praises asks nothing: leave it out.',
    '- No quotation marks. No dashes between clauses: use commas. British spelling.',
    '- Never mention the comments, the videos you were shown, the analysis, the data, or how the questions were found.',
  ].join('\n')

  const blocks = a.candidates.map((c) => {
    const videos = new Set(c.comments.map((x) => x.videoId)).size
    return [
      `${c.handle}`,
      `Grouped as: ${c.label}`,
      ...(c.description ? [`Description: ${c.description}`] : []),
      `Comments (${c.comments.length}, under ${videos} ${videos === 1 ? 'video' : 'videos'}):`,
      ...c.comments.map((x) => `${x.handle}: ${x.text}`),
    ].join('\n')
  })
  const user = [`The questions, the biggest first (${a.candidates.length}):`, '', blocks.join('\n\n')].join('\n')
  return { system, user }
}

export interface PostIdeasCall {
  output: PostIdeasOutput
  costUsd: number
  ms: number
  promptTokens: number
  completionTokens: number
  attempts: number
}

/**
 * The call. Throws `PostIdeasWriteError` where two attempts gave nothing that
 * parses (the error behind it kept as `cause`, so the step can tell a dropped
 * call from a bad answer), a timeout (`isTransient`) where the step's clock
 * runs out, and `PostIdeasBudgetError`, before an attempt, where its worst
 * case would not fit `maxUsd`.
 */
export async function generatePostIdeas(
  admin: SupabaseClient | null,
  args: {
    clientId: string
    runId: string
    prompts: { system: string; user: string }
    /** Write the `ai_call_log` rows. False for a dry run that writes nothing. */
    log?: boolean
    client?: ParseClient
    budget?: CallBudget
    /** The most the call may spend, retries in: what the run can afford,
     *  at most (and by default) `POST_IDEAS_BUDGET_USD`. */
    maxUsd?: number
  },
): Promise<PostIdeasCall> {
  const client = args.client ?? openai
  if (!args.client && !process.env.OPENAI_API_KEY) throw new PostIdeasWriteError('OPENAI_API_KEY is not set')
  const { system, user } = args.prompts
  const log = args.log !== false && admin != null
  const budget = args.budget ?? UNTIMED_STEP
  let lastError = ''
  let lastCause: unknown
  let costUsd = 0
  const maxUsd = Math.min(args.maxUsd ?? POST_IDEAS_BUDGET_USD, POST_IDEAS_BUDGET_USD)
  const worst = postIdeasAttemptMaxUsd(args.prompts)
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (costUsd + worst > maxUsd) {
      throw new PostIdeasBudgetError(
        `the post ideas' call was not made: attempt ${attempt} may cost up to $${worst.toFixed(2)}, and $${Math.max(0, maxUsd - costUsd).toFixed(2)} is left of the $${maxUsd.toFixed(2)} it may spend (it has spent $${costUsd.toFixed(2)})`
        + (lastError ? `; the attempt before it failed: ${lastError}` : ''),
      )
    }
    const options = budget.optionsFor('writer')
    const startedAt = Date.now()
    try {
      const completion = await client.chat.completions.parse({
        model: POST_IDEAS_MODEL,
        reasoning_effort: SYNTHESIS_REASONING_EFFORT,
        max_completion_tokens: POST_IDEAS_MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: zodResponseFormat(postIdeasSchema(), 'post_ideas'),
      }, options)
      const usage = completion.usage
        ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
        : { prompt_tokens: 0, completion_tokens: 0 }
      const parsed = (completion.choices[0]?.message?.parsed ?? null) as PostIdeasOutput | null
      const ms = Date.now() - startedAt
      costUsd += estimateCost(POST_IDEAS_MODEL, usage.prompt_tokens, usage.completion_tokens)
      if (log && admin) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: POST_IDEAS_PASS, callIndex: attempt, model: POST_IDEAS_MODEL,
          promptVersion: POST_IDEAS_PROMPT_VERSION, systemPrompt: system, userPrompt: user,
          // The writer's own words and handles: no comment's words.
          response: parsed, error: parsed ? null : 'no parsed output', usage, durationMs: ms,
          validationStatus: parsed ? 'ok' : 'parse_error',
        }).catch((e) => console.warn('[post_ideas] log failed:', e))
      }
      if (!parsed) { lastError = 'no parsed output'; lastCause = undefined; continue }
      return { output: parsed, costUsd, ms, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, attempts: attempt }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      lastCause = e
      console.warn(`[post_ideas] attempt ${attempt} failed:`, lastError)
      if (log && admin) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: POST_IDEAS_PASS, callIndex: attempt, model: POST_IDEAS_MODEL,
          promptVersion: POST_IDEAS_PROMPT_VERSION, systemPrompt: system, userPrompt: user, response: null,
          error: lastError, usage: { prompt_tokens: 0, completion_tokens: 0 }, durationMs: Date.now() - startedAt, validationStatus: 'parse_error',
        }).catch(() => {})
      }
      if (isTimeout(e)) throw asTimeout(e, 'writer', options.timeout)
    }
  }
  throw new PostIdeasWriteError(`The post ideas could not be written twice over: ${lastError}`, { cause: lastCause })
}
