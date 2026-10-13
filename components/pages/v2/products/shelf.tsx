import { Box } from 'lucide-react'
import { CARD, CardHead, CatalogueShelf, ShelfLegend, type ShelfColumn } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { PANEL_ID, PRODUCTS_BASIS, sharePct, shelfColumns, type ProductsData, type ShelfCategoryView } from '@/lib/pages/v2/products'
import { VerdictBadge } from './parts'

// THE CATALOGUE (board E4-Products, "Your catalogue"): every category the
// client keeps a column, every product a tile shaded by its videos this
// month (`CatalogueShelf`, the kit's), the products with videos first. A
// column's head is its videos, its share of the market with this month
// against last (a verdict, printed only where it is an answer: moved, or no
// clear change), and what most of its videos are about. Under the tiles,
// "Couldn't tell which · N" opens that list in the category's panel.

/** One column, as the kit draws it. */
export function shelfColumn(c: ShelfCategoryView, monthName: string): ShelfColumn {
  return {
    id: c.id,
    name: c.name,
    videos: c.videos,
    href: c.href,
    line: c.videos === 0
      ? <>Quiet in {monthName}</>
      : c.share
        ? <><span data-copy="figure">{sharePct(c.share.k, c.share.n)}</span> of the market <VerdictBadge verdict={c.verdict} answersOnly /></>
        : null,
    note: c.lead && c.videos > 0
      ? <>{c.lead.label} leads, <span data-copy="level">{fmtInt(c.lead.k)} of {fmtInt(c.videos)}</span></>
      : null,
    products: c.products.map((p) => ({ id: p.id, name: p.name, videos: p.videos, href: p.href, flag: p.flag })),
    unclear: c.unclear > 0 ? { count: c.unclear, href: c.unclearHref } : null,
  }
}

export function CatalogueCard({ data }: { data: Pick<ProductsData, 'shelf' | 'monthName' | 'open'> }) {
  const selected = data.shelf.find((c) => c.selected)?.id ?? null
  return (
    <section aria-labelledby="catalogue-title" className={CARD}>
      <CardHead
        icon={Box}
        id="catalogue-title"
        title="Your catalogue"
        sub={<>Every product, by category. The darker the tile, the more videos talked about it in {data.monthName}. Category counts include talk that names none of your products. {PRODUCTS_BASIS}</>}
        action={<div className="max-md:hidden"><ShelfLegend /></div>}
      />
      <div className="md:hidden"><ShelfLegend /></div>
      <CatalogueShelf
        columns={data.shelf.map((c) => shelfColumn(c, data.monthName))}
        selected={selected}
        panelId={data.open ? PANEL_ID[data.open.kind] : undefined}
        className={shelfColumns(data.shelf.length) === 6 ? 'xl:grid-cols-6' : undefined}
      />
    </section>
  )
}
