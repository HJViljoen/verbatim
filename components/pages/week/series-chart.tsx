import { fmtInt, shortDate } from '@/lib/format'
import { updateBand, type UpdateSeries } from '@/lib/reading/updates'

// The thirteen-point chart under §1 (the mock's `week.unusual.chart` and
// `.chart.legend`), drawn in Block D wave 2.
//
// THIRTEEN UPDATES, NOT THIRTEEN WEEKS, AND THE AXIS SAYS SO. The artboard's
// x-axis is thirteen calendar weeks with a count band ("a typical week: 9–15,
// typical 12"). D6 refuses that twice over: a period is dated by the comment
// and months do not divide into weeks (a thread spanning two weeks belongs to
// both), and this page may print nothing computed over a week alone. What IS
// real at that cadence is our own DELIVERY — what each update brought in, at
// the dates it covered — so that is what is drawn, `series.basis` names it on
// the chart itself, and every point is one delivery's own days.
//
// COUNTED ON `run_id`, WHICH DOES NOT MOVE. `analyzed_run_id` names the run
// whose insights are a video's CURRENT analysis and is rewritten every time a
// newer update re-reads a video: on Össur's thirteen it reads 508, 205, 65, 796
// and then nine zeroes. A chart of that column would tell a paying client we
// read nothing for nine weeks. `lib/reading/updates.ts` carries the measurement.
//
// A ZERO IS DRAWN, IS LEFT OUT OF THE BAND, AND IS NOT ON THE LINE. An update
// that found nothing is a fact about that delivery, so it is drawn and stays
// visible; "what an update of this workspace usually brings in" is not a
// question about the updates that brought in nothing, so `updateBand` excludes
// them and the legend says how many it counted.
//
// AND THE LINE BREAKS AT ONE RATHER THAN DIVING THROUGH IT (Block D wave 2,
// design review F5). The polyline ran over every point including the ones that
// found nothing, so on Össur it dived to the floor and climbed back three
// times and on Sealand seven — a gather gap rendered as the conversation
// collapsing and recovering. Gathering is a thing that FILLS UP over time
// (Heinrich, 2026-09-18): an update that found nothing is a week we did not
// look, or did not look wide enough, and joining it to its neighbours with a
// stroke asserts a reading nobody took. So the line is drawn in segments over
// the updates that found something.
//
// AND THE QUIET UPDATE'S MARK LEAVES THE LINE (review W4). It was a
// ringed-hollow circle at `y(0)` — the one non-solid token MASTER §3.9
// allocates, already spent on the event marker, and already re-spent by
// decision U on `CalendarLine`'s `below_floor` gutter ring. Two unrelated
// facts on one mark across two charts a reader meets in one session. Worse,
// it was drawn exactly ON the baseline while the legend said "drawn off the
// line" — 7 of 13 points on the thin and absent arms. Decision U's resolution
// applies here unchanged: THE CHANGE LEAVES THE DATA LINE. Every point that
// found something stays a solid dot ringed in `--tile`; an update that found
// nothing is a HOLLOW SQUARE in the gutter row 6px under the baseline —
// `CalendarLine`'s `below_numerator` token, whose meaning ("this column's own
// k is under the numerator floor") a k of zero is the strict case of. The
// legend's swatch is that same square, and the sentence beside it is now
// true.
//
// THE BAND IS A COUNT BAND IN VIDEOS. The other band in this block — a flag's
// `bandPts` — is in percentage points, and two unlabelled bands on one block is
// how 4.9 points gets read as five videos. Every band label here carries its
// unit.
//
// NO DIRECTION WORD AND NO TREND LINE. A chart is a direction claim too
// (AGENTS.md, D3): this one draws what was found, point by point, with the
// typical range behind it. It fits nothing, extends nothing and says nothing
// about where the line is going.

/** The plot's box, in the artboard's own units. */
const W = 620
const H = 168
const LEFT = 40
// The plot stops short of the box so the end label has room: it sets the
// newest count in mono 11 at `RIGHT + 8`, and at 576 a six-character value ran
// past the 620 viewBox and clipped (design review, nits).
const RIGHT = 560
const TOP = 20
const FLOOR = 132
// The gutter row, at decision U's own offset: axis furniture, under the
// baseline, where a mark cannot be read as a value on the scale.
const GUTTER = FLOOR + 6
const QUIET = 6

export function UpdateSeriesChart({ series }: { series: UpdateSeries }) {
  const points = series.points
  if (points.length < 2) return null

  const { counted, quiet } = updateBand(points)
  const values = points.map((p) => p.videos)
  const high = Math.max(...values, series.band?.high ?? 0, 1)
  const y = (v: number) => FLOOR - (v / high) * (FLOOR - TOP)
  const x = (i: number) => LEFT + (i / (points.length - 1)) * (RIGHT - LEFT)
  const newest = points[points.length - 1]
  // SEGMENTS, NOT ONE PATH. A run of consecutive updates that each found
  // something is one stroke; a quiet update ends the run. A run of one has no
  // stroke to draw — its dot stands alone, which is the truth about it.
  const segments: string[] = []
  let run: string[] = []
  points.forEach((p, i) => {
    if (p.videos > 0) {
      run.push(`${x(i)},${y(p.videos)}`)
      return
    }
    if (run.length > 1) segments.push(run.join(' '))
    run = []
  })
  if (run.length > 1) segments.push(run.join(' '))

  const label = (i: number) => shortDate(points[i].window.to)
  const mid = Math.floor((points.length - 1) / 2)

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-foreground">What each update found</span>
        <span className="flex-none font-mono text-[11px] text-muted-foreground">
          {fmtInt(points.length)} updates to {shortDate(newest.window.to)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={`What each of the last ${points.length} updates found, in videos, oldest first.`}
      >
        {/* THE TYPICAL RANGE, BEHIND THE LINE. Drawn only where the band was
            drawn — below the minimum points `updateBand` needs, there is no
            band and the chart shows the line alone rather than a shaded guess. */}
        {series.band ? (
          <rect
            x={LEFT}
            y={y(series.band.high)}
            width={RIGHT - LEFT}
            height={Math.max(1, y(series.band.low) - y(series.band.high))}
            fill="var(--inner)"
          />
        ) : null}
        {series.median != null ? (
          <line x1={LEFT} y1={y(series.median)} x2={RIGHT} y2={y(series.median)} stroke="var(--neutral-seg)" strokeWidth={1} strokeDasharray="3 3" />
        ) : null}
        <line x1={LEFT} y1={FLOOR} x2={RIGHT} y2={FLOOR} stroke="var(--border)" strokeWidth={1} />

        {/* The axis's own numbers: the floor, the typical middle, the top. */}
        <text x={LEFT - 6} y={FLOOR + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">0</text>
        {series.median != null ? (
          <text x={LEFT - 6} y={y(series.median) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
            {fmtInt(Math.round(series.median))}
          </text>
        ) : null}
        <text x={LEFT - 6} y={y(high) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{fmtInt(high)}</text>

        {segments.map((seg, i) => (
          <polyline key={i} points={seg} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {points.map((p, i) => {
          const last = i === points.length - 1
          // AN UPDATE THAT FOUND NOTHING IS NOT A POINT ON THE SCALE. It is a
          // hollow square in the gutter — a different mark in a different
          // row, not the same dot at a low value and not the ringed-hollow
          // circle the system reserves.
          if (p.videos === 0) {
            return (
              <rect
                key={p.runId}
                x={x(i) - QUIET / 2}
                y={GUTTER - QUIET / 2}
                width={QUIET}
                height={QUIET}
                fill="var(--tile)"
                stroke="var(--chart-1)"
                strokeWidth={1.2}
              >
                <title>{`found nothing · the ${p.days} days to ${shortDate(p.window.to)}`}</title>
              </rect>
            )
          }
          return (
            <circle
              key={p.runId}
              cx={x(i)}
              cy={y(p.videos)}
              r={last ? 3.4 : 2.2}
              fill="var(--chart-1)"
              stroke="var(--tile)"
              strokeWidth={last ? 1.5 : 1}
            >
              <title>{`${fmtInt(p.videos)} videos · the ${p.days} days to ${shortDate(p.window.to)}`}</title>
            </circle>
          )
        })}
        {/* THE NEWEST POINT, NAMED — it is the one the whole page is about.
            Where the newest update found nothing its mark is in the gutter, so
            its label goes there too: a "0" floating on the baseline beside an
            empty plot is a number with no mark under it. */}
        <text x={RIGHT + 8} y={newest.videos === 0 ? GUTTER + 4 : y(newest.videos) - 2} className="fill-foreground font-mono text-[11px] font-semibold">
          {fmtInt(newest.videos)}
        </text>
        <text x={LEFT} y={FLOOR + 20} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{label(0)}</text>
        {points.length > 4 ? (
          <text x={x(mid)} y={FLOOR + 20} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{label(mid)}</text>
        ) : null}
        <text x={RIGHT} y={FLOOR + 20} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{label(points.length - 1)}</text>
      </svg>
      {/* THE LEGEND, AND EVERY SWATCH CARRIES ITS UNIT. Identity is never
          colour-alone (MASTER.md), and a band with no unit beside a block whose
          other band is in percentage points is the one confusion this chart can
          cause. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Key swatch={<span className="h-0.5 w-3.5 rounded-full" style={{ background: 'var(--chart-1)' }} />}>
          videos each update found
        </Key>
        {series.band ? (
          <Key swatch={<span className="h-2 w-3.5 rounded-[2px]" style={{ background: 'var(--inner)' }} />}>
            what the {fmtInt(counted)} {counted === 1 ? 'update' : 'updates'} behind it that found anything ran:{' '}
            <span data-copy="figure">{fmtInt(series.band.low)}–{fmtInt(series.band.high)} videos</span>
            {series.median != null ? <>, typical <span data-copy="figure">{fmtInt(Math.round(series.median))}</span></> : null}
          </Key>
        ) : (
          <Key swatch={<span className="h-2 w-3.5 rounded-[2px] bg-transparent" />}>
            too few updates behind it to say what is typical
          </Key>
        )}
        {quiet > 0 ? (
          // THE SWATCH IS THE MARK THE CHART DRAWS — now the gutter's hollow
          // square, not a ring. It was the same filled dot as every other
          // point, so it mapped to nothing a reader could find; then it was a
          // ring, which mapped to a mark the system had already spent.
          <Key swatch={<span className="size-2 border" style={{ borderColor: 'var(--chart-1)', background: 'var(--tile)' }} />}>
            {fmtInt(quiet)} of them found nothing at all, drawn off the line and left out of the range
          </Key>
        ) : null}
      </div>
    </figure>
  )
}

/**
 * One legend entry: a swatch and a sentence.
 *
 * THE SENTENCE IS ONE FLEX ITEM (design review F7). This row is
 * `flex items-center gap-1.5`, and a flex container makes an item of EVERY
 * child — including each text run between the inline `<span data-copy=
 * "figure">`s — so the 6px gap landed on both sides of every figure and the
 * legend read "…ran:  1–559 videos , typical  462", with a space before the
 * comma. Visible at 1×. The gap belongs between the swatch and the words, and
 * the words are one child.
 */
function Key({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {swatch}
      <span className="min-w-0">{children}</span>
    </span>
  )
}
