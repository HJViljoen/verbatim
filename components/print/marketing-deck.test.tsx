import { describe, expect, it } from 'vitest'

import { render, markupText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { documentCoverSheet, documentSheetCount, documentSlides } from '@/lib/reports/documents/compose'
import { documentViewerPages } from '@/lib/reports/viewer'
import { leadGap, leadVerdict, overviewTiles } from '@/lib/reports/documents/overview'
import { DocumentShareShell } from '@/components/share/document-share-shell'
import { DocumentDeck, GapCard, methodRows, paperEmpty, CALIBRATION_NOTE } from './document-deck'
import { SURE_WORDS } from '@/lib/reports/documents/scrub'
import { MOVES_EMPTY } from '@/lib/pages/overview'
import { MONTHLY_MOVES_EMPTY } from '@/lib/reports/monthly'
import { marketingDeckFixture, refusedDeckFixture } from './fixture'

// The marketing brief, against its artboard (package E-marketing, wave 2).
//
// The render tier checks what a sheet PRINTS. Every assertion below names the
// artboard element it is about, and the ones that differ from the artboard
// name the ruling they differ under — because a port that quietly prints the
// honest form and says nothing is indistinguishable from a port that missed it.

const sheets = (data = marketingDeckFixture()) => documentSlides(data)

describe('the sheets', () => {
  it('cuts the one sheet the blocks fit on, and leaves the rest as they were', () => {
    const titles = sheets().map((s) => `${s.layout}:${s.title}`)
    expect(titles).toEqual([
      'single:In short',
      'grid:Your subjects',
      'single:The month',
      'single:What changed this month',
      'single:Rivals',
      'single:A finding',
      'single:A finding',
      'single:Your moves',
      'single:How this was read',
    ])
  })

  // MEASURED, NOT PREFERRED. A borrowed block draws at the app's scale inside
  // the zoomed slide body, so two full-width blocks on one sheet overflow and
  // the second is cut off at the footer (shot at 1123 × 631, 2026-09-18). The
  // subjects table, its monthly line and the gap card fit; the month sentence
  // above the standings did not.
  it('puts the subjects table, its line and the gap card on one sheet', () => {
    const subjects = sheets().find((s) => s.title === 'Your subjects')!
    expect(subjects.keys).toEqual(['section:mk.subjects', 'section:mk.subjectline'])
  })

  // `.vb-print-grid` and `Slide.layout: 'grid'` have been in the codebase since
  // the deck was written and no built page composed internal columns. `data-col`
  // is what `.vb-print [data-col="n"]` keys on.
  it('draws the grid sheets on the twelve-column print grid', () => {
    const html = render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />)
    expect(html).toContain('vb-print-grid')
    expect(html).toContain('data-col="12"')
    expect(html).toContain('data-col="6"')
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
    expect(html).toContain('1 / 9')
  })

  // THE CLIENT-FACING HEADER SAYS WHAT THE DECK UNDER IT SAYS (fix pass).
  // `/r/<token>` counted `pages.length + 1` — the written pages plus a cover —
  // and printed "4 pages" about forty pixels above footers reading "1 / 9".
  // Every surface that states this number reads `documentSheetCount`.
  it('counts the same sheets on the share link, the viewer and the deck', () => {
    const data = marketingDeckFixture()
    const n = documentSheetCount(data)
    expect(n).toBe(9)
    expect(documentViewerPages(data)).toBe(n)
    const shared = markupText(render(<DocumentShareShell data={data} appUrl="https://app.example.com" />))
    expect(shared).toContain(`${n} pages`)
    expect(shared).not.toContain('4 pages')
    expect(shared).toContain(`1 / ${n}`)
  })

  // A SECTION THAT COULD NOT BE FILLED DOES NOT GET A SHEET OF ITS OWN (fix
  // pass). Its body is one sentence, and on production today the brief had four
  // of them — four numbered, footed, stamped landscape sheets carrying a
  // sentence each, one of them 92% white paper. They share a sheet, titled as
  // what they are, and the sentence itself is never dropped.
  it('gives the sections it could not read one sheet between them', () => {
    const data = refusedDeckFixture()
    const titles = sheets(data).map((s) => s.title)
    expect(titles).toContain('Not read this month')
    expect(titles.filter((t) => t === 'Not read this month')).toHaveLength(1)
    const unfilled = sheets(data).find((s) => s.title === 'Not read this month')!
    expect(unfilled.keys).toEqual(['section:mk.subjects', 'section:mk.moves'])
    const text = markupText(render(<DocumentDeck data={data} date="28 Sep 2026" />))
    // Each one still says which section it is and what it was waiting on.
    expect(text).toContain('not recorded')
    expect(text).toContain('Your subjects')
    expect(text).toContain('Your moves')
  })

  // ONE SHEET NEVER SAYS BOTH. The refused arm drew "Your subjects are not
  // recorded for this workspace yet." immediately above a fully drawn chart
  // headed "SHARE OF VIDEOS WHERE DURABILITY CAME UP", on one sheet.
  it('does not print an empty state beside a drawn chart', () => {
    const data = refusedDeckFixture()
    const subjects = sheets(data).find((s) => s.title === 'Your subjects')!
    expect(subjects.keys).toEqual(['section:mk.subjectline'])
  })

  // A stored brief re-renders the sheets it printed: pagination is the
  // artefact's, not today's map's.
  it('leaves a brief built before the shared sheet exactly as it paginated', () => {
    const data = refusedDeckFixture({ unfilledSheet: undefined })
    expect(sheets(data).map((s) => s.title)).toEqual(sheets().map((s) => s.title))
  })
})

// THE BORROWED BLOCKS' PRINT ARMS (fix pass). Three controls a reader of a PDF
// cannot press were printing on the brief: two links out of the deck and one
// empty state written as an instruction. The rule is the repo's own —
// `lib/reports/monthly.ts` gave the monthly artefact its own moves wording
// because the page's "is a control on a page the reader of an email is not
// looking at" — and a brief is the same reader with less recourse.
describe('nothing on paper asks the reader to press something', () => {
  it('prints no link out of the deck, in either state', () => {
    for (const data of [marketingDeckFixture(), refusedDeckFixture()]) {
      const html = render(<DocumentDeck data={data} date="28 Sep 2026" />)
      const text = markupText(html)
      expect(text).not.toContain('Compare another subject')
      expect(text).not.toContain('This week →')
      expect(html).not.toContain('/dashboard/voice')
      expect(html).not.toContain('/dashboard/week')
    }
  })

  // Production today: `overview.moves` is the whole body of the Your-moves
  // sheet, and its sentence said "Press Track this on a subject or a theme".
  it('says what the artefact says about a workspace that has dated nothing', () => {
    const section = { block: 'overview.moves', empty: MOVES_EMPTY }
    expect(paperEmpty(section)).toBe(MONTHLY_MOVES_EMPTY)
    expect(paperEmpty(section)).not.toContain('Press Track this')
    const text = markupText(render(<DocumentDeck data={refusedDeckFixture()} date="28 Sep 2026" />))
    expect(text).not.toContain('Press Track this')
  })

  // The missing-input sentence lands in the same field and names an act the
  // reader's own operator performs; substituting the artefact's wording over it
  // would throw the answer away.
  it('leaves a missing-input sentence exactly as it was frozen', () => {
    const missing = 'We have not recorded your subjects. Your operator names them in Settings.'
    expect(paperEmpty({ block: 'overview.moves', empty: missing })).toBe(missing)
    expect(paperEmpty({ block: 'overview.subjects', empty: MOVES_EMPTY })).toBe(MOVES_EMPTY)
    expect(paperEmpty({ block: 'overview.moves', empty: null })).toBeNull()
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

  // EVERY CALIBRATED WORD ON THE SHEET IS IN THE SENTENCE (fix pass). The note
  // listed the five movement words and stopped, two lines above finding rows
  // carrying chips reading `solid` and `reasonable` — assigned by
  // `calibrateSure` from counted conversations and strands, calibrated by
  // exactly the definition the sentence uses.
  it('names the evidence words its own finding rows print', () => {
    // Every word `calibrateSure` can assign is in the sentence.
    for (const sure of Object.keys(SURE_WORDS)) expect(CALIBRATION_NOTE).toContain(sure)
    // And the chips are on the same sheet as the sentence: the In-short page.
    const sheet = markupText(render(<DocumentDeck data={marketingDeckFixture()} date="28 Sep 2026" />)).split('1 / 9')[0]
    expect(sheet).toContain('solid')
    expect(sheet).toContain('reasonable')
    expect(sheet).toContain('Every calibrated word')
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
    expect(rows.Comments).toBe('11,840 read in September 2026')
    expect(rows.Videos).toContain('1,388 in the category')
    expect(rows.Videos).not.toContain('2,359')
  })

  // COMMENTS, not "Conversations" (fix pass). lib/calibration.ts fixes a
  // conversation as one video and the comments it sparked, and this card
  // defines the unit as a video two rows below — so the old label contradicted
  // its own table. The quarterly's identical card was fixed for this reason
  // and pinned; this is the same assertion.
  it('calls a comment count comments, on the sheet that defines the unit', () => {
    const rows = methodRows(marketingDeckFixture())
    expect(rows.map(([k]) => k)).not.toContain('Conversations')
    expect(Object.fromEntries(rows)['The unit']).toContain('analysed comment')
  })

  // THE PERIOD ENDS WHEN THE MONTH ENDS. `readingAt` is the instant we looked:
  // a September month re-read in December printed "1 Sep 2026 → 2 Dec 2026" on
  // the sheet whose job is to state the basis.
  it('prints the month’s own period, never the instant it was read', () => {
    const rows = Object.fromEntries(methodRows(marketingDeckFixture()))
    expect(rows.Period).toBe('1 Sep – 30 Sep 2026 · still filling')
    const late = marketingDeckFixture()
    const frozen = Object.fromEntries(methodRows({
      ...late,
      reading: { ...late.reading!, monthStatus: 'frozen', readingAt: '2026-12-02T09:00:00.000Z' },
    }))
    expect(frozen.Period).toBe('1 Sep – 30 Sep 2026')
    expect(frozen.Period).not.toContain('Dec')
  })

  // ONE BASIS FOR THE WHOLE CARD. Each row guarded independently, so a reading
  // whose denominators had not been written printed the MONTH's period and
  // platform mix beside the UPDATE's comment and video counts — the defect this
  // card was rewritten to close, one branch over.
  it('does not mix the month and the update when the denominators are empty', () => {
    const data = marketingDeckFixture()
    const rows = Object.fromEntries(methodRows({
      ...data,
      reading: { ...data.reading!, denominators: [] },
    }))
    expect(rows.Period).toBe(data.period)
    expect(rows.Comments).toBe('9,120')
    expect(rows.Videos).toContain('2,359')
    expect(rows.Sources).toBe('TikTok, YouTube, Instagram, Reddit')
  })

  it('prints eight rows, with the unit and the language share', () => {
    const rows = methodRows(marketingDeckFixture())
    expect(rows.map(([k]) => k)).toEqual([
      'Period', 'Comments', 'Videos', 'Sources', 'Held back', 'Findings', 'The unit', 'Languages',
    ])
    expect(Object.fromEntries(rows)['The unit']).toBe('a video with at least one analysed comment')
  })

  it('states the sources as shares and both sides of the findings bar', () => {
    const rows = Object.fromEntries(methodRows(marketingDeckFixture()))
    expect(rows.Sources).toMatch(/TikTok \d+%/)
    expect(rows.Findings).toBe('2 printed above the bar · 5 below it')
  })

  // THE CAP IS NOT THE BAR (fix pass). A finding that cleared the conversations
  // floor and was not printed was held back by the template's cap, which is not
  // an evidence failure — `findingsBelow` used to count it as one.
  it('says which findings the cap held and which the bar cut', () => {
    const data = marketingDeckFixture()
    const rows = Object.fromEntries(methodRows({
      ...data,
      method: { ...data.method, findingsBelow: 1, findingsHeld: 3 },
    }))
    expect(rows.Findings).toBe('2 printed of 5 above the bar · 1 below it')
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
    expect(rows.Comments).toBe('9,120')
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
