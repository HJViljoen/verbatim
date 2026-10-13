import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { BrandChip, ChipSep } from '@/components/colour-roles'
import { FlagChip } from '@/components/v2'
import { marketLabelsOf } from '@/lib/brands/labels'
import { fmtInt } from '@/lib/format'
import { substituteFigures } from '@/lib/reports/cover'
import type { StoredLine } from '@/lib/pages/v2/market'
import { nextMonth } from '@/lib/reading/month-key'
import { bandVerdict, type Verdict } from '@/lib/reading/verdicts'
import type { WhoPart } from '@/lib/written/types'
import { cn } from '@/lib/utils'

// The small pieces Market's blocks share (depth v2, T3), drawn to the boards
// E2-Market and E2-Market-Open on the v2 kit's tokens: the orange-text link,
// the mono muted figure line, a conversation's row, who its videos are about,
// a stored sentence with its figures put back.

/** The boards' `.olink`: the orange-text action link. */
export const OLINK = 'text-[13.5px] font-semibold text-orange-text no-underline hover:underline underline-offset-[3px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[2px]'

/** The boards' `.mono.muted` line under a big figure. */
export const MONO_MUTED = 'font-mono text-[12.5px] tabular-nums text-muted-foreground'

/** The boards' big and mid figures. */
export const BIG = 'font-mono text-[44px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground'
export const MID = 'font-mono text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums text-foreground'

/** A count as the page prints it, or nothing. */
export function Fig({ n, className }: { n: number | null | undefined; className?: string }) {
  if (n == null) return null
  return <span data-copy="figure" className={className}>{fmtInt(n)}</span>
}

/**
 * "New" on a conversation first heard this week: the reader flag (READER_FLAGS)
 * as a verdict the chip can read, never a free word. The week read's own rule
 * earned it (`firstHeardThisWeek`: new this month and first cited inside the
 * week), so the flag is the month's `new`.
 */
export function newVerdict(id: string, label: string, k: number, n: number, month: string): Verdict {
  return bandVerdict({
    objectKind: 'theme', objectId: id, objectLabel: label, audience: 'industry-other',
    window: { kind: 'month', from: month, to: nextMonth(month) }, value: { k, n: Math.max(n, k) }, flags: ['new'],
  })
}

/** Who the videos are about, in one running line: the client's chip, the
 *  rivals' chips, the rest of the market in quiet words, each with its count
 *  ("Ottobock 5 · Össur 3 · others 11"). */
export function About({ parts, brand, noun, className }: { parts: readonly WhoPart[]; brand: string; noun: string | null; className?: string }) {
  if (parts.length === 0) return null
  const words = marketLabelsOf(noun)
  const ordered = [...parts].sort((a, b) => rank(a) - rank(b) || b.videos - a.videos)
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-y-1 text-[12.5px] leading-[1.5]', className)}>
      {ordered.map((p, i) => (
        <Fragment key={p.about}>
          {i > 0 ? <ChipSep /> : null}
          {p.about === 'client'
            ? <BrandChip who="you">{brand} <Fig n={p.videos} className="font-mono font-normal" /></BrandChip>
            : p.about === 'market'
              ? <span className="text-muted-foreground">{ordered.length === 1 ? 'no brand named' : words.short} {ordered.length === 1 ? null : <Fig n={p.videos} className="font-mono" />}</span>
              : <BrandChip who="rival">{p.about.slice('rival:'.length)} <Fig n={p.videos} className="font-mono font-normal" /></BrandChip>}
        </Fragment>
      ))}
    </span>
  )
}

const rank = (p: WhoPart): number => (p.about === 'client' ? 0 : p.about === 'market' ? 2 : 1)

/** A stored sentence (a slot's prose), any `[[key]]` put back as code's
 *  figure; a sentence naming a key the table lacks is left out. */
export function Stored({ line, slot, className, as: Tag = 'p' }: { line: StoredLine; slot: string; className?: string; as?: 'p' | 'span' | 'div' }) {
  if (!line.body.includes('[[')) return <Tag data-copy="stored" data-slot={slot} className={className}>{line.body}</Tag>
  const parts = substituteFigures(line.body, line.figures)
  if (parts.length === 0) return null
  return (
    <Tag data-copy="stored" data-slot={slot} className={className}>
      {parts.map((part, i) => ('text' in part ? <Fragment key={i}>{part.text}</Fragment> : <span key={i} data-copy="figure">{part.figure}</span>))}
    </Tag>
  )
}

/** A conversation's row in a list (the boards' `.conv`): its name, a chip
 *  where one is earned, its counts at the right. */
export function ConvRow({ href, label, chip, counts, selected }: {
  href: string
  label: string
  chip?: ReactNode
  /** The period's count first; a second is the month it is restated against. */
  counts: (number | null)[]
  selected?: boolean
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        '-mx-2 flex min-h-[34px] cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-[14.5px] leading-[1.35] text-foreground no-underline transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-accent' : null,
      )}
    >
      {/* The chip wraps under the name where the two do not fit one line (a
          phone), so the name keeps its width (T9). */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span data-copy="subject" data-slot="pass_b_theme" className="min-w-0">{label}</span>
        {chip}
      </span>
      <span className="ml-auto flex shrink-0 items-baseline gap-3">
        {counts.map((c, i) => (
          <span key={i} className={cn('w-9 whitespace-nowrap text-right font-mono text-[13px] tabular-nums', i === 0 ? 'text-secondary-foreground' : 'text-muted-foreground')}>
            {c == null ? '' : <span data-copy="figure">{fmtInt(c)}</span>}
          </span>
        ))}
      </span>
    </Link>
  )
}

/** The chip a conversation has earned on a list: the week's flag, else "New". */
export function ConvChip({ flag, isNew, id, label, k, n, month }: { flag: Verdict | null; isNew: boolean; id: string; label: string; k: number; n: number; month: string }) {
  if (flag) return <FlagChip verdict={flag} />
  if (isNew) return <FlagChip verdict={newVerdict(id, label, k, n, month)} />
  return null
}

/** Why a conversation leads nothing (decision F): the board's own words. */
export const SET_APART_WORDS = { makers: 'mostly makers’ own posts', noise: 'mostly off-topic videos' } as const

/** The quiet tag a set-apart conversation carries wherever it is listed. */
export function SetApartTag({ setApart }: { setApart: 'makers' | 'noise' | null }) {
  if (!setApart) return null
  return <span className="whitespace-nowrap text-[12px] text-muted-foreground">{SET_APART_WORDS[setApart]}</span>
}

/** A small caps section label (the boards' `.lbl` / `.dlabel`). */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground', className)}>{children}</p>
}
