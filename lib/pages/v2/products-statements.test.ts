import { describe, expect, it } from 'vitest'

import { readingHandle } from '../../reading/read'
import { productsDb, PRODUCTS_DB_CLIENT } from './products-db-fixture'
import { PRODUCT_IDS } from './products-fixture'
import { loadProducts, parseProductsParams } from './products'

// YOUR PRODUCTS' STATEMENTS, COUNTED OFFLINE. Every `.from(table)` and
// `.rpc(fn)` a page load makes, against Össur's fixture database
// (products-db-fixture.ts), so a change to what a page reads shows up as a
// number in a diff (Market's harness, lib/pages/v2/market-statements.test.ts).
// The figures are this stand-in's: production pages more rows past the 1,000
// cap.

const NOW = new Date('2026-10-13T08:00:00.000Z').toISOString()

async function statements(raw: Record<string, string>): Promise<{ total: number; by: Record<string, number> }> {
  const db = productsDb()
  await loadProducts({ supabase: db.client as never, clientId: PRODUCTS_DB_CLIENT, reading: readingHandle(PRODUCTS_DB_CLIENT, db.client as never), params: parseProductsParams(raw), role: 'owner', now: NOW })
  const by: Record<string, number> = {}
  for (const c of db.calls) by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] = (by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] ?? 0) + 1
  return { total: db.calls.length, by }
}

// TODAY'S PAGE, BEFORE THE LEVEL PAGES (17 Oct, measured at d4e1480b): the
// root 33, a category open in place 40 (its couldn't-tell-which texts:
// comments, videos, translations, the quote gate's context), a product open
// in place 39 (its comments naming it, the same reads).
describe('Your products\' statements, page by page', () => {
  it('counts each load', async () => {
    const root = await statements({ month: '2026-09' })
    const category = await statements({ month: '2026-09', group: PRODUCT_IDS.liners() })
    const product = await statements({ month: '2026-09', product: PRODUCT_IDS.sealInX() })
    expect({ root: root.total, category: category.total, product: product.total }).toEqual({ root: 33, category: 40, product: 39 })
  })
})
