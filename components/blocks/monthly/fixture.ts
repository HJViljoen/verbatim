import type { MonthlyData } from '@/lib/pages/monthly'
import { headline, sentenceBlockFor, type OverviewData } from '@/lib/pages/overview'
import { monthlySubject, nextMonthlyOf } from '@/lib/reports/monthly'
import { MONTHLY_SLOT_STUBS, type MonthlySlots } from '@/lib/reports/monthly-slots'
import { comparabilityOf, type OurChange, type PairRow } from '@/lib/reading/comparability'
import { scheduledUpdateAfter } from '@/lib/reading/reading-month'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { sealandReading } from '@/lib/test/reading-fixture'
import { SEPTEMBER_CHIP, marketBeforeMakersFixture, marketFrontFixture, ossurFrontFixture, overviewFixture, verdict } from '@/components/pages/overview/fixture'

// "September in your market"'s fixtures (market-first WP2.1).
//
// THE FRONT PAGE'S OWN FIXTURES, READ AS AN ENDED MONTH. The monthly IS the
// front page's reading of the month that has just ended, so its fixture is
// the front page's (`marketFrontFixture`: Sealand's September on production's
// 24 Sep figures, plan §2.2's print, every number sourced there) with three
// things the monthly adds, each sourced below:
//
// - THE CLOCK. The monthly is read after its month ends: the 12 Oct clock, on
//   Sealand's real update calendar (`sealandReading`), reads September "read
//   to the 11 Oct update". The FIGURES stay the 24 Sep production ones, a
//   stand-in for September read past its end (not knowable until the 11 Oct
//   update): the approved preview's own convention ("Preview on September's
//   production figures to the 24 Sep update").
// - THE MEASURED PAIR ROW. Staging's (August, September) row from the WP1.4
//   rehearsal (26 Sep, `measure-comparability` read through the 20 Sep
//   update): 148 of 351 and 376 of 625 outside the searches both months ran,
//   and DR F39's depth medians, 23 and 15. So the change section prints the
//   front page's measured sentence, read with the 20 Sep update.
// - THE STANDING ADVICE. `overviewFixture`'s ledger row, the one every Phase 1
//   Overview test carries.
// - THE SIZE SENTENCE OF AN ENDED MONTH. The front page's builders
//   (`headline`, `sentenceBlockFor`) on the same 655 videos and 16,233
//   comments, read as September ended rather than "so far".

const AUG = '2026-08-01'
const SEP = '2026-09-01'
/** The 12 Oct clock: September has ended and two updates read past it. */
export const MONTHLY_AT = '2026-10-12T06:00:00.000Z'
const SUNDAYS = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

/** Staging's measured (August, September) row (WP1.4's rehearsal, 26 Sep). */
export const STAGING_PAIR_ROW: PairRow = {
  prevMonth: AUG,
  month: SEP,
  searchOutside: { prev: { k: 148, n: 351 }, curr: { k: 376, n: 625 } },
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
  const ledger = overviewFixture().sentence.ledger
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
 *  monthly promised. Staging's rows, as `ossurFrontFixture` holds them. */
export function ossurMonthlyFixture(over: Partial<MonthlyData> = {}): MonthlyData {
  const base = ossurFrontFixture()
  return monthly({ ...base, sentence: { ...base.sentence, ledger: null } }, over)
}

/**
 * Every slot filled, for the filled arms' render tests.
 *
 * - `brands`: BC F35 (staging, September, raw): the market's 662 videos, 563
 *   without our rival searches; Patagonia 47 and 33, The North Face 36 and
 *   11, Cotopaxi 31 and 11, Freitag 12 and 4 (mostly the German word); the 8
 *   videos naming Sealand are its own posts, so the name line reads none.
 * - `you`: plan §2.2 row 8 (production): 20 posts in September, 30 in August,
 *   10 drew 5 or more comments, 9 carry a reading over 234 comments; the
 *   followers' three themes, 4, 3 and 2; no move dated. No for-you line: its
 *   sentences are WP2.5's.
 * - `arrivals` and `change`: HYPOTHETICAL, and named so. What the 11 Oct
 *   update brings is not knowable, so the counts are real ones of a different
 *   question, borrowed for their size: 206 (GC F29, September videos first
 *   found by the 13 Sep terms) and 4,923 (WP1.4's staging late capture of
 *   September comments). The check line is the plan's own expected outcome
 *   (WP2.3: "Too few videos on the searches both months ran to check.") on
 *   "Asking for something", 146 of 626 in September (production).
 */
export function filledSlotsFixture(): MonthlyData {
  const base = monthlyFixture()
  const slots: MonthlySlots = {
    brands: {
      state: 'filled',
      value: {
        window: SEP,
        nameLine: { month: SEP, n: 662, k: 0, ownPosts: 8 },
        topics: [
          { brandKey: 'patagonia', label: 'Patagonia', kAny: 47, kOrganic: 33, n: 662, nOrganic: 563, noise: false },
          { brandKey: 'the-north-face', label: 'The North Face', kAny: 36, kOrganic: 11, n: 662, nOrganic: 563, noise: false },
          { brandKey: 'cotopaxi', label: 'Cotopaxi', kAny: 31, kOrganic: 11, n: 662, nOrganic: 563, noise: false },
          { brandKey: 'freitag', label: 'Freitag', kAny: 12, kOrganic: 4, n: 662, nOrganic: 563, noise: true },
        ],
        ninetyDayNote: 'Ninety-day counts read today’s tags; frozen months keep the tags they froze with.',
      },
    },
    you: {
      state: 'filled',
      value: {
        foryou: null,
        published: {
          month: SEP,
          posts: 20,
          prevPosts: 30,
          drewFive: 10,
          withReading: 9,
          readingComments: 234,
          followers: [
            { label: 'Respect for Sealand’s mission', k: 4 },
            { label: 'Support for clean-up initiatives', k: 3 },
            { label: 'Keen to join events', k: 2 },
          ],
          movesDated: 0,
        },
      },
    },
    arrivals: {
      state: 'filled',
      value: {
        run: { id: 'run-2026-10-11', date: '2026-10-11T08:30:00.000Z' },
        months: [{ month: SEP, videosFirstRead: 206, commentsCaptured: 4923 }],
        current: { month: '2026-10-01', videos: null, updates: 2 },
        newThemes: [],
        regrouped: null,
      },
    },
    change: {
      state: 'filled',
      value: {
        checks: [{
          objectKind: 'kind',
          objectId: 'feature_request',
          label: 'Asking for something',
          population: 'same_searches_clean',
          verdict: verdict({ objectKind: 'kind', objectId: 'feature_request', objectLabel: 'Asking for something', audience: INDUSTRY_AUDIENCE, value: { k: 146, n: 626 }, state: 'too_little_data', changePts: null, bandPts: null }),
          sentence: 'Too few videos on the searches both months ran to check.',
          populationShares: null,
          readWith: '2026-10-11T08:30:00.000Z',
        }],
      },
    },
  }
  return { ...base, slots }
}
