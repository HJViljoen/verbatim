import { SparkHover } from './spark-hover'
import { lineSegments } from '@/lib/charts/calendar'

// Server-rendered SVG sparkline — the smallest chart that works. The line
// traces in once on mount (CSS, reduced-motion aware). With `hover`, a thin
// client overlay answers "what was the value at this point?" (component-map §1).
//
// A GAP IS A GAP (Phase 1 WP10). `values` takes `null` for "no reading in this
// slot" and the line is drawn as one polyline per unbroken run, so a sparkline
// beside a monthly row does not draw a straight line through months nobody
// said anything in. The slots stay: a null keeps its x, which is the whole
// point — closing the gap up would misdate every point after it. Existing
// callers pass `number[]`, which is assignable and behaves exactly as before.
// The fill polygon is drawn only for a series with no gaps at all: a filled
// area under a broken line claims area under the gap.

// A SPARKLINE NORMALISES TO ITSELF, AND THAT IS A CLAIM (Block D wave 3,
// SH22). Each row's own min and max become the full height, so on Overview's
// subjects Durability's +3.2pts and Price's −3.1pts draw at the SAME
// amplitude and the rows cannot be compared by eye — which is the one thing a
// column of sparklines beside a column of names is for. The same component at
// `width=300 height=120` (`DeckSpark`) draws an 18% → 20% series as a
// full-pane 45° climb with no zero baseline and no axis rule, on the sales
// brief's only chart — a much louder claim than "Jun 18% → Sep 20%", in a
// document whose premise is that a change is not called until it clears a band.
//
// THREE ADDITIVE PROPS, AND EVERY EXISTING CALLER IS UNCHANGED. `domain` is a
// scale shared across rows, which is what makes a column of them comparable;
// `zeroBase` pulls the floor to zero, which is what stops a two-point rise
// filling a pane; `rule` draws the hairline that says where that floor is. The
// defaults are what the component always did, because turning them on for every
// sparkline in the product at once is a change to surfaces this package does
// not own — Overview's subjects column and the sales deck's `DeckSpark` are
// the two callers the finding names, and they are `main`'s and `sales`'.
export function Sparkline({
  values, color = 'var(--primary)', width = 90, height = 26, fill = false, endDot = true, strokeWidth = 1.5, animate = true, hover, domain, zeroBase = false, rule = false, className,
}: {
  values: (number | null)[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
  endDot?: boolean
  strokeWidth?: number
  /** One-time draw-in on mount (no-op under prefers-reduced-motion). */
  animate?: boolean
  /** Hover tooltips: one label per value (e.g. the update date); `unit` is printed after the value. */
  hover?: { labels: string[]; unit?: string }
  /** `[lo, hi]` for the vertical scale, shared by every row that passes the
   *  same pair — the only way a column of sparklines is comparable by eye.
   *  Values outside it are clamped to the box rather than drawn past it. */
  domain?: [number, number]
  /** Put the floor at zero (or at the series' own minimum, whichever is
   *  lower), so a 18% → 20% series reads as a two-point rise and not as a
   *  full-pane climb. Ignored when `domain` is given, which is more specific. */
  zeroBase?: boolean
  /** A hairline at the floor. A sparkline drawn big enough to read as a chart
   *  needs to say where its baseline is; at 90×26 beside a row it does not. */
  rule?: boolean
  className?: string
}) {
  if (values.length === 0) return null
  const drawn = values.filter((v): v is number => v != null)
  if (drawn.length === 0) return null
  const lo = domain ? domain[0] : zeroBase ? Math.min(0, ...drawn) : Math.min(...drawn)
  const hi = domain ? domain[1] : Math.max(...drawn)
  const rng = hi - lo || 1
  const n = values.length
  const xs = values.map((_, i) => (n === 1 ? width / 2 : 2 + (i * (width - 4)) / (n - 1)))
  const ys = values.map((v) => (v == null ? null : Math.min(height - 3, Math.max(3, height - 3 - ((v - lo) / rng) * (height - 6)))))
  const runs = lineSegments(values.map((v, i) => ({ month: `${i}`, value: v, state: 'read' as const })))
  const last = runs[runs.length - 1][runs[runs.length - 1].length - 1]
  const whole = runs.length === 1 && runs[0].length === n
  const pointsOf = (run: number[]) => run.map((i) => `${xs[i].toFixed(1)},${(ys[i] as number).toFixed(1)}`).join(' ')
  const pts = pointsOf(runs[0])
  const svg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      style={{ overflow: 'visible', flex: 'none' }}
      aria-hidden
    >
      {rule && <line x1={0} y1={height - 3} x2={width} y2={height - 3} stroke="var(--border)" strokeWidth={1} />}
      {fill && whole && n > 1 && (
        <polygon className={animate ? 'vi-anim-fade' : undefined} points={`${xs[0].toFixed(1)},${height - 1} ${pts} ${xs[n - 1].toFixed(1)},${height - 1}`} fill={color} opacity={0.12} />
      )}
      {runs.map((run, k) => (run.length === 1
        // A lone reading between two gaps: a polyline of one point draws
        // nothing at all, so it is a dot or it is invisible.
        ? <circle key={k} className={animate ? 'vi-anim-fade' : undefined} cx={xs[run[0]]} cy={ys[run[0]] as number} r={strokeWidth} fill={color} />
        : <polyline key={k} className={animate ? 'vi-anim-line' : undefined} pathLength={1} points={pointsOf(run)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {endDot && <circle className={animate ? 'vi-anim-fade' : undefined} cx={xs[last]} cy={ys[last] as number} r={2.6} fill={color} stroke="var(--tile)" strokeWidth={1.5} />}
    </svg>
  )
  if (!hover || n < 2) return svg
  return (
    <SparkHover xs={xs} ys={ys} values={values} labels={hover.labels} unit={hover.unit} width={width} height={height} color={color}>
      {svg}
    </SparkHover>
  )
}
