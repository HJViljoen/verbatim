import Link from 'next/link'
import type { ReactNode } from 'react'
import { fmtInt } from '@/lib/format'
import type { GroupName, Recipe, SentencePart } from '@/lib/pages/v2/content'
import { fmtMultiple, groupHref } from '@/lib/pages/v2/content'
import { cn } from '@/lib/utils'

// The Content page's small shared pieces (depth v2, T6): the boards' `.olink`,
// `.rchip`, `.fact`, `.dlabel` and the code-written sentence with its figures
// marked. Server components, no client JS.

/** A number code computed, marked for the copy contract. */
export function Fig({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-copy="figure" className={cn('font-mono tabular-nums', className)}>{children}</span>
}

/** "k of N", marked a level. */
export function Lvl({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-copy="level" className={cn('font-mono tabular-nums', className)}>{children}</span>
}

/** A sentence code wrote: words as they are, every number a figure. */
export function Sentence({ parts }: { parts: readonly SentencePart[] }) {
  return (
    <>
      {parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <Fig key={i}>{p.figure}</Fig>))}
    </>
  )
}

/** The boards' `.olink`: an orange-text link with its arrow. */
export const OLINK = 'text-[13.5px] font-semibold text-orange-text no-underline transition-colors hover:text-orange-text/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm'

export function OLink({ href, children, scroll, className, ...rest }: { href: string; children: ReactNode; scroll?: boolean; className?: string; 'aria-expanded'?: boolean; 'aria-controls'?: string }) {
  return <Link href={href} scroll={scroll} className={cn(OLINK, className)} {...rest}>{children}</Link>
}

/** The boards' `.dlabel`: small grey caps over a section. */
export const LABEL = 'm-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

/** A format or an opening, with its response multiple (the boards' `.rchip`). */
export function RecipeChip({ recipe }: { recipe: Recipe }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-[8px] bg-inner px-2.5 py-[7px] text-[13px] leading-[1.3]">
      {recipe.label}
      {recipe.multiple != null ? <Fig className="text-[12px] font-semibold">{fmtMultiple(recipe.multiple)}</Fig> : null}
    </span>
  )
}

/** One row of a card's facts (the boards' `.fact`): a grey name, its value. */
export function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2.5 border-b border-track py-[9px] text-[13.5px] leading-[1.4]">
      <span className="text-muted-foreground">{name}</span>
      <span className="min-w-0">{children}</span>
    </div>
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
