import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// One landscape slide (297 × 167 mm, one section per page — Heinrich,
// 2026-08-29). Header: the section on the left, the page's context on the
// right. Body: the 12-column print grid or a single pane. Footer: the method
// note, on every slide, because the reader of a PDF has no drawer to open.

export interface SlideChrome {
  /** Page · client · date — mono, right-aligned in the header. */
  context: ReactNode
  /** The method note (components/print/method-note.tsx), rendered on every slide. */
  footer: ReactNode
}

export function Slide({
  title, chrome, page, pages, layout = 'grid', flow = false, header = true, note, children, className,
}: {
  title: ReactNode
  chrome: SlideChrome
  page: number
  pages: number
  layout?: 'grid' | 'single'
  /** The grid's rows are the children's own heights rather than the app tile
   *  grid's 116px unit. A sheet of borrowed page blocks (E-marketing) needs
   *  this; a report's sheet of tiles does not. */
  flow?: boolean
  /** The section line and the page context, top of the sheet. FALSE on the one
   *  sheet that carries the document's own title, where the two would be the
   *  same words twice (E-marketing: the four brief artboards open on content,
   *  with the title block AS the header). */
  header?: boolean
  /** The operator's one line of framing (Report Studio) — a serif note under
   *  the title on a section's first slide; the body gives up its height. */
  note?: string | null
  children: ReactNode
  className?: string
}) {
  const hasNote = Boolean(note && note.trim())
  return (
    <section className={cn('vb-slide', className)} data-note={hasNote ? '' : undefined}>
      {header && (
        <header className="flex shrink-0 items-baseline justify-between gap-4">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{chrome.context}</span>
        </header>
      )}
      {hasNote && (
        <p className="vb-slide-note truncate font-serif text-[12.5px] italic leading-[18px] text-secondary-foreground">{note}</p>
      )}
      <div className="vb-slide-body">
        {layout === 'grid' ? (
          <div className={cn('vb-print-grid', flow && 'vb-print-sheet')}>{children}</div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">{children}</div>
        )}
      </div>
      <footer className="flex shrink-0 items-baseline justify-between gap-4 border-t border-border/70 pt-1.5">
        <div className="min-w-0 flex-1">{chrome.footer}</div>
        {/* 11px, not 9.5px: under the sheet's .902 zoom a 9.5px numeral sets
            at about 6.4pt on a 297mm page, below the 8pt most print work holds
            to. Moves with `DeckFooter`, which sits on the same baseline. */}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{page} / {pages}</span>
      </footer>
    </section>
  )
}
