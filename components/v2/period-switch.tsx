import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * THE PERIOD SWITCH (depth v2, T2; the boards' `.switch`).
 *
 * "This week · This month · Over time" at the right-hand end of the page bar
 * (`PageBar`'s children). Links, not buttons: the period is in the URL
 * (`?period=week|month|time`), so each option IS an address, which can be
 * shared, opened in a new tab and frozen into an export, as the horizon
 * control's pills are (components/shell/page-bar.tsx). Server-rendered, no
 * client JS.
 *
 * A white segmented control on a hairline ring; the selected segment is the
 * pale yellow with ink and weight (MASTER §Colour roles: a selected state) and
 * carries `aria-current="page"`.
 */

export type Period = 'week' | 'month' | 'time'

export interface PeriodOption<V extends string = Period> {
  value: V
  label: string
  /** Shown and not offered: why, for its tooltip and a screen reader. A
   *  disabled option is no link, so nothing promises a view that is not
   *  there (Voices' week and over time, the parity pass, 13 Oct). */
  disabled?: string
}

/** The boards' three, in their order. */
export const PERIODS: readonly PeriodOption<Period>[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'time', label: 'Over time' },
]

/** `?period=` as a `Period`; anything else is the page's default. */
export function parsePeriod(raw: string | string[] | null | undefined, fallback: Period = 'week'): Period {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === 'week' || v === 'month' || v === 'time' ? v : fallback
}

export interface PeriodSwitchProps<V extends string = Period> {
  value: V
  options: readonly PeriodOption<V>[]
  /** The address of each option: the page's own URL with `period` set, its
   *  other params kept. */
  hrefFor: (value: V) => string
  /** The control's accessible name. */
  label?: string
}

export function PeriodSwitch<V extends string = Period>({ value, options, hrefFor, label = 'Period' }: PeriodSwitchProps<V>) {
  return (
    <nav
      aria-label={label}
      data-print-hide
      className="inline-flex max-w-full shrink-0 flex-wrap gap-0.5 rounded-[9px] bg-card p-[3px] shadow-block ring-1 ring-foreground/6"
    >
      {options.map((o) => {
        const on = o.value === value
        if (o.disabled && !on) {
          return (
            <span
              key={o.value}
              aria-disabled="true"
              title={o.disabled}
              className="cursor-default whitespace-nowrap rounded-[7px] px-[13px] py-[7px] text-[13.5px] leading-[1.2] text-muted-foreground/70"
            >
              {o.label}<span className="sr-only"> ({o.disabled})</span>
            </span>
          )
        }
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-[7px] px-[13px] py-[7px] text-[13.5px] leading-[1.2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'bg-accent font-semibold text-accent-foreground' : 'text-secondary-foreground hover:bg-inner hover:text-foreground',
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}
