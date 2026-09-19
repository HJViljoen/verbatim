import { describe, it, expect } from 'vitest'
import { render, renderText, decodeEntities } from '@/lib/test/render'
import { QuoteBlock, translationNote, translationLabel, languageName, MACHINE_TRANSLATION_STAMP, type QuoteMode } from './quote-block'
import { Quotes } from './quotes'
import { Verbatim } from './shell/master-list'
import { Quote as EmailQuote } from './email/primitives'
import type { Quote } from '@/lib/renderables/types'
import { EMAIL, FONT } from '@/lib/email/theme'

// Item 8's promise, asserted as markup: the original leads, the English sits
// under it, and the stamp says who did the translating. In all three modes,
// because a promise kept in two of them is not kept.

const es = {
  text: 'Me encanta esta pierna, cambió mi vida por completo',
  lang: 'es',
  english: 'I love this leg, it changed my life completely',
}
const MODES: QuoteMode[] = ['app', 'print', 'email']

describe('languageName', () => {
  it('names the language a reader would recognise', () => {
    expect(languageName('es')).toBe('Spanish')
    expect(languageName('pt-BR')).toBe('Brazilian Portuguese')
  })

  it('says nothing for an undetermined language, and keeps an unknown code as itself', () => {
    expect(languageName('und')).toBeNull()
    expect(languageName(null)).toBeNull()
    expect(languageName('')).toBeNull()
    expect(languageName('qqq')).toBe('qqq')
  })
})

describe('translationNote', () => {
  it('says nothing about an English quote', () => {
    expect(translationNote({ lang: 'en', english: null })).toEqual({ language: null, english: null })
    expect(translationNote({ lang: 'en-GB' })).toEqual({ language: null, english: null })
  })

  it('says nothing about a quote nothing has read — unread is not English', () => {
    expect(translationNote({})).toEqual({ language: null, english: null })
  })

  it('names the language, with or without a rendering to show', () => {
    expect(translationNote(es)).toEqual({ language: 'Spanish', english: es.english })
    expect(translationNote({ lang: 'es', english: null })).toEqual({ language: 'Spanish', english: null })
  })
})

describe.each(MODES)('QuoteBlock in %s mode', (mode) => {
  it('prints the original before the English', () => {
    const text = renderText(<QuoteBlock quote={es} mode={mode} />)
    expect(text).toContain(es.text)
    expect(text).toContain(es.english)
    expect(text.indexOf(es.text)).toBeLessThan(text.indexOf(es.english))
  })

  it('stamps it as a machine translation and names the language', () => {
    const text = renderText(<QuoteBlock quote={es} mode={mode} />)
    expect(text).toContain(MACHINE_TRANSLATION_STAMP)
    expect(text).toContain('Spanish')
  })

  it('says the rendering is missing rather than saying nothing', () => {
    const text = renderText(<QuoteBlock quote={{ text: es.text, lang: 'es', english: null }} mode={mode} />)
    expect(text).toContain('no English rendering yet')
    expect(text).not.toContain(MACHINE_TRANSLATION_STAMP)
  })

  it('adds nothing at all to an English quote', () => {
    const text = renderText(<QuoteBlock quote={{ text: 'the socket rubs after an hour', lang: 'en', english: null }} mode={mode} />)
    expect(text).not.toContain(MACHINE_TRANSLATION_STAMP)
    expect(text).not.toMatch(/English/)
  })

  it('adds nothing to a quote nothing has read, which is every quote before the backfill', () => {
    const text = renderText(<QuoteBlock quote={{ text: es.text }} mode={mode} />)
    expect(text).toContain(es.text)
    expect(text).not.toContain(MACHINE_TRANSLATION_STAMP)
    expect(text).not.toContain('Spanish')
  })

  it('renders the attribution the surface gave it', () => {
    expect(renderText(<QuoteBlock quote={es} mode={mode} cite="@a_creator · YouTube" />)).toContain('@a_creator · YouTube')
  })
})

describe('the email arm is an email', () => {
  it('lays out in a table with inline styles and no class attributes', () => {
    const html = render(<QuoteBlock quote={es} mode="email" />)
    expect(html).toContain('<table')
    expect(html).toContain('style=')
    expect(html).not.toContain('class=')
  })

  it('the app and print arms use classes, not inline colour', () => {
    for (const mode of ['app', 'print'] as const) {
      const html = render(<QuoteBlock quote={es} mode={mode} />)
      expect(html).toContain('<blockquote')
      expect(html).toContain('class=')
    }
  })
})

// P0 item 5. The email arm carried a warm-grey palette and literal Georgia
// from the cream identity MASTER rule 3 retired, so every quote in every email
// was a different grey, in a different face, from the mail around it — and no
// drift guard could see it, because the hexes were written out rather than
// looked up. This is the guard.
describe('the email arm is painted from lib/email/theme', () => {
  const html = render(<QuoteBlock quote={es} mode="email" cite="@a_creator · YouTube" />)

  it('carries no colour that is not a theme constant', () => {
    for (const dead of ['#e5e2dc', '#1c1b19', '#55524c', '#8a867e']) expect(html.toLowerCase()).not.toContain(dead)
    expect(html).toContain(EMAIL.border)
    expect(html).toContain(EMAIL.ink)
    expect(html).toContain(EMAIL.muted)
    // `EMAIL.faint` (#9AA0A6, 2.64:1) came off the cite and the translation
    // label in Block D wave 3 (SH10): a citation and a machine-translation
    // disclosure are apparatus, not decoration.
    expect(html).not.toContain(EMAIL.faint)
  })

  it('sets the speech in the theme serif and the metadata in the theme mono', () => {
    // React escapes the stacks' own apostrophes into the style attribute.
    const styles = decodeEntities(html)
    expect(styles).toContain(FONT.serif)
    expect(styles).toContain(FONT.mono)
    expect(styles).not.toContain('ui-monospace')
    // Georgia survives only as the theme serif's own web-safe fallback.
    expect(styles).not.toContain('Georgia, "Times New Roman", serif')
  })
})

// The in-app treatment the artboards draw (P0 item 5): a green-tinted rule,
// the words leaning, ink at 85%. The face stays serif — the mock's §3.15 asks
// for sans here and contradicts its own §1, MASTER.md and DESIGN.md, all three
// of which say a quote is speech and speech is the voice face.
describe('the in-app arm', () => {
  const html = render(<QuoteBlock quote={es} mode="app" />)

  it('rules the quote in the green tint, not in chrome grey', () => {
    expect(html).toContain('border-primary/30')
    expect(html).not.toContain('border-border')
  })

  it('leans the words, in the voice face, at the artboards\' size', () => {
    expect(html).toContain('font-serif')
    expect(html).toContain('italic')
    expect(html).toContain('text-[14px]')
    expect(html).toContain('leading-[1.375]')
  })

  it('leaves paper alone — a printed quote sits in a tinted block, not on a rule', () => {
    const paper = render(<QuoteBlock quote={es} mode="print" />)
    expect(paper).toContain('bg-inner')
    expect(paper).not.toContain('border-primary/30')
  })
})

describe('the adopters render the same promise', () => {
  it('Verbatim carries the reading through', () => {
    const text = renderText(<Verbatim quote={es.text} lang={es.lang} english={es.english} cite="@someone" />)
    expect(text.indexOf(es.text)).toBeLessThan(text.indexOf(es.english))
    expect(text).toContain(MACHINE_TRANSLATION_STAMP)
  })

  it('Verbatim with a bare string is unchanged', () => {
    const text = renderText(<Verbatim quote="the socket rubs after an hour" />)
    expect(text).toContain('the socket rubs after an hour')
    expect(text).not.toContain(MACHINE_TRANSLATION_STAMP)
  })

  it('Quotes takes plain strings and quotes that carry a reading, in one list', () => {
    const text = renderText(<Quotes items={['a plain English one that is long enough', es]} />)
    expect(text).toContain('a plain English one that is long enough')
    expect(text.indexOf(es.text)).toBeLessThan(text.indexOf(es.english))
    expect(text).toContain('Spanish')
  })

  it('Quotes renders nothing for an empty list', () => {
    expect(render(<Quotes items={[]} />)).toBe('')
  })

  // The sentence lives in ONE place. Three renderers print it — QuoteBlock,
  // the Quotes stack over it, and the email primitive with its own table
  // markup — and if any of them re-words it the app and the email that links
  // to it stop agreeing about what a reader is looking at.
  it('every renderer prints the same label, word for word', () => {
    const label = translationLabel(translationNote(es))!
    expect(label).toBe(`Spanish · ${MACHINE_TRANSLATION_STAMP}`)
    for (const mode of MODES) expect(renderText(<QuoteBlock quote={es} mode={mode} />)).toContain(label)
    expect(renderText(<Quotes items={[es]} />)).toContain(label)
    expect(renderText(<EmailQuote text={es.text} lang={es.lang} english={es.english} />)).toContain(label)
  })

  it('and the same one where there is no rendering yet', () => {
    const unread = { text: es.text, lang: 'es', english: null }
    const label = translationLabel(translationNote(unread))!
    expect(label).toBe('Spanish · no English rendering yet')
    expect(renderText(<Quotes items={[unread]} />)).toContain(label)
    expect(renderText(<EmailQuote text={unread.text} lang="es" english={null} />)).toContain(label)
  })

  // The dashboard hands its hero quotes over whole — renderable Quotes, `ref`
  // and all — rather than mapping them to `q.text`. That map was why the
  // EMAILED dashboard showed an English rendering the app dashboard did not.
  it('Quotes takes a renderable Quote whole, ref included', () => {
    const q: Quote = { ref: 'e:abc', ...es }
    const text = renderText(<Quotes items={[q]} />)
    expect(text.indexOf(es.text)).toBeLessThan(text.indexOf(es.english))
    expect(text).toContain(MACHINE_TRANSLATION_STAMP)
    expect(text).not.toContain('e:abc')
  })
})
