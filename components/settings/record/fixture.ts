import type { ConfigChange } from '@/lib/config-log'
import { howSoundLine, recordRows, type RecordInputs, type RecordRow } from '@/lib/reading/record'
import type { DenominatorPoint } from '@/lib/reading/series'
import type { UpdateInput } from '@/lib/readiness/types'
import { changeLogMeta, changeNote, readChangeLog, type ChangeLogView } from '@/lib/settings/change-log'
import { deliveryRecord, deliveryStats, type DeliveryRecord, type DeliveryStat } from '@/lib/settings/delivery'
import { readingsRecord, type ReadingsRecord } from '@/lib/settings/readings'
import type { KeptRate, RejectRow } from '@/lib/settings/reject-log'
import { gateSummary, gateTotalsFrom, sampleNote } from '@/lib/settings/reject-log'
import { saveState, type SaveState } from '@/lib/settings/save-state'

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

export function changeMetaFixture(): string {
  return changeLogMeta(changeLogFixture(), { now: '2026-09-28T09:00:00.000Z' })
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

export function gateBasisFixture(): string | null {
  return sampleNote(1000, 3820)
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
  return recordRows(recordInputsFixture(), {
    trailingMedian: readings.trailingMedian,
    changeNote: changeNote(changeLogFixture(), { from: '2026-09-01', to: '2026-09-28' }),
    belowFloor: floor
      ? { label: floor.label, who: floor.who, videos: floor.videos, floor: readings.floor, more: readings.belowFloor.length - 1 }
      : null,
  })
}

export function freshCoverageRowsFixture(): RecordRow[] {
  return recordRows(freshRecordInputsFixture())
}

export function oneLineFixture(): string {
  return `${readingsFixture().counter} · ${howSoundLine(recordInputsFixture())}`
}

export function saveStateFixture(): SaveState {
  return saveState({
    lastChange: {
      changed_at: '2026-09-03T11:02:00.000Z',
      affects_audiences: ['competitor:Poler'],
      affects_months: '[2026-09-01,2026-10-01)',
      source: 'logged',
    },
    affectsRecorded: true,
  })
}

/** M1 unapplied: the two columns cannot be read, so the "Broke" half is absent
 *  rather than empty. */
export function unrecordedSaveStateFixture(): SaveState {
  return saveState({
    lastChange: { changed_at: '2026-09-03T11:02:00.000Z', affects_audiences: null, affects_months: null, source: 'logged' },
    affectsRecorded: false,
  })
}
