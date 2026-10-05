import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeDb } from '../test/fake-db'
import { sealandRead } from '../test/weekly-read-fixture'
import { loadPublishedLongRun, loadPublishedWeekRead, pickPublished } from './published'

// The one "published read" selector. A page prints the newest READY read as
// soon as the run writes it (Heinrich, 5 Oct). Review holds the EMAIL only:
// no schedule and no send is asked, so a held build never holds the pages
// back. It fails closed on a read it cannot make.

const CLIENT = SEALAND_CLIENT_ID
const SCHED = 'sched-wr'

const schedule = (over: Record<string, unknown> = {}) => ({
  id: SCHED, client_id: CLIENT, starter_key: 'weekly_read', artefact: 'weekly_read', review: true, active: true, recipients: ['a@sealand.test'], ...over,
})

const read = (run: string, windowEnd: string, over: Record<string, unknown> = {}) => ({
  client_id: CLIENT, run_id: run, kind: 'week', status: 'ready', month: '2026-09-01', window_end: windowEnd,
  data: sealandRead({ headline: `The read of ${run}.` }), ...over,
})

const send = (run: string, status: string, over: Record<string, unknown> = {}) => ({
  client_id: CLIENT, schedule_id: SCHED, run_id: run, status, claimed_at: `2026-10-0${run.slice(-1)}T06:00:00Z`, ...over,
})

const READS = [
  read('r1', '2026-09-20T04:00:00Z'),
  read('r2', '2026-09-27T04:00:00Z'),
  read('r3', '2026-10-04T04:00:00Z', { month: '2026-10-01' }),
]

const headline = (r: Awaited<ReturnType<typeof loadPublishedWeekRead>>) => (r?.data as { headline?: string } | undefined)?.headline ?? null

/** A client whose `table` fails every read with a statement timeout. */
function failing(db: { client: unknown }, table: string): SupabaseClient {
  const broken = {
    select: () => broken, eq: () => broken, in: () => broken, not: () => broken, or: () => broken, order: () => broken, limit: () => broken,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }).then(ok),
  }
  return { from: (t: string) => (t === table ? broken : (db.client as SupabaseClient).from(t)) } as unknown as SupabaseClient
}

describe('pickPublished', () => {
  const rows = [
    { run_id: 'a', status: 'ready', window_end: '2026-09-20', data: {} },
    { run_id: 'b', status: 'thin', window_end: '2026-10-04', data: {} },
    { run_id: 'c', status: 'ready', window_end: '2026-09-27', data: {} },
    { run_id: 'd', status: 'ready', window_end: '2026-10-11', data: null },
    { run_id: 'e', status: 'failed', window_end: '2026-10-18', data: null },
  ]

  it('the newest ready read with data; thin, failed and empty rows never print', () => {
    expect(pickPublished(rows)?.run_id).toBe('c')
    expect(pickPublished(rows.filter((r) => r.status !== 'ready'))).toBeNull()
    expect(pickPublished([])).toBeNull()
  })
})

describe('loadPublishedWeekRead: the newest ready read, as soon as the run writes it', () => {
  it('with no schedule at all: the newest ready read', async () => {
    const db = fakeDb({ week_reads: READS.map((r) => ({ ...r })) })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
  })

  it('REVIEW ON and the newest send held for review: the pages print that newest read anyway (Sealand, 4 Oct)', async () => {
    const db = fakeDb({
      report_schedules: [schedule()],
      report_sends: [send('r1', 'sent'), send('r2', 'sent'), send('r3', 'ready')],
      week_reads: READS.map((r) => ({ ...r })),
    })
    const got = await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT)
    expect(got).toMatchObject({ runId: 'r3', month: '2026-10-01', windowEnd: '2026-10-04T04:00:00Z' })
    expect(headline(got)).toBe('The read of r3.')
    // Review holds the email, not the pages: neither the schedules nor the
    // sends are read.
    expect(db.calls.map((c) => c.table)).toEqual(['week_reads'])
  })

  it('review on, nothing ever sent and no recipients (Össur): the newest ready read', async () => {
    const db = fakeDb({
      report_schedules: [schedule({ client_id: CLIENT, recipients: [] })],
      report_sends: [send('r2', 'failed'), send('r3', 'skipped')],
      week_reads: READS.map((r) => ({ ...r })),
    })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
  })

  it('a newer run whose read failed or was thin leaves the newest READY one on the pages', async () => {
    const db = fakeDb({
      week_reads: [
        ...READS.map((r) => ({ ...r })),
        read('r4', '2026-10-11T04:00:00Z', { month: '2026-10-01', status: 'failed', data: null }),
        read('r5', '2026-10-18T04:00:00Z', { month: '2026-10-01', status: 'thin' }),
      ],
    })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
  })

  it('never another tenant\'s read, and `month` narrows to that reading month', async () => {
    const db = fakeDb({
      week_reads: [...READS.map((r) => ({ ...r })), read('x', '2026-10-11T04:00:00Z', { client_id: OSSUR_CLIENT_ID })],
    })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT, { month: '2026-09-01' }))).toBe('The read of r2.')
  })

  it('a schedules or sends table it cannot read changes nothing: neither is asked', async () => {
    const db = fakeDb({ report_schedules: [schedule()], report_sends: [send('r2', 'sent')], week_reads: READS.map((r) => ({ ...r })) })
    expect(headline(await loadPublishedWeekRead(failing(db, 'report_schedules'), CLIENT))).toBe('The read of r3.')
    expect(headline(await loadPublishedWeekRead(failing(db, 'report_sends'), CLIENT))).toBe('The read of r3.')
  })

  it('fails closed: a week_reads read that fails throws (the page loses only that block); no table is null', async () => {
    const db = fakeDb({ week_reads: READS.map((r) => ({ ...r })) })
    await expect(loadPublishedWeekRead(failing(db, 'week_reads'), CLIENT)).rejects.toThrow(/week_reads published: canceling statement/)
    expect(await loadPublishedWeekRead(fakeDb({ report_schedules: [] }).client as SupabaseClient, CLIENT)).toBeNull()
  })
})

describe('loadPublishedLongRun: Your market\'s long-run read, as soon as the run writes it', () => {
  const longRun = (run: string, month: string, over: Record<string, unknown> = {}) => ({
    client_id: CLIENT, run_id: run, kind: 'month', status: 'ready', month,
    window_end: month === '2026-08-01' ? '2026-09-01T00:00:00Z' : '2026-10-01T00:00:00Z',
    created_at: `${month.slice(0, 7)}-28T05:00:00Z`,
    data: {
      version: 1, kind: 'longrun', promptVersion: 'longrun_read_v1', month, months: ['2026-08-01', month],
      window: { from: '2026-08-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
      inShort: `What holds to ${month}.`, ideas: [], held: [], model: 'm', costUsd: 0,
    },
    ...over,
  })
  const LONG = [longRun('r1', '2026-08-01'), longRun('r3', '2026-09-01')]
  const inShort = (r: Awaited<ReturnType<typeof loadPublishedLongRun>>) => r?.data.inShort ?? null

  it('the newest ready long-run read, with or without a schedule', async () => {
    const none = fakeDb({ week_reads: [...READS, ...LONG].map((r) => ({ ...r })) })
    expect(await loadPublishedLongRun(none.client as SupabaseClient, CLIENT)).toMatchObject({ month: '2026-09-01', created_at: '2026-09-28T05:00:00Z' })
    const off = fakeDb({ report_schedules: [schedule({ review: false })], report_sends: [], week_reads: LONG.map((r) => ({ ...r })) })
    expect(inShort(await loadPublishedLongRun(off.client as SupabaseClient, CLIENT))).toBe('What holds to 2026-09-01.')
  })

  it('review on and the run that wrote it held for review: Your market prints it anyway (Sealand\'s September read, 4 Oct)', async () => {
    const db = fakeDb({
      report_schedules: [schedule()],
      report_sends: [send('r1', 'sent'), send('r2', 'sent'), send('r3', 'ready')],
      week_reads: [...READS, ...LONG].map((r) => ({ ...r })),
    })
    expect(inShort(await loadPublishedLongRun(db.client as SupabaseClient, CLIENT))).toBe('What holds to 2026-09-01.')
    expect(db.calls.map((c) => c.table)).toEqual(['week_reads'])
  })

  it('never a week read, a row that is not a long-run read, another tenant\'s, or one not ready', async () => {
    const db = fakeDb({
      week_reads: [
        ...READS.map((r) => ({ ...r })),
        longRun('r1', '2026-08-01'),
        longRun('r3', '2026-09-01', { data: { kind: 'something-else' } }),
        longRun('r4', '2026-09-01', { status: 'thin' }),
        longRun('x', '2026-09-01', { client_id: OSSUR_CLIENT_ID }),
      ],
    })
    // The newest ready 'month' row is not a long-run read: passed over for
    // the month before it.
    expect(inShort(await loadPublishedLongRun(db.client as SupabaseClient, CLIENT))).toBe('What holds to 2026-08-01.')
  })

  it('fails closed: a week_reads read that fails throws; no table, nothing', async () => {
    const db = fakeDb({ week_reads: LONG.map((r) => ({ ...r })) })
    await expect(loadPublishedLongRun(failing(db, 'week_reads'), CLIENT)).rejects.toThrow(/week_reads published long run/)
    expect(await loadPublishedLongRun(fakeDb({ report_schedules: [] }).client as SupabaseClient, CLIENT)).toBeNull()
  })
})

describe('every page that prints a stored read asks the selector, and the selector asks no send', () => {
  // This week, the Dashboard's numbers and tiles, the Subjects pane, and Your
  // market's subject sentences and long-run read. A page reading `week_reads`
  // itself could print a read that is not ready.
  const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')
  for (const file of ['lib/pages/week-read.ts', 'lib/pages/home.ts', 'lib/pages/subjects-read.ts', 'lib/pages/overview-picture.ts']) {
    it(file, () => {
      const text = src(file)
      expect(text).toMatch(/loadPublishedWeekRead\(/)
      expect(text).not.toMatch(/from\(WEEK_READS_TABLE\)/)
      expect(text).not.toMatch(/from\('week_reads'\)/)
      // Review holds the email only: no page reads a send to decide what to print.
      expect(text).not.toMatch(/report_sends|onPlatform|heldOf/)
    })
  }

  it('Your market reads its long-run read through the selector too', () => {
    const text = src('lib/pages/overview-picture.ts')
    expect(text).toMatch(/loadPublishedLongRun\(/)
    expect(text).not.toMatch(/loadLatestLongRun/)
  })

  it('the selector reads no schedule and no send', () => {
    const text = src('lib/written/published.ts')
    expect(text).not.toMatch(/from\('report_schedules'\)|from\('report_sends'\)/)
    expect(text).not.toMatch(/import[^\n]*schedules/)
  })
})
