import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { shortDate, monthName } from '@/lib/format'
import {
  axisLabels, calendarGeometry, chartId, collapseRules, columnTitle, lastReading, legendEveryMonth,
  legendMonths, legendStates, lineSegments, monthColumns, spanOf, spreadLabels, STATE_LABEL,
  undrawnNote, valueScale,
  type CalendarBand, type CalendarPoint, type CalendarRule, type CalendarSeries,
} from '@/lib/charts/calendar'

// The calendar-spaced line (Phase 1 WP10, design item 6, decisions L, M, U).
// Server SVG, no library, no client JS — the house rule since the redesign.
//
// WHAT IS NEW HERE, AND WHY EACH PIECE HAD TO BE.
//
// 1. A DATED AXIS. `LineChart` and `Sparkline` space by INDEX, so a month with
//    no reading has no slot and the line closes the hole up. On production that
//    is 16 of Ottobock's 36 months and 17 of the Össur category's 72: a
//    two-year gap and a one-month gap draw identically and every point after
//    them is misdated. The axis is generated from the calendar
//    (`lib/reading/series.ts` monthAxis) and every month owns its x whether or
//    not anything was said in it. The arithmetic is `lib/charts/calendar.ts`.
//
// 2. A GAP IS A GAP. `(number | null)` per month, drawn as segmented polylines.
//    `components/profile-stats.tsx:270` is the only code in the repo that
//    already did this and it was private to one tile; this is that behaviour,
//    shared, and `Sparkline` now has it too.
//
// 3. THREE NON-READINGS IN THE GUTTER, NOT ON THE LINE. A month below the
//    audience floor, a month where the object itself is below the numerator
//    floor, and a month still filling are all things a reader must be able to
//    SEE without being able to read a comparison off them. The two below-floor
//    states are marks under the baseline; the filling month keeps its point and
//    gains a part-height bar. Drawing a below-floor month as an ordinary point
//    is the lie the whole reading layer exists to stop — on Sealand it would be
//    66 of 68 industry-other months.
//
// 4. DATED RULES AND AN AFFECTED BAND. A tracking change, a clustering change
//    and a rename each draw a vertical rule at their own month, and the months
//    the change MOVED are shaded behind the lines (decision U: `affects_months`
//    is stored at save time and is rarely the month of the save). A
//    reconstructed row — one nobody logged, inferred afterwards — draws in a
//    second, fainter token, because "we worked out that this probably happened"
//    is not the same claim as "this was recorded".
//
// 5. READ-BACK SHADING. Months that had already closed when the tenant was set
//    up are hatched: what they read TODAY, not what we would have reported at
//    the time.
//
// THE SPEC THIS AMENDS. `mock-sealand/spec/design-system.md` §3.9 says: "No
// gridlines beyond baseline + midline, no axis rules, no tick marks, no filled
// areas. Points are solid, ringed in the surface colour, never hollow. Event
// markers are the only ringed-hollow circle." A dated rule IS an axis rule, an
// affected band IS a filled area, and the hollow circle is spent on event
// markers. The amendment (decision U, recorded in
// design-system/verbatim/MASTER.md §Chart rules) moves the CHANGE off the data
// line entirely — into the gutter below the baseline — which keeps "points are
// solid" true of every data point and confines the new tokens to axis
// furniture.
//
// EVERY NUMBER THIS CHART PRINTS IS MARKED `data-copy="figure"`, so a block
// that sets the chart inside a prose node still keeps rule (a) of the copy
// contract: the model's sentence is checked on its own words and code's figures
// are code's (lib/test/copy-contract.ts).

export type { CalendarBand, CalendarPoint, CalendarRule, CalendarSeries }

/**
 * THE TYPE DOES NOT SHRINK WITH THE CONTAINER (Block D wave 3, SH1).
 *
 * The drawing is a viewBox scaled uniformly to whatever box it is given, and
 * every `fontSize` below is in VIEWBOX UNITS — so a 880-unit chart in a 352px
 * column renders its 10-unit axis label at 4.0px, its dated-rule label at
 * 3.6px and the end label's own figure at 4.4px. Measured across Overview's
 * attention column (x0.40), Competitive's standings pane (x0.639 at 1440,
 * x0.40 at 1024) and Subjects at 1024, where "Freitag 43.7% of 142" set at
 * 5.8px with its "of 142" at 5.0px. A product whose rule is that a level
 * without its "of N" is a score was printing the "of N" illegibly.
 *
 * NOTHING HERE CAN KNOW THE SCALE, so the correction is made in CSS, where the
 * container's width is a fact: `app/globals.css` (.vb-cal) sets `--cal-k` from
 * a container query against the intrinsic width this component publishes as
 * `--cal-w`, and every font-size below is `calc(<n>px * var(--cal-k))`. At the
 * chart's own size k is 1 and the drawing is byte-identical to what it was;
 * in a half-width column k is about 2 and the 10-unit label comes out at
 * roughly 10px on the glass either way.
 *
 * THE END LABEL IS CAPPED LOWER (`--cal-ke`, k clamped to 1.6). It is drawn
 * OUTSIDE the plot, in the `padR` gutter, and unlike the axis furniture it has
 * a string in it whose length is the caller's: growing it by 2.2 would run a
 * theme's name past the viewBox. A caller whose column is too narrow for the
 * gutter turns the labels off and prints the last reading underneath
 * (`endLabels`), which is the mechanism that already exists for exactly this.
 */
/** Font size in viewBox units, corrected for the container's downscale. */
const ts = (px: number) => ({ fontSize: `calc(${px}px * var(--cal-k, 1))` })
/** The same, for the end label in the right gutter — clamped (see above). */
const tsEnd = (px: number) => ({ fontSize: `calc(${px}px * var(--cal-ke, 1))` })

/** How many dated rules can carry a printed date before the labels collide.
 *  Past it the rules are still drawn and still carry their `<title>`; only the
 *  printed tick label is dropped, because four overlapping 9px dates are less
 *  readable than none. */
const MAX_PRINTED_RULE_LABELS = 4

const RULE_STROKE: Record<CalendarRule['kind'], { stroke: string; dash: string; opacity: number }> = {
  tracking_change: { stroke: 'var(--border)', dash: '2 3', opacity: 1 },
  clustering_changed: { stroke: 'var(--border)', dash: '2 3', opacity: 1 },
  renamed: { stroke: 'var(--border)', dash: '2 3', opacity: 1 },
  // The second token: inferred, not recorded.
  reconstructed: { stroke: 'var(--muted-foreground)', dash: '1 4', opacity: 0.5 },
}

/**
 * THE TOP OF THE SCALE, AT A ROUND NUMBER (Block D wave 3, SH13).
 *
 * The chart labelled `lo` and `mid` only, and `mid` is the midpoint of a scale
 * whose top carries 12% headroom — so on Ask's finding 1 (5.1 / 6.8 / 9.4) the
 * axis read 0% and 5% while the line ended at 9.4%, and on finding 2
 * (13.8 / 14 / 14) it read 0% and 8% with the line at 14%. BOTH printed marks
 * lay under the whole series: on the surface whose promise is a figure you can
 * check, there was nothing above the data to check it against.
 *
 * The old docblock's two objections to a third label are both answered rather
 * than overruled. It is NOT `scale.hi` — `max × 1.12` is an arithmetic
 * accident and would print 49.3% on a 44% series — but the largest ROUND value
 * that still fits inside the headroom and is not below the data: 10 for a 9.4
 * series, 15 for a 14, 45 for a 44. And it is not "printed at a height where
 * no rule is drawn to anchor it": it draws its own rule, like the baseline and
 * the midline. Where no round value fits, it returns null and the chart keeps
 * the two labels it had.
 */
export function niceTop(max: number, hi: number): number | null {
  if (!Number.isFinite(max) || !Number.isFinite(hi) || hi <= max || max <= 0) return null
  const magnitude = 10 ** Math.floor(Math.log10(hi))
  for (const step of [magnitude, magnitude / 2, magnitude / 4, magnitude / 5, magnitude / 10]) {
    if (step <= 0) continue
    const top = Math.ceil((max / step) - 1e-9) * step
    // Rounded back through the step, so 32.500000000000004 prints as 32.5.
    const value = Math.round(top * 1e6) / 1e6
    if (value >= max && value <= hi) return value
  }
  return null
}

export function CalendarLine({
  axis, series, rules = [], bands = [], format = (v) => `${v}`,
  width = 880, height = 210, padL = 56, padR = 180,
  zeroBase = true, legend = true, maxLabels = 12, endLabels = true,
  annotate = null, caption, label, id, className,
}: {
  /** Every month to draw, ascending — `monthAxis(from, to)`. */
  axis: readonly string[]
  series: readonly CalendarSeries[]
  rules?: readonly CalendarRule[]
  /** Stretches shaded behind the lines in the hatch — "read back at setup". */
  bands?: readonly CalendarBand[]
  format?: (v: number) => string
  width?: number
  height?: number
  padL?: number
  padR?: number
  zeroBase?: boolean
  /** Drawn whenever there are two or more series, or any gutter token to
   *  explain. Identity is never colour-alone (MASTER.md). */
  legend?: boolean
  maxLabels?: number
  /**
   * A bracket between two series at the newest month, with a word for the
   * distance — the artboard's "gap 13 pts" (Block D wave 2, D1).
   *
   * THE CALLER DECIDES WHETHER THERE IS ONE, AND NOTHING HERE COMPUTES IT. A
   * difference between two lines is a banded reading with its own floors
   * (`lib/reading/gap.ts`), and a chart that subtracted two plotted values
   * would draw a number the product refuses to print one tile above. So this
   * takes a LABEL and two series names, and a caller with nothing the band
   * would let it say passes nothing — which on today's corpus is the normal
   * case, because your own audience is under the 100-video floor.
   */
  annotate?: { from: string; to: string; label: string } | null
  /**
   * Whether each line prints its name and its last value in the right gutter.
   *
   * TRUE EVERYWHERE IT ALWAYS WAS — this is additive (Block D wave 2, the
   * E-quarterly fix pass) and no existing caller changes. It exists because
   * the end label is drawn at `width - padR + 10` in the viewBox and is NOT
   * clipped by anything: on the quarterly deck's narrow columns it painted
   * "Durability · The category 22%" past the slide's own edge (13px past, at
   * HEAD) and "The category 41,2" off the end of its card. The label is lost
   * either way on the one output this artefact has, a PDF. A caller with a
   * column too narrow for the gutter turns it off, gives the plot the space
   * back, and prints the last reading under the chart at its own type size —
   * where the legend already names the lines.
   */
  endLabels?: boolean
  /** The line under the chart, in the caller's words — a `MonthLabel.text`
   *  from lib/reading/series.ts, never a sentence invented here. */
  caption?: ReactNode
  /** What the chart is, for a screen reader. */
  label?: string
  /** Unique per chart on a page; derived from the series labels when omitted. */
  id?: string
  className?: string
}) {
  const months = axis.map((m) => m)
  if (!months.length || !series.length) return null

  const g = calendarGeometry({ axis: months, width, height, padL, padR })
  // Five units lower than `calendarGeometry`'s own gutterY, which puts a 3.5r
  // ring's top edge ON the baseline (SH14). The month labels sit at
  // `g.labelY`, 23 units under the baseline, so there is room.
  const gutterY = g.gutterY + 5
  const scale = valueScale(series, { zeroBase, top: g.top, baseline: g.baseline })
  // The same values `valueScale` measures its top from.
  const plotted: number[] = []
  for (const sr of series) for (const pt of sr.points) {
    if (pt.value != null) plotted.push(pt.value)
    if (pt.atLastMonth != null) plotted.push(pt.atLastMonth)
  }
  const topLabel = plotted.length ? niceTop(Math.max(...plotted), scale.hi) : null
  // A top that lands on the midline, or too close to the plot's own ceiling to
  // carry a label, is not a third mark — it is the second one drawn twice.
  const topY = topLabel == null ? null : scale.y(topLabel)
  const drawTop = topLabel != null && topY != null && topY <= scale.y(scale.mid) - 12 && topY >= g.top + 2
  const drawn = collapseRules(months, rules)
  const uid = id ?? chartId([...series.map((s) => s.label), months[0], months[months.length - 1]])
  const hatch = `${uid}-back`
  const labelled = new Set(axisLabels(months, maxLabels))
  const printRuleLabels = drawn.length <= MAX_PRINTED_RULE_LABELS
  const states = legendStates(series)
  const columns = monthColumns(months, series)
  // End labels are placed by the CHART, not by each series: two lines ending a
  // couple of points apart would otherwise print two 11px labels on one line.
  const labelYs = spreadLabels(
    series.map((s) => {
      const end = lastReading(s.points)
      return end?.value != null ? scale.y(end.value) + 4 : null
    }),
    { min: g.top + 4, max: g.baseline },
  )
  const showLegend = legend && (series.length >= 2 || states.length > 0)
  // The gutter tokens are drawn in the ENTITY's colour, so the legend swatch is
  // too — while there is one entity to be. With several lines on the axis no
  // single colour is the right one and the swatch goes neutral, which is also
  // the only reading that is true of all of them.
  const tokenColor = series.length === 1 ? series[0].color : 'var(--muted-foreground)'

  // A month nobody has a reading for gets a fainter label, the way the mock
  // draws April: the axis still says the month happened.
  const read = new Set<string>()
  for (const s of series) for (const p of s.points) if (p.value != null) read.add(p.month)

  // A month owns half a slot either side of its x, and a band is clamped to the
  // plot: shading that ran past the last month would sit under the end labels,
  // which belong to the line and not to the change.
  const bandRect = (span: { from: number; to: number }, key: string, fill: string, title: string) => {
    const half = g.slot / 2
    const x1 = Math.max(g.padL, g.xAt(span.from) - half)
    const x2 = Math.min(g.padR, g.xAt(span.to) + half)
    return (
      <rect key={key} x={x1} y={g.top} width={Math.max(2, x2 - x1)} height={g.baseline - g.top} fill={fill}>
        <title>{title}</title>
      </rect>
    )
  }

  return (
    <div className={cn('vb-cal flex min-w-0 flex-col gap-2', className)} style={{ '--cal-w': String(width) } as React.CSSProperties}>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => {
            // A KEY THAT PROMISES A LINE THE CHART DOES NOT DRAW IS THE WRONG
            // WAY ROUND. At 100% floor coverage the ink appears only as gutter
            // rings, so the key says so rather than leaving a reader to decide
            // whether a flat row of hollow marks on the 0% rule is the series.
            const undrawn = undrawnNote(s)
            return (
              <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-2 rounded-full', undrawn && 'bg-tile')} style={undrawn ? { boxShadow: `inset 0 0 0 1.5px ${s.color}` } : { background: s.color }} aria-hidden />
                {s.labelSlot ? <span data-copy="subject" data-slot={s.labelSlot}>{s.legendLabel ?? s.label}</span> : (s.legendLabel ?? s.label)}
                {s.excludes ? <span className="text-[10.5px]">— {s.excludes}</span> : null}
                {undrawn ? <span className="text-[10.5px]">— {undrawn}</span> : null}
              </span>
            )
          })}
          {states.map((state) => {
            const months = legendMonths(series, state)
            // Named while the list is short; "every month" where the token
            // marks the whole axis, which is the case a reader most needs told
            // and the one a cap at two months left silent.
            const every = months.length === 0 && legendEveryMonth(series, state, axis)
            return (
              <span key={state} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <LegendToken state={state} color={tokenColor} />
                {STATE_LABEL[state]}
                {months.length > 0 ? ` (${months.map(shortMonth).join(', ')})` : every ? ' (every month)' : ''}
              </span>
            )
          })}
        </div>
      )}

      {/* SCALED UNIFORMLY, not stretched. `preserveAspectRatio="none"` is
          house precedent (LineChart carries it), and it cannot be used here:
          the two gutter tokens differ by SHAPE alone — below_floor is a circle,
          below_numerator a 6×6 square — and any container that is not exactly
          `width` px scales x and y by different factors, which turns the circle
          into an ellipse and the square into a rectangle until they converge.
          Measured at a 1085px container (x × 1.23). So the drawing keeps its
          ratio and the box takes its height from the viewBox, exactly as the
          mock's own 880×210 artboard does. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ overflow: 'visible', display: 'block', height: 'auto' }}
        role="img"
        aria-label={label ?? `${series.map((s) => s.label).join(' vs ')}, month by month`}
      >
        <defs>
          {/* A hairline hatch, deliberately faint: the back-read is a caveat
              about months, not a block of shading competing with the lines. */}
          <pattern id={hatch} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={7} stroke="var(--border)" strokeWidth={0.75} opacity={0.55} />
          </pattern>
        </defs>

        {/* The months a change moved, behind everything. */}
        {drawn.map((r, i) => {
          const span = r.affects?.length ? spanOf(months, r.affects) : null
          return span ? bandRect(span, `aff${i}`, 'var(--inner)', `${r.label} — affects ${monthName(months[span.from])} to ${monthName(months[span.to])}`) : null
        })}
        {/* Months that had already closed when we started. */}
        {bands.map((b, i) => {
          const span = spanOf(months, b.months)
          return span ? bandRect(span, `band${i}`, `url(#${hatch})`, b.label) : null
        })}

        <line x1={g.padL} y1={g.baseline} x2={g.padR} y2={g.baseline} stroke="var(--border)" strokeWidth={1} />
        {/* THE GUTTER IS ITS OWN TRACK (Block D wave 3, SH14). A below-floor
            month is a mark 6 units under the baseline, which at print scale is
            ON the baseline: on the marketing sheet Sealand's six months read as
            six hollow rings sitting at 0%, three inches under a table row
            saying "31% · 26 of 84". The docblock argued the legend key
            prevents that read; on paper there is no hover and the key is 9.5px
            at the other end of the sheet, and it does not. So the marks move
            down to a dashed rule of their own, which says "off the scale"
            before any word does — the one thing a reader must take from them
            is that nothing here is a reading. */}
        {states.some((st) => st === 'below_floor' || st === 'below_numerator') ? (
          <line x1={g.padL} y1={gutterY} x2={g.padR} y2={gutterY} stroke="var(--border)" strokeWidth={1} strokeDasharray="1 3" />
        ) : null}
        <line x1={g.padL} y1={scale.y(scale.mid)} x2={g.padR} y2={scale.y(scale.mid)} stroke="var(--muted)" strokeWidth={1} />
        {/* TWO Y LABELS AND, WHERE ONE FITS, A THIRD (Block D wave 3, SH13 —
            it was two, and the reason is kept below because the amendment
            answers it rather than overruling it). The objection to a third was
            that this scale's top is `max × 1.12`, the headroom an end label
            sits in, so the label would read 49.3% on a 44% series — an
            arithmetic accident, printed at a height where no rule is drawn to
            anchor it. Both halves are met by `niceTop`: the value is the
            largest ROUND number inside that headroom, and it draws its own
            rule. What made the amendment necessary is that BOTH printed marks
            could lie under the whole series — Ask's finding 1 read 0% and 5%
            with the line ending at 9.4%. The mock's Subjects board prints the
            top of its scale ("50") and was right to. */}
        <text data-copy="figure" x={g.padL - 10} y={g.baseline + 3} textAnchor="end" style={ts(10)} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">{format(scale.lo)}</text>
        <text data-copy="figure" x={g.padL - 10} y={scale.y(scale.mid) + 3} textAnchor="end" style={ts(10)} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">{format(scale.mid)}</text>
        {/* AND THE TOP, WHERE A ROUND ONE FITS (SH13, see `niceTop`). With its
            own rule, because a number printed at a height nothing is drawn at
            is the objection the two-label rule was written against. */}
        {drawTop && topY != null && topLabel != null ? (
          <>
            <line x1={g.padL} y1={topY} x2={g.padR} y2={topY} stroke="var(--muted)" strokeWidth={1} />
            <text data-copy="figure" x={g.padL - 10} y={topY + 3} textAnchor="end" style={ts(10)} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">{format(topLabel)}</text>
          </>
        ) : null}

        {/* Dated rules. */}
        {drawn.map((r, i) => {
          const x = g.x(r.month)
          if (x == null) return null
          const pen = RULE_STROKE[r.kind]
          return (
            <g key={`rule${i}`}>
              <line x1={x} y1={g.top - 4} x2={x} y2={g.baseline} stroke={pen.stroke} strokeWidth={1} strokeDasharray={pen.dash} opacity={pen.opacity}>
                <title>{r.label}</title>
              </line>
              {printRuleLabels && (
                <text x={x - 3} y={g.top} textAnchor="end" style={ts(9)} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">
                  {r.at ? shortDate(r.at) : monthName(r.month)}
                </text>
              )}
            </g>
          )
        })}

        {series.map((s, i) => (
          <SeriesMarks
            key={s.label}
            series={s}
            geometry={g}
            y={scale.y}
            format={format}
            padR={g.padR}
            gutterY={gutterY}
            labelY={labelYs[i]}
            endLabel={endLabels}
          />
        ))}

        {/* The bracket between two lines at the newest month, where the caller
            has a banded difference it is allowed to name. Dashed and grey —
            axis furniture, not a series (the same token a dated rule uses). */}
        {(() => {
          if (!annotate) return null
          const iFrom = series.findIndex((s) => s.label === annotate.from)
          const iTo = series.findIndex((s) => s.label === annotate.to)
          if (iFrom < 0 || iTo < 0) return null
          const a = lastReading(series[iFrom].points)
          const b = lastReading(series[iTo].points)
          if (a?.value == null || b?.value == null || a.month !== b.month) return null
          const x = g.x(a.month)
          if (x == null) return null
          const y1 = scale.y(Math.max(a.value, b.value))
          const y2 = scale.y(Math.min(a.value, b.value))
          if (y2 - y1 < 14) return null
          return (
            <g>
              <line x1={x} y1={y1 + 4} x2={x} y2={y2 - 4} stroke="var(--cat)" strokeWidth={1} strokeDasharray="3 3" />
              <text data-copy="figure" x={x - 10} y={(y1 + y2) / 2 + 3} textAnchor="end" style={ts(10)} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">
                {annotate.label}
              </text>
            </g>
          )
        })()}

        {/* Month labels, thinned so a 68-month axis is still readable. */}
        {months.map((m, i) =>
          labelled.has(i) ? (
            <text
              key={m}
              x={g.xAt(i)}
              y={g.labelY}
              textAnchor="middle"
              style={ts(10)}
              fontFamily="var(--font-plex-mono), monospace"
              fill={read.has(m) ? 'var(--muted-foreground)' : 'var(--border)'}
            >
              {shortMonth(m)}
            </text>
          ) : null,
        )}

        {/* The hover layer: one column per month, answering with every series at
            once. LAST in the document, so nothing a line or a label draws can
            cover it and no series can answer for another. */}
        {columns.map((c, i) => (
          <rect
            key={`col${c.month}`}
            x={g.xAt(i) - g.slot / 2}
            y={g.top}
            width={Math.max(4, g.slot)}
            height={g.baseline - g.top + 12}
            fill="transparent"
          >
            {/* A HOVER CARRYING A MODEL-WRITTEN SERIES NAME IS MARKED. An SVG
                `<title>` holds text and nothing else, so the label cannot be
                wrapped inside it the way it is in the legend and at the line's
                end — the node is marked as a whole, and only where one of its
                series says its name is the model's (`labelKind`). Every other
                chart's hover stays under rule (c) like any other markup. */}
            <title
              data-copy={c.entries.find((e) => e.series.labelSlot) ? 'subject' : undefined}
              data-slot={c.entries.find((e) => e.series.labelSlot)?.series.labelSlot}
            >{columnTitle(c, format)}</title>
          </rect>
        ))}
      </svg>

      {caption ? <p className="m-0 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">{caption}</p> : null}
    </div>
  )
}

/** One series: its segments, its points, its gutter marks, its filling bar and
 *  its end label. Split out so the chart body reads as a list of layers. */
function SeriesMarks({
  series, geometry: g, y, format, padR, gutterY, labelY = null, endLabel = true,
}: {
  series: CalendarSeries
  geometry: ReturnType<typeof calendarGeometry>
  y: (v: number) => number
  format: (v: number) => string
  padR: number
  /** The gutter's own track, below the baseline (SH14) — the chart's, not
   *  `calendarGeometry`'s, so every series marks the same line. */
  gutterY: number
  /** Where the end label sits, de-collided against the other series by the
   *  chart (`spreadLabels`). Falls back to the point's own y. */
  labelY?: number | null
  /** False where the caller's column is too narrow for the right gutter and
   *  the last reading is printed under the chart instead. */
  endLabel?: boolean
}) {
  const points = series.points
  const runs = lineSegments(points)
  const at = (p: CalendarPoint): number | null => g.x(p.month)
  const lastPlotted = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : null
  const undrawn = undrawnNote(series)
  const end = lastPlotted != null ? points[lastPlotted] : null
  const endX = end ? at(end) : null

  return (
    <g>
      {runs.map((run, i) => {
        const coords = run
          .map((k) => ({ x: at(points[k]), v: points[k].value }))
          .filter((c): c is { x: number; v: number } => c.x != null && c.v != null)
        if (coords.length < 2) return null
        return (
          <polyline
            key={`seg${i}`}
            points={coords.map((c) => `${c.x.toFixed(1)},${y(c.v).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={series.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}

      {/* The marks. Nothing here is a hover target: the chart's one hover layer
          is a column per month, drawn above every series (`monthColumns`). */}
      {points.map((p, i) => {
        const x = at(p)
        if (x == null) return null
        if (p.value == null) {
          // Nothing on the line. A below-floor month is a mark in the gutter; a
          // hollow month is the gap itself, and its column still answers.
          return (
            <g key={`m${i}`}>
                {p.state === 'below_floor' && (
                <circle cx={x} cy={gutterY} r={3.5} fill="var(--tile)" stroke={series.color} strokeWidth={1.5} />
              )}
              {p.state === 'below_numerator' && (
                <rect x={x - 3} y={gutterY - 3} width={6} height={6} fill="var(--tile)" stroke={series.color} strokeWidth={1.5} />
              )}
            </g>
          )
        }
        const isEnd = i === lastPlotted
        return (
          <g key={`m${i}`}>
            {p.state === 'filling' && (
              <FillingBar x={x} value={p.value} atLastMonth={p.atLastMonth ?? null} y={y} baseline={g.baseline} slot={g.slot} format={format} padR={padR} />
            )}
            <circle cx={x} cy={y(p.value)} r={isEnd ? 3.4 : 2.2} fill={series.color} stroke="var(--tile)" strokeWidth={isEnd ? 1.5 : 1} />
          </g>
        )
      })}

      {/* A SERIES WITH NO LINE SAYS SO ON THE PLOT (Block D wave 3, SH14).
          Its only explanation was the legend key — 9.5px, at the other end of
          a printed sheet, and absent entirely where a caller turned the legend
          off — so a row of hollow rings under the zero rule read as six months
          at zero. The words are `undrawnNote`'s, the same ones the key uses. */}
      {endLabel && !end && undrawn ? (
        <text x={padR + 10} y={gutterY + 3} style={tsEnd(9.5)} fontFamily="var(--font-plex-mono), monospace" fill="var(--muted-foreground)">
          {series.label}
        </text>
      ) : null}
      {endLabel && end && endX != null && end.value != null && (
        <text x={padR + 10} y={labelY ?? y(end.value) + 4} style={tsEnd(11)} fontWeight={600} fontFamily="var(--font-plex-sans), sans-serif" fill="var(--foreground)">
          {series.labelSlot ? <tspan data-copy="subject" data-slot={series.labelSlot}>{series.label}</tspan> : series.label}{' '}
          <tspan data-copy="figure" fontFamily="var(--font-plex-mono), monospace" fontWeight={500}>{format(end.value)}</tspan>
          {series.endNote ? <tspan data-copy="figure" fontFamily="var(--font-plex-mono), monospace" fontWeight={400} style={tsEnd(9.5)} fill="var(--muted-foreground)"> {series.endNote}</tspan> : null}
        </text>
      )}
    </g>
  )
}

/**
 * The still-filling month: a part-height bar under its point, and — where the
 * caller actually computed it — a tick at what the same month read at this
 * point last month.
 *
 * The bar is the affordance item 6 asks for and §3.9 forbids ("no filled
 * areas"); it is part of the amendment. It is the ONE filled shape on the
 * chart and it means one thing: this number is not finished.
 *
 * AND IT IS AXIS FURNITURE, NOT A SERIES (fix pass). It was painted in the
 * entity's own colour, so on a chart where a rival held the only visible point
 * the newest month rendered as a solid peach column running the full plot
 * height — the loudest coloured shape on the page, encoding "incomplete" and
 * reading as the rival's ink. Two series filling in the same month drew two
 * overlapping colours for one fact. It takes the neutral token every other
 * piece of furniture on this chart takes (the dated rules, the midline), so
 * the coloured inks on the plot belong to the data alone.
 */
const FILLING_INK = 'var(--muted-foreground)'

function FillingBar({
  x, value, atLastMonth, y, baseline, slot, format, padR,
}: {
  x: number
  value: number
  atLastMonth: number | null
  y: (v: number) => number
  baseline: number
  slot: number
  format: (v: number) => string
  padR: number
}) {
  const w = Math.max(6, Math.min(18, slot * 0.36))
  const top = y(value)
  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={Math.max(0, baseline - top)} fill={FILLING_INK} opacity={0.1}>
        <title>Still filling — this month is still taking comments</title>
      </rect>
      {atLastMonth != null && (
        <g>
          <line x1={x - w} y1={y(atLastMonth)} x2={x + w} y2={y(atLastMonth)} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 2">
            <title>{`At this point last month: ${format(atLastMonth)}`}</title>
          </line>
          {/* The filling month is the LAST one, so the label usually has no
              room to its right and goes to the left of the bar instead — and it
              sits BELOW the tick, because the tick is by definition close to
              this month's own point and a label on its line reads over it. */}
          <text
            x={x + w + 6 < padR ? x + w + 6 : x - w - 6}
            y={y(atLastMonth) + 13}
            textAnchor={x + w + 6 < padR ? 'start' : 'end'}
            style={ts(9)}
            fontFamily="var(--font-plex-mono), monospace"
            fill="var(--muted-foreground)"
          >
            at this point last month
          </text>
        </g>
      )}
    </g>
  )
}

/** The legend swatch for a gutter token — the same shape AND the same colour
 *  the chart draws, so a reader matches them by eye rather than by caption. The
 *  mock rings the below-floor token in the entity's own green
 *  (`box-shadow: inset 0 0 0 1.5px #0E8A5F`), and the chart does; a legend
 *  ringed in grey beside it is a different mark.
 *
 *  The filling swatch is the one place the legend cannot be literal: the chart's
 *  bar is `FILLING_INK` at `opacity .1` over 150px of plot, and .1 over an 8px
 *  swatch is nothing at all. It is the same ink at the smallest opacity that
 *  survives the size. It does NOT take the entity colour, because the bar it
 *  keys does not either — the still-filling month is furniture. */
function LegendToken({ state, color }: { state: 'below_floor' | 'below_numerator' | 'filling' | 'read' | 'hollow'; color: string }) {
  if (state === 'below_floor') {
    return <span className="size-2 rounded-full bg-tile" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }} aria-hidden />
  }
  if (state === 'below_numerator') {
    return <span className="size-2 bg-tile" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }} aria-hidden />
  }
  if (state === 'filling') {
    return <span className="h-2 w-2.5 rounded-[1px]" style={{ background: FILLING_INK, opacity: 0.35 }} aria-hidden />
  }
  return <span className="h-2 w-2.5 rounded-[1px]" style={{ background: color, opacity: 0.3 }} aria-hidden />
}

/** "Apr" — the axis is already dated by the run of months, so the year is
 *  carried by the chart's own context line and not repeated twelve times. */
function shortMonth(month: string): string {
  return monthName(month).split(' ')[0]
}
