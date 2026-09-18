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
 *
 * ONE GRID, NOT TWO LISTS (design review finding 4). The first port sliced the
 * rows in half and drew two independent flex columns, which is what the
 * artboard does — and the artboard can, because every one of its rows is
 * exactly 52px tall, so the two columns' hairlines line up by construction.
 * Ours are not: the bases this product owes a reader are sentences and the row
 * heights differ by up to 5:1, so after the first row no rule crossed the
 * gutter and neither could the eye. The rows are now cells of ONE grid, filled
 * across and then down, so a grid row is as tall as the taller of its two rows
 * and the hairlines align at every width by construction rather than by luck.
 *
 * AND THE LABEL SITS AT THE TOP OF ITS CELL, not centred in it: centred, on a
 * tall row, the mono label floated level with the BASIS and not with the figure
 * it names.
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
  return (
    <RecordSection title={title} meta={meta}>
      {/* THREE STATES, AND THE WIDEST IS THE ARTBOARD'S. Stacked on a phone;
          label beside value from `lg`, where the pane is about 744px; two pairs
          abreast from `xl`, where the pane is about 1000px and each value
          column is ~278px — the artboard's own 274. Two-up any narrower gives
          the values 150px each and wraps the bases to five lines, which is the
          thing the grid exists to stop. Every value track is `minmax(0,1fr)`,
          so no width can starve one to zero. */}
      <div className="grid grid-cols-1 gap-x-4 border-b border-border/70 lg:grid-cols-[186px_minmax(0,1fr)] xl:grid-cols-[186px_minmax(0,1fr)_186px_minmax(0,1fr)]">
        {rows.map((row, i) => (
          <Row key={row.id} row={row} right={i % 2 === 1} />
        ))}
        {/* An odd row count leaves the last grid row half empty and the closing
            rule would stop halfway across. Two empty cells, only where there
            are two columns to close. */}
        {rows.length % 2 === 1 ? (
          <>
            <span className="hidden xl:block" />
            <span className="hidden xl:block" />
          </>
        ) : null}
      </div>
      <p className="m-0 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
        <span className="text-secondary-foreground">This window in one line</span> · {oneLine}
      </p>
    </RecordSection>
  )
}

/**
 * One row, as two cells of the parent grid — never a box of its own, which is
 * what would put the hairline back inside a column.
 *
 * `right` is which column the pair lands in at `xl`, and it buys one thing: the
 * artboard's 40px gutter between the two halves, which is this grid's 16px
 * column gap plus 24px of padding on the second label.
 */
function Row({ row, right }: { row: RecordRow; right: boolean }) {
  return (
    <>
      <span
        className={`border-t border-border/70 pt-3 font-mono text-[10.5px] uppercase leading-[1.5] tracking-[0.06em] text-muted-foreground lg:min-h-[52px] lg:pb-2 lg:pt-[11px] ${right ? 'xl:pl-6' : ''}`}
      >
        {row.label}
      </span>
      <span className="min-w-0 pb-3 lg:border-t lg:border-border/70 lg:pb-2 lg:pt-2.5">
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
    </>
  )
}
