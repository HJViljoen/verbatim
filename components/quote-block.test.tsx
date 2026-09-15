import { describe, it, expect } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { QuoteBlock, translationNote, translationLabel, languageName, MACHINE_TRANSLATION_STAMP, type QuoteMode } from './quote-block'
import { Quotes } from './quotes'
import { Verbatim } from './shell/master-list'
import { Quote as EmailQuote } from './email/primitives'
import type { Quote } from '@/lib/renderables/types'

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
    expect(label).toBe(`Spanish · English below, ${MACHINE_TRANSLATION_STAMP}`)
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
