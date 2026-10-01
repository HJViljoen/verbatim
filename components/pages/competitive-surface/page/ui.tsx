import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { BAR_FILL, BrandChip, IconTile, type BarWho } from '@/components/colour-roles'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// The Competitive page's atoms, read off the approved artboard
// (Page-Competitive.dc.html, pages build 1 Oct): a white card at 16px, the
// block title at 20px over its base at 13px, the sub-head at 16px, rows on a
// hairline, bars drawn against 100% in palette A's yellow on its track, and
// the client's own row in its gold.
//
// COLOURS. Ink, muted, hairline and the inner ground are the app's tokens.
// The colour roles (components/colour-roles.tsx, colour pass 1 Oct): cards on
// the card shadow with their icon tiles, a bar filled by whose videos it
// counts (a rival's own block draws in the rival grey), brands as chips.

/** Palette A: the bars' fill, their track, and "you" on light. */
export const YELLOW = '#FFD43B'
export const TRACK = '#ECEAE4'
export const GOLD = '#9A6B00'

/** A block's white card, on the card shadow. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('flex min-w-0 flex-col rounded-[16px] bg-card shadow-card', className)}>{children}</section>
}

/** A block's title, behind its icon tile when it has one. */
function Title({ title, icon }: { title: ReactNode; icon?: LucideIcon }) {
  const h2 = <h2 className="m-0 text-[20px] font-bold text-foreground">{title}</h2>
  return icon ? <div className="flex items-baseline gap-2.5"><IconTile icon={icon} />{h2}</div> : h2
}

/** A title with its base on the line under it (the narrow cards). */
export function TitleStack({ title, sub, icon }: { title: ReactNode; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col gap-1">
      <Title title={title} icon={icon} />
      {sub ? <div className="text-[13px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** A title with its base at the right-hand end (the wide blocks). */
export function TitleRow({ title, sub, icon }: { title: ReactNode; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <Title title={title} icon={icon} />
      {sub ? <div className="text-[13px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** A sub-head inside a block, with its base under it. */
export function SubHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <h3 className="m-0 text-[16px] font-bold text-foreground">{title}</h3>
      {sub ? <div className="text-[13px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** A bar against 100%, never against the top row, filled by whose videos it
 *  counts: the market yellow unless told otherwise. */
export function Bar({ pct, className, who = 'market' }: { pct: number; className?: string; who?: BarWho }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span aria-hidden className={cn('block h-2 min-w-0 overflow-hidden rounded-[4px]', className)} style={{ background: TRACK }}>
      <span className={cn('block h-2', BAR_FILL[who])} style={{ width: `${w}%` }} />
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
export function CountRow({ label, k, of, who }: { label: ReactNode; k: number; of: number; who?: BarWho }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-border py-2">
      <div className="w-[196px] min-w-0 shrink-0 text-[14px] text-foreground max-sm:w-[150px]">{label}</div>
      <Bar pct={of > 0 ? (100 * k) / of : 0} className="grow" who={who} />
      <Num value={k} className="w-[34px] shrink-0 text-right text-[14px] font-medium text-foreground" />
    </div>
  )
}

/** The chip a finding's rival sits in: the track, the rival grey's dot. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-track px-2.5 py-[5px] text-[12px] leading-[1.3] font-semibold text-foreground">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-comp" />
      {children}
    </span>
  )
}

/** A brand named on a line of talk: you a gold chip, a rival a chip with the
 *  grey dot, the category muted words. */
export function BrandName({ kind, children }: { kind: 'you' | 'brand' | 'market'; children: ReactNode }) {
  if (kind === 'you') return <BrandChip who="you">{children}</BrandChip>
  if (kind === 'market') return <span className="text-muted-foreground">{children}</span>
  return <BrandChip who="rival">{children}</BrandChip>
}
