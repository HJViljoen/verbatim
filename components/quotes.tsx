import { translationNote, MACHINE_TRANSLATION_STAMP } from '@/components/quote-block'
// Verbatim voices — the hero of an evidence-led card. The quote is the subject;
// the claim beneath it is the annotation, not the headline (Redesign Spec §1:
// "in their own words"). Shared by Market, Competitive, and the Dashboard.
/** A stack of verbatims. Takes plain strings (what most callers have) or
 *  quotes carrying their reading, in which case the English rendering prints
 *  underneath the original — the order QuoteBlock owns (item 8, 2026-09-18). */
export function Quotes({ items }: { items: (string | QuoteItem)[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((q, i) => {
        const it: QuoteItem = typeof q === 'string' ? { text: q } : q
        const note = translationNote(it)
        return (
          <blockquote
            key={i}
            className="border-l-2 border-primary/30 pl-3 text-[15px] italic leading-snug text-foreground/85"
          >
            {it.text}
            {note.english && <span className="mt-1.5 block text-[13.5px] not-italic leading-snug text-muted-foreground">{note.english}</span>}
            {note.language && (
              <span className="mt-1 block font-mono text-[10.5px] not-italic text-muted-foreground">
                {note.english ? `${note.language} · English below, ${MACHINE_TRANSLATION_STAMP}` : `${note.language} · no English rendering yet`}
              </span>
            )}
          </blockquote>
        )
      })}
    </div>
  )
}

export interface QuoteItem { text: string; lang?: string | null; english?: string | null }
