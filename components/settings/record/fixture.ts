import type { ConfigChange } from '@/lib/config-log'
import { howSoundLine, recordRows, type RecordInputs, type RecordRow } from '@/lib/reading/record'
import type { DenominatorPoint } from '@/lib/reading/series'
import type { UpdateInput } from '@/lib/readiness/types'
import { changeNote, readChangeLog, type ChangeLogView } from '@/lib/settings/change-log'
import { deliveryRecord, deliveryStats, type DeliveryRecord, type DeliveryStat } from '@/lib/settings/delivery'
import { readingsRecord, type ReadingsRecord } from '@/lib/settings/readings'
import type { KeptRate, RejectRow } from '@/lib/settings/reject-log'
import { gateSummary, gateTotalsFrom, sampleHead } from '@/lib/settings/reject-log'
import { changesFromLog, comparabilityOf, type PairRow } from '@/lib/reading/comparability'
import { scheduledUpdateAfter } from '@/lib/reading/reading-month'
import { buildChangeBlock, compareRules } from '@/lib/pages/overview-market/change'
import { ledgerLines, recordView, type ReachRow } from '@/lib/settings/what-we-changed'
import { pairJudge, pairOn } from '@/lib/reading/pairs'

/**
 * The fixture behind the record page's blocks (block E wave 2).
 *
 * TWO STATES, AND THE SECOND ONE IS WHAT PRODUCTION LOOKS LIKE TODAY. The
 * populated arm is a workspace six months in with the month tables applied, the
 * change log written and the gate's record open. The degraded arm is a fresh
 * database: no `month_denominators`, no `config_changes`, no `gate_appeals` —
 * three different absences, each with its own sentence, and the page has to
 * render both without inventing a zero anywhere.
 *
 * EVERY FIGURE GOES THROUGH THE REAL COMPOSER. Nothing here hand-writes a
 * rendered string: the updates are `UpdateInput` rows and `deliveryRecord`
 * counts them, the denominators are `DenominatorPoint` rows and
 * `readingsRecord` reads them, the changes are `ConfigChange` rows and
 * `readChangeLog` views them. A fixture of pre-composed sentences would test
 * the renderer against itself.
 */

const CLIENT = '00000000-0000-4000-8000-00000000beef'

/** Six months of updates, weekly from the first, with one that failed and one
 *  five-week hole in May — the artboard's "longest gap 5 weeks, in May". */
export function updatesFixture(): UpdateInput[] {
  const days = [
    '2026-04-06', '2026-04-13', '2026-04-20',
    // The hole: 20 April to 25 May is 35 days — the artboard's "longest gap 5
    // weeks, in May", and the month the caption names is the one the gap ENDED
    // in.
    '2026-05-25',
    '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29',
    '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
    '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
    '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27',
  ]
  return days
    .map((d, i) => ({
      id: `run-${i}`,
      // One failure, in June: an update that failed still happened and is still
      // in the record, and the pill row marks it rather than dropping it.
      status: d === '2026-06-15' ? 'failed' : 'completed',
      startedAt: `${d}T04:00:00.000Z`,
      completedAt: `${d}T05:00:00.000Z`,
      scheduledFor: `${d}T04:00:00.000Z`,
      stalled: false,
    }))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}

/** The denominator history: three back-read months before the first update,
 *  then the gathered era, with the client's own audience under the floor in
 *  the first of them. */
export function denominatorsFixture(): DenominatorPoint[] {
  const rows: DenominatorPoint[] = []
  const months: [string, number, number][] = [
    // month, category videos, the client's own
    ['2026-01-01', 380, 44],
    ['2026-02-01', 402, 51],
    ['2026-03-01', 418, 60],
    ['2026-04-01', 2181, 22],
    ['2026-05-01', 2240, 130],
    ['2026-06-01', 2262, 141],
    ['2026-07-01', 2205, 152],
    ['2026-08-01', 2240, 160],
    ['2026-09-01', 2189, 170],
  ]
  for (const [month, category, own] of months) {
    const backRead = month < '2026-04-01'
    const common = {
      month,
      status: month < '2026-08-01' ? ('frozen' as const) : ('filling' as const),
      origin: backRead ? ('back_read' as const) : ('live' as const),
      read_at: '2026-09-28T09:00:00.000Z',
      run_id: 'run-21',
    }
    rows.push({ ...common, audience: 'industry-other', videos: category, comments: category * 5 })
    rows.push({ ...common, audience: 'client', videos: own, comments: own * 6 })
  }
  return rows
}

export function deliveryFixture(): DeliveryRecord {
  return deliveryRecord({ updates: updatesFixture(), slotsRecorded: true })
}

export function statsFixture(): DeliveryStat[] {
  return deliveryStats(deliveryFixture(), updatesFixture())
}

export function readingsFixture(): ReadingsRecord {
  const updatesByMonth: Record<string, number> = {}
  for (const u of updatesFixture()) {
    if (u.status !== 'completed' && u.status !== 'partial') continue
    const m = `${u.startedAt.slice(0, 7)}-01`
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
  }
  return readingsRecord({
    denominators: denominatorsFixture(),
    substrate: 'seeded',
    updatesByMonth,
    firstRunMonth: '2026-04-01',
    month: '2026-09-01',
  })
}

/** The fresh-database arm: the code is there and the tables are not. */
export function noReadingsFixture(): ReadingsRecord {
  return readingsRecord({
    denominators: [],
    substrate: 'missing',
    updatesByMonth: {},
    firstRunMonth: null,
    month: '2026-09-01',
  })
}

const change = (over: Partial<ConfigChange>): ConfigChange => ({
  id: 'c0',
  client_id: CLIENT,
  changed_at: '2026-09-03T11:02:00.000Z',
  surface: 'rivals',
  field: 'competitor_names',
  before: ['Freitag'],
  after: ['Freitag', 'Poler'],
  actor_kind: 'user',
  actor_user_id: 'u1',
  actor_label: null,
  run_id: null,
  source: 'logged',
  rows_affected: 1,
  note: 'Poler added as a rival.',
  affects_audiences: ['competitor:Poler'],
  affects_months: '[2026-09-01,2026-10-01)',
  ...over,
})

export function changeRowsFixture(): ConfigChange[] {
  return [
    change({}),
    change({
      id: 'c1', changed_at: '2026-08-19T08:30:00.000Z', surface: 'subjects', field: 'subjects',
      before: [], after: ['fit', 'comfort', 'delivery', 'price', 'service', 'sizing'],
      note: 'Six subjects named.', affects_audiences: ['client'], affects_months: '[2026-08-01,2026-09-01)',
    }),
    change({
      id: 'c2', changed_at: '2026-08-11T14:20:00.000Z', surface: 'terms', field: 'brand_keywords',
      before: ['sealand'], after: ['sealand', 'recycled sails'],
      note: 'Search term “recycled sails” added.', affects_audiences: ['client'], affects_months: null,
    }),
    change({
      id: 'c3', changed_at: '2026-04-06T06:00:00.000Z', surface: 'other', field: null,
      before: null, after: null, actor_kind: 'operator', actor_user_id: null,
      note: 'Tracking started.', affects_audiences: null, affects_months: null,
    }),
    change({
      id: 'c4', changed_at: '2026-03-02T06:00:00.000Z', surface: 'terms', field: 'brand_keywords',
      before: null, after: ['sealand'], source: 'reconstructed', actor_kind: 'reconstructed',
      actor_user_id: null, note: 'A term was already in use by this date.',
      affects_audiences: null, affects_months: null,
    }),
  ]
}

export function changeLogFixture(): ChangeLogView {
  return readChangeLog({
    rows: changeRowsFixture(),
    viewerUserId: 'u1',
    emails: { u1: 'sam@sealand.example' },
  })
}

export function rejectRowsFixture(): RejectRow[] {
  return [
    {
      runId: 'run-21', platform: 'youtube', videoId: 'v1', accountName: 'Coastal Kitchen',
      captionExcerpt: 'Sealand sardines recipe', keyword: 'sealand', reason: 'homonym — food',
      source: 'model', createdAt: '2026-09-27T05:10:00.000Z', appealed: false,
    },
    {
      runId: 'run-21', platform: 'tiktok', videoId: 'v2', accountName: 'wanderlines',
      captionExcerpt: 'Patagonia travel vlog, Torres del Paine', keyword: 'patagonia',
      reason: 'place not brand', source: 'model', createdAt: '2026-09-27T05:12:00.000Z', appealed: false,
    },
    {
      runId: 'run-21', platform: 'instagram', videoId: 'v3', accountName: 'andes.trails',
      captionExcerpt: 'Cotopaxi volcano hike', keyword: 'cotopaxi', reason: 'place not brand',
      source: 'model', createdAt: '2026-09-27T05:14:00.000Z', appealed: true,
    },
  ]
}

export function gateSummaryFixture(): string {
  return gateSummary(
    gateTotalsFrom({ found: 3820, kept: 2368, unjudged: 295, firstAt: '2026-09-09T04:00:00.000Z' }),
    '2026-04-06',
  )
}

export function lookedAtFixture(): string {
  return sampleHead(1000, 3820)
}

export function keptByTermFixture(): KeptRate[] {
  return [
    { key: 'sealand', label: 'sealand', found: 1840, kept: 1402, keptPct: 76.2, unjudged: 120 },
    { key: 'recycled sails', label: 'recycled sails', found: 620, kept: 388, keptPct: 62.6, unjudged: 40 },
    { key: 'patagonia', label: 'patagonia', found: 1360, kept: 578, keptPct: 42.5, unjudged: 135 },
  ]
}

export function keptByPlatformFixture(): KeptRate[] {
  return [
    { key: 'tiktok', label: 'TikTok', found: 1450, kept: 980, keptPct: 67.6, unjudged: 90 },
    { key: 'youtube', label: 'YouTube', found: 1320, kept: 812, keptPct: 61.5, unjudged: 110 },
  ]
}

/** The record the coverage grid is drawn from, populated. */
export function recordInputsFixture(): RecordInputs {
  return {
    window: { kind: 'month', from: '2026-09-01', to: '2026-09-28' },
    delivery: {
      delivered: 4,
      dates: ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'],
      longestGapDays: 7,
      failed: 0,
      basis: 'run_clock',
    },
    coverage: [
      {
        audience: 'client', videos: 170, comments: 1020,
        platformMix: { tiktok: 64, youtube: 51, instagram: 40, reddit: 15 },
        dualMention: 41, excludedUndated: 18,
      },
      {
        audience: 'industry-other', videos: 2189, comments: 10820,
        platformMix: { tiktok: 830, youtube: 640, instagram: 520, reddit: 199 },
        dualMention: 0, excludedUndated: 0,
      },
    ],
    readDepth: { analysed: 8640, speech: 6134, translated: 1901, onScreenText: 5530, unflagged: 212, basis: 'all_time_non_reddit' },
    language: { analysed: 8640, unknown: 940, english: 5620, notEnglish: 2080, basis: 'video_speech' },
    discard: {
      readable: true, judged: 3820, kept: 2368, setAside: 1452,
      recordedFrom: '2026-09-09', clearedByHeuristic: 295, gateOff: 0, failedOpen: 0, basis: 'run_clock',
    },
    instrument: { themesPerVideo: 2.4, themeAttachments: 20736, analysedVideos: 8640, runId: 'run-21' },
    changes: { inWindow: 1, loggedFrom: '2026-04-06', reconstructed: 1 },
    comparisonsRefused: null,
    refusals: [],
    readingAt: '2026-09-28T09:00:00.000Z',
    frozenAt: null,
  }
}

/** A fresh database: the month tables are not applied, the gate's record is not
 *  open, nothing about what we track has been written down. */
export function freshRecordInputsFixture(): RecordInputs {
  return {
    ...recordInputsFixture(),
    delivery: { delivered: 0, dates: [], longestGapDays: null, failed: 0, basis: 'run_clock' },
    coverage: null,
    readDepth: { analysed: 0, speech: 0, translated: 0, onScreenText: 0, unflagged: 0, basis: 'all_time_non_reddit' },
    language: { analysed: 0, unknown: 0, english: 0, notEnglish: 0, basis: 'video_speech' },
    discard: {
      readable: false, judged: 0, kept: 0, setAside: 0, recordedFrom: null,
      clearedByHeuristic: null, gateOff: null, failedOpen: null, basis: 'run_clock',
    },
    instrument: { themesPerVideo: null, themeAttachments: 0, analysedVideos: 0, runId: null },
    changes: { inWindow: 0, loggedFrom: null, reconstructed: 0 },
  }
}

export function coverageRowsFixture(): RecordRow[] {
  const readings = readingsFixture()
  const floor = readings.belowFloor[0]
  const inputs = recordInputsFixture()
  // COMPOSED THE WAY THE PAGE COMPOSES IT, both arguments included: the clause
  // is handed the count it will sit beside, and the remainder is off
  // `belowFloorTotal` and not the truncated list. A fixture that composes its
  // rows differently from the route is a review surface for a page nobody
  // ships.
  return recordRows(inputs, {
    trailingMedian: readings.trailingMedian,
    changeNote: changeNote(changeLogFixture(), { from: '2026-09-01', to: '2026-09-28' }, { counted: inputs.changes.inWindow }),
    belowFloor: floor
      ? { label: floor.label, who: floor.who, videos: floor.videos, floor: readings.floor, more: readings.belowFloorTotal - 1 }
      : null,
  })
}

export function freshCoverageRowsFixture(): RecordRow[] {
  return recordRows(freshRecordInputsFixture())
}

export function oneLineFixture(): string {
  return `${readingsFixture().counter} · ${howSoundLine(recordInputsFixture())}`
}

// ---- What we changed (market-first WP1.6) -------------------------------------------
//
// Sealand's September as the section reads it on 2 Oct, September ended and
// read to the 27 Sep update. The change log is GC F2's (staging's copy of
// production to 20 Sep): the 13 Sep additions and the 17 Sep script. The pair
// row is a measured August against September, staging's (Aug, Sep) row after
// the 26 Sep MF1 rehearsal: the strict search-outside counts 148 of 351 and
// 376 of 625 (category) and WP1.8's one figure, 356 of 654 (market), depth
// DR F39's medians 23 and 15. The 13 Sep reach is staging's config_change_reach
// row for that change (1bf52851, 26 Sep): 182 of September's 654 market videos
// (its category row, not printed here, is 181 of 625).
// The gate fix's reach is WP1.4's read-only staging dry run of 26 Sep
// (`exec/logs/wp1-4-confirm-dry-measure-comparability-staging.txt`): 65 of
// September's 654 market videos and 64 of its 625 category videos were let in
// without the relevance check, none of August's; it is a measure with no
// change row here (its `config_changes` row is WP1.4's to write), so the pair
// judges it by its surface. None of these is the production figure WP1.8
// measures; the section prints whatever the rows hold.

const WWC_ROWS: ConfigChange[] = [
  wwcChange({ id: 'wwc-0913', at: '2026-09-13T10:00:58.000Z', surface: 'terms', before: ['upcycled bag'], after: ['upcycled bag', 'handmade bag', 'sustainable fashion', 'travel gear'] }),
  wwcChange({ id: 'wwc-0917', at: '2026-09-17T16:02:56.000Z', surface: 'terms', before: ['upcycled bag'], after: ['upcycled bag', 'north face backpack', 'patagonia black hole', 'fombrand', 'made from waste', 'locally made south africa'] }),
]

// THE RECORD'S OTHER CHANGES (R-a, the grouped record): the 17 Sep rivals
// (GC F2), and WP1.4's three logged rows with their approved notes, as
// staging holds them after the 26 Sep rehearsal: the gate fix and attribution
// v3 at the stand-in fix instant 26 Sep 12:00Z (the production deploy instant
// is Heinrich's to give), and the capped update at the stand-in 20 Sep partial
// run. Their reach is staging's `config_change_reach` (the gate fix 65 of 654
// in September and none of 377 in August; attribution none in either).
const WWC_MORE_ROWS: ConfigChange[] = [
  { ...wwcChange({ id: 'wwc-rivals-0917', at: '2026-09-17T16:02:56.000Z', surface: 'rivals', before: ['Rareform'], after: ['Rareform', 'Freedom of Movement', 'Old School', 'Patagonia', 'The North Face'] }), field: 'competitor_names' },
  { ...wwcChange({ id: 'wwc-capped', at: '2026-09-20T04:18:34.000Z', surface: 'other', before: null, after: null }), field: 'gather_capped', run_id: 'run-20sep', note: 'An update gathered less than usual because a spending cap was reached.' },
  { ...wwcChange({ id: 'wwc-gate-fix', at: '2026-09-26T12:00:00.000Z', surface: 'gate_rule' as never, before: null, after: null }), field: 'relevance_gate', note: 'We corrected how we check that a video belongs to your market. Some videos found before the correction were let in without that check; they stay in the counts.' },
  // The attribution note as WP1.4 held it until 27 Sep (mf/wp1-4 993d31d0);
  // staging's rehearsal row still holds the older "We improved how we tell…"
  // text. Since 27 Sep the rows are written with no note: `recordFixture({
  // notes: false })` is the record production holds.
  { ...wwcChange({ id: 'wwc-attribution', at: '2026-09-26T12:00:00.000Z', surface: 'attribution' as never, before: null, after: null }), field: 'attribution_v3',
    note: 'We changed how we tell which brand a post is about.' },
]

function wwcChange(o: { id: string; at: string; surface: ConfigChange['surface']; before: unknown; after: unknown }): ConfigChange {
  return {
    id: o.id, client_id: CLIENT, changed_at: o.at, surface: o.surface, field: 'industry_keywords', before: o.before, after: o.after,
    actor_kind: 'script', actor_user_id: null, actor_label: null, run_id: null, source: 'trigger', rows_affected: null, note: null,
    affects_audiences: null, affects_months: null,
  }
}

export function whatWeChangedFixture(opts: { measured?: boolean } = {}) {
  const measured = opts.measured ?? true
  const changes = changesFromLog(WWC_ROWS)
  const row: PairRow | null = measured
    ? {
        prevMonth: '2026-08-01', month: '2026-09-01',
        // Staging's (Aug, Sep) row, 26 Sep (the MF1 rehearsal): the strict
        // counts (category) and WP1.8's one figure (market, the 26 Sep ruling).
        searchOutside: { prev: { k: 148, n: 351 }, curr: { k: 376, n: 625 } },
        addedOnly: { k: 356, n: 654 },
        codeChanges: [
          { changeId: 'wwc-gate-fix', surface: 'gate_rule', prev: { k: 0, n: 377 }, curr: { k: 65, n: 654 }, population: 'market' },
          { changeId: 'wwc-gate-fix', surface: 'gate_rule', prev: { k: 0, n: 351 }, curr: { k: 64, n: 625 }, population: 'category' },
        ],
        depth: { prevMedian: 23, currMedian: 15 }, gather: [], lateCapture: null,
        readThroughRun: 'run-27sep', methodVersion: 'mf1', computedAt: '2026-09-30T10:00:00.000Z',
      }
    : null
  const pair = comparabilityOf('2026-08-01', '2026-09-01', {
    row, changes, view: 'market',
    later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-27sep' },
  })
  const runFinish = new Map([['run-27sep', '2026-09-27T08:30:00.000Z']])
  const block = buildChangeBlock({
    prevMonth: '2026-08-01', month: '2026-09-01', hasPrev: true, pair, changes,
    pairRows: row ? [row] : [],
    nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
    asAt: '2026-09-27T08:30:00.000Z', paused: false, runFinish,
  })
  const reach: ReachRow[] = measured
    ? [{ changeId: 'wwc-0913', month: '2026-09-01', population: 'market', touched: 182, inMonth: 654, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' }]
    : []
  return {
    block,
    rules: compareRules(block.pair),
    lines: ledgerLines({ changes, rows: WWC_ROWS, reach, runFinish }),
    asAt: '2026-09-27T08:30:00.000Z',
  }
}

/**
 * The grouped record (R-a) on the same September, with the record's other
 * changes and a judge: `pairJudge` at 2 Oct over every change of ours except
 * the capped update (a gather flag, not a change of ours: the page's judge,
 * lib/reading/gather-flags.ts), the pair row above, and the 27 Sep update.
 */
export function recordFixture(opts: { measured?: boolean; judged?: boolean; notes?: boolean; attribution?: number } = {}) {
  const measured = opts.measured ?? true
  const base = whatWeChangedFixture({ measured })
  // `notes: false` is the record production holds: Heinrich, 27 Sep, "lets
  // just not add those notes", so our own changes' rows carry note NULL.
  const rows = [...WWC_ROWS, ...WWC_MORE_ROWS].map((r) => (opts.notes === false ? { ...r, note: null } : r))
  const changes = changesFromLog(rows)
  const judged = changesFromLog(rows.filter((r) => r.field !== 'gather_capped'))
  const row = base.block.pair?.row ?? null
  const runFinish = new Map([['run-27sep', '2026-09-27T08:30:00.000Z']])
  const reach: ReachRow[] = measured
    ? [
        { changeId: 'wwc-0913', month: '2026-09-01', population: 'market', touched: 182, inMonth: 654, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
        { changeId: 'wwc-gate-fix', month: '2026-08-01', population: 'market', touched: 0, inMonth: 377, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
        { changeId: 'wwc-gate-fix', month: '2026-09-01', population: 'market', touched: 65, inMonth: 654, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
        { changeId: 'wwc-gate-fix', month: '2026-08-01', population: 'category', touched: 0, inMonth: 351, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
        { changeId: 'wwc-gate-fix', month: '2026-09-01', population: 'category', touched: 64, inMonth: 625, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
        { changeId: 'wwc-attribution', month: '2026-08-01', population: 'market', touched: 0, inMonth: 377, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
        // Staging measures none (its stored videos predate attribution v3);
        // `attribution` is September's count where production measures one.
        { changeId: 'wwc-attribution', month: '2026-09-01', population: 'market', touched: opts.attribution ?? 0, inMonth: 654, readThroughRun: 'run-27sep', computedAt: '2026-09-30T10:00:00.000Z' },
      ]
    : []
  const lines = ledgerLines({ changes, rows, reach, runFinish })
  const judge = pairJudge({
    now: '2026-10-02T06:00:00.000Z',
    changes: judged,
    rows: row ? [row] : [],
    updates: [{ id: 'run-27sep', finishedAt: '2026-09-27T08:30:00.000Z' }],
    nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
  })
  return {
    ...base,
    lines,
    view: recordView({
      lines, changes, rows, pair: opts.judged === false ? null : pairOn(judge),
      readingMonth: '2026-09-01', prevMonth: '2026-08-01', block: base.block,
      // Sealand's updates in September (lib/test/reading-fixture.ts, DR F21):
      // the 20 Sep update first searched the 17 Sep additions.
      updates: ['2026-09-09T12:00:00.000Z', '2026-09-10T12:00:00.000Z', '2026-09-20T12:00:00.000Z', '2026-09-24T12:00:00.000Z', '2026-09-27T08:30:00.000Z'],
    }),
  }
}
