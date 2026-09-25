import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PageFrame, PageGrid, PageBar } from '@/components/shell/page-grid'
import { Tile, StripCell, type TileVariant } from '@/components/shell/tile'
import { hasHorizon, surface, type NavKey } from '@/lib/nav'
import { HORIZONS } from '@/lib/reading/horizon'

// Skeletons for the one-screen pages. Each route's loading.tsx composes these
// into the SAME grid its page renders (same col/row spans, same variants), so
// the page's shape is on screen the instant a link is clicked and the real
// tiles fill the cells in place — no layout shift, no blank pane. The bars
// are deliberately plain (no icons, no numbers): a skeleton that guesses at
// content reads as a broken page when the guess is wrong.

/** One shimmering bar. Width via className (w-1/2, w-24 …). `tone` follows
 *  the tile it sits on (every tile is white since 2026-08-28; `dark` is kept
 *  for any future inverted surface). */
export function Bone({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[4px]',
        tone === 'light' ? 'bg-muted' : 'bg-inner',
        className,
      )}
    />
  )
}

/** A paragraph's worth of bars, widths cycling so it reads as prose. */
export function BoneLines({
  lines = 3, tone = 'light', className, widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3'],
}: { lines?: number; tone?: 'light' | 'dark'; className?: string; widths?: string[] }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} tone={tone} className={cn('h-3', widths[i % widths.length])} />
      ))}
    </div>
  )
}

/** The big mono figure + unit word of a StatValue, as bones. */
export function BoneStat({ tone = 'light', size = 'md' }: { tone?: 'light' | 'dark'; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 'h-7' : size === 'sm' ? 'h-4' : 'h-6'
  return (
    <div className="flex items-end gap-1.5">
      <Bone tone={tone} className={cn(h, 'w-16')} />
      <Bone tone={tone} className="h-3 w-10" />
    </div>
  )
}

/** A ranked-bar / proportion-bar list: label + bar per row. */
export function BoneBars({ rows = 5, tone = 'light' }: { rows?: number; tone?: 'light' | 'dark' }) {
  const widths = ['w-full', 'w-5/6', 'w-2/3', 'w-1/2', 'w-2/5', 'w-1/3', 'w-1/4', 'w-1/5']
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <Bone tone={tone} className="h-2.5 w-1/3" />
          <Bone tone={tone} className={cn('h-2', widths[i % widths.length])} />
        </div>
      ))}
    </div>
  )
}

/** A table: header row + n body rows of `cols` cells. */
export function BoneTable({ rows = 8, cols = 5, tone = 'light' }: { rows?: number; cols?: number; tone?: 'light' | 'dark' }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-3">
        {Array.from({ length: cols }, (_, i) => <Bone key={i} tone={tone} className={cn('h-2.5', i === 0 ? 'w-2/5' : 'flex-1')} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, i) => <Bone key={i} tone={tone} className={cn('h-3', i === 0 ? 'w-2/5' : 'flex-1')} />)}
        </div>
      ))}
    </div>
  )
}

/** A Tile in its loading state: real chrome (size, variant, ring), bones
 *  where the eyebrow, meta and content will be. `children` overrides the
 *  default prose bones with a body that matches the tile (a stat, bars, a
 *  table). */
export function SkeletonTile({
  col, row, variant = 'default', lines, eyebrow = true, meta = false, className, children,
}: { col: number; row: number; variant?: TileVariant; lines?: number; eyebrow?: boolean; meta?: boolean; className?: string; children?: ReactNode }) {
  const tone = 'light' as const
  const body = children ?? <BoneLines tone={tone} lines={lines ?? Math.max(2, row * 2)} />
  return (
    <Tile
      col={col}
      row={row}
      variant={variant}
      className={className}
      eyebrow={eyebrow ? <Bone tone={tone} className="h-2.5 w-28" /> : undefined}
      meta={meta ? <Bone tone={tone} className="h-2.5 w-20" /> : undefined}
    >
      {body}
    </Tile>
  )
}

/** The strip tile (a row of counted receipts) in its loading state. */
export function SkeletonStrip({ cells = 5, col = 12, row = 1 }: { cells?: number; col?: number; row?: number }) {
  return (
    <Tile col={col} row={row} variant="strip">
      {Array.from({ length: cells }, (_, i) => (
        <StripCell key={i} eyebrow={<Bone className="h-2.5 w-20" />}>
          <BoneStat />
        </StripCell>
      ))}
    </Tile>
  )
}

/** The page bar with its real title (known statically) and a bone where the
 *  context line goes. */
export function SkeletonPageBar({ title, pills = 0 }: { title: string; pills?: number }) {
  return (
    <PageBar title={title} context={<Bone className="h-3 w-48" />}>
      {pills > 0 && Array.from({ length: pills }, (_, i) => <Bone key={i} className="h-[26px] w-20 rounded-full" />)}
    </PageBar>
  )
}

/** Frame + bar + grid — the whole page scaffold; pass the tiles as children. */
export function SkeletonPage({ title, pills, children }: { title: string; pills?: number; children: ReactNode }) {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading {title}…</span>
      <SkeletonPageBar title={title} pills={pills} />
      <PageGrid>{children}</PageGrid>
    </PageFrame>
  )
}

/** The bar every Phase 1 surface wears (components/shell/page-bar.tsx), in its
 *  loading state: the title is read from the same `lib/nav.ts` row the real
 *  bar reads, so the words on screen do not change when the page lands. The
 *  line bone appears where the surface has a line, and the horizon row only
 *  where it has one (`hasHorizon`), because a bone the page will not draw is a
 *  jump the moment it arrives. No band bone: the "How sound is this" band left
 *  every page with the 25 Sep rulings. `pills` is the right-hand controls (How
 *  to read, Export) the page mounts. */
export function SkeletonSurfaceBar({ nav, pills = 0 }: { nav: NavKey; pills?: number }) {
  const s = surface(nav)
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      {/* The one line under the title, where the surface has one (a reading
          surface's month and "as at", This week's update): a bone the page
          will draw, so the page does not jump when it lands. */}
      <PageBar title={s.label} line={s.bar === 'title' ? undefined : <Bone className="h-3 w-80 max-w-full" />}>
        {pills > 0 && Array.from({ length: pills }, (_, i) => <Bone key={i} className="h-[26px] w-20 rounded-full" />)}
      </PageBar>
      {hasHorizon(s) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {Array.from({ length: HORIZONS.length }, (_, i) => <Bone key={i} className="h-[26px] w-[84px] rounded-full" />)}
          </div>
          <Bone className="h-3 w-40" />
        </div>
      )}
    </div>
  )
}

/** A reading surface's scaffold: its own bar, then whatever sits under it.
 *  Unlike `SkeletonPage` it draws no grid of its own, because the surfaces
 *  do not share one: Overview is a single column, Subjects a rail and a main
 *  column, Market two grids, Competitive a pill row above its grid. */
export function SkeletonSurface({ nav, pills, children }: { nav: NavKey; pills?: number; children: ReactNode }) {
  return (
    <PageFrame>
      <span role="status" className="sr-only">Loading {surface(nav).label}…</span>
      <SkeletonSurfaceBar nav={nav} pills={pills} />
      {children}
    </PageFrame>
  )
}
