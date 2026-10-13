import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * TWO TO SIX BARS WITH THEIR NUMBERS ON THEM (depth v2, T2).
 *
 * The boards draw it three times: a mover card's three weekly counts
 * (E2-Market, "9 · 14 · 23"; decision 1 turns "Rising 3 weeks" into exactly
 * these counts with no word), the opened conversation's month by month
 * (E2-Market-Open) and a category's month by month (E4-Products-Liners). The
 * bars are the market yellow; the one the card is about (the newest, by
 * default) is the orange. Its value prints over every bar, its label under,
 * and optionally a level under that ("9 of 455").
 *
 * A bar still filling (a month so far) is drawn as a tint of its colour with
 * an ink outline, so its state never rests on colour alone (MASTER: a week
 * still being read is outlined). A zero draws a 2px stub.
 *
 * Every value is a figure node, every `sub` a LEVEL node: a sub that does not
 * read "of N" fails the copy contract, which is the point.
 */

export interface MiniBar {
  /** Under the bar: the week ("28 Sep") or the month ("October"). */
  label: string
  value: number
  /** What prints over the bar; the value as a whole number by default
   *  ("9.7%" for a share). */
  display?: string
  /** A level under the label, which must read "of N" ("9 of 455",
   *  "so far · 31 of 318"). */
  sub?: string
  /** Still filling: a tint with an ink outline. */
  filling?: boolean
}

export interface MiniBarsProps {
  bars: readonly MiniBar[]
  /** The bar the card is about, in the orange: the newest by default; an
   *  index; or null for none. */
  highlight?: number | 'last' | null
  /** The boards' three drawings, each sized for its column: `sm` 200 by 84 (a
   *  mover card), `md` 300 by 140 (a third of a panel), `lg` 560 by 160 (half
   *  a panel). Default `sm`. */
  size?: 'sm' | 'md' | 'lg'
  /** What the chart is, for a screen reader. The readings are appended. */
  label: string
  className?: string
}

/** One decimal of a user unit is finer than a pixel at any width drawn. */
const r1 = (v: number): number => Math.round(v * 10) / 10

const GEOMETRY = {
  sm: { W: 200, H: 84, top: 14, base: 66, bar: 0.54, value: 11, axis: 10, sub: 10 },
  md: { W: 300, H: 140, top: 22, base: 104, bar: 0.64, value: 12, axis: 11, sub: 10 },
  lg: { W: 560, H: 160, top: 24, base: 124, bar: 0.57, value: 12.5, axis: 11.5, sub: 10.5 },
} as const

export function MiniBars({ bars, highlight = 'last', size = 'sm', label, className }: MiniBarsProps) {
  const n = bars.length
  if (n === 0) return null
  const g = GEOMETRY[size]
  const hasSub = bars.some((b) => b.sub)
  // Room under the labels for the sub line, where any bar has one.
  const H = hasSub && size === 'sm' ? g.H + 14 : g.H
  const picked = highlight === 'last' ? n - 1 : highlight
  const max = Math.max(1, ...bars.map((b) => b.value))
  const slot = g.W / n
  const bw = slot * g.bar
  const room = g.base - g.top
  const aria = `${label}: ${bars.map((b) => `${b.label} ${b.display ?? fmtInt(b.value)}${b.sub ? ` (${b.sub})` : ''}`).join(', ')}.`

  return (
    <svg viewBox={`0 0 ${g.W} ${H}`} role="img" aria-label={aria} className={cn('block h-auto w-full overflow-visible', className)}>
      <line x1={0} y1={g.base} x2={g.W} y2={g.base} className="stroke-border" strokeWidth={1} />
      {bars.map((b, i) => {
        const on = i === picked
        const x = r1(i * slot + (slot - bw) / 2)
        const cx = r1(i * slot + slot / 2)
        const bh = b.value <= 0 ? 2 : r1(Math.max(2, (b.value / max) * room))
        const y = r1(g.base - bh)
        const w = r1(bw)
        const fill = on ? 'fill-orange' : 'fill-brand'
        return (
          <g key={i} data-bar={on ? 'picked' : undefined}>
            {b.value <= 0 ? (
              <rect x={x} y={g.base - 2} width={w} height={2} className="fill-border" />
            ) : b.filling ? (
              <rect x={x} y={y} width={w} height={bh} rx={2} fillOpacity={0.22} strokeWidth={1.5} className={cn(fill, 'stroke-foreground')} data-filling="" />
            ) : (
              <rect x={x} y={y} width={w} height={bh} rx={2} className={fill} />
            )}
            <text
              data-copy="figure"
              x={cx}
              y={y - 6}
              textAnchor="middle"
              fontSize={g.value}
              fontWeight={on ? 600 : 400}
              className="fill-foreground font-mono tabular-nums"
            >
              {b.display ?? fmtInt(b.value)}
            </text>
            <text
              x={cx}
              y={g.base + 15}
              textAnchor="middle"
              fontSize={g.axis}
              fontWeight={on ? 600 : 400}
              className={cn('font-mono', on ? 'fill-foreground' : 'fill-muted-foreground')}
            >
              {b.label}
            </text>
            {b.sub ? (
              <text
                data-copy="level"
                x={cx}
                y={g.base + 15 + g.sub + 4}
                textAnchor="middle"
                fontSize={g.sub}
                className="fill-muted-foreground font-mono tabular-nums"
              >
                {b.sub}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
