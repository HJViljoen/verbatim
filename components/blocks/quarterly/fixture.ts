import { blockAnswers } from '@/lib/blocks/types'
import type { QuarterChecks, QuarterlyData, QuarterQuiet } from '@/lib/pages/quarterly'
import { composeQuarterly } from '@/lib/pages/quarterly'
import type { WindowReading } from '@/lib/reading/read'
import type { RecordInputs } from '@/lib/reading/record'
import type { SubjectWindowReading } from '@/lib/subjects/types'
import type { QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
import { QUARTERLY_BLOCK_KEYS, previousQuarter, quarterFor, quarterlySubject, quarterlyTitle } from '@/lib/reports/quarterly'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { overviewFixture, refusedFixture } from '@/components/pages/overview/fixture'
import { marketFixture, unrecordedFixture } from '@/components/pages/market-surface/fixture'
import { competitiveFixture, unreadMonthsFixture } from '@/components/pages/competitive-surface/fixture'
import { quarterlyBlocksFor } from './index'

// The quarterly review's fixtures (Phase 1 WP20).
//
// THEY GO THROUGH THE REAL COMPOSER. `composeQuarterly` is the pure half of the
// loader, so a fixture hands it the three page fixtures plus the two window
// reads and gets back exactly what production gets back — one reading, not a
// second one hand-typed beside it and free to drift.
//
// FOUR STATES, ALL REAL.
//   `quarterlyFixture()`    — eight readings, both window reads taken, read
//                             mid-quarter: the shape the mock draws.
//   `formingFixture()`      — PRODUCTION TODAY: three readings, M3 unapplied so
//                             the window pair answers null, M4/M5/M7 unapplied
//                             so the subjects, kinds, mood, standings and the
//                             check record are all sentences. This is what a
//                             workspace actually receives.
//   `closedFixture()`       — the quarter read after it closed, with the month
//                             pages still inside it.
//   `afterQuarterFixture()` — THE NORMAL SEND. A quarterly schedule fires on
//                             the first update of the NEXT quarter, so a Q3
//                             review is built in October and the month-level
//                             pages are of a month OUTSIDE the quarter the
//                             masthead names. Every page that prints a month
//                             figure has to say so.

const QUARTER = quarterFor(2026, 3)
const PRIOR = previousQuarter(QUARTER)
const NOW = '2026-09-18T09:00:00.000Z'

/** Both sides of one window: the category's videos and the tenant's own. The
 *  tenant's side is what page 3's "you" column divides by, and it is a
 *  DIFFERENT denominator from the category's — never a share of it. */
const windowRead = (videos: number, comments: number): WindowReading => ({
  denominators: [
    { audience: INDUSTRY_AUDIENCE, videos, comments, platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
    { audience: CLIENT_AUDIENCE, videos: Math.round(videos * 0.06), comments: Math.round(comments * 0.06), platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
  ],
  themes: [
    { audience: INDUSTRY_AUDIENCE, theme_id: 't1', videos: Math.round(videos * 0.21), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
  ],
})

/** The tenant's own subjects over the same window, on both sides — the mock's
 *  page 3, and the half of the artefact no test exercised. */
const subjectWindow = (videos: number, share: number): SubjectWindowReading[] => [
  { audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: Math.round(videos * share), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
  { audience: CLIENT_AUDIENCE, subject_id: 's1', videos: Math.round(videos * 0.06 * (share + 0.08)), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
  { audience: INDUSTRY_AUDIENCE, subject_id: 's2', videos: Math.round(videos * 0.27), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
]

/** M3 unapplied: told apart from an empty read, exactly as the month series
 *  tells its silences apart. */
const notApplied: WindowReading = { denominators: null, themes: null }

/** Two themes the register has marked dormant — `qr.p4.flags`, the second of
 *  the two READER_FLAGS. Null in `formingFixture`, because "we could not read
 *  the register" and "nothing has gone quiet" are two different sentences and
 *  wave 2 has to draw both. */
const QUIET: QuarterQuiet[] = [
  { id: 'q1', label: 'Shipping and delivery times', lastHeard: '2026-06-01' },
  { id: 'q2', label: 'Sizing and fit questions', lastHeard: '2026-05-01' },
]

const checksRan: QuarterChecks = {
  recorded: true,
  ran: 13,
  flaggedRuns: 1,
  flags: [
    {
      object_kind: 'kind',
      object_id: 'objection',
      label: 'Objections',
      denominator: 'every audience together',
      week_start: '2026-09-06',
      week_end: '2026-09-13',
      week_k: 29,
      week_n: 205,
      change_pts: 10.7,
      band_pts: 5,
      explanation: { sentences: ['People are asking the same question about the zip before they buy.'] },
    },
  ],
}

const checksNotRecorded: QuarterChecks = { recorded: false, ran: 0, flaggedRuns: 0, flags: [] }

/**
 * The quarter's record — NO CAST.
 *
 * The first cut wrote five of these eight blocks in shapes `RecordInputs` does
 * not have and reached them through `as unknown as RecordInputs`. The type
 * checker was silenced, and `recordLines` then read `input.changes.inWindow`
 * off an object carrying `recorded` and `reconstructedBefore`: two of the three
 * fixtures rendered "NaN changes to what we track were made inside this
 * window" on the method page, in all three modes, under thirty-four passing
 * block tests and the deck's own copy contract. A render tier exists to catch
 * exactly that, and a cast is what stopped it.
 */
const record = (delivered: number, readingAt = NOW): RecordInputs => ({
  window: { kind: 'quarter', from: QUARTER.from, to: QUARTER.to },
  delivery: { delivered, dates: [], longestGapDays: 35, failed: 0, basis: 'run_clock' },
  coverage: [
    { audience: INDUSTRY_AUDIENCE, videos: 1388, comments: 11840, platformMix: {}, dualMention: 41, excludedUndated: 0 },
  ],
  readDepth: { analysed: 1388, speech: 694, translated: 180, onScreenText: 233, unflagged: 0, basis: 'all_time_non_reddit' },
  language: { analysed: 1388, unknown: 420, english: 640, notEnglish: 328, basis: 'video_speech' },
  discard: { readable: true, judged: 1480, kept: 1388, setAside: 92, clearedByHeuristic: 12, gateOff: 0, failedOpen: 0, recordedFrom: '2026-06-28', basis: 'run_clock' },
  instrument: { themesPerVideo: 2.4, themeAttachments: 3331, analysedVideos: 1388, runId: 'run-q3' },
  changes: { inWindow: 1, loggedFrom: '2026-07-04', reconstructed: 3 },
  comparisonsRefused: null,
  refusals: [],
  readingAt,
  frozenAt: null,
})

/** A quarter that reads on both sides. */
export function quarterlyFixture(over: Partial<QuarterlyData> = {}): QuarterlyData {
  const overview = overviewFixture()
  return {
    ...composeQuarterly({
      overview: { ...overview, bar: { ...overview.bar, readings: 8 } },
      market: marketFixture(),
      competitive: competitiveFixture(),
      quarter: QUARTER,
      prior: PRIOR,
      readingAt: NOW,
      thisQuarter: windowRead(4147, 33000),
      lastQuarter: windowRead(3810, 29000),
      subjectsNow: subjectWindow(4147, 0.22),
      subjectsBefore: subjectWindow(3810, 0.18),
      checks: checksRan,
      record: record(13),
      quiet: QUIET,
    }),
    ...over,
  }
}

/** Production today: three readings, M3–M7 unapplied. */
export function formingFixture(): QuarterlyData {
  const overview = refusedFixture()
  return composeQuarterly({
    overview: { ...overview, bar: { ...overview.bar, readings: 3 } },
    market: unrecordedFixture(),
    competitive: unreadMonthsFixture(),
    quarter: QUARTER,
    prior: PRIOR,
    readingAt: NOW,
    thisQuarter: notApplied,
    lastQuarter: notApplied,
    subjectsNow: null,
    subjectsBefore: null,
    checks: checksNotRecorded,
    record: null,
    quiet: null,
  })
}

/** The quarter read after it closed. */
export function closedFixture(): QuarterlyData {
  const overview = overviewFixture()
  return composeQuarterly({
    overview: { ...overview, monthStatus: 'frozen', bar: { ...overview.bar, readings: 9 } },
    market: marketFixture(),
    competitive: competitiveFixture(),
    quarter: QUARTER,
    prior: PRIOR,
    readingAt: '2026-11-02T09:00:00.000Z',
    thisQuarter: windowRead(4147, 33000),
    lastQuarter: windowRead(3810, 29000),
    subjectsNow: subjectWindow(4147, 0.22),
    subjectsBefore: subjectWindow(3810, 0.18),
    checks: checksRan,
    record: record(13, '2026-11-02T09:00:00.000Z'),
    quiet: QUIET,
  })
}

/**
 * THE NORMAL SEND, and the state the artefact spends most of its life in: a
 * quarterly schedule fires on the first update of the NEXT quarter, so a Q3
 * review is built in October and the month-level pages — movers, the kind mix,
 * the mood, the rival rows, every level on page 3 — are of a month OUTSIDE the
 * quarter the masthead names. Nothing can rewind those loaders, so every page
 * that prints a month figure says which month it is and that it falls outside.
 */
export function afterQuarterFixture(): QuarterlyData {
  const overview = overviewFixture()
  const AFTER = '2026-10-06T09:00:00.000Z'
  return composeQuarterly({
    overview: {
      ...overview,
      month: '2026-10-01',
      monthStatus: 'filling',
      // The month bar is October's too, so nothing on the sheet names one
      // month in a label and another in the line under it.
      bar: {
        ...overview.bar,
        month: '2026-10-01',
        daysIn: 6,
        updates: 1,
        updateDates: ['3 Oct'],
        videos: 512,
        line: '6 days in · 1 update · 512 videos',
        readings: 9,
      },
    },
    market: marketFixture(),
    competitive: competitiveFixture(),
    quarter: QUARTER,
    prior: PRIOR,
    readingAt: AFTER,
    thisQuarter: windowRead(4147, 33000),
    lastQuarter: windowRead(3810, 29000),
    subjectsNow: subjectWindow(4147, 0.22),
    subjectsBefore: subjectWindow(3810, 0.18),
    checks: checksRan,
    record: record(13, AFTER),
    quiet: QUIET,
  })
}

/**
 * A THIN MONTH: the window pair reads, the clustering reads, and the month's
 * movers are empty — so no theme is named to follow across the quarter.
 *
 * Not a hypothetical. `quarterThemeIds` is the current month's growing and
 * fading, at most six; a month that moved nothing clearly names none, and the
 * category page used to report that as "Nothing the category talked about
 * carried a reading on both sides of this quarter" — a measurement, about a
 * question nobody asked.
 */
export function thinMonthFixture(): QuarterlyData {
  const overview = overviewFixture()
  return composeQuarterly({
    overview: {
      ...overview,
      bar: { ...overview.bar, readings: 8 },
      category: {
        ...overview.category,
        growing: [],
        fading: [],
        moversNote: 'Nothing moved clearly this month.',
      },
    },
    market: marketFixture(),
    competitive: competitiveFixture(),
    quarter: QUARTER,
    prior: PRIOR,
    readingAt: NOW,
    thisQuarter: windowRead(4147, 33000),
    lastQuarter: windowRead(3810, 29000),
    subjectsNow: subjectWindow(4147, 0.22),
    subjectsBefore: subjectWindow(3810, 0.18),
    checks: checksRan,
    record: record(13),
    // A thin month names no mover AND the register is still readable: the two
    // silences are independent, and the fixture proves a page can carry one
    // without the other.
    quiet: [],
  })
}

/**
 * A frozen quarterly artefact, over one of the readings above.
 *
 * Built the way `snapshotQuarterly` builds one — the same title, period,
 * subject and merged figure table — so a deck test, an email test and a share
 * test all exercise the shape the send path actually writes.
 */
export function quarterlySnapshotFixture(reading: QuarterlyData = quarterlyFixture()): QuarterlySnapshotData {
  const company = reading.brand
  return {
    version: 1,
    kind: 'quarterly',
    company,
    title: quarterlyTitle(company, reading.quarter),
    period: reading.period,
    readingAt: reading.readingAt,
    quarter: reading.quarter,
    prior: reading.prior,
    readings: reading.readings,
    keys: [...QUARTERLY_BLOCK_KEYS],
    reading,
    figures: Object.assign({}, ...quarterlyBlocksFor().map((b) => blockAnswers(b, reading).figures)),
    subject: quarterlySubject(company, reading.quarter, reading.readings),
  }
}
