import type { ReactNode } from 'react'
import { BAR_FILL, type BarWho } from '@/components/colour-roles'
import { MovementBadge } from '@/components/delta-badge'
import type { Good } from '@/components/charts/stat'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'

/**
 * A SHARE BAR WITH A COMPARISON TICK (depth v2, T2).
 *
 * The boards' `.sbar` (a subject's share, 10px), `.rtrack` (a rail row, 8px),
 * `.mtrack` and `.tr` (6px) and Content's `.mbar` (14px, with its figure
 * printed past the fill): a fill on the track, drawn against 100%, and
 * optionally a 2px ink tick standing proud of the track at the value it is
 * compared with (last month, on the v2 pages; decision 1). The fill is the
 * colour of whose videos it counts (`BAR_FILL`), or the ink for a neutral
 * count (platforms).
 *
 * The bar prints no number of its own; `TickBarRow` lays out the boards' row
 * (a name, the bar, its figure) with the figure marked, and a verdict beside
 * the name through `MovementBadge` where one is owed. `TickKey` is the key the
 * boards draw under a set of rows, so the tick never rests on colour alone.
 */

const HEIGHT = {
  sm: 'h-1.5 rounded-full',
  md: 'h-2 rounded-full',
  lg: 'h-2.5 rounded-full',
  xl: 'h-3.5 rounded-[4px]',
} as const

const FILL: Record<BarWho | 'ink', string> = { ...BAR_FILL, ink: 'bg-foreground' }

const clamp = (v: number): number => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0))

/** The narrowest a bar with a figure is drawn: Content's What works on a 390
 *  phone, about 170px of track. */
const FIGURE_BAR_MIN_PX = 160

/** How far past the fill, as a share of the track, a tick must stand for the
 *  figure to fit between them on the narrowest bar: the figure's width (mono
 *  11.5px, about 7px a character) and 6px either side. Nearer than that, the
 *  figure starts past the tick (Phase 4 fix round: "0.5×" printed over the
 *  1× marker, which stands 12.5 points past a 0.5× fill, inside the old fixed
 *  12). */
export const figureClearPct = (figure: string): number => Math.max(12, ((figure.length * 7 + 12) / FIGURE_BAR_MIN_PX) * 100)

export interface TickBarProps {
  /** The fill, 0 to 100 of the track. */
  pct: number
  /** The comparison tick, 0 to 100; null draws none. */
  tick?: number | null
  tone?: BarWho | 'ink'
  /** 6px, 8px, 10px or 14px. Default `md`. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** A figure printed just past the fill's end (Content's "3.1×"). */
  figure?: string
  /** What the bar shows, for a screen reader ("34% this month, against 29%
   *  last month"). */
  label: string
  className?: string
}

export function TickBar({ pct, tick = null, tone = 'market', size = 'md', figure, label, className }: TickBarProps) {
  const fill = clamp(pct)
  // The figure starts 6px past the fill; where the tick stands too close past
  // the fill for the figure to fit between them (`figureClearPct`), it starts
  // past the tick instead, so the two never overprint.
  const figureAt = tick != null && figure && clamp(tick) > fill && clamp(tick) - fill < figureClearPct(figure) ? clamp(tick) : fill
  return (
    <div role="img" aria-label={label} className={cn('relative min-w-0 bg-track', HEIGHT[size], className)}>
      {fill > 0 ? <div className={cn('absolute inset-y-0 left-0', HEIGHT[size], FILL[tone])} style={{ width: `${fill}%` }} /> : null}
      {tick != null ? (
        <div
          data-tick=""
          className={cn('absolute w-0.5 rounded-[1px] bg-foreground', size === 'xl' ? '-inset-y-1' : '-inset-y-[3px]')}
          style={{ left: `calc(${clamp(tick)}% - 1px)` }}
        />
      ) : null}
      {figure ? (
        <span
          data-copy="figure"
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[11.5px] leading-none font-semibold tabular-nums text-foreground"
          style={{ left: `calc(${figureAt}% + 6px)` }}
        >
          {figure}
        </span>
      ) : null}
    </div>
  )
}

export interface TickBarRowProps extends Omit<TickBarProps, 'figure' | 'className'> {
  /** The row's name ("Complained"). Numbers in it are the caller's to mark. */
  name: ReactNode
  /** The figure at the row's end ("32%", "14"). */
  value: string
  /** A verdict beside the name ("▲ 5 pts", "no clear change"), through the
   *  one badge. */
  verdict?: Verdict | null
  /** The verdict's favourability axis (`MovementBadge`'s `good`). */
  good?: Good
  /** The figure column's width: the rail's 44px, or 30px for a count. */
  valueWidth?: 'wide' | 'narrow'
  className?: string
}

/** The boards' `.rrow`: name, bar, figure. */
export function TickBarRow({ name, value, verdict = null, good = 'neutral', valueWidth = 'wide', className, ...bar }: TickBarRowProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-2.5 text-[13.5px] leading-[1.35]',
        valueWidth === 'wide' ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_44px]' : 'grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_30px]',
        className,
      )}
    >
      <span className={cn('min-w-0', verdict?.state === 'moved' ? 'font-semibold' : null)}>
        {name}
        {verdict ? <span data-copy="verdict" className="ml-1.5 whitespace-nowrap text-[11.5px]"><MovementBadge verdict={verdict} unit="pts" good={good} bandTip /></span> : null}
      </span>
      <TickBar {...bar} />
      <span data-copy="figure" className="text-right font-mono text-[12.5px] tabular-nums text-foreground">{value}</span>
    </div>
  )
}

/** The key under a set of tick bars: the fill's swatch and the tick's mark,
 *  each with its words ("this month", "last month"). */
export function TickKey({ fill, tick, tone = 'market' }: { fill: string; tick: string; tone?: BarWho | 'ink' }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 text-[12px] text-muted-foreground">
      <span className="inline-flex items-center gap-[5px]"><i aria-hidden className={cn('inline-block h-2 w-2.5 rounded-[2px]', FILL[tone])} />{fill}</span>
      <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-3 w-0.5 rounded-[1px] bg-foreground" />{tick}</span>
    </div>
  )
}
