import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuotes } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { CalendarSeries } from '@/lib/charts/calendar'
import { gapBasisLine, gapLine } from '@/lib/reading/gap'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { MonthLine } from '@/lib/reports/documents/figures'
import type { QuarterlyData, SubjectQuarterRow, SubjectsPage } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Card, Column, Columns, Eyebrow, Note, NotDrawn, TableHead, TableRow } from './parts'

// QR3 · Your subjects, quarter on quarter (mock page 3).
//
// FOUR COLUMNS, TWO PERIODS, AND THE PAGE SAYS WHICH IS WHICH. The month
// columns are a level — this month's share with its denominator — and the
// quarter columns are a banded comparison of this quarter against the one
// before it. The mock prints them side by side, which is right, and is exactly
// the arrangement that would let a reader take a month figure for a quarter
// figure if the header did not say so. It does.
//
// A QUARTER COLUMN BELOW SIX READINGS IS `baseline_forming`, not blank and not
// zero. `quarterChange` returns that state itself; the badge prints its word,
// and the gate sentence is printed once under the table rather than once per
// row.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE MOCK'S FIVE COLUMNS, AS FIVE COLUMNS. The build stacked all four figures
// into one sentence per row ("you 31% 26 of 84 · the category 22% 305 of
// 1,388"), which is the one arrangement in which a reader cannot scan a column.
// The cells are `FigureCell` — P0's, which stacks the figure over its "of N"
// and stamps its own `data-copy`, so rule (b) holds by construction.
//
// `qr.p3.gapline` · THE HEADLINE THE MOCK WRITES AS "gap 13 points, narrowed
// from 19 in June". It is `gapLine(row.gap, { period: true })` plus
// `gapBasisLine` — both sides with their k and n, the difference, the band, and
// the earlier quarter as its OWN dated banded reading. "Narrowed" is a
// direction word earned by three readings in one regime, and no reader's flag
// is true (D1, D5). The gap is YOU AGAINST THE CATEGORY and not against the
// rival: this page takes no read under a rival's videos at all, so a difference
// against one would be printed beside two columns neither of whose numbers it
// used (commit 920059e).
//
// `qr.p3.chart` · ONE SIDE, THE ONE WITH THE n. `SubjectsPage.line` is already
// gated at three readings by `monthLine`, and below that the months that
// carried a reading are NAMED rather than drawn — a chart is a direction claim
// too (D3). The rival's own month is printed under the chart as a level,
// because the mock draws Freitag there and this page holds that side as a
// number and not as a series.
//
// `qr.p3.quote` · wired in wave 1 and rendered nowhere. It is the month's
// voices, and only where the month's LEAD object is a subject — a theme's
// evidence under a subject heading is the thing `voicesFor` refuses.

/** The mock's `116px 136px 136px 126px 125px`, as ratios, so the table is
 *  fluid inside the 8fr column instead of overflowing a narrower one. */
const TEMPLATE = 'minmax(0,116fr) minmax(0,136fr) minmax(0,136fr) minmax(0,126fr) minmax(0,125fr)'

function Side({ side, mode }: { side: SubjectQuarterRow['you']; mode: RenderMode }): ReactNode {
  if (!side) {
    return mode === 'email'
      ? <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>— not read</span>
      : <span className="text-[12px] text-muted-foreground">— not read</span>
  }
  return (
    <FigureCell
      mode={mode}
      value={side.pct == null ? '—' : fmtPct(side.pct)}
      of={`${fmtInt(side.k)} of ${fmtInt(side.n)}`}
    />
  )
}

/** The drawn sides, as the calendar draws them. A month with no reading is
 *  `hollow` and is never closed up: the axis is the calendar, not the index
 *  (lib/charts/calendar.ts). */
function lineSeries(line: MonthLine, filling: string | null): CalendarSeries[] {
  return line.series.map((s, i) => ({
    label: s.label,
    color: i === 0 ? 'var(--cat)' : 'var(--you)',
    points: line.months.map((month, n) => {
      const value = s.points[n] ?? null
      return {
        month,
        value,
        state: value == null ? ('hollow' as const) : month === filling ? ('filling' as const) : ('read' as const),
      }
    }),
  }))
}

export const quarterlySubjects: Block<QuarterlyData> = {
  key: 'quarterly.subjects',
  title: QUARTER_PAGE_TITLE.subjects,
  question: QUARTER_PAGE_QUESTION.subjects,

  render(data, mode = 'app') {
    const s: SubjectsPage = data.subjects
    const email = mode === 'email'
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlySubjects.title}
        question={quarterlySubjects.question}
        mode={mode}
        meta={`${quarterLabel(data.quarter, false)} against ${quarterLabel(data.prior, false)}`}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlySubjects.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const gap = s.rows.map((r) => r.gap).find((g) => g != null) ?? null
    const voices = s.quotes.filter(hasQuote)
    const series = s.line ? lineSeries(s.line, data.monthStatus === 'filling' ? data.month : null) : []

    const table = (
      <Column mode={mode} gap={0}>
        <TableHead
          mode={mode}
          template={TEMPLATE}
          cells={[
            'Subject',
            `You, ${s.monthLabel}`,
            `${data.category.label}, ${s.monthLabel}`,
            `${data.category.label} ${quarterLabel(data.prior, false)} → ${quarterLabel(data.quarter, false)}`,
            `You ${quarterLabel(data.prior, false)} → ${quarterLabel(data.quarter, false)}`,
          ]}
        />
        {s.rows.map((row) => (
          <TableRow
            key={row.id}
            mode={mode}
            template={TEMPLATE}
            cells={[
              row.label,
              <Side key="you" side={row.you} mode={mode} />,
              <Side key="cat" side={row.category} mode={mode} />,
              row.categoryQuarter
                ? <BlockMovement key="catq" verdict={row.categoryQuarter} unit="pts" mode={mode} />
                : <NotDrawn key="catq" mode={mode} />,
              row.youQuarter
                ? <BlockMovement key="youq" verdict={row.youQuarter} unit="pts" mode={mode} />
                : <NotDrawn key="youq" mode={mode} />,
            ]}
          />
        ))}
        {/* `qr.p3.rules` · the build's four rule sentences, kept. The mock's
            "six subjects named 19 Aug" lives in `config_changes` and reaches
            page 8's change log; "April is below the floor at 22 videos" has no
            field on this block at all — `SHARE_BAND.minN` decides it silently
            — and is recorded as a deviation rather than invented here. */}
        <div className={email ? undefined : 'mt-2'}>
          <Note mode={mode}>
            The first two columns are {s.monthLabel} on its own. The last two are this quarter against the one before it.
            {s.monthNote ? ` ${s.monthNote}` : ''}
          </Note>
          {s.note ? <Note mode={mode}>{s.note}</Note> : null}
          {s.quarterNote ? <Note mode={mode}>{s.quarterNote}</Note> : null}
          {s.gate ? <Note mode={mode}>{s.gate} Until then the quarter columns say so rather than printing a change.</Note> : null}
        </div>
      </Column>
    )

    const aside = (
      <Column mode={mode} gap={12}>
        {s.line ? (
          <Card mode={mode}>
            <Eyebrow mode={mode}>{s.line.series[0]?.label ?? 'By month'}</Eyebrow>
            {series.length > 0 ? (
              <BlockCalendar
                blockKey={quarterlySubjects.key}
                axis={s.line.months}
                series={series}
                mode={mode}
                height={150}
                width={340}
                padL={34}
                padR={92}
                format={(v) => fmtPct(v)}
                label="the subject's share of the audience's videos, month by month"
                caption={s.line.label ?? undefined}
              />
            ) : (
              <Note mode={mode}>{s.line.label ?? s.line.empty}</Note>
            )}
            {/* THE RIVAL'S OWN SIDE, WHICH THE MOCK DRAWS AS A THIRD LINE AND
                THIS PAGE HOLDS AS A NUMBER. `SubjectQuarterRow.rival` is a
                month LEVEL; it is printed as one, beside the line, and nothing
                subtracts it from yours — two proportions on two different
                denominators have no band. */}
            {s.rivalLabel && s.rows[0]?.rival ? (
              <Note mode={mode} tone="body">
                {s.rivalLabel}, {s.monthLabel}:{' '}
                <span data-copy="level">
                  {s.rows[0].rival.pct == null ? '—' : fmtPct(s.rows[0].rival.pct)}{' '}
                  {fmtInt(s.rows[0].rival.k)} of {fmtInt(s.rows[0].rival.n)}
                </span>
              </Note>
            ) : null}
          </Card>
        ) : null}
        {/* ONE QUOTE, WHICH IS WHAT THE ARTBOARD DRAWS. `quotes()` still
            declares every ref this page is entitled to. */}
        {voices.length > 0 ? (
          <BlockQuotes mode={mode} quotes={voices.slice(0, 1).map((q) => ({ quote: q.quote, cite: q.cite }))} />
        ) : null}
      </Column>
    )

    return frame(
      <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col gap-2'}>
        {gap ? (
          <p
            className={email ? undefined : 'm-0 font-serif text-[12.5px] italic leading-[18px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginBottom: 6 } : undefined}
          >
            <span data-copy="level">{gapLine(gap, { period: true })}</span>
            {/* THE BASIS LINE IS NOT A LEVEL AND IS NOT MARKED AS ONE. It is
                a DIFFERENCE with its band — "7.8 points apart in the quarter
                from April (band 5.9)" — and rule (b) reads a level node's whole
                text for an "of N" that a difference does not have. It is still
                swept by rule (c) like any unmarked copy, which is what keeps
                "narrowed" out of it. */}
            {gapBasisLine(gap) ? <> · {gapBasisLine(gap)}</> : null}
          </p>
        ) : null}
        <Columns weights={[8, 4]} mode={mode}>
          {table}
          {aside}
        </Columns>
      </div>,
    )
  },

  verdicts(data) {
    return data.subjects.rows.flatMap((r) => [r.youQuarter, r.categoryQuarter].filter((v): v is NonNullable<typeof v> => v != null))
  },

  // `qr.p3.quote`. REFS ALONE, never the words: a snapshot freezes the ids and
  // the words resolve at render, which is how an erasure reaches a stored
  // artefact (lib/renderables/quotes-freeze.ts, decision H).
  quotes(data) {
    return data.subjects.quotes.map((q) => q.quote.ref)
  },

  emptyState(data) {
    const s = data.subjects
    if (s.notRecorded) return s.notRecorded
    if (s.rows.length === 0) return 'No subject has been named for this workspace yet, so there is nothing to compare quarter on quarter.'
    return null
  },
}
