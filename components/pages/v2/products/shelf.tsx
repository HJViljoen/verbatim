import { Box } from 'lucide-react'
import { CARD, CardHead, CatalogueShelf, ShelfLegend, type ShelfColumn } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { PANEL_ID, productsBasis, sharePct, shelfColumns, type ProductsData, type ShelfCategoryView } from '@/lib/pages/v2/products'
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

export function CatalogueCard({ data }: { data: Pick<ProductsData, 'shelf' | 'monthName' | 'open' | 'client'> }) {
  const selected = data.shelf.find((c) => c.selected)?.id ?? null
  return (
    <section aria-labelledby="catalogue-title" className={CARD}>
      {/* The key sits at the head's right on a wide screen and wraps under it
          on a phone, so the head's icon stays level with its title. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <CardHead
            icon={Box}
            id="catalogue-title"
            title="Your catalogue"
            sub={<>Every product, by category. The darker the tile, the more videos talked about it in {data.monthName}. Category counts include talk that names none of your products. {productsBasis(data.client)}</>}
          />
        </div>
        <div className="pt-1"><ShelfLegend /></div>
      </div>
      <CatalogueShelf
        columns={data.shelf.map((c) => shelfColumn(c, data.monthName))}
        selected={selected}
        panelId={data.open ? PANEL_ID[data.open.kind] : undefined}
        className={shelfColumns(data.shelf.length) === 6 ? 'xl:grid-cols-6' : undefined}
      />
    </section>
  )
}
