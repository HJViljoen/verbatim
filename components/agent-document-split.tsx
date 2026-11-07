'use client'

import { useRef, useState } from 'react'
import { AgentDocumentView } from '@/components/agent-document'
import { CARD_FRAME, SEG, SEG_ITEM, SEG_ON } from '@/components/v2/look'
import { cn } from '@/lib/utils'
import type { ClaimResult } from '@/lib/ask/types'
import type { Segment } from '@/lib/ask/anchor'
import type { QuoteItem } from '@/components/quotes'

// The check on the left, their document on the right — the artifact-panel
// shape, and Heinrich's idea. It resolves the thing that made "notes inside the
// document" hard: because the document renders in OUR panel, the annotation is
// just markup. No PDF coordinates, no need to store their file, and the privacy
// position (we keep what we read, never the document itself) survives untouched.
//
// Nothing is written back. The right-hand tile is a rendering of the text we
// extracted, with shading laid over it — their document is not edited and
// never leaves their machine in the first place.
//
// SINCE THE AUDIT DESIGN (7 Nov, Agent-Thread.dc.html): two sibling tiles
// that flow with the page ("The check, claim by claim" and "Your document"),
// not two panes scrolling on their own inside one; below lg the two are
// tabs on the kit's segmented control. The shading is plain spans (small
// call 15): supported claims the pale yellow, contradicted the caution's
// pale orange, as the tile's own line says. Styles from `look.ts` (this is a
// client file).
//
// SILENT CLAIMS ARE NOT SHADED. Same rule as the list: silence is clean space.
// It also makes the shading mean something — every shaded passage is one the
// conversation actually speaks to, so a document with three of them has three
// places worth looking, not nine of which six say "nothing here".

/** The document tile's line: what the shading means (the board's words). */
export const SHADING_LINE = 'Contradicted claims are shaded orange and supported claims yellow. Untested claims are left plain.'

export function AgentDocumentSplit({
  claims,
  quotesByClaim,
  segments,
  anchored,
  notice,
}: {
  claims: ClaimResult[]
  quotesByClaim: Map<string, (string | QuoteItem)[]>
  segments: Segment[]
  anchored: string[]
  notice: string | null
}) {
  const [active, setActive] = useState<string | null>(null)
  const [pane, setPane] = useState<'check' | 'document'>('check')
  const docRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const anchoredSet = new Set(anchored)

  function focusClaim(ref: string, from: 'list' | 'document') {
    setActive(ref)
    const target = (from === 'list' ? docRef : listRef).current?.querySelector(
      `[data-ref="${CSS.escape(ref)}"]`,
    )
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // On a narrow screen the two tiles are tabs, so following a shading means
    // switching to the tile that holds the thing you asked to see.
    if (window.innerWidth < 1024) setPane(from === 'list' ? 'document' : 'check')
  }

  const shade: Record<string, string> = {
    echoes: 'bg-accent hover:bg-accent/70',
    contradicts: 'bg-caution-soft hover:bg-caution-soft/70',
  }
  const verdictOf = new Map(claims.map((c) => [c.ref, c.verdict]))

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs below lg, where two columns would each be too narrow to read. */}
      <div role="group" aria-label="Show" className={cn(SEG, 'self-start lg:hidden')}>
        {(['check', 'document'] as const).map((p) => (
          <button key={p} type="button" aria-pressed={pane === p} onClick={() => setPane(p)} className={cn(SEG_ITEM, pane === p && SEG_ON)}>
            {p === 'check' ? 'The check' : 'Your document'}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
        <section aria-labelledby="plan-check-title" className={cn(CARD_FRAME, 'gap-3.5', pane === 'check' ? null : 'max-lg:hidden')}>
          <h2 id="plan-check-title" className="m-0 mb-1 text-[21px] font-semibold leading-[1.3] text-foreground">The check, claim by claim</h2>
          <div ref={listRef}>
            <AgentDocumentView
              claims={claims}
              quotesByClaim={quotesByClaim}
              activeRef={active}
              anchored={anchoredSet}
              onSelect={(ref) => focusClaim(ref, 'list')}
            />
          </div>
        </section>

        <section aria-labelledby="plan-doc-title" className={cn(CARD_FRAME, 'gap-1', pane === 'document' ? null : 'max-lg:hidden')}>
          <h2 id="plan-doc-title" className="m-0 text-[21px] font-semibold leading-[1.3] text-foreground">Your document</h2>
          <p className="m-0 mt-1.5 mb-3 text-[14px] leading-[1.55] text-secondary-foreground">{SHADING_LINE}</p>
          {notice && <p className="m-0 mb-3 text-[13.5px] leading-[1.5] text-muted-foreground">{notice}</p>}
          {/* whitespace-pre-wrap: the extracted text carries the document's own
              line and paragraph breaks, and they are the only structure that
              survived extraction. Losing them would turn a brief into a wall. */}
          <div ref={docRef} className="whitespace-pre-wrap border-t border-track pt-[18px] text-[15px] leading-[1.7] text-foreground">
            {segments.map((seg, i) =>
              seg.ref && shade[verdictOf.get(seg.ref) ?? ''] ? (
                <span
                  key={i}
                  data-ref={seg.ref}
                  data-shade={verdictOf.get(seg.ref)}
                  onClick={() => focusClaim(seg.ref!, 'document')}
                  className={cn(
                    'cursor-pointer rounded-[3px] px-0.5 text-foreground transition-colors [box-decoration-break:clone]',
                    shade[verdictOf.get(seg.ref) ?? ''],
                    active === seg.ref ? 'ring-2 ring-foreground/30' : null,
                  )}
                >
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
