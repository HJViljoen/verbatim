import { z } from 'zod'
import { chunk } from '../chunk'
import { zodResponseFormat } from 'openai/helpers/zod'
import { openai } from '../openai'
import { ANALYSIS_TEMPERATURE, ATTRIBUTION_MODEL, estimateCost } from '../config'
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

/**
 * The prompt's version label, for the ai_call_log row and a re-tag plan.
 *
 * v3 (2026-09-25) is the first judge scored against labelled truth:
 * scripts/eval-attribution.ts, on a 200-video Sealand gold set labelled by two
 * independent model labellers (one row adjudicated), split train / holdout by
 * row (scripts/eval-data/attribution/sealand-gold-2026-09-24.json). On the 123
 * train videos v2 scored 0.56 and main's v1 0.78; v3 on gpt-4.1 scored 0.95
 * (in a wording that still explained mentions=), and 0.87 on the 77 holdout
 * videos it was never tuned on. Its misses there: a two-brand thrift find, an
 * alternatives post, an outfit list, bare "#patagonia", "Freitag" and
 * "x Cotopaxi" captions (six false tags), and four
 * genuine rival posts it answered NONE — founder and talk-show stories, a
 * partner post, and one whose name sits past the head. What changed, each for
 * a failure the gold set showed:
 *  - no mentions= snippets. v2 quoted the words around a name that sat past
 *    the caption head, and the judge read a quoted name as a confirmed one —
 *    26 of 71 train videos about no company went to Cotopaxi off gear lists
 *    and affiliate links. A reworded, located snippet still cost 5 points on
 *    gpt-4.1, and 36 of the 38 train videos whose names sit only past the head
 *    are about no company;
 *  - the subject first, then each candidate ABOUT / NOT ABOUT with the other
 *    sense of its name and a quoted proof, and only then the label (v2 wrote
 *    the label first, and a label could contradict the reason under it);
 *  - a counter-example per failure class, with invented company names so the
 *    shared prompt names no client;
 *  - gpt-4.1 (ATTRIBUTION_MODEL): the same prompt scored 0.85 on gpt-4.1-mini.
 */
export const ATTRIBUTION_PROMPT_VERSION = 'attribution_v3'

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
  /** The judge's own words for each video it answered: the subject it named
   *  and, for a tag, the proof it quoted. For review and the eval. */
  reasons: Map<string, string>
}

const BRAND = 'BRAND'
const NONE = 'NONE'
const GPT_BATCH = 60

/**
 * Every judge call's bound. The SDK's default is a 600 s timeout and two
 * retries, and gatePlatform runs inside ONE Inngest step (gate:<platform>)
 * that the route caps at 300 s (app/api/inngest/route.ts maxDuration): a hung
 * call there is killed with the step, and Inngest retries the whole gate step —
 * relevance and attribution paid for again. One gpt-4.1 batch hung for most of
 * the eval's 955.8 s run (v3d, 2026-09-25).
 *
 * 90 s per attempt is about nine times a normal 60-video batch on gpt-4.1
 * (~10 s in the eval). One retry, for a 429 or a 5xx that clears in seconds.
 * The signal caps the whole call, the retry included, at 120 s, so a hang
 * costs at most that and lands as a COUNTED failed batch — the strict
 * tagWithoutJudge fallback, an errors[] line, validation_status call_failed —
 * the same as a 400. A retried attempt's usage is never reported back, so it
 * reaches neither costUsd nor ai_call_log; one retry bounds that to one batch.
 * lib/pipeline/pass-b.ts bounds its calls the same way (120 s, no retry).
 */
export const JUDGE_REQUEST = { timeout: 90_000, maxRetries: 1 } as const
export const JUDGE_CALL_CAP_MS = 120_000

/** Tokens one judged video costs, with room: v3 on gpt-4.1 used 111 prompt /
 *  57 completion tokens a video on Sealand's holdout and 127 / 63 on Össur's
 *  sample (2026-09-25), the system prompt spread over its batch included. */
export const JUDGE_TOKENS_PER_VIDEO = { prompt: 140, completion: 70 } as const

/** What judging `videos` candidates should cost on `model`, before any call —
 *  for a re-tag's refusal above its --max-usd, and the eval's budget. */
export function projectedJudgeCost(videos: number, model: string): number {
  return videos * estimateCost(model, JUDGE_TOKENS_PER_VIDEO.prompt, JUDGE_TOKENS_PER_VIDEO.completion)
}

/** What the judge is shown of each video — the one definition the prompt and
 *  the proof check both read, so they cannot disagree about what was visible. */
const CAPTION_HEAD = 200
const HASHTAGS_SHOWN = 8
const ACCOUNT_CHARS = 100
const HASHTAG_CHARS = 60

/** One video as a judge receives it: the candidate and its labels (the
 *  matched names, BRAND first when a brand keyword matched, then NONE). */
export interface JudgeItem { cand: AttrCandidate; labels: string[] }

/** A verdict reduced to what attributeVideos acts on. `entity` is BRAND, a
 *  candidate name or NONE; anything else is treated as NONE. */
export interface JudgeVerdict { index: number; entity: string; reason: string }

/**
 * Everything that makes one attribution judge different from another: its
 * model, its two prompts, the shape of its answer, and how an answer becomes a
 * label. attributeVideos runs ATTRIBUTION_JUDGE unless it is handed another —
 * which only scripts/eval-attribution.ts does, to score the frozen earlier
 * judges against the same labelled gold set as the current one.
 */
export interface AttributionJudge {
  version: string
  model: string
  systemPrompt: (config: GatherConfig) => string
  userPrompt: (items: JudgeItem[], config: GatherConfig) => string
  /** The structured-output schema; must be a z.object. */
  schema: z.ZodType
  /** The parsed answer → one verdict per video it answered. */
  verdicts: (parsed: unknown, items: JudgeItem[]) => JudgeVerdict[]
}

/** Exported for tests. Tenant-generic: every name, product and sense in it
 *  comes from the tenant's config, and the worked examples use invented
 *  companies so that no client's names are written into a prompt every tenant
 *  shares. */
export function buildSystemPrompt(config: GatherConfig): string {
  const brand = config.brand_keywords?.[0] ?? 'the brand'
  const rivals = (config.competitor_names ?? []).map((c) => str(c)).filter(Boolean)
  const category = (config.industry_keywords ?? []).join(', ') || 'the brand’s category'
  // The client's own homonym list (tracking_configs.exclude_terms), rendered
  // as senses rather than banned words, the way relevance.ts renders it:
  // a video can name the other sense and still be about the company.
  // tagAfterExclusions below is the deterministic half of the same rule.
  const excluded = (config.exclude_terms ?? []).map((t) => `${t}`.trim()).filter(Boolean)
  const exclusionLines = excluded.length > 0
    ? [
        '',
        `Senses of the names this client has flagged as NOT the company: ${excluded.join(', ')}.`,
        'A video about one of these is NOT ABOUT; a video genuinely about the company stays ABOUT even if one appears in it.',
      ]
    : []
  return [
    `You decide which ONE company a social video is about, for a consumer-intelligence report on a brand ("${brand}")${rivals.length > 0 ? ` and its competitors (${rivals.join(', ')})` : ''}.`,
    `They make: ${category}.`,
    '',
    'Each video matched one or more company NAMES by keyword: its candidates. A keyword match is not evidence — most matches are not about the company.',
    'For each video, first write its subject: what it is mainly about, in at most 8 words. Then, for every candidate:',
    '- sense: if the name is also an ordinary word, a day, a place or a person in any language, say which (“German for Sunday”, “a mountain in Tanzania”); otherwise "".',
    '- about: true when ABOUT, false when NOT ABOUT, by the rules below.',
    '- proof: for an ABOUT candidate, the shortest exact words (at most 12) from the text shown that show the company or its product as the subject; otherwise "".',
    '',
    'ABOUT — the company or one of its products is the MAIN subject:',
    '- a review, unboxing, demo, question or complaint about one of its products, or a creator wearing or using it as the focus;',
    '- two or more of its OWN products compared or shown together;',
    '- a shop, reseller or retailer showing that company’s products;',
    '- news about the company: a lawsuit, campaign, collaboration, store opening, controversy or its history;',
    '- the company’s own account, or a community named after the company discussing its products.',
    'NOT ABOUT:',
    '- the name used as an ordinary word, a day, a date, a place or a person — a weekday in another language, a region, a mountain or volcano, a town, a hostel or a park that shares the name. When the name has another sense, only the COMPANY counts as proof: one of its products or what it makes, its store, its handle, or a brand hashtag. The name alone — in capitals, as a hashtag, beside emojis, a day, an event, music or a place — is the other sense;',
    '- a round-up, top-N list, “best …” ranking, buying guide, deal list, gear list, packing list, what’s-in-my-bag, outfit list, haul or shop show across several brands, or affiliate links — unless the whole video is about this one company;',
    '- a comparison of this company against another brand (“A vs B”, “which should I buy”) or a question about several brands: no single company is the subject. A post centred on one company that names others only for context IS about it;',
    '- other brands named in the text count, whether or not they are candidates: a haul, sale or list naming this company and another brand is several brands;',
    '- a video about something else — a trip, a vlog, another brand’s product — that names the company in passing, in a pile of hashtags or in links.',
    '',
    'No proof in the text shown → NOT ABOUT.',
    'entity: the ABOUT candidate (BRAND when the brand is ABOUT), or NONE. Use the label exactly as listed.',
    '',
    'Examples, with invented company names — carry over the reasoning, not the names:',
    '- candidates=[Sonntag] caption="Sonntag 😴☕ #fyp #weekend" → NONE: the weekday.',
    '- candidates=[Sonntag] caption="Was macht ihr diesen Sonntag? 🎶 @dj.lena" → NONE: the day — "am/ab/diesen/jeden Sonntag", "Sonntag 21.8.", "SONNTAG VIBES 🎉" and "Sonntag Live" are all the day.',
    '- candidates=[Sonntag] caption="My new SONNTAG messenger bag, cut from an old truck tarp" → Sonntag, proof "My new SONNTAG messenger bag".',
    '- candidates=[Kilimanjaro] caption="Sunrise at the top 🏔️ #kilimanjaro #tanzania #hiking" → NONE: the mountain.',
    '- candidates=[Kilimanjaro] caption="Kilimanjaro is being sued over its recycled-fabric claims" → Kilimanjaro, proof "Kilimanjaro is being sued".',
    '- candidates=[Kilimanjaro] caption="Top 7 carry-on backpacks of 2026: Osprey, Kilimanjaro, Tortuga…" → NONE: a round-up.',
    '- candidates=[Kilimanjaro, Sonntag] caption="Kilimanjaro Summit 30 vs Sonntag Roller — which daypack wins?" → NONE: a comparison.',
    '- candidates=[Kilimanjaro] caption="3 weeks in Vietnam 🇻🇳 Our travel gear: camera https://… hip pack: Kilimanjaro Lumbar 5L https://…" → NONE: a travel vlog with a gear list.',
    '- candidates=[Kilimanjaro] caption="Office look #12 Shirt: Uniqlo · Trousers: COS · Bag: Kilimanjaro Roll-Top" → NONE: an outfit list; the bag is one item of several.',
    '- candidates=[Kilimanjaro] caption="Cabin life, day 40: hauling water uphill. My Deuter and Kilimanjaro packs make it easy #offgrid" → NONE: cabin life; the packs come up in passing.',
    '- candidates=[Kilimanjaro] caption="Summit 30 vs Summit 40 — which Kilimanjaro pack should you buy?" → Kilimanjaro, proof "which Kilimanjaro pack should you buy": two of its own products.',
    '- candidates=[Kilimanjaro] caption="Why does nobody review Kilimanjaro packs? Osprey has thousands" → Kilimanjaro, proof "Why does nobody review Kilimanjaro packs".',
    ...exclusionLines,
  ].join('\n')
}

/** The account, caption head and hashtags exactly as the user prompt prints them. */
function shownFields(cand: AttrCandidate): { account: string; caption: string; tags: string } {
  return {
    account: promptText(str(cand.account_name), ACCOUNT_CHARS),
    caption: promptText(str(cand.caption), CAPTION_HEAD),
    tags: (cand.hashtags ?? []).slice(0, HASHTAGS_SHOWN).map((h) => promptText(str(h), HASHTAG_CHARS)).filter(Boolean).join(' '),
  }
}

/** Exported for tests. Every scraped string goes through promptText — the
 *  UTF-16 `.slice(0, 200)` this used to be cut an emoji in half and 400'd the
 *  whole batch (lib/gather/transcript.ts promptText).
 *
 *  The judge sees the caption's first 200 code points, the first eight
 *  hashtags and the account — and nothing past them. matchEntities reads the
 *  whole caption (on YouTube the full description), so a name first named past
 *  the head is proposed but not shown, and the prompt's rule answers it: no
 *  proof in the text shown → NONE. See ATTRIBUTION_PROMPT_VERSION for why v2's
 *  mentions= snippets are gone. */
export function buildUserPrompt(items: JudgeItem[]): string {
  const lines = ['VIDEOS — for each: its subject, then every candidate ABOUT or NOT ABOUT with proof, then the entity:']
  items.forEach(({ cand, labels }, i) => {
    const f = shownFields(cand)
    lines.push(`[${i}] candidates=[${labels.join(', ')}] | account=${f.account || '(none)'} | caption=${f.caption || '(none)'} | hashtags=${f.tags || '(none)'}`)
  })
  return lines.join('\n')
}

// The answer, in the order the model should think it: the subject, then each
// candidate with its proof, and only then the label. v2 asked for the label
// FIRST and the reason after, and a label can contradict the reason written
// under it ("Video about Patagonia brand history" → NONE).
const verdictSchema = z.object({
  index: z.number().int(),
  subject: z.string(),
  candidates: z.array(z.object({ label: z.string(), sense: z.string(), about: z.boolean(), proof: z.string() })),
  entity: z.string(), // 'BRAND' | an exact competitor name | 'NONE'
})
const batchSchema = z.object({ verdicts: z.array(verdictSchema) })

/** Letters and digits only, compatibility-folded, so a proof matches the text
 *  whatever the model did to its spacing, punctuation, emoji, case, accents or
 *  𝐬𝐭𝐲𝐥𝐞𝐝 letters. */
const bare = (s: string): string =>
  s.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * True when a proof is quoted from the text the judge was shown for this
 * video: at least half of its words of three or more characters are in it.
 * Exported for tests.
 *
 * What it catches, and no more: an EMPTY proof, and a proof mostly made of
 * words the judge was never shown — typically a quote from past the
 * 200-code-point caption head or past the eighth hashtag, which matchEntities
 * reads and the prompt does not. It is NOT a check that the proof shows the
 * company: the candidate's own name is usually in the text shown (it is why
 * the video is a candidate), so a proof of the name plus one invented word
 * passes by half — "Freitag bag" on "FREITAG PARTY PEOPLE", "Patagonia
 * jacket" on a bare "#patagonia". It vetoed no tag in the chosen train run or
 * the holdout run (2026-09-25). The prompt's "the name alone is the other
 * sense" rule rests on the judge.
 *
 * A stricter variant — at least one shown word BESIDES the candidate's name —
 * was measured offline on saved answers only: it would veto 1 wrong and 0
 * right Sealand tags (train + holdout) and 2 wrong and 1 right Össur tags
 * (bare "#ottobock"). Both sets had already been seen, so it waits for a fresh
 * sample before it is adopted.
 *
 * Word by word and only by half, not as one exact string, because a faithful
 * proof still comes back stitched and trimmed: "Perfect backpack #cotopaxi"
 * out of "Perfect backpack #hiking … #cotopaxi", "Bought a Patago…Nano puff
 * jacket", "Terravia Pack 22L … by Patagonia". An exact-string check vetoed five
 * genuine tags in six on the gold set's train split.
 */
export function proofIsShown(proof: string, cand: AttrCandidate): boolean {
  const f = shownFields(cand)
  const hay = bare([f.account, f.caption, f.tags].join(' '))
  const words = str(proof).split(/\s+|…|\.{2,}/).map(bare).filter((w) => w.length >= 3)
  return words.length > 0 && 2 * words.filter((w) => hay.includes(w)).length >= words.length
}

/** The parsed answer → verdicts. A tag stands only when the model marked that
 *  candidate ABOUT and its proof is in the text shown; otherwise NONE, with the
 *  reason saying which check it failed. */
function verdictsV3(parsed: unknown, items: JudgeItem[]): JudgeVerdict[] {
  return (parsed as z.infer<typeof batchSchema>).verdicts.map((v) => {
    const entity = str(v.entity).trim()
    const subject = str(v.subject)
    if (entity.toUpperCase() === NONE) return { index: v.index, entity: NONE, reason: subject }
    const call = v.candidates.find((c) => fold(c.label) === fold(entity))
    const item = items[v.index]
    if (!call?.about) return { index: v.index, entity: NONE, reason: `${subject} [${entity} not marked ABOUT]` }
    // The other sense the judge named for the name it tagged, for the reviewer:
    // a Freitag tag that says "German for Friday" is one to read twice.
    const sense = str(call.sense) ? ` (other sense: ${str(call.sense)})` : ''
    if (!item || !proofIsShown(call.proof, item.cand)) {
      return { index: v.index, entity: NONE, reason: `${subject} [${entity}: proof not in the text shown: "${call.proof}"]${sense}` }
    }
    return { index: v.index, entity, reason: `${subject} — "${call.proof}"${sense}` }
  })
}

/** The judge every gather and re-tag runs. */
export const ATTRIBUTION_JUDGE: AttributionJudge = {
  version: ATTRIBUTION_PROMPT_VERSION,
  model: ATTRIBUTION_MODEL,
  systemPrompt: buildSystemPrompt,
  userPrompt: buildUserPrompt,
  schema: batchSchema,
  verdicts: verdictsV3,
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
  opts: { method: AttributionMethod; config: GatherConfig; judge?: AttributionJudge },
): Promise<AttributionResult> {
  const judge = opts.judge ?? ATTRIBUTION_JUDGE
  const tags = new Map<string, VideoTags>()
  const result: AttributionResult = {
    tags, costUsd: 0, promptTokens: 0, completionTokens: 0, gptJudged: 0,
    rejected: 0, fallbackIds: new Set(), failedBatches: 0, errors: [], reasons: new Map(),
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
    let threw = false
    try {
      const items = batch.map((f) => ({ cand: f.cand, labels: f.labels }))
      const completion = await openai.chat.completions.parse({
        model: judge.model,
        temperature: ANALYSIS_TEMPERATURE,
        messages: [
          { role: 'system', content: judge.systemPrompt(opts.config) },
          { role: 'user', content: judge.userPrompt(items, opts.config) },
        ],
        response_format: zodResponseFormat(judge.schema, 'attribution'),
      }, { ...JUDGE_REQUEST, signal: AbortSignal.timeout(JUDGE_CALL_CAP_MS) })
      if (completion.usage) {
        result.promptTokens += completion.usage.prompt_tokens
        result.completionTokens += completion.usage.completion_tokens
        result.costUsd += estimateCost(judge.model, completion.usage.prompt_tokens, completion.usage.completion_tokens)
      }
      const parsed = completion.choices[0]?.message?.parsed
      for (const v of parsed == null ? [] : judge.verdicts(parsed, items)) {
        const f = batch[v.index]
        if (!f || answered.has(f.cand.video_id)) continue
        tags.set(f.cand.video_id, tagAfterExclusions(f.cand, resolveTag(v.entity, f.matches), opts.config))
        result.reasons.set(f.cand.video_id, v.reason)
        answered.add(f.cand.video_id)
      }
    } catch (e) {
      // Never crash the gather — but never hide it either. This catch was bare
      // and its fallback was the substring tag, which is how every September
      // gather with a cut emoji tagged 100% of its name matches as rivals.
      const message = e instanceof Error ? e.message : String(e)
      threw = true
      result.failedBatches++
      result.errors.push(`batch ${b + 1} of ${batches.length} (${batch.length} videos): ${message}`)
      console.warn(`[attribution] batch ${b + 1} of ${batches.length} failed; ${batch.length} videos tagged without a judge: ${message}`)
    }
    const skipped = batch.filter((f) => !answered.has(f.cand.video_id))
    if (!threw && batch.length > 0 && skipped.length === batch.length) {
      // A batch that returned without throwing and answered NOTHING — a
      // refusal, or parsed output that came back empty — failed as surely as
      // one that threw. It was counted nowhere: no failedBatches, no errors
      // line, an ai_call_log row reading 'ok', and a re-tag plan's check (d)
      // reading 0 while up to a whole batch had no verdict.
      result.failedBatches++
      result.errors.push(`batch ${b + 1} of ${batches.length} (${batch.length} videos): no verdicts returned`)
      console.warn(`[attribution] batch ${b + 1} of ${batches.length} returned no verdicts; ${batch.length} videos tagged without a judge`)
    } else if (skipped.length > 0 && skipped.length < batch.length) {
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
