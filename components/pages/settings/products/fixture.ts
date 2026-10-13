import { OSSUR_CLIENT_ID } from '@/lib/config'
import type { AliasKind, MonthProductReadingRow, ProductAliasRow, ProductGroupRow, ProductRow } from '@/lib/products/types'
import type { ProductSettingsRead } from '@/lib/settings/products'

// Settings › Your products, as the E8 board draws it: Össur's catalogue filled
// in from ossur.com on 11 Oct (five categories, 38 products), Liners open, and
// October's readings on three of its products. The names are the board's; the
// counts are illustrative, like the board's, and the render tier asserts on
// them. Rows are stored rows (snake_case), so the same fixture feeds the
// loader through a fake database and the view directly.

export const FIXTURE_CLIENT = OSSUR_CLIENT_ID
export const FIXTURE_NOW = new Date('2026-10-13T09:00:00.000Z')
export const FIXTURE_MONTH = '2026-10-01'

const SEEDED_AT = '2026-10-11T09:00:00.000Z'
const SCRIPT = { actor_kind: 'script' as const, actor_user_id: null, actor_label: 'scripts/products.ts --apply' }

/** A v4-shaped uuid from a small number, so ids read in a failure. */
export const fid = (prefix: 1 | 2 | 3, n: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const CATALOGUE: { name: string; products: string[] }[] = [
  { name: 'Liners', products: ['Iceross Seal-In X', 'Iceross Seal-In V', 'Iceross Comfort', 'Iceross Synergy', 'Iceross Dermo', 'Iceross Sport', 'Iceross Upper-X', 'Iceross Comfort Cushion'] },
  { name: 'Feet', products: ['Pro-Flex XC', 'Pro-Flex LP', 'Pro-Flex Pivot', 'Vari-Flex', 'Re-Flex Rotate', 'Flex-Foot Assure', 'Proprio Foot', 'Balance Foot', 'Flex-Run'] },
  { name: 'Knees', products: ['Rheo Knee XC', 'Power Knee', 'Navii', 'Mauch Knee', 'Total Knee', 'Paso'] },
  { name: 'Bracing & supports', products: ['Unloader One X', 'Rebound PCL', 'Formfit Knee', 'Miami J', 'Rebound Air Walker', 'CTi', 'Unloader Spirit', 'Formfit Ankle', 'Rebound Cartilage'] },
  { name: 'Sockets & suspension', products: ['Direct Socket', 'Icelock Clutch', 'Icelock Lanyard', 'Unity', 'Wave Vacuum', 'Icelock Expulsion Valve'] },
]

export function fixtureGroups(): ProductGroupRow[] {
  return CATALOGUE.map((c, i) => ({
    id: fid(1, i + 1), client_id: FIXTURE_CLIENT, name: c.name, status: 'active', sort: i, seeded_from: 'ossur.com',
    retired_at: null, created_at: SEEDED_AT, updated_at: SEEDED_AT, ...SCRIPT,
  }))
}

export function fixtureProducts(): ProductRow[] {
  let n = 0
  return CATALOGUE.flatMap((c, gi) => c.products.map((name, i) => ({
    id: fid(2, ++n), client_id: FIXTURE_CLIENT, group_id: fid(1, gi + 1), name, status: 'active' as const, sort: i,
    seeded_from: 'ossur.com', retired_at: null, created_at: SEEDED_AT, updated_at: SEEDED_AT, ...SCRIPT,
  })))
}

const productId = (name: string): string => {
  const p = fixtureProducts().find((x) => x.name === name)
  if (!p) throw new Error(`fixture: no product ${name}`)
  return p.id
}

export function fixtureAliases(): ProductAliasRow[] {
  const LINERS = fid(1, 1)
  const rows: [string | null, string | null, string, AliasKind, boolean][] = [
    // The board's names under Liners.
    [productId('Iceross Seal-In X'), null, 'Iceross Seal-In X', 'name', false],
    [productId('Iceross Seal-In X'), null, 'seal in x', 'nickname', false],
    [productId('Iceross Seal-In X'), null, 'sealin', 'nickname', false],
    [productId('Iceross Seal-In X'), null, 'seal-in liner', 'nickname', false],
    [productId('Iceross Seal-In V'), null, 'seal in v', 'nickname', false],
    [productId('Iceross Comfort'), null, 'comfort liner', 'nickname', false],
    [productId('Iceross Synergy'), null, 'synergy', 'nickname', true],
    [productId('Iceross Dermo'), null, 'dermo', 'nickname', false],
    [productId('Iceross Upper-X'), null, 'upper x', 'nickname', false],
    // The category's own words, and the range's name.
    [null, LINERS, 'liner', 'category_word', false],
    [null, LINERS, 'liners', 'category_word', false],
    [null, LINERS, 'prosthetic liner', 'category_word', false],
    [null, LINERS, 'Iceross', 'nickname', false],
    // A common word under Sockets & suspension.
    [productId('Unity'), null, 'unity', 'nickname', true],
  ]
  return rows.map(([product_id, group_id, alias, kind, needs_confirm], i) => ({
    id: fid(3, i + 1), client_id: FIXTURE_CLIENT, product_id, group_id, alias, kind, needs_confirm,
    seeded_from: 'ossur.com', created_at: SEEDED_AT, ...SCRIPT, retired_at: null, retired_by: null, retired_label: null,
  }))
}

const reading = (
  object_kind: 'group' | 'product', object_id: string, group_id: string, audience: string,
  k: { named?: number; unclear?: number; unbranded?: number },
): MonthProductReadingRow => {
  const k_named = k.named ?? 0
  const k_unclear = k.unclear ?? 0
  const k_unbranded = k.unbranded ?? 0
  const k_any = k_named + k_unclear + k_unbranded
  // T11 adds the organic base (k_organic, n_organic) to the row before the
  // migration is applied; built as a value rather than returned as a literal so
  // this fixture types with and without those two columns.
  const row = {
    client_id: FIXTURE_CLIENT, month: FIXTURE_MONTH, audience, object_kind, object_id, group_id,
    product_id: object_kind === 'product' ? object_id : null, k_named, k_unclear, k_unbranded,
    k_any, k_organic: k_any, comments: k_any * 3, n: 318, n_organic: 300, status: 'filling' as const,
    origin: 'live' as const, read_at: '2026-10-12T04:00:00.000Z', run_id: null, rule_version: 'pr1', catalogue_version: 'pc1_0123456789abcdef', frozen_at: null,
  }
  return row
}

/** October so far: Seal-In X in six videos (one of them Össur's own), Comfort
 *  in three, Synergy in two, and eleven videos about one of the liners the
 *  rules could not tell. */
export function fixtureReadings(): MonthProductReadingRow[] {
  const LINERS = fid(1, 1)
  return [
    reading('product', productId('Iceross Seal-In X'), LINERS, 'industry-other', { named: 5 }),
    reading('product', productId('Iceross Seal-In X'), LINERS, 'client', { named: 1 }),
    reading('product', productId('Iceross Comfort'), LINERS, 'industry-other', { named: 3 }),
    reading('product', productId('Iceross Synergy'), LINERS, 'industry-other', { named: 2 }),
    reading('group', LINERS, LINERS, 'industry-other', { named: 10, unclear: 10, unbranded: 30 }),
    reading('group', LINERS, LINERS, 'competitor:Ottobock', { unclear: 1 }),
  ]
}

/** The loader's answer for the board's state. */
export function productsFixtureRead(over: Partial<Extract<ProductSettingsRead, { state: 'ready' }>> = {}): Extract<ProductSettingsRead, { state: 'ready' }> {
  return {
    state: 'ready',
    groups: fixtureGroups(),
    products: fixtureProducts(),
    aliases: fixtureAliases(),
    month: FIXTURE_MONTH,
    readings: fixtureReadings(),
    ...over,
  }
}

/** The tables a fake database holds for the same state. */
export function productsFixtureTables(): Record<string, Record<string, unknown>[]> {
  return {
    product_groups: fixtureGroups() as unknown as Record<string, unknown>[],
    products: fixtureProducts() as unknown as Record<string, unknown>[],
    product_aliases: fixtureAliases() as unknown as Record<string, unknown>[],
    month_product_readings: fixtureReadings() as unknown as Record<string, unknown>[],
    config_changes: [],
  }
}
