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

/** "Sep" off a month key, for a column head. */
export const shortMonthName = (month: string): string => monthName(month).split(' ')[0]

/**
 * A sentence drawn from parts (lib/pages/overview-market/hero.ts): a theme
 * label is model words and its own `subject` node, in quotation marks; a
 * figure is code's number and its own `figure` node. Nothing is parsed out of
 * a finished string.
 */
export function Parts({ parts, figures, mode, labelClassName }: { parts: readonly HeroPart[]; figures: FigureTable; mode: RenderMode; labelClassName?: string }) {
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
            className={email ? undefined : 'font-mono font-semibold tabular-nums text-foreground'}
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
      <span className="text-[12px] font-medium text-muted-foreground">{name}</span>
      {n != null ? <span className="font-mono text-[11px] font-normal text-muted-foreground">of {fmtInt(n)}</span> : null}
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
    <span aria-hidden className="flex items-center gap-4 whitespace-nowrap text-[12px] font-medium text-muted-foreground">
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
  return <p className="m-0 rounded-md bg-inner px-4 py-3 text-[13px] leading-[1.5] text-secondary-foreground">{children}</p>
}
