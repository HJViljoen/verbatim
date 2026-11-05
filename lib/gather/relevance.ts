import { createHash } from 'node:crypto'
import { z } from 'zod'
import { chunk } from '../chunk'
import { zodResponseFormat } from 'openai/helpers/zod'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { GATE_DEFAULT_REASONS } from './gate-verdicts'
import { promptText } from './transcript'
import { fold, str } from './util'
import type { GatherConfig, VideoInsert } from './types'

// Upstream relevance gate (run BEFORE comment scraping — the expensive step).
// The product, not the client, decides what's market-relevant: a naive keyword
// list ('prosthetics', 'amputee') drags in a different industry (SFX/movie
// makeup), pure human-interest virality, and news. Judging that from the cheap
// metadata (account + caption + hashtags) lets us skip comment-scraping the
// noise — lower Apify cost AND cleaner analysis, instead of paying to gather and
// analyse noise only to discard it later.
//
// Two layers behind one seam: a free heuristic denylist for the obvious
// wrong-industry case, then an optional single batched GPT call for the subtle
// cases (viral human-interest, news) the heuristic can't see. Conservative by
// design — when unsure, KEEP (a false drop loses real signal permanently).
//
// A TENANT'S OWN MARKET DEFINITION (5 Nov; client data, not code). Where
// `tracking_configs.market_description` is set (scripts/set-market-description.ts),
// the GPT layer judges by it: what is in, what is out, how a borderline case
// reads. The broad-category framing and "when unsure, KEEP" are then not sent,
// and nor are the industry keywords as the "category", because they are search
// terms ("handmade bag", "sustainable fashion") and framing the category with
// them is what let Sealand's maker and fashion videos in (67% of its kept
// market videos, 28 Sep to 1 Nov). Where it is null the prompt is the one
// the gate sent before this (8875fe66), byte for byte (pinned by
// lib/test/relevance-golden/legacy-prompts.json), and `promptVersion` says
// which of the two judged.

export type RelevanceMethod = 'off' | 'heuristic' | 'gpt'

/** Videos per GPT call — small enough that every candidate gets real judgment
 *  and the verdict array can never hit the completion cap. */
const GPT_BATCH = 60

export interface RelevanceVerdict {
  relevant: boolean
  reason: string
  source: 'heuristic' | 'gpt' | 'default'
}

/** The metadata the gate judges — a VideoInsert subset, so DB rows work too. */
export type RelevanceCandidate = Pick<VideoInsert, 'video_id' | 'account_name' | 'caption' | 'hashtags'>

export interface ClassifyResult {
  verdicts: Map<string, RelevanceVerdict>
  /** Which prompt judged (`relevancePromptVersion`): ai_call_log.prompt_version
   *  of the gate's row, so a run's verdicts name the definition behind them. */
  promptVersion: string
  costUsd: number
  promptTokens: number
  completionTokens: number
  /** GPT batches that threw. Every video in one was KEPT unjudged (fail-open),
   *  and until 2026-09-24 nothing counted them: gate_verdicts source='default'
   *  in exact multiples of 60 was the only trace. */
  failedBatches: number
  /** One line per failed batch, for the log row. */
  errors: string[]
}

// High-precision off-market substrings: almost never genuine consumer signal for
// a physical-product brand. Deliberately tight — the keyword 'prosthetics' pulls
// in special-effects/movie/cosplay makeup, a wholly different industry. Broad
// words ('makeup', 'movie', 'wound') are excluded to avoid false drops; the GPT
// layer handles everything subtler.
const OFF_MARKET_TERMS = [
  'sfx', 'special effect', 'prosthetic makeup', 'fx makeup', 'cosplay',
  'scar wax', 'silicone mask', 'movie prop', 'creature design', 'creature fx',
  'halloween costume', 'horror makeup',
]

/** Free metadata denylist. Returns a drop verdict for clear off-market noise, else null (undecided). */
export function heuristicVerdict(c: RelevanceCandidate): RelevanceVerdict | null {
  const hay = fold([c.account_name, c.caption, ...(c.hashtags ?? [])].join(' '))
  for (const term of OFF_MARKET_TERMS) {
    if (hay.includes(fold(term))) {
      return { relevant: false, reason: `off-market term "${term}" (SFX/film/cosplay, not the brand's market)`, source: 'heuristic' }
    }
  }
  return null
}

const verdictSchema = z.object({
  index: z.number().int(),
  relevant: z.boolean(),
  reason: z.string(),
})
const batchSchema = z.object({ verdicts: z.array(verdictSchema) })

/** The tenant's market definition as every judging path reads it: the stored
 *  `market_description`, trimmed, line endings made `\n`; null where it is
 *  absent, not a string or blank. The gather, the regate (lib/gather/rejudge.ts),
 *  subreddit discovery's probe and scripts/run-relevance.ts all reach the gate
 *  through `loadGatherConfig`, so all read it here, one way. Pure. */
export function marketDefinitionOf(config: Pick<GatherConfig, 'market_description'>): string | null {
  const raw = config.market_description
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n?/g, '\n').trim()
  return text ? text : null
}

/** The defined-market prompt's own version: bump it when the words of
 *  `definedSystemPrompt` change (the definition's words are in the hash). */
export const RELEVANCE_MARKET_PROMPT = 'market_v1'

/** The first eight hex of the definition's sha256: what a `promptVersion`
 *  and the change log's row carry, so a verdict names the words that judged. */
export const definitionHash = (definition: string): string => createHash('sha256').update(definition, 'utf8').digest('hex').slice(0, 8)

/** The gate's prompt version, as its ai_call_log row stores it. Unchanged
 *  (`relevance_<method>`) wherever no definition is sent: a tenant with no
 *  market description, and the heuristic and off methods, which send no
 *  prompt. With one, `relevance_gpt·market_v1·<hash>`. Nothing reads it to
 *  decide anything (it is a label of the row, like every prompt_version here). */
export function relevancePromptVersion(method: RelevanceMethod, config: Pick<GatherConfig, 'market_description'>): string {
  const definition = method === 'gpt' ? marketDefinitionOf(config) : null
  return definition ? `relevance_${method}·${RELEVANCE_MARKET_PROMPT}·${definitionHash(definition)}` : `relevance_${method}`
}

/** The client's homonym lines, as both prompts send them. */
function exclusionLinesOf(config: GatherConfig): string[] {
  const excluded = (config.exclude_terms ?? []).map((t) => `${t}`.trim()).filter(Boolean)
  return excluded.length > 0
    ? [
        '',
        `For THIS client, matches about any of these are NOT about the brand: ${excluded.join(', ')}.`,
        'These name other senses of the name, not banned words — a video that is genuinely about',
        'the brand or its products stays relevant even if one of them appears in it.',
      ]
    : []
}

/** The prompt where the tenant has defined its market. The definition decides
 *  what is in and out; the brand's own angle is still not required; the
 *  homonym, human-interest and spam rules stand; "when unsure, KEEP" is gone,
 *  because the definition says how a borderline case reads. The industry
 *  keywords are not sent: they are search terms and contradict a definition
 *  that rules their finds out. */
function definedSystemPrompt(config: GatherConfig, definition: string): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const competitors = (config.competitor_names ?? []).join(', ') || '(none given)'
  return [
    'You screen social videos for a consumer-intelligence report about a brand’s market.',
    'This client has DEFINED its market. Judge every video against the definition below, not',
    'against the brand’s wider product category: a video about a neighbouring category, or about',
    'something the definition leaves out, is off-market even when it shares a word with the market.',
    '',
    'THE MARKET, AS THE CLIENT DEFINES IT:',
    definition,
    '',
    'KEEP a video when its COMMENTS would plausibly be about the products inside that market:',
    'real users and buyers, reviews, comparisons, questions, opinions, complaints, purchase',
    'interest. Content genuinely about the brand itself is relevant. Content about a competitor',
    'is relevant when it is about that company’s products inside the market, as the definition',
    'draws it. The brand’s own angle (for example sustainable or recycled) is not required: a',
    'product inside the market is relevant without it.',
    '',
    'DROP:',
    '- anything the definition places outside the market, whatever the search word that found it;',
    '- a NAME HOMONYM: brand or competitor names whose match is a different sense of the word —',
    '  e.g. "Poler" (bag brand) matching pole-dancing or pole-fitness videos, "Patagonia" (brand)',
    '  matching the Patagonia region, its marathons, or travel vlogs. The name appearing in a',
    '  caption/hashtag is NOT enough — the video must be about the company or its products;',
    '- pure human-interest virality or news with no angle on the market’s products;',
    '- spam, reposts, or content unrelated to the market.',
    '',
    'Where the definition says how to read a borderline case, follow it. Otherwise ask what the',
    'comments would mostly be about, and keep the video only when that is the market’s products.',
    '',
    `Brand: ${brand}. Competitors: ${competitors}.`,
    ...exclusionLinesOf(config),
  ].join('\n')
}

/** Exported for tests. With no market definition, the broad-category prompt,
 *  byte for byte as before (lib/test/relevance-golden/legacy-prompts.json). */
export function buildSystemPrompt(config: GatherConfig): string {
  const definition = marketDefinitionOf(config)
  if (definition) return definedSystemPrompt(config, definition)
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const competitors = (config.competitor_names ?? []).join(', ') || '(none given)'
  const industry = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
  // The client's own homonyms (tracking_configs.exclude_terms). Hints, not a
  // denylist: they name the WRONG SENSES of the name, so the gate can recognise
  // "Cotopaxi" the volcano or "Sealand" the container line without dropping a
  // comment that merely says "not the volcano, the jacket".
  const exclusionLines = exclusionLinesOf(config)
  return [
    'You screen social videos for a consumer-intelligence report about a brand’s market.',
    'KEEP a video if its COMMENTS would plausibly carry signal about the brand’s PRODUCT CATEGORY:',
    'real users / buyers, product or category discussion, questions, opinions, complaints,',
    'purchase interest, and ANY content about the brand or a competitor.',
    '',
    'Judge by the BROAD product category, not the brand’s niche angle. The industry keywords',
    'describe how this brand frames itself (e.g. "sustainable") — do NOT require that angle:',
    'a competitor’s product or general category content is relevant even if it never mentions',
    'the brand’s differentiator. Competitor content is always relevant when it is genuinely',
    'about that company or its products.',
    '',
    'DROP only genuine off-market noise:',
    '- a DIFFERENT industry the keyword happens to match — e.g. SFX/movie/cosplay makeup when',
    '  the category is medical prosthetics, or "seal"/"gear" hardware when the brand makes bags;',
    '- a NAME HOMONYM: brand or competitor names whose match is a different sense of the word —',
    '  e.g. "Poler" (bag brand) matching pole-dancing or pole-fitness videos, "Patagonia" (brand)',
    '  matching the Patagonia region, its marathons, or travel vlogs. The name appearing in a',
    '  caption/hashtag is NOT enough — the video must be about the company or its products;',
    '- pure human-interest virality or news with no product/category angle (comments just',
    '  "amazing" / "god bless" / reacting to a story);',
    '- content about ANIMALS/PETS when the brand’s product is for humans — e.g. amputee-pet or',
    '  pet-prosthetic accounts when the category is human prosthetics (found live: a viral',
    '  amputee-pug account outscored real category content in every engagement ranking);',
    '- spam, reposts, or content unrelated to the category.',
    '',
    'When unsure, KEEP.',
    '',
    `Brand: ${brand}. Competitors: ${competitors}. Category (brand’s framing): ${industry}.`,
    ...exclusionLines,
  ].join('\n')
}

/** Exported for tests. Every scraped string goes through promptText — a
 *  UTF-16 `.slice` here once cut an emoji in half and 400'd whole batches. */
export function buildUserPrompt(candidates: RelevanceCandidate[]): string {
  const lines = ['VIDEOS — judge each by index:']
  candidates.forEach((c, i) => {
    const caption = promptText(str(c.caption), 200)
    const tags = (c.hashtags ?? []).slice(0, 8).map((h) => promptText(str(h), 60)).filter(Boolean).join(' ')
    const account = promptText(str(c.account_name), 100)
    lines.push(`[${i}] account=${account || '(none)'} | caption=${caption || '(none)'} | hashtags=${tags || '(none)'}`)
  })
  return lines.join('\n')
}

/**
 * Classify candidates for market relevance. Heuristic first (free); the still-
 * undecided go to one batched GPT call when method='gpt'. method='heuristic'
 * keeps the undecided by default; method='off' keeps everything.
 */
export async function classifyRelevance(
  candidates: RelevanceCandidate[],
  opts: { method: RelevanceMethod; config: GatherConfig },
): Promise<ClassifyResult> {
  const verdicts = new Map<string, RelevanceVerdict>()
  const result: ClassifyResult = {
    verdicts, promptVersion: relevancePromptVersion(opts.method, opts.config), costUsd: 0, promptTokens: 0, completionTokens: 0, failedBatches: 0, errors: [],
  }

  if (opts.method === 'off') {
    for (const c of candidates) verdicts.set(c.video_id, { relevant: true, reason: GATE_DEFAULT_REASONS.off, source: 'default' })
    return result
  }

  const undecided: RelevanceCandidate[] = []
  for (const c of candidates) {
    const h = heuristicVerdict(c)
    if (h) verdicts.set(c.video_id, h)
    else undecided.push(c)
  }

  const keepUndecided = () => {
    for (const c of undecided) {
      if (!verdicts.has(c.video_id)) verdicts.set(c.video_id, { relevant: true, reason: GATE_DEFAULT_REASONS.undecided, source: 'default' })
    }
  }

  if (opts.method === 'heuristic' || undecided.length === 0) {
    keepUndecided()
    return result
  }

  // Batched GPT calls over the undecided. Batching (mirrors attribution's
  // GPT_BATCH) exists for correctness, not just latency: the 2026-07-09 Sealand
  // run sent ~460 videos in ONE call — judgment quality degrades at that size,
  // and if the structured output hits the completion cap the verdict array
  // truncates, silently KEEPING every unjudged video via the fail-open default.
  const batches = chunk(undecided, GPT_BATCH)
  for (const [b, batch] of batches.entries()) {
    try {
      const completion = await openai.chat.completions.parse({
        model: ANALYSIS_MODEL,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [
          { role: 'system', content: buildSystemPrompt(opts.config) },
          { role: 'user', content: buildUserPrompt(batch) },
        ],
        response_format: zodResponseFormat(batchSchema, 'relevance'),
      })
      const parsed = completion.choices[0]?.message?.parsed
      if (completion.usage) {
        result.promptTokens += completion.usage.prompt_tokens
        result.completionTokens += completion.usage.completion_tokens
        result.costUsd += estimateCost(ANALYSIS_MODEL, completion.usage.prompt_tokens, completion.usage.completion_tokens)
      }
      for (const v of parsed?.verdicts ?? []) {
        const cand = batch[v.index]
        if (cand) verdicts.set(cand.video_id, { relevant: v.relevant, reason: v.reason, source: 'gpt' })
      }
    } catch (e) {
      // On any failure, fail OPEN for this batch — keep rather than drop real
      // signal. But COUNTED: the gate still keeps, and the log row says so.
      const message = e instanceof Error ? e.message : String(e)
      result.failedBatches++
      result.errors.push(`batch ${b + 1} of ${batches.length} (${batch.length} kept unjudged): ${message}`)
      console.warn(`[relevance] batch ${b + 1} of ${batches.length} failed; ${batch.length} videos kept unjudged: ${message}`)
    }
  }
  keepUndecided()
  return result
}
