import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { scriptActor } from '../config-log'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeDb } from '../test/fake-db'
import { isMissingPublishColumns, onPlatform, publishedNotEmailed, PUBLISHED_NOT_EMAILED } from './platform-state'
import { publishRefusal, publishSend } from './publish'

// "Add to past issues (not emailed)", once "Publish to the platform" (the backfill, 1 Oct evening; lead's
// ruling 3): a held weekly build goes on the client's pages without an email,
// as a recorded state of its own (`published_at`), never a fake send.

const CLIENT = SEALAND_CLIENT_ID
const WR = { id: 'sched-wr', client_id: CLIENT, starter_key: 'weekly_read', artefact: 'weekly_read', review: true, active: true }
const DIGEST = { id: 'sched-dg', client_id: CLIENT, starter_key: 'weekly_report', artefact: 'weekly', review: true, active: true }
const row = (over: Record<string, unknown> = {}) => ({
  id: 'send-1', client_id: CLIENT, schedule_id: 'sched-wr', run_id: 'run-27', snapshot_id: 'snap-1', status: 'ready', subject: 'Sealand: the week', published_at: null, published_by: null, ...over,
})
const world = (sends: ReturnType<typeof row>[]) => fakeDb({ report_sends: sends, report_schedules: [WR, DIGEST], config_changes: [] })
const actor = scriptActor('scripts/backfill-platform.ts --publish')

describe('the platform rule', () => {
  it('a build is on the platform when it was emailed or published; published-not-emailed is the second alone', () => {
    expect(onPlatform({ status: 'sent' })).toBe(true)
    expect(onPlatform({ status: 'ready', published_at: '2026-10-01T18:00:00Z' })).toBe(true)
    expect(onPlatform({ status: 'ready' })).toBe(false)
    expect(onPlatform({ status: 'ready', published_at: null })).toBe(false)
    expect(onPlatform({ status: 'failed' })).toBe(false)
    expect(publishedNotEmailed({ status: 'ready', published_at: '2026-10-01T18:00:00Z' })).toBe(true)
    expect(publishedNotEmailed({ status: 'sent', published_at: '2026-10-01T18:00:00Z' })).toBe(false)
    expect(PUBLISHED_NOT_EMAILED).toBe('On the platform · not emailed')
  })

  it('knows a database the migration has not reached, and nothing else', () => {
    expect(isMissingPublishColumns({ code: '42703', message: 'column report_sends.published_at does not exist' })).toBe(true)
    expect(isMissingPublishColumns({ code: 'PGRST204', message: "Could not find the 'published_by' column of 'report_sends'" })).toBe(true)
    expect(isMissingPublishColumns({ code: '42703', message: 'column report_sends.other does not exist' })).toBe(false)
    expect(isMissingPublishColumns({ code: '57014', message: 'published_at: statement timeout' })).toBe(false)
    expect(isMissingPublishColumns(null)).toBe(false)
  })
})

describe('publishRefusal: only a built, held weekly read', () => {
  it('refuses another artefact, an unbuilt send, one being sent, a failed or skipped one, a removed schedule', () => {
    expect(publishRefusal(row(), WR)).toBeNull()
    expect(publishRefusal(row(), DIGEST)).toMatch(/Only the weekly read/)
    expect(publishRefusal(row({ snapshot_id: null }), WR)).toMatch(/did not build/)
    expect(publishRefusal(row({ status: 'claimed' }), WR)).toMatch(/being sent/)
    expect(publishRefusal(row({ status: 'failed' }), WR)).toMatch(/ready for review/)
    expect(publishRefusal(row({ status: 'skipped' }), WR)).toMatch(/ready for review/)
    expect(publishRefusal(row(), null)).toMatch(/removed/)
  })
})

describe('publishSend', () => {
  it('publishes a held weekly build: published_at and who, the status still ready, and one logged change', async () => {
    const db = world([row()])
    const now = new Date('2026-10-01T18:00:00Z')
    const out = await publishSend(db.client as SupabaseClient, { clientId: CLIENT, sendId: 'send-1', scheduleId: 'sched-wr', by: 'user-heinrich', actor, now })
    expect(out).toEqual({ status: 'published', sendId: 'send-1', publishedAt: '2026-10-01T18:00:00.000Z' })
    const update = db.calls.find((c) => c.table === 'report_sends' && c.op === 'update')
    expect(update?.values).toEqual({ published_at: '2026-10-01T18:00:00.000Z', published_by: 'user-heinrich' })
    // A compare-and-set: still ready, not yet published, this tenant's.
    expect(update?.filters).toEqual(expect.arrayContaining(['status=ready', 'published_at is null', `client_id=${CLIENT}`]))
    const log = db.calls.find((c) => c.table === 'config_changes' && c.op === 'insert')
    expect(log?.values).toEqual([expect.objectContaining({ surface: 'schedule', field: 'published', actor_kind: 'script', run_id: 'run-27' })])
    // No email, no status change, no recipients touched.
    expect(update?.values).not.toHaveProperty('status')
    expect(update?.values).not.toHaveProperty('recipients')
  })

  it('is idempotent: published or already emailed is `already`, and nothing is written', async () => {
    for (const r of [row({ published_at: '2026-10-01T18:00:00Z' }), row({ status: 'sent' })]) {
      const db = world([r])
      const out = await publishSend(db.client as SupabaseClient, { clientId: CLIENT, sendId: 'send-1', by: null, actor })
      expect(out.status).toBe('already')
      expect(db.calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false)
    }
  })

  it('never another tenant\'s send, another schedule\'s, a send that did not build, or another artefact', async () => {
    const theirs = world([row({ client_id: OSSUR_CLIENT_ID })])
    expect(await publishSend(theirs.client as SupabaseClient, { clientId: CLIENT, sendId: 'send-1', by: null, actor })).toEqual({ status: 'refused', error: 'No such send.' })
    const otherSchedule = world([row()])
    expect((await publishSend(otherSchedule.client as SupabaseClient, { clientId: CLIENT, sendId: 'send-1', scheduleId: 'sched-other', by: null, actor })).status).toBe('refused')
    const unbuilt = world([row({ snapshot_id: null })])
    expect((await publishSend(unbuilt.client as SupabaseClient, { clientId: CLIENT, sendId: 'send-1', by: null, actor })).status).toBe('refused')
    const digest = world([row({ schedule_id: 'sched-dg' })])
    expect((await publishSend(digest.client as SupabaseClient, { clientId: CLIENT, sendId: 'send-1', by: null, actor })).status).toBe('refused')
    for (const db of [theirs, otherSchedule, unbuilt, digest]) expect(db.calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false)
  })

  it('says so where the database has no platform state yet', async () => {
    const before = {
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b, eq: () => b,
          maybeSingle: () => Promise.resolve({ data: null, error: { code: '42703', message: 'column report_sends.published_at does not exist' } }),
        }
        return b
      },
    } as unknown as SupabaseClient
    const out = await publishSend(before, { clientId: CLIENT, sendId: 'send-1', by: null, actor })
    expect(out).toMatchObject({ status: 'refused', error: expect.stringMatching(/20261106090000/) })
  })
})
