import { blockAnswers } from '@/lib/blocks/types'
import type { OverviewData } from '@/lib/pages/overview'
import type { QuarterChecks, QuarterlyData, QuarterQuiet } from '@/lib/pages/quarterly'
import { composeQuarterly } from '@/lib/pages/quarterly'
import type { WindowReading } from '@/lib/reading/read'
import type { RecordInputs } from '@/lib/reading/record'
import type { SubjectWindowReading } from '@/lib/subjects/types'
import { searchPlanView, type DeckChangeLog, type SearchPlan } from '@/lib/settings/deck-record'
import { QUARTERLY_SNAPSHOT_VERSION, type QuarterlySnapshotData } from '@/lib/reports/quarterly-build'
import { QUARTERLY_BLOCK_KEYS, previousQuarter, quarterFor, quarterlySubject, quarterlyTitle } from '@/lib/reports/quarterly'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { overviewFixture, refusedFixture, verdict } from '@/components/pages/overview/fixture'
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

/**
 * The tenant's own subjects over the same window, on both sides — the mock's
 * page 3, and the half of the artefact no test exercised.
 *
 * SIX SUBJECTS, WHICH IS WHAT THE SAME FIXTURE SAYS ON PAGE 8. The change log
 * this file feeds the last sheet prints "Six subjects were named and
 * confirmed" (`rowsAffected: 6`) while the window read carried two, so one
 * artefact contradicted itself across two of its own pages — and page 3, the
 * sheet whose whole purpose was to become the artboard's dense six-row table,
 * had never been drawn at that density. The shares are the two real ones plus
 * four that sit between them, and each subject's own side stays a DIFFERENT
 * denominator from the category's.
 */
const SUBJECT_SHARES: readonly { id: string; share: number; yours: number | null }[] = [
  { id: 's1', share: 0, yours: 0.08 },
  { id: 's2', share: 0.27, yours: 0.05 },
  { id: 's3', share: 0.19, yours: 0.11 },
  { id: 's4', share: 0.14, yours: 0.02 },
  { id: 's5', share: 0.09, yours: 0.06 },
  // `yours: null` — THE SIDE NOBODY READ. One subject carries the category
  // column and no "you" column, because that is a real state and because a
  // table of six rows all of which compare is a fixture that never draws the
  // arm `gapBetween` refuses on ("draws no gap where a column could not be
  // drawn"). Before the table went to six, `s2` was that row by accident.
  { id: 's6', share: 0.05, yours: null },
]

const subjectWindow = (videos: number, share: number): SubjectWindowReading[] =>
  SUBJECT_SHARES.flatMap((s) => {
    // `s1` is the row the gap line and the chart are drawn from, so it keeps
    // the share the caller passes; the rest carry their own.
    const cat = s.id === 's1' ? share : s.share
    const both: SubjectWindowReading[] = [
      { audience: INDUSTRY_AUDIENCE, subject_id: s.id, videos: Math.round(videos * cat), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
    ]
    if (s.yours != null) {
      both.push({ audience: CLIENT_AUDIENCE, subject_id: s.id, videos: Math.round(videos * 0.06 * (cat + s.yours)), comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 })
    }
    return both
  })

/**
 * The six subjects the change log says were named, as Overview's own rows.
 *
 * `buildSubjects` reads `overview.subjects.rows` for the labels and the month
 * columns and `subjectWindow` for the quarter columns; a subject in one and
 * not the other draws no row at all (`if (!was || !n || !priorN || !label)
 * continue`). So the two lists are built together here, from one place.
 */
const SIX_SUBJECTS: readonly { id: string; label: string; you: [number, number]; rival: [number, number]; category: [number, number]; spark: number[] }[] = [
  { id: 's3', label: 'Sizing and fit', you: [14, 84], rival: [31, 142], category: [241, 1388], spark: [15, 16, 16, 17, 17, 17] },
  { id: 's4', label: 'Delivery and shipping', you: [9, 84], rival: [19, 142], category: [186, 1388], spark: [11, 12, 12, 13, 13, 13] },
  { id: 's5', label: 'Repairs and warranty', you: [7, 84], rival: [12, 142], category: [118, 1388], spark: [7, 7, 8, 8, 8, 9] },
  { id: 's6', label: 'Where the material comes from', you: [4, 84], rival: [8, 142], category: [69, 1388], spark: [4, 4, 4, 5, 5, 5] },
]

const SPARK_MONTHS = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']

/** Overview's two rows plus the four above, with the quarter verdict each
 *  needs on the category side — the side that has the n. */
function sixSubjectRows(overview: OverviewData): OverviewData['subjects']['rows'] {
  const extra = SIX_SUBJECTS.map((s) => ({
    id: s.id,
    label: s.label,
    you: { k: s.you[0], n: s.you[1], pct: round1((s.you[0] / s.you[1]) * 100), verdict: null, observed: true },
    rival: { k: s.rival[0], n: s.rival[1], pct: round1((s.rival[0] / s.rival[1]) * 100), verdict: null, observed: true },
    category: {
      k: s.category[0],
      n: s.category[1],
      pct: round1((s.category[0] / s.category[1]) * 100),
      verdict: verdict({ objectKind: 'subject', objectId: s.id, objectLabel: s.label, value: { k: s.category[0], n: s.category[1] }, changePts: 0.8, bandPts: 2.1, state: 'no_clear_change' }),
      observed: true,
    },
    direction: null,
    spark: s.spark,
    sparkMonths: SPARK_MONTHS,
    categoryAtLastMonth: null,
    href: `/dashboard/subjects?item=${s.id}`,
  }))
  return [...overview.subjects.rows, ...extra] as OverviewData['subjects']['rows']
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** Overview, with the six subjects the change log names. */
function withSixSubjects(overview: OverviewData): OverviewData {
  return { ...overview, subjects: { ...overview.subjects, rows: sixSubjectRows(overview) } }
}

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
 * `qr.p8.searchplan` and `qr.p8.changelog` — what the deck's last page now
 * draws, and what nothing in this fixture carried.
 *
 * BOTH GO THROUGH THEIR OWN PURE VIEW (`searchPlanView`, `deckChangeLogView`),
 * so the fixture exercises the cut the loader takes rather than a shape typed
 * beside it — including `noYield`, which is the row worth reading (a term that
 * found something and kept nothing is a term costing money to gather), and the
 * change log's RECORDED-only rule.
 */
const SEARCH_PLAN: SearchPlan = searchPlanView([
  { keyword: 'recycled sails', months: [], found: 412, kept: 388, keptPct: 94.2 },
  { keyword: 'sail bag', months: [], found: 260, kept: 221, keptPct: 85 },
  { keyword: 'eco bag', months: [], found: 410, kept: 12, keptPct: 2.9 },
  { keyword: 'upcycled backpack', months: [], found: 96, kept: 0, keptPct: 0 },
])

const CHANGE_LOG: DeckChangeLog = {
  rows: [
    {
      // `dateShort` is E-record's, added to `ClientChange` in the same wave:
      // the record page's 100px column takes "3 Sep" and the quarterly's change
      // log keeps the long form, because there two Septembers a year apart sit
      // in one table.
      id: 'cc-1', on: '2026-09-03', date: '3 Sep 2026', dateShort: '3 Sep', surface: 'rivals', what: 'Rival added',
      said: 'Poler was added to the tracked set.', who: 'an operator', breaks: 'the standings and the attention panel',
      before: null, after: null, rowsAffected: null, reconstructed: false,
    },
    {
      id: 'cc-2', on: '2026-08-19', date: '19 Aug 2026', dateShort: '19 Aug', surface: 'subjects', what: 'Subjects named',
      said: 'Six subjects were named and confirmed.', who: 'a member of your workspace', breaks: 'nothing that had been read',
      before: null, after: null, rowsAffected: 6, reconstructed: false,
    },
  ],
  showing: null,
  affectsRecorded: true,
}

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
    // THE MIX IS REAL HERE (Block D wave 2), because the method table's
    // "Sources" row is computed from it: an empty map is a workspace whose
    // platform mix was never recorded, which is a different state from the
    // mock's "TikTok 38% · YouTube 29% · Instagram 21% · Reddit 12%" and was
    // the only one this fixture could draw.
    { audience: INDUSTRY_AUDIENCE, videos: 1388, comments: 11840, platformMix: { tiktok: 527, youtube: 403, instagram: 292, reddit: 166 }, dualMention: 41, excludedUndated: 0 },
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
  const overview = withSixSubjects(overviewFixture())
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
      searchPlan: SEARCH_PLAN,
      changeLog: CHANGE_LOG,
    }),
    ...over,
  }
}

/**
 * The same quarter, read in a month whose LEAD is a subject rather than a
 * theme — so page 3 claims the month's voices and page 4 declines them.
 *
 * WHY A SECOND STATE EXISTS AT ALL. `sentence.voices` are the supporting
 * insights of the month's lead object, so they are evidence for ONE thing.
 * Handed to both pages they made a printed artefact carry the same two quotes
 * on pages 2, 3 and 4, and put a theme's evidence under a subject heading.
 * Each page now claims them only where the lead is its own kind, and a fixture
 * has to show both sides of that or only one arm is ever drawn.
 */
export function subjectLeadFixture(): QuarterlyData {
  const overview = withSixSubjects(overviewFixture())
  return composeQuarterly({
    overview: {
      ...overview,
      bar: { ...overview.bar, readings: 8 },
      sentence: {
        ...overview.sentence,
        lead: { ...overview.sentence.lead!, objectKind: 'subject', objectId: 's1', objectLabel: 'Durability' },
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
    quiet: QUIET,
    searchPlan: SEARCH_PLAN,
    changeLog: CHANGE_LOG,
  })
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
  const overview = withSixSubjects(overviewFixture())
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
    searchPlan: SEARCH_PLAN,
    changeLog: CHANGE_LOG,
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
  const overview = withSixSubjects(overviewFixture())
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
    searchPlan: SEARCH_PLAN,
    changeLog: CHANGE_LOG,
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
  const overview = withSixSubjects(overviewFixture())
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
 * A QUARTER WHOSE COMPARISONS MOSTLY COULD NOT BE DRAWN — the state that makes
 * the interpretation run past one sentence.
 *
 * WHY IT EXISTS. `qr.p2.whatitmeans` is the artboard's "What it means" card,
 * and `argument()` splits it off only where the slot wrote three sentences or
 * more. Every state above runs to exactly two, so the card rendered on none of
 * them and nothing would have failed if it were deleted — one of the thirteen
 * elements the brief listed as MISSING was, on all the evidence this branch
 * could produce, unshipped. This is not a hand-typed interpretation: the
 * window reads are small, `quarterChange` answers `too_little_data` /
 * `baseline_forming` over them, and `composeInterpretation`'s fallback then
 * composes its thin-comparison sentence as well as its opener — which is the
 * arm the card was written for, reached the way production reaches it.
 */
export function thinQuarterFixture(): QuarterlyData {
  const overview = withSixSubjects(overviewFixture())
  return composeQuarterly({
    overview: { ...overview, bar: { ...overview.bar, readings: 8 } },
    market: marketFixture(),
    competitive: competitiveFixture(),
    quarter: QUARTER,
    prior: PRIOR,
    readingAt: NOW,
    thisQuarter: windowRead(46, 320),
    lastQuarter: windowRead(41, 288),
    subjectsNow: subjectWindow(46, 0.22),
    subjectsBefore: subjectWindow(41, 0.18),
    checks: checksRan,
    record: record(13),
    quiet: QUIET,
    searchPlan: SEARCH_PLAN,
    changeLog: CHANGE_LOG,
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
    version: QUARTERLY_SNAPSHOT_VERSION,
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
