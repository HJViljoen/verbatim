import { describe, expect, it } from 'vitest'

import {
  FIXTURE_CLIENT, FIXTURE_NOW, fid, productsFixtureRead, productsFixtureTables,
} from '@/components/pages/settings/products/fixture'
import { fakeDb } from '../test/fake-db'
import { aliasTextProblem, catalogueText, loadProductSettings, productSettingsView, productsTabHref } from './products'

// Settings › Your products: the read and the view (T10b). Pure, or over the
// fake database: no network.

describe('catalogueText', () => {
  it('collapses spaces and trims, as the schema stores a name', () => {
    expect(catalogueText('  Iceross   Seal-In X ', 'product')).toEqual({ ok: true, text: 'Iceross Seal-In X' })
  })

  it('holds each kind to its own length, in words', () => {
    expect(catalogueText('', 'group')).toEqual({ ok: false, message: 'Type the category first.' })
    expect(catalogueText('x', 'alias')).toEqual({ ok: false, message: 'Give the name at least 2 letters.' })
    expect(catalogueText('a'.repeat(61), 'group')).toEqual({ ok: false, message: 'Keep the category under 60 characters.' })
    expect(catalogueText('a'.repeat(80), 'product').ok).toBe(true)
    expect(catalogueText('a'.repeat(81), 'product').ok).toBe(false)
  })

  it('refuses a control character the CHECK would refuse', () => {
    expect(catalogueText('seal\u0007in', 'alias')).toEqual({ ok: false, message: 'Type the name as plain words.' })
  })

  it('holds a name and a product to what the matcher reads, and a category to the schema alone', () => {
    const CHARS = "Use letters, numbers, spaces and & . ' + - only, so the name can be found as it is written."
    for (const bad of ['C-Leg®', 'Pro/Flex', 'feet (prosthetic)']) {
      expect(catalogueText(bad, 'alias'), bad).toEqual({ ok: false, message: CHARS })
      expect(catalogueText(bad, 'product'), bad).toEqual({ ok: false, message: CHARS })
    }
    expect(catalogueText('--', 'alias')).toEqual({ ok: false, message: 'Give the name at least two letters or numbers.' })
    expect(catalogueText('X', 'product')).toEqual({ ok: false, message: 'Give the name at least two letters or numbers.' })
    for (const good of ['Pro-Flex XC', 'Rheo Knee 3', 'Formfit Pro+', 'St. Liner', "Össur's liner", 'Bracing & supports']) {
      expect(catalogueText(good, 'alias').ok, good).toBe(true)
    }
    expect(catalogueText('Feet (prosthetic)', 'group')).toEqual({ ok: true, text: 'Feet (prosthetic)' })
  })
})

describe('aliasTextProblem', () => {
  it('is null for a name the matcher reads, and a sentence for one it cannot', () => {
    expect(aliasTextProblem('seal-in liner')).toBeNull()
    expect(aliasTextProblem('a')).toBe('Give the name at least two letters or numbers.')
    expect(aliasTextProblem('pro/flex')).toMatch(/^Use letters, numbers/)
  })
})

describe('loadProductSettings', () => {
  it('reads the live catalogue and this month\'s readings, on the session\'s client', async () => {
    const db = fakeDb(productsFixtureTables())
    const read = await loadProductSettings(db.client as never, FIXTURE_CLIENT, FIXTURE_NOW)
    expect(read.state).toBe('ready')
    if (read.state !== 'ready') return
    expect(read.month).toBe('2026-10-01')
    expect(read.groups).toHaveLength(5)
    expect(read.products).toHaveLength(38)
    // Every read names the client, and only live rows are asked for.
    for (const c of db.calls.filter((c) => c.op === 'select')) expect(c.filters).toContain(`client_id=${FIXTURE_CLIENT}`)
    expect(db.calls.find((c) => c.table === 'product_groups')?.filters).toContain('status=active')
    expect(db.calls.find((c) => c.table === 'product_aliases')?.filters).toContain('retired_at is null')
    expect(db.calls.find((c) => c.table === 'month_product_readings')?.filters).toContain('month in 1')
  })

  it('answers missing, never throws, where the migration is not applied', async () => {
    const db = fakeDb({ config_changes: [] })
    expect(await loadProductSettings(db.client as never, FIXTURE_CLIENT, FIXTURE_NOW)).toEqual({ state: 'missing' })
  })

  it('throws any other failure, so a page never shows an empty list as the client\'s', async () => {
    const broken = { from: () => ({ select: () => { throw Object.assign(new Error('connection reset'), { code: '08006' }) } }) }
    await expect(loadProductSettings(broken as never, FIXTURE_CLIENT, FIXTURE_NOW)).rejects.toThrow('connection reset')
  })

  it('reads no month when there is no category', async () => {
    const db = fakeDb({ ...productsFixtureTables(), product_groups: [], products: [], product_aliases: [] })
    const read = await loadProductSettings(db.client as never, FIXTURE_CLIENT, FIXTURE_NOW)
    expect(read).toMatchObject({ state: 'ready', groups: [], readings: [] })
    expect(db.calls.some((c) => c.table === 'month_product_readings')).toBe(false)
  })
})

describe('productSettingsView', () => {
  const view = (over = {}, selected: string | null = null) => productSettingsView(productsFixtureRead(over), { selected, canEdit: true })

  it('lists the categories in their order with their products, and opens the first by default', () => {
    const v = view()
    expect(v.total).toBe(38)
    expect(v.categories.map((c) => [c.name, c.products])).toEqual([
      ['Liners', 8], ['Feet', 9], ['Knees', 6], ['Bracing & supports', 9], ['Sockets & suspension', 6],
    ])
    expect(v.categories[0]).toMatchObject({ selected: true, href: productsTabHref(fid(1, 1)) })
    expect(v.open?.name).toBe('Liners')
    expect(v.seeded).toEqual({ from: 'ossur.com', on: '11 Oct' })
    expect(v.monthName).toBe('October')
  })

  it('opens the category the address names, and the first for one it does not know', () => {
    expect(view({}, fid(1, 3)).open?.name).toBe('Knees')
    expect(view({}, 'not-a-category').open?.name).toBe('Liners')
  })

  it('counts a product\'s videos over every audience, the client\'s included (Your products\' basis), and the category\'s unclear videos', () => {
    const open = view().open!
    const by = Object.fromEntries(open.rows.map((r) => [r.name, r.videos]))
    // Six videos name Seal-In X, one of them filed under the client (a
    // creator's video about Össur, or a comment on its own post): all six.
    expect(by['Iceross Seal-In X']).toBe(6)
    expect(by['Iceross Comfort']).toBe(3)
    expect(by['Iceross Seal-In V']).toBe(0)
    expect(open.cameUp).toBe(3)
    expect(open.unclear).toBe(11)
  })

  it('prints no figure for a product the month holds no row for, even where other rows exist', () => {
    const readings = productsFixtureRead().readings.filter((r) => r.object_id !== fid(2, 2)) // Seal-In V's zero row
    const open = view({ readings }).open!
    expect(open.rows.find((r) => r.name === 'Iceross Seal-In V')!.videos).toBeNull()
    expect(open.rows.find((r) => r.name === 'Iceross Dermo')!.videos).toBe(0)
    // A category with no row of its own has no unclear count.
    expect(view({ readings: readings.filter((r) => r.object_kind === 'product') }).open!.unclear).toBeNull()
    // Knees' products have no row at all.
    expect(view({}, fid(1, 3)).open!.rows.every((r) => r.videos === null)).toBe(true)
  })

  it('draws the controls disabled for an owner or admin the lock holds, never for a member', () => {
    expect(productSettingsView(productsFixtureRead(), { canEdit: true, locked: true }).locked).toBe(true)
    expect(productSettingsView(productsFixtureRead(), { canEdit: false, locked: true }).locked).toBe(false)
    expect(productSettingsView(productsFixtureRead(), { canEdit: true }).locked).toBe(false)
  })

  it('says nothing about the month where no product row exists: unread, not quiet', () => {
    const open = view({ readings: [] }).open!
    expect(open.rows.every((r) => r.videos === null)).toBe(true)
    expect(open.cameUp).toBeNull()
    expect(open.unclear).toBeNull()
  })

  it('leaves a product\'s own name out of its other names, and splits the category\'s words by kind', () => {
    const open = view().open!
    const sealIn = open.rows.find((r) => r.name === 'Iceross Seal-In X')!
    expect(sealIn.aliases.map((a) => a.alias)).toEqual(['seal in x', 'sealin', 'seal-in liner'])
    expect(open.words.map((a) => a.alias)).toEqual(['liner', 'liners', 'prosthetic liner'])
    expect(open.ranges.map((a) => a.alias)).toEqual(['Iceross'])
    expect(open.rows.find((r) => r.name === 'Iceross Synergy')!.aliases).toEqual([
      expect.objectContaining({ alias: 'synergy', needsConfirm: true }),
    ])
    expect(view().anyConfirm).toBe(true)
  })

  it('draws no seed line for a list a person built', () => {
    const groups = productsFixtureRead().groups.map((g) => ({ ...g, seeded_from: null }))
    expect(view({ groups }).seeded).toBeNull()
  })

  it('opens nothing where there is no category', () => {
    const v = view({ groups: [], products: [], aliases: [], readings: [] })
    expect(v.open).toBeNull()
    expect(v.categories).toEqual([])
    expect(v.total).toBe(0)
  })
})
