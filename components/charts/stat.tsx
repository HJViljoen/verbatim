import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { fmtDelta, round1 } from '@/lib/format'

// Counted figures, the way the redesign shows them: mono, tabular, big; a unit
// word beside; a signed delta in the favourability colour. Numbers here are
// counts of real voices/videos/themes or shares — never model scores.

export function StatValue({
  children, unit, size = 'md', className,
}: { children: ReactNode; unit?: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums leading-none tracking-[-0.03em]',
          size === 'sm' && 'text-[18px]',
          size === 'md' && 'text-[24px]',
          size === 'lg' && 'text-[30px]',
        )}
      >
        {children}
      </span>
      {unit && <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>}
    </span>
  )
}

export type Good = 'up' | 'down' | 'neutral'

/**
 * Is this delta favourable? null = flat, or direction-neutral.
 *
 * NO EPSILON (Phase 1 WP10). This used to call anything under 0.5 of a count
 * or 0.05 of a point "flat" — a threshold decided inside a presentation
 * component, applied to every `<Delta>` in the app, with no n behind it and no
 * relation to any band. It retires. Flat here means exactly zero, and the
 * caller passes the value it is about to PRINT, so what is coloured is what is
 * shown: a 0.3-count delta that renders as "±0" is grey, and never green.
 *
 * This is a colour, not a claim. Whether a proportion MOVED is a banded
 * question and `MovementBadge` is where it is asked (components/delta-badge.tsx).
 */
export function favourability(delta: number, good: Good): boolean | null {
  if (delta === 0 || good === 'neutral') return null
  return good === 'up' ? delta > 0 : delta < 0
}

export function Delta({
  value, unit = '', decimals, good = 'neutral', suffix, className,
}: {
  value: number | null | undefined
  /** Printed after the number: "pt", "%", "" */
  unit?: string
  decimals?: 0 | 1
  good?: Good
  /** Context after the delta, e.g. "vs last update" */
  suffix?: string
  className?: string
}) {
  if (value == null || Number.isNaN(value)) return null
  const dec = decimals ?? (unit === 'pt' || unit === '%' ? 1 : 0)
  // Round FIRST, then colour: the printed value is the one the reader sees, so
  // it is the one the colour has to be about (the old 0.5 / 0.05 epsilon).
  const v = dec === 1 ? round1(value) : Math.round(value)
  const fav = favourability(v, good)
  return (
    <span
      className={cn(
        'font-mono text-[11px] tabular-nums',
        fav === null ? 'text-muted-foreground' : fav ? 'text-positive' : 'text-negative',
        className,
      )}
    >
      {fmtDelta(v, unit, dec)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}

/** The stat sentence (component-map §5): value · delta · base, e.g.
 *  "521  +118  since last update". The delta is the only coloured thing; the
 *  base ("since last update", "all-time") sits in grey after it. `aside` is an
 *  optional element on the same line (a sparkline). */
export function StatSentence({
  value, unit, delta, deltaUnit = '', good = 'neutral', base, aside, size = 'md', className,
}: {
  value: ReactNode
  unit?: ReactNode
  delta?: number | null
  deltaUnit?: string
  good?: Good
  /** What the delta is measured against, in words. Shown even without a delta. */
  base?: ReactNode
  aside?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="flex items-center gap-2.5">
        <StatValue unit={unit} size={size}>{value}</StatValue>
        {aside}
      </span>
      {(delta != null || base) && (
        <span className="flex items-baseline gap-1.5 text-[11.5px] text-muted-foreground">
          {delta != null && <Delta value={delta} unit={deltaUnit} good={good} />}
          {base && <span className="truncate">{base}</span>}
        </span>
      )}
    </div>
  )
}
