import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import type { Quote } from '@/lib/renderables/types'

// ONE quote renderer, in the three places a quote is rendered (Phase 1 WP6,
// design item 8, decision A, 2026-09-18).
//
// Before this there were fourteen: a blockquote here, an inline <p> there, a
// table-layout cell in the email, each printing `q.text` and nothing else. That
// was survivable while a quote WAS its text. It stopped being survivable the
// moment a quote acquired a language and an English rendering, because the
// order of the two — original first, always — is a promise the product makes
// ("in their own words"), and a promise kept in fourteen places is a promise
// kept in thirteen.
//
// THE ORDER IS THE RULE. The original leads, at full size, in the house serif.
// The English sits underneath it, smaller and quieter, labelled. Never the
// other way round and never instead: a machine translation is what we think
// they said, and the words above it are what they actually wrote. A reader who
// speaks the language can see immediately whether we got it right, and that is
// the only check this feature has.
//
// `mode` IS the shared RenderMode since WP10 (lib/blocks/types.ts): this
// component predated the Block contract deliberately — the reading has to
// exist before the blocks that show it do — and `QuoteMode` is now an alias of
// it, so a block can hand its own mode straight through. The email arm is
// table-based and inline-styled because that is the only thing an email client
// renders reliably — it is the constraint every email primitive in this repo
// is built under, not a stylistic choice.
//
// ONE OTHER FILE STILL DRAWS A QUOTE, and it draws it in table markup:
// components/email/primitives.tsx `Quote`, which is built on the email theme
// constants this file deliberately does not import. It delegates the WORDS —
// translationNote for what to say, translationLabel for how to say it — and
// keeps only the markup. That split is the rule for any future renderer: a
// surface may own its own layout, and no surface owns the sentence. Writing the
// label out again is the fourteen-places failure in miniature.

export type QuoteMode = RenderMode

/** The words a quote carries, plus the provenance a surface can hang on it.
 *  `platform`, `dateISO` and `url` are optional and mostly absent today: the
 *  design asks for "original · English · platform · date · link" and only the
 *  first two are carried through the freeze/resolve spine. A surface that has
 *  the rest passes them; nothing invents them. */
export interface QuoteBlockProps {
  quote: Pick<Quote, 'text'> & Partial<Pick<Quote, 'lang' | 'english'>>
  mode?: QuoteMode
  /** Who said it, where — rendered as the attribution line. */
  cite?: ReactNode
}

/** 'es' → 'Spanish'. Falls back to the code itself, which is honest: a label
 *  nobody recognises beats a language we have guessed the name of. */
export function languageName(lang: string | null | undefined): string | null {
  if (!lang) return null
  const code = lang.trim()
  if (!code || code.toLowerCase() === 'und') return null
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' })
    return names.of(code) ?? code
  } catch {
    return code
  }
}

const isEnglish = (lang: string | null | undefined): boolean => {
  if (!lang) return false
  const l = lang.trim().toLowerCase()
  return l === 'en' || l === 'english' || /^en[-_]/.test(l)
}

/** What the reader is told about this quote's language, or nothing.
 *
 *  Nothing for an English quote and nothing for one the cache has not read —
 *  an unread quote is not "English", and saying nothing is the only honest
 *  thing to say about a language nobody has determined. Pure, so the copy is
 *  testable without a render. */
export function translationNote(q: { lang?: string | null; english?: string | null }): {
  language: string | null
  english: string | null
} {
  const language = languageName(q.lang)
  if (!language || isEnglish(q.lang)) return { language: null, english: null }
  const english = q.english?.trim() || null
  return { language, english }
}

/** The stamp. One sentence, no jargon, and it says WHO translated it. */
export const MACHINE_TRANSLATION_STAMP = 'machine translation'

/** The line under a quote that names its language and says where the English
 *  came from, or null where there is nothing to say.
 *
 *  A FUNCTION rather than three copies of a template literal, for the reason
 *  this file exists at all: the header argues that a promise kept in fourteen
 *  places is kept in thirteen, and the same is true of a sentence. Three
 *  renderers print this line — QuoteBlock itself, `Quotes` (which lays out its
 *  own stack) and the email primitive `Quote` (which is built on its own theme
 *  constants and cannot delegate the markup) — and they must not be free to
 *  word it differently. They delegate the WORDS; the markup stays theirs. */
export function translationLabel(note: { language: string | null; english: string | null }): string | null {
  if (!note.language) return null
  // NOT "English below". Every arm renders quote, then the English, then this
  // label — the app, print and email blocks here and the email primitive — so a
  // reader met the English first and then a line pointing to it as being below.
  // The label's job is to say the rendering is a machine's, and it says that
  // without pointing anywhere.
  return note.english
    ? `${note.language} · ${MACHINE_TRANSLATION_STAMP}`
    : `${note.language} · no English rendering yet`
}

export function QuoteBlock({ quote, mode = 'app', cite }: QuoteBlockProps): ReactNode {
  const note = translationNote(quote)
  const { english } = note
  const label = translationLabel(note)

  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody>
          <tr>
            <td width={2} style={{ background: '#e5e2dc', fontSize: 1 }}>&nbsp;</td>
            <td style={{ padding: '2px 0 2px 10px' }}>
              <div data-copy="quote" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, fontStyle: 'italic', lineHeight: '1.45', color: '#1c1b19' }}>“{quote.text}”</div>
              {english && (
                <div data-copy="quote" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13, lineHeight: '1.45', color: '#55524c', marginTop: 4 }}>{english}</div>
              )}
              {label && (
                <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 10.5, color: '#8a867e', marginTop: 3 }}>{label}</div>
              )}
              {cite ? <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11, color: '#8a867e', marginTop: 3 }}>{cite}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }

  const big = mode === 'print'
  return (
    <blockquote className={big ? 'max-w-[66ch] rounded-lg bg-inner px-5 py-3.5' : 'border-l-2 border-border pl-3'}>
      {/* THE SPEAKER'S WORDS, MARKED AS THEIRS. See the `quote` kind in
          lib/test/copy-contract.ts: rule (c) is about what the PRODUCT claims,
          and a customer who writes "I'm a double below knee" is not claiming a
          movement. `directionHits` has skipped quoted spans since WP0 for the
          same reason; a rendered quote needed the marker to say so. */}
      <p data-copy="quote" className={big ? 'font-serif text-[15px] italic leading-[1.5] text-secondary-foreground' : 'font-serif text-[13.5px] leading-[1.45] text-foreground'}>“{quote.text}”</p>
      {english && (
        <p data-copy="quote" className={big ? 'mt-2 max-w-[66ch] font-serif text-[13.5px] leading-[1.5] text-muted-foreground' : 'mt-1.5 font-serif text-[12.5px] leading-[1.45] text-muted-foreground'}>{english}</p>
      )}
      {label && <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">{label}</p>}
      {cite && <footer className="mt-1 font-mono text-[10.5px] text-muted-foreground">{cite}</footer>}
    </blockquote>
  )
}
