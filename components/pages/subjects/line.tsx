import type { Block } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { calendarBandsFor, calendarRulesFor, seriesToCalendar } from '@/lib/charts/from-series'
import { backReadBandLabel, chartReady, type CalendarSeries } from '@/lib/charts/calendar'
import { fmtPct, monthName } from '@/lib/format'
import { GAP_WORDS } from '@/lib/reading/gap'
import { endReadings, sideLegend, type SubjectsData } from '@/lib/pages/subjects'
import { CALIBRATING_LINE } from '@/lib/subjects/types'

// SU2 · the monthly line (design §3 SU2 "you, each rival and the category by
// month as lines with the counts"; the mock's (a)).
//
// ONE LINE PER SIDE, ON A GENERATED CALENDAR AXIS. Every month occupies its own
// slot whether or not it carries a row, because an index-spaced axis closes a
// hollow month up and misdates everything after it — measured on production, a
// rival with conversation in 4 of 68 months. A month below the audience's own
// floor is a gutter mark, not a point: a number that cannot be compared is not
// a reading, and drawing it as one is the lie this layer exists to stop.
//
// THE CAVEATS ARE THE AXIS'S, NOT THE LINE'S. A rename, a tracking change and a
// re-grouping draw ONE dated rule each across the whole chart however many
// lines carry them, and a run of back-read months is one shaded band rather
// than one caveat per bar (lib/charts/from-series.ts).
//
// AND THE "gap 13 pts" BRACKET IS THE BANDED GAP OR NOTHING (D1). The artboard
// draws a dashed bracket between your line and the rival's with the distance
// beside it. That distance is a reading with its own floors, so the chart is
// handed the WORD the gap earned — never a subtraction of two plotted values,
// which would print a magnitude one tile above refuses. On this month's n the
// gap is `too_little_data` and the bracket does not appear, which is the same
// answer the hero's own lead gives.

export const subjectsLine: Block<SubjectsData> = {
  key: 'subjects.line',
  title: 'Month by month',
  question: 'Where has this subject been going?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    const empty = subjectsLine.emptyState(data)
    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    // THE KEY IS QUALIFIED; THE END LABEL IS NOT. "Category — no brand 24.5% of
    // 1,388" does not fit the plot's right-hand gutter and lost its
    // denominator to the clip, which is the one part of an end label that may
    // not go missing.
    const legendOf = new Map(pane.sides.map((s) => [s.audience, sideLegend(s, data.brand)]))
    // THE CHART'S OWN AXIS AND LINES (2026-09-24): the trailing twelve months
    // whatever the horizon (`chartMonths`, lib/reading/horizon.ts). A snapshot
    // frozen before that carries neither and draws what it always drew.
    const axis = data.chartAxis ?? data.axis
    const chartSeries = pane.chartSeries ?? pane.series
    const lines: CalendarSeries[] = pane.sides
      .map((side) => {
        const series = chartSeries.find((s) => s.audience === side.audience)
        if (!series) return null
        return {
          ...seriesToCalendar(series, {
            color: side.color,
            label: side.label,
            legendLabel: legendOf.get(side.audience) ?? side.label,
          }),
          // A stopped rival with no line is not news; it is left out rather
          // than listed under "No line yet" (lib/charts/calendar.ts).
          ...(side.label.endsWith(' · stopped') ? { omitWhenUndrawn: true } : {}),
        }
      })
      .filter((s): s is CalendarSeries => s != null)

    // THROUGH `openLink`, LIKE EVERY OTHER BLOCK ON THE PAGE — which is also
    // E-marketing's fix, arrived at from the other side: the marketing brief
    // borrows this block onto a landscape sheet, where "Compare another
    // subject →" is an instruction to press a control the reader of a PDF has
    // not got. `openLink` draws nothing for print, so both packages get what
    // they asked for from one call. A hand-rolled
    // pair prints the app's own control on PAPER too — and this page is a
    // registered `PageModule`, so its print arm reaches a PDF and a
    // `/r/<token>` page, where "Compare another subject →" resolves to a login
    // wall. `openLink` draws nothing for print, which is the answer.
    const footer = openLink(mode, `${ctx.appUrl}/dashboard/subjects`, 'Compare another subject →')

    // The mock's axis meta: the months the axis actually spans, named, rather
    // than a count of them — "Apr → Sep 2026" tells a reader which six.
    const first = axis[0]
    const last = axis[axis.length - 1]
    const span = axis.length === 0
      ? null
      : axis.length === 1
        ? monthName(last)
        : `${monthName(first).split(' ')[0]} → ${monthName(last)}`

    // The back-read band's own words, in the footer's mono slot — the artboard's
    // "Apr–Jun read at setup". The band is still shaded on the axis; this is
    // the sentence that says what the shading means without a hover.
    const bands = calendarBandsFor(chartSeries)
    const backRead = bands.length === 1
      ? `${bands[0].months.map((m) => monthName(m).split(' ')[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('–')} read at setup`
      : bands.length > 1
        ? backReadBandLabel(bands.reduce((n, b) => n + b.months.length, 0))
        : null

    // D1 · the bracket. `apart` is the only state that carries a magnitude —
    // `gapLine` prints one only there and so does this, for the same reason.
    const gap = pane.gap
    const you = pane.sides.find((s) => s.kind === 'you')
    const rival = pane.sides.find((s) => s.audience === gap?.b.audience)
    const annotate = gap && gap.state === 'apart' && gap.gapPts != null && you && rival
      ? {
          from: you.label,
          to: rival.label,
          label: `${GAP_WORDS.apart} ${Math.abs(Math.round(gap.gapPts * 10) / 10)} pts`,
        }
      : null

    // What the chart's end labels say, for the print arm that turns them off.
    const ends = endReadings(pane.sides, chartSeries)

    return (
      <BlockFrame
        title={`Share of videos where ${pane.name.toLowerCase()} came up`}
        question={subjectsLine.question}
        mode={mode}
        meta={span ? `monthly · ${span}` : 'monthly'}
        footer={footer}
        footerNote={backRead}
      >
        {lines.length > 0 ? (
          <BlockCalendar
            blockKey={subjectsLine.key}
            axis={axis}
            series={lines}
            rules={calendarRulesFor(chartSeries)}
            bands={bands}
            annotate={annotate}
            format={(v) => fmtPct(v)}
            label={`${pane.name}, share of each audience's videos, month by month`}
            // NO CAPTION. `axisNote` is the hero's sentence and the hero is the
            // tile directly above this one — the same paragraph rendered twice
            // about 60px apart, in one screenful. The chart's own key now says
            // which ink draws no line and which months a gutter token marks
            // (`undrawnNote`, `legendEveryMonth`), which is what the caption was
            // carrying and where a reader looks for it.
            mode={mode}
            ctx={ctx}
            // THE GUTTER IS NOT THERE ON PAPER, SO THE LABELS ARE NOT EITHER
            // (Block D wave 3b, `decks`). `CalendarLine`'s own `endLabels`
            // contract prescribes this case: the label is drawn at
            // `width - padR + 10` and clipped by nothing, so a caller whose
            // column is too narrow for the gutter "turns it off, gives the
            // plot the space back, and prints the last reading under the
            // chart at its own type size". The marketing brief's `mk.subjectline`
            // is six of twelve columns and "The category 22.0% of 1,388" wants
            // about 40% of the drawing — it had been running under the gap
            // card beside it since the sheet was composed, losing the
            // denominator, which is the one part of an end label that may not
            // go missing. `endReadings` is that sentence, and it carries the
            // MONTH each line ends on, which the end label carried and a
            // level taken off the side would not.
            endLabels={mode !== 'print'}
          />
        ) : (
          <BlockEmpty mode={mode}>No audience carried a reading of this subject on this axis.</BlockEmpty>
        )}
        {/* Only under a drawn chart: under too few months the chart prints
            these figures itself (`CalendarLine`'s figures arm). */}
        {mode === 'print' && lines.length > 0 && chartReady(lines) && ends ? (
          <p data-copy="level" className="m-0 font-mono text-[12px] leading-[1.4] tabular-nums text-muted-foreground">{ends}</p>
        ) : null}
      </BlockFrame>
    )
  },

  emptyState(data) {
    if (data.list.notRecorded) return data.list.notRecorded
    if (!data.selected) return 'Nothing is selected, so there is no line to draw.'
    if (data.selected.notRecorded) return data.selected.notRecorded
    // A line of a calibrating subject's share is its share, month by month —
    // hidden with it, and said as the hero says it.
    if (data.selected.calibration !== 'ready') return CALIBRATING_LINE
    if (data.selected.series.length === 0) {
      return 'This subject has no stored months on this axis yet.'
    }
    return null
  },
}
