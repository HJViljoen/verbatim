import { PRODUCT_RULE_VERSION, readText, type CompiledAlias, type CompiledCatalogue, type TextPlacement } from './rules'
import {
  PRODUCT_CONTENT_FIELDS, tagTargetKey, type MentionSource, type Placement, type PlacementMethod, type ProductContentField,
  type ProductMentionRow, type ProductTagRow,
} from './types'

// Placing talk under the catalogue (depth redesign v2, T11): the
// product_mentions rows the rules give, the texts that go to the confirm call
// (a generic name) or the classifier (what the rules missed), and which
// placements STAND for each text once every method has spoken. PURE: the step
// (lib/pipeline/product-readings.ts) and the back-read (scripts/products.ts)
// do the reading and the writing.
//
// THE TEXTS. A video's content as a whole (its account, caption, hashtags,
// transcript, the transcript's English, on-screen text) is one text, keyed by
// the video; a comment is one text, keyed by the comment, dated by its own
// month. brand_mentions' shape (MF2): one `content` row per video and target
// (the first field in CONTENT_FIELD_ORDER that places it), one `comment` row
// per comment and target.
//
// WHICH PLACEMENTS STAND, per text, under one catalogue version
// (`standingPlacements`):
//   - a person's tag (product_tags, the newest on the target) is the text's
//     whole answer: a comment's tag for the comment, a video's tag (comment
//     null) for the video's content. A tag of 'none' leaves the text placed
//     nowhere. Tag > everything (PLACEMENT_METHOD_PRECEDENCE).
//   - otherwise the rules' placements, plus what the confirm call confirmed
//     (a generic name the rules set aside) and what the classifier placed (a
//     text the rules placed nowhere). The confirm and the classifier only ever
//     speak where the rules did not, so under one version they add to the
//     rules and never contradict them; a 'none' from either is a record that
//     the text was read, so it is not read again, and places nothing.
// This is PLACEMENT_METHOD_PRECEDENCE read per text: a higher method's answer
// replaces a lower one's only where both answered the same question, and the
// only method that answers the whole text is a person.

export const CONTENT_FIELD_ORDER: readonly ProductContentField[] = ['caption', 'hashtags', 'account', 'transcript_en', 'transcript', 'ocr']

/** A text's identity: the video's content, or a comment. */
export type TextKey = string
export const contentKey = (videoId: string): TextKey => `v:${videoId}`
export const commentKey = (commentId: string): TextKey => `c:${commentId}`

/** A product_mentions row as inserted (the database mints id and found_at). */
export type MentionInsert = Omit<ProductMentionRow, 'id' | 'found_at'>

export interface ContentField { videoId: string; field: ProductContentField; text: string }
export interface CommentText {
  commentId: string
  videoId: string
  /** The first of the comment's month (UTC), 'YYYY-MM-01'. */
  month: string
  text: string
}

/** A text for the confirm call: it holds a generic name the rules set aside. */
export interface ConfirmItem {
  key: TextKey
  source: MentionSource
  videoId: string
  field: ProductContentField | null
  commentId: string | null
  commentMonth: string | null
  /** The words around the first generic name (at most EXCERPT_CHARS). */
  text: string
  /** The generic names it holds. */
  aliases: CompiledAlias[]
}

/** A comment for the classifier: the rules placed it nowhere. */
export interface QueueItem {
  key: TextKey
  videoId: string
  commentId: string
  commentMonth: string
  text: string
}

export interface RulePlan {
  rows: MentionInsert[]
  /** What the rules place, per text (for the readings and the hand check). */
  placed: Map<TextKey, TextPlacement[]>
  confirm: ConfirmItem[]
}

/** How much of a long text the confirm call reads around the generic name. */
export const EXCERPT_CHARS = 320

const monthStart = (d: string): string => `${d.slice(0, 7)}-01`

/** The words around index `at`: up to half of `size` before it. */
export function excerptAround(text: string, at: number, size = EXCERPT_CHARS): string {
  // Cut between code points, so an emoji is never halved into a lone surrogate.
  const chars = Array.from(text)
  const pos = Array.from(text.slice(0, at)).length
  const from = Math.max(0, pos - Math.floor(size / 2))
  const piece = chars.slice(from, from + size).join('')
  return `${from > 0 ? '…' : ''}${piece}${from + size < chars.length ? '…' : ''}`
}

const firstIndexOf = (text: string, aliases: readonly CompiledAlias[]): number => {
  let at = Infinity
  for (const a of aliases) {
    const m = new RegExp(a.pattern.js, 'isu').exec(text)
    if (m && m.index < at) at = m.index
  }
  return Number.isFinite(at) ? at : 0
}

function row(clientId: string, version: string, p: TextPlacement, where: {
  videoId: string; source: MentionSource; field: ProductContentField | null; commentId: string | null; commentMonth: string | null
}): MentionInsert {
  return {
    client_id: clientId, video_id: where.videoId, source: where.source,
    field: where.source === 'content' ? where.field : null,
    comment_id: where.source === 'comment' ? where.commentId : null,
    comment_month: where.source === 'comment' ? where.commentMonth : null,
    placement: p.placement, product_id: p.productId, group_id: p.groupId,
    method: 'rule', rule_version: PRODUCT_RULE_VERSION, catalogue_version: version,
    model: null, prompt_version: null, tag_id: null,
  }
}

const targetOf = (p: Pick<TextPlacement, 'placement' | 'groupId' | 'productId'>): string => `${p.placement}|${p.groupId}|${p.productId ?? ''}`

/**
 * The rule rows, the rule placements and the confirm items of a set of texts.
 * `contents` holds every content field to read (a video's fields in any
 * order); `comments` every comment. Deterministic order. PURE.
 */
export function planRules(clientId: string, compiled: CompiledCatalogue, contents: readonly ContentField[], comments: readonly CommentText[]): RulePlan {
  const rows: MentionInsert[] = []
  const placed = new Map<TextKey, TextPlacement[]>()
  const confirm: ConfirmItem[] = []

  const byVideo = new Map<string, ContentField[]>()
  for (const c of contents) {
    if (!c.text || !(PRODUCT_CONTENT_FIELDS as readonly string[]).includes(c.field)) continue
    byVideo.set(c.videoId, [...(byVideo.get(c.videoId) ?? []), c])
  }
  for (const videoId of [...byVideo.keys()].sort()) {
    const fields = [...byVideo.get(videoId)!].sort((a, b) => CONTENT_FIELD_ORDER.indexOf(a.field) - CONTENT_FIELD_ORDER.indexOf(b.field))
    const seen = new Map<string, TextPlacement>()
    let generic: { field: ProductContentField; text: string; aliases: CompiledAlias[] } | null = null
    const genericAliases = new Map<string, CompiledAlias>()
    for (const f of fields) {
      const r = readText(compiled, f.text)
      for (const p of r.placements) {
        const t = targetOf(p)
        if (seen.has(t)) continue
        seen.set(t, p)
        rows.push(row(clientId, compiled.version, p, { videoId, source: 'content', field: f.field, commentId: null, commentMonth: null }))
      }
      if (r.generic.length) {
        for (const a of r.generic) genericAliases.set(a.aliasId, a)
        if (!generic) generic = { field: f.field, text: f.text, aliases: r.generic }
      }
    }
    if (seen.size) placed.set(contentKey(videoId), strongestPerGroup([...seen.values()]))
    if (generic) {
      confirm.push({
        key: contentKey(videoId), source: 'content', videoId, field: generic.field, commentId: null, commentMonth: null,
        text: excerptAround(generic.text, firstIndexOf(generic.text, generic.aliases)), aliases: [...genericAliases.values()],
      })
    }
  }

  const seenComment = new Set<string>()
  for (const c of [...comments].sort((a, b) => a.commentId.localeCompare(b.commentId))) {
    if (seenComment.has(c.commentId) || !c.text) continue
    seenComment.add(c.commentId)
    const r = readText(compiled, c.text)
    const month = monthStart(c.month)
    for (const p of r.placements) {
      rows.push(row(clientId, compiled.version, p, { videoId: c.videoId, source: 'comment', field: null, commentId: c.commentId, commentMonth: month }))
    }
    if (r.placements.length) placed.set(commentKey(c.commentId), r.placements)
    if (r.generic.length) {
      confirm.push({
        key: commentKey(c.commentId), source: 'comment', videoId: c.videoId, field: null, commentId: c.commentId, commentMonth: month,
        text: excerptAround(c.text, firstIndexOf(c.text, r.generic)), aliases: r.generic,
      })
    }
  }
  return { rows, placed, confirm }
}

/** Across a video's fields, the strongest placement per category stands (a
 *  caption naming the product and a transcript saying "liners" is named). */
function strongestPerGroup(ps: readonly TextPlacement[]): TextPlacement[] {
  const rank = (p: TextPlacement) => (p.placement === 'named' ? 3 : p.placement === 'unclear' ? 2 : 1)
  const best = new Map<string, number>()
  for (const p of ps) best.set(p.groupId, Math.max(best.get(p.groupId) ?? 0, rank(p)))
  return ps.filter((p) => rank(p) === best.get(p.groupId))
}

/** The unique key of a non-tag row (product_mentions_uniq), for skipping held
 *  rows: PostgREST cannot target the index's coalesce (the MF2 seam). */
export function mentionKey(r: Pick<MentionInsert, 'client_id' | 'video_id' | 'source' | 'comment_id' | 'product_id' | 'group_id' | 'method' | 'rule_version' | 'catalogue_version'>): string {
  const z = '00000000-0000-0000-0000-000000000000'
  return [r.client_id, r.video_id, r.source, r.comment_id ?? z, r.product_id ?? z, r.group_id ?? z, r.method, r.rule_version, r.catalogue_version].join('|')
}

/** The text a row belongs to. */
export const keyOfRow = (r: Pick<MentionInsert, 'source' | 'video_id' | 'comment_id'>): TextKey =>
  r.source === 'comment' && r.comment_id ? commentKey(r.comment_id) : contentKey(r.video_id)

// ---- which placements stand -------------------------------------------------------

/** A placement as the readings count it. */
export interface Standing {
  placement: Exclude<Placement, 'none'>
  groupId: string
  productId: string | null
  method: PlacementMethod
}

/** A text and what stands on it: the video it is on, and the month a
 *  comment is dated in (null for a video's content: it counts in every month
 *  the video is in the market). */
export interface StandingText {
  videoId: string
  commentId: string | null
  month: string | null
  placements: Standing[]
}

/** A row the standing reads: a stored or planned placement. */
export type PlacedRow = Pick<MentionInsert, 'video_id' | 'source' | 'comment_id' | 'comment_month' | 'placement' | 'product_id' | 'group_id' | 'method'>

/**
 * What stands on every text (see the header): `rows` are the rule, confirm
 * and classifier rows under ONE catalogue version; `tags` the standing tags
 * (lib/products/types.ts standingTags), each with the month of its comment
 * (`tagMonths`, by tag id; a comment tag without one is dropped: it cannot be
 * dated). `active` drops a placement under a category or product the catalogue
 * no longer holds. PURE.
 */
export function standingPlacements(args: {
  rows: readonly PlacedRow[]
  tags?: ReadonlyMap<string, ProductTagRow>
  tagMonths?: ReadonlyMap<string, string>
  active: { groups: ReadonlySet<string>; products: ReadonlySet<string> }
}): Map<TextKey, StandingText> {
  const out = new Map<TextKey, StandingText>()
  const ok = (groupId: string | null, productId: string | null) =>
    !!groupId && args.active.groups.has(groupId) && (!productId || args.active.products.has(productId))
  for (const r of args.rows) {
    if (r.method === 'tag') continue
    const key = keyOfRow(r)
    const t = out.get(key) ?? { videoId: r.video_id, commentId: r.source === 'comment' ? r.comment_id : null, month: r.source === 'comment' ? r.comment_month : null, placements: [] }
    out.set(key, t)
    if (r.placement === 'none' || !ok(r.group_id, r.product_id)) continue
    if (t.placements.some((p) => p.placement === r.placement && p.groupId === r.group_id && p.productId === r.product_id)) continue
    t.placements.push({ placement: r.placement, groupId: r.group_id!, productId: r.product_id, method: r.method })
  }
  for (const tag of args.tags?.values() ?? []) {
    const key = tag.comment_id ? commentKey(tag.comment_id) : contentKey(tag.video_id)
    const month = tag.comment_id ? args.tagMonths?.get(tag.id) ?? out.get(key)?.month ?? null : null
    if (tag.comment_id && !month) continue
    const placements: Standing[] = tag.placement !== 'none' && ok(tag.group_id, tag.product_id)
      ? [{ placement: tag.placement, groupId: tag.group_id!, productId: tag.product_id, method: 'tag' }]
      : []
    out.set(key, { videoId: tag.video_id, commentId: tag.comment_id, month, placements })
  }
  return out
}

/** The texts the confirm call has answered under this version (a confirmed
 *  row of any placement, 'none' included). */
export function confirmedTexts(rows: readonly Pick<MentionInsert, 'method' | 'source' | 'video_id' | 'comment_id'>[]): Set<TextKey> {
  return new Set(rows.filter((r) => r.method === 'confirmed').map(keyOfRow))
}

/** The texts the classifier has answered under this version. */
export function classifiedTexts(rows: readonly Pick<MentionInsert, 'method' | 'source' | 'video_id' | 'comment_id'>[]): Set<TextKey> {
  return new Set(rows.filter((r) => r.method === 'model').map(keyOfRow))
}

/** The videos whose CONTENT stands under a category in any way: the videos
 *  the classifier reads comments under ("category-relevant", plan T11). */
export function relevantVideos(standing: ReadonlyMap<TextKey, StandingText>): Set<string> {
  const out = new Set<string>()
  for (const [key, t] of standing) if (key.startsWith('v:') && t.placements.length > 0) out.add(t.videoId)
  return out
}

/** A comment is worth the classifier's call when it holds a letter or digit
 *  run of three or more: an emoji, a handle alone or "😍😍" places nothing. */
export const worthReading = (text: string): boolean => {
  const bare = text.replace(/@[\p{L}\p{N}_.]+/gu, ' ').replace(/https?:\/\/\S+/g, ' ')
  return /[\p{L}\p{N}]{3,}/u.test(bare)
}

/**
 * The classifier's queue: comments under a relevant video that no rule,
 * confirm, classifier or tag has placed (or read) under this version, worth
 * reading, oldest month first, then by video and comment. PURE.
 */
export function classifierQueue(args: {
  comments: readonly (CommentText & { lowSignal?: boolean | null })[]
  relevant: ReadonlySet<string>
  /** Texts any method has spoken on: the rules' placed texts, the confirm
   *  items, every stored row's text, every tag's target. */
  spoken: ReadonlySet<TextKey>
}): QueueItem[] {
  const out: QueueItem[] = []
  const seen = new Set<string>()
  for (const c of args.comments) {
    if (seen.has(c.commentId)) continue
    seen.add(c.commentId)
    if (!args.relevant.has(c.videoId) || c.lowSignal || !c.text || !worthReading(c.text)) continue
    const key = commentKey(c.commentId)
    if (args.spoken.has(key)) continue
    out.push({ key, videoId: c.videoId, commentId: c.commentId, commentMonth: monthStart(c.month), text: c.text })
  }
  return out.sort((a, b) => a.commentMonth.localeCompare(b.commentMonth) || a.videoId.localeCompare(b.videoId) || a.commentId.localeCompare(b.commentId))
}

/** The texts a set of tags speaks for. */
export const tagKeys = (tags: Iterable<ProductTagRow>): Set<TextKey> =>
  new Set([...tags].map((t) => (t.comment_id ? commentKey(t.comment_id) : contentKey(t.video_id))))

/** standingTags' key for a text (lib/products/types.ts tagTargetKey). */
export const tagKeyOfText = (videoId: string, commentId: string | null): string => tagTargetKey(videoId, commentId)
