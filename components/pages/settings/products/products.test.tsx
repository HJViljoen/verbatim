import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { fakeDb } from '@/lib/test/fake-db'
import { render, renderText } from '@/lib/test/render'
import { loadProductSettings, productSettingsView, PRODUCTS_HELD, PRODUCTS_NOT_APPLIED, PRODUCTS_PAGE_OFF, type ProductSettingsView } from '@/lib/settings/products'
import { fid, FIXTURE_CLIENT, FIXTURE_NOW, productsFixtureRead, productsFixtureTables } from './fixture'
import { ProductsTab } from './index'

// Settings › Your products, drawn to E8-Settings-Products (T10b): what the tab
// PRINTS (the render tier), for an owner, a member, an empty list and a
// workspace without the migration; and the loop the plan's "done when" names:
// adding another name logs a change and the name is on the page.

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

const owner = { supabase: null, userId: '00000000-0000-4000-8000-0000000000aa', email: 'owner@ossur.example', clientId: FIXTURE_CLIENT, role: 'owner', operator: null }

const view = (canEdit = true, over = {}, selected: string | null = null): ProductSettingsView =>
  productSettingsView(productsFixtureRead(over), { selected, canEdit })
const text = (v: ProductSettingsView | null) => renderText(<ProductsTab view={v} />).replace(/\s+/g, ' ')

function bans(markup: string) {
  expect(markup).not.toMatch(/border-l(-|\b)/)
  expect(markup).not.toContain('<mark')
  expect(markup).not.toContain('—')
  expect(markup).not.toMatch(/shadow-\[/)
}

describe('the Your products tab', () => {
  beforeEach(() => { h.session = owner })

  it('keeps the copy contract for an owner, a member, an unread month, an empty list and no migration', () => {
    const states: (ProductSettingsView | null)[] = [
      view(true), view(false), view(true, { readings: [] }), view(true, {}, fid(1, 5)),
      view(true, { groups: [], products: [], aliases: [], readings: [] }), view(false, { groups: [], products: [], aliases: [], readings: [] }),
      null,
    ]
    for (const v of states) {
      const markup = render(<ProductsTab view={v} />)
      assertCopyContract(markup)
      bans(markup)
    }
  })

  it('prints the board\'s blocks in its order', () => {
    const t = text(view())
    const order = [
      'We filled this in from ossur.com on 11 Oct.', 'Check the list, and add the other names people use for a product',
      'Categories', '38 products', 'Liners 8', 'Feet 9', 'Knees 6', 'Bracing & supports 9', 'Sockets & suspension 6', 'Add a category',
      'Liners 8 products · 3 came up in October so far · 11 videos we couldn\'t place yet', 'Rename', 'Add a product',
      'Words for the category liner liners prosthetic liner + Add a word', 'Names for the whole range Iceross + Add a name',
      'Product Other names people use This month',
      'Iceross Seal-In X seal in x sealin seal-in liner + Add a name 6 videos Edit',
      'Iceross Seal-In V seal in v + Add a name quiet Edit',
      'Iceross Synergy synergy checked + Add a name 2 videos Edit',
      'Iceross Comfort Cushion',
      'checked: an everyday word as well, so each mention is checked before it counts.',
      '11 videos in October are about one of your products in Liners, but we couldn\'t tell which.', 'Tag them in Your products →',
    ]
    const at = order.map((s) => t.indexOf(s))
    expect(at.filter((x) => x < 0), order.filter((_, i) => at[i] < 0).join(' | ')).toEqual([])
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('marks every count as a figure, lights the open category, and links the unclear videos to Your products', () => {
    const markup = render(<ProductsTab view={view()} />)
    expect(markup).toContain('<span data-copy="figure">38</span>')
    expect(markup).toContain('<span data-copy="figure" class="font-mono text-[14px]">6</span>')
    expect(markup).toMatch(/<a[^>]*aria-current="true"[^>]*href="\/dashboard\/settings\/products\?group=10000000-0000-4000-8000-000000000001"|<a[^>]*href="\/dashboard\/settings\/products\?group=10000000-0000-4000-8000-000000000001"[^>]*aria-current="true"/)
    expect(markup).toContain('href="/dashboard/products/10000000-0000-4000-8000-000000000001?month=2026-10#unclear"')
    // A product's own name is not printed again among its other names.
    expect(text(view())).not.toContain('Iceross Seal-In X Iceross Seal-In X')
  })

  it('prints a dot, never "quiet", for a month nothing has read, and drops the month from the line', () => {
    const t = text(view(true, { readings: [] }))
    expect(t).not.toContain('quiet')
    expect(t).not.toContain('came up')
    expect(t).not.toContain('couldn\'t tell which')
    expect(t).toContain('8 products Rename')
  })

  it('draws no control for a member, and no instruction they cannot follow', () => {
    const t = text(view(false))
    for (const gone of ['Add a', 'Rename', 'Edit', 'Check the list']) expect(t, gone).not.toContain(gone)
    expect(t).toContain('We filled this in from ossur.com on 11 Oct.')
    expect(t).toContain('seal in x')
  })

  it('lets an owner remove a category\'s word or range name, asked once, and a member see them only', () => {
    const owner = render(<ProductsTab view={view()} />)
    for (const word of ['liner', 'liners', 'prosthetic liner', 'Iceross']) expect(owner).toContain(`aria-label="Remove the name ${word}"`)
    expect(render(<ProductsTab view={view(false)} />)).not.toContain('Remove the name')
  })

  it('shows a locked tenant\'s owner the lock\'s line and every control disabled, before anything is submitted', () => {
    const v = productSettingsView(productsFixtureRead(), { selected: null, canEdit: true, locked: true })
    const markup = render(<ProductsTab view={v} />)
    const t = text(v)
    expect(t).toContain(`We filled this in from ossur.com on 11 Oct. ${PRODUCTS_HELD}`)
    expect(t).not.toContain('Check the list')
    const buttons = markup.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(10)
    for (const b of buttons) expect(b, b).toContain('disabled=""')
    assertCopyContract(markup)
  })

  // Decision 3: the tab reads Your products' month (the reading month). While
  // that is the current month it says "so far"; once it is a month that has
  // ended, it names it and says it is the last full month, and the column is
  // named for it rather than "This month".
  it('names the month it reads, and labels one that is not the current month', () => {
    const current = text(productSettingsView(productsFixtureRead(), { selected: null, canEdit: true, now: FIXTURE_NOW.toISOString() }))
    expect(current).toContain('Liners 8 products · 3 came up in October so far · 11 videos')
    expect(current).toContain('Product Other names people use This month')
    expect(current).not.toMatch(/last full month|earlier month/)
    const v = productSettingsView(productsFixtureRead(), { selected: null, canEdit: true, now: '2026-11-09T09:00:00.000Z' })
    expect(v.monthLabel).toBe('the last full month')
    const ended = text(v)
    expect(ended).toContain('Liners 8 products · 3 came up in October, the last full month · 11 videos')
    expect(ended).toContain('Product Other names people use October')
    expect(ended).not.toContain('This month')
    expect(ended).not.toContain('October so far')
    assertCopyContract(<ProductsTab view={v} />)
    // Off, no month at all, label or not.
    const off = text(productSettingsView(productsFixtureRead({ readingsOn: false }), { selected: null, canEdit: true, now: '2026-11-09T09:00:00.000Z' }))
    expect(off).not.toMatch(/came up in|last full month|October/)
  })

  it('says an empty list is empty, to an owner and to a member', () => {
    const empty = { groups: [], products: [], aliases: [], readings: [] }
    expect(text(view(true, empty))).toContain('No categories yet. Add a category No products listed yet Add a category, then the products in it')
    expect(text(view(false, empty))).toContain('An owner or admin can add your products here.')
  })

  it('says plainly that the products page is not switched on, and prints no count, while it is off', () => {
    const off = productSettingsView(productsFixtureRead({ readingsOn: false }), { selected: fid(1, 1), canEdit: true })
    const node = <ProductsTab view={off} />
    const t = text(off)
    expect(t.startsWith(PRODUCTS_PAGE_OFF)).toBe(true)
    expect(t).not.toMatch(/This month|came up in|quiet|couldn.t place|Tag them|\d+ videos?\b/)
    // The only figures are the list's own sizes: products per category.
    const on = text(productSettingsView(productsFixtureRead(), { selected: fid(1, 1), canEdit: true }))
    expect(on).toContain('This month')
    expect(on).not.toContain(PRODUCTS_PAGE_OFF)
    assertCopyContract(node)
  })

  it('says the list is not switched on where the migration is not applied', () => {
    expect(text(null)).toBe(`Your products ${PRODUCTS_NOT_APPLIED} When they are, this is where you keep the list of your products and the other names people use for them.`)
  })

  it('adding another name logs a change, and the name is on the page', async () => {
    const tables = productsFixtureTables()
    const db = fakeDb(tables)
    h.db = db.client
    const { addProductAlias } = await import('@/lib/actions/products')
    const f = new FormData()
    f.append('product_id', fid(2, 6)) // Iceross Sport: no other names yet
    f.append('alias', 'iceross sport liner')
    expect(await addProductAlias({ ok: false, message: '' }, f)).toMatchObject({ ok: true })
    expect(tables.config_changes).toEqual([expect.objectContaining({ surface: 'products', field: 'product_aliases', actor_kind: 'user', actor_user_id: owner.userId })])

    const read = await loadProductSettings(db.client as never, FIXTURE_CLIENT, FIXTURE_NOW, { readingsOn: true })
    if (read.state !== 'ready') throw new Error('expected a catalogue')
    const t = text(productSettingsView(read, { selected: fid(1, 1), canEdit: true }))
    expect(t).toMatch(/Iceross Sport iceross sport liner \+ Add a name quiet Edit/)
  })
})
