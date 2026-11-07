import Link from 'next/link'
import type { ReactNode } from 'react'
import { fmtInt } from '@/lib/format'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { FlagChip } from './flag-chip'
import { GO, LBL } from './look'
import { SELECTED_CARD_RING } from './panel'

/**
 * THE CATALOGUE SHELF (depth v2, T2; since the audit design, 7 Nov, drawn to
 * Products.dc.html's "Your catalogue").
 *
 * Every product the client sells, in its category's ROW, each a tile shaded
 * by how many videos talked about it this period: none is a dashed outline
 * (quiet), one or two the pale yellow, three to five the brand yellow at 65%,
 * six or more the brand yellow. Yellow because these are the market's videos
 * (MASTER §Colour roles: yellow is the market), and a darker tile is more of
 * them, never a judgement. The shade is a tier the count already says, so the
 * count is printed on every tile that has one (identity never rests on colour
 * alone), and `ShelfLegend` keys the tiers.
 *
 * A row's head, 220px at the left (stacked over the tiles on a phone): the
 * category's name, its page's link; its videos and the line the page
 * composes (its share with a verdict); the note (what it is mostly about);
 * how many of its products came up; and "Couldn't tell which: N videos", the
 * videos about the category that named none of its products. The open row's
 * name wears the selected ring (the panel era's, still supported).
 */

export interface ShelfProduct {
  id: string
  name: string
  /** Videos about this product in the period; null where the period holds
   *  no reading for it (added after the period was read): "not read yet",
   *  never quiet. */
  videos: number | null
  href: string
  /** Its verdict, for a flag chip ("New"). */
  flag?: Verdict | null
}

export interface ShelfColumn {
  id: string
  /** The category's name ("Liners"). */
  name: string
  /** Videos about the category in the period, its unbranded talk included;
   *  null where the period holds no reading for it. */
  videos: number | null
  /** Opens the category's page. */
  href: string
  /** After the count: the share and its verdict ("16% of the market"). */
  line?: ReactNode
  /** What it is mostly about ("Fit & comfort leads, 34 of 52"). */
  note?: ReactNode
  /** How many of its products came up, of all of them ("0 of your 10 came
   *  up"); absent where the period is not read. */
  cameUp?: { k: number; n: number } | null
  products: readonly ShelfProduct[]
  /** Products the row leaves off (a long category cut short): one last tile,
   *  "+N more", into the category's page. Your products' own page shows
   *  every product since the audit design, and passes none. */
  more?: { count: number; href: string } | null
  /** About the category, but no product named. Null or zero: no link. */
  unclear?: { count: number; href: string } | null
}

export interface CatalogueShelfProps {
  columns: readonly ShelfColumn[]
  /** The open row's id. */
  selected?: string | null
  /** The open panel's id, for the selected head's `aria-controls`. */
  panelId?: string
  /** The whole period is not read (the page's switch is off, or the month
   *  has no reading yet): each head says "Not read yet" once and the tiles
   *  print their names alone, rather than "not read yet" on every tile. */
  unread?: boolean
  /** Accepted and ignored since the audit design: a head's name is its link,
   *  underlined on hover, with no arrow. */
  opens?: boolean
  className?: string
}

export function shelfTone(videos: number): 0 | 1 | 2 | 3 {
  if (videos <= 0) return 0
  if (videos <= 2) return 1
  if (videos <= 5) return 2
  return 3
}

const TONE: Record<0 | 1 | 2 | 3, string> = {
  0: 'border border-dashed border-input-line bg-card text-secondary-foreground',
  1: 'bg-accent text-accent-foreground',
  2: 'bg-brand/65 text-brand-foreground',
  3: 'bg-brand text-brand-foreground',
}

/** The board's `.pt`: 44px, the name, the count at 600. */
const TILE = 'flex min-h-[44px] items-center justify-between gap-2.5 rounded-[8px] border border-transparent px-3 py-[9px] text-[14.5px] leading-[1.3] no-underline transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

function Tile({ p, unread = false }: { p: ShelfProduct; unread?: boolean }) {
  const tone = shelfTone(p.videos ?? 0)
  return (
    <li>
      <Link href={p.href} data-tone={tone} className={cn(TILE, TONE[tone])}>
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="min-w-0">{p.name}</span>
          <FlagChip verdict={p.flag} size="sm" className="ml-0.5" />
        </span>
        {p.videos == null ? (
          unread ? null : <span className="shrink-0 text-[13px] text-muted-foreground">not read yet</span>
        ) : tone === 0 ? (
          // A read zero: the dashed tile says it to the eye; the words are a
          // screen reader's (the board prints the name alone).
          <span data-quiet-mark="" className="sr-only">no videos</span>
        ) : (
          <span data-copy="figure" className="shrink-0 font-semibold tabular-nums">{fmtInt(p.videos)}</span>
        )}
      </Link>
    </li>
  )
}

export function CatalogueShelf({ columns, selected = null, panelId, unread = false, className }: CatalogueShelfProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {columns.map((c) => {
        const on = c.id === selected
        return (
          <div key={c.id} data-column={c.id} className="grid grid-cols-1 gap-x-7 gap-y-3.5 border-t border-track py-[22px] min-[900px]:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="m-0 text-[19px] leading-[1.3] font-semibold">
                <Link
                  href={c.href}
                  aria-expanded={on && panelId ? true : undefined}
                  aria-controls={on && panelId ? panelId : undefined}
                  aria-current={on ? 'true' : undefined}
                  className={cn('rounded-[4px] text-foreground no-underline decoration-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground', on ? SELECTED_CARD_RING : null)}
                >
                  {c.name}
                </Link>
              </h3>
              {c.videos == null ? (
                <p className="m-0 text-[15px] text-muted-foreground">Not read yet</p>
              ) : (
                <div className="text-[15px] leading-[1.45] text-foreground">
                  <span className="font-semibold"><span data-copy="figure" className="tabular-nums">{fmtInt(c.videos)}</span> {c.videos === 1 ? 'video' : 'videos'}</span>
                  {c.line ? <>, {c.line}</> : null}
                </div>
              )}
              {c.note ? <div className="text-[14px] leading-[1.45] text-secondary-foreground">{c.note}</div> : null}
              {c.cameUp ? (
                <p className="m-0 text-[14px] text-secondary-foreground">
                  <span data-copy="figure" className="tabular-nums">{fmtInt(c.cameUp.k)}</span> of your <span data-copy="figure" className="tabular-nums">{fmtInt(c.cameUp.n)}</span> came up
                </p>
              ) : null}
              {c.unclear && c.unclear.count > 0 ? (
                <Link href={c.unclear.href} className={cn(GO, 'self-start text-[13.5px]')}>
                  Couldn’t tell which: <span data-copy="figure" className="tabular-nums">{fmtInt(c.unclear.count)}</span> {c.unclear.count === 1 ? 'video' : 'videos'}
                </Link>
              ) : null}
            </div>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(176px,1fr))] content-start gap-2 p-0">
              {c.products.map((p) => <Tile key={p.id} p={p} unread={unread} />)}
              {c.more && c.more.count > 0 ? (
                <li>
                  <Link href={c.more.href} data-more="" className={cn(TILE, 'border-dashed border-control text-secondary-foreground')}>
                    <span>+<span data-copy="figure" className="tabular-nums">{fmtInt(c.more.count)}</span> more</span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

const CHIP_KEY = 'inline-flex h-[30px] items-center rounded-[7px] px-3'

/** The shelf's key (the board's chips): the month the shades count, the
 *  three shades and the quiet outline. NO DASH (17 Oct, the lead's ruling on
 *  the G4 report): the ranges read "1 to 2" and "3 to 5". */
export function ShelfLegend({ month }: { month?: string | null } = {}) {
  return (
    <div data-shelf-legend="" className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13.5px] text-foreground">
      {month ? <span className={cn(LBL, 'mr-1')}>Videos in {month}</span> : null}
      <span className={cn(CHIP_KEY, 'bg-accent')}><span data-copy="figure">1 to 2</span></span>
      <span className={cn(CHIP_KEY, 'bg-brand/65')}><span data-copy="figure">3 to 5</span></span>
      <span className={cn(CHIP_KEY, 'bg-brand')}><span data-copy="figure">6 or more</span></span>
      <span className={cn(CHIP_KEY, 'border border-dashed border-input-line text-secondary-foreground')}>Quiet, no videos</span>
    </div>
  )
}
