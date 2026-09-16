import { longMonth, monthName } from '../format'
import { nextMonth } from '../reading/month-key'
import { QUARTER_UNLOCKS_AT } from '../reading/bands'

/**
 * The quarterly review's arrangement (Phase 1 WP20, design item 14).
 *
 * EIGHT PAGES, NAMED ONCE. The artefact is eight pages in a fixed order, and
 * the order is a STORED CONTRACT the same way a report's section keys are: a
 * schedule stores `quarterly.cover … quarterly.unsettled`, the deck walks the
 * stored list, and a key this build no longer knows is dropped at render
 * rather than breaking the artefact. Renaming one orphans every snapshot that
 * named it.
 *
 * WHY THESE ARE NOT `DocPageKind`s, which is what the plan's line asks for.
 * `DocPageKind` is the DOCUMENT WRITER's skeleton — the union a brief's pages
 * are drawn from — and `lib/reports/documents/compose.ts` keys a
 * `Record<DocPageKind, () => DocPage[]>` on it, one builder per kind, written
 * by a model inside caps. Widening that union with eight pages a model never
 * writes would (a) fail to compile until eight stub builders were added to a
 * file this package has no business in, and (b) offer the brief writer eight
 * page kinds it must never produce. The quarterly review is code-composed from
 * the reading layer — "every number from the reading layer" is the WP's own
 * sentence — so what it needs from `DocPageKind` is the SHAPE (a closed union
 * of named pages, stored by name), not the union itself. `QuarterPageKind` is
 * that shape, declared here beside the artefact it belongs to. Reported as a
 * deviation in the status note rather than improvised silently.
 *
 * THE SIX-MONTH GATE IS THE ARTEFACT'S CENTRAL FACT, not a caveat at the
 * bottom of it. `quarterChange` (lib/reading/bands.ts) refuses to compare two
 * quarters until six monthly readings exist, and returns `baseline_forming`
 * until then. A quarterly review built before that is a category read with the
 * tenant's own half held back, and it says so on the cover, on the page that
 * needs it, and on the last page — which is what "you have 3 of 6" means to a
 * reader who paid for a quarterly review.
 */

// ---- the eight pages ----------------------------------------------------------

export const QUARTER_PAGE_KINDS = [
  'cover',
  'read',
  'subjects',
  'category',
  'rivals',
  'moves',
  'method',
  'unsettled',
] as const

export type QuarterPageKind = (typeof QUARTER_PAGE_KINDS)[number]

export type QuarterlyBlockKey = `quarterly.${QuarterPageKind}`

/** The stored order. A schedule holds these strings. */
export const QUARTERLY_BLOCK_KEYS: QuarterlyBlockKey[] = QUARTER_PAGE_KINDS.map(
  (k) => `quarterly.${k}` as QuarterlyBlockKey,
)

export const isQuarterlyBlockKey = (k: string): k is QuarterlyBlockKey =>
  (QUARTERLY_BLOCK_KEYS as readonly string[]).includes(k)

/** What each page is called on paper. The reader's words, not the schema's. */
export const QUARTER_PAGE_TITLE: Record<QuarterPageKind, string> = {
  cover: 'The quarter',
  read: 'Our read',
  subjects: 'Your subjects, quarter on quarter',
  category: 'What the category talked about',
  rivals: 'Who else is in this',
  moves: 'Your moves, and what happened after',
  method: 'Coverage and method',
  unsettled: 'What we could not settle',
}

/** The one question each page answers, printed under its heading. */
export const QUARTER_PAGE_QUESTION: Record<QuarterPageKind, string> = {
  cover: 'What happened this quarter?',
  read: 'What do we make of it?',
  subjects: 'Did your own subjects move?',
  category: 'What did everyone else talk about?',
  // NOT the mock's "…and are they gaining?" — a heading makes its claim
  // before any band has been drawn (copy contract rule (c)), and the
  // Competitive page bar's own question was reworded for exactly this in the
  // Block B fix pass. The page still says who moved, in the badges, where a
  // verdict computed it.
  rivals: 'Who else is in this, and how much of it do they hold?',
  moves: 'What happened after you acted?',
  method: 'How was this quarter read?',
  unsettled: 'What could we not settle?',
}

/**
 * What each page is called INSIDE a sentence — lower case, no verb, no claim.
 *
 * The email's covering note names the pages it is not carrying. It named all
 * six in fixed text, so a stored arrangement of four keys read "the other 1 —
 * your subjects, the category, the rivals, your moves, how the quarter was
 * read and what we could not settle — are in the review itself." The same
 * words, keyed by page, so the sentence is built from the arrangement.
 */
export const QUARTER_PAGE_IN_SENTENCE: Record<QuarterPageKind, string> = {
  cover: 'the quarter',
  read: 'our read',
  subjects: 'your subjects',
  category: 'the category',
  rivals: 'the rivals',
  moves: 'your moves',
  method: 'how the quarter was read',
  unsettled: 'what we could not settle',
}

/** The page a block key names, or null for a key this build does not know. */
export function quarterPageKindOf(key: string): QuarterPageKind | null {
  const kind = key.startsWith('quarterly.') ? key.slice('quarterly.'.length) : ''
  return (QUARTER_PAGE_KINDS as readonly string[]).includes(kind) ? (kind as QuarterPageKind) : null
}

// ---- the quarter --------------------------------------------------------------

export interface Quarter {
  /** Calendar year of the quarter's first month. */
  year: number
  /** 1–4. */
  q: 1 | 2 | 3 | 4
  /** The three month keys, `YYYY-MM-01`, in order. */
  months: string[]
  /** Inclusive first day, `YYYY-MM-DD`. */
  from: string
  /** Inclusive last day, `YYYY-MM-DD`. */
  to: string
}

const QUARTER_MONTHS: Record<1 | 2 | 3 | 4, [number, number, number]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The last day of `YYYY-MM`. Arithmetic, never Intl (lib/format.ts's rule). */
function lastDayOf(year: number, month: number): string {
  const firstOfNext = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)
  const last = new Date(firstOfNext - 86_400_000)
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`
}

export function quarterFor(year: number, q: 1 | 2 | 3 | 4): Quarter {
  const months = QUARTER_MONTHS[q]
  return {
    year,
    q,
    months: months.map((m) => `${year}-${pad(m)}-01`),
    from: `${year}-${pad(months[0])}-01`,
    to: lastDayOf(year, months[2]),
  }
}

/**
 * THE CLOCK A SCHEDULE KEEPS, and therefore the clock this artefact keeps.
 *
 * `scheduleDue` decides "the first update of a new quarter" in SAST, the
 * scheduler's own timezone. A `quarterOf` that read the day in UTC used to sit
 * here beside it: the two disagree for two hours at every quarter boundary,
 * and with `quarterToReview` below the disagreement is not cosmetic — a send
 * claimed at 2026-09-30T22:30Z is Q4 to the schedule and Q3 to UTC, so the
 * artefact would review Q2 while the schedule believed it had sent the Q3
 * review. That function is gone rather than kept for callers who might want
 * the other answer, because this module claims ONE arithmetic and a second one
 * in reach is how the first drift happened.
 */
export const REVIEW_TZ = 'Africa/Johannesburg'

/** The calendar day an instant falls on, on a named wall clock. `en-CA` is
 *  YYYY-MM-DD, which is the shape every date in this module compares in. */
export function dayIn(iso: string, tz: string = REVIEW_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** The quarter an instant falls in, on a named wall clock. */
export function quarterOfIn(iso: string, tz: string = REVIEW_TZ): Quarter {
  const day = dayIn(iso, tz)
  const year = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  return quarterFor(year, (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4)
}

/**
 * The quarter a review is OF, as at the moment it is built.
 *
 * THE QUARTER THAT CLOSED, NEVER THE ONE THAT HAS JUST BEGUN. A quarterly
 * schedule fires on the first update of a NEW calendar quarter
 * (lib/schedules/due.ts), which is the only moment a quarter's numbers are
 * complete — so the artefact that send carries is a review of the quarter
 * behind it. Defaulting to `quarterOf(now)` produced the opposite: a first
 * send on 5 October headed "Q4 2026 (Oct–Dec) against Q3 2026 · October still
 * filling", over four days of comment, while every month-level page on the
 * same sheet still showed September.
 *
 * A caller that genuinely wants the quarter in progress — a preview an
 * operator asked for mid-quarter — names it, through `QuarterlyOptions.quarter`.
 */
export function quarterToReview(iso: string, tz: string = REVIEW_TZ): Quarter {
  return previousQuarter(quarterOfIn(iso, tz))
}

export function previousQuarter(quarter: Quarter): Quarter {
  return quarter.q === 1 ? quarterFor(quarter.year - 1, 4) : quarterFor(quarter.year, (quarter.q - 1) as 1 | 2 | 3)
}

/** The month's own three letters, no year — `monthName` carries a year, and
 *  "(Jul 2026–Sep 2026)" says the year three times in one masthead. */
const monthAbbr = (month: string): string => monthName(month).split(' ')[0]

/** "Q3 2026 (Jul–Sep)" — the mock's own masthead. */
export function quarterLabel(quarter: Quarter, months = true): string {
  const head = `Q${quarter.q} ${quarter.year}`
  if (!months) return head
  return `${head} (${monthAbbr(quarter.months[0])}–${monthAbbr(quarter.months[2])})`
}

/** "Q3 2026 (Jul–Sep) against Q2 2026 (Apr–Jun)". Both years are printed: a
 *  Q1 review compares across a year boundary, and "Q1 2026 against Q4" would
 *  be the only place in the product where a year has to be inferred. */
export function quarterAgainst(quarter: Quarter, prior: Quarter): string {
  return `${quarterLabel(quarter)} against ${quarterLabel(prior)}`
}

/** Which of the quarter's months are over and which is still running, as at a
 *  reading date. A quarter under way is dated by the comment like every other
 *  period in this product: the months are the calendar's, and the reading date
 *  only decides how many of them have anything in them yet.
 *
 *  ON THE SAME CLOCK AS THE QUARTER ITSELF. Sliced off the UTC day, this and
 *  `quarterFilling` below disagreed with `quarterOfIn` for the two hours after
 *  22:00 UTC on a quarter's last day: the send picked the new quarter's
 *  predecessor while the masthead still called the OLD quarter "still filling"
 *  and this still counted its last month as the one in progress. */
export function monthsSoFar(quarter: Quarter, readingAt: string, tz: string = REVIEW_TZ): string[] {
  const now = `${dayIn(readingAt, tz).slice(0, 7)}-01`
  return quarter.months.filter((m) => m <= now)
}

/** Is this quarter still filling — i.e. does the reading date fall inside it,
 *  on the artefact's own clock? */
export function quarterFilling(quarter: Quarter, readingAt: string, tz: string = REVIEW_TZ): boolean {
  const day = dayIn(readingAt, tz)
  return day >= quarter.from && day <= quarter.to
}

// ---- the six-month gate -------------------------------------------------------

export const QUARTER_READINGS_NEEDED = QUARTER_UNLOCKS_AT

/**
 * The sentence the WP names, word for word, with the count filled in.
 *
 * It is a sentence and not a flag because the reader's next question is "how
 * many do I have?", and a page that says only "not enough data" makes them ask
 * support. `readings` is the number of MONTHLY READINGS that could be read at
 * all — not months on the axis, not updates delivered.
 */
export function quarterGateSentence(readings: number): string {
  return `Quarter against quarter needs six months — you have ${readings}.`
}

export const quarterUnlocked = (readings: number): boolean => readings >= QUARTER_READINGS_NEEDED

/** When the first quarter-on-quarter verdict can be drawn, said as a month.
 *  Null once it is unlocked, or when nothing has been read at all. */
export function firstQuarterVerdictMonth(readings: number, latestMonth: string | null): string | null {
  if (quarterUnlocked(readings) || !latestMonth || readings <= 0) return null
  let month = latestMonth
  for (let i = readings; i < QUARTER_READINGS_NEEDED; i++) month = nextMonth(month)
  return month
}

// ---- what the artefact says about itself --------------------------------------

/**
 * The rule that keeps the quarterly review honest, printed ON it.
 *
 * The weekly report prints its own (`WEEKLY_RULE`); the same reason applies
 * with more force here, because a quarterly review is the artefact most likely
 * to be forwarded to somebody who has never seen the product.
 */
export const QUARTERLY_RULE =
  'Every figure on these pages is a share of videos we read, printed with what it is out of. A quarter is compared with the quarter before it only where six monthly readings stand behind both sides.'

export function quarterlyTitle(company: string, quarter: Quarter): string {
  return `${company} · quarterly review · ${quarterLabel(quarter, false)}`
}

/** The masthead's period line. */
export function quarterlyPeriod(quarter: Quarter, prior: Quarter, readingAt: string): string {
  const filling = quarterFilling(quarter, readingAt)
  const latest = latestMonthOf(quarter, readingAt) ?? quarter.months[0]
  return `${quarterAgainst(quarter, prior)}${filling ? ` · ${longMonth(latest)} still filling` : ''}`
}

function latestMonthOf(quarter: Quarter, readingAt: string): string | null {
  const months = monthsSoFar(quarter, readingAt)
  return months.length ? months[months.length - 1] : null
}

/**
 * The subject line of a quarterly send.
 *
 * NO DIRECTION WORD AND NO FIGURE. A subject line is read before the artefact
 * that carries the evidence, and the one thing the reader must know before
 * opening it is whether their own half is readable yet.
 */
export function quarterlySubject(company: string, quarter: Quarter, readings: number): string {
  const head = `${company}: your quarterly review — ${quarterLabel(quarter, false)}`
  return quarterUnlocked(readings) ? head : `${head} (your own side is still forming)`
}
