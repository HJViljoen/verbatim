import Link from 'next/link'
import type { ReactNode } from 'react'
import { EmptyBox, GoLink, toMax } from '@/components/v2'
import { ROW } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import { tileHref } from '@/lib/pages/home'
import type { TileRead, TopProducts } from '@/lib/pages/v2/home'
import { TOP_LABELS } from '@/lib/pages/v2/products'
import { inlineMonth } from '@/lib/reading/month-label'
import { cn } from '@/lib/utils'
import { Bar, BAR_ROW, CSUB, TILE, TILE_FAILED, TileHead, TT } from './parts'

// THE DASHBOARD'S YOUR PRODUCTS TILE, drawn to the audit design's board
// (Dashboard.dc.html, "Your products in October", 7 Nov), from T5's
// `TopProducts` (lib/pages/v2/products.ts, re-exported by
// lib/pages/v2/home.ts): the product that stands out this month as the
// heading's sentence ("Direct Socket was talked about most", its name opening
// its page), how many of your products came up ("10 of your 65 products came
// up."), the ones that came up most as a ranked list against the largest
// (`cameUpProducts`, decision 5), each opening its page, and how many were
// quiet; or the page's honest state where it has nothing, said in the
// boards' dashed box (decision 4): no catalogue yet (a link to Settings), the
// readings not switched on, its month not read yet or its read failed, or
// nothing of yours named this month.

/** Where products are added. */
export const PRODUCTS_SETTINGS = '/dashboard/settings/products'

/** The page's words for each state with nothing to stand out. */
export const PRODUCTS_LINES: Record<Exclude<TopProducts['state'], 'ready'>, string> = {
  not_applied: 'Product readings are not switched on for this workspace yet.',
  not_on: 'Product readings are not switched on for this workspace yet.',
  no_catalogue: 'Add your products in Settings to see how your market talks about them.',
  quiet: 'None of your products was named in your market’s videos',
}

/** A quiet tile whose month was not read: not "none named". */
export const PRODUCTS_UNREAD = 'Your products have not been read for this month yet.'

/** Products the ranked list draws (the board's four). */
export const PRODUCTS_LISTED = 4

/** "in October so far", whichever way the month's words arrive. */
const inWords = (m: string): string => (/^in\s/i.test(m.trim()) ? m.trim() : `in ${m.trim()}`)

/** The tile's titles where nothing stands out (parity pass, 13 Oct: the
 *  board's title in every state). */
export const PRODUCTS_TITLES = {
  quiet: (month: string) => `None of your products came up${month}`,
  catalogue: 'Your catalogue',
  /** Before there is a catalogue to read (none yet, not switched on, or a
   *  failed read): what the tile will show. */
  invite: 'What your market says about each product you sell',
} as const

/** The standout as the heading's sentence, from the tile's own label
 *  (`TOP_LABELS`): "Direct Socket was talked about most", "Navii came up for
 *  the first time"; any other label before the name ("Named in the most
 *  videos: Pro-Flex Pivot"). The name is the client's own, as Settings holds
 *  it, and opens its page. */
function Standout({ standout }: { standout: NonNullable<TopProducts['standout']> }) {
  const name = <Link href={standout.href} className={ROW}>{standout.name}</Link>
  if (standout.label === TOP_LABELS.most) return <h2 className={TT}>{name} was talked about most</h2>
  if (standout.label === TOP_LABELS.first) return <h2 className={TT}>{name} came up for the first time</h2>
  return <h2 className={TT}>{standout.label}: {name}</h2>
}

type Listed = { key: string; name: string; videos: number; href: string }

/** The ranked list: the products that came up, most first, at most
 *  `PRODUCTS_LISTED`, each a bar against the largest. A tile from before
 *  `cameUpProducts` lists its standout alone. */
function Ranked({ rows }: { rows: readonly Listed[] }) {
  const bar = toMax(rows.map((r) => r.videos))
  return (
    <div role="list" aria-label="The products that came up most" className="flex flex-col gap-2.5 text-[14.5px] leading-[1.35]">
      {rows.map((r, i) => (
        <div key={r.key} role="listitem" className={BAR_ROW}>
          <Link href={r.href} className={cn(ROW, 'min-w-0', i === 0 ? null : 'font-normal')}>{r.name}</Link>
          <Bar pct={bar(r.videos)} />
          <span data-copy="figure" className={cn('text-right tabular-nums', i === 0 ? 'font-semibold' : null)}>{fmtInt(r.videos)}</span>
        </div>
      ))}
    </div>
  )
}

/** A row under a hairline at the tile's foot: its name, and its value. */
function Foot({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="mt-auto flex items-start justify-between gap-x-4 border-t border-track pt-3 text-[14px] leading-[1.45]">
      <span className="shrink-0 text-muted-foreground">{name}</span>
      <span className="min-w-0 text-right font-semibold">{children}</span>
    </div>
  )
}

function Ready({ top, standout }: { top: TopProducts; standout: NonNullable<TopProducts['standout']> }) {
  const counted = top.cameUp != null && top.products != null && top.products > 0
  const all = top.cameUpProducts ?? []
  const rows: Listed[] = all.length > 0
    ? all.slice(0, PRODUCTS_LISTED).map((p) => ({ key: p.id, name: p.name, videos: p.videos, href: p.href }))
    : [{ key: 'standout', name: standout.name, videos: standout.k, href: standout.href }]
  const more = all.length > PRODUCTS_LISTED ? all.length - PRODUCTS_LISTED : 0
  const quiet = counted ? top.products! - top.cameUp! : null
  // The heading names the standout, so its count prints on the tile always:
  // in its ranked row, or, where it ranks below the list (a first month
  // with fewer videos than the four listed), on the line under the heading.
  const listed = rows.some((r) => r.href === standout.href || r.name === standout.name)
  return (
    <>
      <Standout standout={standout} />
      {listed ? null : (
        <p data-products-standout="" className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">
          {standout.name}: <span data-copy="figure">{fmtInt(standout.k)}</span> {standout.k === 1 ? 'video' : 'videos'}.
        </p>
      )}
      {counted ? (
        <p className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">
          <span data-copy="figure">{fmtInt(top.cameUp!)}</span> of your <span data-copy="figure">{fmtInt(top.products!)}</span> products came up.
        </p>
      ) : null}
      <Ranked rows={rows} />
      <p data-products-note="" className={CSUB}>
        Videos per product
        {/* The base is the figures row's for the week's month; a tile on
            another month says its own (decision 2). */}
        {top.monthLabel && standout.n ? <>, of <span data-copy="figure">{fmtInt(standout.n)}</span> {inWords(top.monthWords)}</> : null}
        {more > 0 ? <>, and <span data-copy="figure">{fmtInt(more)}</span> more {more === 1 ? 'product' : 'products'} that came up.</> : '.'}
      </p>
      {quiet != null ? (
        <Foot name={top.monthLabel ? `Quiet ${inWords(top.monthWords)}` : 'Quiet this month'}>
          <span data-copy="figure">{fmtInt(quiet)}</span> {quiet === 1 ? 'product' : 'products'}
        </Foot>
      ) : null}
    </>
  )
}

/** Every product in a column of the page's shelf, past the page's cut too. */
const columnSize = (c: NonNullable<TopProducts['columns']>[number]): number => c.products.length + (c.more ?? 0)

/** "38 products across 5 categories." (or "in one category"). */
function Catalogue({ columns }: { columns: NonNullable<TopProducts['columns']> }) {
  const products = columns.reduce((n, c) => n + columnSize(c), 0)
  return (
    <p data-catalogue="" className="m-0 text-[14.5px] leading-[1.5] text-secondary-foreground">
      <span data-copy="figure">{fmtInt(products)}</span> products {columns.length === 1 ? 'in one category' : <>across <span data-copy="figure">{fmtInt(columns.length)}</span> categories</>}.
    </p>
  )
}

/** Every state with nothing standing out: the board's title, the
 *  catalogue's size where there is one, and why there is no list, in the
 *  dashed box (decision 4). */
function Thin({ top }: { top: TopProducts }) {
  const month = top.monthWords ? ` ${inWords(top.monthWords)}` : ''
  if (top.note === 'failed') {
    return (
      <>
        <h2 className={TT}>{PRODUCTS_TITLES.invite}</h2>
        <EmptyBox>{TILE_FAILED}</EmptyBox>
      </>
    )
  }
  if (top.state === 'no_catalogue') {
    return (
      <>
        <h2 className={TT}>{PRODUCTS_TITLES.invite}</h2>
        <EmptyBox>{PRODUCTS_LINES.no_catalogue}</EmptyBox>
        <GoLink href={PRODUCTS_SETTINGS} className="mt-auto self-start">Add your products</GoLink>
      </>
    )
  }
  if (top.state === 'not_applied') {
    return (
      <>
        <h2 className={TT}>{PRODUCTS_TITLES.invite}</h2>
        <EmptyBox>{PRODUCTS_LINES.not_applied}</EmptyBox>
      </>
    )
  }
  const columns = top.columns ?? []
  // Read, and nothing of yours named: the catalogue, every product quiet.
  if ((top.state === 'quiet' || top.state === 'ready') && top.note !== 'unread' && columns.length > 0) {
    return (
      <>
        <h2 className={TT}>{PRODUCTS_TITLES.quiet(month)}</h2>
        <Catalogue columns={columns} />
      </>
    )
  }
  // Not switched on, or the month not read yet: the catalogue's size, and why.
  const words = top.state === 'not_on' ? PRODUCTS_LINES.not_on : top.note === 'unread' ? PRODUCTS_UNREAD : `${PRODUCTS_LINES.quiet}${month}.`
  return (
    <>
      <h2 className={TT}>{top.state === 'quiet' && top.note !== 'unread' ? PRODUCTS_TITLES.quiet(month) : PRODUCTS_TITLES.catalogue}</h2>
      {columns.length > 0 ? <Catalogue columns={columns} /> : null}
      <EmptyBox>{words}</EmptyBox>
    </>
  )
}

export function ProductsTileView({ read }: { read: TileRead<TopProducts> }) {
  const top = read.state === 'ok' ? read.top : null
  const standout = top?.state === 'ready' ? top.standout : null
  // Decision 3: the month the tile reads, in its label, in the one helper's
  // words where it is not the current month; a state that reads no month,
  // or a failed read, names none.
  const reads = top && top.note !== 'failed' && top.monthWords && top.state !== 'not_applied' && top.state !== 'no_catalogue' && top.state !== 'not_on'
  const label = reads ? `Your products ${inWords(inlineMonth(top.monthWords, top.monthLabel))}` : 'Your products'
  return (
    <article aria-labelledby="home-products" data-tile="products" data-state={top?.state ?? 'failed'} className={cn(TILE, 'min-[1180px]:col-span-1')}>
      <TileHead label={label} id="home-products" open={{ href: tileHref('products'), words: 'Open products' }} />
      {!top ? (
        <>
          <h2 className={TT}>{PRODUCTS_TITLES.invite}</h2>
          <EmptyBox>{TILE_FAILED}</EmptyBox>
        </>
      ) : standout ? <Ready top={top} standout={standout} /> : <Thin top={top} />}
    </article>
  )
}
