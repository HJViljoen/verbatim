import type { ReactNode } from 'react'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * A big mono number over its label, on the inner ground (depth v2, T2).
 *
 * The boards draw it three sizes: the opened panel's four-up `.stats` (30px),
 * Content's question counts (24px) and Your moves' evidence cells (20px). A
 * flat inner block (MASTER: inner panels carry no shadow and no border).
 *
 * THE NUMBER IS MARKED, ALWAYS. `value` is a figure node. Where the label
 * names what the value is out of, pass `of` rather than writing "of 241" into
 * the label: the cell then prints "of {N}" itself and is marked a LEVEL as a
 * whole, so "19 / of 241 videos this week" carries its denominator and keeps
 * rule (b) by construction. A label that is not a level ("in a usual week")
 * is the caller's words, and any number in it is the caller's to mark.
 */

const VALUE = {
  lg: 'text-[30px]',
  md: 'text-[24px]',
  sm: 'text-[20px]',
} as const

const LABEL = {
  lg: 'mt-2 text-[12.5px]',
  md: 'mt-1.5 text-[12.5px]',
  sm: 'mt-1.5 text-[12px]',
} as const

const PAD = {
  lg: 'px-4 pt-4 pb-3.5',
  md: 'px-3.5 py-3',
  sm: 'px-[13px] py-3',
} as const

export interface StatCellProps {
  /** A count (printed with separators) or a value already formatted ("9.7%"). */
  value: number | string
  label: ReactNode
  /** What the value is out of: printed as "of {N}" before the label, and the
   *  cell is then a level. */
  of?: number
  size?: 'lg' | 'md' | 'sm'
  /** Under the label: a `UnitSquares` row of dots, a small chart. */
  children?: ReactNode
  className?: string
}

export function StatCell({ value, label, of, size = 'lg', children, className }: StatCellProps) {
  const shown = typeof value === 'number' ? fmtInt(value) : value
  const level = of != null
  return (
    <div data-copy={level ? 'level' : undefined} className={cn('min-w-0 rounded-[10px] bg-inner', PAD[size], className)}>
      <div
        data-copy={level ? undefined : 'figure'}
        className={cn('font-mono font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground', VALUE[size])}
      >
        {shown}
      </div>
      <div className={cn('leading-[1.4] text-muted-foreground', LABEL[size])}>
        {level ? <>of {fmtInt(of)} </> : null}
        {label}
      </div>
      {children}
    </div>
  )
}

/** The panel's row of stats: four across at xl, two below (the boards'
 *  `.stats`, which drop to two under 1180px). */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 xl:grid-cols-4', className)}>{children}</div>
}
