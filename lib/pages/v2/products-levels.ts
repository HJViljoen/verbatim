import { tagOptions, type TagOption } from '../../products/tags'
import type { ProductCatalogue } from '../../products/types'
import type { StandingText, TextKey } from '../../products/match'
import { longMonth, platformLabel, shortDate } from '../../format'
import { gateFor } from '../../quote-context'
import { quoteGate } from '../../quote-gate'
import { loadGroupSubjects, type MarketVideo } from '../../reading/cross'
import { monthStartOf, prevMonth } from '../../reading/month-key'
import { freezeStateFor } from '../../reading/monthly'
import type { ReadingHandle } from '../../reading/read'
import type { Verdict } from '../../reading/verdicts'
import { marketSubjectHref, surface } from '../../nav'
import { productsTabHref } from '../../settings/products'
import type { Crumb, CrumbItem, CrumbMenu } from '../crumbs'
import { voicesHref } from './voices'
import {
  askHref, buildCompare, buildProductsData, marketProductMonth, namedComments, PRODUCT_KIND_LABELS, productQuotes, readCrosses,
  readProductsMonth, readProductsShell, readTextLists, readVideoRows, say, setKey, setsOf, shellReads, UNCLEAR_ALL, UNCLEAR_SHOWN, unclearLines, unclearTexts,
  type Compare, type Crosses, type LevelVideoRow, type LineBar, type ProductMonthRow, type ProductMonthSets, type ProductsData, type ProductsInput,
  type ProductsLoadInput, type ProductsQuote, type ShelfCategoryView, type TextRead, type UnclearLine,
} from './products'
import { productPageHref, productsCategoryPath, productsHref, productsProductPath, PRODUCTS_HREF, WHERE_NAMED_ID, type ProductsParams } from './products-address'

// YOUR PRODUCTS AS PAGES (17 Oct; Heinrich approved the G4 boards with every
// recommendation in their report): a category is the HUB, a product the
// EVIDENCE, each its own address under the root (products-address.ts).
//
//   THE CATEGORY (G4-Products-Category): the path "Your products / Liners"
//   and its switcher (the categories in the shelf's order, a quiet one "Quiet
//   so far", no figure), the title block (three boxes on the kit's yellow,
//   "Category"), then:
//     1. the header card: "{Category} · {month}" and a headline IN CODE'S
//        WORDS (decision 1: no new model step; the root's "Category, not
//        you" rule, `categoryHeadline`), and four figures: its share of the
//        market, the change against last month (its `Verdict`), how many name
//        one of yours, how many are about one of yours but not which;
//     2. "Your {category}": the products that came up, as cards (at most
//        three), then all of them as a list in the shelf's order (the root's
//        cut stays on the root: the hub lists every product);
//     3. the couldn't-tell-which list (`#unclear`) with Tag for owners and
//        admins; "See all" makes it longer on the same page (`?unclear=all`);
//     4. the numbers: month by month, what it's about (each subject opens its
//        page on Market), what people did, who's talking (each group opens in
//        Voices), where;
//     5. your products against the category, subject by subject;
//     6. in their words: a comment naming each product that came up;
//     7. the Agent.
//
//   THE PRODUCT (G4-Products-Product): the path "Your products / Liners /
//   Iceross Seal-In X" and the product's switcher (the category's products in
//   the shelf's order, the quiet ones under a hairline, "Quiet so far"), the
//   title block (a single box on the neutral, "Product in Liners", the
//   category a link up), then:
//     1. one line IN CODE'S WORDS (`productLead`);
//     2. "Where it was named": each video naming it this month, the most
//        comments naming it first, each with the comments naming it under it
//        (the quote gate, own posts' comments included: `allowOwn`), a video
//        whose own words name it marked, an own post marked; four videos,
//        then the rest (`?videos=all`); one video's comments in full
//        (`?video=`);
//     3. the facts: its place in its category (this product, your other
//        products there, one of yours but not which, the category in
//        general), month by month, what people did, what it's about, who's
//        talking, where;
//     4. its siblings; the Agent.
//
// RULES CARRIED OVER FROM THE ROOT: every figure is a month's count over
// every audience pooled (`marketProductMonth`); a comparison is a `Verdict`;
// ruling U6 (a subject whose check has not passed is named with
// SUBJECT_NOT_MEASURED, never counted, ranked or "leading"); decision 3 (a
// month that is not the calendar month carries its label); the parity rule
// (an off, unread or failed page keeps its frame and says so inside it).
//
// PURE HALF FIRST, THEN THE READS.

// ---- the words -------------------------------------------------------------------------

/** An address whose category or product the catalogue does not hold. */
export const CATEGORY_MISSING = 'Your products has no category at this address.'
export const PRODUCT_MISSING = 'Your products has no product at this address.'
export const BACK_TO_PRODUCTS = 'Back to Your products'

/** The hub's headline, in code's words (decision 1 of the G4 board report:
 *  no category read is written). The root's "Category, not you" rule over
 *  the month's exclusive split. No digit, no direction word. PURE. */
export function categoryHeadline(name: string, split: { any: number; named: number; unclear: number; unbranded: number }, monthWords: string): string {
  const word = name.toLowerCase()
  if (split.any <= 0) return `Nobody in your market talked about ${word} in ${monthWords}`
  if (split.unbranded * 2 > split.any) return `${name} talk is mostly about ${word} in general`
  if (split.named * 2 > split.any) return `Most ${word} talk names one of your products`
  if ((split.named + split.unclear) * 2 > split.any) return `Most ${word} talk is about one of your products`
  return `${name} talk is split between yours and ${word} in general`
}

/** "Every", "Almost every", "Most": a share in words, only where it is more
 *  than half (null otherwise). PURE. */
export function shareWord(k: number, n: number): 'Every' | 'Almost every' | 'Most' | null {
  if (n <= 0 || k * 2 <= n) return null
  if (k >= n) return 'Every'
  if (k / n >= 0.75) return 'Almost every'
  return 'Most'
}

/** A kind as a noun, for the product's line ("praise in their comments"). */
const KIND_NOUNS: Readonly<Record<string, string>> = {
  praise: 'praise',
  question: 'questions',
  pain_point: 'complaints',
  purchase_intent: 'talk of buying',
  objection: 'pushback',
  feature_request: 'wishes',
  switching_signal: 'talk of switching',
}

/**
 * The product's one line, in code's words (decision 2 of the G4 board
 * report): what most of its videos are about (its commonest READY subject,
 * where it is on more than half of them) and what most have in their
 * comments (a kind on more than half). "Most", "Almost every" and "Every" are
 * the level's own words, never a rank (the root's focus card's rule), so a
 * subject not measured yet (U6) takes nothing from them: it is never named,
 * and no subject is said to lead it. A quiet month says nobody named it; a
 * month the list was not in yet says so. No digit, no direction word. PURE.
 */
export function productLead(input: { videos: number | null; crosses: Crosses | null; monthWords: string; monthName: string }): string {
  if (input.videos == null) return `Not read yet for ${input.monthWords}: it was not in your list when ${input.monthName} was last read.`
  if (input.videos === 0) return `Nobody in your market named it in ${input.monthWords}.`
  const c = input.crosses
  if (!c || c.n <= 0) return `What the videos naming it are about has not been read for ${input.monthWords} yet.`
  const top = c.subjects[0]
  const sw = top ? shareWord(top.k, c.n) : null
  const kind = c.kinds.find((x) => KIND_NOUNS[x.id])
  const kw = kind ? shareWord(kind.k, c.n) : null
  const subjectPart = sw ? (sw === 'Most' ? `Most videos naming it are about ${top!.label}` : `${sw} video naming it is about ${top!.label}`) : null
  const kindNoun = kind ? KIND_NOUNS[kind.id] : ''
  if (subjectPart && kw) {
    const tail = kw === 'Every' ? `every one has ${kindNoun} in its comments` : kw === 'Almost every' ? `almost every one has ${kindNoun} in its comments` : `most have ${kindNoun} in their comments`
    return `${subjectPart}, and ${tail}.`
  }
  if (subjectPart) return `${subjectPart}.`
  if (kw) return kw === 'Most' ? `Most videos naming it have ${kindNoun} in their comments.` : `${kw} video naming it has ${kindNoun} in its comments.`
  return 'No one subject or kind of comment stands out in the videos naming it.'
}

/** What a product's videos are about, as a card's foot and a list's cell
 *  say it (ruling U6). `top`: a READY subject's level (it is said to lead
 *  only where `leads`); `tie`: two ready subjects level and none pending;
 *  `pending`: no ready subject counted and some not measured yet; `none`:
 *  no subject on its videos; `unread`: not read; `quiet`: no video. PURE. */
export type AboutLine =
  | { kind: 'top'; label: string; k: number; n: number; leads: boolean }
  | { kind: 'tie' | 'pending' | 'none' | 'unread' | 'quiet' }

export function aboutLine(crosses: Crosses | null | undefined, videos: number | null): AboutLine {
  if (videos === 0) return { kind: 'quiet' }
  if (videos == null || !crosses || crosses.n <= 0) return { kind: 'unread' }
  const top = crosses.subjects[0]
  const pending = (crosses.pending?.length ?? 0) > 0
  if (!top) return { kind: pending ? 'pending' : 'none' }
  const second = crosses.subjects[1]?.k ?? 0
  if (!pending && top.k === second) return { kind: 'tie' }
  return { kind: 'top', label: top.label, k: top.k, n: crosses.n, leads: !pending && top.k > second }
}

// ---- the shapes ------------------------------------------------------------------------

export type LevelKind = 'category' | 'product'

/** A level page's address, as its route reads it. */
export type LevelAsk = { kind: 'category'; id: string } | { kind: 'product'; group: string; id: string }

/** A group's videos among a set: k of the set's n, opening in Voices. */
export interface GroupCount { key: string; name: string; k: number; href: string }
/** Who's talking: the groups' counts, or why there are none. */
export type GroupsBlock =
  | { state: 'ready'; n: number; rows: GroupCount[] }
  | { state: 'none' }
  | { state: 'unread' }

/** Where: the set's videos by platform. */
export interface PlatformsBlock { n: number; rows: { platform: string; label: string; k: number }[] }

/** A subject row on a level page: ready ones counted (or on none of the
 *  set's videos), with Market's page for it. */
export interface SubjectRow { id: string; label: string; k: number; href: string }

/** The month by month: three months ending at the page's, each bar k of n. */
export const LEVEL_LINE_MONTHS = 3

/** A product that came up, as the hub's card draws it. */
export interface ProductCard {
  id: string
  name: string
  href: string
  videos: number
  /** Its videos last month; null where last month was not read. */
  prev: number | null
  /** Its commonest kind of comment, k of its n, where read. */
  kind: { id: string; label: string; k: number; n: number } | null
  about: AboutLine
}

/** One row of the hub's list. */
export interface ListRow {
  id: string
  name: string
  href: string
  videos: number | null
  prev: number | null
  about: AboutLine
}

/** A quote on the hub, labelled with the product it names. */
export interface HubQuote extends ProductsQuote {
  product: { id: string; name: string; href: string }
}

export interface CategoryDetail {
  id: string
  name: string
  askHref: string
  settingsHref: string
  crosses: Crosses | null
  line: LineBar[]
  compare: Compare | null
  share: Level | null
  verdict: Verdict | null
  products: number
  cameUp: number
  split: { any: number; named: number; unclear: number; unbranded: number } | null
  unclear: {
    videos: number
    lines: UnclearLine[]
    more: number
    withheld: number
    allHref: string | null
    /** Where "See all" took it, the way back to three. */
    fewerHref: string | null
    options: TagOption[]
    /** The month is frozen: a tag here is kept and moves no count. */
    closed: boolean
    /** Every line of the whole list is a comment (none a video's own
     *  words): "See all N comments". */
    allComments: boolean
  }
}

interface Level { k: number; n: number }

export interface CategoryPage {
  detail: CategoryDetail
  /** The header card's headline, in code's words. */
  headline: string
  /** The products that came up, most videos first, at most three. */
  cards: ProductCard[]
  /** Every product, in the shelf's order. */
  list: ListRow[]
  /** Whether any of the client's subjects is not measured yet: the list's
   *  column then claims no "most". */
  subjectsPending: boolean
  subjects: SubjectRow[]
  groups: GroupsBlock
  platforms: PlatformsBlock | null
  quotes: HubQuote[]
}

/** One comment naming the product, under its video. */
export interface NamedComment { key: string; text: string; english: string | null; lang: string | null; date: string | null }

/** One video naming the product (G4's `.vcard`). */
export interface NamedVideo {
  id: string
  account: string | null
  platform: string | null
  posted: string | null
  caption: string | null
  url: string | null
  /** The client's own post: its comments count, its own words never do. */
  owned: boolean
  /** The video's own words name the product. */
  inVideo: boolean
  /** Comments naming it this month, counted. */
  named: number
  /** Comments on the video, where read and no fewer than `named`. */
  total: number | null
  /** The comments shown: three (two on a phone), or every printable one
   *  where opened (at most PRODUCT_VIDEO_COMMENTS_MAX). */
  quotes: NamedComment[]
  /** How many of its naming comments may print. */
  quotable: number
  open: boolean
  /** Opens it (closed), or closes it (open). */
  href: string
}

export interface ProductEvidence {
  state: 'ready' | 'unread'
  total: number
  videos: NamedVideo[]
  /** Listed past the first four: what remains, at each width, and where. */
  more: { href: string; desktop: number; phone: number } | null
  /** Every video listed, past the cap: how many are listed. */
  capped: number | null
  all: boolean
  fewerHref: string | null
}

export interface ProductPage {
  id: string
  name: string
  groupId: string
  groupName: string
  flag: Verdict | null
  /** Its videos this month (`k_named`), the market's, its category's. */
  videos: number | null
  market: number | null
  categoryVideos: number | null
  comments: number | null
  prev: number | null
  prevHref: string | null
  crosses: Crosses | null
  line: LineBar[]
  lead: string
  place: { product: number; others: number; unclear: number; general: number; n: number } | null
  subjects: SubjectRow[]
  evidence: ProductEvidence
  siblings: { id: string; name: string; href: string; videos: number | null }[]
  groups: GroupsBlock
  platforms: PlatformsBlock | null
  askHref: string
  settingsHref: string
}

export interface ProductsLevelData {
  /** The root's data for the month: its state, words, switch and shelf. */
  base: ProductsData
  level: LevelKind
  /** The address names no category or product the catalogue holds (or a
   *  state that reads no catalogue): one calm line and the way back. */
  missing: boolean
  /** A product asked under another category: its own address (the route
   *  redirects, one hop). */
  redirect: string | null
  crumbs: Crumb[] | null
  /** The bar's month switch, each month this page's address. */
  months: { month: string; label: string; href: string; current: boolean }[]
  group: { id: string; name: string } | null
  /** The product a product's page names (in every state its address
   *  resolves). */
  item: { id: string; name: string } | null
  category: CategoryPage | null
  product: ProductPage | null
}

// ---- small helpers ------------------------------------------------------------------

/** The month a link keeps: the page's `?month=` where it is one. */
export const keptMonth = (params: Pick<ProductsParams, 'month'>): Pick<ProductsParams, 'month'> =>
  (params.month && /^\d{4}-\d{2}$/.test(params.month) ? { month: params.month } : {})

/** A video id the page may honour: short, and only ever compared with the
 *  product's own videos (never sent to a query). */
const askedVideo = (raw: string | undefined): string | null => (raw && raw.length <= 80 ? raw : null)

/** The month's three bars ending at the page's month (`pick` the object's
 *  videos), each k of the market's n. PURE. */
export function levelLine(rows: readonly ProductMonthRow[], month: string, objectId: string, pick: 'any' | 'named', filling: (m: string) => boolean): LineBar[] {
  const out: LineBar[] = []
  let m = monthStartOf(month)
  const months: string[] = []
  for (let i = 0; i < LEVEL_LINE_MONTHS; i++) { months.unshift(m); m = prevMonth(m) }
  for (const x of months) {
    const p = marketProductMonth(rows, x, objectId)
    if (!p || p.n <= 0) continue
    out.push({ month: x, label: longMonth(x), k: pick === 'any' ? p.k_any : p.k_named, n: p.n, filling: filling(x), current: x === monthStartOf(month), version: p.catalogueVersion })
  }
  return out
}

/** The set's videos by platform, from the month's market (no read). PURE. */
export function platformsOf(ids: ReadonlySet<string>, market: readonly { id: string; platform: string }[] | null): PlatformsBlock | null {
  if (!market || ids.size === 0) return null
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const v of market) {
    if (!ids.has(v.id) || seen.has(v.id)) continue
    seen.add(v.id)
    counts.set(v.platform, (counts.get(v.platform) ?? 0) + 1)
  }
  const rows = [...counts].map(([platform, k]) => ({ platform, label: platformLabel(platform), k })).sort((a, b) => b.k - a.k || a.label.localeCompare(b.label))
  return rows.length > 0 ? { n: seen.size, rows } : null
}

/** Each group's videos among the set (Voices' group sets, crossed with the
 *  set), most first, those with none left out. PURE. */
export function groupsOf(ids: ReadonlySet<string>, groups: readonly { key: string; name: string; videoIds: readonly string[] }[] | null | undefined, params: Pick<ProductsParams, 'month'>): GroupsBlock {
  if (groups === undefined) return { state: 'unread' }
  if (groups === null || groups.length === 0) return { state: 'none' }
  const rows = groups
    .map((g, i) => ({ key: g.key, name: g.name, k: g.videoIds.filter((v) => ids.has(v)).length, href: voicesHref(keptMonth(params), { kind: 'group', key: g.key }), i }))
    .filter((g) => g.k > 0)
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map(({ i: _i, ...g }) => g)
  return { state: 'ready', n: ids.size, rows }
}

/** The READY subjects a set carries, each opening its page on Market at the
 *  page's month, the ones on none of its videos at 0 after them. PURE. */
export function subjectRowsOf(crosses: Crosses | null, month: string): SubjectRow[] {
  if (!crosses) return []
  const href = (id: string) => marketSubjectHref(id, { period: 'month', month })
  return [
    ...crosses.subjects.map((s) => ({ id: s.id, label: s.label, k: s.k, href: href(s.id) })),
    ...(crosses.quiet ?? []).map((q) => ({ id: q.id, label: q.label, k: 0, href: href(q.id) })),
  ]
}

/** The switcher over the categories, in the shelf's order: a quiet one says
 *  so in words, never a figure. PURE. */
export function categoryMenu(shelf: readonly ShelfCategoryView[], current: string, params: Pick<ProductsParams, 'month'>, quietWords: string): CrumbMenu {
  return {
    label: 'Your categories',
    switchLabel: 'Switch to another category',
    items: shelf.map((c): CrumbItem => ({ key: c.id, label: c.name, href: productsHref(keptMonth(params), { kind: 'group', id: c.id }), current: c.id === current, note: c.videos === 0 ? quietWords : null })),
  }
}

/** The switcher over a category's products, in the shelf's order: those
 *  that came up, then the quiet ones (and any not read) under a hairline,
 *  each saying so in words. Where nothing was read (switched off), every
 *  product in one list with no word. PURE. */
export function productMenu(column: ShelfCategoryView, current: string, params: Pick<ProductsParams, 'month'>, quietWords: string): CrumbMenu {
  const item = (p: ShelfCategoryView['products'][number], note: string | null): CrumbItem => ({
    key: p.id, label: p.name, href: productsHref(keptMonth(params), { kind: 'product', id: p.id, group: column.id }), current: p.id === current, note,
  })
  const read = column.products.some((p) => p.videos != null)
  const word = column.name.toLowerCase()
  if (!read) return { label: `Your ${word}`, switchLabel: `Switch to another of your ${word}`, items: column.products.map((p) => item(p, null)) }
  return {
    label: `Your ${word}`,
    switchLabel: `Switch to another of your ${word}`,
    items: column.products.filter((p) => (p.videos ?? 0) > 0).map((p) => item(p, null)),
    below: column.products.filter((p) => !((p.videos ?? 0) > 0)).map((p) => item(p, p.videos == null ? 'Not read yet' : quietWords)),
  }
}

/** "Quiet so far" in the calendar month, "Quiet in September" in a closed
 *  one. */
export const quietWordsOf = (monthName: string, soFar: boolean): string => (soFar ? 'Quiet so far' : `Quiet in ${monthName}`)

// ---- the hub ------------------------------------------------------------------------------

/** At most this many products as cards on the hub (the board's three). */
export const HUB_CARDS = 3
/** Comments a hub reads per product that came up, for its one quote. */
export const HUB_QUOTE_READ = 10

/** The hub's cards: the products that came up, most videos first, at most
 *  HUB_CARDS. PURE. */
export function hubCards(column: ShelfCategoryView, rows: readonly ProductMonthRow[], month: string, crosses: ReadonlyMap<string, Crosses>): ProductCard[] {
  const before = prevMonth(month)
  return column.products
    .filter((p) => (p.videos ?? 0) > 0)
    .slice(0, HUB_CARDS)
    .map((p) => {
      const c = crosses.get(setKey('product', p.id)) ?? null
      const kind = c && c.n > 0 ? c.kinds[0] ?? null : null
      return {
        id: p.id, name: p.name, href: p.href, videos: p.videos ?? 0,
        prev: marketProductMonth(rows, before, p.id)?.k_named ?? null,
        kind: kind ? { id: kind.id, label: PRODUCT_KIND_LABELS[kind.id] ?? kind.label, k: kind.k, n: c!.n } : null,
        about: aboutLine(c, p.videos),
      }
    })
}

/** Every product of the category, in the shelf's order (most videos first,
 *  then the quiet ones). PURE. */
export function hubList(column: ShelfCategoryView, rows: readonly ProductMonthRow[], month: string, crosses: ReadonlyMap<string, Crosses>): ListRow[] {
  const before = prevMonth(month)
  return column.products.map((p) => ({
    id: p.id, name: p.name, href: p.href, videos: p.videos,
    prev: marketProductMonth(rows, before, p.id)?.k_named ?? null,
    about: aboutLine(crosses.get(setKey('product', p.id)) ?? null, p.videos),
  }))
}

/** The hub's quotes: one comment naming each card's product, through the
 *  root's gate (`productQuotes`, own posts' comments included). PURE. */
export function hubQuotes(cards: readonly ProductCard[], texts: ReadonlyMap<string, readonly TextRead[]>, clientId: string): HubQuote[] {
  const out: HubQuote[] = []
  for (const c of cards) {
    const q = productQuotes(texts.get(c.id) ?? [], clientId)[0]
    if (q) out.push({ ...q, product: { id: c.id, name: c.name, href: c.href } })
  }
  return out
}

/** Reads the hub is built from beyond the root's. */
export interface CategoryReads {
  unclear: TextRead[]
  /** Each card product's comments naming it, newest first. */
  named: Map<string, TextRead[]>
  /** Voices' groups with their month's videos (`loadGroupSubjects`); null
   *  where the tenant has no profile; undefined where it was not read. */
  groups?: { key: string; name: string; videoIds: string[] }[] | null
}

/** The hub, from the root's data and its own reads. PURE. */
export function buildCategoryPage(input: {
  base: ProductsData
  in: ProductsInput
  groupId: string
  catalogue: ProductCatalogue
  sets: ProductMonthSets | null
  reads: CategoryReads | null
}): CategoryPage | null {
  const { base, catalogue } = input
  const rows = input.in.rows ?? []
  const month = base.month
  const g = catalogue.groups.find((x) => x.id === input.groupId)
  const column = base.shelf.find((c) => c.id === input.groupId)
  if (!g || !column) return null
  const params = input.in.params
  const split = marketProductMonth(rows, month, g.id)
  const crosses = input.in.crosses
  const filling = input.in.filling ?? ((m: string) => m === month && base.soFar)
  const all = params.unclear === 'all'
  const texts = input.reads?.unclear ?? []
  const listed = unclearLines(texts, input.in.clientId, all ? UNCLEAR_ALL : UNCLEAR_SHOWN)
  const withAll = unclearLines(texts, input.in.clientId, UNCLEAR_ALL)
  const kept = keptMonth(params)
  const cards = hubCards(column, rows, month, crosses)
  const gc = crosses.get(setKey('group', g.id)) ?? null
  const ids = input.sets?.groups.get(g.id)?.any ?? new Set<string>()
  const detail: CategoryDetail = {
    id: g.id, name: g.name,
    askHref: askHref(`What does my market say about ${g.name.toLowerCase()}?`),
    settingsHref: productsTabHref(g.id),
    crosses: gc,
    line: levelLine(rows, month, g.id, 'any', filling),
    compare: buildCompare({ month, group: g, products: column.products, crosses }),
    share: column.share, verdict: column.verdict,
    products: column.products.length, cameUp: column.products.filter((p) => (p.videos ?? 0) > 0).length,
    split: split ? { any: split.k_any, named: split.k_named, unclear: split.k_unclear, unbranded: split.k_unbranded } : null,
    unclear: {
      videos: split?.k_unclear ?? 0,
      lines: listed.lines,
      more: all ? 0 : listed.more,
      withheld: listed.withheld,
      allHref: !all && listed.more > 0 ? productsHref(kept, { kind: 'group', id: g.id }, { all: true, at: 'unclear' }) : null,
      fewerHref: all && withAll.lines.length > UNCLEAR_SHOWN ? productsHref(kept, { kind: 'group', id: g.id }, { at: 'unclear' }) : null,
      options: input.in.canTag && withAll.lines.length > 0 ? tagOptions(catalogue, g.id) : [],
      closed: input.in.now ? freezeStateFor(month, input.in.now) === 'frozen' : false,
      allComments: withAll.lines.every((l) => l.commentId != null),
    },
  }
  return {
    detail,
    headline: categoryHeadline(g.name, detail.split ?? { any: 0, named: 0, unclear: 0, unbranded: 0 }, base.monthWords),
    cards,
    list: hubList(column, rows, month, crosses),
    subjectsPending: (gc?.pending?.length ?? 0) > 0,
    subjects: subjectRowsOf(gc, month),
    groups: input.reads ? groupsOf(ids, input.reads.groups, params) : { state: 'unread' },
    platforms: platformsOf(ids, input.in.market),
    quotes: input.reads ? hubQuotes(cards, input.reads.named, input.in.clientId) : [],
  }
}

// ---- the evidence ---------------------------------------------------------------------------

/** Videos listed before "Show the other N videos" (the board's four; three
 *  on a phone), and at most with every video listed. */
export const PRODUCT_VIDEOS_SHOWN = 4
export const PRODUCT_VIDEOS_SHOWN_PHONE = 3
export const PRODUCT_VIDEOS_MAX = 60
/** Comments under a video before "Show all" (two on a phone), and at most
 *  with one video opened. */
export const PRODUCT_VIDEO_QUOTES = 3
export const PRODUCT_VIDEO_QUOTES_PHONE = 2
export const PRODUCT_VIDEO_COMMENTS_MAX = 50

/** The product's videos in the order the page lists them: the most comments
 *  naming it first, then a video whose own words name it, then the newest.
 *  PURE. */
export function namedVideoOrder(input: { set: ReadonlySet<string>; standing: ReadonlyMap<TextKey, StandingText>; month: string; productId: string; posted?: ReadonlyMap<string, string | null> }): { id: string; named: number; inVideo: boolean }[] {
  const named = new Map<string, number>()
  for (const t of namedComments(input.standing, input.month, input.productId, input.set)) named.set(t.videoId, (named.get(t.videoId) ?? 0) + 1)
  const inVideo = (id: string) => input.standing.get(`v:${id}`)?.placements.some((p) => p.placement === 'named' && p.productId === input.productId) ?? false
  return [...input.set]
    .map((id) => ({ id, named: named.get(id) ?? 0, inVideo: inVideo(id) }))
    .sort((a, b) => b.named - a.named || Number(b.inVideo) - Number(a.inVideo) || (input.posted?.get(b.id) ?? '').localeCompare(input.posted?.get(a.id) ?? '') || a.id.localeCompare(b.id))
}

/** Which videos a page lists: the first four (every one up to the cap with
 *  `?videos=all`), and an opened one wherever it sits; `?video=` names one
 *  only where it is the product's own. PURE. */
export function shownVideos(order: readonly { id: string }[], params: Pick<ProductsParams, 'video' | 'videos'>): { ids: string[]; open: string | null; all: boolean } {
  const asked = askedVideo(params.video)
  const open = asked && order.some((o) => o.id === asked) ? asked : null
  const all = params.videos === 'all'
  const base = order.slice(0, all ? PRODUCT_VIDEOS_MAX : PRODUCT_VIDEOS_SHOWN).map((o) => o.id)
  const ids = open && !base.includes(open) ? order.map((o) => o.id).filter((id) => base.includes(id) || id === open) : base
  return { ids, open, all }
}

/** The evidence, from the order, the videos read and the comments naming it
 *  on the shown videos (newest first). A comment prints where the root's
 *  gate passes it; the rest are counted. PURE. */
export function productEvidence(input: {
  order: readonly { id: string; named: number; inVideo: boolean }[]
  shown: { ids: string[]; open: string | null; all: boolean }
  videos: ReadonlyMap<string, LevelVideoRow> | null
  texts: readonly TextRead[]
  owned: ReadonlySet<string>
  clientId: string
  groupId: string
  productId: string
  params: Pick<ProductsParams, 'month'>
}): ProductEvidence {
  const kept = keptMonth(input.params)
  const total = input.order.length
  const fewerHref = input.shown.all ? productPageHref(input.groupId, input.productId, kept) : null
  if (!input.videos) return { state: 'unread', total, videos: [], more: null, capped: null, all: input.shown.all, fewerHref }
  const gate = gateFor(input.clientId, { allowOwn: true })
  const byVideo = new Map<string, NamedComment[]>()
  for (const t of input.texts) {
    if (!t.text || !t.commentId) continue
    if (!quoteGate({ text: t.text, lang: t.lang, english: t.english, ...(t.video !== undefined ? { video: t.video } : {}) }, gate).ok) continue
    const list = byVideo.get(t.videoId) ?? []
    list.push({ key: t.key, text: t.text, english: t.english, lang: t.lang, date: t.date ? shortDate(t.date) : null })
    byVideo.set(t.videoId, list)
  }
  const of = new Map(input.order.map((o) => [o.id, o]))
  const videos: NamedVideo[] = input.shown.ids.flatMap((id) => {
    const o = of.get(id)
    if (!o) return []
    const v = input.videos!.get(id)
    const quotable = byVideo.get(id) ?? []
    const open = input.shown.open === id
    const count = Number(v?.comments_count)
    return [{
      id,
      account: v?.account_name ?? null,
      platform: v?.platform ? platformLabel(v.platform) : null,
      posted: v?.upload_date ? shortDate(v.upload_date) : null,
      caption: v?.caption ?? null,
      url: v?.video_url ?? null,
      owned: input.owned.has(id),
      inVideo: o.inVideo,
      named: o.named,
      total: Number.isFinite(count) && count >= o.named ? count : null,
      quotes: quotable.slice(0, open ? PRODUCT_VIDEO_COMMENTS_MAX : PRODUCT_VIDEO_QUOTES),
      quotable: quotable.length,
      open,
      href: open ? productPageHref(input.groupId, input.productId, kept, input.shown.all ? { videos: 'all' } : {}) : productPageHref(input.groupId, input.productId, kept, { video: id, ...(input.shown.all ? { videos: 'all' as const } : {}) }),
    }]
  })
  const more = !input.shown.all && total > PRODUCT_VIDEOS_SHOWN_PHONE
    ? { href: productPageHref(input.groupId, input.productId, kept, { videos: 'all' }), desktop: Math.max(0, total - PRODUCT_VIDEOS_SHOWN), phone: total - PRODUCT_VIDEOS_SHOWN_PHONE }
    : null
  return { state: 'ready', total, videos, more, capped: input.shown.all && total > PRODUCT_VIDEOS_MAX ? PRODUCT_VIDEOS_MAX : null, all: input.shown.all, fewerHref }
}

/** Reads the evidence is built from beyond the root's. */
export interface ProductReads {
  videos: Map<string, LevelVideoRow> | null
  /** The comments naming it on the shown videos, newest first. */
  named: TextRead[]
  groups?: { key: string; name: string; videoIds: string[] }[] | null
}

/** The product's page, from the root's data and its own reads. PURE. */
export function buildProductPage(input: {
  base: ProductsData
  in: ProductsInput
  productId: string
  catalogue: ProductCatalogue
  sets: ProductMonthSets | null
  reads: ProductReads | null
}): ProductPage | null {
  const { base, catalogue } = input
  const p = catalogue.products.find((x) => x.id === input.productId)
  if (!p) return null
  const g = catalogue.groups.find((x) => x.id === p.group_id)
  const column = base.shelf.find((c) => c.id === p.group_id)
  if (!g || !column) return null
  const rows = input.in.rows ?? []
  const month = base.month
  const before = prevMonth(month)
  const params = input.in.params
  const mine = marketProductMonth(rows, month, p.id)
  const cat = marketProductMonth(rows, month, g.id)
  const crosses = input.in.crosses.get(setKey('product', p.id)) ?? null
  const tile = column.products.find((x) => x.id === p.id)
  const filling = input.in.filling ?? ((m: string) => m === month && base.soFar)
  const set = input.sets?.products.get(p.id) ?? new Set<string>()
  const prev = marketProductMonth(rows, before, p.id)?.k_named ?? null
  const posted = new Map([...(input.reads?.videos ?? new Map<string, LevelVideoRow>())].map(([id, v]) => [id, v.upload_date ?? null]))
  const order = input.in.standing ? namedVideoOrder({ set, standing: input.in.standing, month, productId: p.id, posted }) : []
  const shown = shownVideos(order, params)
  const owned = new Set((input.in.market ?? []).filter((v) => v.owned).map((v) => v.id))
  const evidence = input.reads && input.in.standing
    ? productEvidence({ order, shown, videos: input.reads.videos, texts: input.reads.named, owned, clientId: input.in.clientId, groupId: g.id, productId: p.id, params })
    : { state: 'unread' as const, total: order.length, videos: [], more: null, capped: null, all: shown.all, fewerHref: null }
  return {
    id: p.id, name: p.name, groupId: g.id, groupName: g.name,
    flag: tile?.flag ?? null,
    videos: mine?.k_named ?? null,
    market: mine?.n ?? null,
    categoryVideos: cat?.k_any ?? null,
    comments: mine?.comments ?? null,
    prev,
    prevHref: (mine?.k_named ?? 0) === 0 && (prev ?? 0) > 0 ? productsHref({ month: before.slice(0, 7) }, { kind: 'product', id: p.id, group: g.id }) : null,
    crosses,
    line: levelLine(rows, month, p.id, 'named', filling),
    lead: productLead({ videos: mine?.k_named ?? null, crosses, monthWords: base.monthWords, monthName: base.monthName }),
    place: cat && mine ? { product: mine.k_named, others: Math.max(0, cat.k_named - mine.k_named), unclear: cat.k_unclear, general: cat.k_unbranded, n: cat.k_any } : null,
    subjects: subjectRowsOf(crosses, month),
    evidence,
    siblings: column.products.filter((x) => x.id !== p.id).map((x) => ({ id: x.id, name: x.name, href: x.href, videos: x.videos })),
    groups: input.reads ? groupsOf(set, input.reads.groups, params) : { state: 'unread' },
    platforms: platformsOf(set, input.in.market),
    askHref: askHref(`What does my market say about ${p.name}?`),
    settingsHref: productsTabHref(g.id),
  }
}

// ---- the level, from its reads ----------------------------------------------------------------

/** A level page, from the root's input and the level's reads. PURE. */
export function buildLevelData(input: {
  in: ProductsInput
  ask: LevelAsk
  category?: CategoryReads | null
  product?: ProductReads | null
}): ProductsLevelData {
  const base = buildProductsData(input.in)
  const level: LevelKind = input.ask.kind
  const empty = { base, level, missing: true, redirect: null, crumbs: null, months: [], group: null, item: null, category: null, product: null } satisfies ProductsLevelData
  const read = input.in.catalogue
  if (!read || read.state !== 'ready') return empty
  const catalogue = read.catalogue
  const params = input.in.params
  const kept = keptMonth(params)
  const groupId = input.ask.kind === 'category' ? input.ask.id : input.ask.group
  // A product named under another category: its own address, one hop.
  if (input.ask.kind === 'product') {
    const p = catalogue.products.find((x) => x.id === (input.ask as { id: string }).id)
    if (!p) return empty
    if (p.group_id !== input.ask.group) {
      const q = new URLSearchParams()
      for (const k of ['month', 'video', 'videos'] as const) if (params[k]) q.set(k, params[k]!)
      const qs = q.toString()
      return { ...empty, missing: false, redirect: `${productsProductPath(p.group_id, p.id)}${qs ? `?${qs}` : ''}` }
    }
  }
  const g = catalogue.groups.find((x) => x.id === groupId)
  const column = base.shelf.find((c) => c.id === groupId)
  if (!g || !column) return empty
  const quiet = quietWordsOf(base.monthName, base.soFar)
  const root: Crumb = { label: surface('products').label, href: productsHref(kept) }
  const productId = input.ask.kind === 'product' ? input.ask.id : null
  const crumbs: Crumb[] = productId
    ? [root, { label: g.name, href: productsHref(kept, { kind: 'group', id: g.id }), menu: categoryMenu(base.shelf, g.id, params, quiet) }, { label: catalogue.products.find((x) => x.id === productId)!.name, href: null, menu: productMenu(column, productId, params, quiet) }]
    : [root, { label: g.name, href: null, menu: categoryMenu(base.shelf, g.id, params, quiet) }]
  const at = (m: string) => (productId ? productPageHref(g.id, productId, { month: m }) : productsHref({ month: m }, { kind: 'group', id: g.id }))
  const out: ProductsLevelData = {
    base, level, missing: false, redirect: null, crumbs,
    // The root's switch (none where no month is read), each month this
    // page's address.
    months: base.months.map((m) => ({ ...m, href: at(m.month.slice(0, 7)) })),
    group: { id: g.id, name: g.name },
    item: productId ? { id: productId, name: catalogue.products.find((x) => x.id === productId)!.name } : null,
    category: null, product: null,
  }
  if (base.state !== 'ready') return out
  const sets = setsOf(input.in)
  if (productId) return { ...out, product: buildProductPage({ base, in: input.in, productId, catalogue, sets, reads: input.product ?? null }) }
  return { ...out, category: buildCategoryPage({ base, in: input.in, groupId: g.id, catalogue, sets, reads: input.category ?? null }) }
}

// ---- the reads -----------------------------------------------------------------------------

/** Voices' groups with their videos among `ids` this month: the latest
 *  profile, its groups' evidence comments dated in the month, mapped onto
 *  these videos by the platform's own id (`loadGroupSubjects`, `videosOnly`).
 *  Null where the tenant has no profile. */
async function readGroups(handle: ReadingHandle, month: string, ids: readonly string[], videos: ReadonlyMap<string, LevelVideoRow>): Promise<{ key: string; name: string; videoIds: string[] }[] | null> {
  const market: MarketVideo[] = ids.flatMap((id) => {
    const v = videos.get(id)
    return v?.platform && v.video_id ? [{ id, videoId: id, platformVideoId: String(v.video_id), platform: v.platform, audience: '', account: v.account_name ?? null, followers: null, scrapedAt: null } as unknown as MarketVideo] : []
  })
  const read = await loadGroupSubjects(handle, { month, audiences: [], market, videosOnly: true })
  return read ? read.videos.map((g) => ({ key: g.key, name: g.name, videoIds: g.videoIds })) : null
}

/**
 * A level page. Wave 1 and 2 are the root's (`readProductsShell`,
 * `readProductsMonth`; the month-pair judge only for a category, whose share
 * carries a verdict); then the level's own, each part failing alone:
 *   a category: the crosses over it and each of its products that came up,
 *     its videos (for who's talking), its couldn't-tell-which texts and the
 *     card products' comments naming them (one text read), the groups;
 *   a product: the crosses over it, its videos, the comments naming it on
 *     the videos the page lists, the groups.
 * Nothing past wave 1 is read for a state that prints no count, nor for an
 * address the catalogue does not hold.
 */
export async function loadProductsLevel(input: ProductsLoadInput & { ask: LevelAsk }): Promise<ProductsLevelData> {
  const shell = await readProductsShell(input)
  const cat = shell.catalogue?.state === 'ready' ? shell.catalogue.catalogue : null
  const known = cat && (input.ask.kind === 'category'
    ? cat.groups.some((g) => g.id === input.ask.id)
    : cat.products.some((p) => p.id === input.ask.id && p.group_id === (input.ask as { group: string }).group))
  if (!cat || !known || !shellReads(shell)) return buildLevelData({ in: shell, ask: input.ask })
  const month = await readProductsMonth(input.reading, shell, { pair: input.ask.kind === 'category' })
  const ready = { ...shell, ...month }
  if (!month.market && !month.standing) return buildLevelData({ in: ready, ask: input.ask })
  const sets = setsOf(ready)
  const handle = input.reading
  const m = shell.month

  if (input.ask.kind === 'category') {
    const g = input.ask.id
    const groupSet = sets?.groups.get(g) ?? null
    const products = cat.products.filter((p) => p.group_id === g)
    const wanted = [
      ...(groupSet ? [{ key: setKey('group', g), ids: [...groupSet.any] }] : []),
      ...products.map((p) => ({ key: setKey('product', p.id), ids: [...(sets?.products.get(p.id) ?? [])] })).filter((w) => w.ids.length > 0),
    ]
    // The card products, as the shelf orders them (most videos first).
    const cardIds = products.map((p) => ({ id: p.id, n: sets?.products.get(p.id)?.size ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, HUB_CARDS).map((x) => x.id)
    const ids = [...(groupSet?.any ?? [])]
    const [crosses, videos] = await Promise.all([
      readCrosses(handle, m, wanted),
      ids.length > 0 ? readVideoRows(handle, ids).catch((e: unknown) => { say('level videos', e); return null }) : Promise.resolve(new Map<string, LevelVideoRow>()),
    ])
    const standing = ready.standing
    const [texts, groups] = await Promise.all([
      standing && groupSet
        ? readTextLists(handle, [
          { texts: unclearTexts(standing, m, g, groupSet.unclear), cap: UNCLEAR_ALL * 2 },
          ...cardIds.map((id) => ({ texts: namedComments(standing, m, id, sets?.products.get(id) ?? new Set()), cap: HUB_QUOTE_READ })),
        ], videos ?? new Map()).catch((e: unknown) => { say('level texts', e); return null })
        : Promise.resolve([] as TextRead[][]),
      videos && ids.length > 0 ? readGroups(handle, m, ids, videos).catch((e: unknown) => { say('level groups', e); return undefined }) : Promise.resolve(videos ? null : undefined),
    ])
    const reads: CategoryReads | null = texts ? { unclear: texts[0] ?? [], named: new Map(cardIds.map((id, i) => [id, texts[i + 1] ?? []])), groups } : null
    return buildLevelData({ in: { ...ready, crosses }, ask: input.ask, category: reads })
  }

  const pid = input.ask.id
  const productSet = sets?.products.get(pid) ?? new Set<string>()
  const ids = [...productSet]
  const [crosses, videos] = await Promise.all([
    readCrosses(handle, m, ids.length > 0 ? [{ key: setKey('product', pid), ids }] : []),
    ids.length > 0 ? readVideoRows(handle, ids).catch((e: unknown) => { say('level videos', e); return null }) : Promise.resolve(new Map<string, LevelVideoRow>()),
  ])
  const standing = ready.standing
  const posted = new Map([...(videos ?? new Map<string, LevelVideoRow>())].map(([id, v]) => [id, v.upload_date ?? null]))
  const order = standing ? namedVideoOrder({ set: productSet, standing, month: m, productId: pid, posted }) : []
  const shown = shownVideos(order, input.params)
  const shownSet = new Set(shown.ids)
  const [named, groups] = await Promise.all([
    standing && shownSet.size > 0
      ? readTextLists(handle, [{ texts: namedComments(standing, m, pid, shownSet), cap: shownSet.size * (PRODUCT_VIDEO_COMMENTS_MAX + 10) }], videos ?? new Map()).then((r) => r[0]).catch((e: unknown) => { say('level texts', e); return null })
      : Promise.resolve([] as TextRead[]),
    videos && ids.length > 0 ? readGroups(handle, m, ids, videos).catch((e: unknown) => { say('level groups', e); return undefined }) : Promise.resolve(videos ? null : undefined),
  ])
  const reads: ProductReads = { videos, named: named ?? [], groups }
  return buildLevelData({ in: { ...ready, crosses }, ask: input.ask, product: reads })
}

/** Where an old root link lands (`redirectFor`'s `known`): a product's
 *  category, from the catalogue. Null where it holds no such product. */
export function productGroupOf(catalogue: Pick<ProductCatalogue, 'products'> | null): (id: string) => string | null {
  return (id) => catalogue?.products.find((p) => p.id === id)?.group_id ?? null
}

export { PRODUCTS_HREF, productsCategoryPath, productsProductPath, WHERE_NAMED_ID }
