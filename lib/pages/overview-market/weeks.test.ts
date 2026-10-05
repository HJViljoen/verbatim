import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import { changesFromLog } from '../../reading/comparability'
import { pointRowOf, readRowOf } from '../../reading/week-keep'
import { keepWeekPoints, weekAgeCutoff, weeksToKeep, type WeekLineBlock } from '../../reading/week-line'
import {
  readFromStaging, SEALAND_NEXT_UPDATE, STAGING_AUG31_READINGS, STAGING_CHANGES, STAGING_LOOKS_ID, STAGING_RIVALS, STAGING_RUNS,
  STAGING_UPDATES, STAGING_WEEK_VOLUMES, standInSundayRuns,
} from '../../test/week-fixture'
import { WEEK_LINE, weekLineConfigFor } from '../../week-line-config'
import type { OurChange } from '../../reading/comparability'
import type { ChartRun } from '../../reading/week-line'
import { marketWeekRowOf, type MarketWeekRowRaw } from '../../reading/weeks'
import { homeWeeks } from '../home'
import { loadWeekVolumes } from '../week'
import {
  keptLineAsAt, loadKeptWeekLine, loadWeekStrip, WEEK_STRIP_TOO_FEW, WEEKS_EMPTY, weekBarsBlock, weekStripFor, weekVolumesBlock, weekVolumesEmpty,
} from './weeks'

// Week by week's builder (WP2.9), on staging's real weeks. On the 11 Oct
// clock the weeks after 20 Sep hold nothing on staging (it holds no data after
// that day), so they read "none gathered" here; production's will not.

const base = {
  rows: STAGING_WEEK_VOLUMES,
  rivalAudiences: STAGING_RIVALS,
  updates: STAGING_UPDATES,
  changes: changesFromLog(STAGING_CHANGES),
  nextUpdateAfter: SEALAND_NEXT_UPDATE,
}

describe('weekVolumesBlock', () => {
  it('reads September on 11 Oct: the weeks of 27 Jul to 5 Oct, our changes on their weeks, the line pending with due 18 Oct and 25 Oct', () => {
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-09-01' }, now: '2026-10-11T12:00:00.000Z', cfg: WEEK_LINE[SEALAND_CLIENT_ID] })
    expect(b.weeks.map((w) => w.week)).toHaveLength(11)
    expect(b.weeks.slice(2, 8).map((w) => w.videos)).toEqual([244, 226, 187, 229, 404, 318])
    expect([...new Set(b.rules.filter((r) => r.surface === 'terms').map((r) => r.date))]).toEqual(['2026-09-09', '2026-09-13', '2026-09-17'])
    expect(b.line).toEqual({
      state: 'pending', firstWeek: '2026-09-28', ageDays: 14,
      due: [{ week: '2026-09-28', date: '2026-10-18' }, { week: '2026-10-05', date: '2026-10-25' }],
    })
  })

  it('gives Össur, with no WEEK_LINE entry, no pending row', () => {
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-09-01' }, now: '2026-10-11T12:00:00.000Z', cfg: weekLineConfigFor(OSSUR_CLIENT_ID) })
    expect(b.line).toBeNull()
  })

  it('stays pending while print is false, even with kept points', () => {
    const b = weekVolumesBlock({
      ...base, reading: { month: '2026-10-01' }, now: '2026-10-26T12:00:00.000Z', cfg: WEEK_LINE[SEALAND_CLIENT_ID],
      line: { reads: [], points: [] },
    })
    expect(b.line && 'state' in b.line ? b.line.state : null).toBe('pending')
  })

  // The lead's rulings of 5 Oct: Your market and This week draw the weeks the
  // Dashboard draws, counted and cut the same way (`checkedRows`, the
  // pre-gather cut), so no page shows a week another cuts.
  describe('agrees with the Dashboard', () => {
    const raw = (week: string, videos: number, comments: number, unchecked = 0, uc?: number): MarketWeekRowRaw => ({
      week, audience: 'industry-other', videos, comments, comments_next_month: 0, under_5: 0, median_dated: 9, mean_dated: 18,
      older_videos: 0, unchecked,
      ...(uc === undefined ? {} : { unchecked_comments: uc, unchecked_comments_next_month: 0, unchecked_under_5: 0, unchecked_older_videos: 0 }),
    })
    const SEALAND_RUNS: ChartRun[] = [
      { id: 'e80e9347', status: 'partial', startedAt: '2026-09-24T15:54:51Z', finishedAt: '2026-09-24T16:16:13Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-24T15:54:51Z', errors: ['ocr: failed'] },
      { id: '03180a33', status: 'partial', startedAt: '2026-09-24T17:35:55Z', finishedAt: '2026-09-24T17:51:08Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-24T17:35:55Z', errors: ['ocr: failed'] },
      { id: 'f3646446', status: 'partial', startedAt: '2026-09-27T04:03:42Z', finishedAt: '2026-09-27T07:28:35Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-27T04:03:42Z', errors: ['transcript-backfill: Apify 408'] },
      { id: '393b95df', status: 'completed', startedAt: '2026-10-04T11:45:46Z', finishedAt: '2026-10-04T12:13:08Z', windowStart: '2026-09-27T04:03:42Z', windowEnd: '2026-10-04T04:01:17Z', errors: [] },
    ]
    const NOW = '2026-10-05T07:00:00Z'
    const updates = SEALAND_RUNS.map((r) => r.finishedAt!)
    const search: OurChange = { id: 's17', surface: 'terms', changedAt: '2026-09-17T16:02:56Z', note: null, affects: [] }
    const drawnBy = (rows: MarketWeekRowRaw[], changes: OurChange[], runs = SEALAND_RUNS) => {
      const block = weekVolumesBlock({ rows: rows.map(marketWeekRowOf), rivalAudiences: [], updates, changes, runs, reading: { month: '2026-09-01' }, now: NOW, cfg: null })
      const home = homeWeeks({ rows, rivalAudiences: [], changes, updates, runs, now: NOW })
      return {
        block: weekBarsBlock(block).weeks.map((w) => [w.week, w.videos, w.comments]),
        home: (home?.columns ?? []).filter((c) => c.videos != null).map((c) => [c.week, c.videos, c.comments]),
      }
    }

    it('Sealand, 5 Oct: the week of 28 Sep drawn with its unchecked video left out (265, 5,028) on both, and cut on both before the migration', () => {
      const after = drawnBy([raw('2026-09-21', 301, 4990, 0, 0), raw('2026-09-28', 266, 5029, 1, 1)], [search])
      expect(after.block).toEqual([['2026-09-28', 265, 5028]])
      expect(after.home).toEqual(after.block)
      const before = drawnBy([raw('2026-09-21', 301, 4990), raw('2026-09-28', 266, 5029, 1)], [search])
      expect(before.block).toEqual([])
      expect(before.home).toEqual([])
    })

    it('a pre-gather change in the 4 Oct run cuts neither page at the week that run gathered; the same change by hand cuts both', () => {
      const rows = [raw('2026-09-28', 177, 3217, 0, 0)]
      const probe: OurChange = { id: 'p4', surface: 'subreddits', changedAt: '2026-10-04T04:02:30Z', note: null, affects: [], preGatherRunId: '393b95df' }
      const kept = drawnBy(rows, [search, probe])
      expect(kept.block).toEqual([['2026-09-28', 177, 3217]])
      expect(kept.home).toEqual(kept.block)
      const { preGatherRunId: _r, ...byHand } = probe
      const cut = drawnBy(rows, [search, byHand])
      expect(cut.block).toEqual([])
      expect(cut.home).toEqual([])
    })
  })

  it('is empty when no week on the axis has a dated comment', () => {
    const b = weekVolumesBlock({ ...base, rows: [], reading: { month: '2026-09-01' }, now: '2026-09-20T12:00:00.000Z', cfg: null })
    expect(weekVolumesEmpty(b)).toBe(true)
    expect(weekVolumesEmpty(null)).toBe(true)
    expect(WEEKS_EMPTY).toBe('No week has comments yet.')
  })
})

// ---- The kept line's read (WP3.13 part B) ------------------------------------------------------
//
// HYPOTHETICAL rows: production's weeks from 28 Sep are not knowable yet, so
// the kept reads are staging's weeks of 7 and 14 Sep re-dated to 28 Sep and
// 5 Oct (their real depth, read through stand-in Sunday updates), and each
// week's points are staging's week of 31 Aug per audience, as MF4 returned
// them, re-dated (lib/test/week-fixture.ts).

const PROD_RUNS = standInSundayRuns(['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'])
const [, AUG31] = weeksToKeep({ runs: STAGING_RUNS, now: '2026-09-21T06:00:00.000Z', firstWeek: '2026-08-03' })
const AUG31_ROWS = keepWeekPoints({
  candidate: AUG31, runs: STAGING_RUNS, volumes: STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-08-31'),
  readings: STAGING_AUG31_READINGS, promptVersion: 'pass_a_v4.1', laneRule: 'min_comments:default=5,reddit=3',
  methodVersion: 'week_line_v1', computedAt: '2026-09-21T06:00:00.000Z',
}).rows
const keptRead = (stagingWeek: string, week: string, run: number) => readFromStaging(stagingWeek, {
  week, capturedBefore: weekAgeCutoff(week, 14), readThroughRun: '00000000-0000-4000-8000-00000000000' + run,
  readThroughAt: PROD_RUNS[run].finishedAt, unchecked: 0, computedAt: `${weekAgeCutoff(week, 14).slice(0, 10)}T09:00:00.000Z`,
})
const STORED_READS = [keptRead('2026-09-07', '2026-09-28', 3), keptRead('2026-09-14', '2026-10-05', 4)]
  .map((r) => JSON.parse(JSON.stringify(readRowOf(SEALAND_CLIENT_ID, r))))
const STORED_POINTS = ['2026-09-28', '2026-10-05']
  .flatMap((week) => AUG31_ROWS.map((p) => JSON.parse(JSON.stringify(pointRowOf(SEALAND_CLIENT_ID, { ...p, week })))))
const STAGING_SUBJECTS = [
  { id: STAGING_LOOKS_ID, name: 'Looks & style', status: 'active', calibrated_at: null, calibration_precision: null, calibration_n: null, calibration_judge_version: null },
]

/** A client that answers each table from fixed rows and records every read. */
function fakeClient(opts: { failReads?: boolean } = {}) {
  const calls: { table: string; filters: string[] }[] = []
  const answer = (table: string): { data: unknown[] | null; error: { message: string } | null } => {
    if (table === 'week_line_reads') return opts.failReads ? { data: null, error: { message: 'relation "public.week_line_reads" does not exist' } } : { data: STORED_READS, error: null }
    if (table === 'week_line_points') return { data: STORED_POINTS, error: null }
    if (table === 'subjects') return { data: STAGING_SUBJECTS, error: null }
    return { data: [], error: null }
  }
  const client = {
    from(table: string) {
      const call = { table, filters: [] as string[] }
      calls.push(call)
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => { call.filters.push(`${c}=${String(v)}`); return chain },
        in: (c: string, v: unknown[]) => { call.filters.push(`${c} in ${v.join(',')}`); return chain },
        order: () => chain,
        range: async (from: number) => {
          const a = answer(table)
          return from > 0 ? { data: [], error: null } : a
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(answer(table)).then(resolve),
      }
      return chain
    },
  } as unknown as SupabaseClient
  const tables = () => [...new Set(calls.map((c) => c.table))]
  return { client, calls, tables }
}

describe('loadKeptWeekLine', () => {
  const sealand = WEEK_LINE[SEALAND_CLIENT_ID]

  it('reads nothing for Össur, which gets no same-age row at all', async () => {
    const { client, calls } = fakeClient()
    expect(await loadKeptWeekLine(client, { clientId: OSSUR_CLIENT_ID, cfg: weekLineConfigFor(OSSUR_CLIENT_ID), rivalAudiences: [] })).toBeNull()
    expect(calls).toEqual([])
  })

  it('while print is false, reads the kept weeks only, never a point, and the line stays pending with its due dates', async () => {
    expect(sealand.print).toBe(false)
    const { client, tables, calls } = fakeClient()
    const kept = await loadKeptWeekLine(client, { clientId: SEALAND_CLIENT_ID, cfg: sealand, rivalAudiences: STAGING_RIVALS })
    expect(kept).toEqual({ weeks: ['2026-09-28', '2026-10-05'], line: null })
    expect(tables()).toEqual(['week_line_reads'])
    expect(calls[0].filters).toEqual([`client_id=${SEALAND_CLIENT_ID}`, 'method_version=week_line_v1', 'age_days=14'])
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-10-01' }, now: '2026-10-27T12:00:00.000Z', cfg: sealand, line: kept!.line })
    expect(b.line).toMatchObject({ state: 'pending', firstWeek: '2026-09-28', ageDays: 14 })
    expect(b.line && 'due' in b.line ? b.line.due.map((d) => d.date) : []).toEqual(['2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15'])
  })

  it('once print is true, builds the WeekLineBlock from week_line_points, naming subjects from the subjects table', async () => {
    const printed = { ...sealand, print: true }
    const { client, tables, calls } = fakeClient()
    const kept = await loadKeptWeekLine(client, { clientId: SEALAND_CLIENT_ID, cfg: printed, rivalAudiences: STAGING_RIVALS })
    expect(tables()).toEqual(['week_line_reads', 'week_line_points', 'subjects'])
    expect(calls[1].filters).toContain('week in 2026-09-28,2026-10-05')
    expect(kept?.line?.reads.map((r) => [r.week, r.videos, r.medianDated, r.computedAt])).toEqual([
      ['2026-09-28', 404, 10, '2026-10-19T09:00:00.000Z'],
      ['2026-10-05', 318, 9.5, '2026-10-26T09:00:00.000Z'],
    ])
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-10-01' }, now: '2026-10-27T12:00:00.000Z', cfg: printed, line: kept!.line })
    const line = b.line as WeekLineBlock
    expect('state' in line).toBe(false)
    // The six kinds, then Looks & style (22 of 229 each week, over 10 in both);
    // the other subjects' points have no name in the subjects read and are not drawn.
    expect(line.rows.map((r) => r.label)).toEqual([
      'Praising it', 'Asking how it works', 'Ready to buy', 'Hitting a problem', 'Asking for something', 'Pushing back', 'Looks & style',
    ])
    // Praise, pooled over the market: 27 + 51 + 53 of 91 + 80 + 58, each week.
    expect(line.rows[0].points.map((p) => [p.week, p.k, p.n])).toEqual([['2026-09-28', 131, 229], ['2026-10-05', 131, 229]])
    expect(line.rows[0].pairs[0]).toMatchObject({ mode: 'comparable', verdict: { state: 'no_clear_change' } })
    expect(line.rows[6]).toMatchObject({ calibration: 'provisional', pairs: [{ verdict: null }] })
    expect(line.reads?.map((r) => [r.week, r.readWith])).toEqual([['2026-09-28', '2026-10-18'], ['2026-10-05', '2026-10-25']])
  })

  it('with the names in hand reads no subjects, and a provisional subject that clears 10 gets points and no verdict', async () => {
    const printed = { ...sealand, print: true }
    const { client, tables } = fakeClient()
    const kept = await loadKeptWeekLine(client, {
      clientId: SEALAND_CLIENT_ID, cfg: printed, rivalAudiences: STAGING_RIVALS,
      objects: [{ objectKind: 'subject', objectId: STAGING_LOOKS_ID, label: 'Looks & style', calibration: 'provisional' }],
    })
    expect(tables()).toEqual(['week_line_reads', 'week_line_points'])
    const b = weekVolumesBlock({ ...base, reading: { month: '2026-10-01' }, now: '2026-10-27T12:00:00.000Z', cfg: printed, line: kept!.line })
    const looks = (b.line as WeekLineBlock).rows.find((r) => r.objectId === STAGING_LOOKS_ID)
    expect(looks?.points.map((p) => p.k)).toEqual([22, 22])
    expect(looks?.pairs[0].verdict).toBeNull()
  })

  it('says nothing of kept weeks it cannot read (MF4 not applied)', async () => {
    const { client } = fakeClient({ failReads: true })
    expect(await loadKeptWeekLine(client, { clientId: SEALAND_CLIENT_ID, cfg: sealand, rivalAudiences: STAGING_RIVALS })).toBeNull()
  })
})

// ---- The printed line on the pages (WP3.13 display, deploy 3w) ---------------------------------

describe('the printed line as at the page\'s clock', () => {
  const printed = { ...WEEK_LINE[SEALAND_CLIENT_ID], print: true }
  const PROD_UPDATES = PROD_RUNS.map((r) => r.finishedAt!)

  it('keeps every week not read yet "due" with its update on Tue 27 Oct', async () => {
    const { client } = fakeClient()
    const kept = await loadKeptWeekLine(client, { clientId: SEALAND_CLIENT_ID, cfg: printed, rivalAudiences: STAGING_RIVALS })
    const b = weekVolumesBlock({ ...base, updates: PROD_UPDATES, reading: { month: '2026-10-01' }, now: '2026-10-27T09:00:00.000Z', cfg: printed, line: kept!.line })
    expect((b.line as WeekLineBlock).due).toEqual([
      { week: '2026-10-12', date: '2026-11-01' }, { week: '2026-10-19', date: '2026-11-08' }, { week: '2026-10-26', date: '2026-11-15' },
    ])
  })

  it('drops a due date that has passed: by Wed 4 Nov the week of 12 Oct was kept or it was not, never still "due 1 Nov"', async () => {
    const { client } = fakeClient()
    const kept = await loadKeptWeekLine(client, { clientId: SEALAND_CLIENT_ID, cfg: printed, rivalAudiences: STAGING_RIVALS })
    // Tue 3 Nov: two days' grace after the 1 Nov update (the capture is Monday's).
    const tue = weekVolumesBlock({ ...base, updates: PROD_UPDATES, reading: { month: '2026-10-01' }, now: '2026-11-03T09:00:00.000Z', cfg: printed, line: kept!.line })
    expect((tue.line as WeekLineBlock).due.map((d) => d.week)).toContain('2026-10-12')
    const wed = weekVolumesBlock({ ...base, updates: PROD_UPDATES, reading: { month: '2026-10-01' }, now: '2026-11-04T09:00:00.000Z', cfg: printed, line: kept!.line })
    expect((wed.line as WeekLineBlock).due.map((d) => [d.week, d.date])).toEqual([
      ['2026-10-19', '2026-11-08'], ['2026-10-26', '2026-11-15'], ['2026-11-02', '2026-11-22'],
    ])
    expect(keptLineAsAt({ ...(wed.line as WeekLineBlock), due: [{ week: '2026-10-12', date: '2026-11-01' }] }, '2026-11-01T08:33:00.000Z', '2026-11-04T09:00:00.000Z').due).toEqual([])
  })
})

/** The fake client, answering the MF4 volumes rpc too (staging's weeks). */
function fakeClientWithVolumes(opts: { failReads?: boolean } = {}) {
  const f = fakeClient(opts)
  const rpcs: string[] = []
  const client = Object.assign(Object.create(f.client as object), {
    rpc: async (name: string) => {
      rpcs.push(name)
      return { data: STAGING_WEEK_VOLUMES.map((r) => ({ week: r.week, audience: r.audience, videos: r.videos, comments: r.comments, comments_next_month: r.commentsNextMonth, under_5: r.under5, median_dated: r.medianDated, mean_dated: r.meanDated, older_videos: r.olderVideos, unchecked: r.unchecked })), error: null }
    },
  }) as SupabaseClient
  return { ...f, client, rpcs }
}

describe('loadWeekVolumes: Your market asks for the kept line; This week does not', () => {
  const input = (client: SupabaseClient, keptLine?: boolean) => ({
    client, clientId: SEALAND_CLIENT_ID, reading: { month: '2026-10-01' }, now: '2026-10-27T09:00:00.000Z',
    updates: PROD_RUNS.map((r) => r.finishedAt!), rivalAudiences: STAGING_RIVALS, changeRows: STAGING_CHANGES,
    schedule: { report_period: 'weekly', report_day: 'sunday' } as never, ...(keptLine ? { keptLine } : {}),
  })

  it('while print is false (as now) reads no point, and the line stays pending', async () => {
    const { client, tables } = fakeClientWithVolumes()
    const b = await loadWeekVolumes(input(client, true))
    expect(b?.line && 'state' in b.line ? b.line.state : null).toBe('pending')
    expect(tables()).not.toContain('week_line_points')
  })

  it('once print is true, Your market reads the kept line and draws it; This week does not read it', async () => {
    const original = WEEK_LINE[SEALAND_CLIENT_ID].print
    ;(WEEK_LINE[SEALAND_CLIENT_ID] as { print: boolean }).print = true
    try {
      const front = fakeClientWithVolumes()
      const b = await loadWeekVolumes(input(front.client, true))
      expect(front.tables()).toEqual(expect.arrayContaining(['week_line_reads', 'week_line_points']))
      // Its rows are the six kinds (WP3.13), so no subject is read for a name.
      expect(front.tables()).not.toContain('subjects')
      const line = b?.line as WeekLineBlock
      expect('state' in line).toBe(false)
      expect(line.rows.map((r) => r.objectKind)).toEqual(Array(6).fill('kind'))
      expect(line.rows[0].points.map((p) => p.week)).toEqual(['2026-09-28', '2026-10-05'])
      const week = fakeClientWithVolumes()
      const w = await loadWeekVolumes(input(week.client))
      expect(week.tables()).not.toContain('week_line_points')
      expect(w?.line && 'state' in w.line).toBe(true)
    } finally {
      ;(WEEK_LINE[SEALAND_CLIENT_ID] as { print: boolean }).print = original
    }
  })
})

describe('loadWeekStrip: Subjects\' week strip (§2.3 S6)', () => {
  const printed = { ...WEEK_LINE[SEALAND_CLIENT_ID], print: true }
  const LOOKS = { objectKind: 'subject' as const, objectId: STAGING_LOOKS_ID, label: 'Looks & style', calibration: 'provisional' as const }
  const input = (cfg: typeof printed | null) => ({
    clientId: SEALAND_CLIENT_ID, cfg, reading: { month: '2026-10-01' }, now: '2026-10-27T09:00:00.000Z', asAt: '2026-10-25T08:33:00.000Z',
    rivalAudiences: STAGING_RIVALS, changes: changesFromLog(STAGING_CHANGES), objects: [LOOKS], nextUpdateAfter: SEALAND_NEXT_UPDATE,
  })

  it('reads nothing and draws no strip for Össur, or while the line is kept and not shown (deploy 3)', async () => {
    const { client, calls } = fakeClient()
    expect(await loadWeekStrip(client, input(null))).toBeNull()
    expect(await loadWeekStrip(client, input(WEEK_LINE[SEALAND_CLIENT_ID]))).toBeNull()
    expect(calls).toEqual([])
  })

  it('once printed, reads the kept line with the names the page holds, on the page\'s own week axis', async () => {
    const { client, tables } = fakeClient()
    const strip = await loadWeekStrip(client, input(printed))
    expect(tables()).toEqual(['week_line_reads', 'week_line_points'])
    expect(strip?.axis).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    const looks = weekStripFor(strip, STAGING_LOOKS_ID)
    expect(looks?.line.rows.map((r) => [r.label, r.calibration, r.points.map((p) => p.k)])).toEqual([['Looks & style', 'provisional', [22, 22]]])
    expect(looks?.line.rows[0].pairs[0].verdict).toBeNull()
    expect(looks?.line.due.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
    // Another subject has no row: Subjects prints the one line.
    expect(weekStripFor(strip, 'cf7bd22c-9a38-47c6-80dd-e8d3c5b3852d')?.line.rows).toEqual([])
    expect(WEEK_STRIP_TOO_FEW).toBe('Too few videos a week to read.')
    expect(weekStripFor(null, STAGING_LOOKS_ID)).toBeNull()
  })

  it('draws no strip where the kept tables cannot be read', async () => {
    const { client } = fakeClient({ failReads: true })
    expect(await loadWeekStrip(client, input(printed))).toBeNull()
  })
})
