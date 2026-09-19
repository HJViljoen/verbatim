import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
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
  // NOT "English below", AND IT NO LONGER NEEDS TO POINT ANYWHERE. Every arm
  // now renders quote, LABEL, English (the app, print and email blocks here
  // and the email primitive), which is the artboards' own order: the label
  // introduces the rendering it names instead of trailing it. It used to sit
  // under the English, so a reader met a machine translation first and was
  // told what it was afterwards — and "English below" would then have pointed
  // upwards. The label's job is to say the rendering is a machine's.
  return note.english
    ? `${note.language} · ${MACHINE_TRANSLATION_STAMP}`
    : `${note.language} · no English rendering yet`
}

export function QuoteBlock({ quote, mode = 'app', cite }: QuoteBlockProps): ReactNode {
  const note = translationNote(quote)
  const { english } = note
  const label = translationLabel(note)

  if (mode === 'email') {
    // THE EMAIL'S PALETTE IS `lib/email/theme.ts`, AND THIS ARM WAS NOT ON IT
    // (Block D wave 1, P0 item 5). It carried literal Georgia, `ui-monospace`
    // and a warm-grey ramp — `#e5e2dc` rule, `#1c1b19` ink, `#55524c`,
    // `#8a867e` — from the cream identity MASTER rule 3 retired. Nothing else
    // in any email uses those values, so every quote in every email was
    // painted a different grey from the mail around it, in a different face,
    // and no drift guard could see it because the hexes were written out here
    // rather than looked up. The four constants are the same ones
    // `components/email/primitives.tsx` `Quote` has used since Stage 3; the
    // two email quote renderers now resolve to identical pixels, which is what
    // "one quote renderer" was always supposed to mean.
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody>
          <tr>
            <td width={2} style={{ background: EMAIL.border, fontSize: 1 }}>&nbsp;</td>
            <td style={{ padding: '2px 0 2px 10px' }}>
              <div data-copy="quote" style={{ fontFamily: FONT.serif, fontSize: 14, fontStyle: 'italic', lineHeight: '1.45', color: EMAIL.ink }}>“{quote.text}”</div>
              {label && (
                <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint, marginTop: 3 }}>{label}</div>
              )}
              {english && (
                <div data-copy="quote" style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: '1.45', color: EMAIL.muted, marginTop: 4 }}>{english}</div>
              )}
              {cite ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.faint, marginTop: 3 }}>{cite}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }

  // THE IN-APP RULE IS GREEN-TINTED, AND THE WORDS LEAN (P0 item 5). On screen
  // this was a grey rule and an upright serif; the artboards draw every in-app
  // quote behind `rgba(14,138,95,.3)` — DESIGN.md's own green tint, "Highlight
  // in quotes, the 'you' tile, supported claims", so it is not a fifth job for
  // the green — with the words italic at 14px/1.375 in ink at 85%.
  //
  // THE FACE STAYS SERIF, and that is a deliberate departure from the mock's
  // §3.15, which asks for sans italic here. It contradicts its own §1 four
  // pages earlier ("verbatim quotes ONLY — quotes are speech"), the MASTER.md
  // §Visual identity canon its §0 says to obey, and DESIGN.md ("Anything a
  // person said is set in the voice face"). The mock's WORDS win by Heinrich's
  // ruling; this is not a word, it is the one typographic distinction the
  // product makes between what we say and what a person said, and the mock
  // asks for it in two voices. Everything else in §3.15 is adopted.
  const big = mode === 'print'
  return (
    <blockquote className={big ? 'max-w-[66ch] rounded-lg bg-inner px-5 py-3.5' : 'border-l-2 border-primary/30 pl-3'}>
      {/* THE SPEAKER'S WORDS, MARKED AS THEIRS. See the `quote` kind in
          lib/test/copy-contract.ts: rule (c) is about what the PRODUCT claims,
          and a customer who writes "I'm a double below knee" is not claiming a
          movement. `directionHits` has skipped quoted spans since WP0 for the
          same reason; a rendered quote needed the marker to say so. */}
      <p data-copy="quote" className={big ? 'font-serif text-[15px] italic leading-[1.5] text-secondary-foreground' : 'font-serif text-[14px] italic leading-[1.375] text-foreground/85'}>“{quote.text}”</p>
      {/* THE LABEL INTRODUCES THE ENGLISH, AS A PILL (Block D wave 3, SB8).
          The artboards set "German · machine-translated" as a filled pill
          BETWEEN the original and the rendering; the build set it as a bare
          mono line UNDER the rendering, so a reader met a machine translation
          before being told it was one, and the one piece of provenance on the
          quote was the quietest thing in it. A pill is also what stops the
          label reading as a third line of the quotation. */}
      {label && (
        <p className="m-0 mt-1.5">
          <span className="inline-block rounded-full bg-inner px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">{label}</span>
        </p>
      )}
      {english && (
        <p data-copy="quote" className={big ? 'mt-2 max-w-[66ch] font-serif text-[13.5px] leading-[1.5] text-muted-foreground' : 'mt-1.5 font-serif text-[12.5px] leading-[1.375] text-muted-foreground'}>{english}</p>
      )}
      {cite && <footer className="mt-1 font-mono text-[10.5px] text-muted-foreground">{cite}</footer>}
    </blockquote>
  )
}
