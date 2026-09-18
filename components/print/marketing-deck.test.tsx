import { describe, expect, it } from 'vitest'

import { render, markupText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { documentCoverSheet, documentSlides } from '@/lib/reports/documents/compose'
import { documentViewerPages } from '@/lib/reports/viewer'
import { leadGap, leadVerdict, overviewTiles } from '@/lib/reports/documents/overview'
import { DocumentDeck, GapCard, methodRows, CALIBRATION_NOTE } from './document-deck'
import { marketingDeckFixture, refusedDeckFixture } from './fixture'

// The marketing brief, against its artboard (package E-marketing, wave 2).
//
// The render tier checks what a sheet PRINTS. Every assertion below names the
// artboard element it is about, and the ones that differ from the artboard
// name the ruling they differ under — because a port that quietly prints the
// honest form and says nothing is indistinguishable from a port that missed it.

const sheets = (data = marketingDeckFixture()) => documentSlides(data)

describe('the sheets', () => {
  it('cuts four grid sheets out of what used to be seven single ones', () => {
    const titles = sheets().map((s) => `${s.layout}:${s.title}`)
    expect(titles).toEqual([
      'single:In short',
      'grid:Your subjects',
      'grid:The month and the rivals',
      'grid:What changed this month',
      'single:A finding',
      'single:A finding',
      'grid:Your moves',
      'single:How this was read',
    ])
  })

  it('puts two borrowed blocks on one sheet, each at its own span', () => {
    const subjects = sheets().find((s) => s.title === 'Your subjects')!
    expect(subjects.keys).toEqual(['section:mk.subjects', 'section:mk.subjectline'])
    const moves = sheets().find((s) => s.title === 'Your moves')!
    expect(moves.keys).toEqual(['section:mk.moves', 'section:mk.ways'])
  })

  // `.vb-print-grid` and `Slide.layout: 'grid'` have been in the codebase since
  // the deck was written and no built page composed internal columns. `data-col`
  // is what `.vb-print [data-col="n"]` keys on.
  it('draws the grid sheets on the twelve-column print grid', () => {
    const html = render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />)
    expect(html).toContain('vb-print-grid')
    expect(html).toContain('data-col="12"')
    expect(html).toContain('data-col="7"')
    expect(html).toContain('data-col="5"')
  })

  // `mkt.p1.title`: the artboard opens on content with a page title and one
  // mono context line, not on a landscape sheet carrying a 58px title.
  it('folds the cover onto the In-short sheet, and both paginators agree', () => {
    const data = marketingDeckFixture()
    expect(documentCoverSheet(data)).toBe(false)
    expect(documentViewerPages(data)).toBe(sheets(data).length)
    const html = render(<DocumentDeck data={data} date="28 Sep 2026" />)
    expect(html).not.toContain('text-[58px]')
    expect(html).toContain('Marketing brief')
    expect(html).toContain('1 / 8')
  })

  // A sheet of two blocks where both refuse is still a sheet: five of the
  // borrowed blocks degrade to a sentence on production today.
  it('keeps its sheets when the month tables are not applied', () => {
    const data = refusedDeckFixture()
    expect(sheets(data).map((s) => s.title)).toEqual(sheets().map((s) => s.title))
    const html = render(<DocumentDeck data={data} date="28 Sep 2026" />)
    expect(html).toContain('not recorded')
  })
})

describe('the In-short sheet', () => {
  // `mkt.p1.stats`. `documentFigures` fills client_share_pct / positive_pct
  // only on the branch with NO reading, so a brief WITH one printed exactly one
  // tile — and its label said "read this update" over the month's comments.
  it('prints three tiles, and none of them says "this update"', () => {
    const tiles = overviewTiles(marketingDeckFixture())
    expect(tiles).toHaveLength(3)
    for (const t of tiles) expect(t.label).not.toContain('this update')
    expect(tiles[2].label).toContain('September 2026')
  })

  it('leads on the gap, then on the largest banded move', () => {
    const data = marketingDeckFixture()
    const gap = leadGap(data.reading?.gaps)
    expect(gap).not.toBeNull()
    expect(overviewTiles(data)[0].label).toContain(gap!.objectLabel)
    // A tile states a conclusion or nothing: `no_clear_change` is a real answer
    // on a row of a table and is not a headline.
    expect(leadVerdict(data.reading?.verdicts)?.state).toBe('moved')
  })

  // D2: a `Verdict` carries the change and the band together or neither, and a
  // refusal typeset at the artboard's 38px numeral scale reads as a measurement.
  it('sets a refusal as a sentence and never beside a magnitude', () => {
    const data = marketingDeckFixture()
    const gaps = (data.reading!.gaps ?? []).map((g) => ({ ...g, state: 'too_little_data' as const, gapPts: null, bandPts: null }))
    const tiles = overviewTiles({ ...data, reading: { ...data.reading!, gaps } })
    expect(tiles[0].value).toBe('too few to compare')
    expect(tiles[0].word).toBe(true)
    expect(tiles[0].value).not.toMatch(/\d/)
  })

  // `mkt.p1.calibrationnote`. The sentence exists twice in the product and has
  // never reached a printed artefact, where there is no drawer to open.
  it('carries the calibration note, and it names the words this deck prints', () => {
    const html = render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />)
    expect(html).toContain('never worded by the model')
    expect(CALIBRATION_NOTE).toContain('too few to compare')
  })

  // `mkt.p1.findings`: the artboard's right-hand pair on every row. NOT its
  // "305 videos" — a finding is calibrated on conversations and strands, and
  // the research spine produces no video count with a denominator for it.
  it('gives each finding row its count and its confidence word', () => {
    const words = markupText(render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />))
    expect(words).toContain('305 conversations')
    expect(words).toContain('solid')
    expect(words).toContain('reasonable')
  })
})

describe('the gap card', () => {
  const gap = () => leadGap(marketingDeckFixture().reading?.gaps)!

  // D1. The artboard writes "gap 13 points, narrowed from 19 in June";
  // "narrowed" is a movement claim about a derived quantity and nothing bands
  // it, so the earlier gap prints as its own dated, banded reading instead.
  it('prints both sides with their k, their n and the band — and never "narrowed"', () => {
    const words = markupText(render(<GapCard gap={gap()} />))
    expect(words).toContain('The gap that matters')
    expect(words).toContain('of 84')
    expect(words).toContain('of 142')
    expect(words).not.toContain('narrowed')
  })

  it('draws the two sides the gap was measured between, and no third', () => {
    const markup = render(<GapCard gap={gap()} />)
    const g = gap()
    expect(markup).toContain(g.a.label)
    expect(markup).toContain(g.b.label)
    // Two bars, no more: a `Gap` is a claim about two audiences.
    expect(markup.split('rounded-[3px]').length - 1).toBe(2)
  })

  it('prints the state word and no magnitude at all below the floor', () => {
    const words = markupText(render(<GapCard gap={{ ...gap(), state: 'too_little_data', gapPts: null, bandPts: null, basis: null }} />))
    expect(words).toContain('too few to compare')
    expect(words).not.toContain('points apart')
  })

  it('says nothing about direction', () => {
    assertCopyContract(render(<GapCard gap={gap()} />))
  })
})

describe('the method sheet', () => {
  // `mkt.p7.numbers`, and the sharpest deviation on the deck: the card printed
  // `run_summary.period_comments` / `period_videos` under a month stamp, three
  // inches from a basis paragraph stating the month's own denominators.
  it('is the reading’s numbers, not the update’s', () => {
    const rows = Object.fromEntries(methodRows(marketingDeckFixture()))
    expect(rows.Conversations).toBe('11,840 comments read in September 2026')
    expect(rows.Videos).toContain('1,388 in the category')
    expect(rows.Videos).not.toContain('2,359')
  })

  it('prints eight rows, with the unit and the language share', () => {
    const rows = methodRows(marketingDeckFixture())
    expect(rows.map(([k]) => k)).toEqual([
      'Period', 'Conversations', 'Videos', 'Sources', 'Held back', 'Findings', 'The unit', 'Languages',
    ])
    expect(Object.fromEntries(rows)['The unit']).toBe('a video with at least one analysed comment')
  })

  it('states the sources as shares and both sides of the findings bar', () => {
    const rows = Object.fromEntries(methodRows(marketingDeckFixture()))
    expect(rows.Sources).toMatch(/TikTok \d+%/)
    expect(rows.Findings).toBe('2 above the bar · 5 below it')
  })

  // `mkt.p7.cannottell`: the causation refusal is the moves block's masthead
  // and has never had its own heading on the sheet a reader goes to for it.
  it('gives the causation refusal its own heading', () => {
    const html = render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />)
    expect(html).toContain('What this brief cannot tell you')
    expect(markupText(html)).toContain('never claim you caused it')
  })

  // `mkt.p7.delivery`. Under the hairline because it is the one line on that
  // card that is run-dated rather than a month reading.
  it('carries the delivery record and its readings counter', () => {
    const words = markupText(render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />))
    expect(words).toContain('23 updates since 6 Apr 2026')
    expect(words).toContain('your 3rd monthly reading')
  })

  // Without a reading the update's own six rows stand, exactly as they did, and
  // the basis paragraph beside them says which basis this brief used.
  it('falls back to the update’s own numbers where there is no reading', () => {
    const rows = Object.fromEntries(methodRows(marketingDeckFixture({ reading: null })))
    expect(rows.Conversations).toBe('9,120')
    expect(rows.Videos).toContain('2,359')
    expect(rows['Held back']).toBe('14 phrases in other languages')
  })
})

describe('the whole deck', () => {
  it('keeps the copy contract in both states', () => {
    assertCopyContract(render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />))
    assertCopyContract(render(<DocumentDeck data={refusedDeckFixture()} date="28 Sep 2026" />))
  })

  it('stamps the month on every sheet, cover or no cover', () => {
    const html = render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />)
    const stamps = html.split('still filling until 30 Oct 2026').length - 1
    expect(stamps).toBeGreaterThanOrEqual(sheets().length)
  })
})
