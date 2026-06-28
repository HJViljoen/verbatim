import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { fold, str } from './util'
import { matchEntities, tagVideo, type EntityMatches, type TagCandidate, type VideoTags } from './tagging'
import type { GatherConfig } from './types'

// Content attribution — decides which entity (brand / a competitor / none) a
// video is genuinely ABOUT. Substring (matchEntities) has high recall but is
// blind to homonyms: "Freitag" = German "Friday", "Patagonia"/"Cotopaxi" =
// regions in South America. So substring proposes CANDIDATES; one batched GPT
// call confirms or rejects each, turning a noisy keyword hit into a real
// brand/competitor mention. Same seam + fail-safe philosophy as relevance.ts —
// on GPT error it falls back to the substring tag (keep recall, never crash).

export type AttributionMethod = 'substring' | 'gpt'

/** A VideoInsert/DB-row subset + its id — what attribution judges. */
export type AttrCandidate = TagCandidate & { video_id: string }

export interface AttributionResult {
  tags: Map<string, VideoTags>
  costUsd: number
  promptTokens: number
  completionTokens: number
  gptJudged: number
}

const BRAND = 'BRAND'
const NONE = 'NONE'
const GPT_BATCH = 60

const verdictSchema = z.object({
  index: z.number().int(),
  entity: z.string(), // 'BRAND' | an exact competitor name | 'NONE'
  reason: z.string(),
})
const batchSchema = z.object({ verdicts: z.array(verdictSchema) })

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function buildSystemPrompt(config: GatherConfig): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const category = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
  return [
    `You attribute social videos to a brand ("${brand}") or its competitors for a consumer-intelligence report.`,
    `The brand and its competitors make: ${category}.`,
    '',
    'Each video already matched one or more entity NAMES by keyword. Those matches are CANDIDATES only.',
    'Decide which ONE entity the video is genuinely ABOUT — it shows, reviews, mentions, compares, or',
    'discusses that company or its products — or NONE if every match is coincidental.',
    '',
    'Reject coincidental matches — a brand name that is also a common word or a place:',
    '- "Freitag" is German for "Friday"; a video about a day, the weather, or news is NOT the bag brand.',
    '- "Patagonia" and "Cotopaxi" are regions in South America; travel/scenery content is NOT the brand.',
    'When the name is used as the ordinary word or the place, answer NONE.',
    '',
    'If the brand is genuinely featured, prefer BRAND. Otherwise return the exact competitor name it is about.',
    'Return exactly one of the candidate labels listed for that video, or NONE.',
  ].join('\n')
}

function buildUserPrompt(items: { cand: AttrCandidate; labels: string[] }[]): string {
  const lines = ['VIDEOS — for each, pick which candidate it is genuinely about (or NONE):']
  items.forEach(({ cand, labels }, i) => {
    const caption = str(cand.caption).replace(/\s+/g, ' ').trim().slice(0, 200)
    const tags = (cand.hashtags ?? []).slice(0, 8).join(' ')
    lines.push(
      `[${i}] candidates=[${labels.join(', ')}] | account=${str(cand.account_name) || '(none)'} | caption=${caption || '(none)'} | hashtags=${tags || '(none)'}`,
    )
  })
  return lines.join('\n')
}

/** Map a GPT label back to tags, trusting only labels that were real candidates. */
function resolveTag(entity: string, matches: EntityMatches): VideoTags {
  const e = str(entity).trim()
  if (e.toUpperCase() === NONE) return { is_client: false, is_competitor: false, competitor_name: null }
  if (e.toUpperCase() === BRAND && matches.brand) {
    return { is_client: true, is_competitor: false, competitor_name: null }
  }
  const comp = matches.competitors.find((c) => fold(c) === fold(e))
  if (comp) return { is_client: false, is_competitor: true, competitor_name: comp }
  // Unknown / hallucinated label → industry (don't trust a non-candidate).
  return { is_client: false, is_competitor: false, competitor_name: null }
}

/**
 * Attribute each video to an entity. method='substring' is the naive first-match
 * tagging (no GPT); method='gpt' disambiguates substring candidates with one
 * batched call per GPT_BATCH videos. Videos with no candidate are industry and
 * never reach GPT, so the call is small (only the flagged ones).
 */
export async function attributeVideos(
  videos: AttrCandidate[],
  opts: { method: AttributionMethod; config: GatherConfig },
): Promise<AttributionResult> {
  const tags = new Map<string, VideoTags>()
  const result: AttributionResult = { tags, costUsd: 0, promptTokens: 0, completionTokens: 0, gptJudged: 0 }

  const flagged: { cand: AttrCandidate; matches: EntityMatches; labels: string[] }[] = []
  for (const v of videos) {
    const m = matchEntities(v, opts.config)
    if (!m.brand && m.competitors.length === 0) {
      tags.set(v.video_id, { is_client: false, is_competitor: false, competitor_name: null })
    } else if (opts.method === 'substring') {
      tags.set(v.video_id, tagVideo(v, opts.config))
    } else {
      flagged.push({ cand: v, matches: m, labels: [...(m.brand ? [BRAND] : []), ...m.competitors, NONE] })
    }
  }

  if (opts.method === 'substring' || flagged.length === 0) return result
  result.gptJudged = flagged.length

  for (const batch of chunk(flagged, GPT_BATCH)) {
    try {
      const completion = await openai.chat.completions.parse({
        model: ANALYSIS_MODEL,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [
          { role: 'system', content: buildSystemPrompt(opts.config) },
          { role: 'user', content: buildUserPrompt(batch.map((f) => ({ cand: f.cand, labels: f.labels }))) },
        ],
        response_format: zodResponseFormat(batchSchema, 'attribution'),
      })
      if (completion.usage) {
        result.promptTokens += completion.usage.prompt_tokens
        result.completionTokens += completion.usage.completion_tokens
        result.costUsd += estimateCost(ANALYSIS_MODEL, completion.usage.prompt_tokens, completion.usage.completion_tokens)
      }
      for (const v of completion.choices[0]?.message?.parsed?.verdicts ?? []) {
        const f = batch[v.index]
        if (f) tags.set(f.cand.video_id, resolveTag(v.entity, f.matches))
      }
    } catch {
      // fail to substring for this batch (keep recall rather than crash).
    }
    // Any flagged video the model skipped (or a failed batch) → substring fallback.
    for (const f of batch) {
      if (!tags.has(f.cand.video_id)) tags.set(f.cand.video_id, tagVideo(f.cand, opts.config))
    }
  }

  return result
}
