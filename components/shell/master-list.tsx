import { QuoteBlock } from '@/components/quote-block'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Server-renderable pieces of a master-detail page (see master-detail.tsx).
// The rail lists groups with counts; the list holds rows; the detail pane
// shows the selected item. Active state is derived on the server from the
// URL, so nothing here needs client JS.
//
// SINCE THE AUDIT DESIGN (7 Nov): every label in sentence case, no mono, no
// capitals, at 13px or more. The Studio's workbench no longer uses these
// panes (one tile that flows with the page, Studio.dc.html); the report
// editor, the ops readiness page, the Studio's New report page and the
// legacy modules that still do take the restyle with them.

/** Pane header: a title, an optional meta on the right, and controls below. */
export function PaneHeader({ title, meta, children, className }: { title: ReactNode; meta?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex shrink-0 flex-col gap-2 border-b border-border/70 px-4 pt-3.5 pb-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 shrink-0 text-[14px] font-semibold text-secondary-foreground">{title}</h2>
        {meta && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </header>
  )
}

/** The scrolling body of a pane. */
export function PaneBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>
}

/** A group in the rail: its label + its links. */
export function RailGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-2 py-2">
      {label && <p className="m-0 px-2 pb-1 text-[13px] font-semibold text-muted-foreground">{label}</p>}
      <ul className="flex flex-col gap-px">{children}</ul>
    </div>
  )
}

/** One rail entry: label, then count; active = weight + inner tint. */
export function RailLink({ href, active = false, count, children }: { href: string; active?: boolean; count?: number | string | null; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[14px] transition-colors',
          active ? 'bg-inner font-semibold text-foreground' : 'text-secondary-foreground hover:bg-inner hover:text-foreground',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {count != null && <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>}
      </Link>
    </li>
  )
}

/** Segmented filter for a list header: links, one active. */
export function Segmented({ items }: { items: { href: string; label: ReactNode; active?: boolean; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <Link
          key={i}
          href={it.href}
          aria-current={it.active ? 'true' : undefined}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] transition-colors',
            it.active ? 'border-transparent bg-accent font-semibold text-accent-foreground' : 'border-border bg-card text-foreground hover:bg-inner',
          )}
        >
          {it.label}
          {it.count != null && <span className="text-[12px] tabular-nums text-muted-foreground">{it.count}</span>}
        </Link>
      ))}
    </div>
  )
}

/** A list row: an inner block (nesting level 2) that links to ?item=. `search`
 *  is the text a ListSearch can match against. */
export function ListRow({
  href, active = false, search, children, className,
}: { href: string; active?: boolean; search?: string; children: ReactNode; className?: string }) {
  return (
    <li data-search={search?.toLowerCase()} className="px-2 first:pt-2 last:pb-2">
      <Link
        href={href}
        scroll={false}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'block rounded-[4px] px-3 py-2.5 transition-colors',
          active ? 'bg-inner ring-1 ring-border' : 'hover:bg-inner',
          className,
        )}
      >
        {children}
      </Link>
    </li>
  )
}

/** The list container — rows are ListRow children. */
export function ListRows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('flex flex-col gap-1', className)}>{children}</ul>
}

/** The honest empty line inside a pane. */
export function PaneEmpty({ children }: { children: ReactNode }) {
  return <p className="m-0 px-4 py-6 text-[14px] text-muted-foreground">{children}</p>
}

/** Detail header: the kind (a label), the title, one meta line. */
export function DetailHeader({ eyebrow, title, meta, children }: { eyebrow?: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="shrink-0 border-b border-border/70 px-5 pt-4 pb-3.5">
      {eyebrow && <p className="m-0 mb-1 text-[13px] font-semibold text-secondary-foreground">{eyebrow}</p>}
      <h3 className="m-0 text-[17px] font-semibold leading-[1.3] [text-wrap:pretty]">{title}</h3>
      {meta && <p className="m-0 mt-1 text-[13px] leading-[1.45] text-muted-foreground">{meta}</p>}
      {children}
    </header>
  )
}

/** A block of the detail pane with its heading. */
export function DetailSection({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('px-5 py-3.5', className)}>
      {label && <p className="m-0 mb-2 text-[16px] font-semibold text-foreground">{label}</p>}
      {children}
    </section>
  )
}

/** A verbatim quote in the house style: serif, mono attribution.
 *
 *  A thin name over QuoteBlock (components/quote-block.tsx), which is the one
 *  place the original-above-English order is decided. Kept as its own export
 *  because seven call sites read `<Verbatim quote={…}>` and the string form is
 *  still right for the two quotes that have no comment behind them at all (the
 *  client's own video). `lang`/`english` pass straight through. */
export function Verbatim({ quote, cite, lang, english }: { quote: string; cite?: ReactNode; lang?: string | null; english?: string | null }) {
  return <QuoteBlock quote={{ text: quote, lang, english }} cite={cite} />
}
