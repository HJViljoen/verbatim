import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../config'
import { FIXTURE_SEED } from '../test/products-fixtures'
import { hashSample, parseProductsArgs, planSeedLoad } from './script'
import { seedRows } from './seed'

const PROD = 'mkwjlckescdveosvrvaq'
const base = ['--client', OSSUR_CLIENT_ID, '--project', PROD, '--confirm']
const NOW = new Date('2026-10-13T10:00:00Z')

describe('scripts/products.ts: the flags', () => {
  it('a seed load is dry unless --apply', () => {
    expect(parseProductsArgs([...base, '--seed', 's.ts'], NOW).mode).toEqual({ kind: 'seed', seed: 's.ts', apply: false })
    expect(parseProductsArgs([...base, '--seed', 's.ts', '--apply'], NOW).mode).toEqual({ kind: 'seed', seed: 's.ts', apply: true })
  })

  it('the back-read takes exactly one of --dry-run and --write, June to the first of next month by default', () => {
    const dry = parseProductsArgs([...base, '--back-read', '--dry-run', '--seed', 's.ts'], NOW)
    expect(dry).toMatchObject({ mode: { kind: 'back-read', write: false, seed: 's.ts', sampleModel: 0 }, from: '2026-06-01', to: '2026-11-01', budgetUsd: 0, maxReads: 80 })
    const write = parseProductsArgs([...base, '--back-read', '--write'], NOW)
    expect(write).toMatchObject({ mode: { kind: 'back-read', write: true, seed: null }, budgetUsd: 5 })
    expect(() => parseProductsArgs([...base, '--back-read'], NOW)).toThrow(/exactly one of --dry-run and --write/)
    expect(() => parseProductsArgs([...base, '--back-read', '--dry-run', '--write'], NOW)).toThrow(/exactly one/)
  })

  it('refuses what would mix a write with a dry run\'s inputs, and a typo', () => {
    expect(() => parseProductsArgs([...base, '--back-read', '--write', '--seed', 's.ts'], NOW)).toThrow(/--write reads the catalogue the database holds/)
    expect(() => parseProductsArgs([...base, '--back-read', '--write', '--sample-model', '50'], NOW)).toThrow(/--sample-model is a dry run/)
    expect(() => parseProductsArgs([...base, '--back-read', '--dry-run', '--apply'], NOW)).toThrow(/--apply loads a seed/)
    expect(() => parseProductsArgs([...base, '--seed', 's.ts', '--write'], NOW)).toThrow(/a seed load is dry unless --apply/)
    expect(() => parseProductsArgs([...base, '--seed', 's.ts', '--aply'], NOW)).toThrow(/unknown flag --aply/)
    expect(() => parseProductsArgs([...base], NOW)).toThrow(/say what to do/)
  })

  it('a model sample needs a sheet, and defaults to a dollar', () => {
    expect(() => parseProductsArgs([...base, '--back-read', '--dry-run', '--sample-model', '50'], NOW)).toThrow(/needs --sample-out/)
    expect(parseProductsArgs([...base, '--back-read', '--dry-run', '--sample-model', '50', '--sample-out', 'x.md'], NOW)).toMatchObject({ budgetUsd: 1, mode: { sampleModel: 50 } })
  })

  it('reads production only with --confirm, and only an allow-listed project; the window is firsts of months', () => {
    expect(() => parseProductsArgs(['--client', OSSUR_CLIENT_ID, '--project', PROD, '--seed', 's.ts'], NOW)).toThrow(/needs --confirm/)
    expect(() => parseProductsArgs(['--client', OSSUR_CLIENT_ID, '--project', 'abcdefghijklmnopqrst', '--seed', 's.ts'], NOW)).toThrow(/not allow-listed/)
    expect(() => parseProductsArgs(['--client', 'ossur', '--project', PROD, '--confirm', '--seed', 's.ts'], NOW)).toThrow(/must be a uuid/)
    expect(() => parseProductsArgs([...base, '--back-read', '--dry-run', '--from', '2026-06-15'], NOW)).toThrow(/firsts of months/)
  })
})

describe('scripts/products.ts: the seed load is append-only', () => {
  const rows = seedRows(FIXTURE_SEED)

  it('on an empty catalogue: every row', () => {
    const plan = planSeedLoad(rows, { groups: [], products: [], aliases: [] })
    expect([plan.groups.length, plan.products.length, plan.aliases.length]).toEqual([rows.groups.length, rows.products.length, rows.aliases.length])
    expect(plan.conflicts).toEqual([])
  })

  it('a second load writes nothing: every row is held, case aside', () => {
    const held = {
      groups: rows.groups.map((g) => ({ id: `db-${g.key}`, name: g.name.toUpperCase() })),
      products: rows.products.map((p) => ({ id: `db-${p.key}`, name: p.name, group_id: `db-${p.groupKey}` })),
      aliases: rows.aliases.map((a) => ({ alias: a.alias.toLowerCase(), product_id: a.productKey ? `db-${a.productKey}` : null, group_id: a.groupKey ? `db-${a.groupKey}` : null })),
    }
    const plan = planSeedLoad(rows, held)
    expect([plan.groups.length, plan.products.length, plan.aliases.length]).toEqual([0, 0, 0])
    expect(plan.held).toEqual({ groups: rows.groups.length, products: rows.products.length, aliases: rows.aliases.length })
    expect(plan.conflicts).toEqual([])
  })

  it('a row held differently is named and left: a product in another category, a word under another target', () => {
    const held = {
      groups: [{ id: 'db-liners', name: 'Liners' }, { id: 'db-feet', name: 'Feet' }],
      products: [{ id: 'db-x5', name: 'Iceross Seal-In X5', group_id: 'db-feet' }],
      aliases: [{ alias: 'iceross', product_id: 'db-x5', group_id: null }],
    }
    const plan = planSeedLoad(rows, held)
    expect(plan.conflicts).toEqual([
      'product "Iceross Seal-In X5" is held under "Feet", the seed has it under "Liners": left where it is',
      '"Iceross" already places talk under product "Iceross Seal-In X5"; the seed has it under category "Liners": left as it is',
    ])
    expect(plan.groups.map((g) => g.name)).toEqual(['Knees', 'Sockets'])
    expect(plan.products.some((p) => p.name === 'Iceross Seal-In X5')).toBe(false)
    // a new product under a held category carries the held id; under a new one, none until it is written
    expect(plan.products.find((p) => p.name === 'Iceross Comfort')!.groupId).toBe('db-liners')
    expect(plan.products.find((p) => p.name === 'Rheo Knee')!.groupId).toBeNull()
  })
})

describe('hashSample', () => {
  it('takes the same rows on every run, whatever order they arrive in', () => {
    const xs = Array.from({ length: 40 }, (_, i) => `row-${i}`)
    const a = hashSample(xs, 10, (x) => x)
    expect(a).toHaveLength(10)
    expect(hashSample([...xs].reverse(), 10, (x) => x)).toEqual(a)
    expect(hashSample(xs, 0, (x) => x)).toEqual([])
  })
})
