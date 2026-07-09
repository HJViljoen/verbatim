import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
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
  costUsd: number
  promptTokens: number
  completionTokens: number
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

function buildSystemPrompt(config: GatherConfig): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const competitors = (config.competitor_names ?? []).join(', ') || '(none given)'
  const industry = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
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
  ].join('\n')
}

function buildUserPrompt(candidates: RelevanceCandidate[]): string {
  const lines = ['VIDEOS — judge each by index:']
  candidates.forEach((c, i) => {
    const caption = str(c.caption).replace(/\s+/g, ' ').trim().slice(0, 200)
    const tags = (c.hashtags ?? []).slice(0, 8).join(' ')
    lines.push(`[${i}] account=${str(c.account_name) || '(none)'} | caption=${caption || '(none)'} | hashtags=${tags || '(none)'}`)
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
  const result: ClassifyResult = { verdicts, costUsd: 0, promptTokens: 0, completionTokens: 0 }

  if (opts.method === 'off') {
    for (const c of candidates) verdicts.set(c.video_id, { relevant: true, reason: 'gate off', source: 'default' })
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
      if (!verdicts.has(c.video_id)) verdicts.set(c.video_id, { relevant: true, reason: 'no off-market signal in metadata', source: 'default' })
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
  for (let i = 0; i < undecided.length; i += GPT_BATCH) {
    const batch = undecided.slice(i, i + GPT_BATCH)
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
    } catch {
      // On any failure, fail OPEN for this batch — keep rather than drop real signal.
    }
  }
  keepUndecided()
  return result
}
