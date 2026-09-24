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

// ── the 8pt floor (Block D wave 3b, `decks`; `reports`-14, `sales`-1) ────────
//
// This file names a floor of 8pt and, until this wave, applied it to one glyph.
// 1123px IS 297mm, so a point on a brief sheet is 1123 / (297/25.4 × 72) px and
// 8pt is 10.67px. Two things follow, and both are asserted rather than
// commented: the nodes INSIDE `.vb-slide-body` are zoomed by `--vb-zoom`, so
// the floor there is a CSS rule that lifts the app's small tiers; the two nodes
// OUTSIDE it — this header's context and the footer's page number — are not
// zoomed, so they carry their own size and it has to clear the floor on its own.
describe('the 8pt print floor', () => {
  const PT = 1123 / ((297 / 25.4) * 72)
  const zoom = Number(CSS.match(/--vb-zoom:\s*([0-9.]+)/)![1])

  it('lifts every app tier under the floor, inside the body where the zoom is', () => {
    const rule = CSS.match(/((?:\.vb-slide:not\(\[data-type-floor\]\) \.vb-slide-body \.text-\\\[[0-9.\\]+px\\\]:not\(svg \*\),?\s*)+)\{\s*font-size:\s*([0-9.]+)px/)
    expect(rule).not.toBeNull()
    const lifted = Number(rule![2])
    // The tier it lifts TO clears the floor, and it is a tier the app already
    // has rather than a size invented for paper.
    expect((lifted * zoom) / PT).toBeGreaterThanOrEqual(8)
    // Every tier the app uses below that is named. A tier left out is a node
    // that silently keeps printing at 6–7pt.
    const named = [...rule![1].matchAll(/text-\\\[([0-9.\\]+)px\\\]/g)].map((m) => Number(m[1].replace(/\\/g, '')))
    for (const tier of [9, 9.5, 10, 10.5, 11, 11.5]) {
      expect((tier * zoom) / PT).toBeLessThan(8)
      expect(named).toContain(tier)
    }
  })

  it('leaves the chart type to the chart, and says so', () => {
    // A font-size inside a `CalendarLine` is in VIEWBOX UNITS, so rewriting it
    // would resize the drawing rather than the type; `--cal-p` is that half and
    // lib/charts/calendar.test.ts pins it. The rule must therefore EXCLUDE svg.
    expect(CSS).toContain(':not(svg *)')
  })

  // ── the one exception, and which way round it is ──────────────────────────
  //
  // The rule reaches every `.vb-slide-body`, which is five artefacts and not
  // the two it was measured on. Measured on all five (`scripts/deck-fit.ts`),
  // the quarterly review went from one clipping sheet to three — so the floor
  // stays DEFAULT-ON and that deck declares its deferral in code. A carve-out
  // that reads `:not(.something)` is one word away from being an opt-out
  // nobody can find, so both halves are pinned here: the default is inside the
  // floor, and the exception has to be written by the artefact that takes it.
  it('is default-on: a sheet that declares nothing is inside the floor', () => {
    const markup = render(slide())
    expect(markup).not.toContain('data-type-floor')
    // The selector is a NEGATION, so a new artefact is covered without doing
    // anything. If this ever becomes a positive class, every deck written
    // afterwards prints at 6.8pt until someone remembers.
    expect(CSS).toContain('.vb-slide:not([data-type-floor]) .vb-slide-body')
  })

  it('lets one artefact defer it, out loud and in its own markup', () => {
    const markup = render(slide({ floor: 'deferred' }))
    expect(markup).toContain('data-type-floor="deferred"')
  })

  it('clears the floor on the two nodes the zoom never reaches', () => {
    const markup = render(slide())
    // The header's context and the footer's page number, both 11px unzoomed.
    expect((11 * 1) / PT).toBeGreaterThanOrEqual(8)
    expect(markup).toContain('font-mono text-[11px] text-muted-foreground">Sealand · 28 Sep 2026')
    expect(markup).toContain('font-mono text-[11px] text-muted-foreground">3 / 8')
  })
})
