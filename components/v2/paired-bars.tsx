import { fmtInt } from '@/lib/format'
import type { ProseSlot } from '@/lib/prose/scrub'
import { cn } from '@/lib/utils'

/**
 * ROWS OF K-OF-N BARS, SIDE BY SIDE (depth v2, T2; E4-Products-Liners "Your
 * liners against liners in general").
 *
 * Each row is something people say; each column is a population the row is
 * counted in (the category, then each of the client's products in it). A cell
 * is "19 of 52" over a short bar of that share, so the reader compares shares
 * across columns whose totals differ tenfold without a percentage pretending
 * the small one is as solid as the big one: the n is always printed, and the
 * cell IS a level ("of N", rule (b)). The category's column is the market
 * yellow and the client's are its gold (MASTER §Colour roles); a cell the page
 * wants read first is set in weight, never in a hue of its own.
 *
 * A table, because it is one: rows and columns a screen reader can walk, a
 * caption naming it, and sideways scrolling on a phone rather than squeezing.
 */

const FILL: Record<'market' | 'you' | 'rival', string> = {
  market: 'bg-brand',
  you: 'bg-you',
  rival: 'bg-comp',
}

export interface PairedColumn {
  key: string
  label: string
  /** Whose videos the column counts: the category is the market's. */
  tone: 'market' | 'you' | 'rival'
}

export interface PairedCell {
  k: number
  n: number
  /** Set in weight: the cell the page reads first. */
  highlight?: boolean
}

export interface PairedRow {
  key: string
  label: string
  /** The model slot that wrote `label`, where one did. */
  slot?: ProseSlot
  /** One per column, in the columns' order; null is an empty cell (its mark
   *  and words from `emptyLabel`). */
  cells: readonly (PairedCell | null)[]
  /** This row's own reason for an empty cell, where it differs from the
   *  table's (a subject being re-described among ones not measured yet). */
  emptyLabel?: string
}

export interface PairedBarsProps {
  /** The first column's heading ("What people say"). */
  rowHeader: string
  columns: readonly PairedColumn[]
  rows: readonly PairedRow[]
  /** The table's caption, for a screen reader. */
  label: string
  /** What an empty cell means, said to a screen reader and marked to match:
   *  `none` (the default: nothing to count, a dash, as the shelf's quiet
   *  tile), or why there is no figure (`not measured yet`, `not read`), a
   *  quiet dot, so a figure withheld never looks like a zero. */
  emptyLabel?: string
  className?: string
}

function Cell({ cell, tone }: { cell: PairedCell; tone: PairedColumn['tone'] }) {
  const pct = cell.n > 0 ? Math.min(100, (cell.k / cell.n) * 100) : 0
  return (
    <div className="flex flex-col gap-[5px]">
      <span data-copy="level" className={cn('whitespace-nowrap font-mono text-[12.5px] tabular-nums', cell.highlight ? 'font-semibold' : null)}>
        {fmtInt(cell.k)} of {fmtInt(cell.n)}
      </span>
      <div className="relative h-1.5 max-w-[120px] rounded-full bg-track">
        {pct > 0 ? <i className={cn('absolute inset-y-0 left-0 rounded-full', FILL[tone])} style={{ width: `${pct}%` }} /> : null}
      </div>
    </div>
  )
}

/** A cell with no figure, over the bare track, so the column keeps the
 *  table's rhythm without a "0 of 0" that would read as a measurement. Its
 *  mark says why: a dash for nothing to count (a product no video named),
 *  a quiet dot for a figure not there yet. */
function EmptyCell({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="font-mono text-[12.5px] text-muted-foreground"><span aria-hidden>{label === 'none' ? '–' : '·'}</span><span className="sr-only">{label}</span></span>
      <div aria-hidden className="h-1.5 max-w-[120px] rounded-full bg-track" />
    </div>
  )
}

export function PairedBars({ rowHeader, columns, rows, label, emptyLabel = 'none', className }: PairedBarsProps) {
  const th = 'border-b border-border pr-2.5 pb-2.5 text-left align-bottom text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground'
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13.5px]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>{rowHeader}</th>
            {columns.map((c) => <th key={c.key} scope="col" data-tone={c.tone} className={th}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-track last:border-b-0">
              <th scope="row" className="py-2.5 pr-2.5 text-left align-middle font-medium">
                {r.slot ? <span data-copy="subject" data-slot={r.slot}>{r.label}</span> : r.label}
              </th>
              {columns.map((c, i) => {
                const cell = r.cells[i] ?? null
                return (
                  <td key={c.key} className="py-2.5 pr-2.5 align-middle">
                    {cell ? <Cell cell={cell} tone={c.tone} /> : <EmptyCell label={r.emptyLabel ?? emptyLabel} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
