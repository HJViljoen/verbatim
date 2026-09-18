import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { DocumentDeck } from './document-deck'
import {
  salesBriefFixture,
  salesBriefLegacyFixture,
  salesBriefThinFixture,
  salesBriefUnreadFixture,
} from './fixture'

// The Sales brief against its artboard (Block D wave 2, package E-sales).
//
// One render per sheet, read as words, against the copy contract — the render
// tier's own rule. The artboard is
// mock-sealand/artboards/SalesBrief.dc.html and the per-element mapping is
// status/mock-gap/SalesBrief.md; where a line here quotes the mock it says so,
// and where the honest form differs it names the deviation.

const deck = (data = salesBriefFixture()) => render(<DocumentDeck data={data} date="28 Sep 2026" />)
const words = (html: string) => markupText(html)
/** The sheets of a rendered deck, in order — one `<section class="vb-slide">`
 *  each, the opening tag dropped so a sheet starts at its own first word. */
const sheets = (html: string) =>
  html.split('<section class="vb-slide"').slice(1).map((x) => x.slice(x.indexOf('>') + 1))
/** A sheet's own title, from the header (or the cover's 58px h1). Matching on
 *  body text picks the COVER for half of these, because its table of contents
 *  names every sheet in the document. */
const titleOf = (sheet: string) => words(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(sheet)?.[1] ?? '')
const sheetNamed = (html: string, title: string) => html_find(sheets(html), title)
function html_find(all: string[], title: string): string {
  return all.find((x) => titleOf(x) === title) ?? ''
}

describe('sales.p1 — the cover', () => {
  const cover = () => sheets(deck())[0]

  // `sales.p1.title`: the artboard's rule is 3 × 48 and stands up; the build
  // drew it 56 × 3 and lying down.
  it('stands the green rule up', () => {
    expect(cover()).toContain('h-12 w-[3px] rounded-full bg-primary')
    expect(cover()).not.toContain('h-[3px] w-14')
  })

  // ONE mono sub-line, in the mock's own order: month · company · short date ·
  // page count. The build printed two lines and neither named the company.
  it('prints one mono sub-line carrying the month, the company and the short date', () => {
    expect(words(cover())).toContain('September 2026 · Sealand · as at 28 Sep · 11 pages')
  })

  // `sales.p1.summary`: on the cover, where the artboard draws it — and its
  // one figure is a [[key]] the caller's table holds (D13), so it prints as a
  // figure node and not as a digit the model typed.
  it('carries the in-short summary, with its figure substituted', () => {
    expect(words(cover())).toContain('Four objections carry September')
    expect(words(cover())).toContain('heard across 1,388 category videos')
    expect(cover()).toContain('data-copy="figure"')
  })

  // …and exactly once in the document: the overview sheet gives it up rather
  // than printing the same paragraph twice.
  it('and the overview sheet does not print it again', () => {
    const rest = sheets(deck()).slice(1).join('')
    expect(words(rest)).not.toContain('Four objections carry September')
  })

  // `sales.p1.contents`: a table of contents with page numbers, which is the
  // deck's own pagination. The build listed finding headlines instead — a
  // different list of a different length from the document behind it.
  it('indexes the document by page number, starting at 2', () => {
    const w = words(cover())
    expect(w).toContain('In this brief')
    expect(w).toContain('2 Overview')
    expect(w).toContain('11 About this brief')
  })

  // `sales.p1.stats`: three tiles, not the one a seeded month left.
  it('draws three stat tiles once the month is read', () => {
    const w = words(cover())
    expect(w).toContain('2,359 comments read, on 1,388 videos')
    expect(w).toContain('120 videos name a switch between brands')
    expect(w).toContain('28 of 205 videos carry')
  })

  // The badge row is the artboard's third line, and it is a Verdict rather
  // than the mock's hand-written "▼ 3 pts · fading, 3rd month" (D2, D5).
  it('hands the claim about a figure to the badge and writes no direction word', () => {
    const w = words(cover())
    expect(w).toContain('not enough months yet')
    expect(w).not.toMatch(/\b(fading|growing|rising)\b/i)
  })

  // A POOL THAT CLEARED BOTH FLOORS IS NOT A THIN SAMPLE. 120 videos with 64
  // toward clears `SHARE_BAND` on both arms, so `switchingFigure` built a
  // verdict — with no baseline, which `bandVerdict` answers `too_little_data`
  // and `MOVEMENT_WORDS` renders "too few to compare". Beside the number 120
  // that is a sentence the page refutes. `ClaimBadge` says which non-answer it
  // actually is.
  it('does not call a pool that cleared both floors too few to compare', () => {
    const w = words(cover())
    expect(w).toContain('120 videos name a switch between brands')
    expect(w).not.toContain('too few to compare')
  })

  // A refusal says which floor bit and how many it had — the mock's bare "too
  // few to compare" over 12 videos does not.
  it('says how many the refused figure had', () => {
    expect(words(sheets(deck(salesBriefThinFixture()))[0]))
      .toContain('Too few to compare: 35 videos where a banded reading needs 100.')
  })

  // `sales.p1.footer`: the cover was the one sheet of a paid PDF with no page
  // number and no "Created by".
  it('carries the footer and numbers itself 1 of N', () => {
    const w = words(cover())
    expect(w).toContain('Created by Sealand with Verbatim')
    expect(w).toContain('1 / 11')
  })

  // The stamp rides every sheet including this one, because a reader of a PDF
  // has no masthead to scroll back to — in the artboard's SHORT form. The
  // sixty-character one appeared three times on the method sheet alone (the
  // footer, the card's PERIOD row, and the end of the first method paragraph).
  it('puts the short reading stamp in the footer of every sheet', () => {
    const html = deck()
    const stamps = html.split('September 2026 · as at 28 Sep · still filling').length - 1
    expect(stamps).toBeGreaterThanOrEqual(sheets(html).length)
  })

  it('keeps the freeze date for the method card, and prints it there and not in a footer', () => {
    const html = deck()
    expect(words(sheetNamed(html, 'About this brief'))).toContain('still filling until 30 October 2026')
    // Twice on that one sheet — the PERIOD row and the method paragraph, which
    // are the composer's, not this deck's — and nowhere else in the document.
    expect(html.split('still filling until 30 October 2026').length - 1).toBeLessThanOrEqual(2)
  })

  it('keeps the copy contract', () => {
    assertCopyContract(deck())
    assertCopyContract(deck(salesBriefThinFixture()))
    assertCopyContract(deck(salesBriefUnreadFixture()))
  })

  // Every Sales brief stored on production predates wave 2 and has no slide
  // figures at all. A stored artefact must keep rendering what it rendered.
  it('renders a brief built before the slide figures existed', () => {
    const w = words(sheets(deck(salesBriefLegacyFixture()))[0])
    expect(w).toContain('Sales brief')
    expect(w).toContain('2,359 comments read, on 1,388 videos')
    expect(w).not.toContain('name a switch between brands')
  })
})

// ── sales.p5 — who is moving, and which way ───────────────────────────────

describe('sales.p5 — the switching sheet', () => {
  const sheet = (data = salesBriefFixture()) => sheetNamed(deck(data), 'Who is moving, and which way')

  it('prints the pool, the split and the bar', () => {
    const w = words(sheet())
    expect(w).toContain('120 videos')
    expect(w).toContain('Toward Sealand 64 of 120')
    expect(w).toContain('Away from Sealand 22 of 120')
    expect(sheet()).toContain('bg-negative')
  })

  // D8: the artboard prints "12 of 1,388 category videos", which is the
  // tenant's own numerator over the category's denominator, on two different
  // clocks. The pool has no honest denominator, so it is a count.
  it('gives the pool no denominator it does not have', () => {
    const w = words(sheet())
    expect(w).toContain('of Sealand’s own videos this month')
    expect(w).not.toContain('120 of 1,388')
  })

  // D9: the one figure in the package that is not comment-dated says so
  // beside itself, not on the method page.
  it('names the clock the pool is on, on the face of the sheet', () => {
    expect(words(sheet())).toContain('dated by when each video was posted')
  })

  // The refusal is the closed vocabulary's word. The mock's "no earlier figure
  // for this one" is a fifth refusal word that neither `MOVEMENT_WORDS` nor
  // `RefusedReason` has.
  it('refuses in the product’s own words', () => {
    // `baseline_forming` — the state whose docstring says it resolves on the
    // calendar — because there is no PRIOR pool, not because this one is thin.
    expect(words(sheet())).toContain('not enough months yet')
    expect(words(sheet())).not.toContain('too few to compare')
    expect(words(sheet())).not.toContain('no earlier figure for this one')
  })

  // …and under the floor the figure names the floor, which is a different
  // answer and keeps its own words.
  it('names the floor where the pool is under it', () => {
    const thin = words(sheetNamed(deck(salesBriefThinFixture()), 'Who is moving, and which way'))
    expect(thin).toContain('Too few to compare: 35 videos where a banded reading needs 100.')
  })

  it('says what nothing measured, rather than labelling a voice', () => {
    expect(words(sheet())).toContain('no quote on this sheet is labelled toward or away')
  })

  // The two populations are put beside each other and no arithmetic is drawn
  // between them — `crosscheckLine`'s whole point.
  it('carries the crosscheck with both denominators', () => {
    expect(words(sheet())).toContain('Two populations, two denominators')
  })

  // `measurement_changed` rides this figure by construction.
  it('says the tone column has been written twice', () => {
    expect(words(sheet())).toContain('two different readings of tone')
  })

  // A sheet whose material is missing is not printed at all — the composer's
  // own rule, and the deck must not draw a hole either.
  it('is absent where nothing named both', () => {
    expect(sheetNamed(deck(salesBriefUnreadFixture()), 'Who is moving, and which way')).toBe('')
  })
})

// ── sales.p6 — answers you can use ────────────────────────────────────────

describe('sales.p6 — the “Say this” sheet', () => {
  const sheet = (data = salesBriefFixture()) => sheetNamed(deck(data), 'Answers you can use')

  it('heads the row with the objection and its denominator', () => {
    const w = words(sheet())
    expect(w).toContain('Pushing back')
    expect(w).toContain('28 of 205 videos')
  })

  // The one place the mock asks for prose the product does not write. Writing
  // one needs a paid model call; the row prints its counts and no script.
  it('prints no sentence it has not been given', () => {
    expect(words(sheet())).toContain('No sentence has been written for this one yet')
  })

  // "Because" is a causal claim and the three biggest subjects of a category
  // month are not reasons for a kind's share. They are printed as what they
  // are, each with its own n.
  it('prints counted context under “Also running”, never under “Because”', () => {
    const w = words(sheet())
    expect(w).toContain('Also running this month')
    expect(w).toContain('Durability — 46 of 205 videos')
    expect(w).not.toContain('Because')
  })

  // One row, and the sheet says why rather than leaving a reader to wonder
  // where the other three objections went.
  it('says why there is one row', () => {
    expect(words(sheet())).toContain('the register that names themes carries no kind')
    expect(words(sheet())).toContain('Counted as a kind of thing said')
  })

  it('is absent where no objection cleared the floor', () => {
    expect(sheetNamed(deck(salesBriefUnreadFixture()), 'Answers you can use')).toBe('')
  })
})

describe('the sales brief’s order is the artboard’s', () => {
  it('runs cover · pushing back · in their words · rivals · compare · moving · answers · method', () => {
    const titles = sheets(deck()).map(titleOf)
    expect(titles).toContain('What they are pushing back on')
    const at = (t: string) => titles.findIndex((x) => x.startsWith(t))
    expect(at('What they are pushing back on')).toBeLessThan(at('What sells, in their words'))
    expect(at('What sells, in their words')).toBeLessThan(at('What they complain about with each rival'))
    expect(at('Who is moving')).toBeLessThan(at('Answers you can use'))
    expect(at('Answers you can use')).toBeLessThan(at('About this brief'))
  })
})

// ── sales.p7 — how this brief was made ────────────────────────────────────

describe('sales.p7 — the method sheet', () => {
  const sheet = (data = salesBriefFixture()) => sheetNamed(deck(data), 'About this brief')

  // `sales.p7.numbers`: the card's anatomy was already the artboard's and
  // every row's content differed. Three of the six were wrong, not thin.

  // D8: the composer's own `AUDIENCE_SUMMED_VIDEO_FIGURES` warns that a video
  // count summed across audiences double-counts a video naming two rivals —
  // and the method card printed the sum anyway.
  it('names each audience’s videos and never sums the rivals', () => {
    const w = words(sheet())
    expect(w).toContain('1,388 the category · 142 Freitag’s audience · 84 your own brand')
    expect(w).not.toContain('356 competitor')
  })

  // A share of a corpus that is 90% one platform is a statement about that
  // platform. The row was a name list.
  it('prints the sources as a share mix', () => {
    expect(words(sheet())).toMatch(/TikTok \d+% · YouTube \d+%/)
  })

  // The dropped count was computed on every build and kept in the workings,
  // where no reader of the document ever sees it.
  it('gives the findings row its denominator', () => {
    expect(words(sheet())).toContain('1 of 4 written · 3 below the bar')
  })

  // D10: the artboard's own row reads "Conversations" over "videos analysed".
  it('labels the comment count as comments', () => {
    const w = words(sheet())
    expect(w).toContain('2,359 read in September 2026')
    expect(w).not.toContain('Conversations 2,359')
  })

  it('counts the comparisons it held back', () => {
    expect(words(sheet())).toContain('2 comparisons not drawn')
  })

  // `sales.p7.footnote` (D15): five sentences the product has composed on
  // every reading since wave 1 and no document had ever printed. Two of the
  // five are on a different clock and say which.
  it('prints the method footnote, with its basis', () => {
    const w = words(sheet())
    expect(w).toContain('Of everything we have ever read for you, not just this window')
    expect(w).toContain('of what was said on camera was not in English')
    expect(w).toContain('capped at 40 per thread')
    expect(w).toContain('Commenters are never identified')
  })

  it('prints the footnote once, not twice', () => {
    const w = words(sheet())
    expect(w.split('Commenters are never identified').length - 1).toBe(1)
  })

  // `sales.p7.cannottell`: the product's own honesty machinery, computed on
  // every reading and thrown away at the door until now.
  it('says what it cannot tell you, in the record’s own words', () => {
    const w = words(sheet())
    expect(w).toContain('What this brief cannot tell you')
    expect(w).toContain('We never claim you caused it')
    expect(w).toContain('2 comparisons were refused')
    expect(w).toContain('the two sides were grouped differently')
  })

  // `sales.p7.method`: the artboard prints the band rule and the product never
  // had — the vocabulary is stamped on badges a reader is never told the rule
  // for. The words are `MOVEMENT_WORDS`', so the rule and the badge cannot
  // drift.
  it('states the band rule in the badge’s own words', () => {
    const w = words(sheet())
    expect(w).toContain('A change is called only when it clears its band')
    expect(w).toContain('no clear change')
    expect(w).toContain('too few to compare')
  })

  it('states how a quote is printed, not only that nobody is named', () => {
    expect(words(sheet())).toContain('with an English rendering underneath — marked as a machine translation')
  })

  // Every Sales brief on production predates the frozen footnote.
  it('degrades to the update’s own numbers on a brief built before wave 2', () => {
    const w = words(sheet(salesBriefLegacyFixture()))
    expect(w).toContain('What this brief cannot tell you')
    expect(w).toContain('is not recorded for this brief')
  })
})

// ── sales.p2 / p3 / p4 — the borrowed sheets ──────────────────────────────

describe('the borrowed sheets carry the artboard’s chrome', () => {
  const objections = () => sheetNamed(deck(), 'What they are pushing back on')
  const rivals = () => sheetNamed(deck(), 'What they complain about with each rival')

  // `sales.p2.header`: the deck printed "{the whole title} · {the whole
  // stamp}" — the title repeated beside itself, and a 60-character stamp in a
  // 10.5px mono slot that has to fit on one line.
  it('names the sheet’s place in the brief, not the title twice', () => {
    expect(words(objections())).toContain('Objections · September 2026')
    expect(words(objections())).not.toContain('What they are pushing back on · September 2026 · reading as at')
  })

  // …AND THE PAGE KINDS TOO. `context` was given to the four `block()` entries
  // only, so five of the nine numbered sheets still read their own title back
  // at themselves in the 10.5px mono slot. `PAGE_CONTEXT` is the same slot for
  // a written page, in the artboard's own words where it has them.
  it('gives every page kind its own place, never its title repeated', () => {
    for (const [title, context] of [
      ['Who is moving, and which way', 'Switching signals'],
      ['Answers you can use', 'Grounded answers'],
      ['About this brief', 'Method'],
      ['Overview', 'In short'],
      ['Language to handle with care', 'Language'],
    ] as const) {
      const w = words(sheetNamed(deck(), title))
      expect(w).toContain(`${context} · September 2026`)
      expect(w).not.toContain(`${title} · September 2026`)
    }
  })

  // The framing is the slide's serif note, which is what the artboard draws;
  // the green-ruled eyebrow says what the ORDER of the rows is, which a list
  // of counted rows will not tell a reader itself.
  it('draws the framing as the slide note and a green-ruled eyebrow over the body', () => {
    expect(objections()).toContain('vb-slide-note')
    expect(words(objections())).toContain('Most heard first')
    expect(objections()).toContain('h-[2px] w-4 rounded-full bg-primary')
  })

  // `sales.p2.chart`: no borrowed sheet had a right-hand pane at all, so the
  // mock's chart and confidence rail had nowhere to go.
  it('puts the month line in the right pane, one side, and says why one', () => {
    const w = words(objections())
    expect(w).toContain('The line behind these')
    expect(objections()).toContain('<svg')
    expect(w).toContain('Jun 2026')
    expect(w).toContain('Your own audience carries no month-by-month series on a subject')
  })

  // D3: a chart is a direction claim too, and two points are not a direction.
  it('names the months instead of drawing them below three readings', () => {
    const thin = sheetNamed(deck(salesBriefThinFixture()), 'What they are pushing back on')
    expect(thin).not.toContain('<svg')
    // `monthlyLineLabel`'s own words for this state, not a fourth phrase for it.
    expect(words(thin)).toContain('Aug → Sep only')
  })

  // `sales.p2.confidence` … `p5.confidence`: the dots existed only inside a
  // finding page's right card.
  it('carries the confidence dots, the word and the caveat on a borrowed sheet', () => {
    const w = words(objections())
    expect(w).toContain('Confidence')
    expect(w).toContain('reasonable')
    expect(w).toContain('9 of 12 comparisons on these pages were answered against their band.')
  })

  // `sales.p4.untracked`: composed by `untrackedNotes` on every brief since
  // wave 1 and printed by nothing. D14 — the ROLE, and no date.
  it('says what is not tracked beside the rivals sheet, by role and with no date', () => {
    const w = words(rivals())
    expect(w).toContain('Not tracked: the rival accounts we read')
    expect(w).toContain('Ours to set up.')
    expect(w).not.toMatch(/\b(by|before|due)\s+\d/i)
  })

  // …and only beside the section that noted it.
  it('does not repeat the untracked note on every sheet', () => {
    expect(words(objections())).not.toContain('Not tracked:')
  })

  it('keeps the copy contract on every sheet', () => {
    assertCopyContract(deck())
    assertCopyContract(deck(salesBriefThinFixture()))
    assertCopyContract(deck(salesBriefLegacyFixture()))
  })
})
