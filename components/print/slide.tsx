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

/**
 * THE EXPORT PATH MARKS ITS OWN CLIPPED SHEETS (Block D wave 3, SH3).
 *
 * `.vb-slide-body` is `overflow: hidden` over a fixed box, and the only thing
 * that ever set `data-overflow` was the Studio's editor
 * (`components/documents/document-editor.tsx`), which runs on one screen an
 * operator may never open. So the PDF, the in-app viewer and `/r/<token>` all
 * shipped a clipped sheet with no ellipsis, no outline and no warning — the
 * mechanism behind thirteen clipped sheets across four artefacts.
 *
 * The same measurement, emitted by every sheet and run ONCE — the guard is in
 * the script rather than in a `page === 1`, because page 1 of a brief is a
 * `CoverSlide` and never reaches this component — and run after the fonts
 * settle, because a font swap is what changes a line count. It only sets the attribute: `scripts/document-smoke.ts` already looks
 * for `.vb-slide[data-overflow]`, and the visible outline stays scoped to
 * `.vb-editing` in app/globals.css, so a client's PDF gains a fact about
 * itself and not a yellow box.
 *
 * It contains no word `lib/test/copy-contract.ts` polices — deliberately, and
 * a reader editing it should keep it that way.
 */
const MEASURE = `(function(){if(window.__vbSlideMeasure){return}window.__vbSlideMeasure=1;var m=function(){var s=document.querySelectorAll('.vb-slide');for(var i=0;i<s.length;i++){var b=s[i].querySelector('.vb-slide-body');if(b){s[i].toggleAttribute('data-overflow',b.scrollHeight>b.clientHeight+2)}}document.documentElement.setAttribute('data-slides-measured','')};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){requestAnimationFrame(m)})}else{requestAnimationFrame(m)}})()`

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
      <script dangerouslySetInnerHTML={{ __html: MEASURE }} />
      {/* TWO LINES, NOT ONE CUT SHORT (Block D wave 3, SH23). The `<h1>` and
          the framing note were `truncate`, on a sheet whose only output is a
          PDF: a section title clipped mid-word is clipped for good, and the
          only thing that noticed was the Studio editor's `.vb-editing`
          outline. `line-clamp-2` gives each of them a second line and keeps
          the ellipsis where a third would start, so the loss is both rarer and
          visible when it happens. The body gives up the height, which since
          SH3 it measures rather than budgets. */}
      {header && (
        <header className="flex shrink-0 items-baseline justify-between gap-4">
          <h1 className="line-clamp-2 min-w-0 text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
          {/* 11px, AND FOR THE SAME REASON THE PAGE NUMBER BELOW IS (Block D
              wave 3b, `decks`). This span and that numeral are the only two
              nodes on a sheet that sit OUTSIDE `.vb-slide-body`, so `--vb-zoom`
              never touches them and 10.5px printed 10.5px — 7.87pt, under the
              floor this file names, on every sheet of every brief. The body's
              own floor is enforced in app/globals.css, where the zoom is; the
              two nodes outside it are enforced here. */}
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{chrome.context}</span>
        </header>
      )}
      {hasNote && (
        <p className="vb-slide-note line-clamp-2 font-serif text-[12.5px] italic leading-[18px] text-secondary-foreground">{note}</p>
      )}
      <div className="vb-slide-body">
        {layout === 'grid' ? (
          <div className={cn('vb-print-grid', flow && 'vb-print-sheet')}>{children}</div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">{children}</div>
        )}
      </div>
      {/* THE PAGE NUMBER SITS ON THE FOOTER'S LAST LINE (SH23). It was
          `items-baseline`, which pins it to the FIRST line of whatever is
          beside it: on the populated leadership sheet, whose method note runs
          to three lines and 42px, "1 / 8" floated about 30px above the
          footer's bottom and read as a stray mark in the middle of the sheet.
          `items-end` puts it where a page number belongs. */}
      <footer className="flex shrink-0 items-end justify-between gap-4 border-t border-border/70 pt-1.5">
        <div className="min-w-0 flex-1">{chrome.footer}</div>
        {/* 11px, not 9.5px: under the sheet's .902 zoom a 9.5px numeral sets
            at about 6.4pt on a 297mm page, below the 8pt most print work holds
            to. Moves with `DeckFooter`, which sits on the same baseline. */}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{page} / {pages}</span>
      </footer>
    </section>
  )
}
