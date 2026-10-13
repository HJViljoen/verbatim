import Link from 'next/link'
import { NAV_ICON } from '@/components/nav-icons'
import { fmtInt } from '@/lib/format'
import type { TileRead, TopProducts } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { MID, MONO_MUTED, OLINK, TILE, TILE_FAILED, TileHead, TileLine, TT } from './parts'

// THE DASHBOARD'S YOUR PRODUCTS TILE (Design v2, T8; E1-Dashboard's second
// row), from T5's `TopProducts` (stubbed in lib/pages/v2/home.ts until T5
// merges): the product that stands out this month, which opens its panel on
// Your products (`?product=`), or the page's honest state where it has
// nothing: no catalogue yet (a link to Settings), the readings not switched
// on, or nothing of yours named this month.
//
// The board's catalogue strip ("liners 3 of 8 talked about…") and "9 of your
// 38 products came up" are not drawn: the tile's pinned type carries the
// standout alone (a deviation listed for Heinrich).

/** Where products are added. */
export const PRODUCTS_SETTINGS = '/dashboard/settings/products'

/** The page's words for each state with nothing to stand out. */
export const PRODUCTS_LINES: Record<Exclude<TopProducts['state'], 'ready'>, string> = {
  not_applied: 'Product readings are not switched on for this workspace yet.',
  not_on: 'Product readings are not switched on for this workspace yet.',
  no_catalogue: 'Add your products in Settings to see how your market talks about them.',
  quiet: 'None of your products was named in your market’s videos',
}

/** "in October so far", whichever way the month's words arrive. */
const inWords = (m: string): string => (/^in\s/i.test(m.trim()) ? m.trim() : `in ${m.trim()}`)

export function ProductsTileView({ read }: { read: TileRead<TopProducts> }) {
  const top = read.state === 'ok' ? read.top : null
  const standout = top?.state === 'ready' ? top.standout : null
  return (
    <article aria-labelledby="home-products" data-tile="products" data-state={top?.state ?? 'failed'} className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={NAV_ICON.products} name="Your products" id="home-products" href={standout?.href ?? top?.href ?? '/dashboard/products'} />
      {read.state === 'failed' || !top ? <TileLine>{TILE_FAILED}</TileLine>
        : standout ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[12px] leading-[1.3] font-semibold uppercase tracking-[0.06em] text-orange-text">{standout.label}</p>
              {/* A product's name is the client's own, as Settings holds it. */}
              <h3 className={TT}>{standout.name}</h3>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span data-copy="figure" className={MID}>{fmtInt(standout.k)}</span>
              {standout.n != null && standout.n > 0
                ? <span className={MONO_MUTED}><span data-copy="level">of {fmtInt(standout.n)} videos</span>{top.monthWords ? ` ${inWords(top.monthWords)}` : ''}</span>
                : <span className={MONO_MUTED}>videos{top.monthWords ? ` ${inWords(top.monthWords)}` : ''}</span>}
            </div>
          </>
        )
          : top.state === 'no_catalogue' ? (
            <>
              <TileLine>{PRODUCTS_LINES.no_catalogue}</TileLine>
              <Link href={PRODUCTS_SETTINGS} className={cn(OLINK, 'mt-auto self-start')}>Add your products →</Link>
            </>
          )
            // Ready with nothing standing out reads as quiet.
            : top.state === 'quiet' || top.state === 'ready'
              ? <TileLine>{PRODUCTS_LINES.quiet}{top.monthWords ? ` ${inWords(top.monthWords)}` : ''}.</TileLine>
              : <TileLine>{PRODUCTS_LINES[top.state]}</TileLine>}
    </article>
  )
}
