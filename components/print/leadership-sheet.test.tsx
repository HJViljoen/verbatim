import { describe, expect, it } from 'vitest'

import { markupText, render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { overviewFixture, refusedFixture } from '@/components/pages/overview/fixture'
import { competitiveFixture } from '@/components/pages/competitive-surface/fixture'
import type { OverviewData } from '@/lib/pages/overview'
import type { Gap } from '@/lib/reading/gap'
import { documentSlides } from '@/lib/reports/documents/compose'
import { documentViewerPages } from '@/lib/reports/viewer'
import type { DocumentSnapshotData } from '@/lib/reports/documents/types'
import { DocumentDeck } from './document-deck'
import { provenanceLine } from '@/components/pages/overview/sentence'
import { LeadershipSheet, isLeadershipOverview, leadGap, leadSubject, leadershipSheetData, sheetSubjectRows } from './leadership-sheet'

// The leadership one-pager (Block D wave 2, E-leadership).
//
// The render tier's one static render per block, applied to a SHEET: the
// artboard packs eight information units onto one slide, so what this asserts
// is that each of them prints, that each prints the HONEST form where the mock
// asks for one the rules refuse, and that the whole sheet keeps the copy
// contract in both the reading state and the refused one — which is the state
// production is in until M3–M7 are applied.

const LEAD: DocumentSnapshotData = {
  version: 1,
  kind: 'document',
  template: 'leadership_brief',
  reportId: 'r1',
  title: 'Leadership brief',
  audience: 'leadership',
  company: 'Sealand',
  period: 'September 2026 · reading as at 18 Sep 2026',
  runId: null,
  figures: {},
  delta: null,
  pages: [
    { id: 'in_short', kind: 'in_short', title: 'In short', blocks: [{ id: 'in_short.summary', field: 'summary', text: 'The month in a paragraph.', items: [] }] },
    { id: 'method', kind: 'method', title: 'How this was read', blocks: [{ id: 'method.method', field: 'method', text: '', items: ['One paragraph.'] }] },
  ],
  lens: { means: 'What it means for the business', short: 'for the business' },
  method: { conversations: 0, videos: 0, clientVideos: 0, competitorVideos: 0, period: 'x', sources: [], heldBack: 0, thin: false },
  notSureYet: [],
  generatedAt: '2026-09-18T09:00:00.000Z',
  model: 'm',
  promptVersion: 'leadership_brief_v1',
  reading: {
    month: '2026-09-01', monthLabel: 'September 2026', monthStatus: 'filling',
    readingAt: '2026-09-18T09:00:00.000Z',
    stamp: 'September 2026 · reading as at 18 Sep 2026 · still filling until 30 Oct 2026',
    denominators: [], platformMix: {}, crossesClustering: false,
  },
  sections: [
    { id: 'ld.month', block: 'overview.sentence', surface: 'overview', title: 'The month', framing: 'The month in one reading.', empty: null },
    { id: 'ld.category', block: 'overview.category', surface: 'overview', title: 'The category', framing: 'What the wider conversation was about.', empty: null },
    { id: 'ld.standing', block: 'competitive.months', surface: 'competitive', title: 'Where you stand', framing: 'Your own share beside every rival.', empty: null },
    { id: 'ld.subjects', block: 'overview.subjects', surface: 'overview', title: 'Your subjects', framing: 'The subjects this workspace is read against.', empty: null },
    { id: 'ld.moves', block: 'overview.moves', surface: 'overview', title: 'What was decided', framing: 'Each recommendation and what was done about it.', empty: null },
  ],
  surfaces: { overview: overviewFixture() },
  layout: [
    { kind: 'page', id: 'in_short' },
    { kind: 'section', id: 'ld.month' },
    { kind: 'section', id: 'ld.category' },
    { kind: 'section', id: 'ld.standing' },
    { kind: 'section', id: 'ld.subjects' },
    { kind: 'section', id: 'ld.moves' },
    { kind: 'page', id: 'method' },
  ],
}

const sheet = (overview: OverviewData = overviewFixture(), over: Partial<DocumentSnapshotData> = {}) =>
  <LeadershipSheet data={{ ...LEAD, ...over }} overview={overview} date="18 Sep 2026" page={1} pages={4} />

describe('the leadership one-pager', () => {
  it('keeps the copy contract on a month that read', () => {
    assertCopyContract(render(sheet()))
  })

  // The state production is in: M3–M7 unapplied, so the subjects, the mood,
  // the attention panel and the moves all come back as sentences saying what
  // is not recorded. The refusal is the reading a client sees first, and a
  // sheet that only holds together when everything reads is not a sheet.
  it('keeps the copy contract on the refused month, and still draws every unit', () => {
    const markup = render(sheet(refusedFixture()))
    assertCopyContract(markup)
    const words = markupText(markup)
    expect(words).toContain('The one thing to decide')
    expect(words).toContain('Your subjects')
    expect(words).toContain('Your moves')
    expect(words).toContain('Our read')
    expect(words).toContain('Coverage')
  })

  it('prints the gap as both sides with their counts, in mono, not in the serif slot', () => {
    const markup = render(sheet())
    const words = markupText(markup)
    // D1: the gap is both sides with their counts, the difference and the band.
    expect(words).toContain('Durability')
    expect(words).toMatch(/26 of 84/)
    expect(words).toMatch(/62 of 142/)
    // The serif face is speech — a quote, or the one framing line a person
    // writes. A machine-composed figures trail in it reads as something
    // somebody said, it truncates to one line with no other trace, and it
    // takes the slot the Studio's operator writes into.
    expect(markup).not.toContain('vb-slide-note')
    expect(markup).not.toContain('font-serif')
  })

  // mock-gap §6 D1. "narrowed to 13 points" is a direction claim off two
  // readings of two independent binomials, and `narrowed` is on the scrubber's
  // own banned list. The earlier reading is printed instead, dated and banded.
  it('never says the gap narrowed', () => {
    const words = renderText(sheet()).toLowerCase()
    for (const banned of ['narrowed', 'narrowing', 'widened', 'closing']) {
      expect(words).not.toContain(banned)
    }
  })

  // AGENTS.md: a chart is a direction claim too. The line on the gap card is
  // `SubjectRow.spark` — the CATEGORY's share of the subject, the only
  // per-month series a subject row carries — inside a card whose hero and
  // caption are the gap between you and the named rival. Auto-scaled so a
  // four-point rise fills 44px, with two bare month names under it, it made
  // exactly the claim the card's three lines of copy were spending themselves
  // refusing, on the quantity a reader takes for the gap. Both ends now carry
  // their value and the series names itself in the card's own voice.
  it('names the gap card’s line, and values both its ends', () => {
    const words = renderText(sheet())
    expect(words).toContain('May 18%')
    expect(words).toContain('Sep 22%')
    expect(words).toContain('not the gap')
    expect(words).toMatch(/the line is durability across .*of 1,388 videos/)
  })

  // mock-gap §6 D7. The mock's "−18% since June" and "▼ 9,100 comments" are a
  // percentage change and a delta of a RAW COMMENT COUNT: no denominator, so no
  // band, and June→September crosses the 3 September re-freeze. The level, the
  // panel's size and the banded step go in their place.
  it('states the attention panel as a level over its own size, never as a percentage change', () => {
    const words = renderText(sheet())
    expect(words).toContain('a fixed panel of 214 accounts')
    expect(words).toContain('re-frozen 3 Sep')
    expect(words).not.toContain('since June')
    expect(words).not.toContain('9,100')
  })

  // Rule (b) reads a `level` node's whole text for an "of N", so a month trail
  // inside the level node satisfied it LEXICALLY while printing three readings
  // over three different denominators under the one that belongs to September.
  // The trails are their own nodes now, and the attention months carry the
  // count of videos each was read over — the one thing that makes two comment
  // counts comparable at all.
  it('does not hang three months off one month’s denominator', () => {
    const markup = render(sheet())
    const words = markupText(markup)
    expect(words).toContain('Jul 50,300 on 900 videos · Aug 46,000 on 880 videos')
    expect(words).toContain('earlier · Jul 28% · Aug 28%')
    // The panel's size is the size at the CURRENT freeze, so the level node it
    // stands in holds this month's reading and nothing else.
    expect(markup).not.toMatch(/a fixed panel of 214 accounts[^<]*Jul/)
  })

  // mock-gap §6 D12. The product refuses the quarter framing deliberately:
  // the decisions were not dated inside the quarter, so the ratio is the whole
  // ledger's and `actedTally` is the one sentence for it.
  it('prints the whole-ledger acted-on ratio, never a quarter, and prints it once', () => {
    const words = renderText(sheet())
    expect(words).toContain('every piece of advice this product has ever given you')
    expect(words).not.toContain('this quarter')
    // The eyebrow carried the same ratio, unscoped, forty pixels above the
    // sentence that scopes it. The artboard prints it once.
    expect(words.match(/1 of 64/g) ?? []).toHaveLength(1)
    expect(words).not.toContain('acted on 1 of 64 Push')
  })

  // The mock's change column carries a muted stand-alone "flat". It is not in
  // MOVEMENT_WORDS, and as a substitute for "no clear change" it would be a
  // direction word earned from one banded comparison — which is what the copy
  // contract's rule (c) refuses. The badge's own vocabulary prints instead.
  it('draws the subjects table with a denominator on every cell', () => {
    const words = renderText(sheet())
    // The artboard hoists the denominator into the header …
    expect(words).toContain('You · of 84')
    expect(words).toContain('Freitag · of 142')
    // … and the cell keeps its own "of N", which is what rule (b) reads.
    expect(words).toContain('26 of 84')
    expect(words).toContain('305 of 1,388')
  })

  // Thirty paired figures in five columns, laid out as `div`s on a grid: on
  // the share link (`/r/<token>`, which is HTML) a screen reader reached them
  // in reading order with nothing naming the column, so "44% · 62 of 142" was
  // indistinguishable from the client's own share — and the legend dots are
  // `aria-hidden`, so colour was the only thing telling the sides apart. The
  // product's own subjects block ships a real table; the artboard's geometry
  // rides on `display: grid` rows, unchanged.
  it('draws the subjects table as a table, with a header for every column', () => {
    const markup = render(sheet())
    expect(markup).toContain('<table')
    // Five columns, and the subject is the row's own header.
    expect((markup.match(/role="columnheader"/g) ?? []).length).toBe(5)
    expect((markup.match(/scope="col"/g) ?? []).length).toBe(5)
    expect((markup.match(/role="rowheader"/g) ?? []).length).toBe(2)
    expect((markup.match(/scope="row"/g) ?? []).length).toBe(2)
    // `display` other than `table` strips the semantics a bare <table> would
    // have given, which is why every role is written down.
    expect(markup).toContain('role="table"')
    expect((markup.match(/role="rowgroup"/g) ?? []).length).toBe(2)
    // The geometry is the artboard's: the same five-column grid on every row.
    expect((markup.match(/grid-cols-\[minmax\(0,112px\)_82px_120px_138px_minmax\(0,1fr\)\]/g) ?? []).length).toBe(3)
  })

  // `.vb-slide-body` is a fixed height with `overflow: hidden`, so a sheet that
  // does not budget its rows is CUT rather than wrapped — silently, on a
  // client's PDF, where only the Studio editor's `data-overflow` notices. At
  // the artboard's own six rows the body overflowed by 86px: row 5 sliced
  // mid-glyph, row 6 gone, the table caveat gone, and the whole "Our read"
  // block gone. `ld.subjects`'s framing is "the five to eight subjects this
  // workspace is read against", so six is not a corner case, and an operator
  // cannot fix it because the row count is Settings.
  const eightRows = (): OverviewData => {
    const base = overviewFixture()
    const rows = Array.from({ length: 8 }, (_, i) => ({
      ...base.subjects.rows[i % 2],
      id: `s${i + 1}`,
      label: `Subject ${i + 1}`,
    }))
    return { ...base, subjects: { ...base.subjects, rows } }
  }

  it('budgets its subject rows, and says how many it did not show', () => {
    const words = renderText(sheet(eightRows()))
    expect(words).toContain('Subject 4')
    expect(words).not.toContain('Subject 5')
    // The count it did not show, and the page in the document that shows them
    // all — the sheet absorbs no section, so "Your subjects" really follows.
    expect(words).toContain('4 more subjects, on “Your subjects”.')
    // … and the two things the overflow used to eat are still on the sheet.
    expect(words).toContain('the category column carries the month')
    expect(words).toContain('Our read')
  })

  // A budget that counts rows alone is not a budget: the truncation line only
  // exists BECAUSE the table truncated, and the caveat prints under it either
  // way. At the artboard's own six subjects the body ran 24px past its
  // `overflow: hidden` box and ate exactly those two lines — silently, on a
  // client's PDF. The arithmetic is measured; see the constants.
  it('charges the lines under the table to the same budget as the rows', () => {
    // 41px a row, 18px a mono line, 201px to spend.
    expect(sheetSubjectRows(3, 0)).toBe(3)
    expect(sheetSubjectRows(4, 1)).toBe(4)
    // Six subjects and a caveat: four rows, the caveat and the truncation line
    // (164 + 18 + 18 = 200) — one row fewer than the rows alone would allow.
    expect(sheetSubjectRows(6, 1)).toBe(4)
    expect(sheetSubjectRows(8, 1)).toBe(4)
    // Truncating is what costs the extra line, so a table that shows every row
    // it has is charged for the caveat alone.
    expect(sheetSubjectRows(4, 0)).toBe(4)
    // A caveat that ever wrapped to a second line is counted here, and pays
    // for itself in rows rather than in a silent clip.
    expect(sheetSubjectRows(6, 3)).toBe(3)
    // It never returns nothing: one row and the count is still a table.
    expect(sheetSubjectRows(6, 12)).toBe(1)
  })

  it('says how many moves it did not show, rather than slicing in silence', () => {
    const base = overviewFixture()
    const readings = [0, 1, 2, 3].map((i) => ({ ...base.moves.readings[0], moveId: `m${i}`, title: `Move ${i}` }))
    const words = renderText(sheet({ ...base, moves: { ...base.moves, readings } }))
    expect(words).toContain('Move 0')
    expect(words).toContain('Move 1')
    expect(words).not.toContain('Move 2')
    expect(words).toContain('2 more moves, on “What was decided”.')
  })

  // MASTER rule 2: colour is meaning, and `delta-badge.tsx` says it out loud —
  // "`neutral` prints the movement in muted ink: it moved, and we are not
  // saying whether that is good". The artboard reserves green for the one claim
  // that is good news for the client and prints every category and rival
  // movement in ink-2. A rise in the category's attention to Price is not the
  // client's bad news; the sheet printed it red, because `BlockMovement` did
  // not forward the axis its own badge has always taken.
  it('prints the category’s movements in muted ink, and keeps colour for the client’s own', () => {
    const markup = render(sheet())
    // The one coloured claim on the sheet is the move's own reading: did the
    // thing this client did work? On the fixture that move is a non-answer, so
    // nothing on the populated sheet is green or red …
    expect(markup).not.toContain('text-positive')
    expect(markup).not.toContain('text-negative')
    // … and the category's steps, which do carry a magnitude, are muted.
    expect(markup).toMatch(/text-muted-foreground[^"]*">▲ 3\.2 pts|▲ 3\.2 pts/)
  })

  it('carries the coverage line and the reading counter the deck never printed', () => {
    const words = renderText(sheet())
    expect(words).toContain('2,359 videos')
    expect(words).toContain('trailing median 2,240')
    expect(words).toContain('Created by Sealand with Verbatim')
    expect(words).toContain('monthly reading')
  })

  // Four sections share this sheet where the deck gives each one a slide with
  // an `h1` over it, so a `<p>` eyebrow left the page with one heading and four
  // unlabelled regions. The slide title is the h1, each eyebrow an h2, and the
  // recommendation — the body of one of those sections — an h3.
  it('gives each of its four sections a heading', () => {
    const markup = render(sheet())
    expect((markup.match(/<h2/g) ?? []).length).toBe(4)
    expect(markup).toContain('<h3')
  })

  // `text-muted-foreground` (#6E7378) on `bg-inner` (#F6F7F8) is 4.46:1 — under
  // AA, at 9.5px, on a document a director reads on paper. The same token on
  // white is 4.79:1, which is why every other trail on the sheet keeps it.
  it('sets none of its own ink muted on the grey ground', () => {
    const markup = render(sheet())
    // The move card's 9.5px mono trail, and every chip's own words. (The
    // non-answer badge inside the card is `MovementBadge`'s `NonAnswer`, whose
    // colour is set in the shared primitive for every surface in the product;
    // see status/E-leadership.md, NOT done.)
    expect(markup).not.toMatch(/font-mono text-\[9\.5px\] leading-\[1\.35\] text-muted-foreground">declared/)
    expect(markup).not.toMatch(/bg-inner text-muted-foreground/)
  })

  // The clamp is a backstop: `.vb-slide` is `overflow: hidden` and the body's
  // height is calculated against a fixed footer, so a third line pushes the
  // footer off the sheet rather than down. What was wrong was relying on it —
  // a long record lost its tail to CSS with no trace and nowhere named to
  // look. `record.lines` is what the method page prints, and the note says so
  // first, where the clamp can never reach it.
  it('names where the whole record is, before anything a clamp could eat', () => {
    const words = renderText(sheet())
    expect(words).toMatch(/Coverage · in full on “How this was read” ·/)
  })

  // The sheet and the "The month" slide are drawn from the SAME frozen
  // Overview, so a provenance the sheet composes itself is a second answer to
  // one question. It hard-coded "How many videos it is grounded in is not
  // recorded on this reading." off a comment saying `LedgerRow` carried
  // neither `timesMade` nor `grounding` — both have been on the row since
  // wave 1, and page 3 of the same PDF printed the count the sheet denied.
  it('reads the recommendation’s provenance off the row, in the page’s own words', () => {
    const data = overviewFixture()
    const words = renderText(sheet(data))
    const prov = provenanceLine(data.sentence.ledger!)!
    expect(words).toContain(prov.slice(1))
    expect(words).toContain('repeated across 3 updates')
    expect(words).toContain(data.sentence.ledger!.grounding!.line)
    expect(words).not.toContain('is not recorded on this reading')
    // D14 and D9: the date is earliest evidence, not a start date, and an
    // update count keeps the word "update" in it so it cannot read as a period.
    expect(words).not.toContain('First raised')
  })

  it('says so plainly when the row carries no provenance at all', () => {
    const base = overviewFixture()
    const ledger = { ...base.sentence.ledger!, monthsOld: null, timesMade: 1, grounding: null }
    const words = renderText(sheet({ ...base, sentence: { ...base.sentence, ledger } }))
    expect(words).toContain('First on record in this reading.')
  })

  it('names the recommendation as stored model prose, with its slot', () => {
    const markup = render(sheet())
    expect(markup).toContain('data-copy="stored"')
    expect(markup).toContain('data-slot="pass_d_b_recommendation"')
  })
})

describe('which rows the figure cards are about', () => {
  it('leads with the widest gap that cleared its band', () => {
    const gaps = overviewFixture().subjects.gaps
    expect(leadGap(gaps)?.objectId).toBeTruthy()
  })

  it('answers with a refused gap rather than nothing — that is Sealand today', () => {
    const only = { s1: { ...overviewFixture().subjects.gaps.s1!, state: 'too_little_data' as const, gapPts: null, bandPts: null } }
    expect(leadGap(only)?.state).toBe('too_little_data')
  })

  // The card's headline used to be `gapLine(gap).split(' · ').pop()` — the
  // value reconstructed from the sentence that carries it, which breaks the
  // moment either side's `levelOf` contains the separator. Its live edge:
  // `apart` with no magnitude fell past the hero test and printed a bare
  // "apart", a headline that says the sides differ and declines to say by how
  // much without saying so.
  it('takes the refusal word from GAP_WORDS, and says when “apart” has no magnitude', () => {
    const one = overviewFixture().subjects.gaps.s1!
    const refused = { s1: { ...one, state: 'refused' as const, gapPts: null, bandPts: null } }
    const base = overviewFixture()
    const words = (gaps: Record<string, Gap | null>) => renderText(sheet({ ...base, subjects: { ...base.subjects, gaps } }))
    expect(words(refused)).toContain('comparison refused')
    const bare = { s1: { ...one, state: 'apart' as const, gapPts: null } }
    expect(words(bare)).toContain('apart, by an amount this reading did not state')
  })

  it('has no gap to lead with when no subject read on both sides', () => {
    expect(leadGap({})).toBeNull()
    expect(leadSubject([])).toBeNull()
  })

  it('picks the biggest banded move on the side that can carry one', () => {
    // Durability moved 3.2 points, Price −3.1: the category is the only side
    // with the n to carry a month on this corpus.
    expect(leadSubject(overviewFixture().subjects.rows)?.id).toBe('s1')
  })

  // Three cards about one subject is one card. The artboard leads with the
  // Durability gap and closes with Price, which is what a three-up row is for.
  it('steps over the subject the gap card already took', () => {
    const rows = overviewFixture().subjects.rows
    expect(leadSubject(rows, 's1')?.id).toBe('s2')
    // … and takes it anyway when it is the only subject there is.
    expect(leadSubject([rows[0]], 's1')?.id).toBe('s1')
  })

  it('draws the two cards about two different subjects', () => {
    const words = renderText(sheet())
    expect(words).toContain('Durability gap to Freitag')
    expect(words).toContain('Price')
  })
})

describe('the sheet inside the deck', () => {
  it('replaces the cover, and takes no other slide with it', () => {
    const markup = render(<DocumentDeck data={LEAD} date="18 Sep 2026" />)
    const words = markupText(markup)
    // The 58px cover is gone — it is the page a director had to turn past …
    expect(markup).not.toContain('text-[58px]')
    // … and EVERY borrowed section still prints its own slide. The sheet packs
    // a fragment of four of them and those blocks carry more than the
    // fragment: the month's own reading and its anomaly line, the category's
    // kinds and mood and quiet flags, every move row past the second. A
    // one-pager summarises the pages behind it; it does not delete them.
    for (const title of ['The month', 'The category', 'Your subjects', 'What was decided', 'Where you stand']) {
      expect(words).toContain(title)
    }
  })

  it('numbers the sheet 1 of the count the viewer header and the Studio bar print', () => {
    // WP19's bug, in the shape this package could have re-opened: the deck
    // paginates and `documentViewerPages` counts, and a client reads the
    // second above a document printed by the first ("built 18 Sep 2026 · N
    // pages"). One lead sheet plus one slide per layout entry, both sides.
    const words = markupText(render(<DocumentDeck data={LEAD} date="18 Sep 2026" />))
    const pages = documentViewerPages(LEAD)
    expect(pages).toBe(documentSlides(LEAD).length + 1)
    expect(pages).toBe(8)
    expect(words).toContain('1 / 8')
    expect(words).toContain('8 / 8')
  })

  it('falls back to the cover for every other template, and for a snapshot with no Overview', () => {
    expect(leadershipSheetData({ ...LEAD, template: 'market_brief', role: undefined })).toBeNull()
    expect(leadershipSheetData({ ...LEAD, surfaces: {} })).toBeNull()
    expect(leadershipSheetData({ ...LEAD, surfaces: undefined })).toBeNull()
    const markup = render(<DocumentDeck data={{ ...LEAD, template: 'market_brief' }} date="18 Sep 2026" />)
    expect(markup).toContain('text-[58px]')
  })

  // A STORED SNAPSHOT IS DATA, NOT A TYPE. `surfaces` has been frozen into
  // leadership briefs since 2026-08-30 and `subjects.gaps` / `moves.readings`
  // landed on 2026-09-18, so every brief built in that nineteen-day window
  // carries an Overview without them. Without the predicate the sheet's
  // `Object.values(gaps)` and `readings.length` are a TypeError inside a
  // server component, which takes down the share link, the viewer, the Studio
  // preview and the PDF route — not one sheet. Each field is dropped on its
  // own: a guard that only fires when all of them are missing is a guard that
  // misses the half-migrated snapshot.
  const without = (drop: (o: Record<string, unknown>) => void): DocumentSnapshotData => {
    const overview = JSON.parse(JSON.stringify(overviewFixture())) as Record<string, unknown>
    drop(overview)
    return { ...LEAD, surfaces: { overview } }
  }

  it('refuses a brief frozen before wave 1 rather than throwing inside the deck', () => {
    const noGaps = without((o) => { delete (o.subjects as Record<string, unknown>).gaps })
    const noReadings = without((o) => { delete (o.moves as Record<string, unknown>).readings })
    const noInterpretation = without((o) => { delete (o.sentence as Record<string, unknown>).interpretation })
    for (const pre of [noGaps, noReadings, noInterpretation]) {
      expect(leadershipSheetData(pre)).toBeNull()
    }
    // … and the deck renders what it always rendered for such a snapshot: the
    // 58px cover, then the ordinary slides. (`interpretation` is not one of
    // the wave-1 fields — it is dropped above only to prove the predicate
    // reads each shape on its own, and no stored brief is missing it.)
    for (const pre of [noGaps, noReadings]) {
      expect(render(<DocumentDeck data={pre} date="18 Sep 2026" />)).toContain('text-[58px]')
    }
  })

  it('reads a wave-1 Overview, and refuses anything that is not one', () => {
    expect(isLeadershipOverview(overviewFixture())).toBe(true)
    expect(isLeadershipOverview(refusedFixture())).toBe(true)
    for (const junk of [null, undefined, 'overview', 42, [], {}]) {
      expect(isLeadershipOverview(junk)).toBe(false)
    }
  })

  // THE FIX-FIRST SWAP, RENDERED. `ld.standing`'s framing promises "your own
  // share of the month beside every tracked rival" and the section named
  // `competitive.rivals`, the rival SELECTOR. `sections.test.ts` pins the key;
  // this asserts the block it now names actually DRAWS on a `layout="single"`
  // slide with `overflow: hidden`, which no test had seen — the same trap the
  // sheet's own height budget exists for. Measured through
  // `lib/render/chromium`: 0px over a 563px body.
  it('draws the standings table on its own slide, not the rival picker', () => {
    const standing: DocumentSnapshotData = {
      ...LEAD,
      surfaces: { ...LEAD.surfaces, competitive: competitiveFixture() },
    }
    const words = markupText(render(<DocumentDeck data={standing} date="18 Sep 2026" />))
    expect(words).toContain('Where you stand')
    // The standings block's own denominator line — the measurement the framing
    // promised — and not the selector's "N of their videos read".
    expect(words).toContain(competitiveFixture().standings.denominatorLine)
    expect(words).not.toMatch(/of their videos read/)
  })

  // The section's own readiness sentence — "we have not recorded X, and here is
  // who closes it" (`briefSections`, lib/reports/documents/load-reading.ts) —
  // is on `section.empty` and is printed by `SectionBody` in the slide's place.
  // It survives because the slide does: on a workspace with no subjects and no
  // decisions, which is Sealand today, the brief keeps the one line that tells
  // a reader what to do about it.
  it('keeps each blocked section’s readiness sentence, which names the input and its owner', () => {
    const blocked: DocumentSnapshotData = {
      ...LEAD,
      sections: LEAD.sections!.map((s) =>
        s.id === 'ld.subjects' ? { ...s, empty: 'Name your subjects in Settings — an operator confirms them.' } : s,
      ),
      surfaces: { overview: refusedFixture() },
    }
    const words = markupText(render(<DocumentDeck data={blocked} date="18 Sep 2026" />))
    expect(words).toContain('Name your subjects in Settings — an operator confirms them.')
  })
})
