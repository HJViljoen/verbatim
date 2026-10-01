import { brandCountState, BRAND_HAND_CHECKS, NAME_READS, nameChecked, nameNoMatch, noiseWords, NONE_FOUND, NOT_COUNTED_YET, type BrandCountState } from '../../brands/precision'
import { longMonth, shortDate } from '../../format'
import { monthStartOf } from '../../reading/month-key'

// "Brands in your market" (market-first WP1.6, plan §2.2 block 9).
//
// ONE LINE AT DEPLOY 2. Brands counted in every video they come up in (the
// mention layer, WP2.6) arrive with deploy 3 and are first read with the
// 4 Oct update; until then the block says so, and points at Competitive,
// which lists what was filed under each brand the client tracks. The name
// line and brand topics replace it at deploy 3 (`buildBrandsBlock`, below);
// the one line stays for a page stored before them and for a tenant with no
// brand rules (Össur).
//
// THE DATE IS A PROMISE, SO IT EXPIRES. The line names the 4 Oct update only
// while that update is still ahead of the page's "as at"; after it, a page
// still on this code says "a coming update" rather than a date that has
// passed (a copy claim must match what the code does).
//
// PURE.

/** The update the mention layer is first read with (plan §3.7: deploy 3 on
 *  Mon 5 Oct, brand-mentions applied that morning on the 4 Oct run). */
export const BRANDS_ARRIVE_WITH = '2026-10-04T04:00:00.000Z'

/** Deploy 2's one line. */
export interface BrandsArriving {
  /** `arriving`: an update ahead reads them. `paused`: the tenant's updates
   *  are paused, so no update is promised. */
  state: 'arriving' | 'paused'
  /** The update the brand counts arrive with, or null once that date has
   *  passed at the page's "as at". */
  arrivesWith: string | null
}

/** The block: deploy 2's one line, or deploy 3's name line and topics. */
export type BrandsBlock = BrandsArriving | BrandsRead

/** Is it deploy 3's form? A block stored before WP2.6 is the one line. */
export const isBrandsRead = (b: BrandsBlock | null | undefined): b is BrandsRead => b?.state === 'read'

/** The block, as at the last update (never the wall clock). */
export function brandsBlockFor(asAt: string | null, opts: { paused?: boolean; arrives?: string } = {}): BrandsArriving {
  if (opts.paused) return { state: 'paused', arrivesWith: null }
  const arrives = opts.arrives ?? BRANDS_ARRIVE_WITH
  const at = asAt ? Date.parse(asAt) : Number.NaN
  const ahead = Number.isNaN(at) || at < Date.parse(arrives)
  return { state: 'arriving', arrivesWith: ahead ? arrives : null }
}

/** The one line, naming the Competitive page by its current sidebar label.
 *  Paused, no update is coming, so the pointer has no "until then" to lean
 *  on (deploy 2 review): it says what Competitive lists, plainly. */
export function brandsLine(b: BrandsArriving, competitiveLabel: string): string {
  const until = `Until then, ${competitiveLabel} lists what was filed under each brand you track.`
  if (b.state === 'paused') return `Brands in your market, counted in every video they come up in, are not read for this workspace yet. ${competitiveLabel} lists what was filed under each brand you track.`
  const when = b.arrivesWith ? `the ${shortDate(b.arrivesWith)} update` : 'a coming update'
  return `Brands in your market, counted in every video they come up in, arrive with ${when}. ${until}`
}

// ---- Deploy 3: the name line and brand topics (WP2.6) -----------------------------

/**
 * BRANDS COUNTED IN EVERY VIDEO THEY COME UP IN (decision E; plan WP2.6). A
 * brand comes up in a market video when the video's content names it, or a
 * comment dated in the month does (`brand_mentions`, MF2, written by
 * scripts/brand-mentions.ts), and it is never counted in its own posts. Counts
 * are videos, not mentions, each "of" the market's videos that month.
 *
 * TWO COUNTS A BRAND (§2.2's print): the headline count leaves out EVERY
 * video ANY of our rival searches found, so all brands share one base, one
 * denominator (decision E, the research's F37, the lead's ruling of 27 Sep:
 * lib/brands/rival-searches.ts); in all, over the market, beside it. The
 * table's column heads carry the two bases.
 *
 * NEVER A 0 FOR A BRAND NOBODY COUNTED (the lead's defaults of 26 and 27 Sep):
 * a brand prints its counts only where production's hand check measured its
 * precision at the floor and the mention layer holds a row of it; otherwise
 * "not counted yet"; measured under the floor, "mostly {another word} · not
 * counted" (lib/brands/precision.ts). A research or staging sample counts no
 * brand.
 *
 * "NONE FOUND" (the lead's ruling of 27 Sep, fast track): a brand production's
 * hand-check list held no match of (`matches: 'none'`) prints "none found"
 * for a month in which the mention layer, read, holds no match of it either:
 * the rule found nothing in the month's market, a real zero by the rule. A
 * match that turns up after the check (a later gather) has passed no hand
 * check, so that month prints "not counted yet"; and a mention layer that
 * could not be read finds nothing, so it prints no "none found" either.
 *
 * THE NAME LINE FIRST (heinrich-fidelity must-fix 2): "In September your name
 * came up in none of your market's 654 videos. The 8 videos that name you are
 * your own posts." It prints only once production's hand check holds the
 * client's own name and every match of it outside its own posts has been read
 * by hand on production, and says the count the reading found; else "not
 * counted yet" (plan WP2.6's done-when; §3.7 step 9).
 *
 * THE 90-DAY NOTE IS HOW TO READ'S (S17; 25 Sep rulings): it rides on the
 * block for Settings › How to read and is never printed under it.
 */

/** The table's column heads, each over its own base (a column head carries
 *  its base, §1 B ruling 3): the headline count says exactly what it leaves
 *  out, every video any of our rival searches found, so every brand's count
 *  sits over the one base printed under it (the 27 Sep ruling). */
//
// FINISH-LIST ITEM 20 (29 Sep): the headline head read "Without any video our
// rival searches found", which did not parse; the same base, said plainly.
//
// T0 RULING U10 (30 Sep): in market terms, and the only count a brand prints.
// "In all" counted the videos our own brand searches fetched, so it is never
// printed; the constant stays for a stored copy's figure labels only. Not the
// ruling's example "Brought up unprompted": "up" is a direction word, and the
// copy contract admits one only inside a verdict node.
export const BRANDS_HEAD_ORGANIC = 'Named unprompted'
export const BRANDS_HEAD_ALL = 'In all'

/** The headline column's base, where the block read one. */
export const organicBase = (b: BrandsRead): number | null => b.topics[0]?.nOrganic ?? null

/** S17's line: How to read's text, never a footnote under the block. */
export const NINETY_DAY_NOTE = 'Ninety-day counts read today’s tags; frozen months keep the tags they froze with.'

/** One brand in the market this month. */
export interface BrandTopic {
  /** `competitors.id` (a rename does not split it). */
  brandKey: string
  label: string
  /** Videos it came up in, in all and leaving out every video any of our
   *  rival searches found; null where it is not counted. */
  kAny: number | null
  kOrganic: number | null
  /** The market's videos this month. */
  n: number
  /** The market's videos leaving out every video any of our rival searches
   *  found: one base, the same for every brand in the block. Null in a block
   *  built before the 27 Sep ruling, which read no such base. */
  nOrganic: number | null
  /** Measured under the precision floor: "mostly … not counted". */
  noise: boolean
  /** Additive: counted, none found, mostly another word, or not counted
   *  yet. */
  count?: BrandCountState
}

/** Deploy 3's form (§4.2's `BrandsBlock`, with `state` to tell it from the
 *  one line). */
export interface BrandsRead {
  state: 'read'
  /** The month read ('YYYY-MM-01'). */
  window: string
  /** Null: not counted yet (a match of your name nobody has read, or no row). */
  nameLine: { month: string; n: number; k: number; ownPosts: number } | null
  topics: BrandTopic[]
  ninetyDayNote: string
}

/** What the loader counted for one tracked rival this month. */
export interface BrandCountIn {
  brandKey: string
  label: string
  /** Does the mention layer hold any row of this brand (any month)? */
  hasRows: boolean
  kAny: number
  kOrganic: number
}

/** What the loader counted for the client's own name this month. */
export interface NameCountIn {
  /** Does the mention layer hold any row of the client's name? */
  hasRows: boolean
  /** The market's videos naming the client this month, its own posts out. */
  outside: readonly string[]
  /** The client's own posts that name it, dated in the month. */
  ownPosts: number
}

const ORDER: Record<BrandCountState, number> = { counted: 0, none: 1, noise: 2, not_yet: 3 }

export function buildBrandsBlock(input: {
  clientId: string
  month: string
  /** The market's videos this month. */
  n: number
  /** The market's videos no rival search of ours found: every brand's
   *  headline base. */
  nOrganic: number
  rivals: readonly BrandCountIn[]
  name: NameCountIn
  checks?: typeof BRAND_HAND_CHECKS
  nameReads?: typeof NAME_READS
  /** Was the mention layer read (`brand_mentions`)? Only then is a month
   *  with no match of a brand a zero by the rule ("none found"); a layer that
   *  could not be read (MF2 missing) finds nothing and proves nothing. */
  mentionsRead?: boolean
}): BrandsRead {
  const month = monthStartOf(input.month)
  const layer = input.mentionsRead === true
  const topics: BrandTopic[] = input.rivals.map((r) => {
    const measured = brandCountState(input.clientId, r.label, input.checks)
    const count: BrandCountState =
      measured === 'counted' && !r.hasRows ? 'not_yet'
        : measured === 'none' && !(layer && r.kAny === 0 && r.kOrganic === 0) ? 'not_yet'
          : measured
    return {
      brandKey: r.brandKey,
      label: r.label,
      kAny: count === 'counted' ? r.kAny : null,
      kOrganic: count === 'counted' ? r.kOrganic : null,
      n: input.n,
      nOrganic: input.nOrganic,
      noise: count === 'noise',
      count,
    }
  })
  topics.sort((a, b) =>
    ORDER[a.count ?? 'not_yet'] - ORDER[b.count ?? 'not_yet']
    || (b.kOrganic ?? -1) - (a.kOrganic ?? -1)
    || (b.kAny ?? -1) - (a.kAny ?? -1)
    || a.label.localeCompare(b.label))

  // The name line: the name checked on production, and every match outside
  // its own posts read by hand there. Where production's list held no match
  // of the name at all (`matches: 'none'`), a mention layer that was read and
  // holds no row of it is that same zero, so the line prints "none".
  const reads = (input.nameReads ?? NAME_READS)[input.clientId] ?? []
  const read = new Map(reads.filter((r) => r.where === 'production' && monthStartOf(r.month) === month).map((r) => [r.videoId, r.brand]))
  const unread = input.name.outside.filter((id) => !read.has(id))
  const rows = input.name.hasRows || (layer && nameNoMatch(input.clientId, input.checks))
  const nameLine = rows && nameChecked(input.clientId, input.checks) && unread.length === 0
    ? { month, n: input.n, k: input.name.outside.filter((id) => read.get(id) === true).length, ownPosts: input.name.ownPosts }
    : null
  return { state: 'read', window: month, nameLine, topics, ninetyDayNote: NINETY_DAY_NOTE }
}

/** The name line's words, as parts: figures apart from words, so each is its
 *  own node. "In September your name came up in none of your market’s 654
 *  videos. The 8 videos that name you are your own posts."
 *
 *  `wider` (the front page, finish-list item 24) says "of the 654 videos from
 *  the market you sell into", as the Brands page does: "your market’s" read as
 *  a client's own customers. The monthly passes nothing and prints as it did. */
export function nameLineParts(b: BrandsRead, opts: { wider?: boolean } = {}): ({ t: 'text'; s: string } | { t: 'figure'; value: number })[] {
  const l = b.nameLine
  const month = longMonth(b.window)
  if (!l) return [{ t: 'text', s: opts.wider ? `Your name in the market you sell into, in ${month}: not counted yet.` : `Your name in your market in ${month}: not counted yet.` }]
  const parts: ({ t: 'text'; s: string } | { t: 'figure'; value: number })[] = [{ t: 'text', s: `In ${month} your name came up in ` }]
  if (l.k === 0) parts.push({ t: 'text', s: 'none' })
  else parts.push({ t: 'figure', value: l.k })
  // Wide (the front page) says "of the 852 videos from the market you sell
  // into"; the monthly keeps "of your market’s 852 videos". The closing words
  // stay one text node, as the monthly email draws them (reports are on hold).
  const videos = opts.wider ? ' videos from the market you sell into' : ' videos'
  if (opts.wider) parts.push({ t: 'text', s: ' of the ' }, { t: 'figure', value: l.n })
  else parts.push({ t: 'text', s: ' of your market’s ' }, { t: 'figure', value: l.n })
  // "The 9 videos that name you are your own posts" was written for the none
  // case; beside "1 of 852" it read as a contradiction (finish-list item 20).
  if (l.ownPosts > 0 && l.k > 0) {
    parts.push({ t: 'text', s: `${videos}, and in ` }, { t: 'figure', value: l.ownPosts },
      { t: 'text', s: ' of your own posts.' })
    return parts
  }
  parts.push({ t: 'text', s: `${videos}.` })
  if (l.ownPosts > 0) {
    parts.push({ t: 'text', s: ' The ' }, { t: 'figure', value: l.ownPosts },
      { t: 'text', s: l.ownPosts === 1 ? ' video that names you is your own post.' : ' videos that name you are your own posts.' })
  }
  return parts
}

/** A topic's words where it prints no count: "none found" where
 *  production's list held no match of it and the month holds none, "mostly
 *  … not counted", or "not counted yet". */
export function topicNote(t: BrandTopic): string | null {
  if (t.count === 'counted' || (t.count == null && !t.noise && t.kAny != null)) return null
  if (t.count === 'none') return NONE_FOUND
  return t.noise ? noiseWords(t.label) : NOT_COUNTED_YET
}

/** Does the block print a reading of any brand: one counted, one "none
 *  found", or your name's line? A block whose every line is "not counted
 *  yet" (or "mostly … not counted") holds none, and the monthly sends no
 *  brands section without one (the lead's ruling of 27 Sep;
 *  lib/reports/monthly-slots.ts). */
export function brandsHoldAReading(b: BrandsRead): boolean {
  return b.nameLine != null || b.topics.some((t) => topicNote(t) == null || t.count === 'none')
}
