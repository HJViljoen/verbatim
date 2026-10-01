import type { ReactNode } from 'react'

import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// The Competitive page's atoms, read off the approved artboard
// (Page-Competitive.dc.html, pages build 1 Oct): a white card at 16px, the
// block title at 20px over its base at 13px, the sub-head at 16px, rows on a
// hairline, bars drawn against 100% in palette A's yellow on its track, and
// the client's own row in its gold.
//
// COLOURS. Ink, muted, hairline and the inner ground are the app's tokens
// (none is the old green); the yellow, its track and the gold have no token
// yet, so palette A's values are set here until the app-wide colour swap.

/** Palette A: the bars' fill, their track, and "you" on light. */
export const YELLOW = '#FFD43B'
export const TRACK = '#ECEAE4'
export const GOLD = '#9A6B00'

/** A block's white card. Keeps the tile shadow while the page ground is
 *  white; the artboard draws it on palette A's ground with none. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('flex min-w-0 flex-col rounded-[16px] bg-card', className)}>{children}</section>
}

/** A title with its base on the line under it (the narrow cards). */
export function TitleStack({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="m-0 text-[20px] font-bold leading-[1.3] text-foreground">{title}</h2>
      {sub ? <div className="text-[13px] leading-[1.45] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** A title with its base at the right-hand end (the wide blocks). */
export function TitleRow({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="m-0 text-[20px] font-bold leading-[1.3] text-foreground">{title}</h2>
      {sub ? <div className="text-[13px] leading-[1.45] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** A sub-head inside a block, with its base under it. */
export function SubHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <h3 className="m-0 text-[16px] font-bold leading-[1.35] text-foreground">{title}</h3>
      {sub ? <div className="text-[13px] leading-[1.45] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** A bar against 100%, never against the top row. */
export function Bar({ pct, className }: { pct: number; className?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span aria-hidden className={cn('block h-2 min-w-0 overflow-hidden rounded-[4px]', className)} style={{ background: TRACK }}>
      <span className="block h-2" style={{ width: `${w}%`, background: YELLOW }} />
    </span>
  )
}

/** A count in the figures' face. */
export function Num({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  return <span data-copy="figure" className={cn('font-mono tabular-nums', className)} style={style}>{fmtInt(value)}</span>
}

/** "13 videos": the count in mono and its noun in muted. */
export function CountWords({ value, one, many, you = false }: { value: number; one: string; many: string; you?: boolean }) {
  return (
    <span className="whitespace-nowrap text-[13px] text-muted-foreground">
      <Num value={value} className="text-[15px] font-medium" style={{ color: you ? GOLD : 'var(--foreground)' }} /> {value === 1 ? one : many}
    </span>
  )
}

/** A row on a small base: its label, the bar k/of, and the count. */
export function CountRow({ label, k, of }: { label: ReactNode; k: number; of: number }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-border py-2">
      <div className="w-[196px] min-w-0 shrink-0 text-[14px] leading-[1.4] text-foreground max-sm:w-[150px]">{label}</div>
      <Bar pct={of > 0 ? (100 * k) / of : 0} className="grow" />
      <Num value={k} className="w-[34px] shrink-0 text-right text-[14px] font-medium text-foreground" />
    </div>
  )
}

/** The chip a finding's brand sits in. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-inner px-2.5 py-[5px] text-[12px] leading-[1.3] text-foreground">{children}</span>
}

/** A brand named on a line of talk: you in gold, a rival in ink, the
 *  category muted. */
export function BrandName({ kind, children }: { kind: 'you' | 'brand' | 'market'; children: ReactNode }) {
  if (kind === 'you') return <span className="font-semibold" style={{ color: GOLD }}>{children}</span>
  if (kind === 'market') return <span className="text-muted-foreground">{children}</span>
  return <span className="font-semibold text-foreground">{children}</span>
}
