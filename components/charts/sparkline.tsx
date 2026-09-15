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

export function Sparkline({
  values, color = 'var(--primary)', width = 90, height = 26, fill = false, endDot = true, strokeWidth = 1.5, animate = true, hover, className,
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
  className?: string
}) {
  if (values.length === 0) return null
  const drawn = values.filter((v): v is number => v != null)
  if (drawn.length === 0) return null
  const lo = Math.min(...drawn), hi = Math.max(...drawn)
  const rng = hi - lo || 1
  const n = values.length
  const xs = values.map((_, i) => (n === 1 ? width / 2 : 2 + (i * (width - 4)) / (n - 1)))
  const ys = values.map((v) => (v == null ? null : height - 3 - ((v - lo) / rng) * (height - 6)))
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
