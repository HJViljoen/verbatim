import type { ProseSlot } from '@/lib/prose/scrub'
import { cn } from '@/lib/utils'

/**
 * A TWO-POINT SLOPE CHART (depth v2, T2; E3-Voices "How the mix changed").
 *
 * Each row is one line from its earlier reading to its later one, on one
 * shared scale, its earlier value at the left and its later value and name
 * at the right (direct labels, no legend). One row can be picked out in the
 * orange (the second series' colour, MASTER §Colour roles); the rest are the
 * category grey. The slope is a picture of two levels and says nothing more:
 * no arrow, no word. Whether the two months may be compared at all is the
 * caller's `Verdict`, printed beside the chart, and a page with a refused pair
 * does not draw one. Voices (plan decision 2) draws its later column alone,
 * every `from` null, until the monthly group reading exists: the earlier
 * axis stands empty and the card says why.
 *
 * Labels that would collide are nudged apart, never dropped. Every value is
 * a figure; a row's name that a model wrote names its slot (`slot`), so the
 * copy contract can hold it to that slot's policy.
 */

export interface SlopeRow {
  /** Stable key (a group's key, a brand's). */
  key: string
  label: string
  /** The whole name, where `label` is shortened for the chart: what a screen
   *  reader hears. */
  fullLabel?: string
  /** The model slot that wrote `label`, where one did (`pass_e_persona`). */
  slot?: ProseSlot
  /** The two readings, in one unit. A null end is not drawn. */
  from: number | null
  to: number | null
}

export interface SlopePairProps {
  /** The two columns' names ("Sep", "Oct"). The later one is set in ink. */
  fromLabel: string
  toLabel: string
  rows: readonly SlopeRow[]
  /** The row drawn in the orange, by key. */
  highlight?: string | null
  /** How a reading prints. Whole percent by default. */
  format?: (v: number) => string
  /** What the chart is, for a screen reader. The readings are appended. */
  label: string
  className?: string
}

const W = 300
const LEFT = 40
const RIGHT = 150
const TOP = 34
const GAP = 13
const pctText = (v: number): string => `${Math.round(v)}%`
/** One decimal of a user unit is finer than a pixel at any width drawn. */
const r1 = (v: number): number => Math.round(v * 10) / 10

/** Nudge label positions apart to at least `gap`, keeping their order. */
function spread(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap
  }
  const out = [...ys]
  for (const o of order) out[o.i] = o.y
  return out
}

export function SlopePair({ fromLabel, toLabel, rows, highlight = null, format = pctText, label, className }: SlopePairProps) {
  const values = rows.flatMap((r) => [r.from, r.to]).filter((v): v is number => v != null)
  if (values.length === 0) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  // Room for every row's label at the minimum gap, and never less than the
  // board's 210.
  const plot = Math.max(156, (rows.length - 1) * GAP + 20)
  const H = TOP + plot + 20
  const y = (v: number) => r1(TOP + ((hi - v) / span) * plot)
  const lefts = spread(rows.map((r) => (r.from == null ? -1 : y(r.from) + 4)), GAP).map(r1)
  const rights = spread(rows.map((r) => (r.to == null ? -1 : y(r.to) + 4)), GAP).map(r1)
  // The picked row draws last, on top of the grey ones.
  const order = rows.map((r, i) => i).sort((a, b) => Number(rows[a].key === highlight) - Number(rows[b].key === highlight))
  const aria = `${label}, ${fromLabel} to ${toLabel}: ${rows.map((r) => `${r.fullLabel ?? r.label} ${r.from == null ? 'none' : format(r.from)} to ${r.to == null ? 'none' : format(r.to)}`).join(', ')}.`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className={cn('block h-auto w-full overflow-visible', className)}>
      <text x={LEFT} y={14} textAnchor="middle" fontSize={11} className="fill-muted-foreground font-mono">{fromLabel}</text>
      <text x={RIGHT} y={14} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-foreground font-mono">{toLabel}</text>
      <line x1={LEFT} y1={22} x2={LEFT} y2={H - 10} className="stroke-track" />
      <line x1={RIGHT} y1={22} x2={RIGHT} y2={H - 10} className="stroke-track" />
      {order.map((i) => {
        const r = rows[i]
        const on = r.key === highlight
        const stroke = on ? 'stroke-orange' : 'stroke-cat'
        const fill = on ? 'fill-orange' : 'fill-cat'
        return (
          <g key={r.key} data-row={on ? 'picked' : undefined}>
            {r.from != null && r.to != null ? (
              <line x1={LEFT} y1={y(r.from)} x2={RIGHT} y2={y(r.to)} strokeWidth={on ? 2.5 : 1.5} className={stroke} />
            ) : null}
            {r.from != null ? <circle cx={LEFT} cy={y(r.from)} r={on ? 4 : 3} className={fill} /> : null}
            {r.to != null ? <circle cx={RIGHT} cy={y(r.to)} r={on ? 4.5 : 3} className={fill} /> : null}
            {r.from != null ? (
              <text data-copy="figure" x={LEFT - 7} y={lefts[i]} textAnchor="end" fontSize={11} className="fill-secondary-foreground font-mono tabular-nums">
                {format(r.from)}
              </text>
            ) : null}
            {r.to != null ? (
              <text
                x={RIGHT + 8}
                y={rights[i]}
                fontSize={on ? 11.5 : 11}
                fontWeight={on ? 600 : 400}
                className={cn('font-mono', on ? 'fill-foreground' : 'fill-secondary-foreground')}
              >
                <tspan data-copy="figure" className="tabular-nums">{format(r.to)}</tspan>{' '}
                {r.slot ? <tspan data-copy="subject" data-slot={r.slot}>{r.label}</tspan> : <tspan>{r.label}</tspan>}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
