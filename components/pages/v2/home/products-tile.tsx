import Link from 'next/link'
import { NAV_ICON } from '@/components/nav-icons'
import { shelfTone } from '@/components/v2'
import { fmtInt } from '@/lib/format'
import { tileHref } from '@/lib/pages/home'
import type { TileRead, TopProducts } from '@/lib/pages/v2/home'
import { cn } from '@/lib/utils'
import { CSUB, MID, MONO_MUTED, OLINK, TILE, TILE_FAILED, TileHead, TileLine, TileMonth, TT } from './parts'

// THE DASHBOARD'S YOUR PRODUCTS TILE (Design v2, T8; E1-Dashboard's second
// row), from T5's `TopProducts` (lib/pages/v2/products.ts, re-exported by
// lib/pages/v2/home.ts): the product that stands out this month, which opens its panel on
// Your products (`?product=`), how many of your products came up ("9 of your
// 38") and the catalogue as the board's mini shelf, each product shaded by its
// videos this month, where the read carries them; or the page's honest state
// where it has nothing: no catalogue yet (a link to Settings), the readings
// not switched on, its month not read yet or its read failed, or nothing of
// yours named this month.

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

/** "in October so far", whichever way the month's words arrive. */
const inWords = (m: string): string => (/^in\s/i.test(m.trim()) ? m.trim() : `in ${m.trim()}`)

/** The mini shelf's shades: none, one or two, three to five, six or more
 *  (`shelfTone`, the catalogue shelf's own steps). */
const SHADE: Record<0 | 1 | 2 | 3, string> = { 0: 'bg-track', 1: 'bg-accent', 2: 'bg-brand/65', 3: 'bg-brand' }

/** The board's `.minishelf`: a column a category, a bar a product, shaded by
 *  its videos this month. */
function MiniShelf({ columns }: { columns: NonNullable<TopProducts['columns']> }) {
  const said = columns.map((c) => `${c.name} ${c.products.filter((p) => p.videos > 0).length} of ${c.products.length} named`).join(', ')
  return (
    <div role="img" aria-label={`Your catalogue: ${said}`} className="grid gap-1.5 max-sm:hidden" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((c) => (
        <div key={c.id} className="flex min-w-0 flex-col gap-[3px]">
          <b className="mb-0.5 truncate text-[10.5px] font-semibold tracking-[0.02em] text-muted-foreground">{c.name}</b>
          {c.products.map((p) => <span key={p.id} data-tone={shelfTone(p.videos)} className={cn('h-[9px] rounded-[2px]', SHADE[shelfTone(p.videos)])} />)}
        </div>
      ))}
    </div>
  )
}

function Ready({ top, standout }: { top: TopProducts; standout: NonNullable<TopProducts['standout']> }) {
  const month = top.monthWords ? ` ${inWords(top.monthWords)}` : ''
  const counted = top.cameUp != null && top.products != null && top.products > 0
  const own = standout.n != null && standout.n > 0
    ? <><span data-copy="level">{fmtInt(standout.k)} of {fmtInt(standout.n)} videos</span>{month}</>
    : <><span data-copy="figure">{fmtInt(standout.k)}</span> videos{month}</>
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[12px] leading-[1.3] font-semibold uppercase tracking-[0.06em] text-orange-text">{standout.label}</p>
        {/* A product's name is the client's own, as Settings holds it. */}
        <h3 className={TT}>{standout.name}</h3>
      </div>
      {counted ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span data-copy="figure" className={MID}>{fmtInt(top.cameUp!)}</span>
            <span className={MONO_MUTED}>of your <span data-copy="figure">{fmtInt(top.products!)}</span> products came up{month}</span>
          </div>
          {top.columns && top.columns.length > 0 ? <MiniShelf columns={top.columns} /> : null}
          <p className={CSUB}>{standout.name}: {own}.</p>
        </>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span data-copy="figure" className={MID}>{fmtInt(standout.k)}</span>
          {standout.n != null && standout.n > 0
            ? <span className={MONO_MUTED}><span data-copy="level">of {fmtInt(standout.n)} videos</span>{month}</span>
            : <span className={MONO_MUTED}>videos{month}</span>}
        </div>
      )}
    </>
  )
}

export function ProductsTileView({ read }: { read: TileRead<TopProducts> }) {
  const top = read.state === 'ok' ? read.top : null
  const standout = top?.state === 'ready' ? top.standout : null
  return (
    <article aria-labelledby="home-products" data-tile="products" data-state={top?.state ?? 'failed'} className={cn(TILE, 'col-span-12 min-[1180px]:col-span-4')}>
      <TileHead icon={NAV_ICON.products} name="Your products" id="home-products" href={standout?.href ?? top?.href ?? tileHref('products')} />
      {/* Decision 3: the month the tile reads, labelled where it is not the
          current one (a state that reads no month carries no label). */}
      {top && top.note !== 'failed' ? <TileMonth words={top.monthWords} label={top.monthLabel} /> : null}
      {!top || top.note === 'failed' ? <TileLine>{TILE_FAILED}</TileLine>
        : standout ? <Ready top={top} standout={standout} />
          : top.state === 'no_catalogue' ? (
            <>
              <TileLine>{PRODUCTS_LINES.no_catalogue}</TileLine>
              <Link href={PRODUCTS_SETTINGS} className={cn(OLINK, 'mt-auto self-start')}>Add your products →</Link>
            </>
          )
            // Not read yet is not "none named".
            : top.note === 'unread' ? <TileLine>{PRODUCTS_UNREAD}</TileLine>
              // Ready with nothing standing out reads as quiet.
              : top.state === 'quiet' || top.state === 'ready'
                ? <TileLine>{PRODUCTS_LINES.quiet}{top.monthWords ? ` ${inWords(top.monthWords)}` : ''}.</TileLine>
                : <TileLine>{PRODUCTS_LINES[top.state]}</TileLine>}
    </article>
  )
}
