import { CARD, CatalogueShelf, EmptyBox, GoLink, SectionHead, ShelfLegend, type ShelfColumn } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { productsBasis, sharePct, type ProductsData, type ShelfCategoryView } from '@/lib/pages/v2/products'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { VerdictBadge } from './parts'

// THE CATALOGUE (since the audit design, 7 Nov: Products.dc.html's "Your
// catalogue"): every category the client keeps a ROW, every product a tile
// shaded by its videos this month (`CatalogueShelf`, the kit's), the products
// with videos first, and EVERY product shown (the board's Feet shows all
// twenty; `shelfCut` and `SHELF_TILES` stay for the Dashboard's tile, which
// still cuts by them). A row's head is its videos and its share of the market
// with this month against last (a verdict, printed only where it is an
// answer: moved, or no clear change), what most of its videos are about, how
// many of its products came up, and "Couldn't tell which". Every head, tile
// and link opens a PAGE (17 Oct, the G4 boards): a head the category's page
// (the hub), a tile the product's page, "Couldn't tell which" the category's
// page at its list (`#unclear`).

/** One row, as the kit draws it. */
export function shelfColumn(c: ShelfCategoryView, monthName: string): ShelfColumn {
  const read = c.products.filter((p) => p.videos != null)
  return {
    id: c.id,
    name: c.name,
    videos: c.videos,
    href: c.href,
    // A category not read yet says so in the head itself (the kit's "Not read
    // yet"): no second line.
    line: c.videos == null
      ? null
      : c.videos === 0
      ? <>quiet in {monthName}</>
      : c.share
        // The verdict on its own line under the share, as the board draws
        // "▲ from 14%" (the lead, 14 Oct: on one line it ran on as one phrase).
        ? <><span data-copy="figure">{sharePct(c.share.k, c.share.n)}</span> of the market<VerdictBadge verdict={c.verdict} answersOnly className="mt-0.5 block" /></>
        : null,
    // RULING U6: only a ready subject is counted. Where some are not measured
    // yet, none is said to lead over them; where none is ready, the head says
    // so where the lead would be.
    note: c.videos == null || c.videos === 0
      ? null
      : c.lead
        ? <>{c.lead.label}{c.leads ? ' leads,' : ','} <span data-copy="level">{fmtInt(c.lead.k)} of {fmtInt(c.lead.n)}</span></>
        : c.subjectsPending
          ? <span className="text-muted-foreground">What it’s about: {SUBJECT_NOT_MEASURED}</span>
          : null,
    // How many of its products came up, of all of them, where the month is
    // read for them.
    cameUp: c.videos != null && read.length > 0 ? { k: read.filter((p) => (p.videos ?? 0) > 0).length, n: c.products.length } : null,
    products: c.products.map((p) => ({ id: p.id, name: p.name, videos: p.videos, href: p.href, flag: p.flag })),
    more: null,
    unclear: c.unclear > 0 ? { count: c.unclear, href: c.unclearHref } : null,
  }
}

/** "Your catalogue", its head outside the tile (the board's `.h2row`): "All
 *  65 products, by category". */
function CatalogueHead({ products }: { products: number }) {
  return (
    <SectionHead
      id="catalogue-title"
      title="Your catalogue"
      note={products > 0 ? <>All <span data-copy="figure">{fmtInt(products)}</span> products, by category</> : null}
    />
  )
}

export function CatalogueCard({ data }: { data: Pick<ProductsData, 'shelf' | 'monthName' | 'client' | 'catalogue'> }) {
  return (
    <>
      <CatalogueHead products={data.catalogue.products} />
      <section aria-labelledby="catalogue-title" className={cn(CARD, 'gap-[18px] sm:p-[30px]')}>
        <p className="m-0 max-w-[940px] text-[15px] leading-[1.6] text-secondary-foreground">
          Every product, by category. The darker the tile, the more videos talked about it in {data.monthName}. Category counts include talk that names none of your products. {productsBasis(data.client)}
        </p>
        <ShelfLegend month={data.monthName} />
        <CatalogueShelf columns={data.shelf.map((c) => shelfColumn(c, data.monthName))} className="mt-1" />
      </section>
    </>
  )
}

/**
 * THE CATALOGUE WHERE NO MONTH IS READ (the parity pass, 13 Oct night; since
 * the audit design in the dashed box, decision 4): the board's section in
 * every state. Its tile says the state's one line and the way on (Settings);
 * under it, the catalogue itself where the client has one (every row "Not
 * read yet", the tiles their names alone). With no catalogue there is
 * nothing to draw but the line.
 */
export function CatalogueFrame({ data, link }: { data: Pick<ProductsData, 'shelf' | 'monthName' | 'empty' | 'settingsHref' | 'state' | 'catalogue'>; link: string | null }) {
  return (
    <>
      <CatalogueHead products={data.catalogue.products} />
      <section aria-labelledby="catalogue-title" data-state={data.state} className={cn(CARD, 'gap-[18px] sm:p-[30px]')}>
        <EmptyBox>
          <span data-empty-shelf={data.shelf.length === 0 ? '' : undefined}>{data.empty}</span>
        </EmptyBox>
        {link ? <GoLink href={data.settingsHref} className="self-start">{link}</GoLink> : null}
        {data.shelf.length > 0 ? <CatalogueShelf columns={data.shelf.map((c) => shelfColumn(c, data.monthName))} unread /> : null}
      </section>
    </>
  )
}
