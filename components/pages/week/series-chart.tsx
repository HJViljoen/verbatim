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
// A ZERO IS DRAWN AND IS LEFT OUT OF THE BAND. An update that found nothing is
// a fact about that delivery, so the line goes to the floor and stays visible;
// "what an update of this workspace usually brings in" is not a question about
// the updates that brought in nothing, so `updateBand` excludes them and the
// legend says how many it counted.
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
const RIGHT = 576
const TOP = 20
const FLOOR = 132

export function UpdateSeriesChart({ series }: { series: UpdateSeries }) {
  const points = series.points
  if (points.length < 2) return null

  const { counted, quiet } = updateBand(points)
  const values = points.map((p) => p.videos)
  const high = Math.max(...values, series.band?.high ?? 0, 1)
  const y = (v: number) => FLOOR - (v / high) * (FLOOR - TOP)
  const x = (i: number) => LEFT + (i / (points.length - 1)) * (RIGHT - LEFT)
  const newest = points[points.length - 1]
  const path = points.map((p, i) => `${x(i)},${y(p.videos)}`).join(' ')

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

        <polyline points={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle
            key={p.runId}
            cx={x(i)}
            cy={y(p.videos)}
            r={i === points.length - 1 ? 3.4 : 2.2}
            fill="var(--chart-1)"
            stroke="var(--tile)"
            strokeWidth={i === points.length - 1 ? 1.5 : 1}
          >
            <title>{`${fmtInt(p.videos)} videos · the ${p.days} days to ${shortDate(p.window.to)}`}</title>
          </circle>
        ))}
        {/* THE NEWEST POINT, NAMED — it is the one the whole page is about. */}
        <text x={RIGHT + 8} y={y(newest.videos) - 2} className="fill-foreground font-mono text-[11px] font-semibold">
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
          <Key swatch={<span className="size-2 rounded-full" style={{ background: 'var(--chart-1)' }} />}>
            {fmtInt(quiet)} of them found nothing at all, drawn and left out of the range
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
