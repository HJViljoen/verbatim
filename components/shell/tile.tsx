import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TileExportButton } from '@/components/export-menu'

// The grid's unit. Every tile has the same anatomy — eyebrow + meta on top,
// content, a footer that links deeper — so the pages read as one system even
// though each page composes its tiles differently.
//
// 2026-08-28 (MASTER §Visual identity): a tile is a white surface with the
// ambient --shadow-tile, no border. Depth comes from elevation, never tone.
// Inside a tile, items may sit in a TileBlock — a flat, faintly tinted inner
// block with no shadow and no border. Two levels only, never a third
// (component-map §1, nesting discipline).
//
// Class strings are written out in full (never interpolated) so Tailwind v4's
// scanner sees them — hence the lookup maps for spans.

const COL: Record<number, string> = {
  1: 'xl:col-span-1', 2: 'xl:col-span-2', 3: 'xl:col-span-3', 4: 'xl:col-span-4',
  5: 'xl:col-span-5', 6: 'xl:col-span-6', 7: 'xl:col-span-7', 8: 'xl:col-span-8',
  9: 'xl:col-span-9', 10: 'xl:col-span-10', 11: 'xl:col-span-11', 12: 'xl:col-span-12',
}
// SIX BECAME TWELVE, ADDITIVELY (Block D wave 2, the Market fix pass). Every
// existing span keeps its exact class and its exact min-height; the map simply
// answers for a taller tile. A tile is `overflow-hidden` on a fixed
// `N × 116px` area at ≥xl, so a block whose content is taller than its span
// does not scroll and does not grow — it is CUT, with no scrollbar and no
// affordance. Market's ledger draws twelve rows in production and was tuned
// from a three-row fixture: measured at 1440 it wanted 1,435px of a 644px box,
// and rows 5–12, the "you have acted on 2 of 64" line and the grounding note
// were simply gone. A page cannot hide the table it is named after, so the
// span has to be able to say eleven.
const ROW: Record<number, string> = {
  1: 'xl:row-span-1', 2: 'xl:row-span-2', 3: 'xl:row-span-3',
  4: 'xl:row-span-4', 5: 'xl:row-span-5', 6: 'xl:row-span-6',
  7: 'xl:row-span-7', 8: 'xl:row-span-8', 9: 'xl:row-span-9',
  10: 'xl:row-span-10', 11: 'xl:row-span-11', 12: 'xl:row-span-12',
}
// Stacked (sub-xl) heights roughly follow the row span so the page keeps its
// rhythm when it scrolls; a 1-row tile is at least one row unit tall.
const MIN_H: Record<number, string> = {
  1: 'min-h-[116px]', 2: 'min-h-[248px]', 3: 'min-h-[380px]',
  4: 'min-h-[512px]', 5: 'min-h-[644px]', 6: 'min-h-[776px]',
  7: 'min-h-[908px]', 8: 'min-h-[1040px]', 9: 'min-h-[1172px]',
  10: 'min-h-[1304px]', 11: 'min-h-[1436px]', 12: 'min-h-[1568px]',
}

// `warm` was retired 2026-09-18 (Block D wave 1, P0 item 2). It was a tone
// from the cream identity MASTER rule 3 retired (`#F6F1E7`, `#FDFAF3`), and
// after that retirement it rendered EXACTLY as `default` — same gap, same
// padding, same surface — with no call site anywhere. A variant that names a
// tone and paints none is a trap for the wave-2 ports: a porter asks for warmth
// and gets silence. Depth is elevation, never tone.
export type TileVariant = 'default' | 'hero' | 'strip'

export interface TileProps {
  /** Column span on the 12-column grid (≥xl). */
  col: number
  /** Row span in 116px row units (≥xl). */
  row: number
  variant?: TileVariant
  eyebrow?: ReactNode
  meta?: ReactNode
  /** Hero only: a serif lead line under the eyebrow — the page's one sentence.
   *  Serif 17px/500, `1.35`, `-0.005em`, `text-wrap:pretty`, clamped to three
   *  lines (the mock's §1 ramp). Dropped without a word on any other variant,
   *  which is why `hero` and `lead` are tested together. */
  lead?: ReactNode
  /** Left side of the footer — usually a Link deeper. */
  footer?: ReactNode
  /** Right side of the footer — a quiet note. */
  footerNote?: ReactNode
  /** The whole tile is a link target: lifts on hover (only clickable tiles lift). */
  hoverable?: boolean
  /** The tile's renderable key ('dashboard.strip'): shows the export control
   *  when an ExportScope is around it (the app pages); nothing on paper. */
  exportKey?: string
  className?: string
  bodyClassName?: string
  /** How the body's groups share spare height: packed at the top, spread
   *  between, or centred. MASTER §0 rule 8 is that tiles SPREAD their content;
   *  `start` is the default only because it is what a tile with one group
   *  wants. Ignored by `strip`, whose cells are the layout. */
  distribute?: 'start' | 'between' | 'center'
  children?: ReactNode
}

export function Tile({
  col, row, variant = 'default', eyebrow, meta, lead, footer, footerNote, hoverable = false, exportKey, className, bodyClassName, distribute = 'start', children,
}: TileProps) {
  const isHero = variant === 'hero'
  const isStrip = variant === 'strip'
  return (
    <section
      // data-tile / data-col / data-row: how print mode addresses a tile
      // (app/globals.css §Print mode) — the xl: span classes do not fire in
      // Chrome's print media, whose width is the page box.
      data-tile=""
      data-col={col}
      data-row={row}
      style={{ '--vb-span': col } as React.CSSProperties}
      className={cn(
        'group/tile relative flex min-h-0 flex-col overflow-hidden rounded-lg text-[12.5px] leading-[1.45] shadow-tile',
        // THE HERO IS THE ONE INVERTED SURFACE (Block D wave 3, SH4).
        // `Main.dc.html` §1 paints it #26292C with #ECEEF0 ink and the build
        // gave every variant `bg-tile`, changing only gap and padding.
        // Heinrich's ruling is that the artboard wins. The tile's own chrome
        // inverts with the ground — an eyebrow at `secondary-foreground`
        // (#45494D) on charcoal is unreadable — while the ink INSIDE the body
        // is the calling page's to set.
        isHero ? 'bg-hero text-hero-foreground' : 'bg-tile',
        COL[col] ?? 'xl:col-span-12',
        ROW[row] ?? 'xl:row-span-1',
        MIN_H[row] ?? 'min-h-[116px]',
        'xl:min-h-0',
        variant === 'default' && 'gap-2.5 px-4 py-3.5',
        isHero && 'gap-3 px-5 py-4',
        isStrip && 'flex-col divide-y divide-border/70 p-0 sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0',
        hoverable && 'motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 hover:-translate-y-0.5 hover:shadow-tile-hover',
        className,
      )}
    >
      {!isStrip && (eyebrow || meta || exportKey) && (
        /* THE HEADER AND THE FOOTER WRAP (Block D wave 3, SH5). The meta was
           `shrink-0 whitespace-nowrap` against a `truncate` eyebrow, so at 375
           the Reports archive's 62-char delivery meta squeezed `THE ARCHIVE`
           to ZERO WIDTH and the footer read "quotes carry" — with
           `scrollWidth === clientWidth` in both cases, so the
           no-horizontal-scroll check passed over a header with no title in it.
           A slot that will not fit takes its own line instead. */
        <header className="relative flex flex-wrap items-baseline justify-between gap-2">
          {eyebrow ? (
            <h2 className={cn('truncate text-[10.5px] font-semibold uppercase tracking-[0.06em]', isHero ? 'text-hero-foreground/75' : 'text-secondary-foreground')}>
              {eyebrow}
            </h2>
          ) : <span />}
          {meta && (
            <span className={cn('min-w-0 font-mono text-[11px]', isHero ? 'text-hero-foreground/70' : 'text-muted-foreground', exportKey && 'group-hover/tile:mr-6 group-focus-within/tile:mr-6')}>
              {meta}
            </span>
          )}
          {/* Export control: absolutely placed so the header keeps its height;
              the meta slides left only while the tile is hovered. */}
          {exportKey && <TileExportButton tileKey={exportKey} />}
        </header>
      )}
      {isHero && lead && (
        <p className={cn('line-clamp-3 font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em] [text-wrap:pretty]', isHero ? 'text-hero-foreground' : 'text-foreground')}>{lead}</p>
      )}
      {isStrip ? children : (
        <div className={cn('flex min-h-0 flex-1 flex-col gap-2.5', distribute === 'between' && 'justify-between', distribute === 'center' && 'justify-center', bodyClassName)}>{children}</div>
      )}
      {!isStrip && (footer || footerNote) && (
        <footer className={cn(
          'mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t pt-2 text-[12px] font-medium',
          isHero ? 'border-hero-foreground/20 bg-hero text-hero-foreground' : 'border-border/70 bg-tile text-foreground',
          hoverable ? 'static' : 'relative z-[1]',
        )}>
          <span className="min-w-0 truncate [&_a:hover]:underline">{footer}</span>
          {footerNote && <span className={cn('min-w-0 font-mono text-[11px] font-normal', isHero ? 'text-hero-foreground/70' : 'text-muted-foreground')}>{footerNote}</span>}
        </footer>
      )}
    </section>
  )
}

/** An inner block inside a tile — flat, faintly tinted, no shadow, no border.
 *  The second (and last) nesting level. Pass `as="li"` inside lists. */
export function TileBlock({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'article' }) {
  return <As className={cn('rounded-[4px] bg-inner px-3 py-2.5', className)}>{children}</As>
}

/** One cell of a strip tile — a counted receipt. */
export function StripCell({ eyebrow, children, className }: { eyebrow: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[3px] overflow-hidden px-4 py-2.5', className)}>
      <h2 className="shrink-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{eyebrow}</h2>
      {children}
    </div>
  )
}

/** The honest empty line a tile shows when its data isn't there yet — the
 *  tile keeps its size, the grid never collapses. */
export function TileEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-muted-foreground">{children}</p>
}
