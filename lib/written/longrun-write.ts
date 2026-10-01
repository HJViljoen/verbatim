import type { SupabaseClient } from '@supabase/supabase-js'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import { SYNTHESIS_MODEL, SYNTHESIS_REASONING_EFFORT, estimateCost } from '../config'
import { openai } from '../openai'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import { logAiCall } from '../pipeline/ai-log'
import { CALIBRATED_PROSE_RULE, noDirectionRule } from '../pipeline/prose-rules'
import { noDashes } from '../reports/documents/scrub'
import type { CompanyContext } from './company'
import { asTimeout, isTimeout, UNTIMED_STEP, type CallBudget } from './deadline'
import type { LongRunCandidate, LongRunPool } from './longrun'
import { monthsPhrase } from './month'
import type { WhoAbout } from './types'
import { DELETED_WORDS } from './write'
import type { ParseClient } from './write-model'

// The long-run read's prompt, schema and call (pages build, 1 Oct: Your market
// as "the bigger picture", led by "What holds across {months}").
//
// ONE CALL WRITES THE SECTION: three to five durable ideas over the whole
// record window and a two-sentence lead. The writer sees what code selected
// (lib/written/longrun.ts): themes heard across the months, in WORDS (labels,
// Pass B descriptions, kinds, the months each was heard in, whose videos it
// was heard on, Pass A's paraphrases). Never a comment's text, never a figure.
// Code decides everything else (compose): which ideas print, their order,
// every count, who each is about.
//
// WHAT HOLDS, NEVER WHAT CHANGED. Heinrich (30 Sep): "we aren't creating any
// insights based on long-term data". The honest long-run insight before two
// comparable months exist is the pattern that holds across the record, which
// makes no change claim. So the prompt forbids every time comparison and the
// scrub (`CHANGE`, plus the week read's direction rule) deletes what slips
// through. Change insights arrive on their own once pairs are comparable.

export const LONGRUN_PASS = 'longrun_read'
export const LONGRUN_PROMPT_VERSION = 'longrun_read_v1' as const
export const LONGRUN_MODEL = SYNTHESIS_MODEL

/** Field caps, in characters, and the counts. Scrub and compose hold the
 *  writer to each. */
export const LONGRUN_MAX = {
  headline: 90,
  body: 480,
  bodySentences: 4,
  inShort: 280,
  inShortSentences: 2,
  ideas: 5,
} as const

/** What the writer returns (the strict schema's shape). */
export interface LongRunOutput {
  ideas: { headline: string; body: string; based_on: string[] }[]
  in_short: string
}

export function longRunSchema() {
  return z.object({
    ideas: z.array(z.object({
      headline: z.string().describe(`One claim about the market or the buyer that holds across the months, plain words, under ${LONGRUN_MAX.headline} characters, no full stop. Never a topic, never an instruction.`),
      body: z.string().describe(`Two short paragraphs separated by a blank line, ${LONGRUN_MAX.bodySentences} sentences at most in all: what people say and ask, concretely, then what it adds up to. Under ${LONGRUN_MAX.body} characters.`),
      based_on: z.array(z.string()).describe('The candidate ids this idea rests on, e.g. ["C2", "C7"]. At least one.'),
    })).describe(`The durable patterns, one idea each, at most ${LONGRUN_MAX.ideas}. Fewer is fine.`),
    in_short: z.string().describe(`Two sentences that sum up what holds across the months, under ${LONGRUN_MAX.inShort} characters. A claim, not a list.`),
  })
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  praise: 'praise',
  objection: 'objections',
  pain_point: 'problems',
  question: 'questions',
  purchase_intent: 'intent to buy',
  feature_request: 'requests',
  buying_trigger: 'reasons to buy now',
  switching_signal: 'switching',
  demographic_signal: 'who is buying',
  misinformation: 'misunderstandings',
}
const kindWord = (k: string) => KIND_WORDS[k] ?? k.replace(/_/g, ' ')

/** Who a candidate's videos are about, in words for the writer (no counts:
 *  it has no numbers), most videos first. Pure. */
export function whoWords(parts: readonly { about: WhoAbout; videos: number }[], company: string, noun: string | null): string {
  const sorted = [...parts].sort((a, b) => b.videos - a.videos)
  const word = (about: WhoAbout) =>
    about === 'client' ? `${company} (its own posts, or comments naming it)`
      : about === 'market' ? `other ${noun ?? 'brands'} in the market`
        : `${about.slice('rival:'.length)} (videos about it, or comments naming it)`
  return sorted.map((p, i) => `${word(p.about)}${i === 0 && sorted.length > 1 ? ', most' : ''}`).join('; ')
}

function candidateLines(c: LongRunCandidate, pool: Pick<LongRunPool, 'months'>, company: string, noun: string | null): string {
  const kinds = c.kinds.length
    ? c.kinds.map((k) => (k === c.dominantKind ? `${kindWord(k)} (most)` : kindWord(k))).join(', ')
    : 'not recorded'
  const heard = pool.months.filter((m) => (c.monthVideoIds[m] ?? []).length > 0)
  return [
    `${c.id}: "${c.label}"`,
    c.description ? `  Description: ${c.description}` : '',
    `  Kinds of comment: ${kinds}`,
    `  Heard in: ${heard.length === 0 ? 'not dated' : heard.length === 1 ? `${monthsPhrase(heard)} only` : monthsPhrase(heard)}`,
    c.who.length ? `  Whose videos: ${whoWords(c.who, company, noun)}` : '',
    c.notes.length ? `  What people said, in paraphrase:\n${c.notes.map((n) => `  - ${n}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

export interface LongRunWriterArgs {
  company: string
  pool: LongRunPool
  context?: CompanyContext | null
}

export function buildLongRunPrompts(a: LongRunWriterArgs): { system: string; user: string } {
  const co = a.company
  const noun = WHAT_THEY_SELL[a.pool.clientId] ?? null
  const what = noun ? `${noun} like ${co}'s` : `what ${co} sells`
  const months = monthsPhrase(a.pool.months)
  const system = [
    `You are the consumer researcher at ${co}. Once a month you write the opening section of ${co}'s market page, "What holds across ${months}": the few patterns in what people in the market say that hold across the whole record, ${months}. Everyone at ${co} reads it, leadership first, as the bigger picture behind each week's report. The market is the people worldwide buying and talking about ${what}, not only ${co}'s own customers.`,
    '',
    'What you are given, in the user message:',
    `- The candidates (C1, C2 and so on), best evidenced first: themes people talked about across these months. Each has its label and description, the kinds of comment behind it (praise, objections, questions and so on), the months it was heard in, whose videos it was heard on (under ${co}'s own posts, under videos about a rival, or elsewhere in the market), and paraphrases of what people said. The paraphrases are notes, not quotations: never put them in quotation marks and never present them as anyone's words.`,
    `- About ${co}: what it sells and what it says about itself in its own videos (its claims, in paraphrase). This is ${co}'s own voice, not the market's: never present it as anything buyers said, and never say how a claim was received unless a candidate says so.`,
    '',
    'What you write, in this order:',
    '',
    `1. ideas: three to five durable patterns, never more than ${LONGRUN_MAX.ideas}; fewer is fine. ONE IDEA EACH. An idea is a claim about the market or the buyer that holds across the months: something people say again and again, not one episode. Cite every candidate it rests on in based_on.`,
    '  - Several candidates may support one idea when they are facets of the same pattern (the same buyer asking the same thing in other words, or one concern seen from two sides). Never cite a candidate to give an idea more evidence, and never join two ideas into one: a candidate about straps and one about price are two ideas.',
    '  - Each candidate supports at most one idea. Order does not matter; code orders the ideas by the evidence behind them.',
    '  - Build on candidates heard in more than one of the months. A pattern heard in one month only is not what holds, and code does not print an idea whose candidates were heard in one month only.',
    '  - Every sentence must be traceable to the labels, descriptions and notes of the candidates the idea cites, and to nothing else.',
    `  - headline: one claim, no broader than the cited candidates show, under ${LONGRUN_MAX.headline} characters, no full stop. Never a topic ("Delivery") and never an instruction ("Show the straps").`,
    `  - body: two short paragraphs separated by a blank line, at most ${LONGRUN_MAX.bodySentences} sentences in all: first what people say and ask, concretely (the things they name, in the market's own words), then what it adds up to for a company that sells ${what}. Intelligence, never advice.`,
    `  - Where a cited candidate's videos are about ${co} or about a rival, the idea may say so plainly ("Under ${co}'s own posts, people…", "A rival is talked about as…", naming it). Name a brand only where a cited candidate's videos are about it. Never guess a brand.`,
    '  - Claim only what the candidates show. Never frame a claim by what the market does NOT do unless a candidate says that too: the contrast is a second claim.',
    '',
    `2. in_short: at most ${LONGRUN_MAX.inShortSentences} sentences that sum up what holds across the months: the one thing to remember. A claim, not a list of the ideas. Under ${LONGRUN_MAX.inShort} characters.`,
    '',
    'WHAT HOLDS, NEVER WHAT CHANGED. This section describes patterns that are true across the months. It never says that anything grew, fell, rose, shifted, settled, started, emerged, became or is new; never compares one month with another or with the past; and never uses "now", "increasingly", "more and more", "no longer", "used to", "lately", "recently", "over time", "these days", "since" a month, or any other comparison in time. A sentence that does is deleted before anyone reads it.',
    '',
    'House style:',
    `- Plain language for a busy person at ${co}. Short sentences. Concrete nouns: the thing people name (the straps, the zips, the colour, the price, the link to buy) in the market's own words. No consultant abstractions: never "a fit problem", "legible", "positioning", "lens", "value proposition", "use case", "consideration", "resonates", "narrative", "friction", "ecosystem", "landscape", "journey".`,
    '- Literal words, never an idiom or a figure of speech. Say the literal thing.',
    '- A research report, not a memo: the analytical third person ("buyers ask", "owners report", "people describe"), claims rather than hedges. Never "we", "our", "us" or "you"; never address the reader. No headings, no bullet points inside a field, no exclamation marks.',
    '- Name products, brands and themes plainly. Never name a person or an account.',
    '- The market only. Never mention how anything was found, gathered, collected, searched, read, counted or checked. Never mention data, sources, samples, coverage, searches, updates, platforms, this service, a tool, a model, AI or Verbatim, and never write "this read", "this report" or "this section". Never explain why something is not said: leave it out.',
    '- Never say how big a theme is or how it ranks against another ("the main complaint", "the biggest theme", "most buyers"): code prints the counts beside each idea.',
    '- You have NO numbers. Never type a digit, not even in a product name ("the larger pack", not "the 35L pack").',
    noDashes(CALIBRATED_PROSE_RULE.split('\n')[0]),
    '- Never write an id (C2) in prose; ids belong only in based_on.',
    noDashes(noDirectionRule('week_read')),
    `- The rule above is a word list, and it deletes a sentence for these words even where they describe a product rather than a movement ("lower back", "a flat base", "a double zip"): ${DELETED_WORDS.join(', ')}. Say it another way.`,
    `- Intelligence, not instructions: never "should", "could", "needs to", "must", "consider", "make sure", "an opportunity", and never an imperative.`,
    '- No dashes between clauses (no em dash, no en dash, no spaced hyphen); use a comma, a colon or a full stop.',
    '',
    'An example of the register, for a different company and market (coffee machines); do not reuse its content:',
    '- An idea: headline "Owners judge a machine by the cleaning it asks for each day"; body "Owners describe the drip tray, the milk wand and the descaling in detail, and those who need a brush or a tablet every week say so even when they like the coffee. Buyers ask about the cleaning before they ask about the taste.\\n\\nFor a company that sells espresso machines, the daily upkeep is part of what is being bought."',
    '- An in_short: "Buyers want a machine that is easy to live with, and they judge the price by it. The brand is trusted for its coffee; the machines still have to show what they ask of an owner each morning."',
  ].join('\n')

  const ctx = a.context
  const about = ctx
    ? [
        `About ${co} (context only; none of this is what the market said):`,
        ctx.sells.noun ? `- ${co} sells ${ctx.sells.noun}.` : '',
        ctx.sells.description ? `- In its own words, its market is: ${ctx.sells.description}` : '',
        ctx.sells.keywords.length ? `- Its market is followed by these words: ${ctx.sells.keywords.join(', ')}.` : '',
        ctx.claims.length
          ? `- What ${co} says about itself in its own videos (its claims, in paraphrase):\n${ctx.claims.map((c) => `  - ${c}`).join('\n')}`
          : `- What ${co} says about itself: nothing recorded.`,
      ].filter(Boolean).join('\n')
    : `About ${co}: nothing recorded beyond its name.`

  const user = [
    `Company: ${co}`,
    `The months this section covers: ${months}.`,
    `Candidates:\n${a.pool.candidates.map((c) => candidateLines(c, a.pool, co, noun)).join('\n\n') || '- none'}`,
    about,
  ].join('\n\n')
  return { system, user }
}

// ---- The call ---------------------------------------------------------------------------

export class LongRunWriteError extends Error {}

export interface LongRunCall {
  written: LongRunOutput
  costUsd: number
  ms: number
  attempts: number
}

/**
 * The writing call: the week read's (lib/written/write-model.ts), pointed at
 * the long run. One strict structured call at the synthesis effort, one retry
 * on an answer that would not parse, every attempt logged to `ai_call_log` as
 * pass `longrun_read` unless `log` is false (the script's dry run). Capped and
 * never retried by the SDK (`budget`); a timeout is thrown as one.
 */
export async function generateLongRun(
  admin: SupabaseClient,
  args: LongRunWriterArgs & { clientId: string; runId: string; log?: boolean; client?: ParseClient; budget?: CallBudget },
): Promise<LongRunCall> {
  const client = args.client ?? openai
  if (!args.client && !process.env.OPENAI_API_KEY) throw new LongRunWriteError('OPENAI_API_KEY is not set')
  const { system, user } = buildLongRunPrompts(args)
  const log = args.log !== false
  const budget = args.budget ?? UNTIMED_STEP
  let lastError = ''
  let costUsd = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    const options = budget.optionsFor('writer')
    const startedAt = Date.now()
    try {
      const completion = await client.chat.completions.parse({
        model: LONGRUN_MODEL,
        reasoning_effort: SYNTHESIS_REASONING_EFFORT,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: zodResponseFormat(longRunSchema(), 'longrun_read'),
      }, options)
      const usage = completion.usage
        ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
        : { prompt_tokens: 0, completion_tokens: 0 }
      const parsed = (completion.choices[0]?.message?.parsed ?? null) as LongRunOutput | null
      const ms = Date.now() - startedAt
      costUsd += estimateCost(LONGRUN_MODEL, usage.prompt_tokens, usage.completion_tokens)
      if (log) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: LONGRUN_PASS, callIndex: attempt, model: LONGRUN_MODEL,
          promptVersion: LONGRUN_PROMPT_VERSION, systemPrompt: system, userPrompt: user,
          response: parsed, error: parsed ? null : 'no parsed output', usage, durationMs: ms,
          validationStatus: parsed ? 'ok' : 'parse_error',
        }).catch((e) => console.warn('[longrun_read] log failed:', e))
      }
      if (!parsed) { lastError = 'no parsed output'; continue }
      return { written: parsed, costUsd, ms, attempts: attempt }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.warn(`[longrun_read] attempt ${attempt} failed:`, lastError)
      if (log) {
        await logAiCall(admin, {
          clientId: args.clientId, runId: args.runId, pass: LONGRUN_PASS, callIndex: attempt, model: LONGRUN_MODEL,
          promptVersion: LONGRUN_PROMPT_VERSION, systemPrompt: system, userPrompt: user, response: null,
          error: lastError, usage: { prompt_tokens: 0, completion_tokens: 0 }, durationMs: Date.now() - startedAt, validationStatus: 'parse_error',
        }).catch(() => {})
      }
      if (isTimeout(e)) throw asTimeout(e, 'writer')
    }
  }
  throw new LongRunWriteError(`The long-run read could not be written twice over: ${lastError}`)
}
