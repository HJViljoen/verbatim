import { z } from 'zod'
import { chunk } from '../chunk'
import { zodResponseFormat } from 'openai/helpers/zod'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { promptText } from './transcript'
import { fold, str } from './util'
import { matchEntities, tagVideo, tagAfterExclusions, tagWithoutJudge, type EntityMatches, type TagCandidate, type VideoTags } from './tagging'
import type { GatherConfig } from './types'

// Content attribution — decides which entity (brand / a competitor / none) a
// video is genuinely ABOUT. Substring (matchEntities) has high recall but is
// blind to homonyms: "Freitag" = German "Friday", "Patagonia"/"Cotopaxi" =
// regions in South America. So substring proposes CANDIDATES; one batched GPT
// call confirms or rejects each, turning a noisy keyword hit into a real
// brand/competitor mention. Never crashes a gather — but a video the judge
// gave no verdict for is NOT given its substring tag any more (2026-09-24):
// it goes through tagWithoutJudge, and the result counts it (fallbackIds,
// failedBatches, errors) so gather can log it and say so.

export type AttributionMethod = 'substring' | 'gpt'

/** The prompt's version label, for the ai_call_log row. v2 (2026-09-24): the
 *  homonym / round-up / not-visible rules and the `mentions=` evidence. */
export const ATTRIBUTION_PROMPT_VERSION = 'attribution_v2'

/** A VideoInsert/DB-row subset + its id — what attribution judges. */
export type AttrCandidate = TagCandidate & { video_id: string }

export interface AttributionResult {
  tags: Map<string, VideoTags>
  costUsd: number
  promptTokens: number
  completionTokens: number
  /** Videos with a candidate name, sent to the judge. */
  gptJudged: number
  /** Of those, the ones a verdict left untagged (NONE, an exclusion, or a
   *  label that was not a candidate). */
  rejected: number
  /** Videos tagged WITHOUT a verdict — their batch failed or the model skipped
   *  their index — through tagWithoutJudge. A re-tag must never write these. */
  fallbackIds: Set<string>
  /** GPT batches that threw. */
  failedBatches: number
  /** One line per failed batch or skipped index, for the log row. */
  errors: string[]
}

const BRAND = 'BRAND'
const NONE = 'NONE'
const GPT_BATCH = 60

/** What the judge is shown of each video — the one definition both the prompt
 *  and the evidence check below read, so they cannot disagree about what was
 *  visible. */
const CAPTION_HEAD = 200
const HASHTAGS_SHOWN = 8
const ACCOUNT_CHARS = 100
const HASHTAG_CHARS = 60
/** Code points either side of a name the judge could not otherwise see. */
const MENTION_CONTEXT = 60

const verdictSchema = z.object({
  index: z.number().int(),
  entity: z.string(), // 'BRAND' | an exact competitor name | 'NONE'
  reason: z.string(),
})
const batchSchema = z.object({ verdicts: z.array(verdictSchema) })

/** Exported for tests. */
export function buildSystemPrompt(config: GatherConfig): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const category = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
  // The client's own homonym list (tracking_configs.exclude_terms). This is the
  // one prompt whose whole job is homonym disambiguation, so it is where a
  // client's "Cotopaxi the volcano" / "Sealand the shipping line" belongs —
  // rendered the same way relevance.ts does, as senses rather than banned
  // words, because a video can name the other sense and still be about the
  // company. `excludedTag` below is the deterministic half of the same rule.
  const excluded = (config.exclude_terms ?? []).map((t) => `${t}`.trim()).filter(Boolean)
  const exclusionLines = excluded.length > 0
    ? [
        '',
        `For THIS client, matches about any of these are NOT about the brand: ${excluded.join(', ')}.`,
        'They name other senses of the names, not banned words — a video genuinely about the company',
        'or its products stays attributed even if one of them appears in it.',
      ]
    : []
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
    // The v2 rules, one line each (2026-09-24). The first is ERDA's "was haltet
    // ihr von diesen Freitag" — a real verdict, not a fallback, that took 45
    // August comments into a rival's bucket. The second is the round-ups and
    // gear lists; the third, the judge confirming names it was never shown.
    'A name that is also a common word, a day, a date, a place or a person needs visible sign of the company or its products (bags, clothing, gear, a store, the brand’s own handle); otherwise NONE — German day phrasings such as "am/ab/diesen/jeden Freitag", "Freitag 21.8.", "#friday" or "Freitagskracher" are the day, not the brand.',
    'A video that lists, ranks or rounds up many brands, or names the company only in a gear list or affiliate links, is NONE unless that company is its main subject.',
    'If the candidate name is not visible in the text shown for that video (account, caption, hashtags or mentions), answer NONE.',
    '',
    'mentions=[…] quotes the words around a candidate name that sits further into a long caption than the part shown.',
    '',
    'If the brand is genuinely featured, prefer BRAND. Otherwise return the exact competitor name it is about.',
    'Return exactly one of the candidate labels listed for that video, or NONE.',
    ...exclusionLines,
  ].join('\n')
}

/**
 * Where a folded needle first occurs in a text, in CODE POINTS of the text.
 *
 * Every match in this product is made on `fold`ed text (lowercase, accents
 * stripped), and folding can change a string's length — so the position has to
 * be mapped back one code point at a time, not read off the folded copy.
 */
function foldedIndexOf(points: readonly string[], needle: string): { start: number; end: number } | null {
  if (!needle) return null
  let folded = ''
  const origin: number[] = []
  points.forEach((cp, i) => {
    const f = cp.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    for (let j = 0; j < f.length; j++) origin.push(i)
    folded += f
  })
  const at = folded.indexOf(needle)
  if (at < 0) return null
  return { start: origin[at], end: origin[at + needle.length - 1] + 1 }
}

/**
 * The words around each candidate name the judge would otherwise not see.
 *
 * matchEntities reads the WHOLE caption — on YouTube that is the full
 * description — while the judge is shown its first 200 code points and eight
 * hashtags. So "Top 5 Best Backpacks" with The North Face at character 778 was
 * confirmed as a rival post by a judge that never saw the name (Freitag 64 of
 * 366 tags, Cotopaxi 34 of 271). One snippet per candidate whose first
 * occurrence is outside what is shown; none when it is visible.
 */
export function mentionSnippets(cand: AttrCandidate, labels: readonly string[], config: GatherConfig): string[] {
  const caption = str(cand.caption).replace(/\s+/g, ' ').trim()
  // Exactly what buildUserPrompt prints, so "visible" means visible.
  const shown = fold([
    promptText(str(cand.account_name), ACCOUNT_CHARS),
    promptText(caption, CAPTION_HEAD),
    ...(cand.hashtags ?? []).slice(0, HASHTAGS_SHOWN).map((h) => promptText(str(h), HASHTAG_CHARS)),
  ].join(' '))
  const hay = fold([cand.account_name, caption, ...(cand.hashtags ?? [])].join(' '))
  const points = [...caption]
  const out: string[] = []
  for (const label of labels) {
    if (label === NONE) continue
    // BRAND's evidence is whichever configured brand keyword is present.
    const names = label === BRAND
      ? (config.brand_keywords ?? []).map(fold).filter((k) => k !== '' && hay.includes(k))
      : [fold(label)]
    if (names.length === 0 || names.some((n) => shown.includes(n))) continue
    const name = names[0]
    const hit = foldedIndexOf(points, name)
    if (hit) {
      const from = Math.max(0, hit.start - MENTION_CONTEXT)
      const to = Math.min(points.length, hit.end + MENTION_CONTEXT)
      const words = `${from > 0 ? '…' : ''}${points.slice(from, to).join('')}${to < points.length ? '…' : ''}`
      out.push(`${label}: ${promptText(words, 2 * MENTION_CONTEXT + name.length + 2)}`)
      continue
    }
    // Not in the caption at all: then it is in a hashtag past the eighth.
    const tag = (cand.hashtags ?? []).slice(HASHTAGS_SHOWN).find((h) => fold(h).includes(name))
    if (tag) out.push(`${label}: ${promptText(str(tag), HASHTAG_CHARS)}`)
  }
  return out
}

/** Exported for tests. Every scraped string goes through promptText — the
 *  UTF-16 `.slice(0, 200)` this used to be cut an emoji in half and 400'd the
 *  whole batch (lib/gather/transcript.ts promptText). */
export function buildUserPrompt(items: { cand: AttrCandidate; labels: string[] }[], config: GatherConfig): string {
  const lines = ['VIDEOS — for each, pick which candidate it is genuinely about (or NONE):']
  items.forEach(({ cand, labels }, i) => {
    const caption = promptText(str(cand.caption), CAPTION_HEAD)
    const tags = (cand.hashtags ?? []).slice(0, HASHTAGS_SHOWN).map((h) => promptText(str(h), HASHTAG_CHARS)).filter(Boolean).join(' ')
    const account = promptText(str(cand.account_name), ACCOUNT_CHARS)
    const mentions = mentionSnippets(cand, labels, config)
    lines.push(
      `[${i}] candidates=[${labels.join(', ')}] | account=${account || '(none)'} | caption=${caption || '(none)'} | hashtags=${tags || '(none)'}` +
      (mentions.length > 0 ? ` | mentions=[${mentions.join('; ')}]` : ''),
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

// The client's exclusions have the last word over the model's answer. The
// prompt above asks GPT to respect them, but a prompt is a request;
// tagAfterExclusions (lib/gather/tagging.ts) is the deterministic half, and it
// runs on the path a real run takes (gather.ts: `opts.attribution ?? 'gpt'`),
// not only on the operator CLI's substring path.

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
  const result: AttributionResult = {
    tags, costUsd: 0, promptTokens: 0, completionTokens: 0, gptJudged: 0,
    rejected: 0, fallbackIds: new Set(), failedBatches: 0, errors: [],
  }

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

  const batches = chunk(flagged, GPT_BATCH)
  for (const [b, batch] of batches.entries()) {
    const answered = new Set<string>()
    try {
      const completion = await openai.chat.completions.parse({
        model: ANALYSIS_MODEL,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [
          { role: 'system', content: buildSystemPrompt(opts.config) },
          { role: 'user', content: buildUserPrompt(batch.map((f) => ({ cand: f.cand, labels: f.labels })), opts.config) },
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
        if (!f) continue
        tags.set(f.cand.video_id, tagAfterExclusions(f.cand, resolveTag(v.entity, f.matches), opts.config))
        answered.add(f.cand.video_id)
      }
    } catch (e) {
      // Never crash the gather — but never hide it either. This catch was bare
      // and its fallback was the substring tag, which is how every September
      // gather with a cut emoji tagged 100% of its name matches as rivals.
      const message = e instanceof Error ? e.message : String(e)
      result.failedBatches++
      result.errors.push(`batch ${b + 1} of ${batches.length} (${batch.length} videos): ${message}`)
      console.warn(`[attribution] batch ${b + 1} of ${batches.length} failed; ${batch.length} videos tagged without a judge: ${message}`)
    }
    const skipped = batch.filter((f) => !answered.has(f.cand.video_id))
    if (skipped.length > 0 && skipped.length < batch.length) {
      result.errors.push(`batch ${b + 1} of ${batches.length}: no verdict for ${skipped.length} of ${batch.length} videos`)
    }
    // No verdict → the strict fallback, and counted. Never tagVideo.
    for (const f of skipped) {
      tags.set(f.cand.video_id, tagWithoutJudge(f.cand, opts.config))
      result.fallbackIds.add(f.cand.video_id)
    }
    for (const f of batch) {
      if (!answered.has(f.cand.video_id)) continue
      const t = tags.get(f.cand.video_id)
      if (t && !t.is_client && !t.is_competitor) result.rejected++
    }
  }

  return result
}
