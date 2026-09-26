import type { MonthlyData } from '@/lib/pages/monthly'
import { headline, sentenceBlockFor, type LedgerRow, type OverviewData } from '@/lib/pages/overview'
import { monthlySubject, nextMonthlyOf } from '@/lib/reports/monthly'
import { MONTHLY_SLOT_STUBS, monthlySlotsFrom, type MonthlySlots } from '@/lib/reports/monthly-slots'
import { stagingBrandsRead } from '@/lib/test/brands-fixture'
import { RECHECK_BUYERS, RECHECK_READ_WITH, recheckRows, recheckRunFinish } from '@/lib/test/recheck-fixture'
import { buildCheckLines } from '@/lib/pages/overview-market'
import { comparabilityOf, type OurChange, type PairRow } from '@/lib/reading/comparability'
import { scheduledUpdateAfter } from '@/lib/reading/reading-month'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { sealandReading } from '@/lib/test/reading-fixture'
import { SEPTEMBER_CHIP, marketBeforeMakersFixture, marketFrontFixture, ossurFrontFixture } from '@/components/pages/overview/fixture'

// "September in your market"'s fixtures (market-first WP2.1).
//
// THE FRONT PAGE'S OWN FIXTURES, READ AS AN ENDED MONTH. The monthly IS the
// front page's reading of the month that has just ended, so its fixture is
// the front page's (`marketFrontFixture`: Sealand's September on production's
// 24 Sep figures, plan §2.2's print, every number sourced there) with three
// things the monthly adds, each sourced below:
//
// - THE CLOCK. The monthly is read after its month ends: the 6 Oct clock (its
//   send, plan §3.7 option (b)), on Sealand's real update calendar
//   (`sealandReading`), reads September "read to the 4 Oct update". The
//   FIGURES stay the 24 Sep production ones, a stand-in for September read
//   past its end (not knowable until the 4 Oct update): the approved
//   preview's own convention ("Preview on September's production figures to
//   the 24 Sep update").
// - THE MEASURED PAIR ROW. Staging's (August, September) row from the WP1.4
//   rehearsal (26 Sep, `measure-comparability` read through the 20 Sep
//   update): 148 of 351 and 376 of 625 outside the searches both months ran
//   (the strict counts, decision D's rule 2 only), WP1.8's one figure, 356 of
//   September's 654 market videos found only by searches first run in
//   September (the 26 Sep ruling), and DR F39's depth medians, 23 and 15. So
//   the change section prints the front page's measured sentence, "about
//   half" (356 of 654), read with the 20 Sep update.
// - THE STANDING ADVICE. Staging's current recommendation for each tenant, as
//   the front page's ledger reads it (`loadMonthly` at the 11 Oct clock,
//   read-only, WP2.1 fresh check, 26 Sep): `STAGING_LEDGER` and
//   `OSSUR_STAGING_LEDGER` below.
// - THE SIZE SENTENCE OF AN ENDED MONTH. The front page's builders
//   (`headline`, `sentenceBlockFor`) on the same 655 videos and 16,233
//   comments, read as September ended rather than "so far".

const AUG = '2026-08-01'
const SEP = '2026-09-01'
/** The 6 Oct clock, the send (plan §3.7): September has ended and one update
 *  (4 Oct) read past it. */
export const MONTHLY_AT = '2026-10-06T06:00:00.000Z'
const SUNDAYS = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

/** Staging's measured (August, September) row (WP1.4's rehearsal, 26 Sep). */
export const STAGING_PAIR_ROW: PairRow = {
  prevMonth: AUG,
  month: SEP,
  searchOutside: { prev: { k: 148, n: 351 }, curr: { k: 376, n: 625 } },
  addedOnly: { k: 356, n: 654 },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 15 },
  gather: [],
  lateCapture: null,
  readThroughRun: 'run-2026-09-20',
  methodVersion: 'comparability_v1',
  computedAt: '2026-09-26T09:00:00.000Z',
}

/** The day the row was read through (staging's 20 Sep partial run, stamped
 *  12:00 UTC as `sealandReading` stamps it). */
const READ_WITH = '2026-09-20T12:00:00.000Z'

/** Our search changes inside the pair (staging's change log: the 9 Sep term
 *  swap, and the 13 and 17 Sep additions). */
const SEARCH_CHANGES: OurChange[] = [
  { id: 'terms-0909', surface: 'terms', changedAt: '2026-09-09T18:17:56.893Z', note: null, affects: ['market', 'themes', 'brands', 'lens'] },
  { id: 'terms-0913', surface: 'terms', changedAt: '2026-09-13T10:00:58.000Z', note: null, affects: ['market', 'themes', 'brands', 'lens'] },
  { id: 'terms-0917', surface: 'terms', changedAt: '2026-09-17T16:02:56.000Z', note: null, affects: ['market', 'themes', 'brands', 'lens'] },
]

/** Sealand's current recommendation on staging (8196074b, the row WP1.9's
 *  ledger order puts first): made on 3 updates, 253 videos behind it, marked
 *  "Working on it" on 15 Sep. `monthsOld` is null there (no "first on record"
 *  clause). */
export const STAGING_LEDGER: LedgerRow = {
  id: '8196074b-1a28-4eb2-b0bd-06248bf1a4ff',
  title: 'Add a "fit and facts" layer to every Sealand bag page and shopping touchpoint',
  monthsOld: null,
  timesMade: 3,
  grounding: { videos: 253, themes: 204, audience: INDUSTRY_AUDIENCE, pruned: false, line: '253 videos behind it' },
  status: 'in_progress',
  statusLabel: 'Working on it',
  decidedAt: '2026-09-15T12:20:21.531616+00:00',
  href: '/dashboard/market',
}

/** Össur's current recommendation on staging (85dd4fde): made once, 72 videos
 *  behind it, no decision recorded. */
export const OSSUR_STAGING_LEDGER: LedgerRow = {
  id: '85dd4fde-14ef-47c9-876b-6fa86c7cf169',
  title: 'Launch an access navigator that covers price, coverage, denials, and where to get seen',
  monthsOld: null,
  timesMade: 1,
  grounding: { videos: 72, themes: 76, audience: INDUSTRY_AUDIENCE, pruned: false, line: '72 videos behind it' },
  status: 'new',
  statusLabel: 'New',
  decidedAt: null,
  href: '/dashboard/market',
}

/** Össur's own search-change days inside the pair on staging, as the front
 *  page's loader lists them (`ChangeBlock.searchChanges`): 23 Aug and 13 Sep.
 *  `ossurFrontFixture` inherits Sealand's change block, whose strip a paused
 *  page never draws; the monthly draws the refused pair, so it needs Össur's. */
const OSSUR_SEARCH_CHANGES = ['2026-08-23T00:00:00+00:00', '2026-09-13T00:00:00+00:00']

/** The front page's reading, read as the monthly reads it. */
function asEnded(base: OverviewData, over: { measured?: boolean } = {}): OverviewData {
  const reading = sealandReading(MONTHLY_AT, SEP)
  const pair = comparabilityOf(AUG, SEP, {
    row: over.measured === false ? null : STAGING_PAIR_ROW,
    changes: SEARCH_CHANGES,
    view: 'market',
    later: { state: 'ended', readToEnd: true, latestUpdateRunId: STAGING_PAIR_ROW.readThroughRun },
  })
  const size = base.market?.find((c) => c.month === SEP)
  const head = headline({ verdicts: [], size: { month: SEP, soFar: false, videos: size?.videos ?? null, comments: size?.comments ?? null }, makerShares: null, chip: SEPTEMBER_CHIP })
  const ledger = STAGING_LEDGER
  return {
    ...base,
    reading,
    monthStatus: 'filling',
    sentence: sentenceBlockFor({ head, verdicts: [], voices: { voices: [], from: 0 }, ledger, anomaly: null }),
    change: base.change
      ? { ...base.change, pair, readWith: over.measured === false ? null : READ_WITH, asAt: reading.asAt }
      : base.change,
  }
}

function monthly(overview: OverviewData, over: Partial<MonthlyData>): MonthlyData {
  const market = overview.market?.find((c) => c.month === overview.month) ?? null
  const data: MonthlyData = {
    brand: overview.brand,
    month: overview.month,
    monthStatus: overview.monthStatus,
    readingAt: MONTHLY_AT,
    readTo: overview.reading.readTo,
    market,
    overview,
    slots: { ...MONTHLY_SLOT_STUBS },
    decide: {
      ledger: overview.sentence.ledger,
      next: overview.reading.paused ? null : nextMonthlyOf(overview.month, SUNDAYS),
      href: '/dashboard/market',
    },
    subject: monthlySubject(overview.brand, overview.month, market?.videos ?? null),
  }
  return { ...data, ...over }
}

/** Sealand's "September in your market": every slot a stub (the skeleton). */
export function monthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  return monthly(asEnded(marketFrontFixture()), over)
}

/** The same, before MF1 (no maker shares, no lead, no voices) and with no
 *  measured pair row: the change section prints the pair's own words. */
export function unmeasuredMonthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  return monthly(asEnded(marketBeforeMakersFixture(), { measured: false }), over)
}

/** Össur's September (§2.13): paused, no subjects, no maker rule, no next
 *  monthly promised. Staging's rows, as `ossurFrontFixture` holds them, with
 *  Össur's own recommendation and search-change days (staging). */
export function ossurMonthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  const base = ossurFrontFixture()
  return monthly({
    ...base,
    sentence: { ...base.sentence, ledger: OSSUR_STAGING_LEDGER },
    change: base.change ? { ...base.change, searchChanges: OSSUR_SEARCH_CHANGES } : base.change,
  }, over)
}

/**
 * Every slot filled, for the filled arms' render tests.
 *
 * - `brands`: staging's brands_v1 plan of 27 Sep (lib/test/brands-fixture.ts):
 *   the market's 654 September videos, 516 of them without any video our
 *   rival searches found; Patagonia 13 over that one base and 45 in all, The
 *   North Face 6 and 36, Cotopaxi 3 and 28;
 *   Freitag, Rareform, Freedom of Movement and Old School not counted yet
 *   (no measured precision); the 8 videos naming Sealand are its own posts,
 *   so the name line reads none.
 * - `you`: the front page's two WP2.5 blocks, as the loader wires them. The
 *   for-you line is staging's Waterproofing measure (GR F24: 16 question
 *   videos over three months, none of Sealand's 56 posts sharing two or more
 *   of its words); the census is plan §2.2 row 8 (production): 20 posts in
 *   September, 30 in August, 10 drew 5 or more comments, 9 carry a reading
 *   over 234 comments; the followers' three themes, 4, 3 and 2; no move dated.
 * - `arrivals`: staging's 20 Sep update as `update_arrivals` counts it (MF2,
 *   read-only, 26 Sep): 395 September videos read for the first time and
 *   11,999 September comments (1 and 99 of August), with the two themes it
 *   heard first at 10+ category videos in September as the loader read them
 *   on staging (no earlier month holds them: the two Conversation flags New),
 *   each with 8 of its 10 videos from searches first run in September. What
 *   the 4 Oct update brings is not knowable.
 * - `change`: staging's re-check plan of 26 Sep (lib/test/recheck-fixture.ts),
 *   read with the 20 Sep update: too few on the searches both months ran (78
 *   and 103 videos), the two kinds whose fall follows depth (recheck_v2), and the
 *   buyers-only counts, 146 and 381.
 */
export function filledSlotsFixture(): MonthlyData {
  const base = monthlyFixture()
  const slots: MonthlySlots = {
    brands: { state: 'filled', value: stagingBrandsRead() },
    // The front page's own two blocks, through the loader's one wiring
    // (`monthlySlotsFrom`): the for-you line on staging's Waterproofing
    // measure and production's September census, as `marketFrontFixture`
    // sources them.
    you: monthlySlotsFrom(base.overview).you,
    arrivals: {
      state: 'filled',
      value: {
        run: { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', date: '2026-09-20T08:33:47.358Z' },
        months: [
          { month: '2026-08-01', videosFirstRead: 1, commentsCaptured: 99 },
          { month: SEP, videosFirstRead: 395, commentsCaptured: 11999 },
        ],
        current: { month: SEP, videos: 654, updates: 3 },
        newThemes: [
          { registryId: '4f4bc420-8906-44ac-878d-2855c1011485', label: 'Laundry planning for travel', k: 10, fromNewSearches: 8 },
          { registryId: 'aed3a6d0-5fe9-456f-b8a9-f1cd096f062c', label: 'Preference for secondhand fashion', k: 10, fromNewSearches: 8 },
        ],
        regrouped: null,
        grouped: { makers: 0, setAside: 0 },
      },
    },
    change: {
      state: 'filled',
      value: {
        checks: buildCheckLines({ rows: recheckRows(), month: SEP, runFinish: recheckRunFinish() }),
        recheck: 'read',
        buyers: { prevMonth: AUG, month: SEP, prev: RECHECK_BUYERS.august, curr: RECHECK_BUYERS.september, readWith: RECHECK_READ_WITH },
      },
    },
  }
  return { ...base, slots }
}
