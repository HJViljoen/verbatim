import type { SupabaseClient } from '@supabase/supabase-js'

import { canManageTenant, type Role } from '../../roles'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../../chunk'
import { productReadingsEnabled } from '../../config'
import { citationLink } from '../../evidence-cite'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { surface } from '../../nav'
import { PRODUCTS_HREF, productsHref, type OpenKind, type ProductsParams } from './products-address'
import { PRODUCT_MODEL_RULE_VERSION } from '../../products/classify'
import { contentKey, standingPlacements, type PlacedRow, type StandingText, type TextKey } from '../../products/match'
import { PRODUCT_RULE_VERSION } from '../../products/rules'
import { tagOptions, type TagOption } from '../../products/tags'
import {
  isMissingProductsSchema, loadMonthProductReadings, loadProductCatalogue, PRODUCT_TAG_COLUMNS, standingTags,
  TABLE_PRODUCT_MENTIONS, TABLE_PRODUCT_TAGS,
  type CatalogueRead, type ProductCatalogue, type ProductTagRow,
} from '../../products/types'
import { marketProductMonth, type PooledProductMonth, type ProductMonthRow } from '../../products/market-month'
import { readProductMonthVideos } from '../../products/readings'
import { readQuoteContext, gateFor } from '../../quote-context'
import { quoteGate, type GateInput, type QuoteVideo } from '../../quote-gate'
import { readingOf, readTranslations } from '../../quotes'
import { loadCompanyName, type LensRowIn } from '../../reading/cross'
import { KIND_LABELS, kindLabel } from '../../reading/kinds'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import { loadPairOn, type ReadingHandle } from '../../reading/read'
import { BRANDS_PANEL, type PairOn } from '../../reading/pairs'
import { monthChange } from '../../reading/bands'
import { loadReadingMonth } from '../../reading/reading-view'
import { readingMonthLabel } from '../../reading/month-label'
import { bandVerdict, type Verdict } from '../../reading/verdicts'
import { productsTabHref } from '../../settings/products'
import { selectAll } from '../../supabase-admin'
import { subjectCalibration, type SubjectCalibration } from '../../subjects/calibration-state'
import { loadActiveSubjects } from '../../subjects/membership'

// YOUR PRODUCTS (depth v2, T5; boards E4-Products and E4-Products-Liners):
// what the market says about what the client sells, by the client's own
// catalogue (Settings › Your products, T10b) as the products step placed its
// talk (T11, `month_product_readings` and `product_mentions`).
//
// THE PAGE, TOP TO BOTTOM:
//   1. the bar: the month, how many of the catalogue's products came up and
//      the videos about them or their categories;
//   2. the board's four STANDOUT places, always drawn (`standoutSlots`): each
//      a card picked by code from the month's counts and crosses, else the
//      month's nearest honest card worded for what it is, else the place's
//      empty frame; each opening its product's or category's panel. No model
//      prose, no quote and no weekly direction word at level 1 (Heinrich's v2
//      rules; decision 1); every comparison a card makes is a `Verdict`;
//   3. THE SHELF: every category a column, every product a tile shaded by its
//      videos this month (`CatalogueShelf`);
//   4. the open panel, in place under the shelf (`?group=` a category,
//      `?product=` a product): the split, what it is about, the month line,
//      the products against their category, and the talk we could not place
//      under one product, each line with its Tag control (owners and admins).
//      Quotes print here and nowhere above.
//
// THE BASIS (the lead's ruling, 13 Oct): EVERY video of the month, every
// audience pooled, the client's included (`marketProductMonth`,
// lib/products/market-month.ts; the month's videos are `product_month_videos`).
// A creator's video that names the client is where talk about its products
// lives, and the comments under the client's own posts are the market's; what
// the client's own posts SAY (caption, hashtags, voice, on-screen text) never
// places anything (lib/products/readings.ts `contentFields`). Settings › Your
// products counts "this month" through the same function, so the two surfaces
// never disagree. The page says so once, in plain words (`productsBasis`).
//
// THE MAIN READ IS `k_any`. The board shows no "named unprompted" figure, so
// none is built: the organic columns (`k_organic`, `n_organic`) are left for
// the day Heinrich rules on the organic base (Össur's own searches include
// catalogue words, t12-handcheck.md decision 1).
//
// FOUR HONEST STATES BEFORE ANY COUNT: the migration is not applied
// (`not_applied`, production today), the client has no catalogue
// (`no_catalogue`, Sealand), the products step is not switched on for the
// tenant (`not_on`, PRODUCT_READINGS_ENABLED, every tenant today), and the
// month has not been read (`unread`). Each says so and links to Settings, in
// the board's frame (the parity pass, 13 Oct night): the four places empty,
// and the catalogue card over the catalogue itself where there is one.
//
// PURE HALF FIRST (every builder is tested over fixtures), THEN THE READS.

// ---- the address -------------------------------------------------------------------

export { PANEL_ID, parseProductsParams, PRODUCTS_HREF, productsHref, UNCLEAR_ID, type OpenKind, type ProductsParams } from './products-address'

/** Where a question to the Agent goes, prefilled. */
export function askHref(question: string): string {
  return `${surface('ask').href}?ask=${encodeURIComponent(question.slice(0, 300))}`
}

// ---- the words -------------------------------------------------------------------------

/** The basis, said once (the catalogue card's line). */
/** The basis, said once (the catalogue card's line), true to the code: every
 *  video of the month (`product_month_videos`, every audience), and never an
 *  own post's own words (`contentFields`). */
export function productsBasis(client: string): string {
  const who = client && client !== 'You' ? client : 'you'
  return `Counted on every video in your market, including creators’ videos about ${who} and the comments on your own posts. What your own posts say (captions, hashtags, voice-over, on-screen text) is never counted.`
}

/** The not-applied state (production today): the tables are not there. */
export const PRODUCTS_NOT_APPLIED = 'Your products are not switched on for this workspace yet.'
/** No catalogue (Sealand today). */
export const PRODUCTS_NO_CATALOGUE = 'Add the products you sell, and the names people use for them, and this page can show what your market says about each one.'
/** The switch is off for the tenant. */
export const PRODUCTS_NOT_ON = 'We have your product list. Reading what your market says about it is not switched on for this workspace yet.'
/** The month holds no product row. */
export const productsUnread = (month: string): string => `Your products have not been read for ${longMonth(month)} yet. They are read with each update.`
/** A read failed. */
export const PRODUCTS_FAILED = 'Your products could not be read just now. Refresh the page.'

/** The words for a product with no video this month. */
export const QUIET = 'Quiet'

// ---- the shapes --------------------------------------------------------------------

export type ProductsState = 'not_applied' | 'no_catalogue' | 'not_on' | 'unread' | 'failed' | 'ready'

/** k of n videos. */
export interface Level {
  k: number
  n: number
}

/** One subject or kind among a set of videos: k of the set's n. */
export interface CrossCell {
  id: string
  label: string
  k: number
}

/** What a set of videos is about: its subjects and its kinds, out of `n`.
 *  `null` where the cross was not read (a failed read, a shot from a dump). */
export interface Crosses {
  n: number
  /** The READY subjects only (ruling U6, `printsMarket`): a subject whose
   *  check has not passed has no count here, no rank and no share. */
  subjects: CrossCell[]
  kinds: CrossCell[]
  /** The client's subjects whose check has not passed (provisional), by name
   *  in their own order, with no count: the page prints the name and
   *  SUBJECT_NOT_MEASURED (lib/subjects/calibration-state.ts). A failed one is left out (no name, no figure).
   *  Absent: every subject read is ready. */
  pending?: { id: string; label: string }[]
}

/** A subject as the crosses read it: its name and its check's state. */
export interface SubjectRead {
  name: string
  state: SubjectCalibration
}

export interface ShelfProductView {
  id: string
  name: string
  /** Its videos this month (`k_named`, pooled over every audience); null
   *  where the month holds no row for it (not read yet: added to the list
   *  after the month was last read), never a zero. */
  videos: number | null
  href: string
  /** Its first month with videos: a `new` flag's verdict, else null. */
  flag: Verdict | null
}

export interface ShelfCategoryView {
  id: string
  name: string
  /** Videos about the category this month (`k_any`); null where the month
   *  holds no row for it (not read yet). */
  videos: number | null
  /** `k_any` of the market's videos. Null where the month holds no market. */
  share: Level | null
  /** This month's share against last month's, banded. Null where no
   *  comparison is drawn at all. */
  verdict: Verdict | null
  /** What most of its videos are about (the top READY subject), where read. */
  lead: { label: string; k: number } | null
  /** Some of the client's subjects are not measured yet (`Crosses.pending`):
   *  with no ready one, the head says SUBJECT_NOT_MEASURED. */
  subjectsPending: boolean
  /** The lead leads (`topRanked`): strictly ahead of every other subject,
   *  none pending. Otherwise the head prints its level without "leads". */
  leads: boolean
  /** Videos about one of the client's products here, not which. */
  unclear: number
  products: ShelfProductView[]
  href: string
  unclearHref: string
  selected: boolean
}

export type StandoutKind = 'first' | 'gap' | 'general' | 'praised' | 'focus'

interface StandoutBase {
  kind: StandoutKind
  /** The object the card opens. */
  open: { kind: OpenKind; id: string }
  href: string
  /** The product's or the category's name. */
  name: string
  /** The category it is in (a category: itself). */
  where: string
}

/** A product's first month with videos. */
export interface FirstStandout extends StandoutBase {
  kind: 'first'
  videos: number
  /** The months read before it, oldest first, each with its videos (zero),
   *  then this month. */
  months: { month: string; k: number }[]
  flag: Verdict
  /** What most of its videos are about, where read. */
  lead: { label: string; k: number; n: number } | null
  /** The first card's place only (`standoutSlots`, tier `next`): the other
   *  products whose first month with videos this also is, at most three. */
  others?: { name: string; href: string }[]
}

/** A subject a category's talk carries far more, or less, than one of the
 *  client's products in it: banded, shown only where the band clears. */
export interface GapStandout extends StandoutBase {
  kind: 'gap'
  subject: string
  category: Level
  product: Level & { name: string }
  verdict: Verdict
}

/** Most of a category's talk names none of the client's products. A split of
 *  one month's videos, not a comparison. */
export interface GeneralStandout extends StandoutBase {
  kind: 'general'
  inGeneral: Level
  yours: Level
}

/** The product (else category) praised in the most of its videos. */
export interface PraisedStandout extends StandoutBase {
  kind: 'praised'
  praised: Level
}

/** The product (else category) whose talk is mostly about one subject. */
export interface FocusStandout extends StandoutBase {
  kind: 'focus'
  subject: string
  level: Level
  /** The subject is ahead of every other the set could hold: strictly more
   *  videos than the next ready one, and no subject of the client's is
   *  pending (`topRanked`). Only then may the card say "more than any
   *  other"; otherwise it prints the level alone. */
  ranked: boolean
}

export type Standout = FirstStandout | GapStandout | GeneralStandout | PraisedStandout | FocusStandout

/** One bar of a month line. */
export interface LineBar {
  month: string
  label: string
  k: number
  n: number
  /** The month is still being read (so far). */
  filling: boolean
  /** The month the page reads: drawn outlined (the board's "so far" bar). */
  current: boolean
  /** The catalogue this month was read under: where it differs from the
   *  month before, the list changed between them (a footnote says so). */
  version: string | null
}

/** A text placed under one of the client's products in a category, not which:
 *  a comment, or a video's content as a whole. */
export interface UnclearLine {
  key: string
  videoId: string
  commentId: string | null
  /** The comment's words, where the quote gate lets them print; null for a
   *  video's content (the video itself names one of the client's). */
  quote: { text: string; english: string | null; lang: string | null } | null
  cite: string
  watchHref: string | null
}

export interface ProductsQuote {
  key: string
  text: string
  english: string | null
  lang: string | null
  cite: string
}

export interface CompareColumn { key: string; label: string; tone: 'market' | 'you' }
export interface CompareCell extends Level { highlight?: boolean }
export interface CompareRow { key: string; label: string; cells: (CompareCell | null)[] }

/** Rows of things people talk about, each counted in the category and in each
 *  of the client's products there (`PairedBars`). */
export interface Compare {
  columns: CompareColumn[]
  rows: CompareRow[]
  /** The products' columns against the category's: each pair banded. Only a
   *  pair that clears its band is ever worded. */
  verdicts: Verdict[]
  /** The products' cells are empty, and the table says why once: none of
   *  them was named this month (nothing to count), they were named but what
   *  their videos are about was not read, or (`pending`) no subject's check
   *  has passed, so every row is a subject's name with no count at all. */
  empty?: 'none_named' | 'not_read' | 'pending'
}

interface PanelBase {
  id: string
  name: string
  /** 0 to 1: the column the panel's notch points at. */
  notchAt: number
  closeHref: string
  askHref: string
  settingsHref: string
  crosses: Crosses | null
  line: LineBar[]
  compare: Compare | null
}

export interface CategoryPanel extends PanelBase {
  kind: 'group'
  share: Level | null
  verdict: Verdict | null
  products: number
  cameUp: number
  /** The exclusive split of the category's videos. Null where the month holds
   *  no row for it. */
  split: { any: number; named: number; unclear: number; unbranded: number } | null
  unclear: {
    /** Videos about one of the client's here, not which (`k_unclear`). */
    videos: number
    lines: UnclearLine[]
    /** Lines not printed because the list is cut (see all). */
    more: number
    /** Comments the quote gate kept off the page. */
    withheld: number
    allHref: string | null
    /** The Tag control's choices; empty where the reader may not tag. */
    options: TagOption[]
  }
}

export interface ProductPanel extends PanelBase {
  kind: 'product'
  groupId: string
  groupName: string
  flag: Verdict | null
  /** Its videos this month, and the market's. */
  videos: number | null
  market: number | null
  /** Its category's videos this month. */
  categoryVideos: number | null
  /** Its category's videos this month that name none of the client's
   *  products (`k_unbranded`): the stats' last cell where it has no subject. */
  categoryUnbranded: number | null
  comments: number | null
  quotes: ProductsQuote[]
}

export type ProductsPanel = CategoryPanel | ProductPanel

export interface ProductsData {
  state: ProductsState
  client: string
  month: string
  soFar: boolean
  /** "October so far", "September". */
  monthWords: string
  /** Decision 3: "the last full month" where `month` is not the current
   *  calendar month (`readingMonthLabel`, at the load's clock), else null.
   *  The bar prints it beside `monthWords`. */
  monthLabel: string | null
  /** "October". */
  monthName: string
  catalogue: { categories: number; products: number }
  settingsHref: string
  /** The state's one line; null when ready. */
  empty: string | null
  /** The market's videos this month. */
  market: number | null
  /** Products with a video this month, and the videos about any of the
   *  catalogue (distinct). `videos` is null where it was not read. */
  header: { cameUp: number; products: number; videos: number | null } | null
  /** The strict picks (`pickStandouts`): what the Dashboard and the email
   *  read. */
  standouts: Standout[]
  /** The board's four places, always four when ready (`standoutSlots`);
   *  empty in a state that reads no month (the page draws their frames). */
  slots: StandoutSlot[]
  /** The bar's month switch (the board's period switch, in the months the
   *  page reads by): the latest months read, oldest first. Empty where no
   *  month was read. */
  months: MonthOption[]
  /** Every category a column. Ready: the month's counts. Not switched on, or
   *  the month not read: the catalogue with every count null ("not read
   *  yet"). No catalogue: empty. */
  shelf: ShelfCategoryView[]
  /** Whether this reader may tag (owner or admin, and the operator). */
  canTag: boolean
  params: ProductsParams
  open: { kind: OpenKind; id: string } | null
  panel: ProductsPanel | null
}

/** One month in the bar's switch. */
export interface MonthOption {
  month: string
  /** "September", "October so far". */
  label: string
  href: string
  current: boolean
}

// ---- small helpers -----------------------------------------------------------------

/** "September", or "October so far" while the month is still being read. */
export const monthWordsOf = (month: string, soFar: boolean): string => `${longMonth(month)}${soFar ? ' so far' : ''}`

const byNumberThenName = <T extends { k: number; label: string }>(a: T, b: T): number => b.k - a.k || a.label.localeCompare(b.label)

/** A share as the page prints it: whole percents, "under 1%" for a count
 *  that rounds to nothing. */
export function sharePct(k: number, n: number): string {
  if (n <= 0) return '0%'
  const p = (100 * k) / n
  if (k > 0 && p < 0.5) return 'under 1%'
  return `${Math.round(p)}%`
}

/** The month starts from `month` back `count` months, oldest first. */
export function monthsBack(month: string, count: number): string[] {
  const out: string[] = []
  let m = monthStartOf(month)
  for (let i = 0; i < count; i++) {
    out.unshift(m)
    m = prevMonth(m)
  }
  return out
}

/** How many months the bar's switch offers. */
export const SWITCH_MONTHS = 3

/**
 * THE BAR'S SWITCH (the boards' period switch, in the months this page reads
 * by: products are read per month only, so "This week" and "Over time" would
 * be views with nothing behind them): SWITCH_MONTHS contiguous months around
 * the page's own (the months read, and the page's month even where it is not
 * read yet, so a month with no reading still has a way back), oldest first,
 * the page's marked; "so far" on the calendar month of `now`. Empty where
 * there is nothing to switch to. PURE.
 */
export function monthOptions(rows: readonly ProductMonthRow[], month: string, params: ProductsParams, now: string | null): MonthOption[] {
  void params
  const m = monthStartOf(month)
  const months = [...new Set([...rows.map((r) => monthStartOf(r.month)), m])].sort()
  if (months.length < 2) return []
  const at = months.indexOf(m)
  const start = Math.max(0, Math.min(at - 1, months.length - SWITCH_MONTHS))
  const calendar = now ? monthStartOf(now) : null
  return months.slice(start, start + SWITCH_MONTHS).map((x) => ({
    month: x,
    label: monthWordsOf(x, x === calendar),
    href: productsHref({ month: x.slice(0, 7) }),
    current: x === m,
  }))
}

/** The months the page reads: HISTORY_MONTHS back to its own month (a first
 *  month, the month line), and every month after it up to the calendar
 *  month of `now` (the switch's newer months; nothing else reads past the
 *  page's month). */
export function monthsToRead(month: string, now: string): string[] {
  const out = monthsBack(month, HISTORY_MONTHS)
  const end = monthStartOf(now)
  for (let x = nextMonth(month); x <= end && out.length < HISTORY_MONTHS * 2; x = nextMonth(x)) out.push(x)
  return out
}

// ---- pooling over the market -----------------------------------------------------

export { marketProductMonth, type PooledProductMonth, type ProductMonthRow } from '../../products/market-month'

/** The month's videos, every audience, from any one object's rows (every
 *  object has a row in every audience of a month it was read in, zeros
 *  included). Null where the month holds no row. PURE. */
export function marketVideosOf(rows: readonly ProductMonthRow[], month: string): number | null {
  const m = monthStartOf(month)
  const n = new Map<string, number>()
  for (const r of rows) {
    if (monthStartOf(r.month) !== m || n.has(r.audience)) continue
    n.set(r.audience, Number(r.n) || 0)
  }
  return n.size === 0 ? null : [...n.values()].reduce((s, x) => s + x, 0)
}

/** The months the rows hold, oldest first. */
const monthsOfRows = (rows: readonly ProductMonthRow[]): string[] => [...new Set(rows.map((r) => monthStartOf(r.month)))].sort()

/** The catalogue version a month was read under (its rows'). */
function versionOf(rows: readonly ProductMonthRow[], month: string): string | null {
  const m = monthStartOf(month)
  return rows.find((r) => monthStartOf(r.month) === m)?.catalogue_version ?? null
}

// ---- the month's video sets ------------------------------------------------------

/** The month's videos behind each count: what `productReadingRows`
 *  (lib/products/readings.ts) counts, as sets, so a cross can be read over
 *  them and a list drawn from them. */
export interface ProductMonthSets {
  groups: Map<string, { any: Set<string>; named: Set<string>; unclear: Set<string>; unbranded: Set<string> }>
  products: Map<string, Set<string>>
  /** Every video about any of the catalogue. */
  all: Set<string>
}

const RANK = { named: 3, unclear: 2, unbranded: 1 } as const

/**
 * The sets, by the products step's own rule (lib/products/readings.ts
 * `productReadingRows`): a video counts in a category's month when its
 * content stands under the category (in every month it is in the market) or a
 * comment on it dated in the month does; the split is exclusive per video,
 * named over unclear over unbranded; a product's set is its named videos.
 * `market` is the month's videos (`product_month_videos`, every audience); an
 * own post (`owned`) stands only by its comments, never by its own words.
 * PURE.
 */
export function productMonthSets(input: {
  month: string
  market: readonly { id: string; owned?: boolean }[]
  standing: ReadonlyMap<TextKey, StandingText>
  groups: readonly string[]
  products: readonly string[]
}): ProductMonthSets {
  const m = monthStartOf(input.month)
  const owned = new Set(input.market.filter((v) => v.owned).map((v) => v.id))
  const content = new Map<string, StandingText['placements']>()
  const comments = new Map<string, StandingText['placements']>()
  for (const [key, t] of input.standing) {
    if (t.placements.length === 0) continue
    if (key.startsWith('v:') && owned.has(t.videoId)) continue
    if (key.startsWith('v:')) content.set(t.videoId, [...(content.get(t.videoId) ?? []), ...t.placements])
    else if (t.month && monthStartOf(t.month) === m) comments.set(t.videoId, [...(comments.get(t.videoId) ?? []), ...t.placements])
  }
  const groups: ProductMonthSets['groups'] = new Map(input.groups.map((g) => [g, { any: new Set(), named: new Set(), unclear: new Set(), unbranded: new Set() }]))
  const products: ProductMonthSets['products'] = new Map(input.products.map((p) => [p, new Set()]))
  const all = new Set<string>()
  for (const { id } of input.market) {
    const ps = [...(content.get(id) ?? []), ...(comments.get(id) ?? [])]
    const best = new Map<string, number>()
    for (const p of ps) {
      best.set(p.groupId, Math.max(best.get(p.groupId) ?? 0, RANK[p.placement]))
      if (p.placement === 'named' && p.productId) products.get(p.productId)?.add(id)
    }
    for (const [g, r] of best) {
      const set = groups.get(g)
      if (!set) continue
      set.any.add(id)
      all.add(id)
      if (r === RANK.named) set.named.add(id)
      else if (r === RANK.unclear) set.unclear.add(id)
      else set.unbranded.add(id)
    }
  }
  return { groups, products, all }
}

/** The texts placed `unclear` under a category on these videos, in the month
 *  (a comment dated in it, or the video's content). PURE. */
export function unclearTexts(standing: ReadonlyMap<TextKey, StandingText>, month: string, groupId: string, videos: ReadonlySet<string>): StandingText[] {
  const m = monthStartOf(month)
  const out: StandingText[] = []
  for (const [key, t] of standing) {
    if (!videos.has(t.videoId)) continue
    if (!key.startsWith('v:') && !(t.month && monthStartOf(t.month) === m)) continue
    if (t.placements.some((p) => p.placement === 'unclear' && p.groupId === groupId)) out.push(t)
  }
  return out
}

/** The comments naming a product in the month, on these videos. PURE. */
export function namedComments(standing: ReadonlyMap<TextKey, StandingText>, month: string, productId: string, videos: ReadonlySet<string>): StandingText[] {
  const m = monthStartOf(month)
  const out: StandingText[] = []
  for (const [key, t] of standing) {
    if (key.startsWith('v:') || !t.commentId || !videos.has(t.videoId) || !(t.month && monthStartOf(t.month) === m)) continue
    if (t.placements.some((p) => p.placement === 'named' && p.productId === productId)) out.push(t)
  }
  return out
}

/**
 * Which stored placements a month's read stands on: those of its catalogue
 * version made by this matcher and this prompt (the products step's `mine`),
 * and every tag. PURE.
 */
export function placementsInPlay<T extends PlacedRow & { rule_version: string; catalogue_version: string }>(rows: readonly T[], version: string): T[] {
  return rows.filter((r) => r.catalogue_version === version && (
    (r.method === 'rule' && r.rule_version === PRODUCT_RULE_VERSION)
    || ((r.method === 'model' || r.method === 'confirmed') && r.rule_version === PRODUCT_MODEL_RULE_VERSION)))
}

// ---- crosses -------------------------------------------------------------------------

/** The cross key of a set. */
export const setKey = (kind: OpenKind, id: string): string => `${kind}:${id}`

/**
 * One set's `lens_readings` rows pooled over EVERY audience, the client's
 * included (the basis: a creator's video about the client and an own post
 * with the market's comments are in the set, and the brand crosses' pooling,
 * `brandKinds` / `brandSubjects`, leaves the client's audience out, which
 * would read 10 videos with 8 of them the client's as 2). Audiences of one
 * month are disjoint, so the sums are distinct videos; a repeated
 * audience-object is counted once. PURE.
 */
export function poolLens(rows: readonly LensRowIn[]): { n: number; kinds: Map<string, number>; subjects: Map<string, number> } {
  const num = (v: unknown): number => {
    const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0
    return Number.isFinite(x) ? x : 0
  }
  const seen = new Set<string>()
  let n = 0
  const kinds = new Map<string, number>()
  const subjects = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.audience}\u0000${r.object_kind}\u0000${r.object_id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (r.object_kind === 'denominator' && r.object_id === 'videos') n += num(r.k)
    else if (r.object_kind === 'kind') kinds.set(String(r.object_id), (kinds.get(String(r.object_id)) ?? 0) + num(r.k))
    else if (r.object_kind === 'subject') subjects.set(String(r.object_id), (subjects.get(String(r.object_id)) ?? 0) + num(r.k))
  }
  return { n, kinds, subjects }
}

/**
 * A kind's label on the Your products panels, in the words the page already
 * uses for praise ("Praise in the comments", the praise standout's eyebrow).
 * A kind's count here is the set's videos with that kind ANYWHERE in their
 * comments: a video names the product, and its comments praise or ask about
 * it or about anything else in the video. The shared `talkKindLabel`
 * ("Praised it", "Asked a question") says the people did it to the thing,
 * which a product's set cannot claim, so this page says where the kind was
 * found and not what it was about. Every other page keeps `talkKindLabel`.
 */
export const PRODUCT_KIND_LABELS: Readonly<Record<string, string>> = {
  praise: 'Praise in the comments',
  question: 'Questions in the comments',
  pain_point: 'Complaints in the comments',
  purchase_intent: 'Talk of buying in the comments',
  objection: 'Pushback in the comments',
  feature_request: 'Wishes in the comments',
  buying_trigger: 'What made them look, in the comments',
  switching_signal: 'Talk of switching in the comments',
  demographic_signal: 'Who they are, in the comments',
}

/** `PRODUCT_KIND_LABELS`, a kind it does not name in its general label. PURE. */
export const productKindLabel = (kind: string): string => PRODUCT_KIND_LABELS[kind] ?? `${kindLabel(kind)}, in the comments`

/** Does the set's top subject lead every other it could hold? Strictly more
 *  videos than the next ready subject, and none of the client's subjects
 *  pending: a pending subject's count is withheld (ruling U6), so a lead over
 *  it cannot be claimed, and a tie is no lead. PURE. */
export function topRanked(c: Pick<Crosses, 'subjects' | 'pending'> | null | undefined): boolean {
  const top = c?.subjects[0]
  if (!top || (c?.pending?.length ?? 0) > 0) return false
  return top.k > (c?.subjects[1]?.k ?? 0)
}

/** Subjects and kinds over one set, from its `lens_readings` rows pooled over
 *  every audience (`poolLens`). A subject not active (not in `subjects`) is
 *  left out; misinformation is never a kind a page ranks (decision T). The
 *  kinds take the page's own words (`productKindLabel`).
 *
 *  RULING U6 (`printsMarket`, lib/subjects/calibration-state.ts): only a
 *  READY subject is counted; one whose check has not passed is `pending`, by
 *  name and in the subjects' own order, whatever its count (its count, and
 *  even whether this set has any, rests on its membership); a failed one is
 *  left out. PURE. */
export function crossesOf(rows: readonly LensRowIn[], subjects: ReadonlyMap<string, SubjectRead>): Crosses {
  const pooled = poolLens(rows)
  const ready = (id: string) => subjects.get(id)?.state === 'ready'
  const pending = [...subjects].filter(([, s]) => s.state === 'provisional').map(([id, s]) => ({ id, label: s.name }))
  return {
    n: pooled.n,
    subjects: [...pooled.subjects].filter(([id, k]) => k > 0 && ready(id))
      .map(([id, k]) => ({ id, label: subjects.get(id)!.name, k })).sort(byNumberThenName),
    kinds: [...pooled.kinds].filter(([id, k]) => k > 0 && id !== 'misinformation' && KIND_LABELS[id])
      .map(([id, k]) => ({ id, label: productKindLabel(id), k })).sort(byNumberThenName),
    ...(pending.length > 0 ? { pending } : {}),
  }
}

// ---- verdicts ------------------------------------------------------------------------

const monthWindow = (month: string) => ({ kind: 'month' as const, from: monthStartOf(month), to: nextMonth(month) })

/**
 * A category's share of the market this month against last month
 * (`monthChange`, the month-pair rule on the market view). Refused where the
 * two months were placed under different catalogues (an edit in Settings
 * moves what is counted, so the two are not like for like), or where either
 * month holds no row. No direction word. PURE.
 */
export function categoryShareVerdict(input: {
  group: { id: string; name: string }
  month: string
  curr: PooledProductMonth | null
  prev: PooledProductMonth | null
  pair: PairOn | null
}): Verdict | null {
  const { curr, prev } = input
  if (!curr) return null
  const m = monthStartOf(input.month)
  const before = prevMonth(m)
  const verdict = monthChange({
    object: { kind: 'product', id: input.group.id, label: input.group.name },
    audience: 'market',
    // No clustering: a placement is the catalogue's, never a theme's (the
    // catalogue's own version is checked below).
    curr: { month: m, videos: curr.n, k: curr.k_any, audience: 'market', regime: 'n/a' },
    prev: { month: before, videos: prev?.n ?? null, k: prev?.k_any ?? null, audience: 'market', regime: 'n/a' },
    // The BRANDS view (lib/reading/comparability.ts: every search change, and
    // the filing changes, FILING_VIEWS, handles among them). The month pools
    // the client's own posts too, and a handles change moves which posts are
    // the client's, so the market view, which a handles change does not cut,
    // would compare two months read two ways.
    comparability: input.pair ? input.pair(before, m, BRANDS_PANEL) : null,
  })
  if (prev && curr.catalogueVersion && prev.catalogueVersion && curr.catalogueVersion !== prev.catalogueVersion && verdict.state !== 'refused') {
    const { baseline: _prior, ...level } = verdict
    return { ...level, changePts: null, bandPts: null, state: 'refused', refusedReason: 'tracking_change' }
  }
  return verdict
}

/** A product's first month with videos: its videos this month (`k_named`)
 *  against every earlier month read under the same catalogue, at least
 *  `FIRST_NEEDS` of them, each with none. The verdict carries the `new` flag
 *  and no comparison. Null where it is not one. PURE. */
export const FIRST_NEEDS = 2

export function firstMonthOf(input: {
  product: { id: string; name: string }
  month: string
  rows: readonly ProductMonthRow[]
  /** The fewest videos it takes. STANDOUT_MIN for a standout (one video is
   *  not a standout); 1 for the first card's place when nothing reached that
   *  (`standoutSlots`, which says how many). */
  min?: number
}): { verdict: Verdict; videos: number; n: number; months: { month: string; k: number }[] } | null {
  const m = monthStartOf(input.month)
  const curr = marketProductMonth(input.rows, m, input.product.id)
  // A first month needs STANDOUT_MIN videos: one video is not a standout.
  if (!curr || curr.k_named < Math.max(1, input.min ?? STANDOUT_MIN)) return null
  const earlier: { month: string; k: number }[] = []
  for (const month of monthsOfRows(input.rows).filter((x) => x < m)) {
    const p = marketProductMonth(input.rows, month, input.product.id)
    if (!p) continue
    if (p.catalogueVersion !== curr.catalogueVersion) continue
    if (p.k_named > 0) return null
    earlier.push({ month, k: 0 })
  }
  if (earlier.length < FIRST_NEEDS) return null
  const verdict = bandVerdict({
    objectKind: 'product',
    objectId: input.product.id,
    objectLabel: input.product.name,
    audience: 'market',
    window: monthWindow(m),
    value: { k: curr.k_named, n: curr.n },
    flags: ['new'],
  })
  return { verdict, videos: curr.k_named, n: curr.n, months: [...earlier, { month: m, k: curr.k_named }] }
}

/** A product's share of its own videos carrying a subject, against its
 *  category's: banded (`SHARE_BAND`). With a product's tens of videos the
 *  band's floors are not met and the answer is `too_little_data`, which is
 *  the honest one; only a pair that clears is ever worded. PURE. */
export function productAgainstCategory(input: {
  product: { id: string; name: string }
  subject: { id: string; label: string }
  month: string
  product_: Level
  category: Level
}): Verdict {
  return bandVerdict({
    objectKind: 'product',
    objectId: input.product.id,
    objectLabel: `${input.product.name} · ${input.subject.label}`,
    audience: 'market',
    window: monthWindow(input.month),
    value: input.product_,
    baseline: input.category,
  })
}

// ---- the standouts -------------------------------------------------------------------

/** A standout reads at least this many videos (praise, a subject). */
export const STANDOUT_MIN = 3
/** At most this many cards. */
export const STANDOUTS_MAX = 4

interface ObjectStat {
  kind: OpenKind
  id: string
  name: string
  groupName: string
  sort: number
  videos: number
  crosses: Crosses | null
}

/**
 * The cards, picked by code, in the board's order (at most one of each):
 *   first    the product with the most videos whose first month with videos
 *            this is (`firstMonthOf`);
 *   gap      a subject the category carries in a far larger (or smaller)
 *            share of its videos than one of the client's products there,
 *            where the band clears (`productAgainstCategory`); else
 *   general  the category whose talk is most about the category in general
 *            (none of the client's products named), where that is most of it;
 *   praised  the product, else the category, praised in the largest share of
 *            its videos (at least STANDOUT_MIN videos, at least half);
 *   focus    the product, else the category, whose talk is most about one
 *            subject (at least STANDOUT_MIN videos, at least half).
 * An object is used once. Ties go to more videos, then the catalogue's order.
 * PURE.
 */
export function pickStandouts(input: {
  month: string
  params: Pick<ProductsParams, 'month'>
  catalogue: Pick<ProductCatalogue, 'groups' | 'products'>
  shelf: readonly ShelfCategoryView[]
  firsts: ReadonlyMap<string, NonNullable<ReturnType<typeof firstMonthOf>>>
  crosses: ReadonlyMap<string, Crosses>
  splits: ReadonlyMap<string, PooledProductMonth>
}): Standout[] {
  const out: Standout[] = []
  const used = new Set<string>()
  const groupName = new Map(input.catalogue.groups.map((g) => [g.id, g.name]))
  const groupSort = new Map(input.catalogue.groups.map((g) => [g.id, g.sort]))
  const productOf = new Map(input.catalogue.products.map((p) => [p.id, p]))
  const hrefOf = (kind: OpenKind, id: string) => productsHref(input.params, { kind, id })
  const shelfProduct = new Map(input.shelf.flatMap((c) => c.products.map((p) => [p.id, p] as const)))

  const productStats: ObjectStat[] = input.catalogue.products.map((p) => ({
    kind: 'product' as const, id: p.id, name: p.name, groupName: groupName.get(p.group_id) ?? '',
    sort: (groupSort.get(p.group_id) ?? 0) * 1000 + p.sort,
    videos: shelfProduct.get(p.id)?.videos ?? 0, crosses: input.crosses.get(setKey('product', p.id)) ?? null,
  }))
  const groupStats: ObjectStat[] = input.catalogue.groups.map((g) => ({
    kind: 'group' as const, id: g.id, name: g.name, groupName: g.name, sort: g.sort * 1000,
    videos: input.shelf.find((c) => c.id === g.id)?.videos ?? 0, crosses: input.crosses.get(setKey('group', g.id)) ?? null,
  }))
  const tie = (a: { n: number; sort: number }, b: { n: number; sort: number }) => b.n - a.n || a.sort - b.sort

  // 1. first
  const firsts = [...input.firsts.entries()]
    .map(([id, f]) => ({ id, f, sort: productStats.find((p) => p.id === id)?.sort ?? 0 }))
    .sort((a, b) => b.f.videos - a.f.videos || a.sort - b.sort)
  const first = firsts[0]
  if (first) {
    const p = productOf.get(first.id)
    if (p) {
      const c = input.crosses.get(setKey('product', p.id))
      const top = c?.subjects[0]
      out.push({
        kind: 'first', open: { kind: 'product', id: p.id }, href: hrefOf('product', p.id), name: p.name, where: groupName.get(p.group_id) ?? '',
        videos: first.f.videos, months: first.f.months, flag: first.f.verdict,
        lead: top && c && c.n > 0 ? { label: top.label, k: top.k, n: c.n } : null,
      })
      used.add(setKey('product', p.id))
    }
  }

  // 2. gap, else general
  let gap: GapStandout | null = null
  let gapSize = 0
  for (const g of groupStats) {
    const gc = g.crosses
    if (!gc || gc.n === 0) continue
    for (const p of productStats.filter((x) => productOf.get(x.id)?.group_id === g.id && x.crosses && x.crosses.n > 0)) {
      if (used.has(setKey('product', p.id))) continue
      for (const s of gc.subjects) {
        const pk = p.crosses!.subjects.find((x) => x.id === s.id)?.k ?? 0
        const v = productAgainstCategory({ product: p, subject: s, month: input.month, product_: { k: pk, n: p.crosses!.n }, category: { k: s.k, n: gc.n } })
        if (v.state !== 'moved' || v.changePts == null) continue
        if (Math.abs(v.changePts) > gapSize) {
          gapSize = Math.abs(v.changePts)
          gap = {
            kind: 'gap', open: { kind: 'group', id: g.id }, href: hrefOf('group', g.id), name: g.name, where: g.name,
            subject: s.label, category: { k: s.k, n: gc.n }, product: { name: p.name, k: pk, n: p.crosses!.n }, verdict: v,
          }
        }
      }
    }
  }
  if (gap) {
    out.push(gap)
    used.add(setKey('group', gap.open.id))
  } else {
    const general = groupStats
      .map((g) => ({ g, s: input.splits.get(g.id) }))
      .filter((x): x is { g: ObjectStat; s: PooledProductMonth } => !!x.s && x.s.k_any >= STANDOUT_MIN && x.s.k_unbranded * 2 > x.s.k_any)
      .sort((a, b) => b.s.k_unbranded / b.s.k_any - a.s.k_unbranded / a.s.k_any || tie({ n: a.s.k_any, sort: a.g.sort }, { n: b.s.k_any, sort: b.g.sort }))[0]
    if (general) {
      out.push({
        kind: 'general', open: { kind: 'group', id: general.g.id }, href: hrefOf('group', general.g.id), name: general.g.name, where: general.g.name,
        inGeneral: { k: general.s.k_unbranded, n: general.s.k_any },
        yours: { k: general.s.k_named + general.s.k_unclear, n: general.s.k_any },
      })
      used.add(setKey('group', general.g.id))
    }
  }

  // 3. praised, 4. focus: products first, then categories.
  const best = <T>(pick: (o: ObjectStat) => (T & { k: number; n: number }) | null) => {
    for (const pool of [productStats, groupStats]) {
      const hits = pool
        .filter((o) => !used.has(setKey(o.kind, o.id)) && o.crosses && o.crosses.n >= STANDOUT_MIN)
        .map((o) => ({ o, hit: pick(o) }))
        .filter((x): x is { o: ObjectStat; hit: T & { k: number; n: number } } => x.hit != null && x.hit.k * 2 >= x.hit.n && x.hit.k >= 2)
        .sort((a, b) => b.hit.k / b.hit.n - a.hit.k / a.hit.n || tie({ n: a.hit.n, sort: a.o.sort }, { n: b.hit.n, sort: b.o.sort }))
      if (hits[0]) return hits[0]
    }
    return null
  }
  const praised = best((o) => {
    const k = o.crosses!.kinds.find((c) => c.id === 'praise')?.k ?? 0
    return k > 0 ? { k, n: o.crosses!.n } : null
  })
  if (praised) {
    out.push({
      kind: 'praised', open: { kind: praised.o.kind, id: praised.o.id }, href: hrefOf(praised.o.kind, praised.o.id),
      name: praised.o.name, where: praised.o.groupName, praised: { k: praised.hit.k, n: praised.hit.n },
    })
    used.add(setKey(praised.o.kind, praised.o.id))
  }
  const focus = best((o) => {
    const top = o.crosses!.subjects[0]
    return top ? { k: top.k, n: o.crosses!.n, label: top.label } : null
  })
  if (focus) {
    out.push({
      kind: 'focus', open: { kind: focus.o.kind, id: focus.o.id }, href: hrefOf(focus.o.kind, focus.o.id),
      name: focus.o.name, where: focus.o.groupName, subject: focus.hit.label, level: { k: focus.hit.k, n: focus.hit.n }, ranked: topRanked(focus.o.crosses),
    })
  }
  return out.slice(0, STANDOUTS_MAX)
}

// ---- the four places (the parity pass, 13 Oct night) --------------------------------

/**
 * THE BOARD'S FOUR CARDS ARE ALWAYS DRAWN, in its order (Heinrich, 13 Oct
 * night: "the page shouldn't look too different if everything isn't as
 * populated as the design"). A place is filled at one of three tiers:
 *   pick  the code's standout (`pickStandouts`), unchanged: what the Dashboard
 *         and the email read;
 *   next  where nothing reached the pick's bar, the nearest honest card,
 *         worded for what it is: a product's first month in fewer than
 *         STANDOUT_MIN videos; the category whose talk is most in general,
 *         under half; the most praise, under half; the commonest subject,
 *         under half. Never the Dashboard's or the email's standout;
 *   none  nothing the month can show there: the card keeps its frame and
 *         its visual, empty, with one line.
 */
export type SlotKey = 'first' | 'category' | 'praised' | 'focus'
export const SLOT_ORDER: readonly SlotKey[] = ['first', 'category', 'praised', 'focus']
export type SlotTier = 'pick' | 'next' | 'none'

export interface StandoutSlot {
  slot: SlotKey
  tier: SlotTier
  card: Standout | null
  /** `none`: `unread` where the crosses it reads were not read at all;
   *  `pending` (the subject place only) where no subject's check has passed
   *  (ruling U6), so no subject may be named as what the talk is about. */
  reason?: 'quiet' | 'unread' | 'pending'
  /** The first place's `none`: the months read, oldest first (its strip),
   *  and the newest product on the shelf (the latest earlier month that was
   *  a product's first with videos), where there is one. */
  months?: string[]
  newest?: { name: string; where: string; month: string; href: string } | null
}

/** Which place a picked standout fills. */
export const slotOf = (s: Pick<Standout, 'kind'>): SlotKey => (s.kind === 'gap' || s.kind === 'general' ? 'category' : s.kind)

/** At most this many other first-timers named on the first card. */
export const FIRST_OTHERS = 3

/**
 * The four places, from the strict picks and the month's rows and crosses.
 * An object is used once where another can stand; a `next` card may reuse
 * one only where nothing else has the figure. PURE.
 */
export function standoutSlots(input: {
  month: string
  params: Pick<ProductsParams, 'month'>
  catalogue: Pick<ProductCatalogue, 'groups' | 'products'>
  shelf: readonly ShelfCategoryView[]
  rows: readonly ProductMonthRow[]
  crosses: ReadonlyMap<string, Crosses>
  splits: ReadonlyMap<string, PooledProductMonth>
  picked: readonly Standout[]
}): StandoutSlot[] {
  const m = monthStartOf(input.month)
  const hrefOf = (kind: OpenKind, id: string) => productsHref(input.params, { kind, id })
  const groupName = new Map(input.catalogue.groups.map((g) => [g.id, g.name]))
  const groupSort = new Map(input.catalogue.groups.map((g) => [g.id, g.sort]))
  const sortOfProduct = (p: { group_id: string; sort: number }) => (groupSort.get(p.group_id) ?? 0) * 1000 + p.sort
  const used = new Set(input.picked.map((s) => setKey(s.open.kind, s.open.id)))
  const picked = new Map<SlotKey, Standout>()
  for (const s of input.picked) if (!picked.has(slotOf(s))) picked.set(slotOf(s), s)
  const out: StandoutSlot[] = []

  // 1. A product's first month with videos.
  const first = picked.get('first')
  if (first) out.push({ slot: 'first', tier: 'pick', card: first })
  else {
    const below = input.catalogue.products
      .flatMap((p) => {
        const f = firstMonthOf({ product: p, month: m, rows: input.rows, min: 1 })
        return f && f.videos < STANDOUT_MIN ? [{ p, f }] : []
      })
      .sort((a, b) => b.f.videos - a.f.videos || sortOfProduct(a.p) - sortOfProduct(b.p))
    const top = below[0]
    if (top) {
      const c = input.crosses.get(setKey('product', top.p.id))
      const lead = c?.subjects[0]
      out.push({
        slot: 'first', tier: 'next',
        card: {
          kind: 'first', open: { kind: 'product', id: top.p.id }, href: hrefOf('product', top.p.id), name: top.p.name, where: groupName.get(top.p.group_id) ?? '',
          videos: top.f.videos, months: top.f.months, flag: top.f.verdict,
          lead: lead && c && c.n > 0 ? { label: lead.label, k: lead.k, n: c.n } : null,
          others: below.slice(1, 1 + FIRST_OTHERS).map((x) => ({ name: x.p.name, href: hrefOf('product', x.p.id) })),
        },
      })
    } else {
      // The newest on the shelf: the latest earlier month that was a
      // product's first with videos (the same rule, any number of videos).
      let newest: StandoutSlot['newest'] = null
      for (const e of monthsOfRows(input.rows).filter((x) => x < m).reverse()) {
        const hits = input.catalogue.products
          .flatMap((p) => {
            const f = firstMonthOf({ product: p, month: e, rows: input.rows, min: 1 })
            return f ? [{ p, f }] : []
          })
          .sort((a, b) => b.f.videos - a.f.videos || sortOfProduct(a.p) - sortOfProduct(b.p))
        if (hits[0]) {
          newest = { name: hits[0].p.name, where: groupName.get(hits[0].p.group_id) ?? '', month: e, href: hrefOf('product', hits[0].p.id) }
          break
        }
      }
      out.push({ slot: 'first', tier: 'none', card: null, reason: 'quiet', months: monthsOfRows(input.rows).filter((x) => x <= m).slice(-LINE_MONTHS), newest })
    }
  }

  // 2. A category against your products in it.
  const cat = picked.get('category')
  if (cat) out.push({ slot: 'category', tier: 'pick', card: cat })
  else {
    const g = input.catalogue.groups
      .map((x) => ({ g: x, s: input.splits.get(x.id) }))
      .filter((x): x is { g: (typeof input.catalogue.groups)[number]; s: PooledProductMonth } => !!x.s && x.s.k_any > 0)
      .sort((a, b) => Number(used.has(setKey('group', a.g.id))) - Number(used.has(setKey('group', b.g.id)))
        || b.s.k_unbranded / b.s.k_any - a.s.k_unbranded / a.s.k_any || b.s.k_any - a.s.k_any || a.g.sort - b.g.sort)[0]
    if (g) {
      out.push({
        slot: 'category', tier: 'next',
        card: {
          kind: 'general', open: { kind: 'group', id: g.g.id }, href: hrefOf('group', g.g.id), name: g.g.name, where: g.g.name,
          inGeneral: { k: g.s.k_unbranded, n: g.s.k_any }, yours: { k: g.s.k_named + g.s.k_unclear, n: g.s.k_any },
        },
      })
      used.add(setKey('group', g.g.id))
    } else out.push({ slot: 'category', tier: 'none', card: null, reason: 'quiet' })
  }

  // 3 and 4. Praise, then one subject: products first, then categories, as
  // the picks; an unused object before a used one.
  const pool = [
    ...input.catalogue.products.map((p) => ({ kind: 'product' as const, id: p.id, name: p.name, where: groupName.get(p.group_id) ?? '', sort: sortOfProduct(p), tier: 0 })),
    ...input.catalogue.groups.map((g) => ({ kind: 'group' as const, id: g.id, name: g.name, where: g.name, sort: g.sort * 1000, tier: 1 })),
  ]
  const nearest = <T extends { k: number; n: number }>(read: (c: Crosses) => T | null) => pool
    .map((o) => {
      const c = input.crosses.get(setKey(o.kind, o.id))
      const hit = c && c.n >= STANDOUT_MIN ? read(c) : null
      return hit && hit.k > 0 ? { o, hit } : null
    })
    .filter((x): x is { o: (typeof pool)[number]; hit: T } => x != null)
    .sort((a, b) => Number(used.has(setKey(a.o.kind, a.o.id))) - Number(used.has(setKey(b.o.kind, b.o.id)))
      || a.o.tier - b.o.tier || b.hit.k / b.hit.n - a.hit.k / a.hit.n || b.hit.n - a.hit.n || a.o.sort - b.o.sort)[0] ?? null
  // Not read: no cross at all where the month has talk to cross. A quiet
  // month (no category with a video) was read, and has nothing to show.
  const unread = input.crosses.size === 0 && input.shelf.some((c) => (c.videos ?? 0) > 0)
  const praised = picked.get('praised')
  if (praised) out.push({ slot: 'praised', tier: 'pick', card: praised })
  else {
    const x = nearest((c) => {
      const k = c.kinds.find((r) => r.id === 'praise')?.k ?? 0
      return { k, n: c.n }
    })
    if (x) {
      out.push({ slot: 'praised', tier: 'next', card: { kind: 'praised', open: { kind: x.o.kind, id: x.o.id }, href: hrefOf(x.o.kind, x.o.id), name: x.o.name, where: x.o.where, praised: { k: x.hit.k, n: x.hit.n } } })
      used.add(setKey(x.o.kind, x.o.id))
    } else out.push({ slot: 'praised', tier: 'none', card: null, reason: unread ? 'unread' : 'quiet' })
  }
  const focus = picked.get('focus')
  if (focus) out.push({ slot: 'focus', tier: 'pick', card: focus })
  else {
    const x = nearest((c) => {
      const top = c.subjects[0]
      return top ? { k: top.k, n: c.n, label: top.label } : null
    })
    const pending = [...input.crosses.values()].some((c) => (c.pending?.length ?? 0) > 0)
    if (x) out.push({ slot: 'focus', tier: 'next', card: { kind: 'focus', open: { kind: x.o.kind, id: x.o.id }, href: hrefOf(x.o.kind, x.o.id), name: x.o.name, where: x.o.where, subject: x.hit.label, level: { k: x.hit.k, n: x.hit.n }, ranked: topRanked(input.crosses.get(setKey(x.o.kind, x.o.id))) } })
    else out.push({ slot: 'focus', tier: 'none', card: null, reason: unread ? 'unread' : pending ? 'pending' : 'quiet' })
  }
  return out
}

// ---- the shelf ---------------------------------------------------------------------

/**
 * The shelf: every active category a column in the catalogue's order, every
 * active product a tile, those with videos first (most first), then the quiet
 * ones in the catalogue's order. A product with no row this month counts as
 * none on the shelf (the month was read: the category has rows), never
 * hidden: the shelf is the whole catalogue. PURE.
 */
export function buildShelf(input: {
  month: string
  catalogue: Pick<ProductCatalogue, 'groups' | 'products'>
  rows: readonly ProductMonthRow[]
  pair: PairOn | null
  firsts: ReadonlyMap<string, { verdict: Verdict }>
  crosses: ReadonlyMap<string, Crosses>
  params: ProductsParams
  open: { kind: OpenKind; id: string } | null
  groupOfProduct: ReadonlyMap<string, string>
}): ShelfCategoryView[] {
  const m = monthStartOf(input.month)
  const before = prevMonth(m)
  const groups = [...input.catalogue.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const openGroup = input.open?.kind === 'group' ? input.open.id : input.open?.kind === 'product' ? input.groupOfProduct.get(input.open.id) ?? null : null
  return groups.map((g) => {
    const curr = marketProductMonth(input.rows, m, g.id)
    const prev = marketProductMonth(input.rows, before, g.id)
    const products = input.catalogue.products
      .filter((p) => p.group_id === g.id)
      .map((p) => ({ p, videos: marketProductMonth(input.rows, m, p.id)?.k_named ?? null }))
      // Most videos first, then the quiet ones, then any not read yet.
      .sort((a, b) => (b.videos ?? -1) - (a.videos ?? -1) || a.p.sort - b.p.sort || a.p.name.localeCompare(b.p.name))
      .map(({ p, videos }): ShelfProductView => ({
        id: p.id, name: p.name, videos, href: productsHref(input.params, { kind: 'product', id: p.id }), flag: input.firsts.get(p.id)?.verdict ?? null,
      }))
    const c = input.crosses.get(setKey('group', g.id))
    const top = c?.subjects[0]
    return {
      id: g.id,
      name: g.name,
      videos: curr ? curr.k_any : null,
      share: curr && curr.n > 0 ? { k: curr.k_any, n: curr.n } : null,
      verdict: categoryShareVerdict({ group: g, month: m, curr, prev, pair: input.pair }),
      lead: top && c && c.n > 0 ? { label: top.label, k: top.k } : null,
      subjectsPending: (c?.pending?.length ?? 0) > 0 && (curr?.k_any ?? 0) > 0,
      leads: topRanked(c),
      unclear: curr?.k_unclear ?? 0,
      products,
      href: productsHref(input.params, { kind: 'group', id: g.id }),
      unclearHref: productsHref(input.params, { kind: 'group', id: g.id }, { at: 'unclear' }),
      selected: openGroup === g.id,
    }
  })
}

// ---- the panels ----------------------------------------------------------------------

/** How many months a month line shows, the reading month last. */
export const LINE_MONTHS = 6
/** How many months back the page reads, for a product's first month. */
export const HISTORY_MONTHS = 12
/** Subjects a panel lists. */
export const PANEL_SUBJECTS = 6
/** Rows and product columns in "your products against the category". */
export const COMPARE_ROWS = 5
export const COMPARE_PRODUCTS = 3
/** Couldn't-tell-which lines shown before "See all", and at most with it. */
export const UNCLEAR_SHOWN = 3
export const UNCLEAR_ALL = 30
/** Quotes in a product's panel. */
export const PRODUCT_QUOTES = 3

/** Tiles a shelf column shows before "+N more" (the lead's ruling, 13 Oct
 *  night: the board's column height; Össur's Feet hold 20 products). The
 *  most-videos first, so a product with talk is shown before a quiet one. */
export const SHELF_TILES = 8

/** A shelf column as the page draws it: its first `SHELF_TILES` tiles, and
 *  how many more ("+N more"). The page's shelf and the Dashboard's mini shelf
 *  both cut by this, so the two draw the same tiles. PURE. */
export function shelfCut<T>(products: readonly T[]): { shown: T[]; more: number } {
  return products.length > SHELF_TILES
    ? { shown: products.slice(0, SHELF_TILES), more: products.length - SHELF_TILES }
    : { shown: [...products], more: 0 }
}

/** The shelf's columns at its widest: the kit's five (the board's five
 *  categories), six where the catalogue has six (Össur's: Hands joined), so
 *  no category wraps alone onto a second row. More than six wrap. */
export function shelfColumns(categories: number): 5 | 6 {
  return categories >= 6 ? 6 : 5
}

/** The notch's place under a category's column at the shelf's widest. */
export function notchFor(groups: readonly { id: string }[], groupId: string): number {
  const cols = shelfColumns(groups.length)
  const i = Math.max(0, groups.findIndex((g) => g.id === groupId))
  return (((i % cols) + 0.5) / cols)
}

/** The first month of a line read under a different catalogue from the month
 *  before it (the list changed between them), or null. PURE. */
export function catalogueBreak(line: readonly LineBar[]): string | null {
  for (let i = 1; i < line.length; i++) if (line[i].version && line[i - 1].version && line[i].version !== line[i - 1].version) return line[i].month
  return null
}

/** A month line: up to LINE_MONTHS months that hold a row for the object,
 *  ending at the reading month, `k` the object's videos (`pick`) of the
 *  market's. PURE. */
export function monthLine(rows: readonly ProductMonthRow[], month: string, objectId: string, pick: (p: PooledProductMonth) => number, filling: (month: string) => boolean): LineBar[] {
  const out: LineBar[] = []
  for (const m of monthsBack(month, LINE_MONTHS)) {
    const p = marketProductMonth(rows, m, objectId)
    if (!p || p.n <= 0) continue
    out.push({ month: m, label: longMonth(m).slice(0, 3), k: pick(p), n: p.n, filling: filling(m), current: m === monthStartOf(month), version: p.catalogueVersion })
  }
  return out
}

/** Rows of subjects, counted in the category and each of the client's
 *  products there with a video this month (most first, at most
 *  COMPARE_PRODUCTS), with each product's pairs banded. Null where the
 *  category's subjects were not read or it has none. PURE. */
export function buildCompare(input: {
  month: string
  group: { id: string; name: string }
  products: readonly { id: string; name: string; videos: number | null }[]
  crosses: ReadonlyMap<string, Crosses>
  focus?: string | null
}): Compare | null {
  const gc = input.crosses.get(setKey('group', input.group.id))
  if (!gc || gc.n === 0) return null
  if (gc.subjects.length === 0) {
    // NOT MEASURED YET (ruling U6): the table keeps its shape, each row a
    // subject's name and every cell empty, the category's included.
    const pending = (gc.pending ?? []).slice(0, COMPARE_ROWS)
    if (pending.length === 0) return null
    const named = [...input.products].filter((p) => (p.videos ?? 0) > 0)
      .sort((a, b) => (a.id === input.focus ? -1 : b.id === input.focus ? 1 : 0) || (b.videos ?? 0) - (a.videos ?? 0))
    const shown = (named.length > 0 ? named : [...input.products].sort((a, b) => (a.id === input.focus ? -1 : b.id === input.focus ? 1 : 0)))
      .slice(0, input.focus ? 1 : COMPARE_PRODUCTS)
    return {
      columns: [{ key: input.group.id, label: `All ${input.group.name.toLowerCase()}`, tone: 'market' }, ...shown.map((p) => ({ key: p.id, label: p.name, tone: 'you' as const }))],
      rows: pending.map((x) => ({ key: x.id, label: x.label, cells: [null, ...shown.map(() => null)] })),
      verdicts: [],
      empty: 'pending',
    }
  }
  const ranked = [...input.products].filter((p) => (p.videos ?? 0) > 0 && (input.crosses.get(setKey('product', p.id))?.n ?? 0) > 0)
    .sort((a, b) => (a.id === input.focus ? -1 : b.id === input.focus ? 1 : 0) || (b.videos ?? 0) - (a.videos ?? 0))
    .slice(0, COMPARE_PRODUCTS)
  const categoryColumn: CompareColumn = { key: input.group.id, label: `All ${input.group.name.toLowerCase()}`, tone: 'market' }
  // NONE NAMED (the parity pass): the table keeps its shape. The category's
  // column is counted; the products' columns (the open product, else the
  // category's first in the shelf's order) are drawn with empty cells, since
  // a product with no video has nothing to count, never "0 of 0".
  if (ranked.length === 0) {
    const empty = [...input.products].sort((a, b) => (a.id === input.focus ? -1 : b.id === input.focus ? 1 : 0)).slice(0, input.focus ? 1 : COMPARE_PRODUCTS)
    return {
      columns: [categoryColumn, ...empty.map((p) => ({ key: p.id, label: p.name, tone: 'you' as const }))],
      rows: gc.subjects.slice(0, COMPARE_ROWS).map((s) => ({ key: s.id, label: s.label, cells: [{ k: s.k, n: gc.n }, ...empty.map(() => null)] })),
      verdicts: [],
      empty: empty.some((p) => (p.videos ?? 0) > 0) ? 'not_read' : 'none_named',
    }
  }
  const columns: CompareColumn[] = [
    categoryColumn,
    ...ranked.map((p) => ({ key: p.id, label: p.name, tone: 'you' as const })),
  ]
  const verdicts: Verdict[] = []
  // THE BOLD CELL (the board's): each product's own largest subject, the
  // cell to read first in its column. A weight, never a comparison claim:
  // the pairs are banded below and worded only where one clears.
  const topOf = new Map(ranked.map((p) => [p.id, input.crosses.get(setKey('product', p.id))!.subjects[0]?.id ?? null]))
  const rows: CompareRow[] = gc.subjects.slice(0, COMPARE_ROWS).map((s) => {
    const cells: (CompareCell | null)[] = [{ k: s.k, n: gc.n }]
    for (const p of ranked) {
      const pc = input.crosses.get(setKey('product', p.id))!
      const k = pc.subjects.find((x) => x.id === s.id)?.k ?? 0
      cells.push({ k, n: pc.n, ...(k > 0 && topOf.get(p.id) === s.id ? { highlight: true } : {}) })
      verdicts.push(productAgainstCategory({ product: p, subject: s, month: input.month, product_: { k, n: pc.n }, category: { k: s.k, n: gc.n } }))
    }
    return { key: s.id, label: s.label, cells }
  })
  return { columns, rows, verdicts }
}

// ---- the page, from its reads -----------------------------------------------------------

/** What the page is built from: every read the loader makes, or a fixture's
 *  row-shaped stand-in for it. */
export interface ProductsInput {
  clientId: string
  client: string
  /** The reading month, 'YYYY-MM-01', and whether it is still being read. */
  month: string
  soFar: boolean
  /** The instant the month was read at, for its label (decision 3,
   *  `readingMonthLabel`). Omitted: no label. */
  now?: string
  /** The catalogue's read; null where it failed. */
  catalogue: CatalogueRead | null
  /** PRODUCT_READINGS_ENABLED for the tenant. */
  enabled: boolean
  /** The stored product months, up to the reading month; null where the read
   *  failed. */
  rows: readonly ProductMonthRow[] | null
  /** The month's videos (`product_month_videos`, every audience, an own post
   *  marked `owned`), for the sets. Null where not read. */
  market: readonly { id: string; audience: string; platform: string; owned?: boolean }[] | null
  /** What stands on every text of the month (`standingPlacements`). Null
   *  where not read. */
  standing: ReadonlyMap<TextKey, StandingText> | null
  /** The crosses by set key (`setKey`); a set not read is absent. */
  crosses: ReadonlyMap<string, Crosses>
  pair: PairOn | null
  params: ProductsParams
  canTag: boolean
  /** The open panel's own reads (`PanelReads`), where one is open. */
  panelReads?: PanelReads | null
  /** Whether a month is still filling (the freeze rule; a fixture names it). */
  filling?: (month: string) => boolean
}

/** A candidate quote or line, read for a panel: the text, its translation
 *  and the video it sits under. */
export interface TextRead {
  key: string
  videoId: string
  commentId: string | null
  /** The comment's words; null for a video's content. */
  text: string | null
  lang: string | null
  english: string | null
  date: string | null
  platform: string | null
  account: string | null
  videoUrl: string | null
  /** The platform's own comment id (a YouTube comment's deep link). */
  platformCommentId: string | null
  /** The quote gate's context; undefined where none was read. */
  video?: QuoteVideo | null
}

export interface PanelReads {
  /** The open category's couldn't-tell-which texts, newest first. */
  unclear?: TextRead[]
  /** The open product's comments naming it, newest first. */
  named?: TextRead[]
}

/** Which item `params` opens: a product, else a category. One at a time; an
 *  id that is not in the catalogue opens nothing. */
export function openOf(catalogue: Pick<ProductCatalogue, 'groups' | 'products'> | null, params: ProductsParams): { kind: OpenKind; id: string } | null {
  if (!catalogue) return null
  if (params.product && catalogue.products.some((p) => p.id === params.product)) return { kind: 'product', id: params.product }
  if (params.group && catalogue.groups.some((g) => g.id === params.group)) return { kind: 'group', id: params.group }
  return null
}

/** The cite under a line: "TikTok · 6 Oct · video by @stepbystep.amp". */
export function citeOf(t: Pick<TextRead, 'platform' | 'date' | 'account'>): string {
  return [
    t.platform ? platformLabel(t.platform) : null,
    t.date ? shortDate(t.date) : null,
    t.account ? `video by ${t.account.startsWith('@') || t.platform === 'reddit' ? t.account : `@${t.account}`}` : null,
  ].filter(Boolean).join(' · ')
}

const gateInputOf = (t: TextRead): GateInput => ({ text: t.text ?? '', lang: t.lang, english: t.english, ...(t.video !== undefined ? { video: t.video } : {}) })

/** The couldn't-tell-which lines: a comment prints where the quote gate
 *  passes it (the market block's gate), a video's content always (it carries
 *  no commenter's words); a comment the gate refuses is counted, not shown.
 *  PURE. */
export function unclearLines(texts: readonly TextRead[], clientId: string, limit: number): { lines: UnclearLine[]; more: number; withheld: number } {
  // The client's own audience is the market here (the basis): a comment
  // under a creator's video about the client, or under its own post, prints.
  const gate = gateFor(clientId, { allowOwn: true })
  const lines: UnclearLine[] = []
  let withheld = 0
  for (const t of texts) {
    const link = citationLink(t.platform, t.videoUrl, t.platformCommentId)
    if (t.commentId == null || t.text == null) {
      lines.push({ key: t.key, videoId: t.videoId, commentId: null, quote: null, cite: citeOf(t), watchHref: link.href })
      continue
    }
    if (!quoteGate(gateInputOf(t), gate).ok) { withheld++; continue }
    lines.push({ key: t.key, videoId: t.videoId, commentId: t.commentId, quote: { text: t.text, english: t.english, lang: t.lang }, cite: citeOf(t), watchHref: link.href })
  }
  return { lines: lines.slice(0, limit), more: Math.max(0, lines.length - limit), withheld }
}

/** A product's quotes: its comments that pass the gate, newest first, one a
 *  video, at most PRODUCT_QUOTES. PURE. */
export function productQuotes(texts: readonly TextRead[], clientId: string): ProductsQuote[] {
  // The client's own audience is the market here (the basis): a comment
  // under a creator's video about the client, or under its own post, prints.
  const gate = gateFor(clientId, { allowOwn: true })
  const out: ProductsQuote[] = []
  const videos = new Set<string>()
  const seen = new Set<string>()
  for (const t of texts) {
    if (out.length >= PRODUCT_QUOTES) break
    if (!t.text || videos.has(t.videoId)) continue
    const words = (t.english ?? t.text).replace(/\s+/g, ' ').trim().toLowerCase()
    if (seen.has(words) || !quoteGate(gateInputOf(t), gate).ok) continue
    videos.add(t.videoId)
    seen.add(words)
    out.push({ key: t.key, text: t.text, english: t.english, lang: t.lang, cite: citeOf(t) })
  }
  return out
}

const EMPTY_HEADER = { categories: 0, products: 0 }

/** The page, from its reads. PURE. */
export function buildProductsData(input: ProductsInput): ProductsData {
  const month = monthStartOf(input.month)
  const base: ProductsData = {
    state: 'failed', client: input.client || 'You', month, soFar: input.soFar,
    monthWords: monthWordsOf(month, input.soFar), monthLabel: input.now ? readingMonthLabel(month, input.now) : null, monthName: longMonth(month),
    catalogue: EMPTY_HEADER, settingsHref: productsTabHref(), empty: PRODUCTS_FAILED, market: null, header: null,
    standouts: [], slots: [], months: [], shelf: [], canTag: input.canTag, params: input.params, open: null, panel: null,
  }
  const read = input.catalogue
  if (!read) return base
  if (read.state === 'missing') return { ...base, state: 'not_applied', empty: PRODUCTS_NOT_APPLIED }
  if (read.state === 'empty') return { ...base, state: 'no_catalogue', empty: PRODUCTS_NO_CATALOGUE }
  const catalogue = read.catalogue
  const counts = { categories: catalogue.groups.length, products: catalogue.products.length }
  const groupOfProduct = new Map(catalogue.products.map((p) => [p.id, p.group_id]))
  // The catalogue on the shelf with no count (every head "Not read yet"): a
  // state that has the list but no reading of the month still draws it.
  const unreadShelf = () => buildShelf({ month, catalogue, rows: [], pair: null, firsts: new Map(), crosses: new Map(), params: input.params, open: null, groupOfProduct })
  const withCatalogue = { ...base, catalogue: counts, shelf: unreadShelf() }
  if (!input.enabled) return { ...withCatalogue, state: 'not_on', empty: PRODUCTS_NOT_ON }
  if (!input.rows) return withCatalogue
  const rows = input.rows
  const months = monthOptions(rows, month, input.params, input.now ?? null)
  const market = marketVideosOf(rows, month)
  if (market == null) return { ...withCatalogue, months, state: 'unread', empty: productsUnread(month) }

  const filling = input.filling ?? ((m: string) => m === month && input.soFar)
  const open = openOf(catalogue, input.params)
  const firsts = new Map<string, NonNullable<ReturnType<typeof firstMonthOf>>>()
  for (const p of catalogue.products) {
    const f = firstMonthOf({ product: p, month, rows })
    if (f) firsts.set(p.id, f)
  }
  const shelf = buildShelf({ month, catalogue, rows, pair: input.pair, firsts, crosses: input.crosses, params: input.params, open, groupOfProduct })
  const splits = new Map<string, PooledProductMonth>()
  for (const g of catalogue.groups) {
    const s = marketProductMonth(rows, month, g.id)
    if (s) splits.set(g.id, s)
  }
  const standouts = pickStandouts({ month, params: input.params, catalogue, shelf, firsts, crosses: input.crosses, splits })
  const slots = standoutSlots({ month, params: input.params, catalogue, shelf, rows, crosses: input.crosses, splits, picked: standouts })
  const cameUp = shelf.reduce((s, c) => s + c.products.filter((p) => (p.videos ?? 0) > 0).length, 0)
  const sets = input.market && input.standing
    ? productMonthSets({ month, market: input.market, standing: input.standing, groups: catalogue.groups.map((g) => g.id), products: catalogue.products.map((p) => p.id) })
    : null
  // THE DISTINCT VIDEOS are printed only where the sets agree with the stored
  // months (a frozen month read under an older catalogue may not): a figure
  // that disagrees with the shelf beside it is not printed at all.
  const agrees = sets != null && [...splits.entries()].every(([g, s]) => sets.groups.get(g)?.any.size === s.k_any)
  const data: ProductsData = {
    ...withCatalogue,
    state: 'ready',
    empty: null,
    market,
    header: { cameUp, products: catalogue.products.length, videos: agrees ? sets!.all.size : null },
    standouts,
    slots,
    months,
    shelf,
    open,
  }
  if (!open) return data
  return { ...data, panel: buildPanel({ input, data, catalogue, rows, open, filling, splits }) }
}

function buildPanel(a: {
  input: ProductsInput
  data: ProductsData
  catalogue: ProductCatalogue
  rows: readonly ProductMonthRow[]
  open: { kind: OpenKind; id: string }
  filling: (month: string) => boolean
  splits: ReadonlyMap<string, PooledProductMonth>
}): ProductsPanel | null {
  const { input, data, catalogue, rows, open } = a
  const month = data.month
  const groups = [...catalogue.groups].sort((x, y) => x.sort - y.sort)
  const closeHref = productsHref(input.params)
  if (open.kind === 'group') {
    const g = catalogue.groups.find((x) => x.id === open.id)
    const col = data.shelf.find((c) => c.id === open.id)
    if (!g || !col) return null
    const split = a.splits.get(g.id) ?? null
    const all = input.params.unclear === 'all'
    const texts = input.panelReads?.unclear ?? []
    const listed = unclearLines(texts, input.clientId, all ? UNCLEAR_ALL : UNCLEAR_SHOWN)
    const withAll = unclearLines(texts, input.clientId, UNCLEAR_ALL)
    return {
      kind: 'group', id: g.id, name: g.name, notchAt: notchFor(groups, g.id), closeHref,
      askHref: askHref(`What does my market say about ${g.name.toLowerCase()}?`),
      settingsHref: productsTabHref(g.id),
      crosses: input.crosses.get(setKey('group', g.id)) ?? null,
      line: monthLine(rows, month, g.id, (p) => p.k_any, a.filling),
      compare: buildCompare({ month, group: g, products: col.products, crosses: input.crosses }),
      share: col.share, verdict: col.verdict,
      products: col.products.length, cameUp: col.products.filter((p) => (p.videos ?? 0) > 0).length,
      split: split ? { any: split.k_any, named: split.k_named, unclear: split.k_unclear, unbranded: split.k_unbranded } : null,
      unclear: {
        videos: split?.k_unclear ?? 0,
        lines: listed.lines,
        more: all ? 0 : listed.more,
        withheld: listed.withheld,
        allHref: !all && listed.more > 0 ? productsHref(input.params, open, { all: true, at: 'unclear' }) : null,
        options: input.canTag && withAll.lines.length > 0 ? tagOptions(catalogue, g.id) : [],
      },
    }
  }
  const p = catalogue.products.find((x) => x.id === open.id)
  if (!p) return null
  const g = catalogue.groups.find((x) => x.id === p.group_id)
  const col = data.shelf.find((c) => c.id === p.group_id)
  const mine = marketProductMonth(rows, month, p.id)
  const tile = col?.products.find((x) => x.id === p.id)
  return {
    kind: 'product', id: p.id, name: p.name, groupId: p.group_id, groupName: g?.name ?? '',
    notchAt: notchFor(groups, p.group_id), closeHref,
    askHref: askHref(`What does my market say about ${p.name}?`),
    settingsHref: productsTabHref(p.group_id),
    crosses: input.crosses.get(setKey('product', p.id)) ?? null,
    line: monthLine(rows, month, p.id, (x) => x.k_named, a.filling),
    compare: g && col ? buildCompare({ month, group: g, products: col.products.filter((x) => x.id === p.id), crosses: input.crosses, focus: p.id }) : null,
    flag: tile?.flag ?? null,
    videos: mine?.k_named ?? null,
    market: mine?.n ?? null,
    categoryVideos: col?.videos ?? null,
    categoryUnbranded: a.splits.get(p.group_id)?.k_unbranded ?? null,
    comments: mine?.comments ?? null,
    quotes: productQuotes(input.panelReads?.named ?? [], input.clientId),
  }
}

// ---- the Dashboard's tile (T8) ------------------------------------------------------------

/** The Dashboard's Your products tile (T8; board E1-Dashboard). PINNED by the
 *  lead: extra fields are optional. */
export interface TopProducts {
  state: 'not_applied' | 'no_catalogue' | 'not_on' | 'quiet' | 'ready'
  /** The month the figures read, "September" (or "October so far"). */
  monthWords: string
  /** Decision 3: the tile's label where the month is not the current
   *  calendar month (`readingMonthLabel`), else null. Optional: a dump from
   *  before it carries none. */
  monthLabel?: string | null
  standout: {
    /** The kind of standout, words only, no digits. */
    label: string
    /** The product's or the category's name. */
    name: string
    /** Its videos this month. */
    k: number
    /** The base it is "of", or null when the tile prints k alone. */
    n: number | null
    /** Into the open panel. */
    href: string
  } | null
  /** Your products, or Settings › Your products when there is no catalogue. */
  href: string
  /** OPTIONAL. Why a `quiet` tile has nothing: the month has not been read
   *  for products (`unread`) or the read failed (`failed`). Absent: nothing
   *  in the catalogue came up. */
  note?: 'unread' | 'failed'
  /** OPTIONAL. Products with a video this month, of the catalogue's. */
  cameUp?: number
  products?: number
  /** OPTIONAL. The board's small shelf: the page's own shelf (`data.shelf`,
   *  `buildShelf`), a column a category in its order, each product's videos
   *  this month (null where it was not read: switched off, the month not read
   *  yet, or no row for it), cut as the page cuts it (`shelfCut`: the first
   *  SHELF_TILES tiles, then `more`, the page's "+N more"). Every state with
   *  a catalogue carries it but a failed read. */
  columns?: { id: string; name: string; products: { id: string; videos: number | null }[]; more?: number; named?: number | null }[]
}

/** The tile's mini shelf from the page's shelf, column by column, cut as the
 *  page cuts it, with how many of the whole column came up (`named`; null
 *  where none of it was read), so the shelf's words count past the cut. PURE. */
export function miniShelfOf(shelf: readonly ShelfCategoryView[]): NonNullable<TopProducts['columns']> {
  return shelf.map((c) => {
    const { shown, more } = shelfCut(c.products)
    const named = c.products.every((p) => p.videos == null) ? null : c.products.filter((p) => (p.videos ?? 0) > 0).length
    return { id: c.id, name: c.name, products: shown.map((p) => ({ id: p.id, videos: p.videos })), more, named }
  })
}

/** The standout's label on the tile, per card. */
export const TOP_LABELS: Readonly<Record<'first' | 'most', string>> = {
  first: 'Came up for the first time',
  most: 'Talked about most',
}

/** The tile, from the page's level 1 (no crosses: the tile reads none). The
 *  standout is a product's first month with videos, else the product with
 *  the most videos, else the category with the most. PURE. */
export function topProductsOf(data: Pick<ProductsData, 'state' | 'monthWords' | 'shelf' | 'header' | 'market' | 'params'> & { monthLabel?: string | null }, firsts: readonly FirstStandout[] = []): TopProducts {
  const href = PRODUCTS_HREF
  // A state that reads no month carries no month's label either.
  const readsMonth = data.state !== 'not_applied' && data.state !== 'no_catalogue' && data.state !== 'not_on'
  const base = { monthWords: data.monthWords, monthLabel: readsMonth ? data.monthLabel ?? null : null, standout: null, href }
  // The page's shelf, as the page draws it, in every state that has one: the
  // catalogue unshaded where its month was not read (`buildProductsData`
  // fills the shelf with no count), shaded by the month's videos where it was.
  const columns = miniShelfOf(data.shelf)
  const shelf = columns.length > 0 ? { columns } : {}
  switch (data.state) {
    case 'not_applied': return { ...base, state: 'not_applied' }
    case 'no_catalogue': return { ...base, state: 'no_catalogue', href: productsTabHref() }
    case 'not_on': return { ...base, state: 'not_on', ...shelf }
    case 'unread': return { ...base, state: 'quiet', note: 'unread', ...shelf }
    case 'failed': return { ...base, state: 'quiet', note: 'failed' }
    default: break
  }
  const extra = { cameUp: data.header?.cameUp ?? 0, products: data.header?.products ?? 0, columns }
  const first = firsts[0]
  if (first) {
    return { ...base, ...extra, state: 'ready', standout: { label: TOP_LABELS.first, name: first.name, k: first.videos, n: null, href: first.href } }
  }
  const products = data.shelf.flatMap((c) => c.products).flatMap((p) => ((p.videos ?? 0) > 0 ? [{ ...p, videos: p.videos as number }] : [])).sort((a, b) => b.videos - a.videos)
  if (products[0]) {
    return { ...base, ...extra, state: 'ready', standout: { label: TOP_LABELS.most, name: products[0].name, k: products[0].videos, n: data.market, href: products[0].href } }
  }
  const groups = data.shelf.flatMap((c) => ((c.videos ?? 0) > 0 ? [{ ...c, videos: c.videos as number }] : [])).sort((a, b) => b.videos - a.videos)
  if (groups[0]) {
    return { ...base, ...extra, state: 'ready', standout: { label: TOP_LABELS.most, name: groups[0].name, k: groups[0].videos, n: data.market, href: groups[0].href } }
  }
  return { ...base, ...extra, state: 'quiet' }
}

// ---- the reads ---------------------------------------------------------------------

const say = (what: string, e: unknown) => console.error(`[products] ${what}: ${(e as { message?: string })?.message ?? String(e)}`)

/** A product_mentions row as the page reads it. */
export type MentionRead = PlacedRow & { rule_version: string; catalogue_version: string; tag_id: string | null }
const MENTION_COLUMNS = 'id, video_id, source, comment_id, comment_month, placement, product_id, group_id, method, rule_version, catalogue_version, tag_id'

/**
 * The month's placements, paged (`selectAll`): every content row and every
 * comment row dated in the month under the month's catalogue version, every
 * tag's own placement row (where a tagged comment's month is read from), and
 * every tag. What stands on each text is `standingPlacements`' answer. Null
 * where the products migration is not applied.
 */
export async function loadMonthPlacements(db: SupabaseClient, clientId: string, input: { month: string; version: string; catalogue: Pick<ProductCatalogue, 'groups' | 'products'> }): Promise<Map<TextKey, StandingText> | null> {
  const month = monthStartOf(input.month)
  try {
    const [content, comments, tagRows, tags] = await Promise.all([
      selectAll<MentionRead>(() => db.from(TABLE_PRODUCT_MENTIONS).select(MENTION_COLUMNS)
        .eq('client_id', clientId).eq('catalogue_version', input.version).eq('source', 'content').order('id')),
      selectAll<MentionRead>(() => db.from(TABLE_PRODUCT_MENTIONS).select(MENTION_COLUMNS)
        .eq('client_id', clientId).eq('catalogue_version', input.version).eq('source', 'comment').eq('comment_month', month).order('id')),
      selectAll<MentionRead>(() => db.from(TABLE_PRODUCT_MENTIONS).select(MENTION_COLUMNS)
        .eq('client_id', clientId).eq('method', 'tag').order('id')),
      selectAll<ProductTagRow>(() => db.from(TABLE_PRODUCT_TAGS).select(PRODUCT_TAG_COLUMNS).eq('client_id', clientId).order('id')),
    ])
    const tagMonths = new Map(tagRows.filter((r) => r.tag_id && r.comment_month).map((r) => [r.tag_id!, monthStartOf(String(r.comment_month))]))
    return standingPlacements({
      rows: placementsInPlay([...content, ...comments].map((r) => ({ ...r, comment_month: r.comment_month ? monthStartOf(String(r.comment_month)) : null })), input.version),
      tags: standingTags(tags),
      tagMonths,
      active: { groups: new Set(input.catalogue.groups.map((g) => g.id)), products: new Set(input.catalogue.products.map((p) => p.id)) },
    })
  } catch (e) {
    if (isMissingProductsSchema(e)) return null
    throw e
  }
}

const RPC_LENS_READINGS = 'lens_readings'
const LENS_CONCURRENCY = 3

/** `lens_readings` over each set (never an empty one: a null or empty set
 *  reads the whole market), one call a set. */
async function readLens(handle: ReadingHandle, month: string, sets: readonly { key: string; ids: readonly string[] }[]): Promise<Map<string, LensRowIn[]>> {
  const out = new Map<string, LensRowIn[]>()
  const todo = sets.filter((s) => s.ids.length > 0)
  await mapWithLimit([...todo], LENS_CONCURRENCY, async (s) => {
    const rows = await selectAll<LensRowIn>(() =>
      handle.client.rpc(RPC_LENS_READINGS, {
        p_client: handle.clientId, p_month: monthStartOf(month), p_run: null, p_video_ids: [...s.ids].sort(), p_min_dated_comments: 1, p_captured_before: null,
      }).order('audience').order('object_kind').order('object_id'),
    )
    out.set(s.key, rows)
  })
  return out
}

/** The client's active subjects, each with its check's state
 *  (`subjectCalibration`, the three states Market reads), in their own order
 *  (named first). */
async function readSubjects(handle: ReadingHandle): Promise<Map<string, SubjectRead>> {
  const rows = await loadActiveSubjects(handle.client as never, handle.clientId)
  return new Map(rows.filter((r) => r.name).map((r) => [String(r.id), { name: String(r.name), state: subjectCalibration(r) }]))
}

/** The texts behind a panel's list: the comments' words and dates, their
 *  videos' platform, account and link, the translations, and the quote
 *  gate's context. Newest first. */
async function readTexts(handle: ReadingHandle, texts: readonly StandingText[], cap: number): Promise<TextRead[]> {
  const { client, clientId } = handle
  const commentIds = [...new Set(texts.map((t) => t.commentId).filter((x): x is string => !!x))]
  type CommentRow = { id: string; text: string | null; comment_date: string | null; platform: string | null; video_id: string | null; comment_id: string | null }
  const comments: CommentRow[] = []
  for (const part of chunk(commentIds, UUID_IN_CHUNK)) {
    const res = await client.from('comments').select('id, text, comment_date, platform, video_id, comment_id').eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`comments: ${res.error.message}`)
    comments.push(...((res.data ?? []) as CommentRow[]))
  }
  const byComment = new Map(comments.map((c) => [String(c.id), c]))
  const ordered = [...texts].sort((a, b) => {
    const da = a.commentId ? byComment.get(a.commentId)?.comment_date ?? '' : ''
    const db = b.commentId ? byComment.get(b.commentId)?.comment_date ?? '' : ''
    return db.localeCompare(da) || (a.commentId ?? '').localeCompare(b.commentId ?? '')
  }).slice(0, cap)
  const videoIds = [...new Set(ordered.map((t) => t.videoId))]
  type VideoRow = { id: string; platform: string | null; video_id: string | null; video_url: string | null; account_name: string | null }
  const videos = new Map<string, VideoRow>()
  await mapWithLimit(chunk(videoIds, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await client.from('videos').select('id, platform, video_id, video_url, account_name').eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`videos: ${res.error.message}`)
    for (const v of (res.data ?? []) as VideoRow[]) videos.set(String(v.id), v)
  })
  const words = ordered.map((t) => (t.commentId ? byComment.get(t.commentId)?.text ?? '' : '')).filter(Boolean)
  const [translations, context] = await Promise.all([
    readTranslations(client, words),
    readQuoteContext(client, clientId, { videoUuids: videoIds }, client).catch((e: unknown) => { say('quote context', e); return null }),
  ])
  return ordered.map((t): TextRead => {
    const c = t.commentId ? byComment.get(t.commentId) : undefined
    const v = videos.get(t.videoId)
    const reading = c?.text ? readingOf(translations, c.text) : null
    return {
      key: t.commentId ? `c:${t.commentId}` : contentKey(t.videoId),
      videoId: t.videoId,
      commentId: t.commentId,
      text: c?.text ?? null,
      lang: reading?.lang ?? null,
      english: reading?.english ?? null,
      date: c?.comment_date ?? null,
      platform: v?.platform ?? c?.platform ?? null,
      account: v?.account_name ?? null,
      videoUrl: v?.video_url ?? null,
      platformCommentId: c?.comment_id ?? null,
      video: context ? context.forVideoUuid(t.videoId) : undefined,
    }
  })
}

export interface ProductsLoadInput {
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  params: ProductsParams
  role: Role
  now?: string
}

/** The page's month (`loadReadingMonth`, the month every reading page
 *  reads), its first read; the calendar month where it cannot be read.
 *  Settings › Your products reads the same month. */
export function productsMonth(supabase: SupabaseClient, handle: ReadingHandle, now: string): Promise<{ month: string; soFar: boolean }> {
  return monthOf(supabase, handle, now, null)
}

/** The page's month (`loadReadingMonth`), its first read. */
async function monthOf(supabase: SupabaseClient, handle: ReadingHandle, now: string, explicit: string | null): Promise<{ month: string; soFar: boolean }> {
  const rm = await loadReadingMonth(supabase, handle, now, { explicit }).catch((e: unknown) => { say('month', e); return null })
  return { month: monthStartOf(rm?.month ?? now), soFar: rm ? rm.state === 'so_far' : true }
}

/**
 * Level 1, and the open panel. Three waves, each part failing alone:
 *   1. the month, the catalogue, the workspace's name;
 *   2. the stored product months (back HISTORY_MONTHS), and, where the month
 *      holds rows: the month's market, its placements and the month-pair judge;
 *   3. the crosses: each category with a video, and each product with at
 *      least STANDOUT_MIN (one `lens_readings` call a set), the subjects'
 *      names; and the open panel's texts.
 * Nothing past wave 1 is read for a state that prints no count.
 */
export async function loadProducts(input: ProductsLoadInput): Promise<ProductsData> {
  const { supabase, clientId, reading: handle, params } = input
  const now = input.now ?? new Date().toISOString()
  const canTag = canManageTenant(input.role)

  // ---- wave 1
  const [{ month, soFar }, catalogue, client] = await Promise.all([
    monthOf(supabase, handle, now, params.month ?? null),
    loadProductCatalogue(handle.client, clientId).catch((e: unknown) => { say('catalogue', e); return null }),
    loadCompanyName(handle).catch(() => ''),
  ])
  const enabled = productReadingsEnabled(clientId)
  const shell: ProductsInput = {
    clientId, client, month, soFar, now, catalogue, enabled, rows: null, market: null, standing: null,
    crosses: new Map(), pair: null, params, canTag,
  }
  if (!catalogue || catalogue.state !== 'ready' || !enabled) return buildProductsData(shell)
  const cat = catalogue.catalogue

  // ---- wave 2
  const rows = await loadMonthProductReadings(handle.client, clientId, monthsToRead(month, now))
    .then((r) => r as ProductMonthRow[])
    .catch((e: unknown) => { if (isMissingProductsSchema(e)) return [] as ProductMonthRow[]; say('months', e); return null })
  if (!rows || marketVideosOf(rows, month) == null) return buildProductsData({ ...shell, rows })
  const version = versionOf(rows, month) ?? cat.version
  const [market, standing, pair] = await Promise.all([
    readProductMonthVideos(handle.client, clientId, month).catch((e: unknown) => { say('month videos', e); return null }),
    loadMonthPlacements(handle.client, clientId, { month, version, catalogue: cat }).catch((e: unknown) => { say('placements', e); return null }),
    loadPairOn(handle, now),
  ])

  // ---- wave 3
  const sets = market && standing
    ? productMonthSets({ month, market, standing, groups: cat.groups.map((g) => g.id), products: cat.products.map((p) => p.id) })
    : null
  const open = openOf(cat, params)
  const wanted: { key: string; ids: readonly string[] }[] = []
  if (sets) {
    for (const g of cat.groups) wanted.push({ key: setKey('group', g.id), ids: [...(sets.groups.get(g.id)?.any ?? [])] })
    for (const p of cat.products) {
      const ids = [...(sets.products.get(p.id) ?? [])]
      if (ids.length >= STANDOUT_MIN || (open && ids.length > 0 && (open.id === p.id || (open.kind === 'group' && open.id === p.group_id)))) wanted.push({ key: setKey('product', p.id), ids })
    }
  }
  const [lens, subjectNames, panelReads] = await Promise.all([
    wanted.length ? readLens(handle, month, wanted).catch((e: unknown) => { say('lens', e); return null }) : Promise.resolve(new Map<string, LensRowIn[]>()),
    wanted.length ? readSubjects(handle).catch((e: unknown) => { say('subjects', e); return new Map<string, SubjectRead>() }) : Promise.resolve(new Map<string, SubjectRead>()),
    open && sets && standing ? readPanelTexts(handle, month, open, sets, standing).catch((e: unknown) => { say('panel texts', e); return null }) : Promise.resolve(null),
  ])
  const crosses = new Map<string, Crosses>()
  for (const [key, r] of lens ?? []) crosses.set(key, crossesOf(r, subjectNames))
  return buildProductsData({ ...shell, rows, market, standing, crosses, pair, panelReads })
}

/** The open panel's texts: a category's couldn't-tell-which list, or a
 *  product's comments naming it. */
async function readPanelTexts(handle: ReadingHandle, month: string, open: { kind: OpenKind; id: string }, sets: ProductMonthSets, standing: ReadonlyMap<TextKey, StandingText>): Promise<PanelReads> {
  if (open.kind === 'group') {
    const videos = sets.groups.get(open.id)?.unclear ?? new Set<string>()
    return { unclear: await readTexts(handle, unclearTexts(standing, month, open.id, videos), UNCLEAR_ALL * 2) }
  }
  const videos = sets.products.get(open.id) ?? new Set<string>()
  return { named: await readTexts(handle, namedComments(standing, month, open.id, videos), 40) }
}

/**
 * The Dashboard's tile (T8): the month, the catalogue and the month's
 * product rows, in one wave after the month; no placement, cross or text
 * read. Never throws: a failed read is a `quiet` tile with `note: 'failed'`.
 */
export async function topProducts(input: { supabase: SupabaseClient; clientId: string; reading: ReadingHandle; now?: string }): Promise<TopProducts> {
  const { supabase, clientId, reading: handle } = input
  const now = input.now ?? new Date().toISOString()
  try {
    const [{ month, soFar }, catalogue] = await Promise.all([
      monthOf(supabase, handle, now, null),
      loadProductCatalogue(handle.client, clientId).catch((e: unknown) => { say('top.catalogue', e); return null }),
    ])
    const enabled = productReadingsEnabled(clientId)
    const shell: ProductsInput = {
      clientId, client: '', month, soFar, now, catalogue, enabled, rows: null, market: null, standing: null,
      crosses: new Map(), pair: null, params: {}, canTag: false,
    }
    let rows: ProductMonthRow[] | null = null
    if (catalogue?.state === 'ready' && enabled) {
      rows = await loadMonthProductReadings(handle.client, clientId, monthsBack(month, HISTORY_MONTHS))
        .then((r) => r as ProductMonthRow[])
        .catch((e: unknown) => { if (isMissingProductsSchema(e)) return [] as ProductMonthRow[]; say('top.months', e); return null })
    }
    const data = buildProductsData({ ...shell, rows })
    return topProductsOf(data, data.standouts.filter((s): s is FirstStandout => s.kind === 'first'))
  } catch (e) {
    say('top', e)
    return { state: 'quiet', monthWords: '', standout: null, href: PRODUCTS_HREF, note: 'failed' }
  }
}

/** For a test: the figures a header prints, in words. */
export const headerWords = (h: NonNullable<ProductsData['header']>): string =>
  `${fmtInt(h.cameUp)} of your ${fmtInt(h.products)} products came up${h.videos != null ? ` · ${fmtInt(h.videos)} videos about them or their categories` : ''}`
