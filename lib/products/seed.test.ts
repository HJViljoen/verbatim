import { describe, expect, it } from 'vitest'

import { OSSUR_PRODUCTS } from '../../scripts/seeds/ossur-products'
import { OSSUR_CLIENT_ID } from '../config'
import { FIXTURE_SEED } from '../test/products-fixtures'
import { compileCatalogue } from './rules'
import { seedCatalogue, seedId, seedProblems, seedRows, type CatalogueSeed } from './seed'
import { isCatalogueVersion, parseCatalogue } from './types'

describe('a seed\'s rows', () => {
  it('makes a category, its words and families, its products, each product\'s name and other names', () => {
    const rows = seedRows(FIXTURE_SEED)
    expect(rows.groups.map((g) => g.name)).toEqual(['Liners', 'Feet', 'Knees', 'Sockets'])
    const liners = rows.groups[0].key
    expect(rows.aliases.filter((a) => a.groupKey === liners).map((a) => [a.alias, a.kind])).toEqual([
      ['liner', 'category_word'], ['prosthetic liner', 'category_word'], ['Iceross', 'nickname'],
    ])
    const comfort = rows.products.find((p) => p.name === 'Iceross Comfort')!.key
    expect(rows.aliases.filter((a) => a.productKey === comfort).map((a) => [a.alias, a.kind, a.needsConfirm])).toEqual([
      ['Iceross Comfort', 'name', false], ['Comfort', 'nickname', true],
    ])
    expect(rows.aliases.find((a) => a.alias === 'Total Knee')).toMatchObject({ kind: 'name', needsConfirm: true })
  })

  it('ids are stable and uuid-shaped; the in-memory catalogue parses as the RPC\'s and versions like it', () => {
    expect(seedId('a', 'b')).toBe(seedId('a', 'b'))
    expect(seedId('a', 'b')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    const c = seedCatalogue(FIXTURE_SEED)
    expect(parseCatalogue(c)).toEqual(c)
    expect(isCatalogueVersion(c.version)).toBe(true)
    expect(seedCatalogue(FIXTURE_SEED).version).toBe(c.version)
    const edited: CatalogueSeed = { ...FIXTURE_SEED, groups: [{ ...FIXTURE_SEED.groups[0], words: ['liner'] }, ...FIXTURE_SEED.groups.slice(1)] }
    expect(seedCatalogue(edited).version).not.toBe(c.version)
  })

  it('refuses a seed that would not load: a word under two targets, a name the matcher cannot read, a category with no word', () => {
    expect(seedProblems(FIXTURE_SEED)).toEqual([])
    const bad: CatalogueSeed = {
      seededFrom: 'ossur.com', compiledOn: '13 Oct',
      groups: [
        { name: 'Liners', words: ['liner'], products: [{ name: 'Seal-In X', aliases: ['LINER'] }, { name: 'C-Leg®' }] },
        { name: 'Feet', words: [], products: [] },
      ],
    }
    expect(seedProblems(bad)).toEqual([
      'compiledOn 13 Oct is not YYYY-MM-DD',
      'alias (one word, one target) "liner" appears twice',
      'alias "C-Leg®" is not a name the matcher reads (letters, digits, spaces and & . \' - + only)',
      'category "Feet" has no word for the category in general',
    ])
  })
})

describe('the Össur seed (scripts/seeds/ossur-products.ts, for Heinrich\'s review)', () => {
  const rows = seedRows(OSSUR_PRODUCTS)

  it('loads: no problem, every alias compiled, at least the five categories Heinrich named (11 Oct)', () => {
    expect(seedProblems(OSSUR_PRODUCTS)).toEqual([])
    expect(compileCatalogue(seedCatalogue(OSSUR_PRODUCTS), OSSUR_CLIENT_ID).refused).toEqual([])
    const names = rows.groups.map((g) => g.name.toLowerCase())
    for (const want of ['liners', 'feet', 'knees', 'sockets', 'bracing']) expect(names.some((n) => n.includes(want)), want).toBe(true)
    expect(OSSUR_PRODUCTS.seededFrom).toBe('ossur.com')
  })

  it('flags the generic names the plan names, and the bare category words that are mostly another thing', () => {
    const flagged = new Set(rows.aliases.filter((a) => a.needsConfirm).map((a) => a.alias.toLowerCase()))
    for (const g of ['unity', 'total knee', 'socket', 'brace', 'cheetah', 'rebound', 'unloader', 'seal-in', 'cheetah blade', 'cheetah blades', 'pin lock', 'power knee']) expect(flagged.has(g), g).toBe(true)
    expect(rows.products.map((p) => p.name)).toEqual(expect.arrayContaining(['AeroFit Seal-In', 'AeroFit Socket']))
    for (const body of ['knee', 'foot', 'feet']) expect(rows.aliases.some((a) => a.alias.toLowerCase() === body), body).toBe(false)
  })

  it('carries a source page above every product', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../scripts/seeds/ossur-products.ts', import.meta.url), 'utf8')
    for (const p of rows.products) {
      const at = src.indexOf(`name: '${p.name.replace(/'/g, "\\'")}'`)
      expect(at, p.name).toBeGreaterThan(0)
      const before = src.slice(0, at).split('\n').slice(-4).join('\n')
      expect(before, p.name).toMatch(/\/\/ https:\/\/(www|media)\.ossur\.com\//)
    }
  })
})
