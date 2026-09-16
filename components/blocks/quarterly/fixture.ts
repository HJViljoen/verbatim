import { blockAnswers } from '@/lib/blocks/types'
import type { QuarterChecks, QuarterlyData } from '@/lib/pages/quarterly'
import { composeQuarterly } from '@/lib/pages/quarterly'
import type { WindowReading } from '@/lib/reading/read'
import type { RecordInputs } from '@/lib/reading/record'
import type { QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
import { QUARTERLY_BLOCK_KEYS, previousQuarter, quarterFor, quarterlySubject, quarterlyTitle } from '@/lib/reports/quarterly'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
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
// THREE STATES, ALL REAL.
//   `quarterlyFixture()`  — six readings, both window reads taken, the shape
//                           the mock draws and the one nobody has yet.
//   `formingFixture()`    — PRODUCTION TODAY: three readings, M3 unapplied so
//                           the window pair answers null, M4/M5/M7 unapplied so
//                           the subjects, kinds, mood, standings and the check
//                           record are all sentences. This is what a workspace
//                           actually receives, and it is the state the WP's
//                           "done when" is about.
//   `closedFixture()`     — the quarter read after it closed: nothing still
//                           filling, so the masthead drops that clause.

const QUARTER = quarterFor(2026, 3)
const PRIOR = previousQuarter(QUARTER)
const NOW = '2026-09-18T09:00:00.000Z'

const windowRead = (videos: number, comments: number): WindowReading => ({
  denominators: [
    { audience: INDUSTRY_AUDIENCE, videos, comments, platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
  ],
  themes: [
    { audience: INDUSTRY_AUDIENCE, theme_id: 't1', videos: Math.round(videos * 0.21), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
  ],
})

/** M3 unapplied: told apart from an empty read, exactly as the month series
 *  tells its silences apart. */
const notApplied: WindowReading = { denominators: null, themes: null }

const checksRan: QuarterChecks = {
  recorded: true,
  ran: 13,
  flaggedRuns: 1,
  flags: [
    {
      object_kind: 'kind',
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

const record = (delivered: number): RecordInputs =>
  ({
    window: { kind: 'quarter', from: QUARTER.from, to: QUARTER.to },
    delivery: { delivered, dates: [], longestGapDays: 35, failed: 0, basis: 'run_clock' },
    coverage: [
      { audience: INDUSTRY_AUDIENCE, videos: 1388, comments: 11840, platformMix: {}, dualMention: 41, excludedUndated: 0 },
    ],
    readDepth: { speech: null, translated: null, onScreen: null, videos: null },
    language: { notEnglish: null, basis: 'speech', languages: [] },
    discard: { discarded: null, of: null, access: 'tenant' },
    instrument: { themesPerVideo: null, previous: null },
    changes: { recorded: [], reconstructedBefore: null },
    comparisonsRefused: null,
    refusals: [],
    readingAt: NOW,
    frozenAt: null,
  }) as unknown as RecordInputs

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
      checks: checksRan,
      record: record(13),
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
    checks: checksNotRecorded,
    record: null,
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
    checks: checksRan,
    record: record(13),
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
