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
// `bg-neutral-seg` are the artboard's green, amber and grey dots. No hex
// reaches a className.
//
// AND THE FAINT TEXT IS `--muted-foreground`, NOT `--cat`. The artboard's
// metadata grey is #9AA1A9, which the system already has a token for — but
// `--cat` is a DATA-BUCKET colour (the category series), and at 2.61:1 on white
// it is under DESIGN.md's floor for text. Eighteen rule sentences were being
// printed in it, including the save strip's "What that save broke was not
// written down." — the page's honesty lines rendered fainter than the facts
// they qualify. `--muted-foreground` (#6E7378, 4.6:1) is the faintest text this
// system has, and three levels of ink (foreground · secondary · muted) is the
// hierarchy; a fourth that cannot be read is not one.

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
      {rule && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">{rule}</span>}
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
        {meta && <span className="font-mono text-[10.5px] text-muted-foreground">{meta}</span>}
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
  cols, min, head, align, children,
}: { cols: string; min: number; head: readonly ReactNode[]; align?: GridAlign; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div style={{ minWidth: `${Math.max(min, gridIntrinsic(cols))}px` }}>
        <GridHead cols={cols} cells={head} align={align} />
        {children}
      </div>
    </div>
  )
}

/**
 * Which way each column reads, HEAD AND CELLS FROM ONE ARRAY.
 *
 * The default — first column left, the rest right — is the shape of a table of
 * figures, and it was wrong for the three columns on this page that hold
 * SENTENCES: the head sat at the far right of a column whose text starts at the
 * left, so "ACCOUNTS WE READ" floated ~450px from the thing it named. Fixing it
 * per cell was how it broke: a cell could set `text-left` and the head could
 * not follow. One array, passed to `GridTable` and to every `GridRow` under it.
 */
export type GridAlign = readonly ('left' | 'right')[]

const alignClass = (align: GridAlign | undefined, i: number): string =>
  (align?.[i] ?? (i === 0 ? 'left' : 'right')) === 'left' ? 'text-left' : 'text-right'

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

function GridHead({ cols, cells, align }: { cols: string; cells: readonly ReactNode[]; align?: GridAlign }) {
  return (
    <div
      className="grid items-center gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
      style={{ gridTemplateColumns: cols } as CSSProperties}
    >
      {cells.map((c, i) => (
        <span key={i} className={alignClass(align, i)}>{c}</span>
      ))}
    </div>
  )
}

/** One row of a `GridTable`. Without an `align` the first cell reads left and
 *  the rest read right; with one, head and cells read the same way. */
export function GridRow({
  cols, cells, align, minHeight = 44, className,
}: { cols: string; cells: readonly ReactNode[]; align?: GridAlign; minHeight?: number; className?: string }) {
  return (
    <div
      className={cn('grid items-center gap-x-3 border-t border-border/70 py-1.5 last:border-b last:border-b-border/70', className)}
      style={{ gridTemplateColumns: cols, minHeight: `${minHeight}px` } as CSSProperties}
    >
      {cells.map((c, i) => (
        <div key={i} className={cn('min-w-0', alignClass(align, i))}>{c}</div>
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
    <span className={cn('font-mono text-[12px] tabular-nums', muted ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{value}</span>
  )
}

/** The mono footnote that follows a control row. */
export function MonoNote({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[10.5px] leading-[1.4] text-muted-foreground', className)}>{children}</span>
}

/**
 * The sentences that close a section — as ONE paragraph, not a stack.
 *
 * Every one of these sentences earns its place (the handle caveat, what
 * "Tracked since" means, which clock the own-posts column is on, why a
 * community nobody chose is in the table). The STACK does not: four paragraphs
 * of 10.5px grey, each on its own two lines, closing a section whose whole
 * point is density — that alone is most of why the built page ran 513px taller
 * than the artboard. Flowing them into one paragraph keeps every word and
 * spends the lines the words actually need.
 *
 * Nulls are dropped, so a caller can list a sentence that may not apply without
 * guarding each one at the call site.
 */
export function SectionNotes({ notes }: { notes: readonly ReactNode[] }) {
  const kept = notes.filter((n) => n != null && n !== false && n !== '')
  if (kept.length === 0) return null
  return (
    <p className="max-w-[820px] font-mono text-[10.5px] leading-[1.45] text-muted-foreground">
      {kept.map((n, i) => (
        <span key={i}>{i > 0 ? ' ' : ''}{n}</span>
      ))}
    </p>
  )
}

/**
 * A control that reads as TEXT inside a table row, at the same 44px target.
 *
 * The page has one control height and `CONTROL` holds it, but the two in-row
 * controls — "Stop watching" / "Watch it" on a community and "Rename" on a
 * rival — are not boxes: the artboard draws them as a word at the row's right
 * edge, and giving them `CONTROL`'s filled-edge box would put seventeen ringed
 * buttons down a table whose whole point is density. So they keep the word and
 * take the HEIGHT: seventeen of them rendered 17px tall in rows already 44-52px
 * high, which is a target under every floor this system has and under the one
 * `CONTROL` exists to state (ST6).
 *
 * `min-h-11` rather than `h-11`, because a message may wrap under one.
 */
export const ROW_CONTROL =
  'inline-flex min-h-11 items-center rounded-[3px] text-[12px] font-medium text-foreground transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * The target around a bare icon, as a pseudo-element, so the glyph keeps its
 * size and the pressable box does not.
 *
 * The × on a chip and on a rival row is a `size-3` glyph in `p-0.5` — a 16px
 * box — and `after:-inset-3` carried that to 40, not 44: twelve pixels around
 * sixteen is forty. Fourteen is the number that makes it 44, and it lives here
 * rather than in three className strings that drifted (ST6).
 */
export const ICON_TARGET = 'relative after:absolute after:-inset-[14px] after:content-[\'\']'

/** The artboard's control height and edge, in one place. A control that can be
 *  pressed carries a hairline ring; nothing on this page is a filled button
 *  except the one save. */
export const CONTROL =
  'inline-flex h-11 items-center rounded-[4px] bg-tile px-4 text-[12.5px] font-medium text-foreground ring-1 ring-border transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

/** The same height, for an input or a select. */
export const FIELD =
  'h-11 rounded-[4px] bg-tile px-3 text-[12.5px] text-foreground ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
