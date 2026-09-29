import { brandCountState, BRAND_HAND_CHECKS, NAME_READS, nameChecked, nameNoMatch, noiseWords, NONE_FOUND, NOT_COUNTED_YET, type BrandCountState } from '../brands/precision'
import { fmtInt, longMonth, shortDate } from '../format'
import { levelText } from '../reading/level'
import { monthStartOf, nextMonth, prevMonth } from '../reading/month-key'
import { FLAGGED_KIND, KIND_ORDER } from '../reading/kinds'
import { marketKindLabel } from './overview-market/kinds'
import type { OwnClaimRow, OwnPostCensus } from '../reading/own-posts'
import type { FormatMatrix, FormatRow } from '../reading/formats'
import type { Quote } from '../renderables/types'

// The Brands page (market-first WP3.5, plan §2.5 B1 to B7; deploy 5). The
// page keeps Competitive's address, keys and loader, and draws the approved
// preview's seven readings on top of it: your name in your market, the brands
// that come up in it, one brand in full over ninety days, what is asked under
// their content, where a rival's talk differs from the category, what they
// post and say about themselves, how the market makes content, and each
// brand's share of what our searches found.
//
// IT STAYS ONE PAGE DOWN, AND NO "YOU AGAINST THEM" SHARE PRINTS ON IT (the
// WP's done-when): the brands are read inside the market, the client's own
// row never stands beside a rival's share, and the face-off (CO3) is not
// drawn.
//
// EVERY BRAND COUNT IS THE MENTION LAYER'S, GATED BY PRODUCTION'S HAND CHECK
// (WP2.6, the lead's rulings of 26 and 27 Sep): a brand prints its counts only
// once its precision is measured on production at the floor and the mention
// layer holds a row of it; else "not counted yet"; measured under the floor,
// "mostly {another word} · not counted". The name line prints only once every
// match of the client's name outside its own posts has been read by hand.
//
// NINETY DAYS END AT THE READING MONTH'S LAST UPDATE, never the clock
// (`windowEnd`), so Össur's window ends on 13 Sep in December as in October.
//
// PURE. The reads are lib/pages/brands-load.ts's.

// ---- the titles and fixed words ---------------------------------------------------

export const NAME_TITLE = 'Your name in your market'
export const TOPICS_TITLE = 'Brands in your market'
export const IN_FULL_TITLE = 'A brand in full, last 90 days'
export const ASKED_TITLE = 'Asked under their content'
export const FINDINGS_TITLE = 'Where a rival’s talk differs'
export const POSTS_TITLE = 'What they post and say about themselves'
export const CONTENT_TITLE = 'How the market makes content'
export const SHARE_TITLE = 'Share of what our searches found'

/** The ninety-day window B2 and B3 read. */
export const WINDOW_DAYS = 90

/** "Asked most" rows before "Show all". */
export const ASKED_SHOWN = 3

/** A finding's recurrence looks back this many months, the reading month's
 *  included ("seen in 2 of the last 6 months"). */
export const RECURRENCE_MONTHS = 6

/** Rows per table in B6 (the preview's format and opening rows). */
export const CONTENT_ROWS = 5

/** The query param that opens every question theme in B3. */
export const ASKED_PARAM = 'asked'

/** The one line where no brand rule is switched on for the tenant (Össur):
 *  deploy 2's paused line, without its pointer at this page. */
export const TOPICS_NOT_READ = 'Brands in your market, counted in every video they come up in, are not read for this workspace yet.'

// ---- B1 · your name in your market -------------------------------------------------

export interface NameBlock {
  month: string
  /** Null: not counted yet (the name is not checked on production, or a match
   *  outside your own posts has not been read by hand). */
  counted: {
    /** The market's videos this month. */
    n: number
    /** Of them, the ones naming you (your own posts out). */
    k: number
    /** Your own posts that name you, dated in the month. */
    ownPosts: number
    /** Comments dated in the month naming you under your own posts, and the
     *  posts they sit under. */
    ownPostComments: number
    ownPostCommentPosts: number
  } | null
}

export function buildNameBlock(input: {
  clientId: string
  month: string
  n: number
  /** Does the mention layer hold any row of the client's name? */
  hasRows: boolean
  /** The market's videos naming the client this month, its own posts out. */
  outside: readonly string[]
  ownPosts: number
  ownPostComments: { comments: number; posts: number }
  checks?: typeof BRAND_HAND_CHECKS
  nameReads?: typeof NAME_READS
  /** Was the mention layer read? Only then is a name production's list held
   *  no match of (`matches: 'none'`) a zero by the rule, as Your market reads
   *  it (lib/pages/overview-market/brands.ts). */
  mentionsRead?: boolean
}): NameBlock {
  const month = monthStartOf(input.month)
  const reads = (input.nameReads ?? NAME_READS)[input.clientId] ?? []
  const read = new Map(reads.filter((r) => r.where === 'production' && monthStartOf(r.month) === month).map((r) => [r.videoId, r.brand]))
  const unread = input.outside.filter((id) => !read.has(id))
  const rows = input.hasRows || (input.mentionsRead === true && nameNoMatch(input.clientId, input.checks))
  if (!rows || !nameChecked(input.clientId, input.checks) || unread.length > 0) return { month, counted: null }
  return {
    month,
    counted: {
      n: input.n,
      k: input.outside.filter((id) => read.get(id) === true).length,
      ownPosts: input.ownPosts,
      ownPostComments: input.ownPostComments.comments,
      ownPostCommentPosts: input.ownPostComments.posts,
    },
  }
}

/** A sentence as parts: code's figures apart from the words, so each figure
 *  is its own node. */
export type Part = { t: 'text'; s: string } | { t: 'figure'; value: number }

/** "In September your name came up in none of the 655 videos from the market
 *  you sell into." Not "your market’s 655 videos", which a client read as her
 *  own customers (finish-list item 24). */
export function nameLeadParts(b: NameBlock): Part[] {
  const month = longMonth(b.month)
  const c = b.counted
  if (!c) return [{ t: 'text', s: `Your name in the market you sell into, in ${month}: not counted yet.` }]
  const out: Part[] = [{ t: 'text', s: `In ${month} your name came up in ` }]
  out.push(c.k === 0 ? { t: 'text', s: 'none' } : { t: 'figure', value: c.k })
  out.push({ t: 'text', s: ' of the ' }, { t: 'figure', value: c.n }, { t: 'text', s: ' videos from the market you sell into.' })
  return out
}

/** "The 8 videos that name you are your own posts." Null where none does. */
export function nameOwnParts(b: NameBlock): Part[] | null {
  const c = b.counted
  if (!c || c.ownPosts === 0) return null
  return [
    { t: 'text', s: 'The ' }, { t: 'figure', value: c.ownPosts },
    { t: 'text', s: c.ownPosts === 1 ? ' video that names you is your own post.' : ' videos that name you are your own posts.' },
  ]
}

/** "One September comment named you, under one of your own posts." Null
 *  where no comment did. */
export function nameCommentsLine(b: NameBlock): string | null {
  const c = b.counted
  if (!c || c.ownPostComments === 0) return null
  const month = longMonth(b.month)
  const comments = c.ownPostComments === 1 ? `One ${month} comment` : `${fmtInt(c.ownPostComments)} ${month} comments`
  const posts = c.ownPostCommentPosts === 1 ? 'one of your own posts' : `${fmtInt(c.ownPostCommentPosts)} of your own posts`
  return `${comments} named you, under ${posts}.`
}

// ---- B1 · the brands in your market ------------------------------------------------

/** One brand's counts as the reads found them, before the hand check. */
export interface BrandMonthIn {
  brandKey: string
  label: string
  /** Does the mention layer hold any row of this brand? */
  hasRows: boolean
  /** The reading month: videos it came up in, in all and leaving out every
   *  video any of our rival searches found. Null where the month was not read. */
  curr: { kAny: number; kOrganic: number } | null
  /** The month before, in all. Null where it was not read. */
  prev: { kAny: number } | null
}

export interface TopicRow {
  brandKey: string
  label: string
  count: BrandCountState
  /** Printed only where the brand is counted. */
  kAny: number | null
  kOrganic: number | null
  prevK: number | null
}

export interface TopicsBlock {
  month: string
  prevMonth: string | null
  /** The market's videos: the reading month, the same leaving out every
   *  video any of our rival searches found (one base for every brand, the
   *  27 Sep ruling), and the month before. */
  n: number | null
  nOrganic: number | null
  prevN: number | null
  tracked: TopicRow[]
  /** Brands the market names that we do not search (MF3's operator list).
   *  Null where the tenant has no list, and then the column is not drawn. */
  watched: TopicRow[] | null
  /** The month pair on the brands view, in the chip's words, where both
   *  months print a figure and the pair is refused. */
  chip: string | null
  /** Where the counts came from: the month rows (MF3, deploy 4's step) or
   *  the mention layer read live. */
  read: 'stored' | 'live'
}

const ORDER: Record<BrandCountState, number> = { counted: 0, none: 1, noise: 2, not_yet: 3 }

function topicRow(clientId: string, b: BrandMonthIn, checks: typeof BRAND_HAND_CHECKS | undefined, layer: boolean): TopicRow {
  const measured = brandCountState(clientId, b.label, checks)
  // "none found" only where the mention layer was read and holds no match of
  // the brand this month, as Your market prints it (lib/pages/overview-market/
  // brands.ts); a brand production's list held no match of that has one now
  // is "not counted yet" until it is read by hand.
  const zero = !b.hasRows || (b.curr != null && b.curr.kAny === 0 && b.curr.kOrganic === 0)
  const count: BrandCountState =
    measured === 'counted' && (!b.hasRows || b.curr == null) ? 'not_yet'
      : measured === 'none' && !(layer && zero) ? 'not_yet'
        : measured
  const shown = count === 'counted'
  return {
    brandKey: b.brandKey,
    label: b.label,
    count,
    kAny: shown ? b.curr?.kAny ?? null : null,
    kOrganic: shown ? b.curr?.kOrganic ?? null : null,
    prevK: shown ? b.prev?.kAny ?? null : null,
  }
}

const byCount = (a: TopicRow, b: TopicRow): number =>
  ORDER[a.count] - ORDER[b.count]
  || (b.kOrganic ?? -1) - (a.kOrganic ?? -1)
  || (b.kAny ?? -1) - (a.kAny ?? -1)
  || a.label.localeCompare(b.label)

export function buildTopics(input: {
  clientId: string
  month: string
  prevMonth: string | null
  n: number | null
  nOrganic: number | null
  prevN: number | null
  tracked: readonly BrandMonthIn[]
  watched: readonly BrandMonthIn[] | null
  chip: string | null
  read: 'stored' | 'live'
  checks?: typeof BRAND_HAND_CHECKS
  /** Was the mention layer read (or the month rows)? See `topicRow`. */
  mentionsRead?: boolean
}): TopicsBlock {
  const layer = input.mentionsRead === true || input.read === 'stored'
  const tracked = input.tracked.map((b) => topicRow(input.clientId, b, input.checks, layer)).sort(byCount)
  const watched = input.watched ? input.watched.map((b) => topicRow(input.clientId, b, input.checks, layer)).sort(byCount) : null
  // THE CHIP SAYS WHY TWO PRINTED MONTHS ARE NOT READ AS A CHANGE; with no
  // brand printing both, there is nothing it would be about.
  const both = [...tracked, ...(watched ?? [])].some((r) => r.kAny != null && r.prevK != null)
  return {
    month: monthStartOf(input.month),
    prevMonth: input.prevMonth ? monthStartOf(input.prevMonth) : null,
    n: input.n,
    nOrganic: input.nOrganic,
    prevN: input.prevN,
    tracked,
    watched,
    chip: both ? input.chip : null,
    read: input.read,
  }
}

/** A row's words where it prints no count. */
export function topicWords(r: TopicRow): string | null {
  if (r.count === 'counted') return null
  if (r.count === 'none') return NONE_FOUND
  return r.count === 'noise' ? noiseWords(r.label) : NOT_COUNTED_YET
}

/** Does any row print a figure? No figure heads over a table that prints none. */
export const topicsCounted = (rows: readonly TopicRow[]): boolean => rows.some((r) => r.count === 'counted')

/** Does the month before print anywhere in these rows? */
export const prevPrinted = (rows: readonly TopicRow[]): boolean => rows.some((r) => r.prevK != null)

// ---- B2 · a brand in full, last 90 days --------------------------------------------

export interface FiledRow {
  audience: string
  label: string
  videos: number
  comments: number
  /** The page with this brand read in full (`?vs=`). */
  href: string
  selected: boolean
}

export interface InFullBlock {
  /** [from, to): ninety days ending at the reading month's last update. */
  window: { from: string; to: string }
  rows: FiledRow[]
  selected: {
    audience: string
    label: string
    videos: number
    /** Each kind the brand's videos carried, as counts (a rival's n never
     *  reaches a share's floor, research F33). */
    kinds: { kind: string; label: string; videos: number }[]
  } | null
}

/** The ninety days ending at `end` (an instant), as [from, to) days. */
export function ninetyDays(end: string): { from: string; to: string } {
  const to = new Date(Date.parse(end))
  // The window ends at the update: its day is the last one in it. A month's
  // end is midnight on the next month's first day, which is already the
  // half-open end.
  const midnight = to.getUTCHours() === 0 && to.getUTCMinutes() === 0 && to.getUTCSeconds() === 0 && to.getUTCMilliseconds() === 0
  const toDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + (midnight ? 0 : 1)))
  const fromDay = new Date(toDay.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  return { from: fromDay.toISOString().slice(0, 10), to: toDay.toISOString().slice(0, 10) }
}

export function buildInFull(input: {
  window: { from: string; to: string }
  rivals: readonly { name: string; audience: string }[]
  /** window_denominators, every audience. */
  denominators: readonly { audience: string; videos: number; comments: number }[]
  /** window_kind_readings, every audience. */
  kinds: readonly { audience: string; kind: string; videos: number }[]
  /** `?vs=`, as the URL carried it. */
  wanted: string | null
  hrefFor: (name: string) => string
}): InFullBlock {
  const byAudience = new Map(input.denominators.map((d) => [d.audience, d]))
  const rows = input.rivals
    .map((r) => ({ r, d: byAudience.get(r.audience) }))
    .filter((x): x is { r: { name: string; audience: string }; d: { audience: string; videos: number; comments: number } } => x.d != null && x.d.videos > 0)
    .map(({ r, d }) => ({ audience: r.audience, label: r.name, videos: d.videos, comments: d.comments, href: input.hrefFor(r.name), selected: false }))
    .sort((a, b) => b.videos - a.videos || b.comments - a.comments || a.label.localeCompare(b.label))
  const wanted = (input.wanted ?? '').trim().toLowerCase()
  const hit = wanted ? rows.findIndex((r) => r.label.toLowerCase() === wanted || r.audience.toLowerCase() === wanted) : -1
  const at = hit >= 0 ? hit : rows.length > 0 ? 0 : -1
  if (at >= 0) rows[at] = { ...rows[at], selected: true }
  const sel = at >= 0 ? rows[at] : null
  const kinds = sel
    ? input.kinds
        .filter((k) => k.audience === sel.audience && k.videos > 0 && k.kind !== FLAGGED_KIND)
        .map((k) => ({ kind: k.kind, label: marketKindLabel(k.kind), videos: k.videos }))
        .sort((a, b) => b.videos - a.videos || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    : []
  return {
    window: input.window,
    rows,
    selected: sel ? { audience: sel.audience, label: sel.label, videos: sel.videos, kinds } : null,
  }
}

// ---- B3 · asked under their content ------------------------------------------------

export interface AskedBlock {
  audience: string
  label: string
  window: { from: string; to: string }
  /** Videos of this brand's carrying a question over the window. */
  videos: number
  /** The same, month by month, for the months whole inside the window and the
   *  reading month; a month with none is left out. */
  byMonth: { month: string; videos: number }[]
  /** Question themes under the brand's content, by videos. */
  themes: { registryId: string; label: string; videos: number }[]
  /** Every theme is listed (`?asked=all`); else the first `ASKED_SHOWN`. */
  all: boolean
  /** Themes left off the list. */
  more: number
}

export function buildAsked(input: {
  rival: { name: string; audience: string } | null
  window: { from: string; to: string }
  month: string
  questionVideos: number | null
  months: readonly { month: string; videos: number }[]
  themes: readonly { registryId: string; label: string; videos: number }[]
  all: boolean
}): AskedBlock | null {
  if (!input.rival || input.questionVideos == null) return null
  const reading = monthStartOf(input.month)
  const byMonth = input.months
    .map((m) => ({ month: monthStartOf(m.month), videos: m.videos }))
    .filter((m) => m.videos > 0 && m.month <= reading && (m.month >= input.window.from || m.month === reading))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  const sorted = [...input.themes].filter((t) => t.videos > 0).sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
  const shown = input.all ? sorted : sorted.slice(0, ASKED_SHOWN)
  return {
    audience: input.rival.audience,
    label: input.rival.name,
    window: input.window,
    videos: input.questionVideos,
    byMonth,
    themes: shown,
    all: input.all,
    more: sorted.length - shown.length,
  }
}

/** "13 in August · 8 in September". */
export function askedMonthsLine(a: AskedBlock): Part[] {
  const out: Part[] = []
  a.byMonth.forEach((m, i) => {
    if (i > 0) out.push({ t: 'text', s: ' · ' })
    out.push({ t: 'figure', value: m.videos }, { t: 'text', s: ` in ${longMonth(m.month)}` })
  })
  return out
}

// ---- B4 · where a rival's talk differs (CO6) ----------------------------------------

/** Pass C's categories, in the page's words (the preview's two, and the rest
 *  said the same plain way). */
export const FINDING_KIND_WORDS: Readonly<Record<string, string>> = {
  sentiment_differential: 'how the talk differs',
  notable_account: 'an account shaping the talk',
  topic_ownership: 'a topic it holds',
  content_gap: 'where the content differs',
  competitive_threat: 'where it stands out',
  engagement_benchmark: 'how its videos are met',
}

export const findingKindWords = (category: string): string =>
  FINDING_KIND_WORDS[category] ?? category.replace(/_/g, ' ')

/** One finding, anchored on the month readings (S14): its lead theme is a
 *  registry id, so its months and its quote are read from
 *  `month_evidence_refs`, which outlive the insight ids the finding cites. */
export interface FindingCard {
  id: string
  category: string
  kindWords: string
  /** Model prose, stored (`pass_c_finding`). */
  title: string
  quote: Quote | null
  /** "seen in {months} of the last {of} months", where the lead theme was
   *  read. Null where nothing anchors it. */
  seen: { months: number; of: number } | null
}

export interface FindingGroup {
  rival: string
  findings: FindingCard[]
}

export interface FindingsBlock {
  groups: FindingGroup[]
  /** Tracked brands in B2 with no finding and fewer than the floor's videos
   *  in the ninety days (Pass C compares no bucket under
   *  `COMPETITIVE_MIN_VIDEOS`). */
  thin: string[]
  floor: number
}

/** The lead theme of a finding: the registry id its cited insights fall in
 *  most, preferring the rival's own audience, where the talk it describes
 *  sits. Ties by registry id, so the answer does not depend on read order. */
export function leadTheme(
  cited: ReadonlySet<string>,
  observations: readonly { themeId: string; bucket: string; members: readonly string[] }[],
  rivalAudience: string,
): { registryId: string; audience: string } | null {
  const scored = observations
    .map((o) => ({ o, hits: o.members.filter((m) => cited.has(m)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) =>
      Number(b.o.bucket === rivalAudience) - Number(a.o.bucket === rivalAudience)
      || b.hits - a.hits
      || a.o.themeId.localeCompare(b.o.themeId))
  const top = scored[0]
  return top ? { registryId: top.o.themeId, audience: top.o.bucket } : null
}

/** The months a recurrence looks back over, oldest first: `RECURRENCE_MONTHS`
 *  ending with the reading month, none before the tenant's first month. */
export function recurrenceMonths(month: string, firstMonth: string | null, span: number = RECURRENCE_MONTHS): string[] {
  const out: string[] = []
  let m = monthStartOf(month)
  const first = firstMonth ? monthStartOf(firstMonth) : null
  for (let i = 0; i < span; i++) {
    if (first && m < first) break
    out.unshift(m)
    m = prevMonth(m)
  }
  return out
}

export function seenLine(s: { months: number; of: number }): string {
  return `seen in ${fmtInt(s.months)} of the last ${fmtInt(s.of)} ${s.of === 1 ? 'month' : 'months'}`
}

/** A group's cards: the update's own weight first (Pass C's impact), then how
 *  the talk differs before who shapes it (the preview's order), then as read. */
const IMPACT: Readonly<Record<string, number>> = { high: 0, medium: 1, low: 2 }
const KIND_RANK = Object.keys(FINDING_KIND_WORDS)

export function buildFindings(input: {
  /** Tracked brands in B2's order. */
  rivals: readonly string[]
  findings: readonly { id: string; rival: string; category: string; title: string; quote: Quote | null; seen: { months: number; of: number } | null; impact?: string | null }[]
  /** Each tracked brand's videos in the ninety days (B2's count). */
  videos: ReadonlyMap<string, number>
  floor: number
}): FindingsBlock {
  const norm = (s: string) => s.trim().toLowerCase()
  const groups: FindingGroup[] = []
  for (const rival of input.rivals) {
    const rank = (c: string) => { const i = KIND_RANK.indexOf(c); return i < 0 ? KIND_RANK.length : i }
    const mine = input.findings
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => norm(f.rival) === norm(rival))
      .sort((a, b) => (IMPACT[a.f.impact ?? ''] ?? 3) - (IMPACT[b.f.impact ?? ''] ?? 3) || rank(a.f.category) - rank(b.f.category) || a.i - b.i)
      .map(({ f }) => f)
    if (mine.length === 0) continue
    groups.push({
      rival,
      findings: mine.map((f) => ({ id: f.id, category: f.category, kindWords: findingKindWords(f.category), title: f.title, quote: f.quote, seen: f.seen })),
    })
  }
  const grouped = new Set(groups.map((g) => norm(g.rival)))
  const thin = input.rivals.filter((r) => !grouped.has(norm(r)) && (input.videos.get(r) ?? 0) < input.floor)
  return { groups, thin, floor: input.floor }
}

/** "Freitag, The North Face and Patagonia have fewer than 10 videos in the
 *  last 90 days, too few to set against the category." (plan §2.5 B4, IO
 *  F35: "the others have fewer than 10 analysed videos"). */
export function thinLine(b: FindingsBlock): string | null {
  if (b.thin.length === 0) return null
  const names = b.thin.length === 1 ? b.thin[0] : `${b.thin.slice(0, -1).join(', ')} and ${b.thin[b.thin.length - 1]}`
  return `${names} ${b.thin.length === 1 ? 'has' : 'have'} fewer than ${fmtInt(b.floor)} videos in the last ${WINDOW_DAYS} days, too few to set against the category.`
}

// ---- B5 · what they post and say about themselves ----------------------------------

export interface PostsBlock {
  month: string
  /** Each tracked brand's own posts published in the month, most first. */
  rows: { audience: string; label: string; posts: number }[]
  /** Each brand's claim carried by the most of its month's posts, in the
   *  words the claims read wrote (stored `pass_a_brand_claim`), as plain
   *  text, never set as a quote. */
  claims: { audience: string; label: string; id: string; claim: string; posts: { k: number; n: number } }[]
}

export function buildPosts(input: { month: string; censuses: readonly OwnPostCensus[] }): PostsBlock {
  const rows = input.censuses
    .filter((c) => c.unread == null && c.published.k > 0)
    .map((c) => ({ audience: c.audience, label: c.audienceLabel, posts: c.published.k }))
    .sort((a, b) => b.posts - a.posts || a.label.localeCompare(b.label))
  const order = new Map(rows.map((r, i) => [r.audience, i]))
  const claims = input.censuses
    .filter((c) => c.claims.length > 0 && order.has(c.audience))
    .map((c) => {
      const top = [...c.claims].sort(topClaim)[0] as OwnClaimRow
      return { audience: c.audience, label: c.audienceLabel, id: top.id, claim: top.claim, posts: top.posts }
    })
    .sort((a, b) => (order.get(a.audience) ?? 0) - (order.get(b.audience) ?? 0))
  return { month: monthStartOf(input.month), rows, claims }
}

/** The claim most of the month's posts carried; ties to the earliest said,
 *  then its id. */
const topClaim = (a: OwnClaimRow, b: OwnClaimRow): number =>
  b.posts.k - a.posts.k
  || (a.postedOn ?? '9999').localeCompare(b.postedOn ?? '9999')
  || a.id.localeCompare(b.id)

// ---- B6 · how the market makes content ---------------------------------------------

export interface ContentBlock {
  month: string
  /** The category's videos posted in the month with a format read, and all
   *  of them. */
  read: number
  published: number
  formats: { key: string; label: string; k: number; n: number }[]
  openings: { key: string; label: string; k: number; n: number }[]
}

const categoryRows = (m: FormatMatrix, audience: string): { key: string; label: string; k: number; n: number }[] => {
  const side = m.sides.find((s) => s.audience === audience)
  if (!side || side.unread) return []
  return m.keys
    .map((k) => side.byKey[k.key])
    .filter((r): r is FormatRow => r != null && r.value.k > 0)
    .sort((a, b) => b.value.k - a.value.k || a.label.localeCompare(b.label))
    .slice(0, CONTENT_ROWS)
    .map((r) => ({ key: r.key, label: r.label, k: r.value.k, n: r.value.n }))
}

/** The category's side of the playbook: the market's formats and openings,
 *  never your own or a rival's column beside it. */
export function buildContent(input: { month: string; formats: FormatMatrix; hooks: FormatMatrix; audience: string }): ContentBlock | null {
  const side = input.formats.sides.find((s) => s.audience === input.audience)
  if (!side) return null
  return {
    month: monthStartOf(input.month),
    read: side.of,
    published: side.published,
    formats: categoryRows(input.formats, input.audience),
    openings: categoryRows(input.hooks, input.audience),
  }
}

// ---- B7 · share of what our searches found ----------------------------------------

export interface ShareBlock {
  month: string
  /** Each tracked brand's videos on the month's panel, of the panel's videos.
   *  Null where the month has no panel reading. */
  rows: { audience: string; label: string; k: number; n: number }[] | null
  /** The update the first panel freezes with, where none exists yet and an
   *  update is coming. */
  startsWith: string | null
}

export function buildShare(input: {
  month: string
  /** month_audience_stats rows of the month with a panel reading (every
   *  audience: the panel's n is theirs together). */
  stats: readonly { audience: string; panelVideos: number }[] | null
  rivals: readonly { name: string; audience: string }[]
  startsWith: string | null
}): ShareBlock {
  const month = monthStartOf(input.month)
  if (!input.stats || input.stats.length === 0) return { month, rows: null, startsWith: input.startsWith }
  const n = input.stats.reduce((s, r) => s + r.panelVideos, 0)
  const rows = input.rivals
    .map((r) => ({ audience: r.audience, label: r.name, k: input.stats?.find((s) => s.audience === r.audience)?.panelVideos ?? 0, n }))
    .filter((r) => r.k > 0)
    .sort((a, b) => b.k - a.k || a.label.localeCompare(b.label))
  return { month, rows: n > 0 ? rows : null, startsWith: null }
}

export const SHARE_ANSWER = 'Each brand’s share of the videos our searches found.'

export function shareWaiting(b: ShareBlock): string {
  if (b.startsWith) return `Starts with the ${shortDate(b.startsWith)} update`
  return `Not read for ${longMonth(b.month)}.`
}

// ---- the page ------------------------------------------------------------------------

export interface BrandsPageData {
  month: string
  prevMonth: string | null
  /** Null for a tenant with no brand rule switched on (Össur). */
  name: NameBlock | null
  topics: TopicsBlock | null
  inFull: InFullBlock
  asked: AskedBlock | null
  findings: FindingsBlock
  posts: PostsBlock
  content: ContentBlock | null
  share: ShareBlock
}

/** A level's words: "8 of 21" under 100, a share at or over it. */
export function levelWords(k: number, n: number): string {
  return levelText(k, n)?.text ?? fmtInt(k)
}

/** The month the page reads, and the next one's first day: the `to` of the
 *  reading month's window. */
export const monthSpan = (month: string): { from: string; to: string } => ({ from: monthStartOf(month), to: nextMonth(monthStartOf(month)) })
