import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { QuoteBlock } from '@/components/quote-block'
import { EMAIL, FONT } from '@/lib/email/theme'
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
 *
 * AND `null` IS THE SAME EVENT. `resolveQuotes` drops an unresolvable quote
 * from an array but NULLS one that is a field of a wrapper, so a caller that
 * kept the wrapper hands this a `quote` of null — on exactly the event the ref
 * spine exists for. It reads as the erasure it is, rather than throwing inside
 * a share-link render.
 */
export function BlockQuote({
  quote, cite, mode = 'app', gone = 'counted, not quotable: this comment has since been removed',
}: {
  quote: (Pick<Quote, 'text'> & Partial<Pick<Quote, 'lang' | 'english'>>) | null
  cite?: ReactNode
  mode?: RenderMode
  /** What to say when the words did not resolve. */
  gone?: string
}) {
  if (!quote || !quote.text.trim()) {
    return mode === 'email'
      // THE THEME'S OWN MONO AND THE THEME'S OWN GREY (the fix pass,
      // E-monthly review [Nit]). This cell kept `#8a867e` — a hex from the
      // retired cream identity, on `components/quote-block.test.tsx`'s dead
      // colour list, and 3.63:1 — and a mono stack of its own, so an erased
      // quote rendered in a different typeface from everything around it.
      // Wave 1 repainted `QuoteBlock` onto the real theme and this arm was
      // missed.
      ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{gone}</div>
      : <p className="m-0 font-mono text-[10.5px] text-muted-foreground">{gone}</p>
  }
  return <QuoteBlock quote={quote} cite={cite} mode={mode} />
}

/** Several quotes, in order. The block decides how many; this decides nothing
 *  except that they are stacked — or, where the caller says so, laid across the
 *  page.
 *
 *  `columns` IS THE ARTBOARD'S OWN LAYOUT, NOT A DENSITY KNOB (Block D wave 2,
 *  E-voice). Voice's theme sets six voices in three columns, because six
 *  stacked quotes push the evidence a screen and a half below the figure they
 *  are evidence for. It collapses to one column under `xl`, for the reason
 *  `TileColumns` does: a 14px italic in a third of a phone is a column of
 *  syllables, not a quote. The email arm ignores it — Outlook lays out with
 *  Word — and stacks, which is what an email quote has always done. */
export function BlockQuotes({
  quotes, mode = 'app', columns = 1,
}: {
  quotes: readonly { quote: (Pick<Quote, 'text'> & Partial<Pick<Quote, 'lang' | 'english'>>) | null; cite?: ReactNode }[]
  mode?: RenderMode
  columns?: 1 | 2 | 3
}) {
  if (!quotes.length) return null
  if (mode === 'email') {
    return <div>{quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}</div>
  }
  // Written out in full, never interpolated, so Tailwind v4's scanner sees
  // them (the rule the tile span maps follow).
  const across = columns === 3
    ? 'grid min-w-0 grid-cols-1 gap-x-6 gap-y-3.5 xl:grid-cols-3'
    : columns === 2
      ? 'grid min-w-0 grid-cols-1 gap-x-6 gap-y-3.5 xl:grid-cols-2'
      : 'flex min-w-0 flex-col gap-3'
  return (
    <div className={across}>
      {quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}
