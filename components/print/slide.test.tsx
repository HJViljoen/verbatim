import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { Slide } from './slide'
import { render } from '@/lib/test/render'
import { DIRECTION_WORDS } from '@/lib/calibration'

// The slide's chrome (Block D wave 3, SH3 and SH23). The render tier: what the
// sheet PRINTS, plus the two facts about it that live in app/globals.css and
// can only be asserted by reading that file.

const slide = (extra: Partial<Parameters<typeof Slide>[0]> = {}) =>
  Slide({
    title: 'Where the category is going',
    chrome: { context: 'Sealand · 28 Sep 2026', footer: <p>Read from 1,388 videos.</p> },
    page: 3,
    pages: 8,
    children: <p>body</p>,
    ...extra,
  })

const CSS = readFileSync('app/globals.css', 'utf8')

describe('Slide', () => {
  it('marks a clipped sheet on the EXPORT path, not only in the Studio editor', () => {
    // `.vb-slide-body` is overflow:hidden over a fixed box and only the
    // editor ever measured it, so the PDF, the in-app viewer and /r/<token>
    // shipped the loss with no signal at all.
    const markup = render(slide())
    expect(markup).toContain('data-overflow')
    expect(markup).toContain('scrollHeight')
    // Emitted by every sheet and run once: page 1 of a brief is a CoverSlide
    // and never reaches this component.
    expect(markup).toContain('__vbSlideMeasure')
  })

  it('keeps the measurement free of every word the copy contract polices', () => {
    const script = render(slide()).match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
    expect(script.length).toBeGreaterThan(0)
    for (const w of DIRECTION_WORDS) expect(script.toLowerCase()).not.toContain(w)
  })

  it('clamps its title and its framing note to two lines instead of cutting one short (SH23)', () => {
    const markup = render(slide({ note: 'A framing note the operator wrote in Report Studio, long enough to run past one line of a 297mm sheet.' }))
    expect(markup).not.toContain('truncate')
    expect(markup.match(/line-clamp-2/g) ?? []).toHaveLength(2)
  })

  it('puts the page number on the footer\'s LAST line, not its first', () => {
    // It was `items-baseline`, so on the populated leadership sheet — whose
    // method note runs to three lines and 42px — "1 / 8" floated about 30px
    // above the footer's bottom and read as a stray.
    const footer = render(slide()).match(/<footer[^>]*>/)?.[0] ?? ''
    expect(footer).toContain('items-end')
    expect(footer).not.toContain('items-baseline')
  })

  it('budgets the body off the MEASURED footer rather than a literal 30px', () => {
    // The footer is a method note whose coverage line wraps — 51px on the
    // populated leadership sheet against the 30px the height formula reserved.
    const body = CSS.slice(CSS.indexOf('.vb-slide-body {'), CSS.indexOf('.vb-print-grid {'))
    expect(body).toContain('flex: 1 1 0')
    expect(body).not.toContain('30px')
    // The framing note's own subtraction went with it: flex measures that too.
    expect(CSS).not.toContain('.vb-slide[data-note] .vb-slide-body')
  })
})
