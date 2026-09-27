import type { ReactNode } from 'react'

import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { Part } from '@/lib/pages/brands'
import { cn } from '@/lib/utils'

// The Brands page's shared pieces (market-first WP3.5): the approved
// preview's sub-head (a 15px title with its column word at the right, as
// Your market's "Asked · videos"), a figure, a sentence from parts, and the
// preview's inner ground. Your market's type scale and rules
// (components/pages/overview/market.tsx `SCALE`, `RULE`) set every table.

/** A sub-head inside a block: its title, and the word its column counts. */
export function SubHead({ title, note, mode, className }: { title: ReactNode; note?: ReactNode; mode: RenderMode; className?: string }) {
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, margin: '12px 0 4px' }}>
        {title}{note ? <span style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.muted }}> · {note}</span> : null}
      </div>
    )
  }
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <h3 className="m-0 text-[15px] font-semibold text-foreground">{title}</h3>
      {note ? <span className="whitespace-nowrap font-mono text-[13px] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

/** A count, in the figures' face. */
export function Fig({ value, mode, className }: { value: number; mode: RenderMode; className?: string }) {
  return (
    <span
      data-copy="figure"
      className={mode === 'email' ? undefined : cn('font-mono tabular-nums', className)}
      style={mode === 'email' ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}
    >
      {fmtInt(value)}
    </span>
  )
}

/** A sentence drawn from parts: code's figures each their own node. */
export function PartsText({ parts, mode, figureClassName = 'font-semibold text-foreground' }: { parts: readonly Part[]; mode: RenderMode; figureClassName?: string }) {
  return (
    <>
      {parts.map((p, i) => (p.t === 'text'
        ? <span key={i}>{p.s}</span>
        : <Fig key={i} value={p.value} mode={mode} className={figureClassName} />))}
    </>
  )
}

/** The preview's inner ground: a waiting state, or a side note. */
export function Inner({ children, mode, className }: { children: ReactNode; mode: RenderMode; className?: string }) {
  if (mode === 'email') {
    return <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '12px 16px', marginTop: 8 }}>{children}</div>
  }
  return <div className={cn('flex min-w-0 flex-col gap-2 rounded-md bg-inner px-4 py-4 sm:px-6 sm:py-6', className)}>{children}</div>
}

/** One line of words in a block (a waiting state or a count), never a card. */
export function Line({ children, mode, className }: { children: ReactNode; mode: RenderMode; className?: string }) {
  if (mode === 'email') return <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.ink2, marginTop: 8 }}>{children}</div>
  return <p className={cn('m-0 text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]', className)}>{children}</p>
}

/** A legend square before a column head (the brand counts' two inks). */
export function Swatch({ ink, bar = false }: { ink: string; bar?: boolean }) {
  return bar
    ? <span aria-hidden className="mr-1.5 inline-block h-3 w-[2px] rounded-[1px] align-[-1px]" style={{ background: ink }} />
    : <span aria-hidden className="mr-1.5 inline-block size-2 rounded-[2px] align-[1px]" style={{ background: ink }} />
}

/** An email table cell's style, the page's two weights. */
export const emailCell = { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '6px 10px 6px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
export const emailHead = { fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, padding: '0 10px 4px 0', textAlign: 'left' as const, verticalAlign: 'bottom' as const }
