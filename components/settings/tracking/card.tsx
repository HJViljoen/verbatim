import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// The card every block of Settings › What we read sits in, as the approved
// preview draws it (market-first WP3.10, the Settings artboard): a white tile
// on the ambient shadow, a 32px inset (16px on a phone), the title alone as a
// 13px uppercase eyebrow, 24px between the groups, and a footer of links only
// under a full-width hairline. Twelve columns wide, or six beside a partner
// from `xl`; stacked below it.

export function Card({ id, title, span = 12, footer, children, className }: {
  /** The anchor "On this page" and the footers point at. */
  id?: string
  title: string
  span?: 6 | 12
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        'flex min-w-0 scroll-mt-6 flex-col rounded-lg bg-tile shadow-tile',
        span === 6 ? 'xl:col-span-6' : 'xl:col-span-12',
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        <header>
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</h2>
        </header>
        {children}
      </div>
      {footer ? (
        <footer className="flex min-h-12 flex-wrap items-center gap-x-6 gap-y-1 border-t border-border/60 px-4 py-1 text-[14px] font-medium text-foreground sm:px-8">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

/** The page's cards, on twelve columns from `xl`, 24px apart. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">{children}</div>
}

/** A footer or index link: the words underlined at rest by a hairline that
 *  darkens on hover, the arrow beside them and never under them. `href` may
 *  be an anchor on this page. */
export function CardLink({ href, children, arrow = '→' }: { href: string; children: ReactNode; arrow?: '→' | '↑' | '↓' }) {
  const words = (
    <>
      <span className="underline decoration-border decoration-1 underline-offset-[5px] transition-colors group-hover/card-link:decoration-foreground">{children}</span>
      <span aria-hidden="true">{arrow}</span>
    </>
  )
  const cls = 'group/card-link inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
  return href.startsWith('#')
    ? <a href={href} className={cls}>{words}</a>
    : <Link href={href} className={cls}>{words}</Link>
}

/** A count in the preview's figure ink: mono, semibold, tabular. */
export function Fig({ n, className }: { n: number; className?: string }) {
  return <span data-copy="figure" className={cn('font-mono font-semibold tabular-nums text-foreground', className)}>{fmtInt(n)}</span>
}

/** A table's head cell: 13px medium in the muted ink, with an optional mono
 *  line under it ("Sep", "of them"). */
export function HeadCell({ children, sub, align = 'left', style }: { children?: ReactNode; sub?: ReactNode; align?: 'left' | 'right'; style?: CSSProperties }) {
  return (
    <span style={style} className={cn('block whitespace-nowrap text-[13px] font-medium leading-[1.35] text-muted-foreground', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
      {sub ? <span className="block font-mono text-[12px] font-normal">{sub}</span> : null}
    </span>
  )
}

/** The small square key beside a label ("■ filed under brands you track"). */
export function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-[2px]', className)} />
}

/** The makers' hatch: the preview's diagonal lines on the faint ground, in the
 *  system's two inks. */
export const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--muted-foreground) 0 1.2px, var(--border) 1.2px 4.2px)',
}

/** The makers' key: a 12px square of the hatch. */
export function HatchKey() {
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-[2px] ring-1 ring-border" style={HATCH} />
}
