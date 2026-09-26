import type { ReactNode } from 'react'

import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, monthName } from '@/lib/format'
import { figureText, type HeroPart } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'

// The new front page's shared pieces (market-first WP1.6): the switch that
// says a page was built as "Your market", a sentence drawn from parts, the
// column heads that carry a table's base, and the preview's level bar.
//
// THE SWITCH. A page built by the market-first loader carries `market`; a
// stored snapshot from before WP1.6, and the weekly's pinned read, do not.
// Every reworked block draws its new form only where the switch is on, and
// its Phase 1 form otherwise, so no stored artefact changes under it.

/** Was this page built as "Your market"? */
export const isMarketPage = (data: Pick<OverviewData, 'market'>): boolean => data.market != null

/**
 * YOUR MARKET'S ONE TYPE SCALE (the approved preview, 25 Sep; design pass).
 * Three sizes carry every table on the page: a row's words and figures at
 * 15px, a column head at 13px, and the apparatus (a base, a row tag, a cite)
 * in mono at 12px. Figures are always Plex Mono with tabular digits, so a
 * column of them aligns; this month's in ink, the month before in grey.
 */
export const SCALE = {
  head: 'text-[13px] font-medium leading-[1.35] text-muted-foreground',
  row: 'text-[15px] leading-[1.4] text-foreground',
  num: 'text-right font-mono text-[15px] tabular-nums text-foreground',
  prev: 'text-right font-mono text-[15px] tabular-nums text-muted-foreground',
  tag: 'font-mono text-[12px] leading-[1.4] text-muted-foreground',
} as const

/**
 * A NARROW table (WP1.6 review; deploy 2 review). At 390px the preview's
 * columns scrolled sideways, and the first screen showed truncated labels and
 * bars and none of the figures. In a narrow block a market table is the label
 * and its three figure columns (Videos, this month, the month before), which
 * fit: the rank and the bar leave (`PHONE_HIDDEN`), and a row's tag or "under
 * 10, a count only" takes a line of its own under the row (`PHONE_OWN_LINE`).
 *
 * THE BLOCK'S WIDTH DECIDES, NOT THE WINDOW'S (deploy 2 review). Keyed to
 * `sm`, the wide columns ran from 640px of window, but the tile sits beside
 * the 224px sidebar from `md`: at 768 the kinds table needed 528px in a 432px
 * block and scrolled sideways, and the subjects table 568 in 536 at 640. The
 * table's wrapper is a container (`@container`) and the wide columns start at
 * 600px of block (`@min-[600px]:`), the kinds and subjects tables' widest
 * need plus room. The theme board, wider still, has its own (themes.tsx).
 */
export const PHONE_COLS = 'grid-cols-[minmax(0,1fr)_44px_48px_48px] gap-x-3 @min-[600px]:gap-x-4'
export const PHONE_HIDDEN = '@max-[600px]:hidden'
export const PHONE_OWN_LINE = '@max-[600px]:order-last @max-[600px]:col-span-full'

/** A table's rules: ink-grey under the head, a lighter hairline between rows. */
export const RULE = {
  head: 'border-b border-border pb-2.5',
  row: 'border-b border-border/60',
} as const

/** "Sep" off a month key, for a column head. */
export const shortMonthName = (month: string): string => monthName(month).split(' ')[0]

/**
 * A sentence drawn from parts (lib/pages/overview-market/hero.ts): a theme
 * label is model words and its own `subject` node, in quotation marks; a
 * figure is code's number and its own `figure` node. Nothing is parsed out of
 * a finished string.
 */
export function Parts({ parts, figures, mode, labelClassName, figureClassName = 'font-mono font-semibold tabular-nums text-foreground' }: { parts: readonly HeroPart[]; figures: FigureTable; mode: RenderMode; labelClassName?: string; figureClassName?: string }) {
  const email = mode === 'email'
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === 'text') return <span key={i}>{p.s}</span>
        if (p.t === 'label') {
          return (
            <span key={i} className={email ? undefined : labelClassName} style={email ? { fontWeight: 600, color: EMAIL.ink } : undefined}>
              “<span data-copy="subject" data-slot="pass_b_theme">{p.s}</span>”
            </span>
          )
        }
        return (
          <span
            key={i}
            data-copy="figure"
            className={email ? undefined : figureClassName}
            style={email ? { fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: EMAIL.ink } : undefined}
          >
            {figureText(figures[p.key])}
          </span>
        )
      })}
    </>
  )
}

/** A column head that carries its base: "Sep" over "of 626". The base is a
 *  level (the "of N" every share in the column is a share of). */
export function BaseHead({ month, n, mode, align = 'right' }: { month: string; n: number | null; mode: RenderMode; align?: 'left' | 'right' }) {
  const name = shortMonthName(month)
  if (mode === 'email') {
    return (
      <span data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted }}>
        {name}{n != null ? <span style={{ fontFamily: FONT.mono, fontWeight: 400 }}> of {fmtInt(n)}</span> : null}
      </span>
    )
  }
  return (
    <span data-copy="level" className={cn('flex flex-col leading-[1.35]', align === 'right' ? 'items-end text-right' : 'items-start')}>
      <span className="text-[13px] font-medium text-muted-foreground">{name}</span>
      {n != null ? <span className="whitespace-nowrap font-mono text-[12px] font-normal text-muted-foreground">of {fmtInt(n)}</span> : null}
    </span>
  )
}

/** The axis a block's bars share: the next whole percent above the largest
 *  share on it, so the biggest bar never touches the edge. */
export function barAxis(shares: readonly (number | null)[]): number {
  const max = Math.max(0, ...shares.filter((s): s is number => s != null && Number.isFinite(s)))
  return Math.max(0.01, Math.min(1, Math.ceil(max * 108) / 100))
}

/**
 * The preview's level bar: this month as a filled ink bar, the month before
 * as a grey tick on the same axis. Two levels on one axis, not a change: no
 * arrow, no colour for up or down. Decoration to a screen reader; the numbers
 * beside it are the reading.
 */
export function LevelBar({ share, prevShare, axis, tone = 'ink' }: { share: number | null; prevShare: number | null; axis: number; tone?: 'ink' | 'you' }) {
  const pct = (s: number | null) => (s == null ? null : Math.max(0, Math.min(100, (s / axis) * 100)))
  const w = pct(share)
  const t = pct(prevShare)
  return (
    <span aria-hidden className="relative block h-1.5 w-full min-w-[48px]">
      {w != null ? <span className={cn('absolute inset-y-0 left-0 rounded-[2px]', tone === 'you' ? 'bg-you' : 'bg-foreground')} style={{ width: `${w}%` }} /> : null}
      {t != null ? <span className="absolute -top-[5px] h-4 w-[2px] rounded-[1px] bg-cat" style={{ left: `calc(${t}% - 1px)` }} /> : null}
    </span>
  )
}

/** The legend over a bar column: "▬ September | August". */
export function BarLegend({ month, prevMonth }: { month: string; prevMonth: string | null }) {
  return (
    <span aria-hidden className="flex items-center gap-4 whitespace-nowrap text-[13px] font-medium text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-[2px] bg-foreground" />{longMonth(month)}</span>
      {prevMonth ? <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-[2px] rounded-[1px] bg-cat" />{longMonth(prevMonth)}</span> : null}
    </span>
  )
}

/** The preview's makers mark: a small hatched square before a maker tag. */
export function MakerMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="flex-none">
      <rect x=".5" y=".5" width="11" height="11" rx="2" stroke="currentColor" className="text-cat" />
      <path d="M1 8 8 1M4 11 11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-muted-foreground" />
    </svg>
  )
}

/** A waiting state or a positive finding, as one line inside a drawn block
 *  (decision B 2): never a card that only says a gate failed. */
export function InnerLine({ children, mode }: { children: ReactNode; mode: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, background: EMAIL.inner, borderRadius: 6, padding: '10px 12px', marginTop: 8 }}>{children}</div>
  }
  // The box takes the block's width; the words keep a reading measure.
  return <p className="m-0 rounded-md bg-inner px-4 py-4 text-[15px] leading-[1.55] text-secondary-foreground sm:px-6"><span className="block max-w-[76ch] [text-wrap:pretty]">{children}</span></p>
}
