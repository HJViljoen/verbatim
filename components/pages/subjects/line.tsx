import type { Block } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { calendarBandsFor, calendarRulesFor, seriesToCalendar } from '@/lib/charts/from-series'
import { backReadBandLabel, chartReady, type CalendarSeries } from '@/lib/charts/calendar'
import { fmtInt, fmtPct, longMonth, monthName, shortDate } from '@/lib/format'
import { GAP_WORDS } from '@/lib/reading/gap'
import { allRedescribed, endReadings, monthsReadOf, paneSides, sideLegend, SUBJECTS_ALL_REDESCRIBED, type SubjectPane, type SubjectsData } from '@/lib/pages/subjects'
import type { CSSProperties } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import type { MonthPoint } from '@/lib/reading/series'
import { PairChip } from '@/components/blocks/pair-chip'
import { EMAIL, FONT } from '@/lib/email/theme'
import { marketLevel } from '@/lib/pages/overview-market/kinds'
import { InnerBlock } from '@/components/charts/week-bars'
import { WeekLineStrip } from '@/components/charts/week-line'
import { WEEK_LINE_EMPTY } from '@/lib/charts/week-line'
import { WEEK_STRIP_TOO_FEW } from '@/lib/pages/overview-market/weeks'

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

/**
 * The chart's lines for the selected subject, or null with nothing selected.
 *
 * THE KEY IS QUALIFIED; THE END LABEL IS NOT. "Category — no brand 24.5% of
 * 1,388" does not fit the plot's right-hand gutter and lost its denominator to
 * the clip, which is the one part of an end label that may not go missing.
 * The pane's sides under its calibration (decision C): a provisional subject
 * draws no line for your own side.
 *
 * THE CHART'S OWN AXIS AND LINES (2026-09-24): the trailing twelve months
 * whatever the horizon (`chartMonths`, lib/reading/horizon.ts). A snapshot
 * frozen before that carries neither and draws what it always drew.
 */
function lineSeriesOf(data: SubjectsData): CalendarSeries[] | null {
  const pane = data.selected
  if (!pane) return null
  const sides = paneSides(pane)
  const legendOf = new Map(sides.map((s) => [s.audience, sideLegend(s, data.brand)]))
  const chartSeries = pane.chartSeries ?? pane.series
  return sides
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
}

/** Does the tile draw its chart (a line with enough months), rather than the
 *  few figures it prints under too few? The page gives the tile the mock's
 *  height only when it does (deploy 2 review: under three months the 340px
 *  and stacked 512px floors left an empty band about 250px tall). */
export function subjectLineDrawsChart(data: SubjectsData): boolean {
  if (subjectsLine.emptyState(data)) return false
  if (data.selected?.monthStates !== undefined) return monthsReadOf(data.selected.marketLine).length >= LINE_FROM
  const lines = lineSeriesOf(data)
  return lines != null && lines.length > 0 && chartReady(lines)
}

export const subjectsLine: Block<SubjectsData> = {
  key: 'subjects.line',
  title: 'Month by month',
  question: 'Where has this subject been going?',

  render(data, mode = 'app', ctx) {
    const pane = data.selected
    // THE SUBJECT ON THE MARKET, MONTH BY MONTH (WP2.2): a pane the loader
    // builds; one stored before WP2.2 draws its sides' lines, as sent (below).
    if (data.list.base !== undefined && (!pane || pane.monthStates !== undefined)) {
      return <MarketMonths data={data} mode={mode} appUrl={ctx.appUrl} ctx={ctx} />
    }
    const empty = subjectsLine.emptyState(data)
    if (!pane || empty) {
      return (
        <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    const sides = paneSides(pane)
    const axis = data.chartAxis ?? data.axis
    const chartSeries = pane.chartSeries ?? pane.series
    const lines = lineSeriesOf(data) ?? []

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
    const you = sides.find((s) => s.kind === 'you')
    const rival = sides.find((s) => s.audience === gap?.b.audience)
    const annotate = gap && gap.state === 'apart' && gap.gapPts != null && you && rival
      ? {
          from: you.label,
          to: rival.label,
          label: `${GAP_WORDS.apart} ${Math.abs(Math.round(gap.gapPts * 10) / 10)} pts`,
        }
      : null

    // What the chart's end labels say, for the print arm that turns them off.
    const ends = endReadings(sides, chartSeries)

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
    if (!data.selected) return allRedescribed(data) ? SUBJECTS_ALL_REDESCRIBED : 'Nothing is selected, so there is no line to draw.'
    if (data.selected.notRecorded) return data.selected.notRecorded
    if (data.selected.series.length === 0) {
      return 'This subject has no stored months on this axis yet.'
    }
    return null
  },
}

// ---- WP2.2 · the subject on the market, month by month ----------------------------

/** A line is drawn from the third month read (§2.3 S6: "figures until three
 *  readable months"); under it each month is a card. */
export const LINE_FROM = 3

const COUNT_WORDS = ['No', 'One', 'Two'] as const

/** The block's one line under its title while there is no line yet: "Two
 *  months read, not yet a line." The preview's sentence named each month's
 *  share there too; each share needs its base (§4.0: every level prints "of
 *  N") and a sentence carries one base, so the levels are the cards' under it
 *  ("10% · 38 of 377"), and the sentence is the count of months alone. */
export function monthsLead(line: SubjectPane['marketLine']): string | null {
  const read = monthsReadOf(line).length
  if (read >= LINE_FROM) return null
  if (read === 0) return 'No month read yet.'
  return `${COUNT_WORDS[read]} month${read === 1 ? '' : 's'} read, not yet a line.`
}

/** The note under the next pair's cards: "once November has filled, about
 *  the 3 Jan update". */
export const nextPairNote = (next: NonNullable<SubjectPane['nextPair']>): string =>
  `once ${longMonth(next.month)} has filled, about the ${shortDate(next.inFullExpected)} update`

function MonthCard({ month, state, point, current, future, mode }: {
  month: string; state: string | null; point: MonthPoint | null
  current: boolean; future: boolean; mode: RenderMode
}) {
  const level = point ? marketLevel(point.k, point.videos) : null
  // ON A PHONE the months read come first, then their chip, then the months to
  // come and their note; from `md` one grid row holds every card.
  const order = future ? 'order-3 md:order-none' : 'order-1 md:order-none'
  if (mode === 'email') {
    return (
      <tr>
        <td style={{ fontFamily: FONT.sans, fontSize: 12.5, color: future ? EMAIL.muted : EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>{longMonth(month)}{state ? <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}> · {state}</span> : null}</td>
        <td data-copy={point && level ? 'level' : undefined} style={{ fontFamily: FONT.mono, fontSize: 12.5, color: EMAIL.ink, textAlign: 'right', padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
          {point && level && point.k != null && point.videos != null ? (level.kind === 'share' ? `${level.text} · ${fmtInt(point.k)} of ${fmtInt(point.videos)}` : `${fmtInt(point.k)} of ${fmtInt(point.videos)}`) : ''}
        </td>
      </tr>
    )
  }
  return (
    <div className={future
      ? `flex min-w-0 flex-col gap-1 rounded-md border border-dashed border-border p-6 md:row-start-2 md:min-h-[152px] ${order}`
      : `flex min-w-0 flex-col gap-1 rounded-md bg-inner p-6 md:row-start-2 md:min-h-[152px] ${order}`}
    >
      <span className="flex items-center gap-2">
        {future ? null : <span aria-hidden className={`size-2.5 rounded-[2px] ${current ? 'bg-foreground' : 'bg-cat'}`} />}
        <span className={`text-[15px] font-semibold ${future ? 'text-muted-foreground' : 'text-foreground'}`}>{longMonth(month)}</span>
      </span>
      {state ? <span className="text-[13px] leading-[1.45] text-muted-foreground">{state}</span> : null}
      {point && level && point.k != null && point.videos != null ? (
        <span data-copy="level" className="mt-auto flex items-baseline gap-2 pt-4">
          <span className={`font-mono text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] ${current ? 'text-foreground' : 'text-muted-foreground'}`}>
            {level.kind === 'share' ? level.text : fmtInt(point.k)}
          </span>
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{level.kind === 'share' ? `${fmtInt(point.k)} of ${fmtInt(point.videos)}` : `of ${fmtInt(point.videos)}`}</span>
        </span>
      ) : null}
    </div>
  )
}

/**
 * MONTH BY MONTH ON THE MARKET (WP2.2, §2.3 S6; the approved preview). One
 * pooled line for the subject's share of the market. Until three months are
 * read, each month read is a card (its state and its level) and the months to
 * come up to the next pair read the same way are dashed cards with the dates
 * the pages move on, the pair bracketed as "the first step joined as a line";
 * the pair's one chip sits under the months read. From the third month a line
 * is drawn, and a step whose pair is refused is drawn broken (WP1.3). No
 * weekly strip at deploy 3 (§2.3 S6); from the deploy that prints the
 * same-age line (WP3.13, deploy 3w at the earliest) the subject's weeks sit
 * in a strip under the months (`SubjectWeekStrip`).
 */
function MarketMonths({ data, mode, appUrl, ctx }: { data: SubjectsData; mode: RenderMode; appUrl: string; ctx: Parameters<typeof subjectsLine.render>[2] }) {
  const pane = data.selected
  const footer = openLink(mode, `${appUrl}/dashboard/subjects`, 'Compare another subject →')
  const empty = subjectsLine.emptyState(data)
  if (!pane || (empty && !pane.marketLine)) {
    return (
      <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode} roomy>
        <BlockEmpty mode={mode}>{empty ?? 'Nothing is selected.'}</BlockEmpty>
      </BlockFrame>
    )
  }
  const line = pane.marketLine ?? null
  const read = monthsReadOf(line)
  const lead = monthsLead(line)
  const chip = pane.chip ? <PairChip words={pane.chip} mode={mode} /> : null

  if (read.length >= LINE_FROM && line) {
    const axis = data.chartAxis ?? data.axis
    const series = [seriesToCalendar(line, { color: 'var(--foreground)', label: 'Your market', legendLabel: 'Your market' })]
    return (
      <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode} footer={footer} roomy>
        <BlockCalendar
          blockKey={subjectsLine.key}
          axis={axis}
          series={series}
          rules={calendarRulesFor([line])}
          bands={calendarBandsFor([line])}
          format={(v) => fmtPct(v)}
          label={`${pane.name}, share of your market's videos, month by month`}
          mode={mode}
          ctx={ctx}
          endLabels={mode !== 'print'}
        />
        {chip}
        <SubjectWeekStrip pane={pane} mode={mode} />
      </BlockFrame>
    )
  }

  const states = pane.monthStates ?? {}
  const readMonths = read.map((p) => p.month.slice(0, 10))
  const futureMonths = Object.keys(states).filter((m) => m > data.month.slice(0, 10) && !readMonths.includes(m)).sort().slice(0, 4 - readMonths.length)
  const cards = [...readMonths, ...futureMonths]
  const pointOf = (m: string) => read.find((p) => p.month.slice(0, 10) === m) ?? null
  const next = pane.nextPair ?? null
  const from = next ? cards.indexOf(next.prevMonth.slice(0, 10)) : -1
  const to = next ? cards.indexOf(next.month.slice(0, 10)) : -1
  const bracket = next && from >= 0 && to > from

  if (mode === 'email') {
    return (
      <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode} footer={footer}>
        {lead ? <p style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink, margin: '4px 0 8px' }}>{lead}</p> : null}
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {cards.map((m) => <MonthCard key={m} month={m} state={states[m] ?? null} point={pointOf(m)} current={m === data.month.slice(0, 10)} future={!readMonths.includes(m)} mode={mode} />)}
          </tbody>
        </table>
        {chip}
        {next && bracket ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, paddingTop: 6 }}>{`the first step joined as a line: ${longMonth(next.prevMonth)} to ${longMonth(next.month)}, ${nextPairNote(next)}`}</div> : null}
        <SubjectWeekStrip pane={pane} mode={mode} />
      </BlockFrame>
    )
  }
  const n = cards.length
  const grid = n >= 4 ? 'md:grid-cols-4' : n === 3 ? 'md:grid-cols-3' : n === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1'
  const span = (a: number, b: number) => ({ '--span': `${a} / ${b}` }) as CSSProperties
  return (
    <BlockFrame title={subjectsLine.title} question={subjectsLine.question} mode={mode} footer={footer} roomy>
      {/* The one-line answer sits 16px under its title, as the preview sets it
          (d3 polish): the body's 24px gap, less 8. */}
      {lead ? <p className="-mt-2 mb-0 max-w-[760px] text-[17px] font-medium leading-[1.5] tracking-[-0.01em] text-foreground [text-wrap:pretty]">{lead}</p> : null}
      <div className={`flex flex-col gap-3 md:grid md:gap-x-6 ${grid}`}>
        {bracket ? (
          <div aria-hidden className="hidden flex-col items-center gap-2 md:row-start-1 md:flex md:[grid-column:var(--span)]" style={span(from + 1, to + 2)}>
            <span className="text-[13px] font-medium text-secondary-foreground">the first step joined as a line</span>
            <span className="block h-2 w-full rounded-t-[2px] border-x border-t border-foreground/70" />
          </div>
        ) : null}
        {cards.map((m) => <MonthCard key={m} month={m} state={states[m] ?? null} point={pointOf(m)} current={m === data.month.slice(0, 10)} future={!readMonths.includes(m)} mode={mode} />)}
        {chip ? <div className="order-2 md:order-none md:row-start-3 md:[grid-column:var(--span)]" style={span(1, Math.max(2, readMonths.length + 1))}>{chip}</div> : null}
        {next && bracket ? (
          <p className="order-4 m-0 font-mono text-[13px] text-muted-foreground md:order-none md:row-start-3 md:text-center md:[grid-column:var(--span)]" style={span(from + 1, to + 2)}>
            <span className="md:hidden">the first step joined as a line: {longMonth(next.prevMonth)} to {longMonth(next.month)}, </span>
            {nextPairNote(next)}
          </p>
        ) : null}
      </div>
      <SubjectWeekStrip pane={pane} mode={mode} />
    </BlockFrame>
  )
}

/**
 * WEEK BY WEEK, READ AT THE SAME AGE, ON SUBJECTS (WP3.13, §2.3 S6): the
 * selected subject's weeks in a thin strip under the months, on the strip's
 * own week axis and never on the month axis, drawn as Your market draws its
 * rows (`WeekLineStrip`). Nothing at deploy 3, nor while the line is kept and
 * not shown (`pane.weekStrip` is null). A provisional subject (decision C) gets
 * its points and no verdict; a subject that does not clear 10 videos in both
 * weeks of a pair prints one line, "Too few videos a week to read."
 */
export function SubjectWeekStrip({ pane, mode }: { pane: SubjectPane; mode: RenderMode }) {
  const strip = pane.weekStrip ?? null
  if (!strip) return null
  const line = strip.line
  const words = line.rows.length > 0 ? null : (line.reads?.length ?? 0) === 0 ? WEEK_LINE_EMPTY : WEEK_STRIP_TOO_FEW
  return (
    <InnerBlock title="Read at the same age" mode={mode}>
      {words
        ? mode === 'email'
          ? <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.ink2 }}>{words}</div>
          : <p className="m-0 text-[15px] leading-[1.6] text-secondary-foreground">{words}</p>
        : <WeekLineStrip block={line} axis={strip.axis} mode={mode} surface="inner" />}
    </InnerBlock>
  )
}
