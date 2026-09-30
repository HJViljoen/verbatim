'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { WeekDetail } from '@/lib/charts/week-bars'
import { cn } from '@/lib/utils'

// The weekly volume bars' interactive leaf (market-first WP2.9): a hit column
// per week over the server-drawn SVG, the week washed while it is hovered or
// focused, and its facts in a card beside it (the front page's preview) or in
// the panel beside the chart (This week's preview). Nothing here computes: the
// facts are `weekDetail`'s, handed in. Without JavaScript (a static render, a
// print) the chart is the same, with no card, and This week's panel shows its
// default week.

/** A week's facts: the card's grid (the front page's preview) or the side
 *  panel's figures (This week's preview). */
export function WeekDetailRows({ detail, variant }: { detail: WeekDetail; variant: 'card' | 'panel' }) {
  if (variant === 'panel') {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 border-b border-border pb-4 text-[15px] font-semibold text-foreground">{detail.title}</p>
        {detail.panel.length === 0 ? <p className="m-0 text-[14px] text-muted-foreground">none gathered</p> : null}
        {detail.panel.map((l, i) => (
          <div key={i} className="flex flex-col gap-1">
            <p className="m-0 flex items-baseline gap-2">
              <span data-copy="figure" className="font-mono text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">{l.value}</span>
              <span className="text-[14px] text-foreground">{l.words}</span>
            </p>
            <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground [text-wrap:pretty]">{l.sub}</p>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-foreground">{detail.title}</span>
      <div className="grid grid-cols-[44px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
        {detail.lines.map((l, i) => (
          <span key={i} className="contents">
            {l.gap && i > 0 ? <span className="col-span-2 h-1" /> : null}
            <span data-copy="figure" className={cn('text-right font-mono tabular-nums', l.strong ? 'font-semibold text-foreground' : 'text-secondary-foreground')}>{l.value}</span>
            <span className={cn('[text-wrap:balance]', l.strong ? 'text-foreground' : 'text-muted-foreground')}>{l.words}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * THE PLOT'S WIDTH WHERE THE STRIP SCROLLS: A WHOLE NUMBER OF WEEKS IN VIEW
 * (sw-2 item 3). The strip opens at its latest week, and at 390 px its box
 * held four and a half of `minWidth`'s slots, so the week at the box's start
 * edge was cut through its labels ("7,872" read ",872", "408" read "108").
 * Under `minWidth` the slots widen until a whole number of them fills the
 * box, so the start edge falls between two weeks. Null: the plot fits, and
 * takes the box's width as before.
 */
export function wholeWeeksWidth(box: number, minWidth: number, slots: number): number | null {
  if (!(box > 0) || box >= minWidth || slots < 1) return null
  const k = Math.max(1, Math.min(slots, Math.floor(box / (minWidth / slots))))
  return (slots * box) / k
}

export function WeekBarsHover({
  details,
  labels,
  plot,
  height,
  minWidth,
  labelWidth,
  surface,
  detail,
  initial,
  interactive = true,
  slots,
}: {
  details: WeekDetail[]
  /** The row names, drawn in the fixed column (it does not scroll). */
  labels: ReactNode
  /** The SVG, drawn over the wash and under the hit columns. */
  plot: ReactNode
  height: number
  minWidth: number
  labelWidth: 'wide' | 'narrow'
  /** The ground the chart sits on: the wash is the other one. */
  surface: 'inner' | 'tile'
  detail: 'card' | 'panel'
  /** The week the panel shows before any is hovered (This week). */
  initial: number | null
  interactive?: boolean
  /** The weeks the plot draws, where `details` does not hold one per week
   *  (the same-age strip passes none). */
  slots?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(1, details.length)
  const boxRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<number | null>(null)
  const weeks = slots ?? details.length
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => setFit(wholeWeeksWidth(box.clientWidth, minWidth, weeks))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [minWidth, weeks])
  const shown = hover ?? (detail === 'panel' ? initial : null)
  const pct = (f: number): string => `${(f * 100).toFixed(3)}%`
  const chart = (
    <div className={cn('grid min-w-0', labelWidth === 'wide' ? 'grid-cols-[88px_minmax(0,1fr)] xl:grid-cols-[116px_minmax(0,1fr)]' : 'grid-cols-[88px_minmax(0,1fr)]')}>
      <div className="relative" style={{ height }}>{labels}</div>
      {/* UNDER THE PLOT'S NARROWEST WIDTH THE STRIP SCROLLS SIDEWAYS, AND IT
          OPENS AT THE LATEST WEEK, with no script: the SCROLL BOX ITSELF is the
          reversed flex row, so it starts at its end (the latest week) and the
          earlier weeks overflow to the start side, where it scrolls back to
          them. (A reversed row INSIDE the scroll box overflowed to the left of
          the box's origin, where no browser scrolls: the deploy-3 review
          measured 338 px of the plot unreachable at 390.) */}
      <div ref={boxRef} className="flex min-w-0 flex-row-reverse overflow-x-auto overflow-y-hidden">
        {/* A CONTAINER, so the chart's smallest words step down a size where
            its slots are narrow (`@max-[640px]:` on the SVG text). */}
        <div className="relative flex-1 shrink-0 @container" style={{ minWidth: fit ?? minWidth, height }} onMouseLeave={interactive ? () => setHover(null) : undefined}>
          {shown != null ? (
            <span
              aria-hidden
              className={cn('pointer-events-none absolute rounded-[4px]', surface === 'inner' ? 'bg-tile' : 'bg-inner')}
              style={{ left: pct(shown / n), width: pct(1 / n), top: 0, bottom: 0 }}
            />
          ) : null}
          {plot}
          {interactive
            ? details.map((d, i) => (
              <button
                key={d.week}
                type="button"
                aria-label={[d.title, ...d.lines.map((l) => `${l.value} ${l.words}`.trim())].join(', ')}
                className="absolute top-0 bottom-0 cursor-default bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: pct(i / n), width: pct(1 / n) }}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            ))
            : null}
          {detail === 'card' && hover != null ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-[244px] rounded-[6px] bg-tile p-4 text-[13px] leading-[18px] text-secondary-foreground shadow-[0_0_0_1px_rgba(38,41,44,.05),0_2px_6px_rgba(38,41,44,.07),0_0_24px_rgba(38,41,44,.13)]"
              style={hover + 1 < n / 2 || hover < n - 3
                ? { left: `calc(${pct((hover + 1) / n)} + 8px)`, top: 36 }
                : { right: `calc(${pct((n - hover) / n)} + 8px)`, top: 36 }}
            >
              <WeekDetailRows detail={details[hover]} variant="card" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
  if (detail !== 'panel') return chart
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_304px] xl:items-start">
      {chart}
      {shown != null ? (
        <aside className="rounded-[6px] bg-inner p-6">
          <WeekDetailRows detail={details[shown]} variant="panel" />
        </aside>
      ) : null}
    </div>
  )
}
