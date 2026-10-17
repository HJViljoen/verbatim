import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * WEEKLY COUNTS, THE NEWEST WEEK PICKED OUT (depth v2, T2; E2-Market's hero).
 *
 * One bar a week, the market yellow (MASTER §Colour roles: a bar counting the
 * market's videos), the newest in the orange (the colour of what is new this
 * week), its count over it. An optional comparison line runs dashed across
 * the weeks before the newest with its own label ("usual · 6"); what the line
 * IS, and whether a page may draw one, is the caller's: decision 1 keeps a
 * week's figure beside its month, and the comparison a page states is a
 * `Verdict` printed elsewhere, never this line.
 *
 * Counts only: no percentage, no arrow, no word. Server SVG (no chart
 * library), scaled to its column's width from the board's 480 by 132, every
 * count a `data-copy="figure"` text in the mono. A week with no reading
 * (null) keeps its slot and draws nothing (with `ghost`, a faint empty slot
 * the plot's height); a week of zero draws a 2px stub, so "none" and "not
 * read" never look alike. `variant="ink"` is the rail's
 * "Videos, week by week": ink bars and a count over every one.
 */

export interface SpikeWeek {
  /** The axis label: the week's Monday with its month ("5 Oct"). */
  label: string
  /** Videos that week; null keeps the slot and draws no bar. */
  count: number | null
}

export interface SpikeBarsProps {
  weeks: readonly SpikeWeek[]
  /** A dashed line across the weeks before the newest, labelled at its left
   *  ("usual · 6"). Null draws none. */
  compare?: { value: number; label: string } | null
  /** The newest bar in the orange. Default true (false on `ink`). */
  highlightLast?: boolean
  /** Which bars print their count: the newest only (default) or every one. */
  counts?: 'last' | 'all'
  /** `market` (yellow bars, the hero) or `ink` (the rail's weekly volume). */
  variant?: 'market' | 'ink'
  /** The boards' drawings: `lg` 480 by 132 for a half-width card (the
   *  hero), `md` 300 by 112 for a rail card; and F3's three (17 Oct): `wide`
   *  520 by 150 (a subject's week by week), `rail` 300 by 86 (a
   *  conversation's facts) and `xs` 136 by 58 (a conversation's card inside
   *  a subject). Each keeps its type readable at the width it is drawn for.
   *  Default `lg`. */
  size?: 'lg' | 'md' | 'wide' | 'rail' | 'xs'
  /** What the chart is, for a screen reader. The readings are appended. */
  label: string
  /** A week with no reading draws a faint empty slot, the plot's height, so
   *  a chart with few weeks keeps its axis and its rhythm (the parity pass,
   *  13 Oct). Off by default: the slot then draws nothing. */
  ghost?: boolean
  className?: string
}

/** One decimal of a user unit is finer than a pixel at any width drawn. */
const r1 = (v: number): number => Math.round(v * 10) / 10

const GEOMETRY: Record<NonNullable<SpikeBarsProps['size']>, { W: number; H: number; BASE: number; TOP: number; small: number; big: number; axis?: number }> = {
  lg: { W: 480, H: 132, BASE: 110, TOP: 14, small: 10.5, big: 12 },
  md: { W: 300, H: 112, BASE: 92, TOP: 16, small: 9.5, big: 9.5 },
  // F3: counts over every bar, the axis a size under them, as drawn.
  wide: { W: 520, H: 150, BASE: 134, TOP: 14, small: 12.5, big: 12.5, axis: 11.5 },
  rail: { W: 300, H: 86, BASE: 70, TOP: 14, small: 11, big: 11, axis: 10 },
  xs: { W: 136, H: 58, BASE: 42, TOP: 14, small: 11, big: 11, axis: 10 },
}

export function SpikeBars({ weeks, compare = null, highlightLast, counts = 'last', variant = 'market', size = 'lg', label, ghost = false, className }: SpikeBarsProps) {
  const n = weeks.length
  if (n === 0) return null
  const { W, H, BASE, TOP, small, big, axis = small } = GEOMETRY[size]
  const pick = highlightLast ?? variant === 'market'
  const max = Math.max(1, ...weeks.map((w) => w.count ?? 0), compare?.value ?? 0)
  const slot = W / n
  const bw = slot * 0.55
  const h = (v: number) => (v / max) * (BASE - TOP)
  const step = Math.max(1, Math.round(n / 3))
  const labelled = (i: number) => i === n - 1 || (i % step === 0 && i < n - 1 - step / 2)
  const aria = `${label}: ${weeks.map((w) => `${w.label} ${w.count == null ? 'not read' : fmtInt(w.count)}`).join(', ')}${compare ? `. ${compare.label} ${fmtInt(compare.value)}` : ''}.`
  const cy = compare ? r1(BASE - h(compare.value)) : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className={cn('block h-auto w-full overflow-visible', className)}>
      <line x1={0} y1={BASE} x2={W} y2={BASE} className="stroke-border" strokeWidth={1} />
      {compare && cy != null ? (
        <g data-compare="">
          <line x1={0} y1={cy} x2={pick ? r1((n - 1) * slot) : W} y2={cy} className="stroke-foreground" strokeWidth={1} strokeDasharray="3 4" />
          <text x={0} y={cy - 6} fontSize={small} className="fill-muted-foreground font-mono">
            {compare.label} · <tspan data-copy="figure">{fmtInt(compare.value)}</tspan>
          </text>
        </g>
      ) : null}
      {weeks.map((w, i) => {
        if (w.count == null) {
          return ghost ? <rect key={i} data-slot-empty="" x={r1(i * slot + (slot - bw) / 2)} y={TOP} width={r1(bw)} height={BASE - TOP - 1} rx={2} className="fill-inner" /> : null
        }
        const last = i === n - 1
        const x = r1(i * slot + (slot - bw) / 2)
        const fill = last && pick ? 'fill-orange' : variant === 'ink' ? 'fill-foreground' : 'fill-brand'
        if (w.count === 0) return <rect key={i} x={x} y={BASE - 2} width={r1(bw)} height={2} className="fill-border" />
        const bh = r1(Math.max(2, h(w.count)))
        return <rect key={i} x={x} y={r1(BASE - bh)} width={r1(bw)} height={bh} rx={2} className={fill} data-week={last ? 'newest' : undefined} />
      })}
      {weeks.map((w, i) => {
        const last = i === n - 1
        if (w.count == null || (counts === 'last' && !last)) return null
        const cx = r1(i * slot + slot / 2)
        const top = r1(BASE - (w.count === 0 ? 2 : Math.max(2, h(w.count))))
        return (
          <text
            key={i}
            data-copy="figure"
            x={cx}
            y={top - 6}
            textAnchor="middle"
            fontSize={last ? big : small}
            fontWeight={last ? 600 : 400}
            className={cn('font-mono tabular-nums', last ? 'fill-foreground' : 'fill-secondary-foreground')}
          >
            {fmtInt(w.count)}
          </text>
        )
      })}
      {weeks.map((w, i) => (labelled(i) ? (
        <text
          key={i}
          x={r1(i * slot + slot / 2)}
          y={H - 5}
          textAnchor="middle"
          fontSize={axis}
          fontWeight={i === n - 1 ? 600 : 400}
          className={cn('font-mono', i === n - 1 ? 'fill-foreground' : 'fill-muted-foreground')}
        >
          {w.label}
        </text>
      ) : null))}
    </svg>
  )
}
