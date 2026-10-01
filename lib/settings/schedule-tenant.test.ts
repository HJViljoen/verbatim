import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeDb, type FakeDb } from '../test/fake-db'
import { TENANT_LOCK_REFUSAL } from '../tenant-locks'

// `saveSchedule` for a tenant: RECIPIENTS ONLY (lead, 1 Oct evening, after
// fresh review H1). The schedule form is the operator's, but the action is
// POST-reachable by any owner or admin, so a crafted POST must not arm a
// schedule, switch its review off, or change its cadence or template. For a
// tenant the action changes the recipients of an existing schedule of the
// workspace and nothing else, and refuses to create one.

const h = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, db: null as unknown }))

vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { canManageTenant: roles.canManageTenant, getSessionContext: async () => h.session }
})
vi.mock('@/lib/supabase-admin', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase-admin')>()),
  createAdminClient: () => h.db,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {}, notFound: () => {} }))

const { saveSchedule } = await import('../../app/dashboard/studio/actions')

const ID = '5d3b4c1e-2f60-4a8b-9c7d-0e1f2a3b4c5d'
const OTHER = '6e4c5d2f-3a71-4b9c-8d0e-1f2a3b4c5d6e'
const tenantAdmin = (clientId: string) => ({ supabase: null, userId: 'u-1', email: 'admin@tenant.example', clientId, role: 'admin', operator: null })
const operator = {
  supabase: null, userId: 'u-op', email: 'operator@verbatim.example', clientId: OSSUR_CLIENT_ID, role: 'owner',
  operator: { homeClientId: OSSUR_CLIENT_ID, viewingClientId: OSSUR_CLIENT_ID, viewingName: 'Össur', isHome: true },
}

/** The schedule as stored: paused, reviewed, weekly. */
const STORED = {
  id: ID, client_id: OSSUR_CLIENT_ID, name: 'This week in your market', starter_key: 'weekly_read', report_id: null, artefact: 'weekly_read',
  cadence: 'every_update', recipients: ['old@ossur.example'], attach_pdf: false, share_days: 30, active: false, review: true,
}

/** A crafted POST: new recipients, and every arming field turned. */
const crafted = {
  name: 'Renamed', starterKey: 'weekly_report', reportId: null, cadence: 'monthly' as const,
  recipients: ['jon@ossur.example'], attachPdf: true, shareDays: 90 as const, active: true, review: false,
}

let db: FakeDb
beforeEach(() => {
  db = fakeDb({ report_schedules: [{ ...STORED }, { ...STORED, id: OTHER, client_id: SEALAND_CLIENT_ID }], config_changes: [] })
  h.db = db.client
})
const scheduleWrites = () => db.calls.filter((c) => c.table === 'report_schedules' && c.op !== 'select')

describe('saveSchedule: a tenant changes recipients only, whatever the POST carries', () => {
  it('a crafted POST on an existing schedule writes the recipients and nothing else', async () => {
    h.session = tenantAdmin(OSSUR_CLIENT_ID)
    expect(await saveSchedule({ id: ID, input: crafted })).toEqual({ ok: true, message: 'Saved', id: ID })
    const writes = scheduleWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0].op).toBe('update')
    expect(Object.keys(writes[0].values as object).sort()).toEqual(['recipients', 'updated_at'])
    expect(writes[0].values).toMatchObject({ recipients: ['jon@ossur.example'] })
    expect(writes[0].filters).toEqual(expect.arrayContaining([`id=${ID}`, `client_id=${OSSUR_CLIENT_ID}`]))
    // The change log records what changed: the list.
    const logged = db.calls.find((c) => c.table === 'config_changes' && c.op === 'insert')
    expect(JSON.stringify(logged?.values)).toContain('report_schedules.recipients')
  })

  it('creating a schedule is refused, with nothing written', async () => {
    h.session = tenantAdmin(OSSUR_CLIENT_ID)
    expect(await saveSchedule({ input: crafted })).toEqual({ ok: false, message: 'Only Verbatim adds a sending. You can change who receives one.' })
    expect(await saveSchedule({ input: { ...crafted, active: false } })).toMatchObject({ ok: false })
    expect(scheduleWrites()).toEqual([])
  })

  it('another workspace\'s schedule is not there', async () => {
    h.session = tenantAdmin(OSSUR_CLIENT_ID)
    expect(await saveSchedule({ id: OTHER, input: crafted })).toEqual({ ok: false, message: 'That sending is not in this workspace.' })
    expect(scheduleWrites()).toEqual([])
  })

  it('a locked tenant asking to switch sending on still meets the lock first', async () => {
    h.session = tenantAdmin(SEALAND_CLIENT_ID)
    expect(await saveSchedule({ id: OTHER, input: crafted })).toEqual({ ok: false, message: TENANT_LOCK_REFUSAL.sends })
    // Off, it changes the list only.
    expect((await saveSchedule({ id: OTHER, input: { ...crafted, active: false } })).ok).toBe(true)
    expect(Object.keys(scheduleWrites()[0].values as object).sort()).toEqual(['recipients', 'updated_at'])
  })

  it('a member writes nothing', async () => {
    h.session = { ...tenantAdmin(OSSUR_CLIENT_ID), role: 'member' }
    expect((await saveSchedule({ id: ID, input: crafted })).ok).toBe(false)
    expect(scheduleWrites()).toEqual([])
  })

  it('the operator still saves the whole schedule, arming fields included', async () => {
    h.session = operator
    expect((await saveSchedule({ id: ID, input: { ...crafted, review: true } })).ok).toBe(true)
    expect(scheduleWrites()[0].values).toMatchObject({ name: 'Renamed', cadence: 'monthly', active: true, review: true, recipients: ['jon@ossur.example'] })
  })
})
