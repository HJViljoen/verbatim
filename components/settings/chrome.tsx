import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The Settings chrome, as the artboard draws it (Block D wave 2, E-settings).
//
// WHAT CHANGED AND WHY. The built sub-page wrapped every block in a filled
// `SettingsCard` inside an elevated tile, which spends the design system's two
// nesting levels (tile → flat inner block) before a single field is drawn, and
// leaves a section's own fields sitting on a third. The artboard's Tracking
// page is ONE flat column on white: sections separated by a 1px hairline, an
// uppercase eyebrow beside a mono meta on one baseline, and every field laid
// out against a fixed 172px label gutter at a 44px control height.
//
// So these are the mock's five shapes and nothing else: the hairline `Section`,
// its `SectionHead`, the `LabelRow` gutter, the `GridTable` the two tables
// share, and the small run of controls (`Dot`, `FieldBox`, `ControlButton`)
// that keeps 44px in one place rather than in nine.
//
// Colour comes from tokens only — `bg-positive` / `bg-warning` /
// `bg-neutral-seg` are the artboard's green, amber and grey dots, and
// `text-cat` is its faint `#9AA1A9` metadata. No hex reaches a className.

/** One hairline-ruled section of a settings sub-page. */
export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3.5 border-t border-border pt-5 pb-6', className)}>
      {children}
    </section>
  )
}

/**
 * A section's head: eyebrow · mono meta · a right-hand rule.
 *
 * `rule` is the artboard's right-aligned sentence — the thing a reader has to
 * know to read the rows below ("removing one is a break, not a zero"). It is
 * never a figure.
 */
export function SectionHead({ title, meta, rule }: { title: ReactNode; meta?: ReactNode; rule?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{title}</h3>
      {meta && <span className="min-w-0 font-mono text-[11px] text-muted-foreground">{meta}</span>}
      {rule && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-cat">{rule}</span>}
    </header>
  )
}

/**
 * The artboard's label-left row: a 172px gutter carrying the label and its own
 * count, and the controls beside it.
 *
 * `top` is which of the two paddings the gutter takes — the artboard aligns a
 * label with a row of chips (7px) differently from a label beside a 44px
 * control (11px), and the difference is visible at this type size.
 */
export function LabelRow({
  label, meta, top = 'chips', children,
}: { label: ReactNode; meta?: ReactNode; top?: 'chips' | 'control'; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-6 gap-y-2 md:grid-cols-[172px_minmax(0,1fr)]">
      <div className={cn('flex flex-col gap-px', top === 'control' ? 'md:pt-2.5' : 'md:pt-1.5')}>
        <span className="text-[12.5px] font-medium">{label}</span>
        {meta && <span className="font-mono text-[10.5px] text-cat">{meta}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * The two tables on this page.
 *
 * A grid rather than a `<table>`, because the artboard's rows are 44–52px with
 * a hairline between them and cells that align on their own baseline — and
 * because a cell here holds a control as often as a figure. The column widths
 * are the artboard's, passed through; `min` keeps them from collapsing on a
 * narrow viewport, where the whole table scrolls rather than reflowing into an
 * unreadable stack.
 */
export function GridTable({
  cols, min, head, children,
}: { cols: string; min: number; head: readonly ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div style={{ minWidth: `${Math.max(min, gridIntrinsic(cols))}px` }}>
        <GridHead cols={cols} cells={head} />
        {children}
      </div>
    </div>
  )
}

/** The gap `GridHead` and `GridRow` set between columns (`gap-x-3`), in px. */
export const GRID_GAP = 12

/**
 * The narrowest a track list can actually be drawn: every fixed column, every
 * `minmax()` floor, and the gaps between them.
 *
 * A DECLARED MINIMUM NARROWER THAN THIS IS A BROKEN ROW, NOT A NARROWER TABLE.
 * The hairline rule is painted on the ROW element, which takes the wrapper's
 * width, while the cells keep their declared tracks — so where `min` is short
 * the last column hangs past the end of every rule and the section scrolls on a
 * desktop the artboard does not scroll on. The communities table declared 980
 * against 1,024 of columns, which at the page's real content width (≈912px
 * behind the app sidebar and the settings rail) showed as a 44px overhang on
 * eight rows. `min` stays a floor the caller may raise; it can no longer be one
 * the columns overflow.
 */
export function gridIntrinsic(cols: string, gap: number = GRID_GAP): number {
  const tracks = cols.trim().split(/\s+/).filter(Boolean)
  const width = (t: string): number => {
    const fixed = /^(\d+(?:\.\d+)?)px$/.exec(t)
    if (fixed) return Number(fixed[1])
    const floor = /^minmax\(\s*(\d+(?:\.\d+)?)px\s*,/.exec(t)
    if (floor) return Number(floor[1])
    return 0
  }
  return tracks.reduce((n, t) => n + width(t), 0) + Math.max(0, tracks.length - 1) * gap
}

function GridHead({ cols, cells }: { cols: string; cells: readonly ReactNode[] }) {
  return (
    <div
      className="grid items-center gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
      style={{ gridTemplateColumns: cols } as CSSProperties}
    >
      {cells.map((c, i) => (
        <span key={i} className={i === 0 ? '' : 'text-right'}>{c}</span>
      ))}
    </div>
  )
}

/** One row of a `GridTable`. The first cell reads left; the rest read right. */
export function GridRow({
  cols, cells, minHeight = 44, className,
}: { cols: string; cells: readonly ReactNode[]; minHeight?: number; className?: string }) {
  return (
    <div
      className={cn('grid items-center gap-x-3 border-t border-border/70 py-1.5 last:border-b last:border-b-border/70', className)}
      style={{ gridTemplateColumns: cols, minHeight: `${minHeight}px` } as CSSProperties}
    >
      {cells.map((c, i) => (
        <div key={i} className={cn('min-w-0', i === 0 ? '' : 'text-right')}>{c}</div>
      ))}
    </div>
  )
}

/** The artboard's 7px state dot. Meaning, in the three data tones the system
 *  allows; never decoration, and always beside the word it belongs to. */
export function Dot({ tone }: { tone: 'good' | 'watch' | 'none' }) {
  const bg = tone === 'good' ? 'bg-positive' : tone === 'watch' ? 'bg-warning' : 'bg-neutral-seg'
  return <span aria-hidden className={cn('inline-block size-[7px] shrink-0 rounded-full', bg)} />
}

/** A 44px figure cell: the count over its unit, right-aligned and tabular. */
export function Figure({ value, muted = false }: { value: ReactNode; muted?: boolean }) {
  return (
    <span className={cn('font-mono text-[12px] tabular-nums', muted ? 'text-cat' : 'font-semibold text-foreground')}>{value}</span>
  )
}

/** The mono footnote that follows a control row. */
export function MonoNote({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[10.5px] leading-[1.4] text-cat', className)}>{children}</span>
}

/** The artboard's control height and edge, in one place. A control that can be
 *  pressed carries a hairline ring; nothing on this page is a filled button
 *  except the one save. */
export const CONTROL =
  'inline-flex h-11 items-center rounded-[4px] bg-tile px-4 text-[12.5px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

/** The same height, for an input or a select. */
export const FIELD =
  'h-11 rounded-[4px] bg-tile px-3 text-[12.5px] text-foreground ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
