import { createHash } from 'node:crypto'

import { jsRegex, negativePattern, strongPattern, type BrandRule } from './aliases'

// Brand topics v1 (WP2.6): which brand_mentions rows the rules give, from the
// candidates brand_mention_candidates (MF2) returns, and the counts they make
// in a month's market. PURE: scripts/brand-mentions.ts does the reading and
// the writing.
//
// THE ROWS (MF2 part B's shape). One `content` row per video and brand (the
// unique index allows no more): the field it records is the first that
// matched, in CONTENT_FIELD_ORDER. One `comment` row per matching comment,
// with the first of its month. method 'rule', the rules' version.
//
// A HOMONYM VIDEO. A rule reads one text at a time, so a video can pass in one
// field ("COTOPAXI" on screen) while its caption plainly names the other
// meaning ("Parque Nacional COTOPAXI"). So each guarded brand is also read
// with its bare name (barePattern), and a content field the bare name matches
// but the rule does not, whose excerpt fails the negative guards (a region, a
// volcano, "am Freitag"), marks the video as naming the word in its other
// meaning. Such a video gets no content row unless a field that passed shows a
// strong form (a handle, "Cotopaxi Allpa"), and a comment on it counts only if
// it shows a strong form itself: the comments under a Patagonia travel film
// talk about the region. A field that merely lacks a company sign (a bare
// "FREITAG" on screen) is no evidence either way and marks nothing.
// The test reads the excerpt (at most 160 characters around the first hit),
// so it can miss a guard word further away, and then it marks nothing: it
// only ever takes rows away, never adds one.

export const CONTENT_FIELDS = ['account', 'caption', 'hashtags', 'transcript', 'transcript_en', 'ocr'] as const
export type ContentField = (typeof CONTENT_FIELDS)[number]
/** Which matching field a content row records: the one a reader checks first. */
export const CONTENT_FIELD_ORDER: readonly ContentField[] = ['caption', 'hashtags', 'account', 'transcript_en', 'transcript', 'ocr']

/** One row of brand_mention_candidates (MF2 part B). */
export interface Candidate {
  video_id: string
  source: 'content' | 'comment'
  field: string | null
  comment_id: string | null
  comment_month: string | null
  excerpt: string | null
}

export interface BrandCandidates {
  rule: BrandRule
  /** 'client' | competitors.id | 'watched:<slug>' */
  brandKey: string
  /** The candidates of brandPattern(rule, 'are'). */
  hits: readonly Candidate[]
  /** The candidates of barePattern(rule, 'are'); null where the rule has none. */
  bare: readonly Candidate[] | null
}

/** A brand_mentions row as the script inserts it. */
export interface MentionRow {
  client_id: string
  video_id: string
  brand_key: string
  source: 'content' | 'comment'
  field: string | null
  comment_id: string | null
  comment_month: string | null
  method: 'rule'
  rule_version: string
}

export interface PlannedMention {
  brand: string
  row: MentionRow
  /** For the hand check only; never written to the database. */
  excerpt: string | null
}

export interface DroppedCandidate {
  brand: string
  candidate: Candidate
  why: 'homonym_video'
}

export interface MentionPlan {
  mentions: PlannedMention[]
  /** Per brand: the videos read as naming the word in its other meaning. */
  homonymVideos: Map<string, Set<string>>
  dropped: DroppedCandidate[]
}

const monthStart = (d: string): string => `${d.slice(0, 7)}-01`

function test(pattern: string | null, text: string | null): boolean {
  return pattern !== null && !!text && jsRegex(pattern).test(text)
}

/** The videos a guarded rule reads as naming its word in the other meaning. */
export function homonymVideosOf(rule: BrandRule, hits: readonly Candidate[], bare: readonly Candidate[] | null): Set<string> {
  const out = new Set<string>()
  const negative = negativePattern(rule, 'js')
  if (!bare || negative === null) return out
  const strong = strongPattern(rule, 'js')
  const passed = new Map<string, Candidate[]>()
  for (const h of hits) {
    if (h.source !== 'content') continue
    passed.set(h.video_id, [...(passed.get(h.video_id) ?? []), h])
  }
  for (const b of bare) {
    if (b.source !== 'content') continue
    const ok = passed.get(b.video_id) ?? []
    if (ok.some((h) => h.field === b.field)) continue // the rule passed this field
    if (test(negative, b.excerpt)) continue // no guard fired: it only lacks a sign
    if (ok.some((h) => test(strong, h.excerpt))) continue // a strong form elsewhere wins
    out.add(b.video_id)
  }
  return out
}

/** The rows the candidates give (see the header). Deterministic order. */
export function planMentions(clientId: string, ruleVersion: string, brands: readonly BrandCandidates[]): MentionPlan {
  const mentions: PlannedMention[] = []
  const dropped: DroppedCandidate[] = []
  const homonymVideos = new Map<string, Set<string>>()
  for (const b of brands) {
    const homonyms = homonymVideosOf(b.rule, b.hits, b.bare)
    homonymVideos.set(b.rule.brand, homonyms)
    const strong = strongPattern(b.rule, 'js')
    const row = (c: Candidate, source: 'content' | 'comment'): PlannedMention => ({
      brand: b.rule.brand,
      excerpt: c.excerpt,
      row: {
        client_id: clientId, video_id: c.video_id, brand_key: b.brandKey, source,
        field: source === 'content' ? c.field : null,
        comment_id: source === 'comment' ? c.comment_id : null,
        comment_month: source === 'comment' && c.comment_month ? monthStart(c.comment_month) : null,
        method: 'rule', rule_version: ruleVersion,
      },
    })
    // Content: one row per video, the first field in CONTENT_FIELD_ORDER.
    const byVideo = new Map<string, Candidate[]>()
    for (const c of b.hits) {
      if (c.source !== 'content' || !c.field || !(CONTENT_FIELD_ORDER as readonly string[]).includes(c.field)) continue
      byVideo.set(c.video_id, [...(byVideo.get(c.video_id) ?? []), c])
    }
    for (const [videoId, cs] of byVideo) {
      const first = [...cs].sort((x, y) => CONTENT_FIELD_ORDER.indexOf(x.field as ContentField) - CONTENT_FIELD_ORDER.indexOf(y.field as ContentField))[0]
      if (homonyms.has(videoId)) {
        dropped.push({ brand: b.rule.brand, candidate: first, why: 'homonym_video' })
        continue
      }
      mentions.push(row(first, 'content'))
    }
    // Comments: one row per comment.
    const seen = new Set<string>()
    for (const c of b.hits) {
      if (c.source !== 'comment' || !c.comment_id || !c.comment_month || seen.has(c.comment_id)) continue
      seen.add(c.comment_id)
      if (homonyms.has(c.video_id) && !test(strong, c.excerpt)) {
        dropped.push({ brand: b.rule.brand, candidate: c, why: 'homonym_video' })
        continue
      }
      mentions.push(row(c, 'comment'))
    }
  }
  const key = (m: PlannedMention) => `${m.row.brand_key}\u0000${m.row.video_id}\u0000${m.row.source}\u0000${m.row.comment_id ?? ''}`
  mentions.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))
  return { mentions, homonymVideos, dropped }
}

/** The unique key of a row (brand_mentions_uniq), for skipping held rows:
 *  PostgREST cannot target the index's coalesce expression (MF2 seam). */
export function mentionKey(r: Pick<MentionRow, 'client_id' | 'video_id' | 'brand_key' | 'source' | 'comment_id' | 'rule_version'>): string {
  return [r.client_id, r.video_id, r.brand_key, r.source, r.comment_id ?? '00000000-0000-0000-0000-000000000000', r.rule_version].join('|')
}

// ---- counts in a month's market ---------------------------------------------

export interface MonthBrandCount {
  brand: string
  brandKey: string
  month: string
  /** The month's market videos (market_month_videos: full lane, a comment
   *  dated in the month, the client's own posts out). */
  n: number
  /** Videos the brand came up in: named in content, or in a comment dated in
   *  the month; the brand's own posts out. */
  kAny: number
  kContent: number
  kComment: number
  /** kAny and n leaving out every video any of our rival searches found
   *  (lib/brands/rival-searches.ts): one base, nOrganic, for every brand in
   *  the month (decision E, the research's F37, the 27 Sep ruling). */
  kOrganic: number
  nOrganic: number
}

export interface CountInputs {
  /** month ('YYYY-MM-01') → that month's market video ids. */
  markets: ReadonlyMap<string, readonly string[]>
  /** The brand a video is the own post of ('client' | competitors.id), or null. */
  ownerOf: (videoId: string) => string | null
  /** The videos any of our rival searches found (`readRivalFound`). */
  rivalFound: ReadonlySet<string>
}

export function monthBrandCounts(mentions: readonly PlannedMention[], brands: readonly { brand: string; brandKey: string }[], inputs: CountInputs): MonthBrandCount[] {
  const out: MonthBrandCount[] = []
  for (const { brand, brandKey } of brands) {
    const mine = mentions.filter((m) => m.row.brand_key === brandKey)
    const contentVideos = new Set(mine.filter((m) => m.row.source === 'content').map((m) => m.row.video_id))
    for (const [month, ids] of [...inputs.markets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const market = new Set(ids)
      const commentVideos = new Set(mine.filter((m) => m.row.source === 'comment' && m.row.comment_month === month).map((m) => m.row.video_id))
      const counted = (v: string) => market.has(v) && inputs.ownerOf(v) !== brandKey
      const any = new Set([...contentVideos, ...commentVideos].filter(counted))
      const organic = (v: string) => !inputs.rivalFound.has(v)
      out.push({
        brand, brandKey, month, n: market.size,
        kAny: any.size,
        kContent: [...contentVideos].filter(counted).length,
        kComment: [...commentVideos].filter(counted).length,
        kOrganic: [...any].filter(organic).length,
        nOrganic: [...market].filter(organic).length,
      })
    }
  }
  return out
}

/** Per brand, its own posts that name it, over the whole window: they are its
 *  posts, not the market naming it (decision E), so they are counted apart. */
export function ownPostMentions(mentions: readonly PlannedMention[], ownerOf: (videoId: string) => string | null): Map<string, number> {
  const out = new Map<string, Set<string>>()
  for (const m of mentions) {
    if (ownerOf(m.row.video_id) !== m.row.brand_key) continue
    out.set(m.row.brand_key, (out.get(m.row.brand_key) ?? new Set()).add(m.row.video_id))
  }
  return new Map([...out].map(([k, v]) => [k, v.size]))
}

// ---- the hand check -----------------------------------------------------------

export interface HandCheckEntry {
  brand: string
  brandKey: string
  videoId: string
  source: 'content' | 'comment'
  field: string | null
  commentId: string | null
  month: string | null
  ownPost: boolean
  excerpt: string | null
}

/** The list a person reads: every hit of the brands in `all` (the client:
 *  every match of your name is read, plan WP2.6), and a fixed sample of
 *  `sample` hits for every other brand, own posts listed apart. The sample is
 *  the first by a hash of the row, so a re-run on the same rows lists the
 *  same ones. */
export function handCheckList(mentions: readonly PlannedMention[], opts: {
  sample: number
  all: ReadonlySet<string>
  ownerOf: (videoId: string) => string | null
}): HandCheckEntry[] {
  const entry = (m: PlannedMention): HandCheckEntry => ({
    brand: m.brand, brandKey: m.row.brand_key, videoId: m.row.video_id, source: m.row.source, field: m.row.field,
    commentId: m.row.comment_id, month: m.row.comment_month, ownPost: opts.ownerOf(m.row.video_id) === m.row.brand_key,
    excerpt: m.excerpt,
  })
  const hash = (m: PlannedMention) => createHash('sha1').update(`${m.row.video_id}|${m.row.comment_id ?? ''}|${m.row.brand_key}`).digest('hex')
  const out: HandCheckEntry[] = []
  const brands = [...new Set(mentions.map((m) => m.row.brand_key))]
  for (const key of brands) {
    const mine = mentions.filter((m) => m.row.brand_key === key)
    const market = mine.filter((m) => opts.ownerOf(m.row.video_id) !== key)
    const own = mine.filter((m) => opts.ownerOf(m.row.video_id) === key)
    const picked = opts.all.has(key) ? market : [...market].sort((a, b) => (hash(a) < hash(b) ? -1 : 1)).slice(0, opts.sample)
    out.push(...picked.map(entry), ...own.map(entry))
  }
  return out
}

// ---- the staging stand-in -----------------------------------------------------

export interface StandInVideo {
  id: string
  account_name: string | null
  caption: string | null
  hashtags: readonly string[] | null
  transcript: string | null
  transcript_en: string | null
  ocr_text: string | null
}
export interface StandInComment { id: string; videoId: string; text: string | null; comment_date: string }

/** PG's `substr(body, greatest(regexp_instr(body, p) - 60, 1), 160)`, in
 *  characters (code points), for a JS match at UTF-16 index `at`. */
export function excerptAt(body: string, at: number): string {
  const chars = Array.from(body)
  const pos = Array.from(body.slice(0, at)).length + 1
  const from = Math.max(pos - 60, 1)
  return chars.slice(from - 1, from - 1 + 160).join('')
}

/** What brand_mention_candidates (MF2) returns, computed in JavaScript from
 *  rows already read: a STAGING DRY RUN ONLY, where MF2 is not applied (the
 *  script refuses it on production and with --apply). `videos` are the
 *  window's readable videos (full lane, a comment dated in the window) and
 *  `comments` the comments dated in the window on them. The JS pattern is the
 *  ARE's twin (lib/brands/aliases.ts), so the two agree but for word
 *  characters outside Unicode letters and digits. */
export function standInCandidates(pattern: string, videos: readonly StandInVideo[], comments: readonly StandInComment[]): Candidate[] {
  const re = jsRegex(pattern)
  const out: Candidate[] = []
  for (const v of videos) {
    const fields: [ContentField, string | null][] = [
      ['account', v.account_name], ['caption', v.caption], ['hashtags', v.hashtags ? v.hashtags.join(' ') : null],
      ['transcript', v.transcript], ['transcript_en', v.transcript_en], ['ocr', v.ocr_text],
    ]
    for (const [field, body] of fields) {
      if (!body) continue
      const m = re.exec(body)
      if (m) out.push({ video_id: v.id, source: 'content', field, comment_id: null, comment_month: null, excerpt: excerptAt(body, m.index) })
    }
  }
  for (const c of comments) {
    if (!c.text) continue
    const m = re.exec(c.text)
    if (m) out.push({ video_id: c.videoId, source: 'comment', field: null, comment_id: c.id, comment_month: monthStart(c.comment_date), excerpt: excerptAt(c.text, m.index) })
  }
  return out
}
