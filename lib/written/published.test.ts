import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeDb } from '../test/fake-db'
import { sealandRead } from '../test/weekly-read-fixture'
import { loadPublishedLongRun, loadPublishedWeekRead, pickPublished, publishRule, type PublishSchedule } from './published'

// The one "published read" selector (integration, lead's ruling 3): under an
// active weekly-read schedule with review ON, a page prints the newest read
// whose send went out; otherwise the newest ready read. It fails closed.

const CLIENT = SEALAND_CLIENT_ID
const SCHED = 'sched-wr'

const schedule = (over: Partial<PublishSchedule> & { client_id?: string } = {}) => ({
  id: SCHED, client_id: CLIENT, starter_key: 'weekly_read', artefact: 'weekly_read', review: true, active: true, ...over,
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

describe('publishRule: which schedules hold a read back', () => {
  it('an active weekly-read schedule with review on gates the pages', () => {
    expect(publishRule([schedule()])).toEqual({ gated: true, scheduleIds: [SCHED] })
    // The artefact column absent, the starter key says it.
    expect(publishRule([schedule({ artefact: null })])).toEqual({ gated: true, scheduleIds: [SCHED] })
  })

  it('review off, a paused schedule, or another artefact does not', () => {
    expect(publishRule([schedule({ review: false })])).toEqual({ gated: false })
    expect(publishRule([schedule({ active: false })])).toEqual({ gated: false })
    expect(publishRule([schedule({ starter_key: 'weekly_report', artefact: 'weekly' })])).toEqual({ gated: false })
    expect(publishRule([])).toEqual({ gated: false })
  })
})

describe('pickPublished', () => {
  const rows = [
    { run_id: 'a', status: 'ready', window_end: '2026-09-20', data: {} },
    { run_id: 'b', status: 'thin', window_end: '2026-10-04', data: {} },
    { run_id: 'c', status: 'ready', window_end: '2026-09-27', data: {} },
    { run_id: 'd', status: 'ready', window_end: '2026-10-11', data: null },
  ]

  it('ungated: the newest ready read with data', () => {
    expect(pickPublished(rows, { gated: false }, new Set())?.run_id).toBe('c')
  })

  it('gated: the newest ready read whose run was sent, never a newer held one', () => {
    expect(pickPublished(rows, { gated: true, scheduleIds: [SCHED] }, new Set(['a']))?.run_id).toBe('a')
    expect(pickPublished(rows, { gated: true, scheduleIds: [SCHED] }, new Set(['b', 'd']))).toBeNull()
    expect(pickPublished(rows, { gated: true, scheduleIds: [SCHED] }, new Set()))
      .toBeNull()
  })
})

describe('loadPublishedWeekRead', () => {
  it('with no schedules table, nothing gates: the newest ready read', async () => {
    const db = fakeDb({ week_reads: READS.map((r) => ({ ...r })) })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
  })

  it('review off: the newest ready read, even one never sent', async () => {
    const db = fakeDb({ report_schedules: [schedule({ review: false })], report_sends: [], week_reads: READS.map((r) => ({ ...r })) })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
  })

  it('review on: the newest read that was SENT; the held newer ones never show', async () => {
    const db = fakeDb({
      report_schedules: [schedule()],
      report_sends: [send('r1', 'sent'), send('r2', 'sent'), send('r3', 'ready')],
      week_reads: READS.map((r) => ({ ...r })),
    })
    const got = await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT)
    expect(got).toMatchObject({ runId: 'r2', month: '2026-09-01', windowEnd: '2026-09-27T04:00:00Z' })
    expect(headline(got)).toBe('The read of r2.')
  })

  it('review on and nothing sent yet: nothing is published', async () => {
    const db = fakeDb({ report_schedules: [schedule()], report_sends: [send('r3', 'ready'), send('r2', 'failed')], week_reads: READS.map((r) => ({ ...r })) })
    expect(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT)).toBeNull()
    // And with no sends table under a gating schedule, nothing has gone out.
    const none = fakeDb({ report_schedules: [schedule()], week_reads: READS.map((r) => ({ ...r })) })
    expect(await loadPublishedWeekRead(none.client as SupabaseClient, CLIENT)).toBeNull()
  })

  it('only this schedule\'s sends count: another tenant\'s or another artefact\'s sent run publishes nothing', async () => {
    const db = fakeDb({
      report_schedules: [schedule(), schedule({ id: 'sched-digest', starter_key: 'weekly_report', artefact: 'weekly', review: false })],
      report_sends: [
        send('r3', 'sent', { schedule_id: 'sched-digest' }),
        send('r3', 'sent', { client_id: OSSUR_CLIENT_ID, schedule_id: 'ossur-wr' }),
        send('r1', 'sent'),
      ],
      week_reads: READS.map((r) => ({ ...r })),
    })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r1.')
  })

  it('never another tenant\'s read, and `month` narrows to that reading month', async () => {
    const db = fakeDb({
      week_reads: [...READS.map((r) => ({ ...r })), read('x', '2026-10-11T04:00:00Z', { client_id: OSSUR_CLIENT_ID })],
    })
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT))).toBe('The read of r3.')
    expect(headline(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT, { month: '2026-09-01' }))).toBe('The read of r2.')
  })

  it('fails closed: schedules or sends it cannot read publish nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = (table: string) => {
      const db = fakeDb({ report_schedules: [schedule()], report_sends: [send('r2', 'sent')], week_reads: READS.map((r) => ({ ...r })) })
      const broken = {
        select: () => broken, eq: () => broken, in: () => broken, not: () => broken, order: () => broken, limit: () => broken,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }).then(ok),
      }
      return { from: (t: string) => (t === table ? broken : (db.client as SupabaseClient).from(t)) } as unknown as SupabaseClient
    }
    expect(await loadPublishedWeekRead(failing('report_schedules'), CLIENT)).toBeNull()
    expect(await loadPublishedWeekRead(failing('report_sends'), CLIENT)).toBeNull()
    expect(err).toHaveBeenCalledTimes(2)
    err.mockRestore()
  })

  it('is null where the week_reads table is not there', async () => {
    const db = fakeDb({ report_schedules: [] })
    expect(await loadPublishedWeekRead(db.client as SupabaseClient, CLIENT)).toBeNull()
  })
})

describe('loadPublishedLongRun: Your market\'s long-run read passes the same gate (fresh review B1)', () => {
  // The run that closes a month writes its week read AND the month's long-run
  // read; under review the long-run read shows only once THAT run's weekly
  // read was sent, which is when Heinrich has read both.
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

  it('ungated (no schedule, or review off): the newest ready long-run read', async () => {
    const none = fakeDb({ week_reads: [...READS, ...LONG].map((r) => ({ ...r })) })
    expect(await loadPublishedLongRun(none.client as SupabaseClient, CLIENT)).toMatchObject({ month: '2026-09-01' })
    const off = fakeDb({ report_schedules: [schedule({ review: false })], report_sends: [], week_reads: LONG.map((r) => ({ ...r })) })
    expect(inShort(await loadPublishedLongRun(off.client as SupabaseClient, CLIENT))).toBe('What holds to 2026-09-01.')
  })

  it('review on: only a long-run read whose OWN run was sent; a later run sent does not publish it', async () => {
    const world = (sends: ReturnType<typeof send>[]) =>
      fakeDb({ report_schedules: [schedule()], report_sends: sends, week_reads: [...READS, ...LONG].map((r) => ({ ...r })) })
    // r3 wrote September's; its send is held. r2's going out says nothing about r3's.
    const held = world([send('r1', 'sent'), send('r2', 'sent'), send('r3', 'ready')])
    expect(inShort(await loadPublishedLongRun(held.client as SupabaseClient, CLIENT))).toBe('What holds to 2026-08-01.')
    // Heinrich presses Send on r3: September's goes up with it.
    const sent = world([send('r1', 'sent'), send('r2', 'sent'), send('r3', 'sent')])
    expect(await loadPublishedLongRun(sent.client as SupabaseClient, CLIENT)).toMatchObject({ month: '2026-09-01', created_at: '2026-09-28T05:00:00Z' })
    // Nothing of r1 or r3 sent: nothing.
    expect(await loadPublishedLongRun(world([send('r2', 'sent'), send('r3', 'failed')]).client as SupabaseClient, CLIENT)).toBeNull()
    expect(await loadPublishedLongRun(world([]).client as SupabaseClient, CLIENT)).toBeNull()
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
    const gated = fakeDb({
      report_schedules: [schedule()],
      report_sends: [send('r1', 'sent'), send('r3', 'sent'), send('r4', 'sent')],
      week_reads: [longRun('r1', '2026-08-01'), longRun('r3', '2026-09-01', { data: { kind: 'something-else' } }), longRun('r4', '2026-09-01', { status: 'thin' })],
    })
    expect(inShort(await loadPublishedLongRun(gated.client as SupabaseClient, CLIENT))).toBe('What holds to 2026-08-01.')
  })

  it('fails closed: schedules or sends it cannot read publish nothing; no table, nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = (table: string) => {
      const db = fakeDb({ report_schedules: [schedule()], report_sends: [send('r3', 'sent')], week_reads: LONG.map((r) => ({ ...r })) })
      const broken = {
        select: () => broken, eq: () => broken, in: () => broken, not: () => broken, order: () => broken, limit: () => broken,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }).then(ok),
      }
      return { from: (t: string) => (t === table ? broken : (db.client as SupabaseClient).from(t)) } as unknown as SupabaseClient
    }
    expect(await loadPublishedLongRun(failing('report_schedules'), CLIENT)).toBeNull()
    expect(await loadPublishedLongRun(failing('report_sends'), CLIENT)).toBeNull()
    expect(err).toHaveBeenCalledTimes(2)
    err.mockRestore()
    expect(await loadPublishedLongRun(fakeDb({ report_schedules: [] }).client as SupabaseClient, CLIENT)).toBeNull()
  })
})

describe('every page that prints a week read asks the selector', () => {
  // This week, the Dashboard's numbers and tiles, the Subjects pane, and Your
  // market's subject sentences. A page reading `week_reads` itself would
  // print a held read.
  const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')
  for (const file of ['lib/pages/week-read.ts', 'lib/pages/home.ts', 'lib/pages/subjects-read.ts', 'lib/pages/overview-picture.ts']) {
    it(file, () => {
      const text = src(file)
      expect(text).toMatch(/loadPublishedWeekRead\(/)
      expect(text).not.toMatch(/from\(WEEK_READS_TABLE\)/)
      expect(text).not.toMatch(/from\('week_reads'\)/)
    })
  }

  it('Your market reads its long-run read through the gate too', () => {
    const text = src('lib/pages/overview-picture.ts')
    expect(text).toMatch(/loadPublishedLongRun\(/)
    expect(text).not.toMatch(/loadLatestLongRun/)
  })
})
