import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { fakeDb, type FakeDb } from '../test/fake-db'
import { maySeeStatements, STATEMENTS_HELD, STATEMENTS_TENANT_VISIBLE } from './visibility'

// Your statements is held from tenants until Heinrich decides (lead's ruling
// 5, 1 Oct evening; open ruling #7): no section, no add form and no
// measurement for a tenant's session; the operator's is as built.

const h = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, after: 0, measured: 0 }))

vi.mock('@/lib/auth', () => ({ getSessionContext: async () => h.session }))
vi.mock('next/server', () => ({ after: () => { h.after += 1 } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/statements/measure', () => ({
  measureStatements: async () => { h.measured += 1; return { results: [], skipped: null } },
  measureSummary: () => '',
}))

const { addStatement, editStatement, removeStatement } = await import('../actions/statements')

const ID = '5d3b4c1e-2f60-4a8b-9c7d-0e1f2a3b4c5d'
let db: FakeDb
const owner = (clientId: string) => ({ supabase: db.client, userId: 'u-1', clientId, role: 'owner', operator: null })
const operator = (clientId: string) => ({
  supabase: db.client, userId: 'u-op', clientId, role: 'owner',
  operator: { homeClientId: OSSUR_CLIENT_ID, viewingClientId: clientId, viewingName: 'Sealand', isHome: false },
})
const add = (text: string) => {
  const f = new FormData()
  f.append('text', text)
  return addStatement({ ok: false, message: '' }, f)
}
const writes = () => db.calls.filter((c) => c.op !== 'select')

beforeEach(() => {
  db = fakeDb({ client_statements: [{ id: ID, client_id: SEALAND_CLIENT_ID, text: 'Made from recycled nylon', retired_at: null }] })
  h.after = 0
  h.measured = 0
})

describe('maySeeStatements', () => {
  it('is held from tenants today; the operator always sees it', () => {
    expect(STATEMENTS_TENANT_VISIBLE).toBe(false)
    expect(maySeeStatements({ operator: null })).toBe(false)
    expect(maySeeStatements({ operator: { homeClientId: OSSUR_CLIENT_ID } })).toBe(true)
    // Flipped, a tenant's owner sees it too.
    expect(maySeeStatements({ operator: null }, true)).toBe(true)
  })
})

describe('the actions refuse a tenant before anything is written or measured', () => {
  it('add, edit and remove', async () => {
    h.session = owner(SEALAND_CLIENT_ID)
    expect(await add('Every bag keeps a banner out of landfill')).toEqual({ ok: false, message: STATEMENTS_HELD })
    expect(await editStatement(ID, 'Made from recycled banners')).toEqual({ ok: false, message: STATEMENTS_HELD })
    expect(await removeStatement(ID)).toEqual({ ok: false, message: STATEMENTS_HELD })
    expect(writes()).toEqual([])
    expect(db.calls).toEqual([])
    expect(h.after).toBe(0)
  })

  it('the operator adds one, and it is measured after the response', async () => {
    h.session = operator(SEALAND_CLIENT_ID)
    expect(await add('Every bag keeps a banner out of landfill')).toEqual({ ok: true, message: '' })
    expect(writes().map((c) => [c.table, c.op])).toEqual([['client_statements', 'insert']])
    expect(h.after).toBe(1)
  })
})

describe('the page reads no statement for a tenant', () => {
  it('app/dashboard/market/page.tsx asks maySeeStatements before loadStatements', () => {
    const page = readFileSync(resolve(__dirname, '../../app/dashboard/market/page.tsx'), 'utf8')
    expect(page).toMatch(/maySeeStatements\(\{ operator \}\) \? loadStatements\(/)
  })
})
