// YOUR PRODUCTS' LEVEL PAGES, SHOT (17 Oct; the G4 boards), registered in
// scripts/pages-shots.ts with one line. Every state a category's page and a
// product's draws, beside the board it answers (`--artboards
// ~/Documents/Heinrich/Verbatim-Design/depth-2026-10/canvas/project`), and a
// loader dump of either (`PRODUCTS_LEVEL_JSON=<file>`, written by
// scripts/products-v2-dump.ts --view category:… or product:…), drawn by its
// own page (`data.level`).
import { readFileSync } from 'node:fs'
import { createElement as h, type ReactNode } from 'react'
import { ProductsCategoryPage, ProductsPage, ProductsProductPage } from '../../components/pages/v2/products'
import { PRODUCTS_FIXTURES } from '../../lib/pages/v2/products-fixture'
import { PRODUCTS_LEVEL_FIXTURES } from '../../lib/pages/v2/products-level-fixture'
import type { ProductsLevelData } from '../../lib/pages/v2/products-levels'

interface Shot { key: string; path: string; artboard: string; page: () => ReactNode }

const draw = (d: ProductsLevelData, switcherOpen = false): ReactNode =>
  (d.level === 'category' ? h(ProductsCategoryPage, { data: d, switcherOpen }) : h(ProductsProductPage, { data: d, switcherOpen }))

const BOARD: Record<keyof typeof PRODUCTS_LEVEL_FIXTURES, string> = {
  liners: 'G4-Products-Category.dc.html',
  'liners-all': 'G4-Products-Category.dc.html',
  'liners-member': 'G4-Products-Thin.dc.html',
  knees: 'G4-Products-Category.dc.html',
  sealinx: 'G4-Products-Product.dc.html',
  'sealinx-open': 'G4-Products-Product.dc.html',
  'sealinx-all': 'G4-Products-Product.dc.html',
  navii: 'G4-Products-Product.dc.html',
  'today-liners': 'G4-Products-Thin.dc.html',
  'today-feet': 'G4-Products-Category.dc.html',
  'today-feet-calibrated': 'G4-Products-Category.dc.html',
  'quiet-product': 'G4-Products-Thin.dc.html',
  'not-on': 'G4-Products-Thin.dc.html',
  'not-on-product': 'G4-Products-Thin.dc.html',
  unread: 'G4-Products-Thin.dc.html',
  missing: 'G4-Products-Thin.dc.html',
  'missing-product': 'G4-Products-Thin.dc.html',
  sealand: 'G4-Products-Thin.dc.html',
}

const pathOf = (d: ProductsLevelData): string => (d.level === 'product'
  ? `/dashboard/products/${d.group?.id ?? 'x'}/${d.item?.id ?? 'x'}`
  : `/dashboard/products/${d.group?.id ?? 'x'}`)

export const PRODUCTS_LEVEL_SHOTS: Shot[] = [
  // The root beside its own G4 board: each column head now carries the small
  // arrow (it opens a page), and the key reads "1 to 2" and "3 to 5".
  { key: 'products-levels-root', path: '/dashboard/products', artboard: 'G4-Products.dc.html', page: () => h(ProductsPage, { data: PRODUCTS_FIXTURES.ossur() }) },
  { key: 'products-levels-root-today', path: '/dashboard/products', artboard: 'G4-Products.dc.html', page: () => h(ProductsPage, { data: PRODUCTS_FIXTURES['ossur-today']() }) },
  { key: 'products-levels-root-not-on', path: '/dashboard/products', artboard: 'G4-Products.dc.html', page: () => h(ProductsPage, { data: PRODUCTS_FIXTURES['not-on']() }) },
  ...(Object.keys(PRODUCTS_LEVEL_FIXTURES) as (keyof typeof PRODUCTS_LEVEL_FIXTURES)[]).map((k): Shot => ({
    key: `products-levels-${k}`,
    path: pathOf(PRODUCTS_LEVEL_FIXTURES[k]()),
    artboard: BOARD[k],
    page: () => draw(PRODUCTS_LEVEL_FIXTURES[k]()),
  })),
  // The product's switcher drawn open (G4-Products-Switcher).
  { key: 'products-levels-switcher', path: pathOf(PRODUCTS_LEVEL_FIXTURES.sealinx()), artboard: 'G4-Products-Switcher.dc.html', page: () => draw(PRODUCTS_LEVEL_FIXTURES.sealinx(), true) },
  ...(process.env.PRODUCTS_LEVEL_JSON
    ? [((): Shot => {
      const d = JSON.parse(readFileSync(process.env.PRODUCTS_LEVEL_JSON as string, 'utf8')) as ProductsLevelData
      return { key: 'products-levels-real', path: pathOf(d), artboard: d.level === 'category' ? 'G4-Products-Category.dc.html' : 'G4-Products-Product.dc.html', page: () => draw(d) }
    })()]
    : []),
]
