import Link from 'next/link'
import { Box } from 'lucide-react'
import { CARD, CardHead, CatalogueShelf, ShelfLegend, type ShelfColumn } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { PANEL_ID, productsBasis, sharePct, shelfColumns, shelfCut, type ProductsData, type ShelfCategoryView } from '@/lib/pages/v2/products'
import { SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import { cn } from '@/lib/utils'
import { OLINK, VerdictBadge } from './parts'

// THE CATALOGUE (board E4-Products, "Your catalogue"): every category the
// client keeps a column, every product a tile shaded by its videos this
// month (`CatalogueShelf`, the kit's), the products with videos first. A
// column's head is its videos, its share of the market with this month
// against last (a verdict, printed only where it is an answer: moved, or no
// clear change), and what most of its videos are about. Under the tiles,
// "Couldn't tell which · N" opens that list in the category's panel.

/** One column, as the kit draws it. */
export function shelfColumn(c: ShelfCategoryView, monthName: string): ShelfColumn {
  const { shown, more } = shelfCut(c.products)
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
      ? <>Quiet in {monthName}</>
      : c.share
        ? <><span data-copy="figure">{sharePct(c.share.k, c.share.n)}</span> of the market <VerdictBadge verdict={c.verdict} answersOnly /></>
        : null,
    // RULING U6: only a ready subject is counted. Where some are not measured
    // yet, none is said to lead over them; where none is ready, the head says
    // so where the lead would be.
    note: c.videos == null || c.videos === 0
      ? null
      : c.lead
        ? <>{c.lead.label}{c.leads ? ' leads,' : ','} <span data-copy="level">{fmtInt(c.lead.k)} of {fmtInt(c.videos)}</span></>
        : c.subjectsPending
          ? <span className="text-muted-foreground">What it’s about · {SUBJECT_NOT_MEASURED}</span>
          : null,
    // The board's height: the first SHELF_TILES tiles (the most videos
    // first, `buildShelf`), then "+N more" into the category's panel
    // (`shelfCut`, which the Dashboard's mini shelf cuts by too).
    products: shown.map((p) => ({ id: p.id, name: p.name, videos: p.videos, href: p.href, flag: p.flag })),
    more: more > 0 ? { count: more, href: c.href } : null,
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

/** An empty shelf's shape (no catalogue yet): five columns, each a dashed
 *  head and a few dashed tiles (the quiet tile's outline), every one blank:
 *  places to fill, not a page still loading. It carries no name and no
 *  number. */
const FRAME_TILES = [6, 4, 5, 3, 4] as const

function EmptyShelf() {
  return (
    <div aria-hidden data-empty-shelf="" className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      {FRAME_TILES.map((tiles, i) => (
        <div key={i} className={cn('flex min-w-0 flex-col gap-2', i >= 2 ? 'max-md:hidden' : null, i >= 3 ? 'max-xl:hidden' : null)}>
          <div className="mb-1 min-h-[150px] rounded-[10px] border border-dashed border-foreground/15 bg-inner/40" />
          {Array.from({ length: tiles }, (_, t) => <i key={t} className="block min-h-[38px] rounded-lg border border-dashed border-foreground/15" />)}
        </div>
      ))}
    </div>
  )
}

/**
 * THE CATALOGUE CARD WHERE NO MONTH IS READ (the parity pass, 13 Oct night):
 * the board's card in every state. Its head says the state's one line and
 * the way on (Settings); under it, the catalogue itself where the client has
 * one (every column "Not read yet", the tiles their names alone), or the
 * shelf's empty shape where it has none.
 */
export function CatalogueFrame({ data, link }: { data: Pick<ProductsData, 'shelf' | 'monthName' | 'empty' | 'settingsHref' | 'state'>; link: string | null }) {
  return (
    <section aria-labelledby="catalogue-title" data-state={data.state} className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <CardHead icon={Box} id="catalogue-title" title="Your catalogue" sub={data.empty} />
          {link ? <div className="mt-2.5 pl-10 max-sm:pl-0"><Link href={data.settingsHref} className={OLINK}>{link} →</Link></div> : null}
        </div>
        <div className="pt-1"><ShelfLegend /></div>
      </div>
      {data.shelf.length > 0
        ? <CatalogueShelf columns={data.shelf.map((c) => shelfColumn(c, data.monthName))} unread className={shelfColumns(data.shelf.length) === 6 ? 'xl:grid-cols-6' : undefined} />
        : <EmptyShelf />}
    </section>
  )
}
