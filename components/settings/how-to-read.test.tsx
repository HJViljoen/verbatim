import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { GLOSSARY, READER_FLAGS, THIRTEEN_WORDS } from '@/lib/calibration'
import { SURFACES } from '@/lib/nav'
import { DEFINITIONS, READING_CARDS } from '@/lib/settings/how-to-read'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'

import { Definitions, HowToReadBody, PageCards, ROW_MARKS, ReadingPath, ReadingWords } from './how-to-read'

// Settings › How to read, drawn (WP3.10): the 25 Sep rulings applied to the
// guide itself, and the market-first words.

const markup = render(<HowToReadBody />)
const text = renderText(<HowToReadBody />)

/** Each page card's markup, by its anchor. */
function cardMarkup(key: string): string {
  const html = render(<PageCards />)
  const start = html.indexOf(`id="${key}"`)
  const end = html.indexOf('</section>', start)
  return html.slice(start, end)
}

describe('How to read, the page cards', () => {
  it('draws one card per sidebar page, in the sidebar’s order, each under its anchor', () => {
    const order = [...markup.matchAll(/<section id="([a-z]+)" data-search=/g)].map((m) => m[1])
    expect(order).toEqual(SURFACES.map((s) => s.key))
  })

  it('heads each card with its title alone; the link to the page is in the card’s foot, by its current label (25 Sep rulings, §4.0)', () => {
    for (const s of SURFACES) {
      const html = cardMarkup(s.key)
      const header = html.slice(0, html.indexOf('</h3>'))
      expect(header, s.key).not.toContain('<a ')
      const footer = html.slice(html.indexOf('<footer'))
      expect(footer.replace(/<[^>]+>/g, '').trim(), s.key).toBe(`Open ${s.label} →`)
      expect(footer, s.key).toContain(`href="${s.href}"`)
    }
  })

  it('prints §2.1’s question under the title, where the page has one', () => {
    for (const s of SURFACES) if (s.question) expect(text).toContain(s.question)
  })

  it('prints every card’s words, and what each cannot tell you', () => {
    for (const c of READING_CARDS) {
      expect(text).toContain(c.tells)
      for (const line of c.cannot) expect(text).toContain(line.replace(/\s+/g, ' '))
    }
  })
})

describe('How to read, the words and the definitions', () => {
  it('no longer calls fifteen words "the thirteen"', () => {
    expect(THIRTEEN_WORDS.length).toBe(15)
    expect(text).not.toMatch(/thirteen words/i)
    expect(text).toContain('The words every page uses')
  })

  it('lists every reading word, the two flags and the two marks a theme can carry (decision F)', () => {
    const words = render(<ReadingWords />)
    for (const k of [...THIRTEEN_WORDS, ...READER_FLAGS, ...ROW_MARKS]) expect(words).toContain(GLOSSARY[k][0])
    expect(renderText(<ReadingWords />)).toContain('Two marks a theme can carry')
  })

  it('draws every definition under its stable anchor', () => {
    for (const d of DEFINITIONS) expect(markup).toContain(`id="${d.id}"`)
  })
})

describe('How to read, copy', () => {
  it('keeps the copy contract on its own words, with no em dash and no "how sound"', () => {
    // The glossary card is exempt from the direction rule by what it is: it
    // DEFINES "Growing · fading · flat" and "Gone quiet" (lib/calibration.ts,
    // unchanged here). Everything this package wrote is held to it.
    // A card's "How to read it" list is the glossary's own lines too (a
    // rival's line "never falling to zero" defines a break), so the cards are
    // held to the contract without their glossary lists.
    assertCopyContract(render(<PageCards />).replace(/<dl\b[\s\S]*?<\/dl>/g, ''))
    assertCopyContract(<Definitions />)
    assertCopyContract(<ReadingPath />)
    expect(text).not.toContain('—')
    expect(text.toLowerCase()).not.toContain('how sound')
  })

  it('carries no meta beside the pane title, and passes the one-line bar (the route)', () => {
    const route = readFileSync(join(__dirname, '..', '..', 'app', 'dashboard', 'settings', 'how-to-read', 'page.tsx'), 'utf8')
    expect(route).not.toContain('contentMeta')
    expect(route).toMatch(/bar=\{bar\}/)
    expect(route).toContain('settingsBar(')
  })
})
