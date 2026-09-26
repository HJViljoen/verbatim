import { fmtInt, fmtPct, longMonth, shortDate, weekdayDate } from '../format'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { freezeBoundary } from '../reading/monthly'
import type { Verdict } from '../reading/verdicts'

/**
 * The monthly report — the arrangement, the masthead and the subject line.
 *
 * "SEPTEMBER IN YOUR MARKET" (market-first WP2.1, decision J, plan §2.9). The
 * monthly is an ARRANGED REPORT OVER BLOCK KEYS, exactly as the weekly one
 * is: ten sections, each a `Block<MonthlyData>` rendered in
 * `'app' | 'print' | 'email'` from one body of code. This module holds the
 * part that is pure: the key order, the heading, the masthead's stamp, the
 * subject line and the next monthly's date. The loader is `lib/pages/monthly.ts`;
 * the blocks are `components/blocks/monthly/*`; the documents are
 * `components/email/monthly.tsx`, `components/print/monthly-deck.tsx` and
 * `components/share/monthly-share-shell.tsx`.
 *
 * IT IS THE FRONT PAGE, IN THE FRONT PAGE'S ORDER. The builders are the front
 * page's own (`loadOverview` built as "Your market", on the month that has just
 * ended), so the artefact cannot print a figure the page does not. What is
 * monthly-only is the arrangement, the masthead, the email's own markup and
 * the "What to decide" section's date for the next monthly.
 *
 * FOUR SECTIONS ARE OTHER PACKAGES' SLOTS (`lib/reports/monthly-slots.ts`):
 * the re-check (WP2.3), what came in (WP2.7), what it means for you and what
 * you published (WP2.5) and brands (WP2.6). Until a package fills its slot,
 * the section is absent from the artefact rather than empty, and the change
 * section prints the refusal alone (plan WP2.1, "Depends on").
 */

/**
 * The ten sections, by key, in the front page's order (plan §2.9).
 *
 * A KEY IS A STORED CONTRACT, exactly as a renderable key and a weekly block
 * key are: it names a section inside a built report, a row in a schedule's
 * stored arrangement, and a tile a runner could be asked to render. Renaming
 * one orphans every artefact that named it. `monthly.month` and
 * `monthly.subjects` keep their keys and are reworked (the snapshot's version
 * says which shape a stored row holds); the other eight are new.
 */
export const MONTHLY_BLOCK_KEYS = [
  /** 1 · The month: the market's size, its three biggest conversations and
   *  the lead theme's voices (the front page's block 1). */
  'monthly.month',
  /** 2 · What your market talked about (block 2). */
  'monthly.themes',
  /** 3 · With this update: the came-in lines only; the monthly carries no
   *  weekly volume bars (WP2.7's slot). */
  'monthly.arrivals',
  /** 4 · What people did in the comments (block 4). */
  'monthly.kinds',
  /** 5 · What your market asked, complained about and wished for (block 5). */
  'monthly.asks',
  /** 6 · The market by subject (block 6). */
  'monthly.subjects',
  /** 7 · What it means for you, and what you published (WP2.5's slot, blocks
   *  7 and 8 in one section, before the brands as on the front page). */
  'monthly.you',
  /** 8 · Brands in your market (WP2.6's slot). */
  'monthly.brands',
  /** 9 · What changed, and what is ours: the refusal, and WP2.3's re-check. */
  'monthly.change',
  /** 10 · What to decide: the current recommendation and the next monthly. */
  'monthly.decide',
] as const

export type MonthlyBlockKey = (typeof MONTHLY_BLOCK_KEYS)[number]

/**
 * The keys version 1 arranged and version 2 does not (plan §2.9): the movers,
 * the rivals' standings, the moves, one voice per subject and "How sound is
 * this month" (dropped on 25 Sep, §1 B). They are NEVER reused for a new
 * section: a stored arrangement that names one is a version 1 row, which
 * prints `STALE_ARTEFACT_LINE` rather than a section it never held.
 */
export const MONTHLY_RETIRED_KEYS = [
  'monthly.movers',
  'monthly.rivals',
  'monthly.moves',
  'monthly.voices',
  'monthly.sound',
] as const

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

/** And the artefact's own words for a workspace that has dated nothing. OV5's
 *  say "Press Track this on a subject or a theme", which is a control on a page
 *  the reader of an email is not looking at. */
export const MONTHLY_MOVES_EMPTY =
  'No move has been dated yet, so there is nothing here to score.'

/** A month either keeps moving or it does not (`lib/reading/types.ts`
 *  MonthStatus, re-stated here so a pure composer needs nothing else). */
export type MonthlyStatus = 'filling' | 'frozen'

// ---- the masthead ---------------------------------------------------------------

/** The day this month stops moving. One definition, read from the reading
 *  layer — a hand-rolled thirty days here would drift from the trigger the day
 *  `FREEZE_AFTER_DAYS` moved (the same note OV6 carries). */
export function freezesOn(month: string): string {
  return freezeBoundary(month)
}

/** "September in your market": the artefact's heading, the approved
 *  preview's (plan §2.9). */
export function monthlyTitle(month: string): string {
  return `${longMonth(month)} in your market`
}

/** "read to the 11 Oct update": the last update that read the month
 *  (`ReadingMonth.readTo`), or null where none has. Never the wall clock. */
export function readToWords(readTo: string | null | undefined): string | null {
  return readTo ? `read to the ${shortDate(readTo)} update` : null
}

/**
 * "September 2026 · read to the 11 Oct update": the masthead's stamp, frozen
 * with the snapshot as `period`, and what the deck's chrome and the share page
 * print. The 25 Sep rulings' one context line on an artefact: the month and
 * the update it was read to, with no "still filling" and no freeze date.
 */
export function monthlyStamp(month: string, readTo: string | null | undefined): string {
  const head = `${longMonth(month)} ${month.slice(0, 4)}`
  const read = readToWords(readTo)
  return read ? `${head} · ${read}` : head
}

/**
 * The subject line leads with the market (plan §2.9): "Sealand · September in
 * your market: 655 videos". The count is the month's pooled market (decision
 * E), the same figure "The month" opens on; with no count the line names the
 * month alone. It never leads with a change: no pair of months is read the
 * same way before December (decision D).
 */
export function monthlySubject(company: string, month: string, videos: number | null | undefined): string {
  const head = `${company} · ${monthlyTitle(month)}`
  return videos != null && Number.isFinite(videos) ? `${head}: ${fmtInt(videos)} videos` : head
}

// ---- the next monthly --------------------------------------------------------------

/** How many updates read a month past its end before its monthly is built
 *  (decision J: September's on the 4 and 11 Oct updates, sent Mon 12 Oct;
 *  October's on the 1 and 8 Nov updates, sent Mon 9 Nov). */
export const MONTHLY_UPDATES_PAST_END = 2

const DAY_MS = 24 * 60 * 60 * 1000

export interface NextMonthly {
  /** The month the next monthly reads (`YYYY-MM-01`). */
  month: string
  /** The update it is read to: the second scheduled update after it ends. */
  readTo: string
  /** The day after that update, when it is sent by hand (decision J). */
  sendOn: string
}

/**
 * The next monthly, from the tenant's schedule: the month after this one,
 * read to the second scheduled update after it ends, sent the day after.
 * Null where no update is promised (a paused tenant, no cadence).
 */
export function nextMonthlyOf(
  month: string,
  nextUpdateAfter: ((instant: string) => string | null) | null | undefined,
): NextMonthly | null {
  if (!nextUpdateAfter) return null
  const next = nextMonth(monthStartOf(month))
  let at: string | null = `${nextMonth(next)}T00:00:00.000Z`
  for (let i = 0; i < MONTHLY_UPDATES_PAST_END && at != null; i += 1) at = nextUpdateAfter(at)
  if (at == null || Number.isNaN(Date.parse(at))) return null
  return { month: next, readTo: at, sendOn: new Date(Date.parse(at) + DAY_MS).toISOString() }
}

/** "Next: “October in your market”, read to the 8 Nov update, on Mon 9 Nov."
 *  In parts, so the email can set the title in weight as the preview does. */
export function nextMonthlyParts(n: NextMonthly): { lead: string; title: string; tail: string } {
  return {
    lead: 'Next: ',
    title: `“${monthlyTitle(n.month)}”`,
    tail: `, read to the ${shortDate(n.readTo)} update, on ${weekdayDate(n.sendOn)}.`,
  }
}

/**
 * The largest banded change among a set of verdicts. Version 1's subject line
 * led with it; since WP2.1 the monthly's subject leads with the market, and the
 * briefs' reading is its caller (lib/reports/documents/overview.ts).
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

// ---- the record's figures -------------------------------------------------------

/**
 * The record's figures, as version 1's eighth section printed them (copy
 * de-clutter 2026-09-24, ruling B).
 *
 * NO SECTION PRINTS THEM SINCE WP2.1: that section left the arrangement with
 * the 25 Sep rulings (§1 B). `OverviewData.record.sound` still carries them
 * (lib/pages/overview.ts), so a stored snapshot keeps its shape; removing the
 * field is a change to the Overview loader, left to the package that next
 * rebuilds the record.
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
