import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { MOVES_WRITE_REFUSED, mayDecideMoves } from '../moves-access'
import { fakeDb, type FakeDb } from '../test/fake-db'

// Your moves' four writes are an owner's or an admin's (depth v2, T7): Accept,
// Not for us, Date a move and a move's status. Each is called as a member, an
// admin, an owner and the operator viewing the tenant, against an in-memory
// database, and a member's call must write nothing and read nothing.

const h = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, admin: null as unknown }))

vi.mock('@/lib/auth', () => ({ getSessionContext: async () => h.session }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase-admin', async (orig) => ({ ...(await orig<typeof import('../supabase-admin')>()), createAdminClient: () => h.admin }))

const { acceptAdvice } = await import('./accept-advice')
const { setRecommendationStatus } = await import('./rec-status')
const { dateMoveAction } = await import('./date-move')
const { setMoveStatusAction } = await import('./subjects')

const CLIENT = SEALAND_CLIENT_ID
const LINEAGE = '0b6f2a5e-7c1d-4e8f-9a3b-2c4d5e6f7a8b'
const REC = '1c7a3b6f-8d2e-4f90-ab4c-3d5e6f7a8b9c'
const MOVE = '2d8b4c7a-9e3f-4a01-bc5d-4e6f7a8b9cad'
const THEME = '3e9c5d8b-af40-4b12-8d6e-5f7a8b9cadbe'

let db: FakeDb
let admin: FakeDb

const session = (role: 'owner' | 'admin' | 'member', operator = false) => ({
  supabase: db.client,
  userId: 'u-1',
  email: 'reader@example.com',
  clientId: CLIENT,
  role,
  operator: operator ? { homeClientId: OSSUR_CLIENT_ID, viewingClientId: CLIENT, viewingName: 'Sealand', isHome: false } : null,
})

const writes = () => db.calls.filter((c) => c.op !== 'select' && c.op !== 'rpc')
const today = () => new Date().toISOString().slice(0, 10)

beforeEach(() => {
  db = fakeDb({
    recommendations: [{ id: REC, client_id: CLIENT, lineage_id: LINEAGE, run_id: 'run-1', status: 'new' }],
    rec_decisions: [],
    moves: [{ id: MOVE, client_id: CLIENT, title: 'Price page', status: 'active' }],
    theme_registry: [{ id: THEME, client_id: CLIENT }],
  })
  admin = fakeDb({ config_changes: [] })
  h.admin = admin.client
})

const dateForm = (dated?: string) => {
  const f = new FormData()
  f.append('title', 'A clearer price page')
  f.append('target', `theme:${THEME}`)
  if (dated) f.append('dated_on', dated)
  return f
}

describe('mayDecideMoves', () => {
  it('is the tenant write role: owners and admins, never a member', () => {
    expect(mayDecideMoves('owner')).toBe(true)
    expect(mayDecideMoves('admin')).toBe(true)
    expect(mayDecideMoves('member')).toBe(false)
  })
})

describe('a member is refused before anything is read or written', () => {
  beforeEach(() => { h.session = session('member') })

  it('Accept', async () => {
    expect(await acceptAdvice(LINEAGE, 'Set up a help desk')).toEqual({ ok: false, message: MOVES_WRITE_REFUSED })
    expect(db.calls).toEqual([])
  })
  it('Not for us', async () => {
    expect(await setRecommendationStatus(REC, 'dismissed')).toEqual({ ok: false, message: MOVES_WRITE_REFUSED })
    expect(db.calls).toEqual([])
  })
  it('Date a move', async () => {
    expect(await dateMoveAction({ ok: false, message: '' }, dateForm())).toEqual({ ok: false, message: MOVES_WRITE_REFUSED })
    expect(db.calls).toEqual([])
  })
  it('a move’s status', async () => {
    expect(await setMoveStatusAction(MOVE, 'done')).toEqual({ ok: false, message: MOVES_WRITE_REFUSED })
    expect(db.calls).toEqual([])
    expect(admin.calls).toEqual([])
  })
})

describe.each([
  ['an admin', () => session('admin')],
  ['an owner', () => session('owner')],
  ['the operator viewing the tenant', () => session('owner', true)],
])('%s gets through', (_who, as) => {
  beforeEach(() => { h.session = as() })

  it('Accept dates a move on the lineage and marks the advice done', async () => {
    const r = await acceptAdvice(LINEAGE, 'Set up a help desk')
    expect(r.ok).toBe(true)
    expect(writes().map((c) => [c.table, c.op])).toEqual([['moves', 'insert'], ['rec_decisions', 'insert'], ['recommendations', 'update']])
    const move = (writes()[0].values as Record<string, unknown>[])[0]
    expect(move).toMatchObject({ kind: 'advice', lineage_id: LINEAGE, title: 'Set up a help desk' })
    expect('dated_on' in move).toBe(false)
  })

  it('Not for us files the decision and the status', async () => {
    expect(await setRecommendationStatus(REC, 'dismissed')).toEqual({ ok: true, message: '' })
    expect(writes().map((c) => [c.table, c.op])).toEqual([['rec_decisions', 'insert'], ['recommendations', 'update']])
  })

  it('Date a move writes the move', async () => {
    const r = await dateMoveAction({ ok: false, message: '' }, dateForm())
    expect(r.ok).toBe(true)
    expect(writes().map((c) => [c.table, c.op])).toEqual([['moves', 'insert']])
  })

  it('a move’s status is written', async () => {
    expect((await setMoveStatusAction(MOVE, 'done')).ok).toBe(true)
    expect(writes().map((c) => [c.table, c.op])).toEqual([['moves', 'update']])
    expect(admin.calls.map((c) => [c.table, c.op])).toEqual([['config_changes', 'insert']])
  })
})

describe('Accept and date it as a move', () => {
  beforeEach(() => { h.session = session('owner') })

  it('passes the day through to the move and says the day', async () => {
    const d = new Date()
    d.setUTCDate(1)
    const first = d.toISOString().slice(0, 10)
    // The first of this month is inside the window; on the first itself it is
    // today, which is stored as no day (the declaration day).
    const r = await acceptAdvice(LINEAGE, 'Set up a help desk', first)
    expect(r.ok).toBe(true)
    const move = (writes()[0].values as Record<string, unknown>[])[0]
    if (first === today()) {
      expect('dated_on' in move).toBe(false)
    } else {
      expect(move.dated_on).toBe(first)
      expect(r.message).toMatch(/^Dated /)
    }
  })

  it('refuses a day outside the window and writes nothing', async () => {
    const r = await acceptAdvice(LINEAGE, 'Set up a help desk', '2020-01-01')
    expect(r.ok).toBe(false)
    expect(writes()).toEqual([])
  })
})
