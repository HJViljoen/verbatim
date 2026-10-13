import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fid, FIXTURE_CLIENT, productsFixtureTables } from '@/components/pages/settings/products/fixture'
import { SEALAND_CLIENT_ID } from '../config'
import { PRODUCTS_HELD, PRODUCTS_NOT_APPLIED, PRODUCTS_REFUSED } from '../settings/products'
import { fakeDb, type FakeDb } from '../test/fake-db'

// Settings › Your products: the catalogue's writes (T10b), over the fake
// database. What is pinned: the role and the tenant lock refuse before
// anything is written; nothing is ever deleted (removing is retiring); every
// write leaves a `config_changes` row on the `products` surface naming who
// made it; and a missing migration writes nothing and says so.

const h = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, db: null as unknown, revalidated: [] as string[] }))

vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { canManageTenant: roles.canManageTenant, getSessionContext: async () => h.session }
})
vi.mock('@/lib/supabase-admin', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase-admin')>()),
  createAdminClient: () => h.db,
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => { h.revalidated.push(p) } }))

const {
  addProduct, addProductAlias, addProductGroup, editProduct, renameProductGroup,
  retireProduct, retireProductAlias, retireProductGroup,
} = await import('./products')

const LINERS = fid(1, 1)
const FEET = fid(1, 2)
const SEAL_IN_X = fid(2, 1)
const SYNERGY = fid(2, 4)
const SEALIN_ALIAS = fid(3, 3)

const owner = { supabase: null, userId: '00000000-0000-4000-8000-0000000000aa', email: 'owner@ossur.example', clientId: FIXTURE_CLIENT, role: 'owner', operator: null }
const member = { ...owner, role: 'member' }
const sealandAdmin = { ...owner, email: 'admin@sealand.example', clientId: SEALAND_CLIENT_ID, role: 'admin' }
const operatorOnSealand = {
  ...owner, userId: '00000000-0000-4000-8000-0000000000bb', email: 'operator@verbatim.example', clientId: SEALAND_CLIENT_ID,
  operator: { homeClientId: FIXTURE_CLIENT, viewingClientId: SEALAND_CLIENT_ID, viewingName: 'Sealand', isHome: false },
}

let db: FakeDb
let tables: Record<string, Record<string, unknown>[]>
const world = (t: Record<string, Record<string, unknown>[]> = productsFixtureTables()) => {
  tables = t
  db = fakeDb(tables)
  h.db = db.client
  h.revalidated = []
}
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}
const prev = { ok: false, message: '' }
const writes = () => db.calls.filter((c) => c.op === 'insert' || c.op === 'update' || c.op === 'delete')
const catalogueWrites = () => writes().filter((c) => c.table !== 'config_changes')
const changes = () => tables.config_changes as Record<string, unknown>[]
const row = (table: string, id: string) => tables[table].find((r) => r.id === id) as Record<string, unknown>

beforeEach(() => { h.session = owner; world() })

describe('the gate: role, then the tenant lock', () => {
  const every = [
    () => addProductGroup(prev, form({ name: 'Covers' })),
    () => renameProductGroup(prev, form({ id: LINERS, name: 'Liners and sleeves' })),
    () => retireProductGroup(prev, form({ id: LINERS })),
    () => addProduct(prev, form({ group_id: LINERS, name: 'Iceross Ultra' })),
    () => editProduct(prev, form({ id: SEAL_IN_X, name: 'Seal-In X5', group_id: LINERS })),
    () => retireProduct(prev, form({ id: SEAL_IN_X })),
    () => addProductAlias(prev, form({ product_id: SEAL_IN_X, alias: 'sealinx' })),
    () => retireProductAlias(prev, form({ id: SEALIN_ALIAS })),
  ]

  it('refuses a member, and writes nothing', async () => {
    h.session = member
    for (const act of every) expect(await act()).toEqual({ ok: false, message: PRODUCTS_REFUSED })
    expect(writes()).toEqual([])
    expect(db.calls).toEqual([])
  })

  it('refuses a locked tenant\'s own admin in its own words, and writes nothing', async () => {
    h.session = sealandAdmin
    for (const act of every) expect(await act()).toEqual({ ok: false, message: PRODUCTS_HELD })
    expect(db.calls).toEqual([])
    expect(PRODUCTS_HELD).not.toMatch(/search/i)
  })

  it('lets the operator through on a locked tenant, stamped as the operator', async () => {
    h.session = operatorOnSealand
    world({ product_groups: [], products: [], product_aliases: [], config_changes: [] })
    const out = await addProductGroup(prev, form({ name: 'Backpacks' }))
    expect(out).toMatchObject({ ok: true, message: 'Added.' })
    expect(tables.product_groups[0]).toMatchObject({ client_id: SEALAND_CLIENT_ID, name: 'Backpacks', actor_kind: 'operator' })
    expect(changes()[0]).toMatchObject({ client_id: SEALAND_CLIENT_ID, surface: 'products', actor_kind: 'operator' })
    expect(String(changes()[0].actor_label)).toContain('operator@verbatim.example · operator view')
  })
})

describe('a missing migration', () => {
  it('writes nothing and says the list is not switched on', async () => {
    world({ config_changes: [] })
    for (const out of [
      await addProductGroup(prev, form({ name: 'Covers' })),
      await addProduct(prev, form({ group_id: LINERS, name: 'Iceross Ultra' })),
      await addProductAlias(prev, form({ product_id: SEAL_IN_X, alias: 'sealinx' })),
      await retireProductAlias(prev, form({ id: SEALIN_ALIAS })),
    ]) expect(out).toEqual({ ok: false, message: PRODUCTS_NOT_APPLIED })
    expect(writes()).toEqual([])
  })
})

describe('categories', () => {
  it('adds one after the others, stamped with the person, and logs it on the products surface', async () => {
    const out = await addProductGroup(prev, form({ name: '  Covers  ' }))
    expect(out).toMatchObject({ ok: true, message: 'Added.' })
    const added = tables.product_groups.find((g) => g.id === out.id)!
    expect(added).toMatchObject({ client_id: FIXTURE_CLIENT, name: 'Covers', status: 'active', sort: 5, actor_kind: 'user', actor_user_id: owner.userId })
    expect(changes()).toEqual([expect.objectContaining({
      client_id: FIXTURE_CLIENT, surface: 'products', field: 'product_groups', before: null,
      after: { id: out.id, name: 'Covers' }, actor_kind: 'user', actor_user_id: owner.userId,
    })])
    expect(String(changes()[0].actor_label)).toBe('owner@ossur.example · products: add a category')
    expect(h.revalidated).toEqual(['/dashboard/settings/products', '/dashboard/products', '/dashboard'])
  })

  it('refuses a name it already has, whatever the case', async () => {
    expect(await addProductGroup(prev, form({ name: 'liners' }))).toEqual({ ok: false, message: 'You already have a category called liners.' })
    expect(catalogueWrites()).toEqual([])
  })

  it('renames one in place, so its line keeps, and logs both names', async () => {
    const out = await renameProductGroup(prev, form({ id: LINERS, name: 'Liners and sleeves' }))
    expect(out).toMatchObject({ ok: true, message: 'Renamed.' })
    expect(row('product_groups', LINERS)).toMatchObject({ name: 'Liners and sleeves', status: 'active', actor_kind: 'user' })
    expect(changes()[0]).toMatchObject({ field: 'product_groups', before: { id: LINERS, name: 'Liners' }, after: { id: LINERS, name: 'Liners and sleeves' } })
  })

  it('removes one by retiring it with its products and every name under it, and deletes nothing', async () => {
    const out = await retireProductGroup(prev, form({ id: LINERS }))
    expect(out).toMatchObject({ ok: true, message: 'Removed.' })
    expect(db.calls.some((c) => c.op === 'delete')).toBe(false)
    expect(row('product_groups', LINERS)).toMatchObject({ status: 'retired', actor_kind: 'user' })
    expect(row('product_groups', LINERS).retired_at).toEqual(expect.any(String))
    const liners = tables.products.filter((p) => p.group_id === LINERS)
    expect(liners).toHaveLength(8)
    expect(liners.every((p) => p.status === 'retired' && typeof p.retired_at === 'string')).toBe(true)
    expect(tables.products.filter((p) => p.group_id === FEET).every((p) => p.status === 'active')).toBe(true)
    // Thirteen names sit under Liners (nine of its products', four its own); Unity's stays.
    const retired = tables.product_aliases.filter((a) => a.retired_at)
    expect(retired).toHaveLength(13)
    expect(retired.every((a) => a.retired_by === owner.userId && String(a.retired_label).includes('owner@ossur.example'))).toBe(true)
    expect(tables.product_aliases.find((a) => a.alias === 'unity')!.retired_at).toBeNull()
    expect(changes()).toHaveLength(1)
    expect(changes()[0]).toMatchObject({ surface: 'products', field: 'product_groups', after: expect.objectContaining({ status: 'retired' }) })
  })

  it('treats another client\'s category as not there', async () => {
    tables.product_groups[1].client_id = SEALAND_CLIENT_ID
    expect(await retireProductGroup(prev, form({ id: FEET }))).toEqual({ ok: false, message: 'That category is no longer here.' })
    expect(await renameProductGroup(prev, form({ id: FEET, name: 'Feet and ankles' }))).toEqual({ ok: false, message: 'That category is no longer here.' })
    expect(catalogueWrites()).toEqual([])
  })
})

describe('products', () => {
  it('adds one at the end of its category with its own name as one of its names', async () => {
    const out = await addProduct(prev, form({ group_id: LINERS, name: 'Iceross Ultra', common: 'on' }))
    expect(out).toMatchObject({ ok: true, message: 'Added.' })
    expect(tables.products.find((p) => p.id === out.id)).toMatchObject({ group_id: LINERS, name: 'Iceross Ultra', status: 'active', sort: 8, actor_kind: 'user' })
    expect(tables.product_aliases.find((a) => a.product_id === out.id)).toMatchObject({ alias: 'Iceross Ultra', kind: 'name', needs_confirm: true, actor_kind: 'user' })
    expect(changes()[0]).toMatchObject({ field: 'products', after: expect.objectContaining({ id: out.id, name: 'Iceross Ultra', name_alias: 'written' }) })
  })

  it('refuses a product name already on the list in any category', async () => {
    expect(await addProduct(prev, form({ group_id: FEET, name: 'iceross comfort' }))).toEqual({ ok: false, message: 'You already have a product called iceross comfort.' })
    expect(catalogueWrites()).toEqual([])
  })

  it('renames one, moving its own-name alias with it, and moves it between categories', async () => {
    const out = await editProduct(prev, form({ id: SEAL_IN_X, name: 'Iceross Seal-In X5', group_id: FEET }))
    expect(out).toMatchObject({ ok: true, message: 'Saved.' })
    expect(row('products', SEAL_IN_X)).toMatchObject({ name: 'Iceross Seal-In X5', group_id: FEET, sort: 9 })
    const names = tables.product_aliases.filter((a) => a.product_id === SEAL_IN_X && a.kind === 'name')
    expect(names.map((a) => [a.alias, a.retired_at == null])).toEqual([['Iceross Seal-In X', false], ['Iceross Seal-In X5', true]])
    // The nicknames are untouched: they still name it.
    expect(tables.product_aliases.filter((a) => a.product_id === SEAL_IN_X && a.kind === 'nickname').every((a) => a.retired_at === null)).toBe(true)
    expect(changes()[0]).toMatchObject({
      field: 'products',
      before: { id: SEAL_IN_X, name: 'Iceross Seal-In X', group_id: LINERS },
      after: expect.objectContaining({ id: SEAL_IN_X, name: 'Iceross Seal-In X5', group_id: FEET, name_alias: 'written' }),
    })
  })

  it('changes nothing for a save that changes nothing', async () => {
    expect(await editProduct(prev, form({ id: SEAL_IN_X, name: 'Iceross Seal-In X', group_id: LINERS }))).toMatchObject({ ok: true, message: 'Nothing to change.' })
    expect(writes()).toEqual([])
  })

  it('removes one by retiring it and its names, and deletes nothing', async () => {
    expect(await retireProduct(prev, form({ id: SEAL_IN_X }))).toMatchObject({ ok: true, message: 'Removed.' })
    expect(db.calls.some((c) => c.op === 'delete')).toBe(false)
    expect(row('products', SEAL_IN_X)).toMatchObject({ status: 'retired' })
    expect(tables.product_aliases.filter((a) => a.product_id === SEAL_IN_X).every((a) => a.retired_at)).toBe(true)
    expect(changes()[0]).toMatchObject({ field: 'products', after: expect.objectContaining({ status: 'retired' }) })
  })
})

describe('other names', () => {
  it('adds one to a product, logs it with the person, and keeps the common-word flag', async () => {
    const out = await addProductAlias(prev, form({ product_id: SYNERGY, alias: ' synergy liner ', common: 'on' }))
    expect(out).toMatchObject({ ok: true, message: 'Added.' })
    expect(tables.product_aliases.find((a) => a.id === out.id)).toMatchObject({
      client_id: FIXTURE_CLIENT, product_id: SYNERGY, group_id: null, alias: 'synergy liner', kind: 'nickname', needs_confirm: true,
      actor_kind: 'user', actor_user_id: owner.userId,
    })
    expect(changes()).toEqual([expect.objectContaining({
      surface: 'products', field: 'product_aliases', before: null, actor_kind: 'user', actor_user_id: owner.userId,
      after: { id: out.id, alias: 'synergy liner', kind: 'nickname', needs_confirm: true, product_id: SYNERGY, group_id: null },
      note: 'synergy liner was added as another name for Iceross Synergy.',
    })])
  })

  it('adds a word for a category in general', async () => {
    const out = await addProductAlias(prev, form({ group_id: LINERS, alias: 'sleeve', kind: 'category_word' }))
    expect(tables.product_aliases.find((a) => a.id === out.id)).toMatchObject({ product_id: null, group_id: LINERS, kind: 'category_word', needs_confirm: false })
    expect(changes()[0]).toMatchObject({ note: 'sleeve was added as a word for Liners in general.' })
  })

  it('refuses a word already on the list, and a kind a product cannot have', async () => {
    expect(await addProductAlias(prev, form({ product_id: SYNERGY, alias: 'SEALIN' }))).toEqual({ ok: false, message: 'SEALIN is already a name for something else on your list.' })
    expect(await addProductAlias(prev, form({ product_id: SEAL_IN_X, alias: 'sealin' }))).toEqual({ ok: false, message: 'sealin is already one of its names.' })
    expect(await addProductAlias(prev, form({ product_id: SYNERGY, alias: 'syn', kind: 'category_word' }))).toEqual({ ok: false, message: 'Say what kind of name it is.' })
    expect(catalogueWrites()).toEqual([])
  })

  it('takes a name off by retiring it, once, and deletes nothing', async () => {
    expect(await retireProductAlias(prev, form({ id: SEALIN_ALIAS }))).toMatchObject({ ok: true, message: 'Removed.' })
    expect(row('product_aliases', SEALIN_ALIAS)).toMatchObject({ alias: 'sealin', retired_by: owner.userId })
    expect(row('product_aliases', SEALIN_ALIAS).retired_at).toEqual(expect.any(String))
    // Only the three retirement columns move (the retire-once trigger's rule).
    const patch = db.calls.find((c) => c.table === 'product_aliases' && c.op === 'update')!.values as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['retired_at', 'retired_by', 'retired_label'])
    expect(changes()[0]).toMatchObject({ field: 'product_aliases', before: expect.objectContaining({ alias: 'sealin' }) })
    expect(await retireProductAlias(prev, form({ id: SEALIN_ALIAS }))).toEqual({ ok: false, message: 'That name is no longer on your list.' })
    expect(db.calls.some((c) => c.op === 'delete')).toBe(false)
  })
})
