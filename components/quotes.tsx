import { QuoteBlock } from '@/components/quote-block'
// Verbatim voices — the hero of an evidence-led card. The quote is the subject;
// the claim beneath it is the annotation, not the headline (Redesign Spec §1:
// "in their own words"). Shared by Market, Competitive, and the Dashboard.
/** A stack of verbatims. Takes plain strings (what most callers have) or
 *  quotes carrying their reading, in which case the English rendering prints
 *  underneath the original — the order QuoteBlock owns (item 8, 2026-09-18).
 *
 *  A THIN NAME OVER QuoteBlock, not a second renderer. It used to lay out its
 *  own blockquote and re-word the translation label, which is the exact failure
 *  QuoteBlock's header argues against — and along the way it printed a voice in
 *  the sans face with no typographic quote marks, which DESIGN.md says a voice
 *  never is. All this component owns now is the spacing between quotes. */
export function Quotes({ items }: { items: (string | QuoteItem)[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((q, i) => (
        <QuoteBlock key={i} quote={typeof q === 'string' ? { text: q } : q} />
      ))}
    </div>
  )
}

export interface QuoteItem { text: string; lang?: string | null; english?: string | null }
