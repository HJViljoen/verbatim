import { aboutName } from '../../brands/labels'
import { fmtInt, longMonth } from '../../format'
import { monthsPhrase } from '../../written/month'
import { languageName } from './markdown'
import { FINDINGS_AFTER, printsSection } from './canvas'
import type { BriefFinding, BriefItem, BriefQuote, BriefRole, BriefSection, StoredBriefData, SectionKey } from './types'
import { BRIEF_NAME, BRIEF_ROLES } from './types'

// The brief as pages (pure): which page holds what, in the order the canvas
// draws them (the Claude Design canvas "Verbatim reports and colour", page
// "Monthly briefs": Brief-{Sales,Marketing,Content,Leadership}-*.dc.html,
// 1280×720 sheets). Heinrich, 12 Oct: every brief looks EXACTLY like the
// canvas, the same page set in the same order with the same components; no
// deviation. The deck component (components/briefs/brief-deck.tsx) draws each
// page; this decides them, so the viewer's page count, the PDF and the deck
// cannot disagree.
//
// THE PAGE SET, per the canvas:
//   Sales       Cover · In short · a finding a page · Who is buying · Who is
//               buying, continued · What stops them (with what they want
//               settled first) · What tips them into buying · Who buyers
//               compare you with · Language to handle with care
//   Marketing   Cover · In short · a finding a page · Believes and doubts · In
//               its own words · Says and hears · How rivals are heard
//   Content     Cover · In short · a finding a page · The questions people
//               ask · Hooks and formats · What viewers come for · What people
//               want shown · Where the confusion starts
//   Leadership  Cover · In short · Where the market stands · Where {company}
//               stands · a finding a page · What buyers weigh · The risks
//               (with the questions for the business) · What holds so far
// A section the canvas has no page for is not printed (canvas.ts
// `printsSection`).
//
// THIN PAGES ARE LEFT OUT (Heinrich, 12 Oct). A page prints only with every
// main piece the canvas draws on it and at least two items in its section,
// counted on what fits the page (`PAGE_NEEDS`, the one table of it). Who is
// buying counts its two sheets together. The cover, In short and a finding's
// page are exempt. What a page left out held stays in the stored brief, and
// the contents, the page count and the page numbers are the printed pages'.
//
// ONE PAGE A SECTION. Each page takes what fits the canvas's layout, at the
// canvas's type, up to the canvas's count (two buyers a page and the one
// continuation; five objections; three rivals; five words to handle with
// care…), and what does not fit stays in the stored brief, unprinted. Heights
// are estimated from the text's length at the page's measured type (characters
// per line from the column width and the font size), never measured in a
// browser: the plan has to be the same in the viewer, the PDF and a test. The
// estimate errs high; scripts/brief-render.ts measures the real pages for
// clipping.

/** The sheet, as the canvas draws it. */
export const SHEET = { width: 1280, height: 720 } as const

/** The body of a content page: 720 less the frame (40 top, 28 bottom, the
 *  header line and its 22px, the footer and its rule). */
export const BODY_HEIGHT = 584
/** The page's width inside its margins. */
const W = 1160

/** Average width of a character, as a share of the font size, measured in
 *  Chrome on English brief copy (5 Oct, and the canvas's own lines, 12 Oct):
 *  IBM Plex Sans 0.43 to 0.447 at 400, 0.470 at 700; IBM Plex Serif 0.476 at
 *  500, 0.420 in italic. Each is rounded up. */
const CHAR = 0.44
const BOLD_CHAR = 0.48
const SERIF_CHAR = 0.48
const ITALIC_CHAR = 0.43

/** The face a text is set in, for its width. */
export type Face = boolean | 'italic' | 'bold'

/** Lines a text takes in a column. `face`: the serif (true), 'italic' for a
 *  quote, 'bold' for a title; the sans by default. Words wrap whole, so a line
 *  past the first holds a little less than its characters. Pure. */
export function linesOf(text: string, widthPx: number, fontPx: number, face: Face = false): number {
  const per = face === 'italic' ? ITALIC_CHAR : face === 'bold' ? BOLD_CHAR : face ? SERIF_CHAR : CHAR
  const perLine = Math.max(8, Math.floor(widthPx / (fontPx * per)))
  const n = (text ?? '').length
  if (n <= perLine) return 1
  return Math.ceil(n / Math.max(6, perLine - 2))
}

/** A text's height in px. Pure. */
export const heightOf = (text: string, widthPx: number, fontPx: number, lineHeight: number, face: Face = false): number =>
  text ? linesOf(text, widthPx, fontPx, face) * fontPx * lineHeight : 0

// ---- Words the deck prints (code's) ---------------------------------------------------------------

const PLATFORM: Readonly<Record<string, string>> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NUMBER = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

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

/**
 * Where a quote was heard, as the canvas cites it: "Reddit · 23 Sep",
 * "YouTube · 23 Sep · translated from Japanese", and on the company's own
 * posts "On a Sealand post · Instagram · 18 Sep". Talk about a brand says
 * which ("· about Cotopaxi"), the brand attribution every voice carries,
 * except under a label that names it already (`labelled`). Pure.
 */
export function quoteCite(
  q: Pick<BriefQuote, 'platform' | 'date' | 'about' | 'ownPost'> & { lang?: string | null; english?: string | null },
  company: string,
  o: { labelled?: boolean } = {},
): string {
  const date = q.date ? new Date(`${q.date.slice(0, 10)}T00:00:00.000Z`) : null
  const day = date && !Number.isNaN(date.getTime()) ? `${date.getUTCDate()} ${MON[date.getUTCMonth()]}` : null
  const lang = q.english && q.lang ? languageName(q.lang) : null
  const brand = q.ownPost || o.labelled || q.about === 'market' ? null : `about ${aboutName(q.about, { client: company }) ?? 'a rival'}`
  return [
    q.ownPost ? `On ${/^[aeiouäåæéöø]/i.test(company) ? 'an' : 'a'} ${company} post` : null,
    PLATFORM[(q.platform ?? '').toLowerCase()] ?? q.platform ?? null,
    day,
    brand,
    lang ? `translated from ${lang}` : null,
  ].filter(Boolean).join(' · ')
}

/** The words a quote prints: the English where the comment was in another
 *  language (the canvas: "translated from Japanese" in its cite line). */
export const quoteWords = (q: { text: string; english?: string | null }): string => (q.english?.trim() || q.text).replace(/\s+/g, ' ').trim()

/** "Heard in August and September", from the months a finding's videos fall
 *  in. Pure. */
export const heardIn = (f: Pick<BriefFinding, 'months'>): string => {
  const months = f.months.filter((m) => m.videos > 0).map((m) => m.month)
  return months.length ? `Heard in ${monthsPhrase(months)}` : ''
}

/** "Who is buying, continued". */
export const continuedTitle = (title: string): string => `${title}, continued`

/** The singular of the plural noun the product stores ("bags" → "bag"). */
function singular(noun: string): string {
  if (noun.endsWith('ies')) return `${noun.slice(0, -3)}y`
  return noun.endsWith('s') && noun.length > 1 ? noun.slice(0, -1) : noun
}

/** The company's product in the canvas's three phrasings: "bags like
 *  Sealand's", "a bag like Sealand's", "the bag". Pure. */
export function productPhrases(company: string, noun: string | null | undefined): { plural: string; one: string; the: string } {
  const n = (noun ?? '').trim()
  if (!n) return { plural: `products like ${company}'s`, one: `a product like ${company}'s`, the: 'the product' }
  return { plural: `${n} like ${company}'s`, one: `a ${singular(n)} like ${company}'s`, the: `the ${singular(n)}` }
}

// ---- The section's own words on the page ------------------------------------------------------------

/** The header's label, per section: the canvas's eyebrows. */
export const EYEBROW: Readonly<Record<SectionKey, string>> = {
  'sales.buyers': 'Who is buying',
  'sales.deciders': 'Who else decides',
  'sales.stops': 'What stops them',
  'sales.settle': 'Settled first',
  'sales.triggers': 'What tips them into buying',
  'sales.rivals': 'Who buyers compare you with',
  'sales.care': 'Language to handle with care',
  'marketing.believe': 'Believes and doubts',
  'marketing.words': 'In its own words',
  'marketing.say_hear': 'Says and hears',
  'marketing.recall': 'Remembered for',
  'marketing.rivals': 'How rivals are heard',
  'content.questions': 'The questions people ask',
  'content.formats': 'Hooks and formats',
  'content.watch': 'What viewers come for',
  'content.more': 'What people want shown',
  'content.confusion': 'Where the confusion starts',
  'content.borrow': 'Words to borrow',
  'leadership.market': 'Where the market stands',
  'leadership.shares': 'Where {company} stands',
  'leadership.weigh': 'What buyers weigh',
  'leadership.risks': 'The risks',
  'leadership.decisions': 'Questions for the business',
  'leadership.holds': 'What holds so far',
}

/** The name the cover and In short's contents give each section: the
 *  canvas's short names. */
export const CONTENTS: Partial<Readonly<Record<SectionKey, string>>> = {
  'marketing.believe': 'What the market believes and doubts',
  'content.watch': 'What viewers come for',
}

export const eyebrowOf = (key: SectionKey, company: string): string => EYEBROW[key].replace(/\{company\}/g, company)

/** The muted line under a section's title, where the canvas has one: what the
 *  section is, said plainly (code's words, never a claim), or the line code
 *  wrote from counts. Pure. */
export function subtitleOf(s: BriefSection, d: Pick<StoredBriefData, 'company' | 'noun' | 'month'>, all?: BriefSection): string | null {
  const p = productPhrases(d.company, d.noun)
  switch (s.key) {
    case 'sales.buyers': {
      const items = (all ?? s).groups.flatMap((g) => g.items)
      const n = items.length
      const buy = items.filter((i) => !i.muted).length
      if (n === 0) return null
      const kinds = n === 1 ? `One kind of person talks about ${p.plural}.` : `${NUMBER[n] ?? fmtInt(n)} kinds of people talk about ${p.plural}.`
      return buy === n || buy === 0 ? kinds : `${kinds} ${NUMBER[buy] ?? fmtInt(buy)} of them ${buy === 1 ? 'buys' : 'buy'}.`
    }
    case 'sales.stops': return 'The reasons a willing buyer hesitates before committing.'
    case 'sales.triggers': return 'The moments when interest becomes a purchase.'
    case 'sales.rivals': return 'The rivals in the same decision, each met through a clear job.'
    case 'sales.care': return 'Words buyers hear as a promise, and what they already think of them.'
    case 'marketing.believe': return `What people bring to ${p.one} before anyone tells them anything.`
    case 'marketing.words': return `What people call ${p.the}, how they praise it, and how they describe the problem it solves.`
    case 'marketing.rivals': return `The idea each brand stands for in the market's own talk${s.posts?.rows.length ? ', and how often its own posts draw a reply' : ''}.`
    case 'content.questions': return `Asked under posts about ${p.plural}, and left unanswered in the conversation.`
    case 'content.formats': return `Videos published in ${longMonth(d.month)}, by format and by how they open. Engagement is the category's median for each.`
    case 'content.more': return 'Asked for in the comments, in their own terms.'
    case 'leadership.market': return s.base ?? null
    case 'leadership.shares':
    case 'leadership.holds': return s.sub ?? null
    default: return null
  }
}

/** "A", "A and B", "A, B and C". */
const andList = (xs: readonly string[]): string => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** Tagged items' line at the foot of a page, as the canvas writes it under
 *  What stops them (“Trust in the eco story” is argued in full in the
 *  Marketing brief.). Several items on one page that point at the same
 *  brief the same way make one line (“Advanced or high tech”,
 *  “Functionality” and “Everyday life” are argued in full in the Content
 *  brief.), where the first of them stood. Every name is in curly quotes,
 *  one alone too, so a name that is a clause reads as a name (12 Oct: Össur's
 *  Sales printed "Everyday wear is unclear is argued in full in the Content
 *  brief."); the rest of the line is the canvas's. Risk cards carry theirs
 *  on the card. Pure. */
export function footnoteOf(s: BriefSection): string | null {
  if (s.key === 'leadership.risks') return null
  const lines: { argued: boolean; brief: string; titles: string[] }[] = []
  for (const i of s.groups.flatMap((g) => g.items)) {
    if (!i.tag || !i.title) continue
    const argued = /^Argued in the (.+)$/.exec(i.tag)
    const also = /^Also in the (.+)$/.exec(i.tag)
    const brief = (argued ?? also)?.[1]
    if (!brief) continue
    const line = lines.find((l) => l.argued === !!argued && l.brief === brief)
    if (!line) lines.push({ argued: !!argued, brief, titles: [i.title] })
    else if (!line.titles.includes(i.title)) line.titles.push(i.title)
  }
  return lines.length
    ? lines.map((l) => `${andList(l.titles.map((t) => `“${t}”`))} ${l.titles.length === 1 ? 'is' : 'are'} ${l.argued ? 'argued in full in' : 'also in'} the ${l.brief}.`).join(' ')
    : null
}

/** A risk card's foot: "Argued in full in the Marketing brief". Pure. */
export const tagLine = (tag: string | undefined): string | null => {
  if (!tag) return null
  const argued = /^Argued in the (.+)$/.exec(tag)
  return argued ? `Argued in full in the ${argued[1]}` : tag
}

/** Which of a two-column page's columns a group takes: what is believed,
 *  earns a response or holds people on the left (0); what is doubted, loses
 *  them, is criticised or moves people on the right (1), in the orange label,
 *  whichever printed. Pure. */
export const pairColumn = (label: string | undefined): 0 | 1 => (/doubt|complain|criticis|moves|loses/i.test(label ?? '') ? 1 : 0)

// ---- The pages ---------------------------------------------------------------------------------------

/** How a finding fills its page: the type sizes, the practice lines that
 *  print, and where each voice goes (the right column under the reading, the
 *  left under the practice). A voice that fits in neither does not print. */
export interface FindingPlan {
  headline: number
  saw: number
  means: number
  /** How many practice lines print. */
  practice: number
  /** Each quote's place, in order. */
  quotes: ('right' | 'left' | 'none')[]
}

export type PageBody =
  | { kind: 'cover' }
  | { kind: 'in_short'; summarySize: number; tocSize: number }
  | { kind: 'finding'; finding: BriefFinding; index: number; of: number; plan: FindingPlan }
  | { kind: 'section'; section: BriefSection; continued: boolean; companion: BriefSection | null; sub: string | null; footnote: string | null }

export interface DeckPage {
  /** 1-based, across the whole deck. */
  n: number
  /** The header's label (the cover has none). */
  eyebrow: string
  /** The name the contents give this page; null on the cover and In short. */
  toc: string | null
  body: PageBody
}

/** The sections that print on their partner's page, as the canvas draws them:
 *  What they want settled first beside What stops them, the questions for the
 *  business under the risks. */
const COMPANION: Partial<Readonly<Record<SectionKey, SectionKey>>> = {
  'sales.stops': 'sales.settle',
  'leadership.risks': 'leadership.decisions',
}
const COMPANIONS = new Set(Object.values(COMPANION))

/** The canvas's counts: the most a page draws of each section. */
export const PAGE_MAX: Partial<Readonly<Record<SectionKey, number>>> = {
  'sales.buyers': 2,
  'sales.stops': 5,
  'sales.settle': 5,
  'sales.triggers': 5,
  'sales.rivals': 3,
  'sales.care': 5,
  'marketing.say_hear': 5,
  'content.questions': 8,
  'content.more': 5,
  'content.confusion': 5,
  'leadership.market': 5,
  'leadership.risks': 3,
  'leadership.decisions': 4,
  'leadership.holds': 4,
}
/** Who is buying takes its page and the canvas's one continuation. */
export const BUYERS_PAGES = 2

const items = (s: BriefSection): BriefItem[] => s.groups.flatMap((g) => g.items)

/** The section holding only `keep` of its items (groups kept in order). */
function only(s: BriefSection, keep: readonly BriefItem[]): BriefSection {
  return { ...s, groups: s.groups.map((g) => ({ ...g, items: g.items.filter((i) => keep.includes(i)) })).filter((g) => g.items.length > 0 || (g.lines?.length ?? 0) > 0) }
}

/** Items in order while their heights fit `room`: always the first. Pure. */
export function fitItems<T>(xs: readonly T[], h: (x: T) => number, room: number, max = Infinity): T[] {
  const out: T[] = []
  let used = 0
  for (const x of xs) {
    if (out.length >= max) break
    const hx = h(x)
    if (out.length > 0 && used + hx > room) break
    out.push(x)
    used += hx
  }
  return out
}

/** The title block: a 32px title, and the 15px muted line under it. */
const titleH = (sub: string | null, size = 32): number => size * 1.15 + (sub ? 6 + heightOf(sub, W, 15, 1.45) : 0)
const quoteH = (q: BriefQuote | null | undefined, w: number, size: number, pad: [number, number]): number => {
  if (!q) return 0
  const words = quoteWords(q as BriefQuote & { english?: string | null })
  return words ? pad[0] * 2 + heightOf(`“${words}”`, w - pad[1] * 2, size, 1.5, 'italic') + 10 + 20 : 0
}
const FOOT_GAP = 16

/** Heights of each layout's pieces, at the canvas's type and measure. Pure. */
export const H = {
  /** A buyer card's need: its columns, its name (which may wrap) and pill,
   *  and For a sale under the card's spacer (a gap either side of it). */
  buyer: (i: BriefItem): number => {
    const inner = W - 46
    const unit = (inner - 72) / 4.15
    const col1 = heightOf(i.title ?? '', unit * 1.15, 24, 1.3, 'bold') + (i.pill ? 8 + 22 : 0) + 8 + heightOf(i.text, unit * 1.15, 15, 1.45, true)
    const cols = [i.persona?.want, i.persona?.stops, i.persona?.moves].map((t) => (t ? 17 + heightOf(t, unit, 13, 1.45) : 0))
    const sale = i.persona?.forSale ? 11 + Math.max(22, heightOf(i.persona.forSale, inner - 104, 14, 1.45)) : 0
    return 30 + Math.max(col1, ...cols) + 10 + (sale ? 10 + sale : 0)
  },
  stop: (i: BriefItem): number => 25 + Math.max(heightOf(i.title ?? '', 196, 18, 1.3, 'bold'), heightOf(i.text, 490, 15, 1.55)),
  settle: (i: BriefItem): number => 15 + heightOf(i.text, 350, 14, 1.5),
  trigger: (i: BriefItem, w: number): number => 28 + 10 + heightOf(i.title ?? '', w, 19, 1.25, 'bold') + 10 + heightOf(i.text, w, 15, 1.55),
  triggerQuote: (q: BriefQuote): number => 19 + quoteH(q, (W - 40) / 3, 15, [14, 18]),
  rival: (i: BriefItem, w: number): number => {
    const inner = w - 46
    return 38 + 31 + (i.pill ? 6 + 30 : 0) + 12 + 19 + heightOf(i.text, inner, 14.5, 1.52) + (i.detail ? 12 + 19 + heightOf(i.detail, inner, 14.5, 1.52) : 0)
  },
  care: (i: BriefItem): number => 45 + Math.max(heightOf(i.title ?? '', 467, 32, 1.15, 'bold'), heightOf(i.text, 665, 20, 1.5)),
  bullet: (i: BriefItem, w: number): number => 23 + heightOf(i.text, w - 18, 15, 1.55),
  sayHear: (i: BriefItem): number => 35 + Math.max(heightOf(i.title ?? '', 420, 16, 1.45, 'bold'), heightOf(i.text, 518, 16, 1.5), 22),
  // The card's idea at 22px 700 runs wider than a title (about 0.55 of its
  // size a character, measured on "Community environmental action", 12 Oct),
  // so its measure is taken narrower.
  heardCard: (i: BriefItem, w: number): number => 34 + 15 + 8 + heightOf(i.pill ?? '', (w - 42) * 0.87, 22, 1.2, 'bold') + 8 + heightOf(i.text, w - 42, 14, 1.5),
  question: (i: BriefItem): number => 31 + heightOf(i.text, 514, 18, 1.3, 'bold') + (i.detail ? 4 + heightOf(i.detail, 514, 14, 1.5) : 0),
  watch: (i: BriefItem): number => 37 + heightOf(i.title ?? '', 556, 21, 1.2, 'bold') + 6 + heightOf(i.text, 556, 17, 1.55),
  more: (i: BriefItem): number => 39 + Math.max(heightOf(i.title ?? '', 196, 21, 1.3, 'bold'), heightOf(i.text, 490, 17, 1.55)),
  confusion: (i: BriefItem, w: number): number => 38 + heightOf(i.title ?? '', w - 36, 17, 1.3, 'bold') + 8 + heightOf(i.text, w - 36, 14, 1.5),
  subject: (i: BriefItem): number => 17 + Math.max(22, i.quote && !i.text ? heightOf(`“${quoteWords(i.quote as BriefQuote & { english?: string | null })}” Reddit · 26 Sep`, 518, 14, 1.5, 'italic') : heightOf(i.text, 518, 14, 1.5)),
  weigh: (i: BriefItem, w: number): number => 19 + heightOf(i.title ?? '', w, 16, 1.3, 'bold') + 2 + heightOf(i.text, w, 14, 1.45),
  risk: (i: BriefItem, w: number): number => 44 + 14 + 10 + heightOf(i.title ?? '', w - 52, 23, 1.25, 'bold') + 10 + heightOf(i.text, w - 52, 15, 1.55) + (i.tag ? 10 + 18 : 0),
  decision: (i: BriefItem): number => 21 + heightOf(i.text, 537, 15, 1.45),
  pattern: (i: BriefItem): number => 37 + heightOf(i.text, 610, 22, 1.45, true),
  /** What holds so far's position card, and its panel of the month's ideas
   *  (the right column, 442 wide). */
  position: (text: string): number => 36 + 14 + 6 + heightOf(text, 398, 18, 1.4, 'bold'),
  ideas: (headlines: readonly string[]): number => (headlines.length ? 22 + 15 + 8 + headlines.reduce((n, h) => n + 23 + 15 + 3 + heightOf(h, 398, 15, 1.35, 'bold'), 0) : 0),
}

/**
 * A section cut to the canvas's page or pages: the items that fit at the
 * canvas's type, up to its count, the companion beside it where it has one.
 * Pure.
 */
export function planSection(s: BriefSection, companion: BriefSection | null, d: Pick<StoredBriefData, 'company' | 'noun' | 'month' | 'findings' | 'inShort'>): { section: BriefSection; continued: boolean; companion: BriefSection | null; sub: string | null; footnote: string | null }[] {
  const all = items(s)
  const max = PAGE_MAX[s.key] ?? Infinity
  const page = (section: BriefSection, o: { continued?: boolean; companion?: BriefSection | null; sub?: string | null } = {}) => ({
    section,
    continued: o.continued ?? false,
    companion: o.companion ?? null,
    sub: o.sub === undefined ? subtitleOf(section, d) : o.sub,
    footnote: footnoteOf(section),
  })
  const sub = subtitleOf(s, d)
  /** The footnote's room, in a column `w` wide, where one prints. */
  const foot = (xs: readonly BriefItem[], w = W) => {
    const t = footnoteOf(only(s, xs))
    return t ? FOOT_GAP + heightOf(t, w, 13, 1.35) : 0
  }
  switch (s.key) {
    case 'sales.buyers': {
      // Two a page, the canvas's page and its one continuation. The two
      // cards share the page equally, so two go on a page only where the
      // taller fits half of it; one that does not waits for the next page,
      // and what neither page holds stays in the stored brief.
      const pairFits = (xs: readonly BriefItem[], first: boolean) =>
        2 * Math.max(...xs.map(H.buyer)) + 12 <= BODY_HEIGHT - titleH(first ? sub : null) - 16 - foot(xs)
      const pages: BriefItem[][] = []
      for (let at = 0; pages.length < BUYERS_PAGES && at < all.length;) {
        const next = all.slice(at, at + max)
        const p = next.length > 1 && pairFits(next, pages.length === 0) ? next : next.slice(0, 1)
        pages.push(p)
        at += p.length
      }
      // A sheet of one buyer prints only where that buyer fills it, too
      // long to share (Heinrich, 12 Oct: "one long buyer that fills a sheet
      // is fine"); a short one alone, the odd third, would leave half the
      // sheet empty, and stays stored. The section's two then count across
      // the sheets that print (PAGE_NEEDS).
      const kept = pages.filter((p, k) => p.length > 1 || !pairFits([p[0], p[0]], k === 0))
      // The heading counts every buyer the brief found, printed or not
      // (Heinrich, 12 Oct): "Four kinds of people…" where two print.
      return kept.map((p, k) => page(only(s, p), { continued: k > 0, sub: k === 0 ? subtitleOf(s, d, s) : null }))
    }
    case 'sales.stops': {
      const room = BODY_HEIGHT - titleH(sub) - 14
      const rows = fitItems(all, H.stop, room - foot(all, 710), max)
      // The right column: the voice, then what they want settled first.
      let settle = companion ? items(companion).slice(0, PAGE_MAX['sales.settle']) : []
      const q = quoteH(s.quote, 406, 17, [20, 24])
      const panel = (xs: BriefItem[]) => (xs.length ? 46 + xs.reduce((n, i) => n + H.settle(i), 0) : 0)
      while (settle.length && q + 16 + panel(settle) > BODY_HEIGHT) settle = settle.slice(0, -1)
      const out = { ...only(s, rows) }
      if (q + (settle.length ? 16 + panel(settle) : 0) > BODY_HEIGHT) delete out.quote
      return [page(out, { companion: companion && settle.length ? only(companion, settle) : null })]
    }
    case 'sales.triggers': {
      const shown = all.slice(0, max)
      const w = (W - 24 * 4) / 5
      const tallest = Math.max(...shown.map((i) => H.trigger(i, w)))
      const room = BODY_HEIGHT - titleH(sub) - 22 - tallest - 22 - foot(shown)
      // A voice a moment, the row as tall as its tallest.
      let quoted = shown.filter((i) => i.quote && quoteWords(i.quote as BriefQuote & { english?: string | null }))
      while (quoted.length && Math.max(...quoted.map((i) => H.triggerQuote(i.quote!))) > room) quoted = quoted.slice(0, -1)
      const kept = shown.map((i) => (quoted.includes(i) || !i.quote ? i : (() => { const x = { ...i }; delete x.quote; return x })()))
      return [page({ ...s, groups: [{ items: kept }] })]
    }
    case 'sales.rivals': {
      const w = (W - 40) / 3
      const roomUnder = (xs: readonly BriefItem[]) => BODY_HEIGHT - titleH(sub) - 14 - Math.max(...xs.map((i) => H.rival(i, w))) - 14 - foot(xs)
      const alsoH = s.also ? 13 + 20 + heightOf(s.also, (W - 20) * (2 / 3), 15, 1.5) : 0
      // Also in the set is a main piece of the page (PAGE_NEEDS): where it
      // does not fit under the cards, a card goes before it does, down to
      // the page's two.
      let shown = all.slice(0, max)
      while (shown.length > PAGE_MIN_ITEMS && alsoH > roomUnder(shown)) shown = shown.slice(0, -1)
      if (alsoH > roomUnder(shown)) shown = all.slice(0, max)
      const room = roomUnder(shown)
      const quoted = shown.find((i) => i.quote)
      const qH = quoted ? 20 + quoteH(quoted.quote, (W - 20) / 3, 14, [12, 16]) : 0
      const out = only(s, shown)
      if (Math.max(alsoH, qH) > room) {
        // The voice goes first, then the line.
        out.groups = out.groups.map((g) => ({ ...g, items: g.items.map((i) => { const x = { ...i }; delete x.quote; return x }) }))
        if (alsoH > room) delete out.also
      }
      return [page(out)]
    }
    case 'sales.care': {
      const rows = fitItems(all, H.care, BODY_HEIGHT - titleH(sub) - 16 - foot(all), max)
      return [page(only(s, rows))]
    }
    case 'marketing.believe': {
      const col = (W - 48) / 2
      const top = BODY_HEIGHT - titleH(sub) - 18 - 27
      const left = s.groups.filter((g) => pairColumn(g.label) === 0).flatMap((g) => g.items)
      const right = s.groups.filter((g) => pairColumn(g.label) === 1).flatMap((g) => g.items)
      const q = s.quote ? quoteH(s.quote, col, 17, [20, 24]) + 10 : 0
      const keepL = fitItems(left, (i) => H.bullet(i, col), top - foot(left, col))
      const keepR = fitItems(right, (i) => H.bullet(i, col), top - q)
      return [page(only(s, [...keepL, ...keepR]))]
    }
    case 'marketing.words': {
      const left = (W - 48) * (1.4 / 2.4)
      const room = BODY_HEIGHT - titleH(sub) - 18
      const lead = s.lead ? heightOf(s.lead, left, 18, 1.5, true) + 22 : 0
      // A chip that only repeats another's plural goes first, so the fit and
      // the page's count (PAGE_NEEDS) are the chips that print.
      let chips = (s.chips ?? []).map((c) => ({ ...c, words: distinctChips(c.words) }))
      const chipsH = () => chips.reduce((n, c) => n + 24 + chipRows(c.words, left) * 39, 0) + Math.max(0, chips.length - 1) * 22
      while (chips.length && chipsH() + lead > room) {
        const longest = chips.reduce((x, c) => (c.words.length > x.words.length ? c : x), chips[0])
        longest.words.pop()
        chips = chips.filter((c) => c.words.length > 0)
      }
      return [page({ ...s, chips })]
    }
    case 'marketing.say_hear': {
      const rows = fitItems(all, H.sayHear, BODY_HEIGHT - 38 - 18 - 23 - foot(all), max)
      return [page(only(s, rows))]
    }
    case 'marketing.rivals': {
      const cards = all.filter((i) => !i.you).slice(0, 3)
      const you = all.find((i) => i.you)
      const shown = [...cards, ...(you ? [you] : [])]
      const n = Math.max(1, shown.length)
      const w = (W - 14 * (n - 1)) / n
      const cardsH = shown.length ? Math.max(...shown.map((i) => H.heardCard(i, w))) : 0
      const room = BODY_HEIGHT - titleH(sub, 30) - 16 - (cardsH ? cardsH + 16 : 0)
      // The table: its label, the header (its "Five or more comments" wraps
      // to two lines), and a row 32px as Chrome draws it (measured on
      // Sealand's September, 12 Oct), counted at 33 to err high.
      const rows = (s.posts?.rows ?? []).slice(0, Math.max(0, Math.floor((room - 6 - 15 - 8 - 34) / 33)))
      const out = only(s, shown)
      if (s.posts) out.posts = rows.length ? { ...s.posts, rows } : undefined
      if (!out.posts) delete out.posts
      return [page(out, { sub: subtitleOf(out, d) })]
    }
    case 'content.questions': {
      const rows: BriefItem[][] = []
      const shown = all.slice(0, max)
      for (let k = 0; k < shown.length; k += 2) rows.push(shown.slice(k, k + 2))
      const fit = fitItems(rows, (r) => Math.max(...r.map(H.question)), BODY_HEIGHT - titleH(sub) - 16 - foot(all))
      return [page(only(s, fit.flat()))]
    }
    case 'content.formats':
      return [page(s)]
    case 'content.watch': {
      const lead = s.lead ? 22 + heightOf(s.lead, 1080, 23, 1.5, true) : 0
      const room = BODY_HEIGHT - 37 - lead - 22 - 23 - foot(all, (W - 48) / 2)
      const left = s.groups.filter((g) => pairColumn(g.label) === 0).flatMap((g) => g.items)
      const right = s.groups.filter((g) => pairColumn(g.label) === 1).flatMap((g) => g.items)
      return [page(only(s, [...fitItems(left, H.watch, room, 3), ...fitItems(right, H.watch, room, 3)]))]
    }
    case 'content.more': {
      const rows = fitItems(all, H.more, BODY_HEIGHT - titleH(sub) - 14 - foot(all, 710), max)
      const out = only(s, rows)
      if (s.quote && quoteH(s.quote, 406, 19, [20, 24]) > BODY_HEIGHT) delete out.quote
      return [page(out)]
    }
    case 'content.confusion': {
      const lead = s.lead ? 22 + heightOf(s.lead, 1100, 26, 1.45, true) : 0
      const note = s.note ? 22 + heightOf(s.note, 1040, 19, 1.55) : 0
      const tall = (xs: readonly BriefItem[]) => {
        const n = Math.max(1, xs.length)
        // The title, the lead and the note each with its gap, and the
        // spacer's gap and the cards' under it.
        return 37 + lead + note + 22 + 22 + Math.max(...xs.map((i) => H.confusion(i, (W - 14 * (n - 1)) / n))) + foot(xs)
      }
      // Where it starts is a main piece of the page (PAGE_NEEDS): where it
      // does not fit over the cards, a card goes before it does (the rest
      // widen), down to the page's two.
      let shown = all.slice(0, max)
      while (shown.length > PAGE_MIN_ITEMS && tall(shown) > BODY_HEIGHT) shown = shown.slice(0, -1)
      if (tall(shown) > BODY_HEIGHT) shown = all.slice(0, max)
      const out = only(s, shown)
      if (tall(shown) > BODY_HEIGHT) delete out.note
      return [page(out)]
    }
    case 'leadership.market': {
      const panel = s.kinds || s.mood ? 10 + 148 : 0
      const room = BODY_HEIGHT - 37 - 10 - panel - 10 - 32 - foot(all)
      const rows = fitItems(all, H.subject, room, max)
      // The subjects past the page's room or its five, with their level:
      // "Also following" (never a bare name: one with no level is left out).
      const rest = all.filter((i) => !rows.includes(i) && i.measure?.pct != null)
      const out = only(s, rows)
      if (rest.length) out.also = `Also following: ${rest.map((i) => `${i.title} ${i.measure!.pct}%`).join(', ')}.`
      else delete out.also
      return [page(out)]
    }
    case 'leadership.shares': {
      const brands = all.slice(0, 7)
      return [page(only(s, brands))]
    }
    case 'leadership.weigh': {
      const lw = (W - 36) / 2.9
      const pw = (lw * 1.9 - 44 - 28) / 2
      const top = s.lead || s.quote ? Math.max(heightOf(s.lead ?? '', lw * 1.9, 20, 1.5, true), quoteH(s.quote, lw, 15, [14, 18])) + 16 : 0
      const room = BODY_HEIGHT - 37 - 16 - top - 21 - foot(all, lw)
      const [first, ...rest] = s.groups
      const keep = [
        ...fitItems(first?.items ?? [], (i) => H.weigh(i, lw), room, 5),
        ...rest.flatMap((g) => fitItems(g.items, (i) => H.weigh(i, pw), room - 32, 3)),
      ]
      return [page(only(s, keep))]
    }
    case 'leadership.risks': {
      const shown = all.slice(0, max)
      const n = Math.max(1, shown.length)
      const w = (W - 20 * (n - 1)) / n
      const cards = Math.max(...shown.map((i) => H.risk(i, w)))
      let qs = companion ? items(companion).slice(0, PAGE_MAX['leadership.decisions']) : []
      const qH = (xs: BriefItem[]) => {
        let h = xs.length ? 18 + 21 : 0
        for (let k = 0; k < xs.length; k += 2) h += Math.max(...xs.slice(k, k + 2).map(H.decision))
        return h
      }
      while (qs.length && 37 + 18 + cards + qH(qs) > BODY_HEIGHT) qs = qs.slice(0, -1)
      return [page(only(s, shown), { companion: companion && qs.length ? only(companion, qs) : null })]
    }
    case 'leadership.holds': {
      const rows = fitItems(all, H.pattern, BODY_HEIGHT - titleH(sub) - 16, max)
      const out = only(s, rows)
      // The right column: the position in one line over the month's ideas.
      // The ideas print whole (their label counts them), so where the two do
      // not fit together the position stays in the stored brief.
      const ideas = [...d.inShort.also.map((a) => a.headline), ...d.findings.map((f) => f.headline)]
      if (out.position && H.position(out.position.text) + 16 + H.ideas(ideas) > BODY_HEIGHT) delete out.position
      return [page(out)]
    }
    default: {
      // A section the canvas draws no page for, where the switch prints it:
      // the canvas's rows (What stops them).
      const rows = fitItems(all, H.stop, BODY_HEIGHT - titleH(sub) - 14 - foot(all, 710), 6)
      return [page(only(s, rows))]
    }
  }
}

/** A group's chips less any that is only another's plural or singular
 *  ("bag" and "bags", "prosthetic" and "prosthetics"; 12 Oct), the first the
 *  writer listed kept. Case aside, two chips are one where one is the other
 *  plus "s" or "es"; nothing else is stemmed ("prosthesis" stays beside
 *  "prosthetic"). The stored brief keeps every word. Pure. */
export function distinctChips(words: readonly string[]): string[] {
  const out: string[] = []
  for (const word of words) {
    const a = word.toLowerCase()
    const repeats = out.some((kept) => {
      const b = kept.toLowerCase()
      return a === `${b}s` || a === `${b}es` || b === `${a}s` || b === `${a}es`
    })
    if (!repeats) out.push(word)
  }
  return out
}

/** Chip rows a group of words takes in a column `w` wide (15px, 500,
 *  13px padding a side, 8px apart). Pure. */
export function chipRows(words: readonly string[], w: number): number {
  let rows = words.length ? 1 : 0
  let x = 0
  for (const word of words) {
    const cw = 28 + word.length * 15 * 0.5
    if (x > 0 && x + cw > w) { rows += 1; x = 0 }
    x += cw + 8
  }
  return rows
}

// ---- A finding's page ----------------------------------------------------------------------------------

/** The left column's and the right column's widths on a finding page. */
const FINDING_LEFT = 658
const FINDING_RIGHT = 454

/** The height of "What each brand is heard for" under a finding. Pure. */
export const heardForH = (f: Pick<BriefFinding, 'heardFor'>): number => {
  const chips = f.heardFor ?? []
  if (chips.length === 0) return 0
  const w = (W - 12 * (chips.length - 1)) / chips.length - 32
  return 16 + 4 + 14 + 8 + 24 + 15 + 3 + Math.max(...chips.map((c) => heightOf(c.phrase, w, 16, 1.3)))
}

/**
 * How a finding fills its page (the canvas: what was heard, the practice
 * lines and where it was heard down the left; what it means and the voices
 * down the right; Leadership's brand chips under both). The type steps down
 * where the words are long, and a voice or a practice line that fits nowhere
 * does not print, rather than run off the sheet or onto a second page. Pure.
 */
export function findingPlan(f: BriefFinding): FindingPlan {
  const quotes = (f.quotes as (BriefQuote & { english?: string | null })[]).filter((q) => q && quoteWords(q))
  const body = BODY_HEIGHT - heardForH(f)
  const headline = f.headline.length > 70 ? 28 : 31
  const headH = heightOf(f.headline, FINDING_LEFT, headline, 1.2, 'bold') + 14
  const heard = (heardIn(f) ? 30 : 0) + (f.subjectLine ? 3 + heightOf(f.subjectLine, FINDING_LEFT, 13, 1.25) : 0)
  const practiceH = (size: number, n: number) => (n ? 26 + f.practice.slice(0, n).reduce((m, t) => m + heightOf(t, FINDING_LEFT - 16, size, 1.5) + 6, 0) : 0)
  const sawH = (size: number) => f.saw.reduce((n, p) => n + heightOf(p, FINDING_LEFT, size, 1.58) + 14, 0)
  let saw = 16
  let practice = f.practice.length
  for (const size of [16, 15.5, 15, 14.5, 14]) {
    saw = size
    if (headH + sawH(size) + practiceH(Math.min(15, size), practice) + heard <= body) break
  }
  while (practice > 0 && headH + sawH(saw) + practiceH(Math.min(15, saw), practice) + heard > body) practice -= 1
  let means = 17
  const meansH = (size: number) => 48 + 20 + heightOf(f.means, FINDING_RIGHT - 48, size, 1.5)
  for (const size of [17, 16, 15]) {
    means = size
    if (meansH(size) + 14 + (quotes[0] ? quoteH(quotes[0], FINDING_RIGHT, 18, [20, 24]) : 0) <= body) break
  }
  let right = meansH(means)
  let left = headH + sawH(saw) + practiceH(Math.min(15, saw), practice) + heard
  const places: FindingPlan['quotes'] = quotes.map((q, k) => {
    const inRight = quoteH(q, FINDING_RIGHT, k === 0 ? 18 : 16, k === 0 ? [20, 24] : [16, 20]) + 14
    if (right + inRight <= body) { right += inRight; return 'right' }
    const inLeft = quoteH(q, FINDING_LEFT, 15, [14, 18]) + 14
    if (k > 0 && left + inLeft <= body) { left += inLeft; return 'left' }
    return 'none'
  })
  return { headline, saw, means, practice, quotes: places }
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

/** The name the contents give a section's page: the canvas's short names. */
export const contentsName = (s: BriefSection, continued: boolean): string => {
  const name = CONTENTS[s.key] ?? s.title
  return continued ? continuedTitle(name) : name
}

// ---- What a page needs to print ----------------------------------------------------------------------

/** A section's page as planned: the section cut to what fits, and the
 *  companion that shares the sheet. */
export type PlannedPage = Pick<Extract<PageBody, { kind: 'section' }>, 'section' | 'companion'>

/** One main piece the canvas draws on a page: its name (the operator's, for
 *  why a page was left out) and whether the planned page has it. */
interface Piece { name: string; has: (p: PlannedPage, d: Pick<StoredBriefData, 'role' | 'findings' | 'inShort'>) => boolean }

/** What a section's page needs to print: every main piece the canvas draws
 *  on it, and `min` of the items `count` counts. */
export interface PageNeed {
  /** What its items are, for why a page was left out ("buyers"). */
  items: string
  min: number
  count: (p: PlannedPage) => number
  pieces: readonly Piece[]
}

/** The fewest items a section's page prints with (Heinrich, 12 Oct). */
export const PAGE_MIN_ITEMS = 2

const inColumn = (s: BriefSection, col: 0 | 1): number => s.groups.filter((g) => pairColumn(g.label) === col).reduce((n, g) => n + g.items.length, 0)
const labelled = (s: BriefSection, word: RegExp): number => s.groups.filter((g) => word.test(g.label ?? '')).reduce((n, g) => n + g.items.length, 0)
const piece = (name: string, has: Piece['has']): Piece => ({ name, has })
const lead = piece('the opening line', (p) => !!p.section.lead?.trim())
const rows = (what: string, pieces: readonly Piece[] = []): PageNeed => ({ items: what, min: PAGE_MIN_ITEMS, count: (p) => items(p.section).length, pieces })

/**
 * THE ONE TABLE OF IT (Heinrich, 12 Oct: thin pages are left out). A page
 * prints only where it has every main piece the canvas draws on it and at
 * least `PAGE_MIN_ITEMS` of its items, counted on what fits the page. Who is
 * buying counts across its page and its continuation, so one long buyer may
 * fill a sheet where the section prints two. A voice (a quote) is never a
 * main piece: its words resolve at render and a page does not come and go
 * with them; nor is a footnote, the muted line under a title, or a line of
 * what did not fit ("Also following"). The companions print as pieces of
 * their partner's page (What they want settled first, Questions for the
 * business). The cover, In short and the findings are exempt. Pure.
 */
export const PAGE_NEEDS: Readonly<Record<SectionKey, PageNeed>> = {
  'sales.buyers': rows('buyers'),
  'sales.deciders': rows('people in the decision'),
  'sales.stops': rows('objections', [piece('What they want settled first', (p) => !!p.companion && items(p.companion).length > 0)]),
  'sales.settle': rows('things to settle'),
  'sales.triggers': rows('moments'),
  'sales.rivals': rows('rivals', [piece('Also in the set', (p) => !!p.section.also?.trim())]),
  'sales.care': rows('words'),
  'marketing.believe': rows('beliefs and doubts', [
    piece('What it believes', (p) => inColumn(p.section, 0) > 0),
    piece('What it doubts', (p) => inColumn(p.section, 1) > 0),
  ]),
  'marketing.words': {
    items: 'groups of words', min: PAGE_MIN_ITEMS, count: (p) => (p.section.chips ?? []).filter((c) => c.words.length > 0).length,
    pieces: [lead, piece('What makes them stop, share and argue', (p) => (p.section.panel?.rows.length ?? 0) > 0)],
  },
  'marketing.say_hear': rows('claims'),
  'marketing.recall': rows('lines'),
  // A table of the company's own row alone is no table.
  'marketing.rivals': rows('cards', [piece('Own posts published, with a rival', (p) => (p.section.posts?.rows ?? []).some((r) => !r.you))]),
  'content.questions': rows('questions'),
  'content.formats': rows('rows', [
    piece('The formats', (p) => labelled(p.section, /format/i) > 0),
    piece('The openings', (p) => labelled(p.section, /opening/i) > 0),
    piece('What the numbers say', (p) => (p.section.lines?.length ?? 0) > 0),
  ]),
  'content.watch': rows('items', [
    lead,
    piece('What earns a response', (p) => inColumn(p.section, 0) > 0),
    piece('What loses them', (p) => inColumn(p.section, 1) > 0),
  ]),
  'content.more': rows('rows'),
  'content.confusion': rows('cards', [lead, piece('Where it starts', (p) => !!p.section.note?.trim())]),
  'content.borrow': rows('voices'),
  'leadership.market': {
    items: 'subjects with a bar', min: PAGE_MIN_ITEMS, count: (p) => items(p.section).filter((i) => i.measure?.pct != null).length,
    pieces: [
      piece('What people do in the comments', (p) => (p.section.kinds?.rows.length ?? 0) > 0),
      piece('The mood', (p) => (p.section.mood?.rows.length ?? 0) > 0),
    ],
  },
  'leadership.shares': rows('brands', [
    piece('The shares of comments and videos', (p) => !!p.section.shares?.comments && !!p.section.shares.videos),
    piece('The notes', (p) => (p.section.lines?.length ?? 0) > 0),
  ]),
  'leadership.weigh': rows('items', [
    lead,
    piece('What they weigh', (p) => labelled(p.section, /weigh/i) > 0),
    piece('What holds them', (p) => labelled(p.section, /holds/i) > 0),
    piece('What moves them', (p) => labelled(p.section, /moves/i) > 0),
  ]),
  'leadership.risks': rows('risks', [piece('Questions for the business', (p) => !!p.companion && items(p.companion).length > 0)]),
  'leadership.decisions': rows('questions'),
  'leadership.holds': rows('patterns', [
    piece('The position in one line', (p) => !!p.section.position?.text.trim()),
    piece('The month\'s ideas', (_p, d) => ideasArgued(d).length > 0),
  ]),
}

/**
 * Whether a section's planned sheets print, and why not where they do not:
 * the first main piece a sheet lacks, or too few items across the sheets.
 * Pure.
 */
export function pageStands(key: SectionKey, sheets: readonly PlannedPage[], d: Pick<StoredBriefData, 'role' | 'findings' | 'inShort'>): { prints: boolean; why: string | null } {
  const need = PAGE_NEEDS[key]
  if (sheets.length === 0) return { prints: false, why: 'nothing fits its page' }
  for (const sheet of sheets) {
    const missing = need.pieces.find((x) => !x.has(sheet, d))
    if (missing) return { prints: false, why: `missing: ${missing.name}` }
  }
  const n = sheets.reduce((k, sheet) => k + need.count(sheet), 0)
  if (n < need.min) return { prints: false, why: `${n} of the ${need.min} ${need.items} a page needs` }
  return { prints: true, why: null }
}

/** A page the canvas draws that the deck leaves out, and why (the
 *  operator's: what it held stays in the stored brief): a section's, or In
 *  short's where its summary is empty. */
export interface LeftOut { key: SectionKey | 'in_short'; title: string; why: string }

/**
 * The deck's pages, in order, numbered: the cover, In short, the findings
 * (Leadership's after where the company stands), then the role's sections,
 * each on the canvas's page; and the pages left out. In short's summary is
 * its page's main piece: where the checks leave none, the page is left out,
 * as any page missing a main piece is (`PAGE_NEEDS`), and its figures and
 * "Also this month" stay in the stored brief. Pure.
 */
export function planDeck(d: StoredBriefData): { pages: DeckPage[]; left: LeftOut[] } {
  const pages: Omit<DeckPage, 'n'>[] = [{ eyebrow: '', toc: null, body: { kind: 'cover' } }]
  const left: LeftOut[] = []
  if (d.inShort.summary.trim()) pages.push({ eyebrow: 'In short', toc: null, body: { kind: 'in_short', summarySize: 22, tocSize: 14 } })
  else left.push({ key: 'in_short', title: 'In short', why: 'missing: the summary' })
  const findings = () => d.findings.forEach((f, index) => {
    const eyebrow = d.findings.length === 1 ? 'The finding' : `Finding ${index + 1} of ${d.findings.length}`
    pages.push({ eyebrow, toc: f.short || f.headline, body: { kind: 'finding', finding: f, index, of: d.findings.length, plan: findingPlan(f) } })
  })
  const planned = d.sections.filter((s) => printsSection(s.key) && !COMPANIONS.has(s.key)).map((s) => {
    const partner = COMPANION[s.key]
    const companion = partner ? d.sections.find((x) => x.key === partner) ?? null : null
    const slices = planSection(s, companion, d)
    const stands = pageStands(s.key, slices, d)
    if (!stands.prints) left.push({ key: s.key, title: s.title, why: stands.why ?? '' })
    return { s, slices: stands.prints ? slices : [] }
  })
  // The findings follow the last of the role's opening sections that prints.
  const before = new Set(FINDINGS_AFTER[d.role])
  const anchor = planned.reduce((at, p, k) => (before.has(p.s.key) && p.slices.length > 0 ? k : at), -1)
  if (anchor < 0) findings()
  planned.forEach(({ s, slices }, k) => {
    for (const slice of slices) {
      const eyebrow = slice.continued ? continuedTitle(eyebrowOf(s.key, d.company)) : eyebrowOf(s.key, d.company)
      pages.push({ eyebrow, toc: contentsName(s, slice.continued), body: { kind: 'section', ...slice } })
    }
    if (k === anchor) findings()
  })
  const numbered = pages.map((p, i) => ({ ...p, n: i + 1 }))
  // In short's type, now the contents are known.
  const sizes = inShortSizes(d.inShort.summary, contentsOf(numbered).map((t) => t.title))
  return { pages: numbered.map((p) => (p.body.kind === 'in_short' ? { ...p, body: { kind: 'in_short' as const, ...sizes } } : p)), left }
}

/** The deck's pages (`planDeck`). Pure. */
export const deckPages = (d: StoredBriefData): DeckPage[] => planDeck(d).pages

/** Each section's items as the deck prints them (with the companion on its
 *  partner's page): what a footnote in another brief may point at, and what
 *  In short may sum up. Pure. */
export function printedSections(d: StoredBriefData): BriefSection[] {
  return deckPages(d).flatMap((p) => (p.body.kind === 'section' ? [p.body.section, ...(p.body.companion ? [p.body.companion] : [])] : []))
}

/** The contents: each finding's and section's page, with its number. Pure. */
export const contentsOf = (pages: readonly DeckPage[]): { n: number; title: string }[] =>
  pages.filter((p) => p.toc).map((p) => ({ n: p.n, title: p.toc as string }))

/** The month's ideas and where each is argued (What holds so far): the other
 *  briefs' in role order, then this brief's own. Pure. */
export function ideasArgued(d: Pick<StoredBriefData, 'role' | 'findings' | 'inShort'>): { brief: BriefRole; headline: string; own: boolean }[] {
  const others = [...d.inShort.also].sort((a, b) => BRIEF_ROLES.indexOf(a.brief) - BRIEF_ROLES.indexOf(b.brief))
  return [...others.map((a) => ({ brief: a.brief, headline: a.headline, own: false })), ...d.findings.map((f) => ({ brief: d.role, headline: f.headline, own: true }))]
}

/** The section's quotes and voices, for a reader that wants them. */
export const sectionQuotes = (s: BriefSection): BriefQuote[] => [
  ...(s.quote ? [s.quote] : []),
  ...(s.voices ?? []),
  ...s.groups.flatMap((g) => g.items.flatMap((i) => (i.quote ? [i.quote] : []))),
]
