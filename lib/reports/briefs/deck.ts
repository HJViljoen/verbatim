import { aboutName, marketLabelsOf, type AboutPart } from '../../brands/labels'
import { fmtInt, longMonth } from '../../format'
import { monthsPhrase } from '../../written/month'
import { languageName } from './markdown'
import { FINDINGS_AFTER } from './sections'
import type { BriefFinding, BriefItem, BriefQuote, BriefRole, BriefSection, StoredBriefData, SectionKey } from './types'
import { BRIEF_NAME } from './types'

// The brief as pages (pure): which page holds what, in the order the design
// draws them (the Claude Design canvas, "Monthly briefs", design round 6 as
// approved on 1 Oct: Brief-{Sales,Marketing,Content,Leadership}-*.dc.html,
// 1280×720 sheets). The deck component (components/briefs/brief-deck.tsx)
// draws each page; this decides them, so the viewer's page count, the PDF and
// the deck cannot disagree.
//
// THE ORDER. Cover; In short; the findings (one a page; Leadership's after
// where the company stands, as the design draws it); then the role's sections
// in the role's order. Two pairs share a page, as the design draws them: what
// stops buyers with what they want settled first, and the risks with the
// questions for the business.
//
// PAGINATION BY ESTIMATE. A sheet is a fixed 1280×720 and a real brief's
// sections run from one item to eight, so a section whose items would not fit
// carries on to a page of its own titled "…, continued" (the design's own
// "Who is buying, continued"). Heights are estimated from the text's length
// at the page's measured type (characters per line from the column width and
// the font size), never measured in a browser: the plan has to be the same in
// the viewer, the PDF and a test. The estimate errs high; scripts/brief-render.ts
// measures the real pages for clipping.

/** The sheet, as the design draws it. */
export const SHEET = { width: 1280, height: 720 } as const

/** The body of a content page: 720 less the frame (40 top, 28 bottom, the
 *  header line and its 22px, the footer and its rule). */
export const BODY_HEIGHT = 584
/** The title block of a section page: a 32px title and a 15px subtitle. */
const TITLE_BLOCK = 84

/** Average width of a character, as a share of the font size, measured in
 *  Chrome on English brief copy (5 Oct): IBM Plex Sans 0.447 at 400, 0.470 at
 *  700; IBM Plex Serif 0.476 at 500, 0.420 in italic. Each is rounded up. */
const CHAR = 0.47
const SERIF_CHAR = 0.48
const ITALIC_CHAR = 0.43

/** Lines a text takes in a column. `serif`: the serif, or 'italic' for a
 *  quote. Pure. */
export function linesOf(text: string, widthPx: number, fontPx: number, serif: boolean | 'italic' = false): number {
  const per = serif === 'italic' ? ITALIC_CHAR : serif ? SERIF_CHAR : CHAR
  const perLine = Math.max(8, Math.floor(widthPx / (fontPx * per)))
  // Words wrap whole: a line holds less than its characters.
  return Math.max(1, Math.ceil((text.length * 1.1) / perLine))
}

/** A text's height in px. Pure. */
export const heightOf = (text: string, widthPx: number, fontPx: number, lineHeight: number, serif: boolean | 'italic' = false): number =>
  linesOf(text, widthPx, fontPx, serif) * fontPx * lineHeight

// ---- Words the deck prints (code's) ---------------------------------------------------------------

const PLATFORM: Readonly<Record<string, string>> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Sales brief". */
export const briefName = (role: BriefRole): string => BRIEF_NAME[role]

/** "September 2026". */
export const monthYear = (month: string): string => `${longMonth(month)} ${month.slice(0, 4)}`

/** "5 October 2026": the day a brief was written, as its footer prints it. */
export function writtenOn(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${longMonth(`${d.toISOString().slice(0, 7)}-01`)} ${d.getUTCFullYear()}`
}

/** Who a piece of talk is about, as a phrase: "other bags in your market",
 *  "about Cotopaxi", "on Sealand's own posts". Pure. */
export function aboutPhrase(p: Pick<AboutPart, 'about'>, company: string, noun: string | null | undefined, ownPost = false): string {
  if (p.about === 'market') return marketLabelsOf(noun ?? null).inline
  if (p.about === 'client') return ownPost ? `on ${company}'s own posts` : `about ${company}`
  return `about ${aboutName(p.about, { client: company }) ?? 'a rival'}`
}

export interface WhoLine {
  /** "6 videos". */
  count: string
  /** Each audience with its videos, most first: "other bags in your market 5". */
  parts: { label: string; videos: string | null }[]
}

/** What an item rests on and whose talk it was: "6 videos · other bags in your
 *  market 5 · about The North Face 1", or "3 videos · other bags in your
 *  market" where it is one audience's. Brand attribution on every item
 *  (Heinrich, 1 Oct). Null where the item counts nothing. Pure. */
export function whoLineOf(videos: number | null | undefined, who: readonly AboutPart[] | null | undefined, company: string, noun: string | null | undefined): WhoLine | null {
  if (videos == null || videos <= 0) return null
  const sorted = [...(who ?? [])].filter((p) => p.videos > 0).sort((a, b) => b.videos - a.videos)
  const parts = sorted.map((p) => ({ label: aboutPhrase(p, company, noun), videos: sorted.length > 1 ? fmtInt(p.videos) : null }))
  return { count: `${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'}`, parts }
}

/** The line flat, for estimates and tests. */
export const whoText = (w: WhoLine | null): string =>
  w ? [w.count, ...w.parts.map((p) => (p.videos ? `${p.label} ${p.videos}` : p.label))].join(' · ') : ''

/** Where a quote was heard and whose talk it was: "Reddit · 26 Sep · about
 *  Cotopaxi · translated from Japanese". Pure. */
export function quoteCite(q: Pick<BriefQuote, 'platform' | 'date' | 'about' | 'ownPost'> & { lang?: string | null; english?: string | null }, company: string, noun: string | null | undefined): string {
  const date = q.date ? new Date(`${q.date.slice(0, 10)}T00:00:00.000Z`) : null
  const day = date && !Number.isNaN(date.getTime()) ? `${date.getUTCDate()} ${MON[date.getUTCMonth()]}` : null
  const lang = q.english && q.lang ? languageName(q.lang) : null
  return [
    PLATFORM[(q.platform ?? '').toLowerCase()] ?? q.platform ?? null,
    day,
    aboutPhrase({ about: q.about }, company, noun, q.ownPost),
    lang ? `translated from ${lang}` : null,
  ].filter(Boolean).join(' · ')
}

/** The words a quote prints: the English where the comment was in another
 *  language (the design: "translated from Japanese" in its cite line). */
export const quoteWords = (q: { text: string; english?: string | null }): string => (q.english?.trim() || q.text).replace(/\s+/g, ' ').trim()

/** "Heard in August and September", from the months a finding's videos fall
 *  in. Pure. */
export const heardIn = (f: Pick<BriefFinding, 'months'>): string => {
  const months = f.months.filter((m) => m.videos > 0).map((m) => m.month)
  return months.length ? `Heard in ${monthsPhrase(months)}` : ''
}

// ---- The section's own words on the page ------------------------------------------------------------

/** The header's label, per section: short, in the design's register. */
export const EYEBROW: Readonly<Record<SectionKey, string>> = {
  'sales.buyers': 'Who is buying',
  'sales.deciders': 'Who else decides',
  'sales.stops': 'What stops them',
  'sales.settle': 'Settled first',
  'sales.triggers': 'What tips them into buying',
  'sales.rivals': 'Rivals',
  'sales.care': 'Language to handle with care',
  'marketing.believe': 'Believes and doubts',
  'marketing.words': 'In its own words',
  'marketing.say_hear': 'Says and hears',
  'marketing.recall': 'Remembered for',
  'marketing.rivals': 'How rivals are heard',
  'content.questions': 'The questions people ask',
  'content.formats': 'Hooks and formats',
  'content.watch': 'What the comments say',
  'content.more': 'What people want shown',
  'content.confusion': 'Where the confusion starts',
  'content.borrow': 'Words to borrow',
  'leadership.market': 'Where the market stands',
  'leadership.shares': 'Where {company} stands',
  'leadership.weigh': 'What buyers weigh',
  'leadership.risks': 'The risks',
  'leadership.decisions': 'Questions for the business',
}

/** The muted line under a section's title, where the design has one: what
 *  the section is, said plainly (code's words, never a claim). */
export const SUBTITLE: Partial<Readonly<Record<SectionKey, string>>> = {
  'sales.buyers': 'The kinds of buyer in the market, by their situation and what they need.',
  'sales.deciders': 'The people besides the buyer who recommend, fit, sell or pay.',
  'sales.stops': 'The reasons a willing buyer hesitates before committing.',
  'sales.triggers': 'The moments when interest turns into a purchase.',
  'sales.rivals': 'The rivals in the same decision, from talk about each one.',
  'sales.care': 'Words sellers use that buyers question, and why.',
  'marketing.believe': 'What people bring to the category before anyone tells them anything.',
  'marketing.words': 'What the comments praise, argue about and describe, in the market\'s terms.',
  'marketing.say_hear': 'The company\'s own claims, and what comes back from the market.',
  'marketing.rivals': 'What each rival is known for in the market\'s own talk.',
  'content.questions': 'Asked in the comments, in the audience\'s own framing.',
  'content.watch': 'What the comments say about the videos and posts themselves.',
  'content.more': 'Asked for in the comments, in their own terms.',
  'content.borrow': 'Short lines from the comments, in the market\'s own words.',
}

export const eyebrowOf = (key: SectionKey, company: string): string => EYEBROW[key].replace(/\{company\}/g, company)

// ---- The pages ---------------------------------------------------------------------------------------

/** How a finding fills its page: the type sizes, and where each voice and the
 *  practice lines go (the right column under the reading, the left column
 *  under the practice, or the finding's second page). */
export interface FindingPlan {
  headline: number
  saw: number
  practice: 'left' | 'next'
  means: number
  /** Each quote's place, in order. */
  quotes: ('right' | 'left' | 'next')[]
}

export type PageBody =
  | { kind: 'cover' }
  | { kind: 'in_short'; summarySize: number; tocSize: number }
  | { kind: 'finding'; finding: BriefFinding; index: number; of: number; plan: FindingPlan; part: 1 | 2 }
  | { kind: 'section'; section: BriefSection; continued: boolean; companion: BriefSection | null; asPair?: boolean; across?: number }

export interface DeckPage {
  /** 1-based, across the whole deck. */
  n: number
  /** The header's label (the cover has none). */
  eyebrow: string
  /** The name the contents list gives this page, on the first page of a
   *  finding or a section; null on a continued page and on the cover. */
  toc: string | null
  body: PageBody
}

/** The two sections that share a page with the one before them, where they
 *  fit beside it (the design's What stops them with What they want settled
 *  first, and The risks with Questions for the business). */
const COMPANION: Partial<Readonly<Record<SectionKey, SectionKey>>> = {
  'sales.stops': 'sales.settle',
  'leadership.risks': 'leadership.decisions',
}

/** How a section lays out, which decides how its items paginate. */
export type SectionLayout =
  | 'rows' | 'care' | 'say_hear' | 'buyers' | 'cards' | 'columns' | 'pair' | 'questions'
  | 'formats' | 'market' | 'shares' | 'weigh' | 'risks' | 'confusion' | 'voices' | 'words'

export const LAYOUT: Readonly<Record<SectionKey, SectionLayout>> = {
  'sales.buyers': 'buyers',
  'sales.deciders': 'rows',
  'sales.stops': 'rows',
  'sales.settle': 'questions',
  'sales.triggers': 'columns',
  'sales.rivals': 'cards',
  'sales.care': 'care',
  'marketing.believe': 'pair',
  'marketing.words': 'words',
  'marketing.say_hear': 'say_hear',
  'marketing.recall': 'pair',
  'marketing.rivals': 'cards',
  'content.questions': 'questions',
  'content.formats': 'formats',
  'content.watch': 'pair',
  'content.more': 'rows',
  'content.confusion': 'confusion',
  'content.borrow': 'voices',
  'leadership.market': 'market',
  'leadership.shares': 'shares',
  'leadership.weigh': 'weigh',
  'leadership.risks': 'risks',
  'leadership.decisions': 'questions',
}

/** Which of a two-column page's columns a group takes: what is believed,
 *  praised, praised for or keeps people on the left (0); what is doubted,
 *  complained about, criticised or moves people on the right (1), in the
 *  orange label, whichever printed. Pure. */
export const pairColumn = (label: string | undefined): 0 | 1 => (/doubt|complain|criticis|moves/i.test(label ?? '') ? 1 : 0)

/** The page width a block has (the design's 60px margins). */
const W = 1160

/** Whose brief a page plan is for: the who lines' words depend on it. */
export interface WhoCtx { company: string; noun: string | null | undefined }
const ANY: WhoCtx = { company: 'the company', noun: null }

/** The height of an item's who line as it prints, at `size`, in a column
 *  `w` wide: the line is short and set in the regular weight, so it is
 *  measured at that weight's width and without the prose's wrap allowance. */
function whoH(i: Pick<BriefItem, 'videos' | 'who' | 'tag'>, w: number, c: WhoCtx, size = 12): number {
  if (!i.videos && !i.tag) return 0
  const text = [i.tag ?? '', whoText(whoLineOf(i.videos, i.who, c.company, c.noun))].filter(Boolean).join(' · ')
  const perLine = Math.max(8, Math.floor(w / (size * 0.44)))
  return Math.ceil(text.length / perLine) * size * 1.4 + 4
}

const body = (i: BriefItem): string => `${i.text}${i.detail ? ` ${i.detail}` : ''}`
const leadH = (lead: string | undefined, w: number, size: number): number => (lead ? heightOf(lead, w, size, 1.5, true) + 14 : 0)
const quoteH = (q: BriefQuote | null | undefined, w: number, size: number): number => {
  if (!q) return 0
  const words = quoteWords(q as BriefQuote & { english?: string | null })
  return words ? 40 + heightOf(`“${words}”`, w - 48, size, 1.5, 'italic') + 28 : 0
}

/** The room a section page's body has under its title block. */
const ROOM = BODY_HEIGHT - TITLE_BLOCK

/** Heights the planner reads, per layout, for one brief. Pure. */
export const heightsFor = (c: WhoCtx = ANY) => {
  const whoH_ = (i: BriefItem, w: number, size = 12): number => whoH(i, w, c, size)
  return {
  rows: (i: BriefItem, more: boolean) => 25 + Math.max(heightOf(i.title ?? '', 196, more ? 20 : 18, 1.3), heightOf(body(i), 490, more ? 16 : 15, 1.55) + whoH_(i, 490)),
  settle: (i: BriefItem) => 15 + heightOf(i.text, 350, 14, 1.5) + whoH_(i, 350),
  care: (i: BriefItem) => 41 + Math.max(heightOf(i.title ?? '', 467, 30, 1.15), heightOf(body(i), 665, 19, 1.5) + whoH_(i, 665)),
  sayHear: (i: BriefItem) => 35 + Math.max(heightOf(i.title ?? '', 469, 16, 1.45), heightOf(i.text, 666, 16, 1.5) + whoH_(i, 666)),
  buyer: (i: BriefItem) => 30 + Math.max(heightOf(i.title ?? '', 352, 24, 1.2), heightOf(i.text, 734, 16, 1.5, true) + (i.detail ? 30 + heightOf(i.detail, 734, 14, 1.45) : 0)) + 36,
  card: (i: BriefItem, w: number, sales: boolean) => {
    const inner = w - 46
    return 36 + (sales ? 31 : 17) + 12 + (sales ? 21 : 0) + heightOf(i.text, inner, sales ? 14.5 : 17, sales ? 1.52 : 1.4) + (i.detail ? 33 + heightOf(i.detail, inner, 14.5, 1.52) : 0) + 12 + whoH_(i, inner)
  },
  column: (i: BriefItem, w: number) => 35 + heightOf(i.title ?? '', w, 19, 1.25) + 10 + heightOf(body(i), w, 15, 1.55) + 10 + whoH_(i, w),
  pair: (i: BriefItem, blocks: boolean) => blocks || i.title
    ? 28 + (i.title ? 32 : 0) + heightOf(body(i), 556, 16, 1.55) + whoH_(i, 556)
    : 22 + heightOf(body(i), 538, 15, 1.55) + whoH_(i, 538),
  question: (i: BriefItem) => 30 + heightOf(i.text, 514, 17, 1.3) + (i.detail ? 4 + heightOf(i.detail, 514, 14, 1.5) : 0) + whoH_(i, 514),
  word: (i: BriefItem) => 18 + heightOf(body(i), 631, 15, 1.55) + whoH_(i, 631),
  market: (i: BriefItem) => 17 + Math.max(28, heightOf(i.text, 518, 14, 1.5) + (i.tag ? 20 : 0)),
  said: (i: BriefItem) => 22 + heightOf(body(i), 386, 15, 1.55) + whoH_(i, 386),
  weigh: (i: BriefItem, w: number) => 18 + heightOf(i.title ?? '', w, 16, 1.3) + heightOf(i.text, w, 14, 1.45) + whoH_(i, w),
  risk: (i: BriefItem, w: number) => 44 + 22 + heightOf(i.title ?? '', w - 52, 23, 1.25) + 10 + heightOf(i.text, w - 52, 15, 1.55) + 10 + whoH_(i, w - 52, 13),
  decision: (i: BriefItem) => 20 + heightOf(i.text, 522, 15, 1.45) + whoH_(i, 522),
  confusion: (i: BriefItem, w: number) => 34 + heightOf(i.title ?? '', w - 36, 17, 1.3) + 8 + heightOf(body(i), w - 36, 14, 1.55) + 8 + whoH_(i, w - 36),
}
}

/** The default heights (a brief whose who lines are not known). */
export const heights = heightsFor()

/** Items into pages: each page takes items while their heights fit its room
 *  (the first page's room may be less). A page always takes one. Pure. */
export function fillByHeight<T>(items: readonly T[], h: (x: T) => number, first: number, room = ROOM): T[][] {
  const pages: T[][] = [[]]
  let left = first
  for (const x of items) {
    const hx = h(x)
    if (pages[pages.length - 1].length > 0 && hx > left) {
      pages.push([])
      left = room
    }
    pages[pages.length - 1].push(x)
    left -= hx
  }
  return pages.filter((p) => p.length > 0)
}

/**
 * Side-by-side items into pages: as many across as fit (from `most` down),
 * laid out in `least` slots or more (the design's three rivals across, four
 * triggers), where the tallest of them fits `room`. One item too tall for its
 * slot takes a wider one, down to the whole width. Each page says how many
 * slots it is laid out in. Pure.
 */
export function acrossPages<T>(items: readonly T[], most: number, least: number, h: (x: T, slots: number) => number, room: number): { items: T[]; slots: number }[] {
  const pages: { items: T[]; slots: number }[] = []
  let k = 0
  const tallest = (xs: readonly T[], slots: number) => Math.max(...xs.map((x) => h(x, slots)))
  while (k < items.length) {
    let take = Math.min(most, items.length - k)
    while (take > 1 && tallest(items.slice(k, k + take), Math.max(least, take)) > room) take--
    let slots = Math.max(least, take)
    while (slots > take && tallest(items.slice(k, k + take), slots) > room) slots--
    pages.push({ items: items.slice(k, k + take), slots })
    k += take
  }
  return pages
}

/** Which page a section's voice prints on: the first whose tallest item
 *  leaves room for it, else the one with the most room. Pure. */
export function quotePage(tallest: readonly number[], quote: number, room: number): number {
  const fits = tallest.findIndex((t) => t + quote <= room)
  if (fits >= 0) return fits
  return tallest.reduce((best, t, i) => (t < tallest[best] ? i : best), 0)
}

type Located = { gi: number; item: BriefItem }

/** A section holding only these items (groups kept in order), the first
 *  page's lead, quote and voices on the first page only, and a group's own
 *  lines with its last item. */
function withItems(s: BriefSection, chunk: readonly Located[], continued: boolean): BriefSection {
  const groups = s.groups
    .map((g, gi) => {
      const items = chunk.filter((x) => x.gi === gi).map((x) => x.item)
      const last = g.items.length > 0 && items.includes(g.items[g.items.length - 1])
      const out = { ...g, items }
      if (!last) delete out.lines
      return out
    })
    .filter((g) => g.items.length > 0 || (g.lines?.length ?? 0) > 0)
  if (!continued) return { ...s, groups }
  const out: BriefSection = { key: s.key, title: s.title, groups }
  if (s.base) out.base = s.base
  return out
}

/** Pages of the two-column layout: each column fills its own pages (the left
 *  with what is believed or praised, the right with what is doubted or
 *  criticised), and page n holds each column's n-th. `first` is each
 *  column's room on the first page. Pure. */
function pairPages(s: BriefSection, all: readonly Located[], first: readonly [number, number], blocks: boolean, heights: ReturnType<typeof heightsFor>): Located[][] {
  const col = (x: Located) => pairColumn(s.groups[x.gi]?.label)
  const columns = ([0, 1] as const).map((c) => fillByHeight(all.filter((x) => col(x) === c), (x) => heights.pair(x.item, blocks), first[c]))
  const n = Math.max(columns[0].length, columns[1].length)
  // In source order on each page, so the groups keep theirs.
  return Array.from({ length: n }, (_, k) => all.filter((x) => (columns[0][k] ?? []).includes(x) || (columns[1][k] ?? []).includes(x)))
}

export interface SectionPlan {
  /** `asPair`: a continued page drawn as the design's two-column page (what
   *  the company is praised and criticised for, what keeps and moves buyers,
   *  carried on). */
  slices: { section: BriefSection; continued: boolean; companion: BriefSection | null; asPair?: boolean; across?: number }[]
  /** Did the companion print beside it? Otherwise it takes pages of its own. */
  companionPlaced: boolean
}

/**
 * A section cut into the pages it needs, by its layout's measure. The first
 * page keeps its lead, quote, voices and code's lines; a continued page has
 * its items alone. A companion prints beside its partner where both fit.
 * Pure.
 */
export function planSection(s: BriefSection, companion: BriefSection | null = null, who: WhoCtx = ANY): SectionPlan {
  const heights = heightsFor(who)
  const layout = LAYOUT[s.key]
  const all: Located[] = s.groups.flatMap((g, gi) => g.items.map((item) => ({ gi, item })))
  const one = (companionPlaced = false): SectionPlan => ({ slices: [{ section: s, continued: false, companion: companionPlaced ? companion : null }], companionPlaced })
  const cut = (pages: Located[][], placed: BriefSection | null = null, pairFrom = Infinity): SectionPlan => ({
    slices: (pages.length ? pages : [[]]).map((p, k) => ({ section: withItems(s, p, k > 0), continued: k > 0, companion: k === 0 ? placed : null, ...(k >= pairFrom ? { asPair: true } : {}) })),
    companionPlaced: placed != null,
  })
  /** Side by side: each page's slots, and the voice on the page with room:
   *  in a free slot beside the items where a page has one (`beside`, the
   *  height of the voice in a slot), else under them. */
  const across = (pages: { items: Located[]; slots: number }[], h: (x: Located, slots: number) => number, quote: number, room: number, beside?: (slots: number) => number): SectionPlan => {
    const plan = cut(pages.map((p) => p.items))
    const free = beside ? pages.findIndex((p) => p.items.length < p.slots && beside(p.slots) <= room) : -1
    const at = !s.quote || quote <= 0 ? 0 : free >= 0 ? free : quotePage(pages.map((p) => Math.max(...p.items.map((x) => h(x, p.slots)))), quote, room)
    plan.slices = plan.slices.map((x, k) => {
      const section = { ...x.section }
      if (k === at && s.quote) section.quote = s.quote
      else delete section.quote
      return { ...x, section, across: pages[k]?.slots }
    })
    return plan
  }
  const byHeight = (h: (i: BriefItem) => number, first: number) => {
    const pages = fillByHeight(all, (x) => h(x.item), first)
    return pages
  }
  switch (layout) {
    case 'formats':
    case 'voices':
      return one()
    case 'rows': {
      const more = s.key === 'content.more'
      const firstRoom = ROOM - leadH(s.lead, 710, 17)
      // The companion's panel, with the section's voice above it, beside the rows.
      const panel = companion ? 46 + allOf(companion).reduce((n, i) => n + heights.settle(i), 0) + (s.quote ? quoteH(s.quote, 406, 17) + 16 : 0) : 0
      const placed = companion && panel <= BODY_HEIGHT ? companion : null
      return cut(byHeight((i) => heights.rows(i, more), firstRoom), placed)
    }
    case 'care':
      return cut(byHeight(heights.care, ROOM))
    case 'say_hear':
      return cut(byHeight(heights.sayHear, ROOM - 30 + 22))
    case 'market':
      return cut(byHeight(heights.market, ROOM + 20 - leadH(s.lead, 1160, 17)))
    case 'questions': {
      // Two columns: a row is as tall as its taller question.
      const rows: Located[][] = []
      for (let k = 0; k < all.length; k += 2) rows.push(all.slice(k, k + 2))
      const pages = fillByHeight(rows, (r) => Math.max(...r.map((x) => heights.question(x.item))), ROOM)
      return cut(pages.map((p) => p.flat()))
    }
    case 'words':
      return cut(fillByHeight(all, (x) => heights.word(x.item) + (all.findIndex((y) => y.gi === x.gi) === all.indexOf(x) ? 26 : 0), ROOM - leadH(s.lead, 649, 18)))
    case 'pair': {
      const blocks = s.key === 'content.watch'
      const top = ROOM - leadH(s.lead, 1080, blocks ? 22 : 18) - 22
      // The voice prints at the foot of the right-hand column.
      return cut(pairPages(s, all, [top, top - (s.quote ? quoteH(s.quote, 556, 17) + 10 : 0)], blocks, heights))
    }
    case 'buyers': {
      // Two to a page, each card half the page; one too tall for half takes it all.
      const half = (ROOM - 12) / 2
      const pages: { items: Located[]; slots: number }[] = []
      for (let k = 0; k < all.length;) {
        const two = all.slice(k, k + 2)
        const fits = Math.max(...two.map((x) => heights.buyer(x.item))) <= half
        const take = two.length === 2 && fits ? 2 : 1
        pages.push({ items: all.slice(k, k + take), slots: take === 2 || fits ? 2 : 1 })
        k += take
      }
      return across(pages, (x) => heights.buyer(x.item), 0, ROOM)
    }
    case 'cards': {
      const sales = s.key === 'sales.rivals'
      const width = (k: number) => (W - 18 * (k - 1)) / k
      const h = (x: Located, k: number) => heights.card(x.item, width(k), sales)
      const room = ROOM - 14
      return across(acrossPages(all, 4, 3, h, room), h, s.quote ? quoteH(s.quote, width(3), 14) + 14 : 0, room, (k) => quoteH(s.quote, width(k), 14))
    }
    case 'columns': {
      const width = (k: number) => (W - 24 * (k - 1)) / k
      const h = (x: Located, k: number) => heights.column(x.item, width(k))
      const room = ROOM - 22
      return across(acrossPages(all, 5, 4, h, room), h, s.quote ? quoteH(s.quote, (W - 20) / 2, 15) + 22 : 0, room, (k) => quoteH(s.quote, width(k), 15))
    }
    case 'confusion': {
      const width = (k: number) => (W - 14 * (k - 1)) / k
      const h = (x: Located, k: number) => heights.confusion(x.item, width(k))
      const lead = leadH(s.lead, 1100, 24) + 8
      const pages = acrossPages(all, 5, 4, h, ROOM - 22 - lead)
      // Pages after the first have the lead's room as well.
      return across(pages, h, 0, ROOM - 22)
    }
    case 'risks': {
      const width = (k: number) => (W - 20 * (k - 1)) / k
      const h = (x: Located, k: number) => heights.risk(x.item, width(k))
      const lead = leadH(s.lead, 1160, 17)
      const pages = acrossPages(all, 3, 1, h, ROOM + 30 - lead)
      // The questions under the cards, two to a row, where they fit.
      let placed: BriefSection | null = null
      if (companion && pages.length === 1) {
        const tallest = Math.max(0, ...pages[0].items.map((x) => h(x, pages[0].slots)))
        const qs = allOf(companion)
        let rowsH = 0
        for (let k = 0; k < qs.length; k += 2) rowsH += Math.max(...qs.slice(k, k + 2).map(heights.decision))
        if (tallest + 18 + 28 + rowsH <= ROOM + 30 - lead) placed = companion
      }
      const plan = across(pages, h, 0, ROOM)
      plan.slices[0] = { ...plan.slices[0], companion: placed }
      plan.companionPlaced = placed != null
      return plan
    }
    case 'shares': {
      // The talk table and its own-posts line stay on the first page; what
      // the company is praised and criticised for sits in the panel beside
      // it, and carries on, two columns, where it is long.
      const talkGi = s.groups.findIndex((g) => g.items.some((i) => i.measure?.comments != null) || (g.lines?.length ?? 0) > 0)
      const said = all.filter((x) => x.gi !== talkGi)
      const talk = all.filter((x) => x.gi === talkGi)
      const panelFirst = ROOM - 40 - leadH(s.lead, 404, 16)
      const pages = fillByHeight(said, (x) => heights.said(x.item) + (said.findIndex((y) => y.gi === x.gi) === said.indexOf(x) ? 30 : 0), panelFirst)
      const out: Located[][] = [[...talk, ...(pages[0] ?? [])]]
      // Carried on in two columns, as the design's pair pages draw them.
      const rest = pages.slice(1).flat()
      if (rest.length) out.push(...pairPages(s, rest, [ROOM, ROOM], false, heights))
      return cut(out, null, 1)
    }
    case 'weigh': {
      // What they weigh down the left; what keeps and what moves them side by
      // side in the panel. Each carries on where it is long.
      const left = all.filter((x) => x.gi === 0)
      const panel = all.filter((x) => x.gi > 0)
      const top = s.lead ? Math.max(leadH(s.lead, 736, 20), quoteH(s.quote, 352, 15)) + 16 : 0
      const lw = panel.length ? 388 : 562
      const leftPages = fillByHeight(left, (x) => heights.weigh(x.item, lw), ROOM - top - 22, ROOM - 22)
      const panelH = (xs: readonly Located[]) => 54 + Math.max(0, ...s.groups.map((_g, gi) => xs.filter((x) => x.gi === gi).reduce((n, x) => n + heights.weigh(x.item, 332), 0)))
      const panelFits = panelH(panel) <= ROOM - top
      const pages: Located[][] = leftPages.length ? leftPages.map((p, k) => [...p, ...(k === 0 && panelFits ? panel : [])]) : [panelFits ? panel : []]
      const pairFrom = pages.length
      if (!panelFits && panel.length) pages.push(...pairPages(s, panel, [ROOM, ROOM], false, heights))
      return cut(pages, null, pairFrom)
    }
  }
}

const allOf = (s: BriefSection): BriefItem[] => s.groups.flatMap((g) => g.items)

/** The section's quotes and voices, for a reader that wants them. */
export const sectionQuotes = (s: BriefSection): BriefQuote[] => [...(s.quote ? [s.quote] : []), ...(s.voices ?? [])]

// ---- A finding's page ----------------------------------------------------------------------------------

/** The left column's and the right column's widths on a finding page. */
const FINDING_LEFT = 658
const FINDING_RIGHT = 454

/**
 * How a finding fills its page (the design: what was heard, the practice
 * lines and where it was heard down the left; what it means and the voices
 * down the right). The type steps down where the words are long, and a voice
 * that fits in neither column goes to the finding's second page rather than
 * off the sheet. Pure.
 */
export function findingPlan(f: BriefFinding): FindingPlan {
  const quotes = (f.quotes as (BriefQuote & { english?: string | null })[]).filter((q) => q && quoteWords(q))
  const headline = f.headline.length > 70 ? 28 : 31
  const headH = heightOf(f.headline, FINDING_LEFT, headline, 1.2) + 14
  const heard = 44
  const practiceH = (size: number) => (f.practice.length ? 26 + f.practice.reduce((n, t) => n + heightOf(t, FINDING_LEFT - 16, size, 1.5) + 6, 0) : 0)
  const sawH = (size: number) => f.saw.reduce((n, p) => n + heightOf(p, FINDING_LEFT, size, 1.58) + 14, 0)
  let saw = 16
  for (const size of [16, 15.5, 15, 14.5, 14]) {
    saw = size
    if (headH + sawH(size) + practiceH(Math.min(15, size)) + heard <= BODY_HEIGHT) break
  }
  const leftUsed = headH + sawH(saw) + practiceH(Math.min(15, saw)) + heard
  const practice: FindingPlan['practice'] = leftUsed <= BODY_HEIGHT + 8 ? 'left' : 'next'
  const leftH = practice === 'left' ? leftUsed : headH + sawH(saw) + heard
  let means = 17
  const meansH = (size: number) => 48 + 20 + heightOf(f.means, FINDING_RIGHT - 48, size, 1.5)
  for (const size of [17, 16, 15]) {
    means = size
    if (meansH(size) + 14 + (quotes[0] ? quoteH(quotes[0], FINDING_RIGHT, 17) : 0) <= BODY_HEIGHT) break
  }
  let right = meansH(means)
  let left = leftH
  const places: FindingPlan['quotes'] = quotes.map((q, k) => {
    const inRight = quoteH(q, FINDING_RIGHT, k === 0 ? 17 : 16) + 14
    if (right + inRight <= BODY_HEIGHT) { right += inRight; return 'right' }
    const inLeft = quoteH(q, FINDING_LEFT, 15) + 14
    if (k > 0 && left + inLeft <= BODY_HEIGHT) { left += inLeft; return 'left' }
    return 'next'
  })
  return { headline, saw, practice, means, quotes: places }
}

// ---- The deck ------------------------------------------------------------------------------------------

/** In short's type: the summary as large as fits beside the contents. Pure. */
export function inShortSizes(summary: string, toc: readonly string[]): { summarySize: number; tocSize: number } {
  const tocSize = toc.length > 8 ? 13 : 14
  let rows = 0
  for (let k = 0; k < toc.length; k += 2) rows += Math.max(...toc.slice(k, k + 2).map((t) => heightOf(t, 285, tocSize, 1.4))) + 6
  // The title, the gaps, the contents' rule and label, and a margin.
  const fixed = 42 + 20 + 20 + 44 + 24 + rows
  for (const size of [22, 20, 19, 18, 17]) if (fixed + heightOf(summary, FINDING_LEFT, size, 1.5, true) <= BODY_HEIGHT) return { summarySize: size, tocSize }
  return { summarySize: 16, tocSize }
}

/**
 * The deck's pages, in order, numbered: the cover, In short, the findings
 * (Leadership's after where the company stands), then the role's sections.
 * Pure.
 */
export function deckPages(d: StoredBriefData): DeckPage[] {
  const pages: Omit<DeckPage, 'n'>[] = [{ eyebrow: '', toc: null, body: { kind: 'cover' } }, { eyebrow: 'In short', toc: null, body: { kind: 'in_short', summarySize: 22, tocSize: 14 } }]
  const findings = () => d.findings.forEach((f, index) => {
    const eyebrow = d.findings.length === 1 ? 'The finding' : `Finding ${index + 1} of ${d.findings.length}`
    const plan = findingPlan(f)
    pages.push({ eyebrow, toc: f.headline, body: { kind: 'finding', finding: f, index, of: d.findings.length, plan, part: 1 } })
    if (plan.practice === 'next' || plan.quotes.includes('next')) pages.push({ eyebrow, toc: null, body: { kind: 'finding', finding: f, index, of: d.findings.length, plan, part: 2 } })
  })
  const after = FINDINGS_AFTER[d.role]
  let placed = after == null || !d.sections.some((s) => s.key === after)
  if (placed) findings()
  const besidePartner = new Set<SectionKey>()
  for (const s of d.sections) {
    if (besidePartner.has(s.key)) continue
    const partnerKey = COMPANION[s.key]
    const companion = partnerKey ? d.sections.find((x) => x.key === partnerKey) ?? null : null
    const plan = planSection(s, companion, { company: d.company, noun: d.noun })
    if (plan.companionPlaced && partnerKey) besidePartner.add(partnerKey)
    plan.slices.forEach((slice, k) => pages.push({
      eyebrow: eyebrowOf(s.key, d.company),
      toc: k === 0 ? s.title : null,
      body: { kind: 'section', ...slice },
    }))
    if (!placed && s.key === after) { findings(); placed = true }
  }
  if (!placed) findings()
  const numbered = pages.map((p, i) => ({ ...p, n: i + 1 }))
  // In short's type, now the contents are known.
  const sizes = inShortSizes(d.inShort.summary, contentsOf(numbered).map((t) => t.title))
  return numbered.map((p) => (p.body.kind === 'in_short' ? { ...p, body: { kind: 'in_short' as const, ...sizes } } : p))
}

/** The contents: each finding's and section's first page, with its number.
 *  Pure. */
export const contentsOf = (pages: readonly DeckPage[]): { n: number; title: string }[] =>
  pages.filter((p) => p.toc).map((p) => ({ n: p.n, title: p.toc as string }))

/** "Who is buying, continued". */
export const continuedTitle = (title: string): string => `${title}, continued`
