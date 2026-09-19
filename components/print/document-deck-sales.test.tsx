import { describe, expect, it } from 'vitest'

import { assertCopyContract } from '@/lib/test/copy-contract'
import { overviewTiles } from '@/lib/reports/documents/overview'
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

  // …and the figure sets in SANS inside running prose (deviation 7, reopened).
  // Plex Mono sets a comma in a full advance, so "1,388" reads as three tokens
  // mid-sentence; the artboard sets the same figure in sans in its paragraph
  // and in mono on its tile. `tabular-nums` stays, so the digits still align.
  it('sets the cover paragraph’s figure in sans and the tile’s in mono', () => {
    const c = cover()
    expect(c).toContain('<span class="tabular-nums text-foreground">1,388</span>')
    expect(c).toContain('font-mono text-[42px]')
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

  // RULE (b) IS DECLARED BY THE SIDE THAT KNOWS. The marker was a regex over
  // the rendered label (`/\bof\s[\d]/`), narrower than the contract's own
  // `DENOMINATOR_RE`, so a label with two spaces or "of the 1,388" silently
  // stopped being checked. `overviewTiles` says which tiles are levels.
  it('marks the tiles that are levels, from the composer and not from a regex', () => {
    const tiles = overviewTiles(salesBriefFixture())
    expect(tiles.filter((t) => t.level)).toHaveLength(2)
    // Two `data-copy="level"` tiles on the cover, and the contract reads them.
    expect(cover().split('data-copy="level"').length - 1).toBe(2)
  })

  // `sales.p1.stats`: three tiles, not the one a seeded month left.
  it('draws three stat tiles once the month is read', () => {
    const w = words(cover())
    // MERGE, BLOCK D WAVE 2: the basis tile now NAMES THE MONTH and the
    // population the videos are of — E-marketing's wording for the same
    // figure, which is the same number with the two facts a reader needs
    // beside it. It is also the LAST of the three now, because the two
    // measures come first (see `overviewTiles`).
    expect(w).toContain('2,359 comments read in September 2026, on 1,388 videos in the category')
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
    // MERGE, BLOCK D WAVE 2: the basis tile now NAMES THE MONTH and the
    // population the videos are of — E-marketing's wording for the same
    // figure, which is the same number with the two facts a reader needs
    // beside it. It is also the LAST of the three now, because the two
    // measures come first (see `overviewTiles`).
    expect(w).toContain('2,359 comments read in September 2026, on 1,388 videos in the category')
    expect(w).not.toContain('name a switch between brands')
  })
})

// ── sales.p5 — who is moving, and which way ───────────────────────────────

// ── the overview sheet ─────────────────────────────────────────────────────

describe('the overview sheet, once the cover has taken the summary', () => {
  const sheet = () => sheetNamed(deck(), 'Overview')

  // The summary, the contents and the three tiles all moved to the cover for
  // this brief, which left a numbered list of sentences and one box on a
  // 1123 × 631 sheet — about 85% of it nothing on a one-finding month. The
  // list is worth having and is not the cover's (the cover indexes PAGES,
  // this indexes the argument), so it carries what it is a list of.
  it('carries each finding’s evidence, its sheet and its audiences', () => {
    const w = sheet()
    const t = words(w)
    expect(t).toContain('The objection to answer is longevity, not cost.')
    expect(t).toContain('page 3')
    expect(t).toContain('1,388 conversations')
    expect(t).toContain('4 strands of the research')
    expect(t).toContain('confidence reasonable')
    expect(t).toContain('the category')
    expect(t).toContain('Sealand’s audience')
  })

  // Every count on the row is the finding page's own meta, so the two sheets
  // cannot disagree and nothing is measured twice.
  it('reads the same counts the finding sheet prints', () => {
    const finding = words(sheetNamed(deck(), 'Finding 1'))
    expect(finding).toContain('1,388 conversations · 4 strands of the research')
  })

  it('still prints what the update did not settle', () => {
    expect(words(sheet())).toContain('Not settled this update')
  })
})

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

  // THE CARD HOLDS WHAT IT HOLDS. One card in a three-column grid was stretched
  // to the full slide with its footnote pinned to the foot, so the sheet was an
  // L with a 900 × 700 hole: a 350px void inside the card and the explanation
  // bottom-anchored beside it.
  it('does not stretch one card down a whole slide', () => {
    expect(sheet()).toContain('grid-cols-3 items-start')
    expect(sheet()).not.toContain('mt-auto border-t border-border pt-2.5')
  })

  // `line.because` IS UNREACHABLE FROM THE LOADER TODAY — `load-reading.ts`
  // passes `because: []` on every call, because no reason for an objection has
  // been measured and none is claimed. The branch is the one the docstring
  // argues hardest about, so it is rendered here rather than left untested
  // against the day a build passes one in.
  it('draws a measured reason under “Because”, each with its own n', () => {
    const base = salesBriefFixture()
    const scripted = base.slideFigures!.scripted.map((l) => ({
      ...l,
      because: [{ label: 'Price talk in the category', value: { k: 34, n: 205 } }],
    }))
    const w = words(sheet(salesBriefFixture({ slideFigures: { ...base.slideFigures!, scripted } })))
    expect(w).toContain('Because')
    expect(w).toContain('Price talk in the category — 34 of 205 videos')
  })
})

// ── one market on one deck ────────────────────────────────────────────────

describe('the fixture is one market', () => {
  // The artboard is a Sealand bag brief and the subjects fixture is one; the
  // competitive fixture's numbers are Össur's own, read read-only off
  // production, and its rival is Ottobock — so the deck carried "the
  // prosthetics conversation", Ottobock and "3r85 or 3r80" inside a bag brief.
  // `components/print/fixture.ts` re-labels the NAMES and touches no measured
  // number. This is the guard on that: a domain word added to a borrowed
  // fixture later fails here rather than reaching a client's PDF.
  it('carries no word of the other market, on any sheet or in any state', () => {
    const other = /prosthetic|amputee|bionic|Ottobock|Össur|Ossur|3r8\d|battery/i
    for (const data of [salesBriefFixture(), salesBriefThinFixture(), salesBriefUnreadFixture(), salesBriefLegacyFixture()]) {
      const found = other.exec(deck(data))
      expect(found?.[0] ?? null).toBeNull()
    }
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
  // where no reader of the document ever sees it. It is a COUNT and not a
  // reason: `dropped` collects three different events and only one of them is
  // a bar (compose.ts), so "3 below the bar" claimed of three what was true of
  // at most one.
  it('gives the findings row its denominator, and no reason it cannot support', () => {
    expect(words(sheet())).toContain('1 of 4 written · 3 not carried')
    expect(words(sheet())).not.toContain('below the bar')
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
    // BOTH ENDS WITH THEIR VALUE. A printed line has no hover, and a shape
    // with two month names under it and no magnitude is decoration.
    expect(w).toContain('Jun 2026 18%')
    expect(w).toContain('Sep 2026 20%')
    expect(w).toContain('Your own audience carries no month-by-month series on a subject')
  })

  // D3: a chart is a direction claim too, and two points are not a direction.
  it('names the months instead of drawing them below three readings', () => {
    const thin = sheetNamed(deck(salesBriefThinFixture()), 'What they are pushing back on')
    expect(thin).not.toContain('<svg')
    // `monthlyLineLabel`'s own words for this state, not a fourth phrase for it.
    expect(words(thin)).toContain('Aug → Sep only')
  })

  // …AND THE EYEBROW DOES NOT PROMISE A LINE. The card stayed headed "THE LINE
  // BEHIND THESE" over four words and said nothing about why there was no
  // line — which is the state every workspace without `month_kind_readings` is
  // in today, so it is the state most readers actually meet.
  it('heads the empty chart pane for what is in it, and says why', () => {
    const thin = words(sheetNamed(deck(salesBriefThinFixture()), 'What they are pushing back on'))
    expect(thin).toContain('The months behind these')
    expect(thin).not.toContain('The line behind these')
    expect(thin).toContain('monthly readings yet, so the months are named instead of drawn')
  })

  // TWO VOCABULARIES, ONE LADDER. A finding's `solid | reasonable | thin` and a
  // reading's `reasonable | partly | not yet` share one set of three dots, so
  // each word gets its own rung: `partly` and `not yet` drew the same single
  // dot until now, which rendered a three-state word as two.
  it('fills a different number of dots for each confidence word', () => {
    const filled = (sheet: string) => (sheet.match(/bg-primary"/g) ?? []).length
    const of = (word: string) =>
      filled(sheetNamed(deck(salesBriefFixture({
        reading: { ...salesBriefFixture().reading!, confidence: { word, why: 'why.' } },
        // The chart pane would draw its own primary-coloured marks; the rivals
        // sheet's pane is the confidence one and draws none.
      })), 'What they complain about with each rival'))
    expect(of('reasonable')).toBeGreaterThan(of('partly'))
    expect(of('partly')).toBeGreaterThan(of('not yet'))
  })

  // `sales.p2.confidence` … `p5.confidence`: the dots existed only inside a
  // finding page's right card.
  it('carries the confidence dots, the word and the caveat on a borrowed sheet', () => {
    const w = words(objections())
    expect(w).toContain('Confidence')
    expect(w).toContain('reasonable')
    expect(w).toContain('9 of 12 comparisons on these pages were answered against their band.')
  })

  // …AND THE SENTENCE BEHIND THE WORD ONCE. It is one reading's account of
  // itself and it stood verbatim on three consecutive sheets, which reads as
  // chrome. The dots and the word stay on every pane, because a reader meets
  // each sheet on its own.
  it('prints the confidence sentence once and the word on every pane', () => {
    const html = deck()
    expect(html.split('9 of 12 comparisons on these pages were answered against their band.').length - 1).toBe(1)
    expect(html.split('>Confidence ').length - 1).toBeGreaterThanOrEqual(4)
  })

  // `sales.p3.howtouse` / the repeated panel. The pane was one body for every
  // sheet — the reading's denominators and then the dots — so p3, p4 and p5
  // carried the same card.
  it('gives each pane its own card, so no two are the same', () => {
    const voices = words(sheetNamed(deck(), 'What sells, in their words'))
    const compare = words(sheetNamed(deck(), 'What buyers compare'))
    expect(voices).toContain('How to use these')
    expect(voices).toContain('Say these back in the customer’s own words')
    // The denominators are the FALLBACK, not the body: a pane with its own
    // lead prints the lead, and the method card prints the counts in full.
    expect(voices).not.toContain('1,388 the category')
    expect(words(rivals())).toContain('What is on this sheet')
    // `sl.questions` carried no pane at all — the one single-column sheet in
    // an otherwise 7fr/5fr deck, and the only one with no confidence rail.
    expect(compare).toContain('How to read these')
    expect(compare).toContain('Confidence')
  })

  // A PANE CARD HUGS ITS CONTENT. It stretched to the full slide with the rail
  // pinned to the foot, so a pane with two lines drew a 700px empty box.
  it('does not stretch a pane card past what is in it', () => {
    expect(rivals()).toContain('self-start')
    expect(rivals()).not.toContain('mt-auto flex flex-col gap-1.5 border-t border-border pt-3')
  })

  // THE SHEET SAYS WHAT IS ON IT. Its title is the artboard's — "What they
  // complain about with each rival" — and the complaints are not built
  // (`competitive.rivals.figures()` returns `{}`; E-competitive's file), so a
  // client met a heading promising per-rival complaints and a page delivering
  // a picker. The title stays; the empty state tells the truth under it.
  it('says on the rivals sheet what the rivals sheet does not carry', () => {
    const w = words(rivals())
    expect(w).toContain('not yet counted rival by rival')
    expect(w).toContain('does not carry the complaints its title names')
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
