import { longMonth, monthName } from '../format'
import { pairChipWords } from '../calibration'
import { nextMonth } from '../reading/month-key'
import { quarterChange, QUARTER_UNLOCKS_AT, type QuarterChangeInput } from '../reading/bands'
import { pairOnVerdict, type ComparabilityMode, type PairComparability } from '../reading/comparability'
import { pooledDenominators } from '../reading/market'
import { bandVerdict, type Verdict } from '../reading/verdicts'
import { SHARE_BAND } from '../report-bands'

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
  return `Quarter against quarter needs six months: you have ${readings}.`
}

/** A stamp or meta line with the reading counter taken off its end. Snapshots
 *  frozen before 2026-09-24 carry the counter on the cover stamp and on Our
 *  read's meta; the cover's stat card is now its one home, so render drops it
 *  from the stored strings and old reviews print the new copy. */
export function withoutReadingCounter(line: string): string {
  return line.replace(/ · (your \d+(st|nd|rd|th) monthly reading|no monthly reading yet)(, the quarter view needs \d+)?$/, '')
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

// ---- the gate counts floor-clearing months (H19, WP3.11) ---------------------

/**
 * The months a quarter comparison can stand on: those whose MARKET (the
 * category pooled with the videos filed under a tracked brand, decision E)
 * clears the band's floor, `SHARE_BAND.minN` videos, up to `to` (inclusive).
 * Ascending, `YYYY-MM-01`.
 *
 * H19, SETTLED. The quarter's gate counted Overview's `bar.readings` (every
 * month of the gathered era with a denominator row in any audience, at any
 * volume) while Ask counted months over the floor, so the card, the artefact
 * and Ask could put three numbers beside one gate sentence. A month under the
 * floor is a month nothing can be compared on, so it is not a reading the
 * gate should count: July's 36 videos are not one of Sealand's readings,
 * August's 377 and September's 655 are. Ask's own count (`readableMonths`,
 * lib/agent/basis.ts) is this function, so the three agree by construction.
 */
export function floorClearingMonths(
  rows: readonly { month: string; audience: string; videos: number | null; comments?: number | null }[],
  rivalAudiences: readonly string[],
  to?: string | null,
): string[] {
  const pooled = pooledDenominators(
    rows.map((r) => ({ month: r.month, audience: r.audience, videos: r.videos ?? Number.NaN, comments: r.comments ?? 0 })),
    rivalAudiences,
  )
  const last = to ? `${to.slice(0, 7)}-01` : null
  return [...pooled.values()]
    .filter((c) => c.videos != null && c.videos >= (SHARE_BAND.minN ?? 100) && (last == null || c.month <= last))
    .map((c) => c.month)
}

// ---- quarter against quarter, under the month-pair rule (WP3.11) -------------

/**
 * Were two quarters read the same way?
 *
 * A QUARTER PAIR IS READ THE SAME WAY ONLY WHERE EVERY STEP ACROSS ITS SIX
 * MONTHS IS (decision D). Each consecutive pair of months, from the earlier
 * quarter's first to the later quarter's last, goes through the month-pair
 * judge; one refused step refuses the quarter pair, one flagged step flags it.
 * So Q4 2026 against Q3 2026 is refused (we changed our searches in
 * September, inside Q3), and the first quarter pair read the same way is Q1
 * 2027 against Q4 2026, in April (plan §2.11), if nothing we search changes.
 *
 * `refusedBy` is the step whose refusal the artefact prints: one that names a
 * change of ours first (the latest), else the first refused step.
 */
export interface QuarterPair {
  prior: Quarter
  quarter: Quarter
  mode: ComparabilityMode
  refusedBy: PairComparability | null
}

export function quarterPairOf(
  prior: Quarter,
  quarter: Quarter,
  judge: (prevMonth: string, month: string) => PairComparability,
): QuarterPair {
  const months = [...prior.months, ...quarter.months]
  const steps: PairComparability[] = []
  for (let i = 1; i < months.length; i++) steps.push(judge(months[i - 1], months[i]))
  const refused = steps.filter((p) => p.mode === 'refuse')
  const named = refused.filter((p) => {
    const note = pairOnVerdict(p).note
    return note != null && (note.cause === 'searches' || note.cause === 'ours')
  })
  const mode: ComparabilityMode = refused.length > 0 ? 'refuse' : steps.some((p) => p.mode === 'flag') ? 'flag' : 'comparable'
  return { prior, quarter, mode, refusedBy: named.at(-1) ?? refused[0] ?? null }
}

/**
 * A quarter verdict under the pair rule. A refused quarter pair is refused
 * whatever the gate says, with both sides' counts kept so the levels still
 * print and the refusal's own words on the verdict; otherwise the gate
 * (`quarterChange`, six floor-clearing months) decides as it always has.
 * Never a "moved" across a refused pair.
 */
export function quarterVerdict(input: QuarterChangeInput, pair: QuarterPair | null): Verdict {
  if (pair && pair.mode === 'refuse' && pair.refusedBy) {
    const on = pairOnVerdict(pair.refusedBy)
    const v = bandVerdict({
      objectKind: input.object.kind,
      objectId: input.object.id,
      objectLabel: input.object.label,
      audience: input.audience,
      window: input.window,
      basis: input.basis,
      value: input.value,
      baseline: input.baseline,
      flags: input.flags ?? [],
      floor: input.floor,
      refused: on.refused ?? 'unmeasured',
    })
    return on.note ? { ...v, pair: on.note } : v
  }
  return quarterChange(input)
}

/** "Q4 2026 against Q3 2026 is not read as a change: we changed our searches
 *  in September." The refusal in the pair rule's own words, at quarter grain.
 *  Null where the pair is read the same way. */
export function quarterPairSentence(pair: QuarterPair): string | null {
  if (pair.mode !== 'refuse' || !pair.refusedBy) return null
  const note = pairOnVerdict(pair.refusedBy).note
  if (!note) return null
  return `${quarterLabel(pair.quarter, false)} against ${quarterLabel(pair.prior, false)} is ${pairChipWords(note).replace(/^./, (c) => c.toLowerCase())}.`
}

/** The quarter after this one. */
export function nextQuarter(quarter: Quarter): Quarter {
  return quarter.q === 4 ? quarterFor(quarter.year + 1, 1) : quarterFor(quarter.year, (quarter.q + 1) as 2 | 3 | 4)
}

/** The month the page loaders read for a quarter's review: its last month
 *  once it has closed (a review of Q3 reads September, never the October the
 *  clock is in), else the month in progress. `YYYY-MM`, the `?month=` form. */
export function quarterPageMonth(quarter: Quarter, readingAt: string, tz: string = REVIEW_TZ): string {
  const day = dayIn(readingAt, tz)
  const last = quarter.months[2]
  if (day > quarter.to) return last.slice(0, 7)
  const inProgress = `${day.slice(0, 7)}-01`
  return (inProgress < quarter.months[0] ? quarter.months[0] : inProgress).slice(0, 7)
}

// ---- what the artefact says about itself --------------------------------------

/**
 * The rule that keeps the quarterly review honest, printed ON it.
 *
 * The weekly report prints its own (`WEEKLY_RULE`); the same reason applies
 * with more force here, because a quarterly review is the artefact most likely
 * to be forwarded to somebody who has never seen the product.
 *
 * Not printed since the copy de-clutter (2026-09-24): the cover's stat card is
 * the one place the six-month gate is said, and every figure already prints
 * what it is out of. Kept so tests can assert it stays off the artefact.
 */
export const QUARTERLY_RULE =
  'Every figure on these pages is a share of videos we read, printed with what it is out of. A quarter is compared with the quarter before it only where six monthly readings stand behind both sides.'

/**
 * MK5's claim caveat, said the way an artefact has to say it.
 *
 * The Market page's own `CLAIMS_CAVEAT` carries a second sentence — "A claim's
 * verdict per month, held across two updates before it is printed, is not built
 * yet." — which is build status about an unshipped feature. Mailed to a
 * client's staff and forwarded behind a share link, that is pipeline jargon by
 * the calibration rule, in the artefact most likely to be read by somebody who
 * has never seen the product. WP18 identified exactly this class and solved it
 * for the monthly report with a projection (`artefactMoves`); WP20's moves page
 * forwarded the page's sentence unchanged.
 *
 * The first sentence is the one a client needs and it stands alone.
 */
export const QUARTERLY_CLAIMS_CAVEAT = 'This is how each claim reads in the latest update.'

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
  const head = `${company}: your quarterly review · ${quarterLabel(quarter, false)}`
  return quarterUnlocked(readings) ? head : `${head} (your own side is still forming)`
}
