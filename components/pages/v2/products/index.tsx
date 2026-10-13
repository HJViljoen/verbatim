import Link from 'next/link'
import { Box } from 'lucide-react'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { CARD, CardHead } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { ProductsData } from '@/lib/pages/v2/products'
import { Fig, OLINK } from './parts'
import { CategoryPanelView, ProductPanelView } from './panels'
import { CatalogueCard } from './shelf'
import { Standouts } from './standouts'

// YOUR PRODUCTS (depth v2, T5), drawn to the boards E4-Products and
// E4-Products-Liners:
//   the bar: the title and its mono meta line (the month, how many of your
//     products came up, the videos about them or their categories);
//   what stands out: up to four cards, picked by code;
//   your catalogue: every category a column, every product a tile shaded by
//     its videos;
//   the open category or product, in place under the catalogue.
// Before any count, the page's honest states: not switched on (the
// migration, or the tenant's switch), no catalogue (a link to Settings), not
// read for the month, or not read just now.
//
// The board's period switch is not drawn: products are read per month only
// (`month_product_readings`), so "This week" and "Over time" would offer
// views with nothing behind them; the month line in each panel is the
// over-time view.

export { CatalogueCard, shelfColumn } from './shelf'
export { StandoutCard, Standouts, shareWords } from './standouts'
export { CategoryPanelView, ProductPanelView } from './panels'
export { TagControl, TagControlView, tagSaid } from './tag-control'

/** The bar's meta line: "September · 15 of your 65 products came up · 412
 *  videos about them or their categories". */
export function ProductsMeta({ data }: { data: ProductsData }) {
  const parts: React.ReactNode[] = [<span key="m">{data.monthWords}</span>]
  if (data.state === 'ready' && data.header) {
    parts.push(<span key="p"><Fig>{fmtInt(data.header.cameUp)}</Fig> of your <Fig>{fmtInt(data.header.products)}</Fig> products came up</span>)
    if (data.header.videos != null) parts.push(<span key="v"><Fig>{fmtInt(data.header.videos)}</Fig> videos about them or their categories</span>)
  } else if (data.catalogue.products > 0) {
    parts.push(<span key="c"><Fig>{fmtInt(data.catalogue.products)}</Fig> products in <Fig>{fmtInt(data.catalogue.categories)}</Fig> {data.catalogue.categories === 1 ? 'category' : 'categories'}</span>)
  }
  return <>{parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : null}{p}</span>)}</>
}

/** The one card a state that prints no count draws, with its way on. */
export function ProductsEmpty({ data }: { data: ProductsData }) {
  const link = data.state === 'no_catalogue'
    ? 'Add your products in Settings'
    : data.state === 'not_on' || data.state === 'unread'
      ? 'Review your products in Settings'
      : null
  return (
    <section aria-labelledby="products-empty" className={CARD}>
      <CardHead icon={Box} id="products-empty" title={data.state === 'no_catalogue' ? 'No products yet' : 'Your products'} sub={data.empty} />
      {link ? <div><Link href={data.settingsHref} className={OLINK}>{link} →</Link></div> : null}
    </section>
  )
}

export function ProductsPage({ data }: { data: ProductsData }) {
  const panel = data.panel
  return (
    <PageFrame className="gap-5 leading-[normal]">
      <PageBar title={surface('products').label} meta={<ProductsMeta data={data} />} />
      {data.state !== 'ready' ? <ProductsEmpty data={data} /> : (
        <>
          <Standouts standouts={data.standouts} monthName={data.monthName} />
          <CatalogueCard data={data} />
          {panel?.kind === 'group' ? <CategoryPanelView panel={panel} monthName={data.monthName} canTag={data.canTag} /> : null}
          {panel?.kind === 'product' ? <ProductPanelView panel={panel} monthName={data.monthName} /> : null}
          <nav aria-label="More about your products" className="flex flex-wrap gap-x-6 gap-y-2 px-1">
            <Link href={data.settingsHref} className={OLINK}>Edit your products in Settings →</Link>
          </nav>
        </>
      )}
    </PageFrame>
  )
}
