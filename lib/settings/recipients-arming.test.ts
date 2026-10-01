import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID } from '../config'
import { fakeDb, type FakeDb } from '../test/fake-db'

// The Studio's Recipients editor never arms a schedule for a tenant (fresh
// review H1, lead's ruling, 1 Oct evening). It is open to every owner and
// admin, and on an unlocked tenant with no weekly_read row, saving a list used
// to create an ACTIVE weekly_read schedule with review OFF: the model-written
// read emailed every Sunday with nobody reviewing it, and the pages printing
// it ungated. Now a tenant's save keeps a schedule as it is, never switches
// one on or creates one switched on, and every new row is born reviewed;
// arming one is the operator's. (The tenant lock's refusal for a locked
// tenant is pinned in lib/tenant-locks.test.ts.)

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

const { updateArtefactRecipients } = await import('../../app/dashboard/settings/reports/actions')

const CLIENT = OSSUR_CLIENT_ID
const tenantAdmin = { supabase: null, userId: 'u-1', email: 'admin@ossur.example', clientId: CLIENT, role: 'admin', operator: null }
const operator = {
  supabase: null, userId: 'u-op', email: 'operator@verbatim.example', clientId: CLIENT, role: 'owner',
  operator: { homeClientId: CLIENT, viewingClientId: CLIENT, viewingName: 'Össur', isHome: true },
}

/** What the editor posts: the artefact, the list, and `active=on` where it does. */
const save = (artefact: string, active: boolean) => {
  const f = new FormData()
  f.append('artefact', artefact)
  f.append('recipients', 'jon@ossur.example, anna@ossur.example')
  if (active) f.append('active', 'on')
  return updateArtefactRecipients({ ok: false, message: '' }, f)
}

let db: FakeDb
const world = (schedules: Record<string, unknown>[] = []) => {
  db = fakeDb({ report_schedules: schedules, config_changes: [] })
  h.db = db.client
}
const written = (op: 'insert' | 'update') =>
  db.calls.filter((c) => c.table === 'report_schedules' && c.op === op).map((c) => c.values)

beforeEach(() => world())

describe('saving recipients never arms a schedule for a tenant (H1)', () => {
  it('an unscheduled weekly read: the row is created switched OFF and reviewed, whatever was posted', async () => {
    h.session = tenantAdmin
    expect(await save('weekly_read', true)).toEqual({ ok: true, message: 'Saved.' })
    expect(written('insert')).toEqual([[expect.objectContaining({
      client_id: CLIENT, artefact: 'weekly_read', recipients: ['jon@ossur.example', 'anna@ossur.example'], active: false, review: true,
    })]])
  })

  it('a schedule that is off stays off; one that sends keeps sending', async () => {
    h.session = tenantAdmin
    world([{ id: 'wr', client_id: CLIENT, artefact: 'weekly_read', name: 'This week in your market', cadence: 'every_update', recipients: [], active: false }])
    await save('weekly_read', true)
    expect(written('update')).toEqual([expect.objectContaining({ active: false })])

    world([{ id: 'wr', client_id: CLIENT, artefact: 'weekly_read', name: 'This week in your market', cadence: 'every_update', recipients: [], active: true }])
    await save('weekly_read', true)
    expect(written('update')).toEqual([expect.objectContaining({ active: true })])
    // The save names no review column: an armed schedule's review is the operator's.
    expect(written('update')[0]).not.toHaveProperty('review')
  })

  it('every row it creates is born reviewed, for every artefact', async () => {
    h.session = tenantAdmin
    for (const artefact of ['weekly', 'monthly', 'brief:sales']) {
      world()
      await save(artefact, true)
      expect(written('insert'), artefact).toEqual([[expect.objectContaining({ artefact, active: false, review: true })]])
    }
  })

  it('the operator arms one, and it is reviewed', async () => {
    h.session = operator
    expect((await save('weekly_read', true)).ok).toBe(true)
    expect(written('insert')).toEqual([[expect.objectContaining({ artefact: 'weekly_read', active: true, review: true })]])
  })

  it('a member is refused and nothing is written', async () => {
    h.session = { ...tenantAdmin, role: 'member' }
    expect((await save('weekly_read', true)).ok).toBe(false)
    expect(written('insert')).toEqual([])
    expect(written('update')).toEqual([])
  })
})
