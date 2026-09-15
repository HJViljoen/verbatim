import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { QuoteBlock } from '@/components/quote-block'
import type { Quote } from '@/lib/renderables/types'

// Quotes, in three modes (Phase 1 WP10). See components/blocks/frame.tsx.

/**
 * One quote.
 *
 * A PASS-THROUGH ON PURPOSE. `components/quote-block.tsx` already renders all
 * three modes and already owns the rule that matters — the original leads, the
 * English sits under it, labelled, never instead — and WP6's header says so at
 * length. A second implementation here would be the fifteenth quote renderer,
 * which is the failure that file exists to end. What this adds is the block
 * layer's `RenderMode` (now the same type) and the words `text: ''` is allowed
 * to mean.
 *
 * A FROZEN QUOTE HAS NO WORDS. `report_snapshots.data` keeps the ref and empties
 * the text (lib/renderables/quotes-freeze.ts), and the words are resolved at
 * render — which is also what makes an erasure reach a stored artefact. A quote
 * whose text is still empty at render is one whose voice is gone, and it says
 * so rather than printing an empty pair of quotation marks.
 */
export function BlockQuote({
  quote, cite, mode = 'app', gone = 'counted, not quotable — this comment has since been removed',
}: {
  quote: Pick<Quote, 'text'> & Partial<Pick<Quote, 'lang' | 'english'>>
  cite?: ReactNode
  mode?: RenderMode
  /** What to say when the words did not resolve. */
  gone?: string
}) {
  if (!quote.text.trim()) {
    return mode === 'email'
      ? <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11, color: '#8a867e' }}>{gone}</div>
      : <p className="m-0 font-mono text-[10.5px] text-muted-foreground">{gone}</p>
  }
  return <QuoteBlock quote={quote} cite={cite} mode={mode} />
}

/** Several quotes, in order. The block decides how many; this decides nothing
 *  except that they are stacked and separated. */
export function BlockQuotes({
  quotes, mode = 'app',
}: {
  quotes: readonly { quote: Pick<Quote, 'text'> & Partial<Pick<Quote, 'lang' | 'english'>>; cite?: ReactNode }[]
  mode?: RenderMode
}) {
  if (!quotes.length) return null
  if (mode === 'email') {
    return <div>{quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}</div>
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}
