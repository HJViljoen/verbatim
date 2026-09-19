import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The page frame. Inside the app shell's <main> (h-dvh, 24px padding) the page
// is a flex column: PageBar on top, then the grid. On ≥xl the grid is 12
// columns; rows are 116px units and a tile spans as many as it asks for. The
// 2026-08-22 rule that every page must fit one screen is retired (MASTER rule
// 7, 2026-08-28): the grid grows with its content and the page scrolls when it
// has to — whether a given page fits one screen is that page's own judgment.
// Below xl the grid becomes a single column of tiles.

export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {children}
    </div>
  )
}

export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 xl:grid-cols-12 xl:auto-rows-[116px]', className)}>
      {children}
    </div>
  )
}

/**
 * Two or three columns INSIDE one tile (Block D wave 1, P0 item 3).
 *
 * `PageGrid` has been the page's twelve columns since the redesign; what the
 * artboards also do, and the build had no way to say, is put two or three
 * readings SIDE BY SIDE inside a single tile — your side against the
 * category's, three kinds abreast, a figure beside the quote that evidences
 * it. Every block that wanted it reached for its own `grid-cols-2` with its
 * own gap and its own divider, which is how a product ends up with four
 * gutters.
 *
 * THE GUTTER IS THE PAGE'S OWN 16px, and the hairline between columns is the
 * one already inside a tile (`--border` at 70%, the tile footer's rule). Two
 * nesting levels stay two: this draws a grid, not a third surface — no
 * background, no shadow, no border box.
 *
 * IT COLLAPSES UNDER `xl`, where the page itself is one stacked column: two
 * comparisons squeezed into half a phone are two unreadable comparisons. The
 * divider turns with it — horizontal between stacked rows, vertical between
 * columns — so it never rules beside a column that is no longer beside
 * anything. Class strings are written out in full, never interpolated, so
 * Tailwind v4's scanner sees them (the rule the span maps in tile.tsx follow).
 *
 * MORE CHILDREN THAN COLUMNS IS A SECOND ROW, AND `divide-x` CANNOT SEE ONE.
 * `divide-x` compiles to a sibling selector (`& > * ~ *`), which knows nothing
 * about grid position: with `of={2}` and four children it ruled children 2, 3
 * and 4, so the first cell of the SECOND row drew a vertical hairline against
 * the container's edge, beside nothing. The vertical rule is therefore keyed to
 * the column a child lands in — every child except the first of its row — which
 * is right for any number of children, and a caller no longer has to know that
 * the count must equal `of`. Below `xl` the children are one stacked column and
 * `divide-y` is exactly right for that, so it stays.
 *
 * The rule sits at the LEADING EDGE of its column, not centred in the 16px
 * gutter: a grid gap is empty space no child owns, and nothing can paint inside
 * it without a wrapper per column. That is the trade this primitive makes, and
 * it is what the artboards' inner tables look like closely enough.
 */
const COLUMNS: Record<2 | 3, string> = {
  2: 'xl:grid-cols-2 xl:[&>*:not(:nth-child(2n+1))]:border-l',
  3: 'xl:grid-cols-3 xl:[&>*:not(:nth-child(3n+1))]:border-l',
}

/**
 * The same grid with NO rule — for columns the artboards set side by side with
 * nothing between them (Block D wave 2, E-voice).
 *
 * NOT EVERY COLUMN PAIR IS A COMPARISON. The rule above is right where the two
 * columns are two readings of one axis — Voice's growing beside fading, which
 * is exactly what the artboard rules. It is wrong where the columns are a LIST
 * flowing across the page: the artboard sets six quotes in three columns and
 * three persona cards abreast, and draws no rule between either, because a
 * column of one list is not the other column's opposite. A tinted card would
 * additionally wear a hairline against its own edge. So the divider is a prop,
 * ruled by default, and a caller that only means "lay these out" says so.
 */
const BARE: Record<2 | 3, string> = {
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
}

/**
 * TWO COLUMNS THAT ARE NOT THE SAME WIDTH (Block D wave 3, SH15).
 *
 * `of={2}` rendered `xl:grid-cols-2` and nothing else, so Overview's hero
 * split 584/584 where `Main.dc.html` sets `1fr 400px`. The consequence is not
 * cosmetic: the artboard's hero sentence sets on ONE line and the build's
 * wrapped to two — most of that tile's 292px → 459px growth — while the voices
 * column ran 184px wider than it needs and every citation tail ended in a
 * ragged gutter. A column pair where one side is a reading and the other is
 * its evidence is not a pair of equals, and the primitive had no way to say so.
 *
 * A FIXED SET OF WIDTHS, NOT A NUMBER. Tailwind v4's scanner reads class
 * strings literally, so an interpolated `xl:grid-cols-[1fr_${n}px]` compiles
 * to nothing; and three widths is what the artboards actually use. The rail is
 * the LAST column and only on `of={2}`, because a three-column layout with one
 * fixed side is a different composition and no artboard draws one. Every
 * existing caller passes no rail and is unchanged.
 */
const RAIL: Record<320 | 360 | 400, { ruled: string; bare: string }> = {
  320: { ruled: 'xl:grid-cols-[minmax(0,1fr)_320px] xl:[&>*:not(:nth-child(2n+1))]:border-l', bare: 'xl:grid-cols-[minmax(0,1fr)_320px]' },
  360: { ruled: 'xl:grid-cols-[minmax(0,1fr)_360px] xl:[&>*:not(:nth-child(2n+1))]:border-l', bare: 'xl:grid-cols-[minmax(0,1fr)_360px]' },
  400: { ruled: 'xl:grid-cols-[minmax(0,1fr)_400px] xl:[&>*:not(:nth-child(2n+1))]:border-l', bare: 'xl:grid-cols-[minmax(0,1fr)_400px]' },
}

export function TileColumns({ of, rule = true, rail, children, className }: {
  of: 2 | 3
  rule?: boolean
  /** The LAST column's fixed width above xl, in px — `Main.dc.html`'s
   *  `1fr 400px`. Two-column only; ignored with a reason on `of={3}`. */
  rail?: 320 | 360 | 400
  children: ReactNode
  className?: string
}) {
  const sized = of === 2 && rail ? RAIL[rail] : null
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-4',
        rule
          ? cn('divide-y divide-border/70 xl:divide-y-0 xl:[&>*]:border-border/70', sized ? sized.ruled : COLUMNS[of])
          : (sized ? sized.bare : BARE[of]),
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Page title · context · right-hand controls, in one slim row at the top of
 *  the page. `subtitle` (optional) is a one-line reading under the title —
 *  component-map §1: orientation and actions in one place. */
export function PageBar({
  title, context, subtitle, children,
}: { title: ReactNode; context?: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <div className="flex h-8 items-center gap-3">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
        {context && <span className="truncate font-mono text-[11.5px] text-muted-foreground">{context}</span>}
        {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
      </div>
      {subtitle && <p className="text-[12.5px] text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

/** A quiet pill control for the page bar (a link or a static label). Green
 *  only when it is the page's primary action (rule 1). */
export function BarPill({ children, active = false, primary = false, className }: { children: ReactNode; active?: boolean; primary?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors',
        primary
          ? 'bg-primary text-primary-foreground hover:bg-accent-foreground'
          : active
            ? 'bg-inner text-foreground ring-1 ring-border'
            : 'bg-tile text-secondary-foreground ring-1 ring-border hover:bg-inner',
        className,
      )}
    >
      {children}
    </span>
  )
}
