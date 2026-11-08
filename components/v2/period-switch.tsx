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
 * The audit design's segmented control (7 Nov; Market-After.dc.html): a white
 * group on a 1px hairline, radius 10 and 4px of padding, 36px items at 14.5px
 * (44px to tap on a phone, as `SEG_ITEM`; the real-data pass, 8 Nov);
 * the selected segment is the pale yellow with ink and weight (MASTER §Colour
 * roles: a selected state) and carries `aria-current="page"`. The Settings
 * tabs draw the same control. The month option names its month
 * (`withMonthName`: "October", "November so far").
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

/** The options with the month's own name on the `month` option ("October",
 *  or "November so far"), as the boards label it; the others unchanged. */
export function withMonthName<V extends string>(options: readonly PeriodOption<V>[], label: string): PeriodOption<V>[] {
  return options.map((o) => (o.value === 'month' ? { ...o, label } : o))
}

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
      className="inline-flex max-w-full shrink-0 flex-wrap gap-1 rounded-[10px] border border-border bg-card p-1"
    >
      {options.map((o) => {
        const on = o.value === value
        if (o.disabled && !on) {
          return (
            <span
              key={o.value}
              aria-disabled="true"
              title={o.disabled}
              className="inline-flex h-9 cursor-default items-center whitespace-nowrap rounded-[7px] px-3.5 text-[14.5px] leading-[1.2] text-muted-foreground/70 max-sm:h-11"
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
              'inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-[7px] px-3.5 text-[14.5px] leading-[1.2] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground max-sm:h-11',
              on ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-inner',
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}
