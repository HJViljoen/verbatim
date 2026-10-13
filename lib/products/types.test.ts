import { describe, it, expect } from 'vitest'

import {
  CATALOGUE_VERSION_PATTERN, isCatalogueVersion, isMissingProductsSchema, parseCatalogue, PLACEMENT_METHOD_PRECEDENCE,
  PLACEMENT_METHODS, standingTags, tagTargetKey, type ProductTagRow,
} from './types'

const G = '00000000-0000-4000-8000-0000000000a1'
const P = '00000000-0000-4000-8000-0000000000b1'
const V = '00000000-0000-4000-8000-0000000000c1'
const C = '00000000-0000-4000-8000-0000000000d1'

const catalogue = {
  version: 'pc1_0123456789abcdef',
  groups: [{ id: G, name: 'Liners', sort: 0 }],
  products: [{ id: P, group_id: G, name: 'Seal-In X5', sort: 0 }],
  aliases: [
    { id: 'a1', product_id: P, group_id: null, alias: 'seal-in x5', kind: 'name', needs_confirm: false },
    { id: 'a2', product_id: null, group_id: G, alias: 'liner', kind: 'category_word', needs_confirm: false },
  ],
}

describe('the catalogue version', () => {
  it('is pc<n>_ and sixteen hex, as product_catalogue mints it', () => {
    for (const ok of ['pc1_0123456789abcdef', 'pc12_ffffffffffffffff']) expect(isCatalogueVersion(ok), ok).toBe(true)
    for (const bad of ['', 'pc1_', 'pc1_0123456789ABCDEF', 'pc_0123456789abcdef', 'pc1_0123456789abcde', 'products_v1', null, 7]) {
      expect(isCatalogueVersion(bad), String(bad)).toBe(false)
    }
    expect(CATALOGUE_VERSION_PATTERN.test('xpc1_0123456789abcdef')).toBe(false)
  })
})

describe('parseCatalogue', () => {
  it('reads the RPC\'s jsonb', () => {
    expect(parseCatalogue(catalogue)).toEqual(catalogue)
  })

  it('reads nothing it does not know: no version, a bad alias kind, an alias with two targets or none', () => {
    expect(parseCatalogue(null)).toBeNull()
    expect(parseCatalogue({ ...catalogue, version: 'v1' })).toBeNull()
    expect(parseCatalogue({ ...catalogue, groups: 'Liners' })).toBeNull()
    expect(parseCatalogue({ ...catalogue, aliases: [{ ...catalogue.aliases[0], kind: 'slang' }] })).toBeNull()
    expect(parseCatalogue({ ...catalogue, aliases: [{ ...catalogue.aliases[0], group_id: G }] })).toBeNull()
    expect(parseCatalogue({ ...catalogue, aliases: [{ ...catalogue.aliases[0], product_id: null }] })).toBeNull()
    expect(parseCatalogue({ ...catalogue, products: [{ id: P, name: 'Seal-In X5', sort: 0 }] })).toBeNull()
  })

  it('reads an empty catalogue that has a version (a category with nothing in it yet)', () => {
    const bare = { version: 'pc1_ffffffffffffffff', groups: [{ id: G, name: 'Liners', sort: 0 }], products: [], aliases: [] }
    expect(parseCatalogue(bare)).toEqual(bare)
  })
})

describe('isMissingProductsSchema', () => {
  it('is the migration missing: one of its names, and a missing relation or function', () => {
    expect(isMissingProductsSchema({ code: 'PGRST202', message: 'Could not find the function public.product_catalogue(p_client) in the schema cache' })).toBe(true)
    expect(isMissingProductsSchema({ code: '42P01', message: 'relation "public.month_product_readings" does not exist' })).toBe(true)
    // selectAll flattens the error to its sentence
    expect(isMissingProductsSchema(new Error('selectAll: Could not find the table \'public.month_product_readings\' in the schema cache'))).toBe(true)
  })

  it('is not any other failure, nor another table\'s absence', () => {
    expect(isMissingProductsSchema(null)).toBe(false)
    expect(isMissingProductsSchema({ code: '42501', message: 'permission denied for table product_mentions' })).toBe(false)
    expect(isMissingProductsSchema({ code: 'PGRST205', message: 'Could not find the table \'public.brand_mentions\' in the schema cache' })).toBe(false)
  })
})

describe('the placement precedence', () => {
  it('ranks every method once: a person, the confirm call, the classifier, the rules', () => {
    expect([...PLACEMENT_METHOD_PRECEDENCE]).toEqual(['tag', 'confirmed', 'model', 'rule'])
    expect([...PLACEMENT_METHOD_PRECEDENCE].sort()).toEqual([...PLACEMENT_METHODS].sort())
  })
})

describe('standingTags', () => {
  const tag = (over: Partial<ProductTagRow>): ProductTagRow => ({
    id: 't1', client_id: 'c', video_id: V, comment_id: C, placement: 'named', product_id: P, group_id: G, supersedes: null,
    actor_kind: 'user', actor_user_id: 'u', actor_label: 'member@example.test', created_at: '2026-10-13T09:00:00+00:00', ...over,
  })

  it('keeps the newest tag on each target, a comment and the video as a whole apart', () => {
    const first = tag({ id: 't1' })
    const retag = tag({ id: 't2', placement: 'none', product_id: null, group_id: null, supersedes: 't1', created_at: '2026-10-13T10:00:00+00:00' })
    const whole = tag({ id: 't3', comment_id: null, placement: 'unbranded', product_id: null })
    const standing = standingTags([retag, first, whole])
    expect(standing.size).toBe(2)
    expect(standing.get(tagTargetKey(V, C))?.id).toBe('t2')
    expect(standing.get(tagTargetKey(V, null))?.id).toBe('t3')
  })

  it('orders by microseconds Date drops, then by id, and reads an unparseable time as oldest', () => {
    const a = tag({ id: 'ta', created_at: '2026-10-13T09:00:00.123401+00:00' })
    const b = tag({ id: 'tb', created_at: '2026-10-13T09:00:00.123402+00:00' })
    expect(standingTags([b, a]).get(tagTargetKey(V, C))?.id).toBe('tb')
    const same = tag({ id: 'tz', created_at: a.created_at })
    expect(standingTags([same, a]).get(tagTargetKey(V, C))?.id).toBe('tz')
    const bad = tag({ id: 'tq', created_at: 'not a time' })
    expect(standingTags([a, bad]).get(tagTargetKey(V, C))?.id).toBe('ta')
  })
})
