'use client'

import { WeekDetailRows } from '@/components/charts/week-bars-hover'
import { useWeekTip, WEEK_TIP_CARD } from '@/components/charts/week-tip'
import type { WeekDetail } from '@/lib/charts/week-bars'
import type { HomeWeeks } from '@/lib/pages/home'
import { cn } from '@/lib/utils'

// "Week by week"'s plot on the Dashboard, the client leaf (Heinrich, 5 Oct:
// "make it so the numbers show when I hover over the bar in the graph?
// Because currently there's no numbers, it's just like a shape"). The bars
// and the comments line are drawn as the artboard draws them (`index.tsx`
// keeps the block, its title and key); over each drawn week is a button, so
// hovering its bar or its comments point (they share the column), focusing
// it from the keyboard, or tapping it on a phone shows the week's numbers in
// the weekly bars' card (`useWeekTip`, `WEEK_TIP_CARD`, `WeekDetailRows`, as
// on Your market). The numbers are the column's own (`homeWeekDetail`),
// handed in: nothing here counts.
//
// PALETTE A: the market's yellow bars, the orange second series, the
// hairline and the ground's wash under the week shown.

/** Headroom over the tallest bar and the highest point, so neither touches the top. */
const PLOT_TOP = 0.88
const HAIR = 'border-[#E4E2DC]'
const MUTED = 'text-[#5F656B]'

export function HomeWeeksPlot({ weeks, details, label, open = null }: {
  weeks: HomeWeeks
  /** Each column's numbers (`homeWeekDetail`), null where nothing is drawn. */
  details: readonly (WeekDetail | null)[]
  /** The chart's name for a screen reader; null where nothing is drawn. */
  label: string | null
  /** The week whose numbers show before any is hovered, focused or tapped (a
   *  static render; the page passes none). */
  open?: number | null
}) {
  const tip = useWeekTip(open)
  const n = weeks.columns.length
  const at = (v: number, max: number) => (max > 0 ? (v / max) * PLOT_TOP * 100 : 0)
  // The comments line: one segment per run of consecutive weeks that have a figure.
  const runs: { x: number; y: number; settled: boolean }[][] = []
  weeks.columns.forEach((c, i) => {
    if (c.comments == null) return runs.push([])
    const point = { x: ((i + 0.5) / n) * 100, y: 100 - at(c.comments, weeks.maxComments), settled: c.settled }
    if (runs.length === 0) runs.push([])
    runs[runs.length - 1].push(point)
  })
  const segments = runs.filter((r) => r.length > 0)
  const shown = tip.shown != null ? details[tip.shown] ?? null : null
  const pct = (f: number): string => `${(f * 100).toFixed(3)}%`
  return (
    <div
      ref={tip.box}
      className="relative flex h-[190px]"
      {...(label ? { role: 'group', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {weeks.columns.map((c, i) => {
        const d = details[i] ?? null
        return (
          <div key={c.week} className="relative flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              // The baseline is a solid bottom border under all eight weeks, as
              // drawn, with the bars standing on it; the dashed gridline is its
              // own element, because `border-dashed` would style every side.
              className={`relative flex w-full grow items-end justify-center border-b ${HAIR}`}
            >
              {/* The week shown, washed in the ground, under its bar. */}
              {tip.shown === i && d ? <span aria-hidden className="absolute inset-0 rounded-t-[4px] bg-inner" /> : null}
              {i > 0 ? <span aria-hidden className={`absolute inset-y-0 left-0 border-l border-dashed ${HAIR}`} /> : null}
              {c.videos != null ? (
                // A week still filling: the same yellow, faint, with no words
                // (Heinrich, 1 Oct); solid once it has settled.
                <div className={`relative w-[44%] max-w-8 rounded-t-[3px] bg-brand ${c.settled ? '' : 'opacity-45'}`} data-week-state={c.settled ? 'settled' : 'filling'} data-week={c.week} style={{ height: `${at(c.videos, weeks.maxVideos)}%` }} />
              ) : null}
            </div>
            <div className={`whitespace-nowrap text-[12px] max-sm:text-[10px] ${MUTED}`}>{c.label}</div>
            {d ? (
              <button
                type="button"
                aria-label={d.label}
                data-week={c.week}
                className="absolute inset-0 z-[1] cursor-default touch-manipulation rounded-[4px] bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                {...tip.target(i)}
              />
            ) : null}
          </div>
        )
      })}
      {/* The comments line, over the plot area: the 190px less the labels'
          row (12px at normal leading, 15.6), its 8px gap and the 1px baseline.
          The second series, so the orange (its key above and in the numbers). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[24.6px]" aria-hidden>
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          {segments.map((seg, i) =>
            seg.length > 1 ? (
              <polyline
                key={i}
                points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="var(--orange)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
        </svg>
        {segments.flat().map((p, i) => (
          <span
            key={i}
            className={`absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange ${p.settled ? '' : 'opacity-45'}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        ))}
      </div>
      {/* The numbers, beside the week's column and over the weeks on the far
          side, so the bar and its point stay in view. */}
      {shown && tip.shown != null ? (
        <div
          role="tooltip"
          data-week={shown.week}
          className={cn(WEEK_TIP_CARD, 'top-0 w-max max-w-[220px] px-3.5 py-3')}
          style={tip.shown < n / 2
            ? { left: `calc(${pct((tip.shown + 1) / n)} + 6px)` }
            : { right: `calc(${pct((n - tip.shown) / n)} + 6px)` }}
        >
          <WeekDetailRows detail={shown} variant="card" />
        </div>
      ) : null}
    </div>
  )
}
