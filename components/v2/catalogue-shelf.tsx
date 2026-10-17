import Link from 'next/link'
import type { ReactNode } from 'react'
import { fmtInt } from '@/lib/format'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { FlagChip } from './flag-chip'
import { SELECTED_CARD_RING } from './panel'

/**
 * THE CATALOGUE SHELF (depth v2, T2; E4-Products "Your catalogue").
 *
 * Every product the client sells, in its category's column, each a tile
 * shaded by how many videos talked about it this period: none is a dashed
 * outline (quiet), one or two the pale yellow, three to five the brand yellow
 * at 65%, six or more the brand yellow. Yellow because these are the market's
 * videos (MASTER §Colour roles: yellow is the market), and a darker tile is
 * more of them, never a judgement. The shade is a tier the count already
 * says, so the count is printed on every tile too (identity never rests on
 * colour alone), and `ShelfLegend` keys the tiers.
 *
 * A column's head is an inner block on the ground: the category, its videos,
 * then two lines the page composes (its share with a verdict, what it is
 * mostly about), all a link that opens the category's panel. The open
 * column's head wears the selected ring. Under the tiles: "Couldn't tell
 * which · N", the videos about the category that named none of its products,
 * linking to that list.
 *
 * Every count is a figure node. The two composed lines are the caller's,
 * numbers marked. A product's flag is a `FlagChip` fed by its verdict ("New"
 * for a first month with videos), never a word passed in.
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
  /** Opens the category's panel. */
  href: string
  /** Under the count: the share and its verdict ("16% of the market"). */
  line?: ReactNode
  /** The last line: what it is mostly about ("Fit & comfort leads, 34 of 52"). */
  note?: ReactNode
  products: readonly ShelfProduct[]
  /** Products the column leaves off (a long category is cut to the board's
   *  height): one last tile, "+N more", into the category's panel. */
  more?: { count: number; href: string } | null
  /** About the category, but no product named. Null or zero: no link. */
  unclear?: { count: number; href: string } | null
}

export interface CatalogueShelfProps {
  columns: readonly ShelfColumn[]
  /** The open column's id. */
  selected?: string | null
  /** The open panel's id, for the selected head's `aria-controls`. */
  panelId?: string
  /** The whole period is not read (the page's switch is off, or the month
   *  has no reading yet): each head says "Not read yet" once and the tiles
   *  print their names alone, rather than "not read yet" on every tile. */
  unread?: boolean
  /** Each head opens a page (Your products, 17 Oct, G4-Products): a small
   *  arrow at the head's right says so. Off by default. */
  opens?: boolean
  className?: string
}

/** The shade a count earns: 0 quiet, 1 one or two, 2 three to five, 3 six or more. */
export function shelfTone(videos: number): 0 | 1 | 2 | 3 {
  if (videos <= 0) return 0
  if (videos <= 2) return 1
  if (videos <= 5) return 2
  return 3
}

const TONE: Record<0 | 1 | 2 | 3, string> = {
  0: 'border border-dashed border-foreground/20 bg-transparent text-muted-foreground',
  1: 'bg-accent text-accent-foreground',
  2: 'bg-brand/65 text-brand-foreground',
  3: 'bg-brand text-brand-foreground',
}

function Tile({ p, unread = false }: { p: ShelfProduct; unread?: boolean }) {
  const tone = shelfTone(p.videos ?? 0)
  return (
    <Link
      href={p.href}
      data-tone={tone}
      className={cn(
        'flex min-h-[38px] items-center justify-between gap-2 rounded-lg px-[11px] py-[9px] text-[13px] leading-[1.3] transition-[filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        TONE[tone],
      )}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="min-w-0">{p.name}</span>
        <FlagChip verdict={p.flag} size="sm" className="ml-0.5" />
      </span>
      {p.videos == null ? (
        unread ? null : <span className="shrink-0 text-[11.5px] text-muted-foreground">not read yet</span>
      ) : tone === 0 ? (
        // A read zero: a short rule, never a dash character (G4's `.qd`).
        <span data-quiet-mark="" className="shrink-0"><span aria-hidden className="inline-block h-[1.5px] w-[9px] rounded-[1px] bg-muted-foreground/60 align-middle" /><span className="sr-only">no videos</span></span>
      ) : (
        <span data-copy="figure" className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums">{fmtInt(p.videos)}</span>
      )}
    </Link>
  )
}

export function CatalogueShelf({ columns, selected = null, panelId, unread = false, opens = false, className }: CatalogueShelfProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5', className)}>
      {columns.map((c) => {
        const on = c.id === selected
        return (
          <div key={c.id} data-column={c.id} className="flex min-w-0 flex-col gap-2">
            <Link
              href={c.href}
              aria-expanded={on && panelId ? true : undefined}
              aria-controls={on && panelId ? panelId : undefined}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'mb-1 flex min-h-[150px] flex-col gap-1.5 rounded-[10px] bg-inner px-3.5 pt-3.5 pb-3 text-foreground transition-colors hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? SELECTED_CARD_RING : null,
              )}
            >
              {opens ? (
                <h3 className="m-0 flex items-baseline justify-between gap-2 text-[15px] leading-[1.25] font-semibold">
                  <span className="min-w-0">{c.name}</span>
                  <span aria-hidden data-head-opens="" className="shrink-0 text-[14px] text-orange-text">→</span>
                </h3>
              ) : <h3 className="m-0 text-[15px] leading-[1.25] font-semibold">{c.name}</h3>}
              {c.videos == null ? (
                <div className="text-[12.5px] text-muted-foreground">Not read yet</div>
              ) : (
                <div>
                  <span data-copy="figure" className={cn('font-mono text-[22px] leading-none font-medium tracking-[-0.02em] tabular-nums', c.videos === 0 ? 'text-muted-foreground' : null)}>{fmtInt(c.videos)}</span>
                  {' '}<span className="text-[12px] text-muted-foreground">videos</span>
                </div>
              )}
              {c.line ? <div className="text-[12px] leading-[1.4] text-muted-foreground">{c.line}</div> : null}
              {c.note ? <div className="text-[12.5px] leading-[1.35]">{c.note}</div> : null}
            </Link>
            {c.products.map((p) => <Tile key={p.id} p={p} unread={unread} />)}
            {c.more && c.more.count > 0 ? (
              <Link
                href={c.more.href}
                data-more=""
                className="flex min-h-[38px] items-center justify-between gap-2 rounded-lg border border-dashed border-foreground/20 px-[11px] py-[9px] text-[13px] leading-[1.3] text-muted-foreground transition-colors hover:bg-inner hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>+<span data-copy="figure" className="tabular-nums">{fmtInt(c.more.count)}</span> more</span>
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            {c.unclear && c.unclear.count > 0 ? (
              <Link href={c.unclear.href} className="px-0.5 pt-1 text-[12px] text-muted-foreground underline decoration-foreground/25 underline-offset-[3px] hover:text-foreground">
                Couldn’t tell which · <span data-copy="figure" className="tabular-nums">{fmtInt(c.unclear.count)}</span>
              </Link>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** The shelf's key: the three shades and the quiet outline, at the right of
 *  the catalogue card's head. NO DASH (17 Oct, the lead's ruling on the G4
 *  report): the ranges read "1 to 2" and "3 to 5", never an en dash. */
export function ShelfLegend() {
  const swatch = 'inline-block h-2.5 w-3.5 rounded-[3px]'
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className={cn(swatch, 'bg-accent')} /><span data-copy="figure">1 to 2</span></span>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className={cn(swatch, 'bg-brand/65')} /><span data-copy="figure">3 to 5</span></span>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className={cn(swatch, 'bg-brand')} /><span data-copy="figure">6+</span></span>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className={cn(swatch, 'border border-dashed border-foreground/30')} />quiet</span>
    </div>
  )
}
