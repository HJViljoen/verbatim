'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { WeekDetail } from '@/lib/charts/week-bars'
import { cn } from '@/lib/utils'
import { useWeekTip, WEEK_TIP_CARD } from './week-tip'

// The weekly volume bars' interactive leaf (market-first WP2.9): a hit column
// per week over the server-drawn SVG, the week washed while it is hovered,
// focused or tapped, and its facts in a card beside it (the front page's
// preview) or in the panel beside the chart (This week's preview). It opens
// and closes as the Dashboard's "Week by week" does (`useWeekTip`: hover,
// keyboard focus, a tap on a phone, Escape). Nothing here computes: the facts
// are `weekDetail`'s, handed in. Without JavaScript (a static render, a
// print) the chart is the same, with no card, and This week's panel shows its
// default week.

/** A week's facts: the card's grid (the front page's preview) or the side
 *  panel's figures (This week's preview). */
export function WeekDetailRows({ detail, variant }: { detail: WeekDetail; variant: 'card' | 'panel' }) {
  if (variant === 'panel') {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 border-b border-border pb-4 text-[15px] font-semibold text-foreground">
          {detail.title}
          {detail.state ? <span className="text-[13px] font-normal text-muted-foreground">{detail.state}</span> : null}
        </p>
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
      <span className="flex flex-col">
        <span className="text-[13px] font-semibold text-foreground">{detail.title}</span>
        {detail.state ? <span className="text-[12px] text-muted-foreground">{detail.state}</span> : null}
      </span>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
        {detail.lines.map((l, i) => (
          <span key={i} className="contents">
            {l.gap && i > 0 ? <span className="col-span-2 h-1" /> : null}
            <span data-copy="figure" className={cn('min-w-11 text-right font-mono tabular-nums', l.strong ? 'font-semibold text-foreground' : 'text-secondary-foreground')}>{l.value}</span>
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

/**
 * WHETHER A CHANGE'S MARK IS IN THE STRIP'S VIEW (sw-3 item 3). Where the
 * strip scrolls, a mark in a week scrolled out of view is clipped with it,
 * but its day label, drawn beside it, reached into the next week: at 390 the
 * front page opened on "13 Sep" at the box's start edge with no mark. A mark
 * (and its label) shows only while the mark itself is in view. `x` is the
 * mark's place as a fraction of the plot; `plot` and `box` are their boxes on
 * screen (px).
 */
export function markInView(x: number, plot: { left: number; width: number }, box: { left: number; right: number }): boolean {
  const at = plot.left + x * plot.width
  return at >= box.left - 0.5 && at <= box.right + 0.5
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
  open = null,
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
  /** The week whose card is open before any is hovered, focused or tapped (a
   *  static render; the pages pass none). */
  open?: number | null
}) {
  const n = Math.max(1, details.length)
  const boxRef = useRef<HTMLDivElement>(null)
  const tipBox = useRef<HTMLDivElement>(null)
  const tip = useWeekTip(tipBox, open)
  const hover = tip.shown
  const plotRef = useRef<HTMLDivElement>(null)
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
  // The marks the plot tags with their place (`data-edge-x`), hidden while
  // the mark is scrolled out of the box, shown again when it scrolls back.
  useEffect(() => {
    const box = boxRef.current
    const inner = plotRef.current
    if (!box || !inner) return
    const marks = [...inner.querySelectorAll<SVGElement>('[data-edge-x]')]
    if (marks.length === 0) return
    const sync = () => {
      const b = box.getBoundingClientRect()
      const p = inner.getBoundingClientRect()
      for (const el of marks) {
        el.style.visibility = markInView(Number(el.dataset.edgeX), { left: p.left, width: p.width }, { left: b.left, right: b.right }) ? '' : 'hidden'
      }
    }
    sync()
    box.addEventListener('scroll', sync, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    ro?.observe(box)
    ro?.observe(inner)
    return () => {
      box.removeEventListener('scroll', sync)
      ro?.disconnect()
    }
  }, [fit])
  const shown = hover ?? (detail === 'panel' ? initial : null)
  const pct = (f: number): string => `${(f * 100).toFixed(3)}%`
  const chart = (
    <div ref={tipBox} className={cn('grid min-w-0', labelWidth === 'wide' ? 'grid-cols-[88px_minmax(0,1fr)] xl:grid-cols-[116px_minmax(0,1fr)]' : 'grid-cols-[88px_minmax(0,1fr)]')}>
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
        <div ref={plotRef} className="relative flex-1 shrink-0 @container" style={{ minWidth: fit ?? minWidth, height }}>
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
                aria-label={d.label}
                data-week={d.week}
                className="absolute top-0 bottom-0 cursor-default touch-manipulation bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: pct(i / n), width: pct(1 / n) }}
                {...tip.target(i)}
              />
            ))
            : null}
          {detail === 'card' && hover != null && details[hover] ? (
            <div
              role="tooltip"
              data-week={details[hover].week}
              className={cn(WEEK_TIP_CARD, 'w-[244px] p-4')}
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
      {shown != null && details[shown] ? (
        <aside className="rounded-[6px] bg-inner p-6">
          <WeekDetailRows detail={details[shown]} variant="panel" />
        </aside>
      ) : null}
    </div>
  )
}
