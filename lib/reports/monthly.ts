import { fmtInt, fmtPct, fullDate, longMonth, shortDate } from '../format'
import { QUARTER_UNLOCKS_AT } from '../reading/bands'
import { freezeBoundary } from '../reading/monthly'
import type { Verdict } from '../reading/verdicts'

/**
 * The monthly report — the arrangement, the masthead and the subject line
 * (Phase 1 WP18, design item 13, decision O, Heinrich's 14 Sep revision 6).
 *
 * WHAT THIS FILE IS. The monthly report is an ARRANGED REPORT OVER BLOCK KEYS,
 * exactly as the weekly one is: eight sections, each a `Block<MonthlyData>`
 * rendered in `'app' | 'print' | 'email'` from one body of code. This module
 * holds the part that is pure — the key order, the rule printed on the
 * artefact, the masthead stamp and the subject line. The loader is
 * `lib/pages/monthly.ts`; the blocks are `components/blocks/monthly/*`; the
 * documents are `components/email/monthly.tsx`, `components/print/monthly-deck.tsx`
 * and `components/share/monthly-share-shell.tsx`.
 *
 * EIGHT SECTIONS, NOT SIX. `design/final-v3.md` §3 Artefact MR still reads "Six
 * blocks, identical in order and window to Overview"; the mock built after
 * Heinrich's 14 Sep revision session has eight, and the plan takes the mock
 * (research/mock-spec.md §5 revision 6, verified against
 * `mock-sealand/artboards/MonthlyReport.dc.html`). The two added sections are
 * "One voice per subject" and "What to decide before the next reading", and the
 * movers section gains a per-row series that the weekly report has no
 * equivalent of. The instruction that governs all of it is *"must not look like
 * the weekly"*.
 *
 * AND IT IS THE SAME READING AS THE PAGE. Every number below comes off the
 * comment-dated monthly reading through `lib/reading`, by way of the page
 * loaders — Overview's, Voice's, Subjects' — so the artefact cannot say
 * something the page cannot, because it IS the page. What is monthly-only is
 * the arrangement, one quote per subject, and the labelled slot in section 7.
 */

/**
 * The eight sections, by key, in the mock's order.
 *
 * A KEY IS A STORED CONTRACT, exactly as a renderable key and a weekly block
 * key are: it names a section inside a built report, a row in a schedule's
 * stored arrangement, and a tile a runner could be asked to render. Renaming
 * one orphans every artefact that named it.
 */
export const MONTHLY_BLOCK_KEYS = [
  /** 1 · The month — OV0's stamp and OV1's sentence. */
  'monthly.month',
  /** 2 · Your subjects, with the direction word each has earned. */
  'monthly.subjects',
  /** 3 · What grew and faded, with a per-row series (VO2 at ten). */
  'monthly.movers',
  /** 4 · The rivals' month — OV4's standings and what they said themselves. */
  'monthly.rivals',
  /** 5 · Your moves — OV5. */
  'monthly.moves',
  /** 6 · One voice per subject. */
  'monthly.voices',
  /** 7 · What to decide before the next reading — the labelled slot. */
  'monthly.decide',
  /** 8 · How sound is this month — OV6. */
  'monthly.sound',
] as const

export type MonthlyBlockKey = (typeof MONTHLY_BLOCK_KEYS)[number]

/** The mock's width, the same as the weekly report's
 *  (`mock-sealand/spec/artboards.md`: MonthlyReport 640 × ~1600). */
export const MONTHLY_EMAIL_WIDTH = 640

/**
 * The CARD inside that frame (Block D wave 2, E-monthly).
 *
 * TWO NUMBERS, NOT ONE, and the artefact had collapsed them into one. The
 * artboard's outer element is 640 wide with 20px of canvas padding all round,
 * so the white card it holds is 600 — which is also what the design system
 * states in so many words (`spec/design-system.md` §4: "600px card on a
 * #F6F7F8 canvas"). The built email set `maxWidth: 640` on the CARD and padded
 * it 24/12, so every line of copy ran about 40px longer than the artboard's and
 * the canvas gutter all but disappeared. The frame keeps its name and its value
 * because the artefact's geometry is still 640 overall.
 *
 * AND THE CARD IS THE ONLY WIDTH THAT BINDS (the fix pass, review finding
 * [Minor]). `MONTHLY_EMAIL_WIDTH` was also set as a `max-width` on the
 * centring `<td>`, where max-width is not honoured on a table cell in CSS 2.1
 * and is ignored outright by Outlook's Word renderer — a declaration with no
 * effect, asserted by a test that read the string back. The card's 600 plus
 * the canvas gutter IS the 640, `MONTHLY_CANVAS_GUTTER` says how, and the test
 * asserts that arithmetic instead of a dead style.
 */
export const MONTHLY_CARD_WIDTH = 600

/** The artboard's canvas padding, each side: 600 + 20 + 20 = 640. */
export const MONTHLY_CANVAS_GUTTER = 20

/**
 * How many movers each side of section 3 prints.
 *
 * TEN, against Overview's three and the weekly report's three — the WP's own
 * "VO2 at ten", and `MOVERS_EXPANDED` on Voice. It is the single loudest reason
 * the monthly artefact does not look like the weekly one: a reader who has had
 * the three-line version four times gets the whole list once a month.
 */
export const MONTHLY_MOVERS = 10

/**
 * The rule printed on the artefact, under the masthead.
 *
 * NOT HELD IN A COMMENT. The weekly report prints its own rule twice over
 * because every number on it is a month-to-date figure that a reader could
 * otherwise take for a weekly one. The monthly report's rule is the opposite
 * claim and needs saying just as much: these numbers are a whole calendar
 * month, dated by when people wrote rather than by when we looked, and a month
 * that is still filling will still move.
 */
export const MONTHLY_RULE =
  'Every number below is one calendar month, counted by the day each comment was written, ' +
  'not by the day we read it. A month keeps filling for thirty days after it ends.'

/** The same claim once a month has stopped moving: nothing below will change
 *  again, which is a different and stronger thing to be able to say. */
export const MONTHLY_RULE_FROZEN =
  'Every number below is one calendar month, counted by the day each comment was written, ' +
  'not by the day we read it. This month has closed; none of it will move again.'

export const monthlyRuleFor = (status: MonthlyStatus): string =>
  status === 'frozen' ? MONTHLY_RULE_FROZEN : MONTHLY_RULE

/** And the artefact's own words for a workspace that has dated nothing. OV5's
 *  say "Press Track this on a subject or a theme", which is a control on a page
 *  the reader of an email is not looking at. */
export const MONTHLY_MOVES_EMPTY =
  'No move has been dated yet, so there is nothing here to score.'

/**
 * The reading's own caveats, said once, on the artefact.
 *
 * THE PAGE PRINTS THESE AND THE ARTEFACT DID NOT. `MonthlyData.notes` was
 * loaded, frozen into the snapshot and rendered by nothing — while MR3 drew an
 * Apr → Sep trail and a sparkline per row across exactly the months the caveat
 * is about. Both live tenants carry `clustering_changed` today ("We did not
 * record how themes were grouped for Sep 2026, so it is not strictly comparable
 * with the months around it") and that sentence appeared zero times in either
 * rendered email. Decision L is that a reading says what it cannot support, and
 * an artefact a client reads unaccompanied is the surface where that matters
 * most — there is nobody beside them to add it.
 *
 * ONE SENTENCE FOR A RUN OF MONTHS, never one per bar: the merge is
 * `mergeNotes` in the reading layer, and this only joins what it returns.
 * Null where there is nothing to say, so a surface prints nothing rather than
 * an empty line.
 */
export function readingCaveat(notes: readonly { text: string }[]): string | null {
  const text = notes.map((n) => n.text.trim()).filter(Boolean).join(' ')
  return text.length > 0 ? text : null
}

/** A month either keeps moving or it does not (`lib/reading/types.ts`
 *  MonthStatus, re-stated here so a pure composer needs nothing else). */
export type MonthlyStatus = 'filling' | 'frozen'

// ---- the masthead -------------------------------------------------------------

/**
 * "September · reading as at 16 Sep 2026 · still filling until 31 Oct 2026".
 *
 * THREE FACTS, AND THE THIRD IS THE ONE NOBODY HAS. A reader can infer the
 * month from the heading and the reading date from the footer; what they cannot
 * infer, and what decides whether any of these numbers is worth acting on, is
 * whether the month is done. Össur's September freezes on 31 October, so an
 * artefact sent on 1 October is a reading of a month with thirty more days of
 * comments to come — and the confirming line in November's report is what
 * closes that loop.
 *
 * `freezeBoundary` is the product's one definition of that date
 * (lib/reading/monthly.ts): thirty days after the month ends, and the instant
 * the `month_reading_frozen_guard` trigger starts refusing writes. It is read
 * rather than re-derived, and printed as OV6 already prints it ("This month
 * stops moving on 31 Oct 2026"), so the artefact and the page name one day.
 * "Until" is exclusive here and on the page: the month fills up to that
 * instant and is frozen at it.
 */
export function monthlyPeriod(month: string, status: MonthlyStatus, readingAt: string): string {
  const parts = [longMonth(month), `reading as at ${fullDate(readingAt)}`]
  parts.push(status === 'frozen' ? 'closed' : `still filling until ${fullDate(freezesOn(month))}`)
  return parts.join(' · ')
}

/** The day this month stops moving. One definition, read from the reading
 *  layer — a hand-rolled thirty days here would drift from the trigger the day
 *  `FREEZE_AFTER_DAYS` moved (the same note OV6 carries). */
export function freezesOn(month: string): string {
  return freezeBoundary(month)
}

/**
 * The masthead's eyebrow — "Verbatim · September · reading as at 18 Sep 2026 ·
 * still filling until 31 Oct 2026" (Block D wave 2, E-monthly, `monthly.eyebrow`).
 *
 * THE PRODUCT'S NAME AND THE READING, which is what the artboard puts in the
 * eyebrow slot and what the built email put nowhere. The email's eyebrow read
 * "Sealand · consumer intelligence" — the TENANT and a category noun — and the
 * three facts of the reading were printed as a mono line below the headline, so
 * the two had swapped jobs. The artboard puts the tenant on the context row,
 * right-aligned beside the dates, where a reader looks for "whose is this".
 *
 * IT IS THE STAMP WITH THE PRODUCT IN FRONT, and deliberately not a second
 * composer: the mock's eyebrow stops at "still filling" and the stamp says
 * which day it stops filling ON, which is the fact nobody else on the artefact
 * carries (the brief: "keep the freeze date"). One composer means the email,
 * the deck and the share page cannot word one reading three ways.
 *
 * AND IT TAKES THE STAMP RATHER THAN RE-DERIVING IT (the fix pass, review
 * finding [Important]). `MonthlySnapshotData.period` is `monthlyPeriod` FROZEN
 * AT BUILD (`monthly-build.ts`), and it is what the print deck, the share
 * shell and the snapshot's own title print. Recomposing it at render read the
 * same today and meant that a re-render of an archived snapshot would take
 * today's `FREEZE_AFTER_DAYS` while the deck beside it kept the words it was
 * built with — three surfaces wording one reading two ways, which is the one
 * thing this composer exists to prevent.
 */
export const MONTHLY_PRODUCT = 'Verbatim'

export function monthlyEyebrow(period: string): string {
  return `${MONTHLY_PRODUCT} · ${period}`
}

/** What the masthead's context row needs: the month's shape and the updates
 *  that were delivered into it. `BarBlock`'s own fields, named here so this
 *  composer stays pure and this module keeps importing no loader. */
export interface MonthlyContextInput {
  month: string
  status: MonthlyStatus
  /** Days of the month elapsed at the reading, or null on a complete month. */
  daysIn: number | null
  updates: number
  /** Already formatted, as `BarBlock.updateDates` holds them ("6 Sep"). */
  updateDates: readonly string[]
}

/**
 * "1–18 Sep 2026 · 3 updates · 6 Sep, 13 Sep" — the artboard's context row
 * (`monthly.headline`).
 *
 * THE UPDATE DATES ARE LOADED AND WERE PRINTED NOWHERE. `BarBlock.updateDates`
 * has been on `OverviewData` since WP11 and no surface in the product draws it;
 * the artefact printed the COUNT alone ("3 updates"), which tells a reader how
 * often we looked and not when. On an artefact read once a month by somebody
 * who was not watching, when we looked is the difference between "the month is
 * thin" and "we stopped gathering on the 13th".
 *
 * AND THE RANGE IS THE MONTH'S, NEVER THE RUN'S. A period is dated by the
 * comment (AGENTS.md), so the left half is day 1 of the month to the day the
 * reading reached — `daysIn`, the same field OV0's filling line counts — and on
 * a closed month it is the whole month. It is NOT the run window, which is the
 * weekly artefact's clock and would date a calendar month by when we gathered.
 */
export function monthlyContext(input: MonthlyContextInput): string {
  const parts = [monthRange(input.month, input.status, input.daysIn)]
  parts.push(`${fmtInt(input.updates)} ${input.updates === 1 ? 'update' : 'updates'}`)
  if (input.updateDates.length > 0) parts.push(input.updateDates.join(', '))
  return parts.join(' · ')
}

/** "1–18 Sep 2026", or "1–30 Sep 2026" once the month has run out. */
export function monthRange(month: string, status: MonthlyStatus, daysIn: number | null): string {
  const last = daysInMonth(month)
  const reached = status === 'frozen' || daysIn == null ? last : Math.min(Math.max(daysIn, 1), last)
  // `shortDate` gives "18 Sep"; the year is said once, at the end of the range,
  // because both ends are inside one month by construction.
  //
  // AND THE MONTH KEY IS NORMALISED FIRST (the fix pass, review finding
  // [Minor]). The day was spliced in at `month.slice(0, 8)`, which is correct
  // only for `YYYY-MM-DD`: `BarBlock.month` is that today (`monthStartOf`), so
  // this was not a live defect — but handed a `YYYY-MM` it built
  // "2026-0918T00:00:00.000Z", an Invalid Date, and printed "NaN undefined"
  // into the masthead. `longMonth` three files away guards the same input
  // class on purpose and says why; so does this.
  const key = monthKey(month)
  if (key == null) return month
  const tail = shortDate(`${key.slice(0, 8)}${String(reached).padStart(2, '0')}T00:00:00.000Z`)
  return `1–${tail} ${key.slice(0, 4)}`
}

/** `YYYY-MM-01` from any month key this product holds, or null where the
 *  string is not a date at all. An UNPARSEABLE month gives the caller its own
 *  string back, never "NaN undefined" — `longMonth`'s rule, for the same
 *  reason: the gap a reader cannot see is the one nobody can debug. */
function monthKey(month: string): string | null {
  const d = new Date(month.length === 7 ? `${month}-01` : month)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function daysInMonth(month: string): number {
  const key = monthKey(month)
  const d = new Date(key ?? month)
  if (Number.isNaN(d.getTime())) return 31
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

/**
 * The subject line, from the largest banded change (the WP's own rule).
 *
 * WHAT IT MAY AND MAY NOT SAY. A subject line is read before any of the
 * apparatus that makes a number mean something — before the denominator, before
 * the band, before the rule under the masthead — so:
 *   · it names the OBJECT and the size of the movement, in points, which is
 *     the one quantity that carries its own unit;
 *   · it may carry the direction word, because the movement it names came off a
 *     `Verdict` that earned one, and rule (c) permits a direction word exactly
 *     where a verdict computed it;
 *   · it never carries a bare share. "22%" with no "of 1,388" in sight is the
 *     score this product does not print.
 *
 * NOTHING CLEARED A BAND is not a failure and does not read as one: a month in
 * which nothing moved is the commonest month there is, and the subject says
 * what the artefact is instead of manufacturing a movement to lead with.
 */
export function monthlySubject(company: string, month: string, lead: Verdict | null): string {
  const head = `${company}: ${longMonth(month)}`
  if (!lead || lead.state !== 'moved' || lead.changePts == null) {
    return `${head} · where you stand`
  }
  const size = `${Math.abs(round1(lead.changePts))} ${Math.abs(round1(lead.changePts)) === 1 ? 'point' : 'points'}`
  const word = lead.changePts > 0 ? 'up' : 'down'
  return `${head} · ${lead.objectLabel} ${word} ${size}`
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * The largest banded change on the artefact — what the subject line leads with
 * and what section 1 is about.
 *
 * `moved` ONLY, and the size is the absolute change. A verdict that refused to
 * compare, or that had too few on either side to compare, has no change to be
 * the largest; a `no_clear_change` has one and it did not clear its band,
 * which is precisely the claim the subject line must not make. Ties break on
 * the band — the narrower band is the better-evidenced reading of two equal
 * movements.
 */
export function leadVerdict(verdicts: readonly Verdict[]): Verdict | null {
  const moved = verdicts.filter((v) => v.state === 'moved' && v.changePts != null)
  if (moved.length === 0) return null
  return [...moved].sort((a, b) => {
    const size = Math.abs(b.changePts as number) - Math.abs(a.changePts as number)
    if (size !== 0) return size
    return (a.bandPts ?? 0) - (b.bandPts ?? 0)
  })[0]
}

// ---- the series a mover row prints --------------------------------------------

/** One readable month of a mover's trail: the share, and the videos it is a
 *  share OF. Null where the month carries no reading a comparison may rest on
 *  (`isReadable`, lib/reading/series.ts). */
export interface TrailPoint {
  pct: number
  /** The audience's videos that month — the denominator, printed. */
  n: number
}

/**
 * "Jul 5.1% of 388 → Aug 6.8% of 402 → Sep 9.4% of 371" — the mock's own trail
 * under every mover row.
 *
 * WHY IT IS WORDS AND NOT ONLY A PICTURE. The mock draws a sparkline AND this
 * line on every row, and it is right to: an email has no stylesheet, half of
 * them block images, and `Sparkline` is an SVG whose colours are CSS variables.
 * So the trail is the reading and the sparkline is the ornament — app and print
 * get both, email gets the words, and no mode is missing a number the others
 * have.
 *
 * AND EVERY POINT CARRIES ITS DENOMINATOR. The trail is up to six LEVELS, ten
 * rows a side, on the one artefact a client reads unaccompanied, and it printed
 * six bare percentages — "Jul 5.1% → Aug 6.8%" — with no "of N" anywhere. It
 * escaped the copy contract only because the span carried no `data-copy`
 * marker at all, which rule (b) is checked on. The GLOSSARY's rule is the
 * block's own rule eight lines up: a level never prints without the count it
 * rests on.
 *
 * A MONTH WITH NO READING IS NAMED AND LEFT BLANK, never closed up and never
 * printed as a zero: "Jul — → Aug 6.8% of 402" says that July held nothing
 * readable, where "Aug 6.8% → Sep 9.4%" would silently re-date the whole
 * series. A trail with NO readable month at all is empty rather than a row of
 * dashes, so a row with nothing to say prints no line.
 *
 * AND THE POINTS ARE AVAILABLE ONE BY ONE (`trailPoints`, the fix pass, review
 * finding [High]/[Minor]). Rendered as one string in a 254px column the line
 * wrapped to four, and one of the wraps fell between "9.4% of" and "1,388" —
 * a share parted from what it is a share of, which is the rule the "of N" on
 * every point exists to keep, broken by other means. A renderer that holds the
 * points can set each one unbreakable and let the line break BETWEEN months.
 * `seriesTrail` is that array joined, so the two can never say different
 * things.
 */
export function seriesTrail(months: readonly string[], values: readonly (TrailPoint | null)[]): string {
  return trailPoints(months, values).join(TRAIL_SEPARATOR)
}

/** What a trail is made of, before it is a sentence: "Aug 6.8% of 402" per
 *  readable month, "Jul —" for a month under the floor, and nothing at all
 *  where no month was readable. */
export function trailPoints(months: readonly string[], values: readonly (TrailPoint | null)[]): string[] {
  const n = Math.min(months.length, values.length)
  if (n === 0) return []
  const parts: string[] = []
  let readable = 0
  for (let i = 0; i < n; i += 1) {
    const v = values[i]
    if (v) readable += 1
    parts.push(`${shortMonth(months[i])} ${v == null ? '—' : `${fmtPct(v.pct)} of ${fmtInt(v.n)}`}`)
  }
  return readable === 0 ? [] : parts
}

/** The one arrow between two points, so a renderer that splits the line and a
 *  caller that reads it whole cannot disagree about where a point ends. */
export const TRAIL_SEPARATOR = ' → '

/** "Jul" from "2026-07". `monthName` in lib/format.ts is the same three-letter
 *  form with the year on it; a trail of six months does not repeat the year six
 *  times. */
export function shortMonth(month: string): string {
  const long = longMonth(month)
  return long.slice(0, 3)
}

// ---- the sent figures a live surface prints beside its own ---------------------

/**
 * "the report of 1 Oct read 19% · 264 of 1,388".
 *
 * THE LINE THE WHOLE `sent_figures` TABLE EXISTS FOR (design item 13). A month
 * is still filling for thirty days after it ends, so an artefact sent on the
 * 1st and the same figure read on the 20th are DIFFERENT NUMBERS about the same
 * month, both correct. Today the product silently shows the second and the
 * reader remembers the first.
 *
 * IT IS PRINTED ONLY WHERE THE MONTH ACTUALLY MOVED, and `movedSince` is the
 * gate: a sent figure identical to the live one is noise, and a figure sent
 * about a month that was already frozen cannot have moved at all. The
 * threshold is a tenth of a point because that is the precision the product
 * prints at — two numbers that render as the same string are the same number to
 * a reader.
 */
export const MOVED_SINCE_PTS = 0.1

export interface SentReading {
  /** When the artefact that printed it was read. */
  readingAt: string
  value: number
  unit: 'pct' | 'videos' | 'comments' | 'pts'
  k: number | null
  n: number | null
  /** Whether the month was still filling when it went out. */
  monthStatus: MonthlyStatus
}

export function movedSince(sent: SentReading, live: number): boolean {
  // A FROZEN MONTH CANNOT HAVE MOVED. If it was frozen when we sent it, the
  // live figure is the same reading and any difference is a bug somewhere else
  // — which is worth finding, and is not worth telling a client about in the
  // masthead of their report.
  if (sent.monthStatus === 'frozen') return false
  // COMPARED IN TENTHS, NOT IN FLOATS. `Math.abs(0.3 - 0.2) >= 0.1` is false —
  // the subtraction is 0.09999999999999998 — and so is 1.3 − 1.2, and 158 of
  // the first 300 adjacent-tenth pairs. Half the smallest visible moves
  // therefore printed no "the report of {date} read X", and confirmingLine took
  // its "which is what the report read" arm for a month that had moved a tenth
  // the reader could see. The unit the product prints in is a tenth of a point,
  // so that is the integer to compare.
  return Math.abs(tenths(live) - tenths(sent.value)) >= tenths(MOVED_SINCE_PTS)
}

/** A value in tenths of a point — the precision this product prints at. */
const tenths = (n: number): number => Math.round(n * 10)

/**
 * The line itself. Null where the figure has not moved, so a caller writes no
 * `?? null` and a surface prints nothing rather than an empty span.
 *
 * THE RECORDED VALUE, NOT A RECOMPUTATION OF IT. The record keeps the share AND
 * both sides, and the two are written together — but "the report of {date} read
 * X" is a quotation, and re-deriving X from k and n would print a number the
 * artefact never showed the day a rounding rule changes. So the value is printed
 * as it was stored and the counts are printed beside it as the evidence they
 * are, which is also what rule (b) asks of any level.
 */
export function sentReadingLine(sent: SentReading, live: number): string | null {
  if (!movedSince(sent, live)) return null
  const value = sent.unit === 'pct'
    ? sent.k != null && sent.n != null && sent.n > 0
      ? `${fmtPct(sent.value)} · ${fmtInt(sent.k)} of ${fmtInt(sent.n)}`
      : fmtPct(sent.value)
    : `${fmtInt(sent.value)} ${sent.unit}`
  return `the report of ${shortDate(sent.readingAt)} read ${value}`
}

/**
 * Next month's confirming line: what last month's artefact said, and what that
 * month finally closed at.
 *
 * THE OTHER HALF OF THE SAME LOOP. "the report of {date} read X" is said while
 * a month is still moving; this is said once it has stopped, in the next
 * month's report, about the month before it. A reader who acted on a
 * still-filling number is owed the final one — and is owed it whether it
 * confirmed their reading or not, which is why the sentence has two arms and
 * neither of them is an apology.
 *
 * NULL WHERE THERE IS NOTHING TO CONFIRM: no artefact was sent about that
 * month, or the one that was went out after the month had already closed, in
 * which case it printed the final figure and there is nothing to add.
 *
 * AND NULL WHERE THE MONTH HAS NOT CLOSED. The sentence says "has closed at",
 * and the only guard it had was the SENT artefact's status — which says what
 * was true when the mail went out and nothing about today. Nothing ties this
 * artefact to the 1st: `sendsMonthly` is independent of cadence, an
 * `every_update` schedule pointed at the monthly report sends it on a Sunday,
 * and a preview or an in-app build can happen on any day of the month. On 10
 * September that told a client "August has closed at 7.1%" while August was
 * still filling and 7.1% was not final — which is the claim the frozen-month
 * rules exist to make impossible. The reading's own state is what decides, so
 * the caller passes it rather than a bare number.
 */
export interface ClosedReading {
  value: number
  /** Whether the month the value was read off has actually frozen
   *  (`MonthPoint.state === 'frozen'`, lib/reading/series.ts). */
  frozen: boolean
}

export function confirmingLine(month: string, sent: SentReading | null, closed: ClosedReading | null): string | null {
  if (!sent || closed == null) return null
  if (!closed.frozen) return null
  if (sent.monthStatus === 'frozen') return null
  const name = longMonth(month)
  const wasLevel = sent.unit === 'pct' ? fmtPct(sent.value) : fmtInt(sent.value)
  const nowLevel = sent.unit === 'pct' ? fmtPct(closed.value) : fmtInt(closed.value)
  return movedSince(sent, closed.value)
    ? `${name} has closed at ${nowLevel}. The report of ${shortDate(sent.readingAt)} read ${wasLevel}.`
    : `${name} has closed at ${nowLevel}, which is what the report of ${shortDate(sent.readingAt)} read.`
}

// ---- §8 · how sound is this month, in three sentences -------------------------

/**
 * The figures section 8 prints, and nothing else (copy de-clutter 2026-09-24,
 * ruling B: "the monthly email §8 becomes exactly the three sentences the mock
 * asked for", `MonthlyReport.dc.html`).
 *
 * Every field is nullable where the record can hold "not recorded", and a null
 * clause is DROPPED rather than printed as a zero. The per-language split the
 * artboard prints ("Afrikaans 14%, German 6%") has no field and is not printed;
 * the tracking change's own description ("Poler added 3 Sep") is not in the
 * record inputs either, so the count stands alone.
 */
export interface MonthlySoundFigures {
  updates: number
  comments: number | null
  videos: number | null
  trailingMedian: number | null
  /** Share not in English, of videos whose language is known, 0–100. Recorded,
   *  never printed (2026-09-24). */
  notEnglishPct: number | null
  /** Read depth, all time, non-Reddit, 0–100. */
  speechPct: number | null
  onScreenPct: number | null
  trackingChanges: number | null
  refused: number | null
  /** Monthly readings of the gathered era (`BarBlock.readings`). */
  readings: number | null
}

/** The record's inputs, reduced to §8's figures. Pure; the record type is
 *  structural here so this module keeps importing no loader. */
export function monthlySoundFigures(
  input: {
    delivery: { delivered: number }
    coverage: readonly { videos: number; comments: number }[] | null
    readDepth: { analysed: number; speech: number; onScreenText: number }
    language: { english: number; notEnglish: number }
    changes: { inWindow: number }
    comparisonsRefused: number | null
  },
  bar: { expected: number | null; readings: number },
): MonthlySoundFigures {
  const pct = (k: number, n: number): number | null => (n > 0 ? (k / n) * 100 : null)
  const cov = input.coverage && input.coverage.length > 0 ? input.coverage : null
  const known = input.language.english + input.language.notEnglish
  return {
    updates: input.delivery.delivered,
    comments: cov ? cov.reduce((n, c) => n + c.comments, 0) : null,
    videos: cov ? cov.reduce((n, c) => n + c.videos, 0) : null,
    trailingMedian: bar.expected,
    notEnglishPct: pct(input.language.notEnglish, known),
    speechPct: pct(input.readDepth.speech, input.readDepth.analysed),
    onScreenPct: pct(input.readDepth.onScreenText, input.readDepth.analysed),
    trackingChanges: input.changes.inWindow,
    refused: input.comparisonsRefused,
    readings: bar.readings,
  }
}

const count = (n: number, word: string): string => `${fmtInt(n)} ${word}${n === 1 ? '' : 's'}`

function ordinal(n: number): string {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${fmtInt(n)}${suffix}`
}

/**
 * The three sentences, in the mock's order: what was read · how deeply and in
 * what language · what changed, what was refused, and where the ramp stands.
 * A sentence with no clause left is dropped, so the section prints at most
 * three and never an empty line.
 */
export function monthlySoundLines(f: MonthlySoundFigures): string[] {
  const one: string[] = [count(f.updates, 'update')]
  if (f.comments != null) one.push(`${fmtInt(f.comments)} comments read`)
  if (f.videos != null) {
    one.push(
      f.trailingMedian != null
        ? `${fmtInt(f.videos)} videos analysed, against a trailing median of ${fmtInt(f.trailingMedian)}`
        : `${fmtInt(f.videos)} videos analysed`,
    )
  }

  const two: string[] = []
  // `notEnglishPct` stays on the figures (a frozen snapshot carries it) and is
  // never printed: no surface states a language share (2026-09-24).
  if (f.speechPct != null) two.push(`speech read on ${fmtPct(f.speechPct, 0)} of videos`)
  if (f.onScreenPct != null) two.push(`on-screen text on ${fmtPct(f.onScreenPct, 0)}`)

  const three: string[] = []
  if (f.trackingChanges != null && f.trackingChanges > 0) three.push(count(f.trackingChanges, 'tracking change'))
  if (f.refused != null && f.refused > 0) three.push(`${count(f.refused, 'comparison')} refused`)
  if (f.readings != null && f.readings > 0) {
    const reading = `your ${ordinal(f.readings)} monthly reading`
    three.push(f.readings < QUARTER_UNLOCKS_AT ? `${reading}, and the quarter view needs ${QUARTER_UNLOCKS_AT}` : reading)
  }

  return [one, two, three].filter((s) => s.length > 0).map((s) => `${s.join(' · ')}.`)
}
