import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EMPTY, GO, GO_TEXT, LBL, TAG, TAG_TONE } from './look'

// THE AUDIT DESIGN'S COMPONENTS (7 Nov): the figures row under a page title,
// the section head, the dashed empty box, the label, the link and the tag,
// drawn to the boards (Market-After.dc.html's `.strip`, `.h2row`, the dashed
// "Not drawn yet" box, `.lbl`, `.go`). Server components, exported through
// '@/components/v2'. Their class strings live in ./look, which client
// components import directly.

/** One cell of a figures row: what it is, and its value. */
export interface StatItem {
  term: ReactNode
  value: ReactNode
  /** A stable React key where the term is not a plain string. */
  key?: string
}

/** The figures row's grid: one column below 900px, a column a cell from 900
 *  (written out in full, MASTER rule 1). Its bones
 *  (`SkeletonStatStrip`, components/shell/skeleton.tsx) draw the same. */
export const STAT_STRIP_GRID = 'm-0 grid grid-cols-1 gap-6 border-b border-border pb-5'
export const STAT_STRIP_COLS: Record<number, string> = {
  1: 'min-[900px]:grid-cols-1',
  2: 'min-[900px]:grid-cols-2',
  3: 'min-[900px]:grid-cols-3',
  4: 'min-[900px]:grid-cols-4',
  5: 'min-[900px]:grid-cols-5',
  6: 'min-[900px]:grid-cols-6',
}

/**
 * The figures row under a page title (the boards' `<dl class="strip">`): the
 * screen's base said once, so the lines below may print bare counts
 * (decision 2). One column below 900px, a column a cell from 900. Renders
 * nothing for an empty list.
 *
 * `data-stat-strip`, NOT `data-strip`: the Voices pages' test asserts that a
 * creator's page carries no `data-strip`.
 */
export function StatStrip({ items, columns }: {
  items: readonly StatItem[]
  /** The columns from 900px where the board keeps a wider grid than its
   *  cells (Worth a reply's two cells in four columns); the cell count by
   *  default. */
  columns?: number
}): ReactNode {
  if (!items.length) return null
  return (
    <StatStripFrame cells={Math.max(items.length, columns ?? 0)}>
      {items.map((item, i) => <StatStripCell key={item.key ?? (typeof item.term === 'string' ? item.term : i)} item={item} />)}
    </StatStripFrame>
  )
}

/** The figures row's `<dl>` alone, for a page that fills its cells in as its
 *  reads settle (the Dashboard streams two of its four): `cells` sets the
 *  columns, so the row keeps its shape while a cell is still a bone. */
export function StatStripFrame({ cells, children }: { cells: number; children: ReactNode }): ReactNode {
  return (
    <dl data-stat-strip="" className={cn(STAT_STRIP_GRID, STAT_STRIP_COLS[Math.max(1, Math.min(cells, 6))])}>
      {children}
    </dl>
  )
}

/** One cell of the figures row: its term over its value. */
export function StatStripCell({ item }: { item: StatItem }): ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-[1.4] text-muted-foreground">{item.term}</dt>
      <dd className="m-0 mt-1 text-[16px] font-semibold leading-[1.4] tabular-nums text-foreground">{item.value}</dd>
    </div>
  )
}

/** A section's heading row (the boards' `.h2row`, 48px above it and 18px
 *  under it): the heading, and a muted note or an action at its right. Its
 *  margins allow for `PageFrame`'s 22px between children, which every page
 *  sits in: 26px above and -4px under make the boards' 48 and 18. */
export function SectionHead({
  title,
  note,
  action,
  id,
  as: Heading = 'h2',
}: {
  title: ReactNode
  note?: ReactNode
  action?: ReactNode
  id?: string
  as?: 'h2' | 'h3'
}): ReactNode {
  return (
    <div data-section-head="" className="mx-0.5 mt-[26px] -mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <Heading id={id} className="m-0 text-[21px] font-semibold leading-[1.3] text-foreground">
        {title}
      </Heading>
      {note != null ? <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">{note}</p> : null}
      {action != null ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/**
 * The dashed box a thin or empty state is said in (decision 4): a short
 * title and one sentence, inside the card that keeps its title and its place.
 * `chart` stands it in a chart's place: at least 180px tall, its words
 * centred, as the boards' "Not drawn yet".
 */
export function EmptyBox({ title, chart, children }: { title?: ReactNode; chart?: boolean; children: ReactNode }): ReactNode {
  return (
    <div data-empty-box="" className={cn(EMPTY, 'flex flex-col gap-1.5', chart && 'min-h-[180px] justify-center gap-2')}>
      {title != null ? <p className="m-0 text-[15px] font-semibold leading-[1.4] text-foreground">{title}</p> : null}
      <div>{children}</div>
    </div>
  )
}

/** A label in sentence case (`LBL`). */
export function Label({
  as: El = 'p',
  id,
  children,
}: {
  as?: 'p' | 'span' | 'h3' | 'h4' | 'dt'
  id?: string
  children: ReactNode
}): ReactNode {
  return (
    <El id={id} className={cn('m-0', LBL)}>
      {children}
    </El>
  )
}

/** A link that says where it goes (`GO`), with no arrow. `external` opens a
 *  new tab with `rel="noopener noreferrer"`. `inText`: the link sits inside
 *  a sentence, so it keeps the sentence's line (`GO_TEXT`, the 44px rule's
 *  exception); every other link is 44px to tap on a phone. */
export function GoLink({
  href,
  children,
  className,
  external,
  inText = false,
}: {
  href: string
  children: ReactNode
  className?: string
  external?: boolean
  inText?: boolean
}): ReactNode {
  const look = inText ? GO_TEXT : GO
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn(look, className)}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cn(look, className)}>
      {children}
    </Link>
  )
}

/** A tag (`TAG`) on one of its tones; the pale yellow by default. */
export function Tag({ tone = 'tint', children }: { tone?: 'hi' | 'mid' | 'tint'; children: ReactNode }): ReactNode {
  return (
    <span data-tag={tone} className={cn(TAG, TAG_TONE[tone])}>
      {children}
    </span>
  )
}
