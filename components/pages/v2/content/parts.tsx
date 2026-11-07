import Link from 'next/link'
import type { ReactNode } from 'react'
import { GO } from '@/components/v2/look'
import { fmtInt } from '@/lib/format'
import type { GroupName, SentencePart } from '@/lib/pages/v2/content'
import { groupHref } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'

// The Content page's small shared pieces (depth v2, T6; the audit design, 7
// Nov): the code-written sentence with its figures marked, the link, group
// names and platform counts. Server components, no client JS. Figures are
// tabular sans (no mono on screens, decision 9).

/** A number code computed, marked for the copy contract. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-copy="figure" className={cn('tabular-nums', className)}>{children}</span>
}

/** "k of N", marked a level. */
export function Lvl({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-copy="level" className={cn('tabular-nums', className)}>{children}</span>
}

/** A sentence code wrote: words as they are, every number a figure. */
export function Sentence({ parts }: { parts: readonly SentencePart[] }) {
  return (
    <>
      {parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <Fig key={i}>{p.figure}</Fig>))}
    </>
  )
}

/** The level pages' links, until each page draws the kit's `GoLink` (T6.2
 *  to T6.4 drop it): the audit design's link, ink and underlined. */
export const OLINK = GO

/** A link that says where it goes (the kit's `GO`), with `scroll` for the
 *  table's show-more, which keeps the reader's place. */
export function OLink({ href, children, scroll, className, ...rest }: { href: string; children: ReactNode; scroll?: boolean; className?: string; 'aria-expanded'?: boolean; 'aria-controls'?: string }) {
  return <Link href={href} scroll={scroll} className={cn(GO, className)} {...rest}>{children}</Link>
}

/** A list of facts as the boards draw them on a card: the term muted on the
 *  left, its words on the right, a hairline above. */
export function Facts({ rows, className }: { rows: readonly (readonly [string, ReactNode] | null | false)[]; className?: string }) {
  const shown = rows.filter((r): r is readonly [string, ReactNode] => Boolean(r))
  if (shown.length === 0) return null
  return (
    <dl className={cn('m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-track pt-4 text-[14.5px] leading-[1.45]', className)}>
      {shown.map(([term, words]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="m-0 min-w-0">{words}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Group names, each the model's (the profile's `pass_e_persona` slot), with
 *  no count beside it (decision 5). */
export function GroupNames({ groups, links = false }: { groups: readonly GroupName[]; links?: boolean }) {
  return (
    <>
      {groups.map((g, i) => (
        <span key={g.key}>
          {i > 0 ? ', ' : null}
          {links ? (
            <Link href={groupHref(g.key)} className="underline-offset-[3px] hover:underline"><span data-copy="subject" data-slot="pass_e_persona">{g.name}</span></Link>
          ) : (
            <span data-copy="subject" data-slot="pass_e_persona">{g.name}</span>
          )}
        </span>
      ))}
    </>
  )
}

/** "Instagram 5, TikTok 2, YouTube 2", each count a figure. */
export function PlatformCounts({ rows, label }: { rows: readonly { platform: string; posts: number }[]; label: (p: string) => string }) {
  return (
    <>
      {rows.map((r, i) => (
        <span key={r.platform}>{i > 0 ? ', ' : null}{label(r.platform)} <Fig>{fmtInt(r.posts)}</Fig></span>
      ))}
    </>
  )
}

/** The tallest a week's column is drawn, in px: the card's 48 and the idea
 *  page's 120 (the boards'). */
const WEEK_BAR_PX = { sm: 48, lg: 120 } as const

/**
 * The weeks as yellow columns, drawn in HTML so their words stay the boards'
 * size at every width (the kit's `MiniBars` is an SVG whose text shrinks with
 * its box: 7 to 9px on an idea card). Each week's count over its column, its
 * day under a hairline, the newest in ink at 600; each column against the
 * list's largest week. Bare counts: the base is said once above them
 * (decision 2). `sm` is an idea card's (42px columns, 12px words), `lg` the
 * idea page's (the columns share up to 520px, 14px and 13px words).
 */
export function WeekBars({ bars, label, size = 'sm' }: { bars: readonly { label: string; value: number }[]; label: string; size?: 'sm' | 'lg' }) {
  const max = Math.max(0, ...bars.map((b) => b.value))
  const lg = size === 'lg'
  return (
    <div
      role="img"
      aria-label={`${label}: ${bars.map((b) => `${b.label} ${fmtInt(b.value)}`).join(', ')}`}
      data-week-bars={size}
      className={lg ? 'grid max-w-[520px] grid-flow-col auto-cols-fr items-end gap-6 max-sm:gap-3' : 'grid shrink-0 grid-flow-col auto-cols-[42px] items-end gap-1.5'}
    >
      {bars.map((b, i) => {
        const newest = i === bars.length - 1
        return (
          <div key={b.label} className={cn('flex flex-col items-center', lg ? 'gap-1.5' : 'gap-1')}>
            <span data-copy="figure" className={cn('leading-[1.3] tabular-nums', lg ? 'text-[14px]' : 'text-[12px]', newest ? 'font-semibold text-foreground' : 'text-secondary-foreground')}>{fmtInt(b.value)}</span>
            <div className={cn('w-full bg-brand', lg ? 'rounded-t-[4px]' : 'rounded-t-[3px]')} style={{ height: max > 0 ? Math.round((b.value / max) * WEEK_BAR_PX[size]) : 0 }} />
            <span className={cn('w-full whitespace-nowrap border-t border-control text-center leading-[1.3]', lg ? 'pt-1.5 text-[13px]' : 'pt-1 text-[12px]', newest ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}
