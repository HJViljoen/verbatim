import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import {
  STAGING_AUG31_READINGS, STAGING_RUNS, STAGING_WEEK_VOLUMES, standInSundayRuns,
} from '../test/week-fixture'
import { WEEK_LINE, WEEK_LINE_METHOD_V1 } from '../week-line-config'
import {
  captureWeekPoints, insertKeptWeeks, keepReportLines, keptProblems, pointOfStored, pointRowOf, readOfStored, readRowOf,
  TABLE_WEEK_LINE_POINTS, TABLE_WEEK_LINE_READS, WEEK_CAPTURE_READS_MAX, weeksReachingAgeWith,
  type KeepStore, type WeekCaptureReader,
} from './week-keep'
import { weeksToKeep, type WeekReadingRow } from './week-line'
import type { MarketWeekRow } from './weeks'

// The keep store (WP3.13 part B), on staging's real rows (lib/test/week-fixture.ts).
// Production's weeks from 28 Sep are not knowable yet: where a test needs them
// it RE-DATES staging's week of 31 Aug (HYPOTHETICAL, as week-line.test.ts
// does) and runs the production schedule's STAND-IN Sunday updates.

const LANE = 'min_comments:default=5,reddit=3'
const PROMPT = 'pass_a_v4.1'
const SUNDAYS = ['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08']
const PROD_RUNS = standInSundayRuns(SUNDAYS)
const AUG31_VOLUMES = STAGING_WEEK_VOLUMES.filter((r) => r.week === '2026-08-31')

/** A reader over fixed rows that counts its calls, one per read. `redate`
 *  serves staging's week of 31 Aug as whichever week is asked (HYPOTHETICAL). */
function fixtureReader(opts: { runs: typeof PROD_RUNS | typeof STAGING_RUNS; redate?: boolean }) {
  const calls: string[] = []
  const reader: WeekCaptureReader = {
    async runs() {
      calls.push('runs')
      return [...opts.runs]
    },
    async volumes(q) {
      calls.push(`volumes ${q.from} ${q.to} ${q.capturedBefore}`)
      if (!opts.redate) return AUG31_VOLUMES.filter((r) => r.week >= q.from && r.week < q.to)
      const weeks: string[] = []
      for (let w = Date.parse(`${q.from}T00:00:00Z`); w < Date.parse(`${q.to}T00:00:00Z`); w += 7 * 86_400_000) weeks.push(new Date(w).toISOString().slice(0, 10))
      return weeks.flatMap((week): MarketWeekRow[] => AUG31_VOLUMES.map((r) => ({ ...r, week })))
    },
    async readings(q) {
      calls.push(`readings ${q.week} ${q.ageDays}`)
      if (!opts.redate && q.week !== '2026-08-31') throw new Error(`no staging readings for ${q.week}`)
      return [...STAGING_AUG31_READINGS] as WeekReadingRow[]
    },
    async promptVersion(at) {
      calls.push(`prompt ${at}`)
      return PROMPT
    },
  }
  return { reader, calls }
}

describe('captureWeekPoints (the one capture)', () => {
  it("keeps staging's week of 31 Aug at 14 days at the 20 Sep update in four reads, as the script's --keep did", async () => {
    const { reader, calls } = fixtureReader({ runs: STAGING_RUNS })
    const got = await captureWeekPoints(reader, {
      now: '2026-09-21T06:00:00.000Z', firstWeek: '2026-08-03', methodVersion: WEEK_LINE_METHOD_V1, laneRule: LANE, ages: [14],
    })
    expect(calls).toEqual([
      'runs', 'volumes 2026-08-31 2026-09-07 2026-09-21T00:00:00Z', 'prompt 2026-09-20T08:33:47.358Z', 'readings 2026-08-31 14',
    ])
    expect(got.readsUsed).toBe(4)
    expect(got.latestUpdate).toEqual({ id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', finishedAt: '2026-09-20T08:33:47.358Z' })
    expect(got.reads).toHaveLength(1)
    expect(got.reads[0]).toMatchObject({
      week: '2026-08-31', ageDays: 14, readThroughRun: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', videos: 229, comments: 3275,
      medianDated: 6, bands: [91, 80, 58], unchecked: 4, olderVideos: 89, promptVersion: PROMPT, laneRule: LANE,
      computedAt: '2026-09-21T06:00:00.000Z',
    })
    expect(got.rows).toHaveLength(128)
    expect(got.volumes).toEqual(AUG31_VOLUMES)
  })

  it('spends at most five reads: on Mon 26 Oct the week of 28 Sep at 21 days and 5 Oct at 14 share one cut (stand-ins, HYPOTHETICAL rows)', async () => {
    const { reader, calls } = fixtureReader({ runs: PROD_RUNS, redate: true })
    const got = await captureWeekPoints(reader, {
      now: '2026-10-26T09:00:00.000Z', firstWeek: WEEK_LINE[SEALAND_CLIENT_ID].firstWeek, methodVersion: WEEK_LINE_METHOD_V1, laneRule: LANE,
    })
    expect(got.candidates.map((c) => `${c.week}@${c.ageDays}`)).toEqual(['2026-09-28@21', '2026-10-05@14'])
    expect(calls.filter((c) => c.startsWith('volumes'))).toEqual(['volumes 2026-09-28 2026-10-12 2026-10-26T00:00:00Z'])
    expect(got.readsUsed).toBe(WEEK_CAPTURE_READS_MAX)
    expect(calls).toHaveLength(WEEK_CAPTURE_READS_MAX)
    expect(got.reads.map((r) => [r.week, r.ageDays, r.readThroughRun, r.runsInWeek, r.runsAfter])).toEqual([
      ['2026-09-28', 21, 'stand-in-2026-10-25', 1, [1, 1]],
      ['2026-10-05', 14, 'stand-in-2026-10-25', 1, [1, 1]],
    ])
  })

  it('reads nothing more for a week already held, and only the runs when no week reached its age', async () => {
    const held = fixtureReader({ runs: PROD_RUNS, redate: true })
    const got = await captureWeekPoints(held.reader, {
      now: '2026-10-26T09:00:00.000Z', firstWeek: '2026-09-28', methodVersion: WEEK_LINE_METHOD_V1, laneRule: LANE,
      held: new Set(['2026-09-28|21']),
    })
    expect(got.reads.map((r) => `${r.week}@${r.ageDays}`)).toEqual(['2026-10-05@14'])
    expect(got.readsUsed).toBe(4)
    const early = fixtureReader({ runs: PROD_RUNS, redate: true })
    const none = await captureWeekPoints(early.reader, { now: '2026-10-12T09:00:00.000Z', firstWeek: '2026-09-28', methodVersion: WEEK_LINE_METHOD_V1, laneRule: LANE })
    expect(none.reads).toEqual([])
    expect(none.note).toBe('No week reached its age at the latest update.')
    expect(early.calls).toEqual(['runs'])
  })

  it("inside the 25 Oct update (deploy 4's step) keeps the same weeks the Monday script keeps, with that update as the age run", async () => {
    const running = PROD_RUNS[4]
    const before = PROD_RUNS.filter((r) => r.finishedAt! < running.startedAt!)
    const { reader, calls } = fixtureReader({ runs: PROD_RUNS, redate: true })
    const inRun = await captureWeekPoints(reader, {
      now: '2026-10-25T08:00:00.000Z', firstWeek: '2026-09-28', methodVersion: WEEK_LINE_METHOD_V1, laneRule: LANE,
      update: { id: running.id, startedAt: running.startedAt ?? null }, runs: [...before, { ...running, status: 'gathering', finishedAt: null }],
    })
    // The runs were the caller's: four reads, not five.
    expect(calls[0]).toMatch(/^volumes/)
    expect(inRun.readsUsed).toBe(4)
    const monday = weeksToKeep({ runs: PROD_RUNS, now: '2026-10-26T09:00:00.000Z', firstWeek: '2026-09-28' })
    expect(inRun.candidates.map((c) => [c.week, c.ageDays, c.cutoff])).toEqual(monday.map((c) => [c.week, c.ageDays, c.cutoff]))
    expect(inRun.reads.map((r) => [r.readThroughRun, r.readThroughAt, r.runsInWeek, r.runsAfter, r.lateRun, r.offCadence])).toEqual([
      [running.id, '2026-10-25T08:00:00.000Z', 1, [1, 1], false, 0],
      [running.id, '2026-10-25T08:00:00.000Z', 1, [1, 1], false, 0],
    ])
  })

  it('an update brings to its age only the weeks whose cutoff is the Monday after it, never the week of 21 Sep', () => {
    const at = (day: string) => weeksReachingAgeWith({
      update: { id: 'u', status: 'completed', startedAt: null, finishedAt: `${day}T08:00:00.000Z` }, firstWeek: '2026-09-14',
    }).map((c) => `${c.week}@${c.ageDays}`)
    expect(at('2026-10-04')).toEqual(['2026-09-14@14'])
    expect(at('2026-10-11')).toEqual(['2026-09-14@21'])
    expect(at('2026-10-18')).toEqual(['2026-09-28@14'])
    expect(at('2026-10-25')).toEqual(['2026-09-28@21', '2026-10-05@14'])
  })
})

// ---- The stored rows ------------------------------------------------------------------------------

async function aug31Capture() {
  const { reader } = fixtureReader({ runs: STAGING_RUNS })
  return captureWeekPoints(reader, { now: '2026-09-21T06:00:00.000Z', firstWeek: '2026-08-03', methodVersion: WEEK_LINE_METHOD_V1, laneRule: LANE, ages: [14] })
}

describe('the stored rows', () => {
  it('write a read with its own computed_at and run, and read back the same read (NaN stays NaN)', async () => {
    const { reads } = await aug31Capture()
    const row = readRowOf(SEALAND_CLIENT_ID, reads[0])
    expect(row).toMatchObject({
      client_id: SEALAND_CLIENT_ID, week: '2026-08-31', age_days: 14, captured_before: '2026-09-21T00:00:00Z',
      read_through_run: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', method_version: WEEK_LINE_METHOD_V1, computed_at: '2026-09-21T06:00:00.000Z',
    })
    expect(row.conditions).toMatchObject({ runs_in_week: 0, runs_after: [2, 2], videos: 229, median_dated: 6, bands: [91, 80, 58], comments: 3275 })
    const stored = JSON.parse(JSON.stringify(row))
    expect(readOfStored(stored)).toEqual(reads[0])
    const nan = readRowOf(SEALAND_CLIENT_ID, { ...reads[0], medianDated: Number.NaN })
    expect(nan.conditions.median_dated).toBeNull()
    expect(readOfStored(JSON.parse(JSON.stringify(nan))).medianDated).toBeNaN()
  })

  it('reads a row with no conditions as not measured, never as zero', () => {
    const r = readOfStored({ week: '2026-10-05', age_days: 14, captured_before: '2026-10-26T00:00:00+00:00', read_through_run: null, conditions: null, method_version: 'week_line_v1', computed_at: '2026-10-26T09:00:00+00:00' })
    expect(r.videos).toBeNaN()
    expect(r.meanDated).toBeNaN()
    expect(r.runsAfter).toEqual([Number.NaN, Number.NaN])
    expect(r.promptVersion).toBe('')
  })

  it('round-trips a point row', async () => {
    const { rows } = await aug31Capture()
    expect(pointOfStored(JSON.parse(JSON.stringify(pointRowOf(SEALAND_CLIENT_ID, rows[0]))))).toEqual(rows[0])
  })
})

// ---- The insert-if-absent ----------------------------------------------------------------------------

/** INSERT … ON CONFLICT DO NOTHING RETURNING, over two keyed maps: the
 *  semantics of MF4's primary keys (the real SQL is tested on the throwaway
 *  cluster by scripts/pg-shim/week-points-apply.sh). */
function memoryStore() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>()
  const writes: string[] = []
  const store: KeepStore = {
    async insertIfAbsent(table, rows, conflict, returning) {
      writes.push(table)
      const t = tables.get(table) ?? new Map<string, Record<string, unknown>>()
      tables.set(table, t)
      const out: Record<string, unknown>[] = []
      for (const row of rows as Record<string, unknown>[]) {
        const key = conflict.map((c) => String(row[c])).join('|')
        if (t.has(key)) continue
        t.set(key, { ...row })
        out.push(Object.fromEntries(returning.map((c) => [c, row[c]])))
      }
      return out
    },
    async heldReads(clientId, keys) {
      const t = tables.get(TABLE_WEEK_LINE_READS) ?? new Map()
      return keys.flatMap((k) => {
        const r = t.get([clientId, k.week, k.ageDays, k.methodVersion].join('|'))
        return r ? [{ week: String(r.week), age_days: Number(r.age_days), method_version: String(r.method_version), computed_at: String(r.computed_at), read_through_run: (r.read_through_run as string | null) ?? null }] : []
      })
    },
  }
  const count = (table: string) => tables.get(table)?.size ?? 0
  return { store, tables, writes, count }
}

describe('insertKeptWeeks (the one insert)', () => {
  it('writes a kept capture once: a second write of the same file inserts nothing and says so', async () => {
    const cap = await aug31Capture()
    const db = memoryStore()
    const first = await insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, reads: cap.reads, rows: cap.rows })
    expect(first.inserted.map((k) => `${k.week}@${k.ageDays}`)).toEqual(['2026-08-31@14'])
    expect(first.points).toEqual({ offered: 128, inserted: 128 })
    expect(db.count(TABLE_WEEK_LINE_READS)).toBe(1)
    expect(db.count(TABLE_WEEK_LINE_POINTS)).toBe(128)
    // The capture's own computed_at and run are what is written.
    const held = [...db.tables.get(TABLE_WEEK_LINE_READS)!.values()][0]
    expect(held).toMatchObject({ computed_at: '2026-09-21T06:00:00.000Z', read_through_run: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4' })

    const second = await insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, reads: cap.reads, rows: cap.rows })
    expect(second.inserted).toEqual([])
    expect(second.completed.map((k) => k.week)).toEqual(['2026-08-31'])
    expect(second.points).toEqual({ offered: 128, inserted: 0 })
    expect(db.count(TABLE_WEEK_LINE_POINTS)).toBe(128)
    expect(keepReportLines(second)[0]).toBe('nothing inserted: 1 read(s) already held, and the 128 point row(s) of this capture with them')
    expect(keepReportLines(first)[0]).toBe('inserted 1 read(s) and 128 point row(s)')
    // A capture that kept nothing (no week reached its age) says so, not "0 already held".
    const empty = await insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, reads: [], rows: [] })
    expect(keepReportLines(empty)).toEqual(['nothing inserted: no kept read'])
  })

  it('leaves a read held from another capture alone, with its points', async () => {
    const cap = await aug31Capture()
    const db = memoryStore()
    await insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, reads: cap.reads, rows: cap.rows })
    const later = { ...cap.reads[0], computedAt: '2026-09-22T06:00:00.000Z' }
    const r = await insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, reads: [later], rows: cap.rows.map((p) => ({ ...p, k: 0 })) })
    expect(r.held).toEqual([{ week: '2026-08-31', ageDays: 14, methodVersion: WEEK_LINE_METHOD_V1, computedAt: '2026-09-22T06:00:00.000Z', heldComputedAt: '2026-09-21T06:00:00.000Z' }])
    expect(r.points).toEqual({ offered: 0, inserted: 0 })
    expect([...db.tables.get(TABLE_WEEK_LINE_POINTS)!.values()].some((p) => p.k === 0 && (p.n as number) > 0 && p.object_id === 'praise' && p.audience === 'industry-other')).toBe(false)
    expect(keepReportLines(r)[1]).toMatch(/already held from another capture \(computed 2026-09-21T06:00:00.000Z\), left alone/)
  })

  it('completes a write that stopped after the read, from the same capture only', async () => {
    const cap = await aug31Capture()
    const db = memoryStore()
    await db.store.insertIfAbsent(TABLE_WEEK_LINE_READS, [readRowOf(SEALAND_CLIENT_ID, cap.reads[0])], ['client_id', 'week', 'age_days', 'method_version'], ['week'])
    const r = await insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, reads: cap.reads, rows: cap.rows })
    expect(r.completed).toHaveLength(1)
    expect(r.points.inserted).toBe(128)
  })

  it('writes nothing from a malformed capture', async () => {
    const cap = await aug31Capture()
    const db = memoryStore()
    const bad = [
      { reads: [{ ...cap.reads[0], readThroughRun: 'stand-in-2026-10-18' }], rows: cap.rows },
      { reads: [{ ...cap.reads[0], week: '2026-09-01' }], rows: [] },
      { reads: cap.reads, rows: [{ ...cap.rows[0], k: 9, n: 7 }] },
      { reads: cap.reads, rows: [{ ...cap.rows[0], week: '2026-09-07' }] },
      { reads: [cap.reads[0], cap.reads[0]], rows: [] },
    ]
    for (const b of bad) {
      expect(keptProblems(b.reads, b.rows).length).toBeGreaterThan(0)
      await expect(insertKeptWeeks(db.store, { clientId: SEALAND_CLIENT_ID, ...b })).rejects.toThrow(/nothing written/)
    }
    expect(db.writes).toEqual([])
  })
})
