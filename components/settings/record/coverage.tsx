import type { RecordRow } from '@/lib/reading/record'

import { RecordSection } from './frame'

/**
 * COVERAGE — the artboard's two-column, `186px │ 1fr` definition list
 * (`record.coverage.rows`, `record.coverage.header`, `record.coverage.oneline`).
 *
 * This is the largest single gap the mapping found on the page: fifteen
 * `LABEL │ figure — basis` rows at `min-height:52px`, each with a mono/600
 * tabular figure leading its value, were rendered as a flat `<ul>` of 12.5px
 * sentences. A reader scanning for "how many videos" had to read rather than
 * look.
 *
 * THE ROWS ARE `recordRows`, WHICH IS THE SAME RECORD `recordLines` PRINTS.
 * Nothing is computed here and nothing new is claimed: the composer states
 * which four of the artboard's rows the data cannot honestly fill and prints
 * the honest form in their place (the per-update comment ratio, the month-keyed
 * themes-per-video comparison, the platform mix as percentages, and the refused
 * comparisons a page other than this one counts).
 *
 * THE "STILL FILLING · AS AT 28 SEP" META MOVED INTO THE HEADER, where the
 * artboard has it. Both halves were already composed — they were the last two
 * lines of the list body, where they read as two more facts about the corpus
 * rather than as the reading's own stamp.
 */

export function CoverageBlock({
  title, meta, rows, oneLine,
}: {
  /** "Coverage · September 2026". */
  title: string
  /** "still filling · as at 28 Sep 2026". */
  meta: string
  rows: readonly RecordRow[]
  /** The mono one-liner under the grid: the readings counter and
   *  `howSoundLine`, which every reading surface prints in its page bar and
   *  this page did not print at all. */
  oneLine: string
}) {
  const half = Math.ceil(rows.length / 2)
  const columns = [rows.slice(0, half), rows.slice(half)]
  return (
    <RecordSection title={title} meta={meta}>
      <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
        {columns.map((column, i) => (
          <div key={i} className="flex flex-col">
            {column.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </div>
        ))}
      </div>
      <p className="m-0 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
        <span className="text-secondary-foreground">This window in one line</span> · {oneLine}
      </p>
    </RecordSection>
  )
}

function Row({ row }: { row: RecordRow }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-0.5 border-t border-border/70 py-3 md:min-h-[52px] md:grid-cols-[186px_minmax(0,1fr)] md:py-2">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{row.label}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px]">
          {row.lead ? `${row.lead} ` : ''}
          {row.figure != null ? (
            <span data-copy="figure" className="font-mono font-semibold tabular-nums">{row.figure}</span>
          ) : null}
          {row.figure != null && row.rest ? (row.dash ? ' — ' : ' ') : ''}
          {row.rest}
        </span>
        {row.basis ? <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{row.basis}</span> : null}
      </span>
    </div>
  )
}
