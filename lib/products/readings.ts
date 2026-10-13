import type { SupabaseClient } from '@supabase/supabase-js'

import type { Candidate } from '../brands/mentions'
import type { RegexEngine } from '../brands/aliases'
import type { MonthVideo } from '../provenance/searches'
import { chunkByAudienceMonth, mergeMonthRows, monthStartOf, type MergeResult } from '../reading/monthly'
import type { StoredFreeze } from '../reading/types'
import { selectAll } from '../supabase-admin'
import { callUsd, planCalls, PRODUCT_MODEL_RULE_VERSION, type ClassifyItem, type RunClassifyResult, type VideoContext } from './classify'
import {
  classifierQueue, commentKey, contentKey, keyOfRow, mentionKey, planRules, relevantVideos, standingPlacements, tagKeys,
  type CommentText, type ConfirmItem, type ContentField, type MentionInsert, type PlacedRow, type QueueItem, type StandingText, type TextKey,
} from './match'
import { cataloguePattern, compileCatalogue, PRODUCT_RULE_VERSION, readText, type CompiledCatalogue } from './rules'
import {
  MONTH_PRODUCT_READINGS_ON_CONFLICT, standingTags, TABLE_MONTH_PRODUCT_READINGS,
  type MonthProductReadingRow, type ProductCatalogue, type ProductContentField, type ProductTagRow,
} from './types'

// Your products as month rows (depth redesign v2, T11): ONE COPY of the
// product read, shared by the pipeline's `product-readings` step
// (lib/pipeline/product-readings.ts, one month a step) and the back-read
// (scripts/products.ts, the whole window in one pass), as lib/brands/readings.ts
// is shared by brand-readings and scripts/brand-mentions.ts.
//
// THE PASS (`placeProducts`), in order, because each part decides what the
// next one reads:
//   1. the rules over every content field of the window's readable videos
//      that brand_mention_candidates (MF2) finds the catalogue in, read in
//      full (one scan for the whole catalogue: `cataloguePattern`);
//   2. the confirm call on the videos whose content holds a generic name;
//   3. the category-relevant videos: those whose content stands under a
//      category (rules, confirmed, or a person's tag);
//   4. the comments dated in the window under those videos, read in full, and
//      every other comment the scan found (its excerpt), through the rules;
//   5. the confirm call on the comments holding a generic name;
//   6. the classifier on the relevant videos' comments nothing has placed
//      (`classifierQueue`), oldest month first, under the run's cap;
//   7. the month rows (`productReadingRows`).
// A dry run (`ask` null) stops before every model call and prices them
// instead (`estimateBatchUsd` over the very prompts it would send).
//
// THE MONTH ROWS (month_product_readings, per month, audience and object):
// the market set is market_month_videos' (full lane, not the client's own
// posts, a comment dated in the month), per audience. A video counts in a
// category's month when its CONTENT stands under the category (in every month
// it is in the market, as a brand's content mention does) or a comment on it
// DATED IN THE MONTH does. The category split is exclusive per video: named
// (a product of the category) over unclear over unbranded, so k_named +
// k_unclear + k_unbranded = k_any. A product row is its named videos. `comments`
// counts the month's comments standing under it. k_organic and n_organic leave
// out every video any of our rival searches found (decided 13 Oct: the brand
// table's one base, lib/brands/rival-searches.ts readRivalFound) AND, per
// category, every video a search of ours in that category's own words found,
// current or retired ("prosthetic arm" leaves Hands' base, "#runningblade"
// Feet's: `categorySearchTerms`); a product row takes its category's. Every
// category and product gets a row in every audience of the month, zeros
// included, so n pools whole.
//
// A product name never names the brand (Heinrich, 13 Oct): no brand_mentions
// row is written here.

export const PRODUCT_READINGS_TABLE = TABLE_MONTH_PRODUCT_READINGS

/** A video as the pass reads it: identity and every content field. */
export interface ProductVideoRow {
  id: string
  platform: string
  video_id: string
  account_name: string | null
  caption: string | null
  hashtags: string[] | null
  transcript: string | null
  transcript_en: string | null
  ocr_text: string | null
}
export const PRODUCT_VIDEO_COLUMNS = 'id, platform, video_id, account_name, caption, hashtags, transcript, transcript_en, ocr_text'

/** A comment as the pass reads it (`video_id` is the platform's id). */
export interface ProductCommentRow {
  id: string
  platform: string
  video_id: string
  text: string | null
  comment_date: string
  is_low_signal: boolean | null
}
export const PRODUCT_COMMENT_COLUMNS = 'id, platform, video_id, text, comment_date, is_low_signal'

/** A stored product_mentions row the pass reads back. */
export type HeldRow = PlacedRow & Pick<MentionInsert, 'client_id' | 'rule_version' | 'catalogue_version' | 'tag_id'>
export const HELD_COLUMNS = 'client_id, video_id, source, comment_id, comment_month, placement, product_id, group_id, method, rule_version, catalogue_version, tag_id'

/** The reads the pass makes. `engine` says which pattern the candidates
 *  take. `held` and `tags` answer null where the products migration is not
 *  applied (a dry run from a seed): nothing is held then. */
export interface ProductReadIO {
  engine: RegexEngine
  /** brand_mention_candidates over the window. */
  candidates(pattern: string): Promise<Candidate[]>
  monthVideos(month: string): Promise<MonthVideo[] | null>
  /** The videos, by uuid, with every content field. */
  videos(ids: readonly string[]): Promise<ProductVideoRow[]>
  /** The comments dated in the window on these videos. */
  comments(videos: readonly { platform: string; video_id: string }[]): Promise<ProductCommentRow[]>
  /** product_mentions under this catalogue version (content rows, and comment
   *  rows of the window's months), and every tag row of any version. */
  held(version: string, months: readonly string[]): Promise<HeldRow[] | null>
  tags(): Promise<ProductTagRow[] | null>
  rivalFound(): Promise<ReadonlySet<string>>
  /** Our search terms, current and retired: every term a gather ran
   *  (keyword_performance, any bucket) and every term configured now. */
  searchTerms(): Promise<string[]>
  /** Of these terms, which found each full-lane video (its source_keywords
   *  now, or its first-found terms): video id → the terms. */
  searchFound(terms: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>>
}

/**
 * Which of our search terms are a category's own words (the rules read the
 * term itself as that category: "prosthetic arm" is Hands', "#runningblade"
 * Feet's). Generic names are left out (a term the confirm call would have to
 * read is no category's for sure). PURE.
 */
export function categorySearchTerms(compiled: CompiledCatalogue, terms: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const term of [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort()) {
    for (const p of readText(compiled, term).placements) out.set(p.groupId, [...new Set([...(out.get(p.groupId) ?? []), term])])
  }
  return out
}

/** Per category, the videos its organic base leaves out beyond the rival
 *  searches' finds: those a search in its own words found. PURE. */
export function categorySearchFinds(byGroup: ReadonlyMap<string, readonly string[]>, found: ReadonlyMap<string, readonly string[]>): Map<string, Set<string>> {
  const norm = (t: string) => t.trim().toLowerCase()
  const out = new Map<string, Set<string>>()
  for (const [groupId, terms] of byGroup) {
    const mine = new Set(terms.map(norm))
    out.set(groupId, new Set([...found].filter(([, ts]) => ts.some((t) => mine.has(norm(t)))).map(([id]) => id)))
  }
  return out
}

const FIELD_OF: Record<ProductContentField, keyof ProductVideoRow> = {
  account: 'account_name', caption: 'caption', hashtags: 'hashtags', transcript: 'transcript', transcript_en: 'transcript_en', ocr: 'ocr_text',
}

/** A video's content fields, as the matcher reads them. PURE. */
export function contentFields(v: ProductVideoRow): ContentField[] {
  const out: ContentField[] = []
  for (const field of Object.keys(FIELD_OF) as ProductContentField[]) {
    const raw = v[FIELD_OF[field]]
    const text = Array.isArray(raw) ? raw.join(' ') : (raw as string | null)
    if (text && text.trim()) out.push({ videoId: v.id, field, text })
  }
  return out
}

/** What the model is asked, through the caller: the confirm items and the
 *  queue, each answered by rows (written by the caller as they return). */
export type Ask = (items: readonly ClassifyItem[], videos: ReadonlyMap<string, VideoContext>, budgetUsd: number, compiled: CompiledCatalogue) => Promise<RunClassifyResult>

export interface PlaceResult {
  compiled: CompiledCatalogue
  markets: Map<string, MonthVideo[]>
  rivalFound: ReadonlySet<string>
  /** Every rule row the window's texts give. */
  ruleRows: MentionInsert[]
  /** Of those, the ones the table did not hold (written unless dry). */
  freshRuleRows: MentionInsert[]
  /** Confirm items asked (or, dry, that would be). */
  confirm: ConfirmItem[]
  /** The classifier's queue (or, dry, what it would read). */
  queue: QueueItem[]
  /** Rows the model gave this pass. */
  modelRows: MentionInsert[]
  /** What stands on every text after the pass. */
  standing: Map<TextKey, StandingText>
  /** The category-relevant videos. */
  relevant: Set<string>
  /** Per category: our search terms in its own words, and the market videos
   *  they found (left out of its organic base). */
  organic: Map<string, { terms: string[]; videos: number }>
  /** Category words in comments under a video that is not category-relevant:
   *  not counted ("winged liner", "trash bag liner"). */
  offTopicWords: number
  /** Videos whose content holds only a generic name nobody has confirmed:
   *  relevant once the confirm says so (a dry run does not read them). */
  waitingOnConfirm: Set<string>
  /** The videos read in full, and every comment's text the pass read (in
   *  full, or the scan's excerpt): for a hand check's sheet, never stored. */
  videoRows: Map<string, ProductVideoRow>
  commentText: Map<string, string>
  /** The month rows, freeze columns not yet filled in. */
  rows: ProductReadingRow[]
  /** The model's spend this pass (dry: 0), and the price of what was not
   *  asked (dry: everything; live: what the cap deferred). */
  costUsd: number
  priceUsd: number
  priced: { calls: number; inputTokens: number; outputTokens: number }
  confirmResult: RunClassifyResult | null
  classifyResult: RunClassifyResult | null
  reads: { candidates: number; videos: number; comments: number }
}

const monthsIn = (from: string, to: string): string[] => {
  const out: string[] = []
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  while (d.toISOString().slice(0, 10) < to.slice(0, 10)) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

/** The price of asking these items, from their prompts. PURE. */
export function priceItems(items: readonly ClassifyItem[], clientName: string, catalogue: ProductCatalogue, compiled: CompiledCatalogue, videos: ReadonlyMap<string, VideoContext>): { calls: number; inputTokens: number; outputTokens: number; usd: number } {
  let input = 0
  let output = 0
  let usd = 0
  const calls = planCalls(items, { clientName, catalogue, compiled, videos })
  for (const c of calls) {
    const e = callUsd(c)
    input += e.input
    output += e.output
    usd += e.usd
  }
  return { calls: calls.length, inputTokens: input, outputTokens: output, usd }
}

/** The video contexts the classifier shows, from the rule placements. */
function contextsOf(videos: ReadonlyMap<string, ProductVideoRow>, standing: ReadonlyMap<TextKey, StandingText>, compiled: CompiledCatalogue): Map<string, VideoContext> {
  const out = new Map<string, VideoContext>()
  for (const [id, v] of videos) {
    const t = standing.get(contentKey(id))
    const ps = t?.placements ?? []
    const names = ps.map((p) => (p.productId
      ? `${compiled.productName.get(p.productId) ?? '?'} (${compiled.groupName.get(p.groupId) ?? '?'})`
      : `${compiled.groupName.get(p.groupId) ?? '?'}${p.placement === 'unclear' ? ` (one of the client's, not which)` : ''}`))
    out.set(id, {
      videoId: id, caption: v.caption, names: [...new Set(names)],
      products: [...new Set(ps.filter((p) => p.productId).map((p) => p.productId!))],
      clientGroups: [...new Set(ps.filter((p) => p.placement !== 'unbranded').map((p) => p.groupId))],
    })
  }
  return out
}

/**
 * The pass (see the header). `ask` null is a dry run: nothing asked, every
 * model item priced. `insert` writes fresh rule rows (absent: a dry run, or a
 * read that writes nothing). `budgetUsd` is the pass's hard cap for the model,
 * the confirm calls first. PURE but for the IO handed in.
 */
export async function placeProducts(args: {
  clientId: string
  clientName: string
  io: ProductReadIO
  catalogue: ProductCatalogue
  window: { from: string; to: string }
  ask: Ask | null
  insert?: (rows: MentionInsert[]) => Promise<void>
  budgetUsd: number
  /** Leave out of the queue past this many items (the run's cap). */
  queueCap?: number
}): Promise<PlaceResult> {
  const { clientId, io, catalogue } = args
  const compiled = compileCatalogue(catalogue, clientId)
  const months = monthsIn(args.window.from, args.window.to)
  const reads = { candidates: 0, videos: 0, comments: 0 }

  const markets = new Map<string, MonthVideo[]>()
  for (const m of months) {
    const set = await io.monthVideos(m)
    if (set) markets.set(m, set)
  }
  const rivalFound = await io.rivalFound()
  // The per-category organic base: beyond the rival searches' finds, the
  // videos a search in the category's own words found.
  const termsByGroup = categorySearchTerms(compiled, await io.searchTerms())
  const allTerms = [...new Set([...termsByGroup.values()].flat())]
  const searchFinds = categorySearchFinds(termsByGroup, allTerms.length ? await io.searchFound(allTerms) : new Map())
  const inMarket = new Set([...markets.values()].flat().map((v) => v.id))
  const organic = new Map([...compiled.groupName.keys()].map((g) => [g, {
    terms: termsByGroup.get(g) ?? [], videos: [...(searchFinds.get(g) ?? [])].filter((id) => inMarket.has(id)).length,
  }]))
  const empty = (): PlaceResult => ({
    compiled, markets, rivalFound, ruleRows: [], freshRuleRows: [], confirm: [], queue: [], modelRows: [],
    standing: new Map(), relevant: new Set(), organic, offTopicWords: 0, waitingOnConfirm: new Set(), videoRows: new Map(), commentText: new Map(),
    rows: productReadingRows({ clientId, compiled, markets, rivalFound, searchFinds, standing: new Map() }),
    costUsd: 0, priceUsd: 0, priced: { calls: 0, inputTokens: 0, outputTokens: 0 }, confirmResult: null, classifyResult: null, reads,
  })
  const pattern = cataloguePattern(compiled, io.engine)
  if (!pattern) return empty()

  // 1. The scan, and every content field of the videos it found, in full.
  const candidates = await io.candidates(pattern)
  reads.candidates = candidates.length
  const contentIds = [...new Set(candidates.filter((c) => c.source === 'content').map((c) => c.video_id))].sort()
  const videoRows = new Map((await io.videos(contentIds)).map((v) => [v.id, v]))
  reads.videos = videoRows.size
  const contents: ContentField[] = [...videoRows.values()].flatMap(contentFields)
  const contentPlan = planRules(clientId, compiled, contents, [])

  const held = (await io.held(compiled.version, months)) ?? []
  const tagRows = (await io.tags()) ?? []
  const tags = standingTags(tagRows)
  const tagMonths = new Map(held.filter((h) => h.method === 'tag' && h.tag_id && h.comment_month).map((h) => [h.tag_id!, h.comment_month!]))
  // Like-for-like: the rows of this catalogue version made by THIS matcher and
  // THIS prompt (a new version of either is read afresh, never mixed in).
  const mine = held.filter((h) => h.catalogue_version === compiled.version && (
    (h.method === 'rule' && h.rule_version === PRODUCT_RULE_VERSION)
    || ((h.method === 'model' || h.method === 'confirmed') && h.rule_version === PRODUCT_MODEL_RULE_VERSION)))
  const active = { groups: new Set(catalogue.groups.map((g) => g.id)), products: new Set(catalogue.products.map((p) => p.id)) }
  const heldKeys = new Set(mine.map(mentionKey as (r: HeldRow) => string))
  const answered = new Set(mine.filter((h) => h.method === 'confirmed' || h.method === 'model').map(keyOfRow))
  const tagged = tagKeys(tags.values())

  let costUsd = 0
  let priceUsd = 0
  const priced = { calls: 0, inputTokens: 0, outputTokens: 0 }
  const modelRows: MentionInsert[] = []
  const freshRuleRows: MentionInsert[] = []
  const writeRules = async (rows: readonly MentionInsert[]) => {
    const fresh = rows.filter((r) => !heldKeys.has(mentionKey(r)))
    for (const r of fresh) heldKeys.add(mentionKey(r))
    freshRuleRows.push(...fresh)
    if (args.insert && fresh.length) await args.insert(fresh)
  }
  await writeRules(contentPlan.rows)

  const standingNow = (ruleRows: readonly MentionInsert[]) => standingPlacements({ rows: [...ruleRows, ...mine, ...modelRows], tags, tagMonths, active })
  const ask = async (items: ClassifyItem[], contexts: ReadonlyMap<string, VideoContext>): Promise<RunClassifyResult | null> => {
    if (items.length === 0) return null
    if (!args.ask) {
      const p = priceItems(items, args.clientName, catalogue, compiled, contexts)
      priceUsd += p.usd
      priced.calls += p.calls
      priced.inputTokens += p.inputTokens
      priced.outputTokens += p.outputTokens
      return null
    }
    const r = await args.ask(items, contexts, Math.max(0, args.budgetUsd - costUsd), compiled)
    costUsd += r.costUsd
    modelRows.push(...r.rows)
    return r
  }

  // 2. The confirm call on the content's generic names.
  const contentConfirm = contentPlan.confirm.filter((c) => !answered.has(c.key) && !tagged.has(c.key))
  const confirmContent = await ask(contentConfirm.map((item) => ({ kind: 'confirm' as const, item })), new Map())

  // 3. The relevant videos. A video whose content holds only a generic name
  //    nobody confirmed waits on the confirm (a dry run reads none of them,
  //    and says how many there are).
  //    Only the market's videos: a client's own post is in no month's count
  //    (market_month_videos leaves it out), so its comments are not read.
  let standing = standingNow(contentPlan.rows)
  const relevant = new Set([...relevantVideos(standing)].filter((id) => inMarket.has(id)))
  const waitingOnConfirm = new Set(contentConfirm.map((c) => c.videoId).filter((id) => !relevant.has(id) && inMarket.has(id)))

  // 4. The comments: in full under the relevant videos, the scan's excerpt
  //    elsewhere.
  const relevantRows = [...relevant].map((id) => videoRows.get(id)).filter((v): v is ProductVideoRow => !!v)
  const commentRows = relevantRows.length ? await io.comments(relevantRows.map((v) => ({ platform: v.platform, video_id: v.video_id }))) : []
  reads.comments = commentRows.length
  const uuidOf = new Map(relevantRows.map((v) => [`${v.platform}\u0000${v.video_id}`, v.id]))
  const fullComments: (CommentText & { lowSignal: boolean | null })[] = []
  for (const c of commentRows) {
    const videoId = uuidOf.get(`${c.platform}\u0000${c.video_id}`)
    if (!videoId || !c.text) continue
    fullComments.push({ commentId: c.id, videoId, month: monthStartOf(String(c.comment_date)), text: c.text, lowSignal: c.is_low_signal })
  }
  const readInFull = new Set(fullComments.map((c) => c.commentId))
  const commentText = new Map<string, string>(fullComments.map((c) => [c.commentId, c.text]))
  for (const c of candidates) if (c.source === 'comment' && c.comment_id && !commentText.has(c.comment_id)) commentText.set(c.comment_id, c.excerpt ?? '')
  const excerpts: CommentText[] = candidates
    .filter((c) => c.source === 'comment' && c.comment_id && c.comment_month && !readInFull.has(c.comment_id))
    .map((c) => ({ commentId: c.comment_id!, videoId: c.video_id, month: String(c.comment_month).slice(0, 10), text: c.excerpt ?? '' }))
  // A category word in a comment counts only under a category-relevant video:
  // under a makeup or a kitchen video, "liner" is a winged liner or a bin
  // liner (the fresh check of 13 Oct). A product's or a family's name counts
  // anywhere.
  const planned = planRules(clientId, compiled, [], [...fullComments, ...excerpts])
  const offTopic = (r: MentionInsert) => r.placement === 'unbranded' && !relevant.has(r.video_id)
  const offTopicWords = planned.rows.filter(offTopic).length
  const commentPlan = { ...planned, rows: planned.rows.filter((r) => !offTopic(r)) }
  for (const [key, ps] of planned.placed) {
    const v = planned.rows.find((r) => keyOfRow(r) === key)?.video_id
    if (v && !relevant.has(v)) {
      const kept = ps.filter((p) => p.placement !== 'unbranded')
      if (kept.length) commentPlan.placed.set(key, kept)
      else commentPlan.placed.delete(key)
    }
  }
  await writeRules(commentPlan.rows)

  // 5. The confirm call on the comments' generic names.
  const commentConfirm = commentPlan.confirm.filter((c) => !answered.has(c.key) && !tagged.has(c.key))
  const confirmComments = await ask(commentConfirm.map((item) => ({ kind: 'confirm' as const, item })), new Map())

  // 6. The classifier on what nothing has spoken on.
  const ruleRows = [...contentPlan.rows, ...commentPlan.rows]
  standing = standingNow(ruleRows)
  const contexts = contextsOf(new Map(relevantRows.map((v) => [v.id, v])), standing, compiled)
  const spoken = new Set<TextKey>([
    ...commentPlan.placed.keys(), ...commentPlan.confirm.map((c) => c.key), ...answered, ...tagged,
    ...mine.map(keyOfRow), ...modelRows.map(keyOfRow),
  ])
  const fullQueue = classifierQueue({ comments: fullComments, relevant, spoken })
  const cap = args.queueCap ?? Infinity
  const queue = fullQueue.slice(0, Math.max(0, cap))
  const classifyResult = await ask(queue.map((item) => ({ kind: 'classify' as const, item })), contexts)
  if (args.ask && fullQueue.length > queue.length) {
    priceUsd += priceItems(fullQueue.slice(queue.length).map((item) => ({ kind: 'classify' as const, item })), args.clientName, catalogue, compiled, contexts).usd
  }

  // 7. The months.
  standing = standingNow(ruleRows)
  const rows = productReadingRows({ clientId, compiled, markets, rivalFound, searchFinds, standing })
  const confirmResult = mergeResults(confirmContent, confirmComments)
  return {
    compiled, markets, rivalFound, ruleRows, freshRuleRows, confirm: [...contentConfirm, ...commentConfirm], queue: fullQueue,
    modelRows, standing, relevant, organic, offTopicWords, waitingOnConfirm, videoRows, commentText, rows, costUsd, priceUsd, priced, confirmResult, classifyResult, reads,
  }
}

function mergeResults(a: RunClassifyResult | null, b: RunClassifyResult | null): RunClassifyResult | null {
  if (!a) return b
  if (!b) return a
  return {
    rows: [...a.rows, ...b.rows], asked: a.asked + b.asked, answered: a.answered + b.answered, unplaced: a.unplaced + b.unplaced,
    deferred: a.deferred + b.deferred, failed: a.failed + b.failed, failedCalls: a.failedCalls + b.failedCalls, costUsd: a.costUsd + b.costUsd,
    downgraded: a.downgraded + b.downgraded,
    rateLimited: a.rateLimited || b.rateLimited, errors: [...a.errors, ...b.errors],
  }
}

// ---- the month rows -----------------------------------------------------------------

/** A month_product_readings row before its freeze columns. */
export type ProductReadingRow = Omit<MonthProductReadingRow, 'status' | 'origin' | 'read_at' | 'run_id' | 'frozen_at'>

const RANK = { named: 3, unclear: 2, unbranded: 1 } as const

/**
 * The month rows of a pass: for every month of `markets`, every audience of
 * its market and every category and product of the catalogue, zeros included
 * (see the header). PURE.
 */
export function productReadingRows(args: {
  clientId: string
  compiled: CompiledCatalogue
  markets: ReadonlyMap<string, readonly MonthVideo[]>
  rivalFound: ReadonlySet<string>
  /** Per category, the videos a search in its own words found (`categorySearchFinds`). */
  searchFinds?: ReadonlyMap<string, ReadonlySet<string>>
  standing: ReadonlyMap<TextKey, StandingText>
}): ProductReadingRow[] {
  const outOfBase = (groupId: string, id: string) => args.rivalFound.has(id) || (args.searchFinds?.get(groupId)?.has(id) ?? false)
  const { clientId, compiled } = args
  const groups = [...compiled.groupName.keys()]
  const products = [...compiled.productName.keys()]
  // Per video: its content's placements; per month, its comments'.
  const content = new Map<string, StandingText['placements']>()
  const byMonth = new Map<string, Map<string, { commentId: string; placements: StandingText['placements'] }[]>>()
  for (const [key, t] of args.standing) {
    if (t.placements.length === 0) continue
    if (key.startsWith('v:')) { content.set(t.videoId, t.placements); continue }
    if (!t.month || !t.commentId) continue
    const m = monthStartOf(t.month)
    const perVideo = byMonth.get(m) ?? new Map()
    perVideo.set(t.videoId, [...(perVideo.get(t.videoId) ?? []), { commentId: t.commentId, placements: t.placements }])
    byMonth.set(m, perVideo)
  }
  const out: ProductReadingRow[] = []
  for (const [month, videos] of [...args.markets].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const audiences = [...new Set(videos.map((v) => v.audience))].sort()
    const comments = byMonth.get(month) ?? new Map()
    for (const audience of audiences) {
      const ids = videos.filter((v) => v.audience === audience).map((v) => v.id)
      // per video: category → its best rank, and the products named
      const best = new Map<string, Map<string, number>>()
      const named = new Map<string, Set<string>>()
      const groupComments = new Map<string, Set<string>>()
      const productComments = new Map<string, Set<string>>()
      for (const id of ids) {
        const ps = [...(content.get(id) ?? []), ...((comments.get(id) ?? []) as { placements: StandingText['placements'] }[]).flatMap((c) => c.placements)]
        const b = new Map<string, number>()
        const n = new Set<string>()
        for (const p of ps) {
          b.set(p.groupId, Math.max(b.get(p.groupId) ?? 0, RANK[p.placement]))
          if (p.placement === 'named' && p.productId) n.add(p.productId)
        }
        best.set(id, b)
        named.set(id, n)
        for (const c of (comments.get(id) ?? []) as { commentId: string; placements: StandingText['placements'] }[]) {
          for (const p of c.placements) {
            groupComments.set(p.groupId, (groupComments.get(p.groupId) ?? new Set()).add(c.commentId))
            if (p.placement === 'named' && p.productId) productComments.set(p.productId, (productComments.get(p.productId) ?? new Set()).add(c.commentId))
          }
        }
      }
      const base = { client_id: clientId, month: monthStartOf(month), audience, n: ids.length, rule_version: PRODUCT_MODEL_RULE_VERSION, catalogue_version: compiled.version }
      // The organic base is the category's: a product row takes its category's.
      const nOrganic = (g: string) => ids.filter((id) => !outOfBase(g, id)).length
      for (const g of groups) {
        const any = ids.filter((id) => (best.get(id)?.get(g) ?? 0) > 0)
        const at = (r: number) => any.filter((id) => best.get(id)!.get(g) === r).length
        out.push({
          ...base, object_kind: 'group', object_id: g, group_id: g, product_id: null,
          k_named: at(RANK.named), k_unclear: at(RANK.unclear), k_unbranded: at(RANK.unbranded), k_any: any.length,
          k_organic: any.filter((id) => !outOfBase(g, id)).length, comments: groupComments.get(g)?.size ?? 0, n_organic: nOrganic(g),
        })
      }
      for (const p of products) {
        const g = compiled.productGroup.get(p)!
        const any = ids.filter((id) => named.get(id)!.has(p))
        out.push({
          ...base, object_kind: 'product', object_id: p, group_id: g, product_id: p,
          k_named: any.length, k_unclear: 0, k_unbranded: 0, k_any: any.length,
          k_organic: any.filter((id) => !outOfBase(g, id)).length, comments: productComments.get(p)?.size ?? 0, n_organic: nOrganic(g),
        })
      }
    }
  }
  return out
}

/** Pool an object's month over the market's audiences (a reader's sum: n
 *  and the counts add across audiences of one month, never across months). */
export function pooledProductMonth(rows: readonly ProductReadingRow[], month: string, objectId: string): Pick<ProductReadingRow, 'k_named' | 'k_unclear' | 'k_unbranded' | 'k_any' | 'k_organic' | 'comments' | 'n' | 'n_organic'> {
  const mine = rows.filter((r) => r.object_id === objectId && monthStartOf(r.month) === monthStartOf(month))
  const sum = (k: keyof ProductReadingRow) => mine.reduce((s, r) => s + (r[k] as number), 0)
  return {
    k_named: sum('k_named'), k_unclear: sum('k_unclear'), k_unbranded: sum('k_unbranded'), k_any: sum('k_any'),
    k_organic: sum('k_organic'), comments: sum('comments'), n: sum('n'), n_organic: sum('n_organic'),
  }
}

// ---- stored rows, the merge and the write ------------------------------------------------

export const productReadingKey = (r: { month: string; audience: string; object_kind: string; object_id: string }): string =>
  `${monthStartOf(r.month)}|${r.audience}|${r.object_kind}|${r.object_id}`

type StoredProduct = { month: string; audience: string; object_kind: string; object_id: string; status: 'filling' | 'frozen'; origin: 'live' | 'back_read'; frozen_at: string | null }

export const toStoredProduct = (rows: readonly StoredProduct[]): StoredFreeze[] =>
  rows.map((r) => ({
    key: productReadingKey(r), month: monthStartOf(r.month), audience: r.audience, objectId: `${r.object_kind}|${r.object_id}`,
    status: r.status, origin: r.origin, frozen_at: r.frozen_at ?? null,
  }))

/** The month tables' merge (lib/reading/monthly.ts): a frozen row kept, a
 *  month that freezes now written frozen, a stale filling row dropped, a new
 *  key in a closed audience-month that already holds product rows refused. */
export function mergeProductRows(args: { months: readonly string[]; fresh: readonly ProductReadingRow[]; stored: readonly StoredFreeze[]; now: string; runId: string | null; closedAudienceMonths?: readonly string[] }): MergeResult<ProductReadingRow> {
  return mergeMonthRows<ProductReadingRow>({ ...args, keyOf: productReadingKey })
}

/** Items the model left in a pass: deferred (a cap, the clock, a rate
 *  limit), in a failed call, answered unusably, or past the queue's cap. A
 *  month the pass read is read in full only when this is 0. PURE. */
export function itemsLeft(pass: Pick<PlaceResult, 'confirmResult' | 'classifyResult' | 'queue'>, queueCap = Infinity): number {
  const left = [pass.confirmResult, pass.classifyResult].reduce((s, r) => s + (r ? r.deferred + r.failed + r.unplaced : 0), 0)
  return left + Math.max(0, pass.queue.length - queueCap)
}

/**
 * THE ONE-SHOT GUARD. A month this write would FREEZE is the record from then
 * on, so it is frozen only from a pass that read it in full (`itemsLeft` 0).
 * Otherwise:
 *   - the live step writes it 'filling' (`hold: 'filling'`): the next run's
 *     plan finds the filling row (planProductReadings), reads the month again
 *     and freezes it then;
 *   - the back-read writes nothing for it (`hold: 'skip'`): the placements
 *     are in, and the next --write reads what is left and writes it whole.
 * A month that stays filling is written as merged either way. PURE.
 */
export function guardFreeze(merged: MergeResult<ProductReadingRow>, left: number, hold: 'filling' | 'skip'): { merged: MergeResult<ProductReadingRow> | null; held: number } {
  const freezing = merged.writes.filter((w) => w.status === 'frozen').length
  if (left === 0 || freezing === 0) return { merged, held: 0 }
  if (hold === 'skip') return { merged: null, held: freezing }
  return {
    merged: {
      ...merged,
      writes: merged.writes.map((w) => (w.status === 'frozen' ? { ...w, status: 'filling' as const, frozen_at: null, origin: 'live' as const } : w)),
    },
    held: freezing,
  }
}

/** The stored rows of these months; null where the table is not there. */
export async function storedProductRows(admin: SupabaseClient, clientId: string, months: readonly string[], isMissing: (e: unknown) => boolean): Promise<StoredFreeze[] | null> {
  if (months.length === 0) return []
  try {
    const rows = await selectAll<StoredProduct>(() => admin.from(PRODUCT_READINGS_TABLE)
      .select('month, audience, object_kind, object_id, status, origin, frozen_at').eq('client_id', clientId).in('month', [...months])
      .order('month').order('audience').order('object_kind').order('object_id'))
    return toStoredProduct(rows)
  } catch (e) {
    if (isMissing(e)) return null
    throw e
  }
}

/** Upsert on the primary key, one audience-month never split across two
 *  statements (decision K's one-statement promise, chunkByAudienceMonth); the
 *  stale filling rows deleted by their whole key. */
export async function writeProductRows(admin: SupabaseClient, clientId: string, merged: MergeResult<ProductReadingRow>): Promise<{ written: number; deleted: number }> {
  let written = 0
  for (const part of chunkByAudienceMonth(merged.writes, 500)) {
    const { error } = await admin.from(PRODUCT_READINGS_TABLE).upsert(part, { onConflict: MONTH_PRODUCT_READINGS_ON_CONFLICT })
    if (error) throw new Error(`${PRODUCT_READINGS_TABLE} upsert: ${(error as { message?: string }).message ?? String(error)}`)
    written += part.length
  }
  let deleted = 0
  for (const s of merged.stale) {
    const [kind, id] = (s.objectId ?? '|').split('|')
    const { error } = await admin.from(PRODUCT_READINGS_TABLE).delete()
      .eq('client_id', clientId).eq('month', s.month).eq('audience', s.audience).eq('object_kind', kind).eq('object_id', id).eq('status', 'filling')
    if (error) throw new Error(`${PRODUCT_READINGS_TABLE} stale delete: ${error.message}`)
    deleted++
  }
  return { written, deleted }
}

export { commentKey, contentKey }
