import { fmtInt, fmtPct, fullDate, longMonth, shortDate } from '../format'
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
  'Every number below is one calendar month, counted by the day each comment was written — ' +
  'not by the day we read it. A month keeps filling for thirty days after it ends.'

/** The same claim once a month has stopped moving: nothing below will change
 *  again, which is a different and stronger thing to be able to say. */
export const MONTHLY_RULE_FROZEN =
  'Every number below is one calendar month, counted by the day each comment was written — ' +
  'not by the day we read it. This month has closed; none of it will move again.'

export const monthlyRuleFor = (status: MonthlyStatus): string =>
  status === 'frozen' ? MONTHLY_RULE_FROZEN : MONTHLY_RULE

/**
 * What section 5 says about scoring, ON THE ARTEFACT.
 *
 * OV5's own sentence names a page a reader can click. That was argued for an
 * in-app surface,
 * where Market is a page the reader can click and the sentence answers "why is
 * this column empty here and not there?". Mailed to a client's staff it is
 * build status about an unshipped feature and a page name they have no account
 * for — pipeline jargon by the calibration rule, in the one artefact that goes
 * to people outside the workspace. WP17's weekly report never carried OV5, so
 * the monthly one is the first artefact that would have sent it.
 *
 * WHAT A CLIENT NEEDS FROM IT IS WHY THERE IS NO SCORE COLUMN, and that answer
 * is already on every row: a move is dated, and its first score lands with a
 * named reading. So the artefact says that, and says nothing about what is or
 * is not built.
 */
// AND IT CHANGED WITH THE PAGE (Block D · D2). "Nothing here is scored yet"
// was true when nothing scored a move; every move now carries the one banded
// comparison it earns, so the sentence would be a copy claim the code
// contradicts. What a client still needs from it is the same thing — WHY a
// move that was dated this month has no comparison — and that answer has not
// changed: a move is read from the month after it was dated. Said without
// build status and without a page name, which is this artefact's own rule.
export const MONTHLY_MOVES_UNLOCK =
  'A move is read from the month after it was dated, and beside the audiences it did not touch. Each one carries the reading its first comparison lands with.'

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
    return `${head} — where you stand`
  }
  const size = `${Math.abs(round1(lead.changePts))} ${Math.abs(round1(lead.changePts)) === 1 ? 'point' : 'points'}`
  const word = lead.changePts > 0 ? 'up' : 'down'
  return `${head} — ${lead.objectLabel} ${word} ${size}`
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * The largest banded change on the artefact — what the subject line leads with
 * and what section 1 is about.
 *
 * `moved` ONLY, and the size is the absolute change. A verdict that refused to
 * compare, or that had too little data, has no change to be the largest; a
 * `no_clear_change` has one and it did not clear its band, which is precisely
 * the claim the subject line must not make. Ties break on the band — the
 * narrower band is the better-evidenced reading of two equal movements.
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
 */
export function seriesTrail(months: readonly string[], values: readonly (TrailPoint | null)[]): string {
  const n = Math.min(months.length, values.length)
  if (n === 0) return ''
  const parts: string[] = []
  let readable = 0
  for (let i = 0; i < n; i += 1) {
    const v = values[i]
    if (v) readable += 1
    parts.push(`${shortMonth(months[i])} ${v == null ? '—' : `${fmtPct(v.pct)} of ${fmtInt(v.n)}`}`)
  }
  return readable === 0 ? '' : parts.join(' → ')
}

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
    ? `${name} has closed at ${nowLevel}. The report of ${shortDate(sent.readingAt)} read ${wasLevel}; the rest of the month has since been counted.`
    : `${name} has closed at ${nowLevel}, which is what the report of ${shortDate(sent.readingAt)} read.`
}
