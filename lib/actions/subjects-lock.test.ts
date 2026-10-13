import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { SUBJECT_WRITE_REFUSED, SUBJECTS_HELD } from '../subjects/types'
import { tenantLocked } from '../tenant-locks'
import { fakeDb, type FakeDb } from '../test/fake-db'

// Decision 7 (13 Oct): Sealand's lock covers subject edits. Adding, renaming,
// confirming and stopping a subject change what is measured, as a search term
// or a product does, so a locked tenant's owner or admin is refused, after the
// role check and before anything is read or written; an unlocked tenant and
// the platform operator are not. Each is called against an in-memory database.

const h = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, admin: null as unknown }))

vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { canManageTenant: roles.canManageTenant, getSessionContext: async () => h.session }
})
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase-admin', async (orig) => ({ ...(await orig<typeof import('../supabase-admin')>()), createAdminClient: () => h.admin }))

const { confirmSubjectAction, nameSubjectAction, retireSubjectAction, trackSubjectAction } = await import('./subjects')

const PROPOSED = '5a1b2c3d-4e5f-4a6b-8c7d-8e9fa0b1c2d3'
const ACTIVE = '6b2c3d4e-5f6a-4b7c-9d8e-9fa0b1c2d3e4'

let db: FakeDb
let admin: FakeDb

const session = (clientId: string, role: 'owner' | 'admin' | 'member', operator = false) => ({
  supabase: db.client,
  userId: 'u-1',
  email: 'reader@example.com',
  clientId,
  role,
  operator: operator ? { homeClientId: OSSUR_CLIENT_ID, viewingClientId: clientId, viewingName: 'Sealand', isHome: false } : null,
})

const seed = (clientId: string) => {
  db = fakeDb({
    subjects: [
      { id: PROPOSED, client_id: clientId, name: 'Travel size rules', status: 'proposed' },
      { id: ACTIVE, client_id: clientId, name: 'Durability', status: 'active' },
    ],
    moves: [],
  })
  admin = fakeDb({ config_changes: [] })
  h.admin = admin.client
}

const nameForm = (supersedes?: string) => {
  const f = new FormData()
  f.append('name', 'Laptop sleeves')
  f.append('origin', 'client')
  if (supersedes) f.append('supersedes', supersedes)
  return f
}

const writes = (d: FakeDb) => d.calls.filter((c) => c.op !== 'select' && c.op !== 'rpc')

describe('the lock and the tenants', () => {
  it('Sealand is locked and Össur is not: the lock this file tests is the real one', () => {
    expect(tenantLocked(SEALAND_CLIENT_ID, 'tracking')).toBe(true)
    expect(tenantLocked(OSSUR_CLIENT_ID, 'tracking')).toBe(false)
  })
})

describe('a locked tenant\'s owner or admin is refused, before anything is read or written', () => {
  for (const role of ['owner', 'admin'] as const) {
    describe(`Sealand's ${role}`, () => {
      beforeEach(() => { seed(SEALAND_CLIENT_ID); h.session = session(SEALAND_CLIENT_ID, role) })

      it('add a subject', async () => {
        expect(await nameSubjectAction({ ok: false, message: '' }, nameForm())).toEqual({ ok: false, message: SUBJECTS_HELD })
        expect(db.calls).toEqual([])
        expect(admin.calls).toEqual([])
      })
      it('rename one', async () => {
        expect(await nameSubjectAction({ ok: false, message: '' }, nameForm(ACTIVE))).toEqual({ ok: false, message: SUBJECTS_HELD })
        expect(db.calls).toEqual([])
        expect(admin.calls).toEqual([])
      })
      it('confirm one', async () => {
        expect(await confirmSubjectAction(PROPOSED)).toEqual({ ok: false, message: SUBJECTS_HELD })
        expect(db.calls).toEqual([])
      })
      it('stop following one', async () => {
        expect(await retireSubjectAction(ACTIVE)).toEqual({ ok: false, message: SUBJECTS_HELD })
        expect(db.calls).toEqual([])
        expect(admin.calls).toEqual([])
      })
    })
  }

  it('a member of a locked tenant is told the role\'s sentence: the role is asked first', async () => {
    seed(SEALAND_CLIENT_ID)
    h.session = session(SEALAND_CLIENT_ID, 'member')
    expect(await confirmSubjectAction(PROPOSED)).toEqual({ ok: false, message: SUBJECT_WRITE_REFUSED })
    expect(await nameSubjectAction({ ok: false, message: '' }, nameForm())).toEqual({ ok: false, message: SUBJECT_WRITE_REFUSED })
    expect(db.calls).toEqual([])
  })
})

describe.each([
  ['an admin of an unlocked tenant (Össur)', OSSUR_CLIENT_ID, () => session(OSSUR_CLIENT_ID, 'admin')],
  ['the operator viewing Sealand', SEALAND_CLIENT_ID, () => session(SEALAND_CLIENT_ID, 'owner', true)],
])('%s gets through', (_who, clientId, as) => {
  beforeEach(() => { seed(clientId); h.session = as() })

  it('adds a subject', async () => {
    const r = await nameSubjectAction({ ok: false, message: '' }, nameForm())
    expect(r.ok).toBe(true)
    expect(writes(db).map((c) => [c.table, c.op])).toEqual([['subjects', 'insert']])
  })
  it('confirms one', async () => {
    expect((await confirmSubjectAction(PROPOSED)).ok).toBe(true)
    expect(writes(db).map((c) => [c.table, c.op])).toEqual([['subjects', 'update']])
  })
  it('stops following one', async () => {
    expect((await retireSubjectAction(ACTIVE)).ok).toBe(true)
    expect(writes(db).map((c) => [c.table, c.op])).toEqual([['subjects', 'update']])
  })
})

describe('Track this is not a subject edit: the lock does not hold it', () => {
  it('a locked tenant\'s admin may still date a move on a subject (the role is its gate, decision 6b)', async () => {
    seed(SEALAND_CLIENT_ID)
    h.session = session(SEALAND_CLIENT_ID, 'admin')
    const f = new FormData()
    f.append('subject_id', ACTIVE)
    f.append('title', 'A tougher zip')
    f.append('direction', 'up')
    expect((await trackSubjectAction({ ok: false, message: '' }, f)).ok).toBe(true)
    expect(writes(db).map((c) => [c.table, c.op])).toEqual([['moves', 'insert']])
  })
})

describe('the write path, read as text', () => {
  const src = readFileSync(join(__dirname, 'subjects.ts'), 'utf8')
  const body = (name: string) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf('\n}\n', src.indexOf(`export async function ${name}(`)))

  it('every subject write goes through the one gate, and the gate asks the role, then the lock', () => {
    for (const fn of ['nameSubjectAction', 'confirmSubjectAction', 'retireSubjectAction']) {
      expect(body(fn), fn).toMatch(/const \{ ctx, refusal \} = await manageContext\(\)\n\s+if \(refusal\) return refusal/)
    }
    const gate = src.slice(src.indexOf('async function manageContext('), src.indexOf('\n}\n', src.indexOf('async function manageContext(')))
    expect(gate.indexOf('canManageTenant(role)')).toBeGreaterThan(-1)
    expect(gate.indexOf("assertTenantMay(session, clientId, 'tracking')")).toBeGreaterThan(gate.indexOf('canManageTenant(role)'))
  })
})
