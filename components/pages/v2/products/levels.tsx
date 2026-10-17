import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { LevelBar } from '@/components/shell/level-bar'
import { CARD, PeriodSwitch } from '@/components/v2'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { PRODUCTS_FAILED, PRODUCTS_NO_CATALOGUE, PRODUCTS_NOT_APPLIED, type ProductsData } from '@/lib/pages/v2/products'
import { BACK_TO_PRODUCTS, CATEGORY_MISSING, PRODUCT_MISSING, type ProductsLevelData } from '@/lib/pages/v2/products-levels'
import { barMonth } from '@/lib/reading/month-label'
import { prevMonth } from '@/lib/reading/month-key'
import { cn } from '@/lib/utils'
import { OLINK } from '@/components/pages/v2/market/parts'
import { CategoryPageBody } from './category-page'
import { ProductPageBody } from './product-page'
import { GAPLINE, LIST_CARD, SectionHead } from './level-parts'

// YOUR PRODUCTS' LEVEL PAGES (17 Oct; the G4 boards): a category's and a
// product's, each its own address under the root (app/dashboard/products/
// [group] and [group]/[product]). Your products stays the sidebar's active
// surface on both (`surfaceForPath`).
//
// EACH OPENS WITH THE PATH, THEN THE PAGE NAMING ITS LEVEL (Market's F3
// pattern, `LevelBar`): the slim crumb row with its switchers, then the title
// block (a category's three boxes on the kit's yellow, "Category"; a
// product's single box on the neutral, "Product in {category}", the category
// a link up), the mono meta line and the month switch at its right.
//
// EVERY STATE KEEPS THE FRAME (the parity rule; decision 5 of the G4 report):
// switched off, not read for the month, or not read just now, the page keeps
// its path, its title block and its list, and says the state in one line in
// its place. An address the catalogue does not hold prints one calm line and
// the way back, never a 404.

/** One calm line, and the way back. */
export function ProductsLevelMissing({ data }: { data: ProductsLevelData }) {
  const state = data.base.state
  const line = state === 'not_applied' ? PRODUCTS_NOT_APPLIED
    : state === 'no_catalogue' ? PRODUCTS_NO_CATALOGUE
      : state === 'failed' ? PRODUCTS_FAILED
        : data.level === 'product' ? PRODUCT_MISSING : CATEGORY_MISSING
  return (
    <PageFrame className="text-foreground">
      <PageBar title={surface('products').label} />
      <div className="flex flex-col gap-2">
        <p data-products-missing={state} className="m-0 text-[15px] text-muted-foreground">{line}</p>
        {state === 'no_catalogue'
          ? <Link href={data.base.settingsHref} className={OLINK}>Add your products in Settings →</Link>
          : <Link href={surface('products').href} className={OLINK}>{BACK_TO_PRODUCTS} →</Link>}
      </div>
    </PageFrame>
  )
}

/** The month switch at this level's address (the root's, in months). */
function MonthSwitch({ data }: { data: ProductsLevelData }) {
  const current = data.months.find((m) => m.current)
  if (!current || data.months.length < 2) return null
  return (
    <PeriodSwitch
      value={current.month}
      options={data.months.map((m) => ({ value: m.month, label: m.label }))}
      hrefFor={(month) => data.months.find((m) => m.month === month)?.href ?? '#'}
      label="Month"
    />
  )
}

const lv = (k: number, n: number) => <span data-copy="level">{fmtInt(k)} of {fmtInt(n)}</span>
const fig = (n: number) => <span data-copy="figure">{fmtInt(n)}</span>

/** The month on a bar, where the page reads one. */
const monthPart = (base: ProductsData): ReactNode[] => (base.state === 'ready' || base.state === 'unread' ? [barMonth(base.monthWords, base.monthLabel)] : [])

/** A category's meta line, as its phone lines: "October so far · 52 of 318
 *  videos · 3 of your 8 liners came up"; switched off, "8 products in
 *  Liners". */
export function categoryMeta(data: ProductsLevelData): ReactNode[][] {
  const base = data.base
  const column = data.group ? base.shelf.find((c) => c.id === data.group!.id) : null
  const page = data.category
  if (page && base.state === 'ready') {
    const s = page.detail.split
    return [
      monthPart(base),
      s && base.market != null ? [<>{lv(s.any, base.market)} videos</>] : [],
      [<>{fig(page.detail.cameUp)} of your {fig(page.detail.products)} {page.detail.name.toLowerCase()} came up</>],
    ]
  }
  return [monthPart(base), column ? [<>{fig(column.products.length)} {column.products.length === 1 ? 'product' : 'products'} in {column.name}</>] : []]
}

/** A product's meta line: "October so far · named in 6 of 318 videos · 6 of
 *  52 about liners · 9 comments name it"; a quiet month, "named in no video ·
 *  1 in September". */
export function productMeta(data: ProductsLevelData): ReactNode[][] {
  const base = data.base
  const p = data.product
  if (!p || base.state !== 'ready') return [monthPart(base), data.group ? [<>In {data.group.name}</>] : []]
  const prevName = longMonth(prevMonth(base.month))
  if (!p.videos) {
    return [monthPart(base), [p.videos === 0 ? 'named in no video' : 'not read yet'], p.prev != null ? [<>{fig(p.prev)} in {prevName}</>] : []]
  }
  return [
    monthPart(base),
    [<>named in {lv(p.videos, p.market ?? 0)} videos</>],
    [
      ...(p.categoryVideos != null ? [<>{lv(p.videos, p.categoryVideos)} about {p.groupName.toLowerCase()}</>] : []),
      ...(p.comments ? [<>{fig(p.comments)} {p.comments === 1 ? 'comment names' : 'comments name'} it</>] : []),
    ],
  ]
}

/** A level whose month reads no count (switched off, not read, failed): the
 *  state's one line in a card, the way on, then the category's list (or the
 *  product's siblings) with no count (G4-Products-Thin, frame 2). */
function LevelOff({ data }: { data: ProductsLevelData }) {
  const base = data.base
  const column = data.group ? base.shelf.find((c) => c.id === data.group!.id) : null
  const word = column?.name.toLowerCase() ?? 'products'
  const link = base.state === 'not_on' || base.state === 'unread' ? 'Review your products in Settings' : null
  const rows = (column?.products ?? []).filter((p) => p.id !== data.item?.id)
  return (
    <>
      <section data-level-state={base.state} className={cn(CARD, 'gap-2.5')}>
        <p className={cn(GAPLINE, 'text-secondary-foreground')}>{base.empty}</p>
        {link ? <Link href={base.settingsHref} className={OLINK}>{link} →</Link> : null}
      </section>
      {data.level === 'product' ? <SectionHead title={`Your other ${word}`} /> : null}
      {column && rows.length > 0 ? (
        <section aria-label={data.level === 'product' ? `Your other ${word}` : `All ${rows.length} of your ${word}`} className={LIST_CARD}>
          {data.level === 'category' ? (
            <div>
              <h2 className="m-0 text-[17px] leading-[1.3] font-semibold tracking-[-0.005em] text-foreground">All <span data-copy="figure">{fmtInt(rows.length)}</span> of your {word}</h2>
              <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted-foreground">Each opens as its own page.</p>
            </div>
          ) : null}
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border pr-3 pb-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Product</th>
                <th scope="col" className="border-b border-border pb-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Videos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="[&:last-child>td]:border-b-0">
                  <td className="border-b border-track py-[11px] pr-3"><Link href={p.href} className="font-medium text-foreground no-underline underline-offset-[3px] hover:underline">{p.name}</Link></td>
                  <td className="border-b border-track py-[11px] text-right text-[12.5px] text-muted-foreground">Not read yet</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  )
}

/** A category's page (`/dashboard/products/[group]`). */
export function ProductsCategoryPage({ data, switcherOpen = false }: { data: ProductsLevelData; switcherOpen?: boolean }) {
  if (data.missing || !data.crumbs || !data.group) return <ProductsLevelMissing data={data} />
  const ready = data.base.state === 'ready' && data.category
  return (
    <PageFrame className="text-foreground">
      <LevelBar crumbs={data.crumbs} level="category" label="Category" title={data.group.name} meta={categoryMeta(data)} controls={<MonthSwitch data={data} />} open={switcherOpen ? 'current' : undefined} />
      {ready ? <CategoryPageBody page={data.category!} d={data} /> : <LevelOff data={data} />}
    </PageFrame>
  )
}

/** "Product in {category}", the category a link up. */
function ProductLabel({ data }: { data: ProductsLevelData }) {
  const up = data.crumbs?.[1]
  return <>Product in {up?.href ? <Link href={up.href} className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-[3px] hover:text-foreground">{up.label}</Link> : up?.label}</>
}

/** A product's page (`/dashboard/products/[group]/[product]`). */
export function ProductsProductPage({ data, switcherOpen = false }: { data: ProductsLevelData; switcherOpen?: boolean }) {
  if (data.missing || !data.crumbs || !data.group) return <ProductsLevelMissing data={data} />
  const ready = data.base.state === 'ready' && data.product
  return (
    <PageFrame className="text-foreground">
      <LevelBar crumbs={data.crumbs} level="product" label={<ProductLabel data={data} />} meta={productMeta(data)} controls={<MonthSwitch data={data} />} open={switcherOpen ? 'current' : undefined} />
      {ready ? <ProductPageBody page={data.product!} d={data} /> : <LevelOff data={data} />}
    </PageFrame>
  )
}
