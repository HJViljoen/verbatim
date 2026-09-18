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
const sheets = (html: string) => html.split('<section class="vb-slide"').slice(1)
const words = (html: string) => markupText(html)

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
    expect(words(cover())).toContain('September 2026 · Sealand · as at 28 Sep · 9 pages')
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
    expect(w).toContain('9 About this brief')
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
    expect(w).toContain('too few to compare')
    expect(w).not.toMatch(/\b(fading|growing|rising)\b/i)
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
    expect(w).toContain('1 / 9')
  })

  // The stamp rides every sheet including this one, because a reader of a PDF
  // has no masthead to scroll back to.
  it('puts the reading stamp in the footer of every sheet', () => {
    const html = deck()
    const stamps = html.split('still filling until 30 October 2026').length - 1
    expect(stamps).toBeGreaterThanOrEqual(sheets(html).length)
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
