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
  title, meta, rows,
}: {
  /** "Coverage · September 2026". */
  title: string
  /** "still filling · as at 28 Sep 2026". */
  meta: string
  rows: readonly RecordRow[]
  /** The mono one-liner under the grid: the readings counter and
   *  `howSoundLine`, which every reading surface prints in its page bar and
   *  this page did not print at all. */
  /** No longer printed (copy de-clutter C8): the rows are the long form and
   *  the page bar is the one line. Accepted so older callers still compile. */
  oneLine?: string
}) {
  return (
    <RecordSection title={title} meta={meta}>
      {/* THREE STATES, AND THE WIDEST IS THE ARTBOARD'S, AT THE ARTBOARD'S
          WIDTH (Block D wave 3, RC10). Stacked on a phone; label beside value
          from `lg`; two pairs abreast from 1440, which is where the artboard
          is drawn and where the arithmetic actually holds.

          It used to be `xl`, on a comment that claimed the pane there is about
          1000px and each value column ~278px. Measured `grid-template-columns`
          with the populated fixture inside the settings shell, and counting
          the wrapped lines of every basis:

            1440 → 186 246 186 246 · longest basis 4 lines, 20 in all
            1366 → 186 209 186 209 · longest basis 5 lines, 26 in all
            1280 → 186 166 186 166 · longest basis 6 lines, 30 in all
            1024 → 186 294 (one-up) · longest basis 4 lines, 19 in all

          — so the comment's own failure condition ("wraps the bases to five
          lines") was already met at 1366 and exceeded at 1280, 16px above the
          width it named as the threshold. At 1280 "Relevance gate" ran to six
          lines beside about 200px of vertical void.

          One-up is not a degraded state: at 1024 it measures BETTER than
          two-up does at 1280 (4 lines against 6, 19 against 30). So the pair
          of columns is drawn where the artboard draws it and nowhere it does
          not fit — after, 1366 reads 186 636 with a longest basis of 2 lines
          and 10 in all, and 1280 reads 186 550 with 2 and 11. Every value
          track is `minmax(0,1fr)`, so no width can starve one to zero.

          `min-[1024px]:` RATHER THAN `lg:`, AND IT IS NOT A STYLE CHOICE.
          Tailwind sorts an arbitrary `min-[…]` variant BEFORE the named
          breakpoints, so `lg:grid-cols-…` is emitted later in the sheet, wins
          the cascade at equal specificity, and the two-up grid silently never
          appears — measured: the 1440 rule was generated correctly and the
          grid still computed to `186px 710px`. Both steps are written the same
          way so they sort against each other by width. Do not "tidy" the first
          one back to `lg:` without re-measuring `grid-template-columns` at
          1440. */}
      <div className="grid grid-cols-1 gap-x-4 border-b border-border/70 min-[1024px]:grid-cols-[186px_minmax(0,1fr)] min-[1440px]:grid-cols-[186px_minmax(0,1fr)_186px_minmax(0,1fr)]">
        {rows.map((row, i) => (
          <Row key={row.id} row={row} right={i % 2 === 1} />
        ))}
        {/* An odd row count leaves the last grid row half empty and the closing
            rule would stop halfway across. Two empty cells, only where there
            are two columns to close. */}
        {rows.length % 2 === 1 ? (
          <>
            <span className="hidden min-[1440px]:block" />
            <span className="hidden min-[1440px]:block" />
          </>
        ) : null}
      </div>
    </RecordSection>
  )
}

/**
 * One row, as two cells of the parent grid — never a box of its own, which is
 * what would put the hairline back inside a column.
 *
 * `right` is which column the pair lands in at 1440, and it buys one thing: the
 * artboard's 40px gutter between the two halves, which is this grid's 16px
 * column gap plus 24px of padding on the second label.
 */
function Row({ row, right }: { row: RecordRow; right: boolean }) {
  return (
    <>
      <span
        className={`border-t border-border/70 pt-3 font-mono text-[10.5px] uppercase leading-[1.5] tracking-[0.06em] text-muted-foreground lg:min-h-[52px] lg:pb-2 lg:pt-[11px] ${right ? 'min-[1440px]:pl-6' : ''}`}
      >
        {row.label}
      </span>
      <span className="min-w-0 pb-3 lg:border-t lg:border-border/70 lg:pb-2 lg:pt-2.5">
        <span className="block text-[12.5px]">
          {row.lead ? `${row.lead} ` : ''}
          {row.figure != null ? (
            <span data-copy="figure" className="font-mono font-semibold tabular-nums">{row.figure}</span>
          ) : null}
          {row.figure != null && row.rest ? (row.dash ? ' · ' : ' ') : ''}
          {row.rest}
        </span>
        {row.basis ? <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{row.basis}</span> : null}
      </span>
    </>
  )
}
