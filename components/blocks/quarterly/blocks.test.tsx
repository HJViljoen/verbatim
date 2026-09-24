import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations, directionRe } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { QUARTERLY_BLOCK_KEYS, QUARTERLY_CLAIMS_CAVEAT, QUARTERLY_RULE, quarterGateSentence } from '@/lib/reports/quarterly'
import { CLAIMS_CAVEAT } from '@/lib/pages/market-surface'
import { leadGap, unsettledItems } from '@/lib/pages/quarterly'
import type { Verdict } from '@/lib/reading/verdicts'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { gapBasisLine, gapLine } from '@/lib/reading/gap'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { competitiveFixture } from '@/components/pages/competitive-surface/fixture'
import { QUARTERLY_BLOCKS, quarterlyBlocksFor } from './index'
import { afterQuarterFixture, closedFixture, formingFixture, quarterlyFixture, subjectLeadFixture, thinMonthFixture, thinQuarterFixture, unmentionedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [quarterlyFixture(), formingFixture(), closedFixture(), afterQuarterFixture(), thinMonthFixture(), thinQuarterFixture()]

describe('the eight pages', () => {
  it('render in all three modes on every state and keep the copy contract', () => {
    for (const data of STATES) {
      for (const block of quarterlyBlocksFor()) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  it('is one block per stored key, in the design’s order', () => {
    expect(quarterlyBlocksFor().map((b) => b.key)).toEqual([...QUARTERLY_BLOCK_KEYS])
    for (const key of QUARTERLY_BLOCK_KEYS) expect(QUARTERLY_BLOCKS[key].key).toBe(key)
  })

  it('drops a key this build no longer knows rather than breaking the artefact', () => {
    expect(quarterlyBlocksFor(['quarterly.cover', 'quarterly.gone', 'quarterly.method']).map((b) => b.key))
      .toEqual(['quarterly.cover', 'quarterly.method'])
  })

  it('never renders null — an empty page says so in words', () => {
    for (const data of STATES) {
      for (const block of quarterlyBlocksFor()) {
        for (const mode of MODES) {
          expect(render(block.render(data, mode, ctx)).length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('leaves no unsubstituted figure token anywhere', () => {
    for (const data of STATES) {
      for (const block of quarterlyBlocksFor()) {
        for (const mode of MODES) {
          expect(render(block.render(data, mode, ctx))).not.toMatch(/\[\[[a-z_]+\]\]/)
        }
      }
    }
  })

  it('prints no NaN, no undefined and no [object Object]', () => {
    // A fixture cast past the type checker (`as unknown as RecordInputs`) put
    // "NaN changes to what we track were made inside this window" on the
    // method page of two of three states, in all three modes, under 34 passing
    // tests. The cast is gone; this is the net under it.
    for (const data of STATES) {
      for (const block of quarterlyBlocksFor()) {
        for (const mode of MODES) {
          expect(renderText(block.render(data, mode, ctx))).not.toMatch(/\bNaN\b|\bundefined\b|\[object Object\]/)
        }
      }
    }
  })

  it('says one number one way across the eight pages', () => {
    for (const data of STATES) {
      const tables = quarterlyBlocksFor().map((b) => blockAnswers(b, data).figures)
      expect(figureConflicts(tables)).toEqual([])
    }
  })
})

describe('the email arm', () => {
  it('uses table markup with no class, no CSS variable, no flex and no grid', () => {
    for (const data of STATES) {
      for (const block of quarterlyBlocksFor()) {
        const markup = render(block.render(data, 'email', ctx))
        expect(markup).not.toMatch(/class="/)
        expect(markup).not.toMatch(/var\(--/)
        expect(markup).not.toMatch(/display:\s*(flex|grid)/)
      }
    }
  })
})

describe('the six-month gate', () => {
  const forming = formingFixture()

  it('is on the cover, above the fold', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(forming, 'app', ctx))
    expect(text).toContain('your 3rd monthly reading, the quarter view needs 6')
  })

  it('is on the subjects page, once, and not once per row', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.subjects'].render(forming, 'app', ctx))
    const sentence = quarterGateSentence(3)
    // The page prints the sentence or says why there is no table at all; both
    // are honest, and neither prints a quarter column with a number in it.
    expect(text.includes(sentence) || text.includes('not recorded') || text.includes('No subject has been named')).toBe(true)
    expect(text.split(sentence).length - 1).toBeLessThanOrEqual(1)
  })

  it('is on the last page, with when it settles AND the month it settles in', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(forming, 'app', ctx))
    // The refusal row states the gate once; the settles line keeps only when.
    expect(text.split('Quarter against quarter needs six months').length - 1).toBe(1)
    expect(text).toContain('once six readings stand behind it')
    // Three readings, the latest September: October, November, December make
    // six. `firstQuarterVerdictMonth` computes it and was called by nothing.
    expect(text).toContain('with Dec 2026')
  })

  it('is gone once six readings stand behind it', () => {
    const read = quarterlyFixture()
    const text = renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(read, 'app', ctx))
    expect(text).not.toContain('the quarter view needs 6')
  })

  // ON EVERY PAGE THAT PRINTS IT, not only the cover. The category page printed
  // it unconditionally, so a workspace standing at eight readings — one that
  // cleared the gate two readings ago — was told "Quarter against quarter needs
  // six months — you have 8." as a live caveat under its own basis line.
  // Copy de-clutter E19: the category page compares months, so the gate
  // does not bite there and is not printed at any reading count.
  it('is not on the category page', () => {
    expect(renderText(QUARTERLY_BLOCKS['quarterly.category'].render(forming, 'app', ctx)))
      .not.toContain(quarterGateSentence(3))
    for (const read of [quarterlyFixture(), afterQuarterFixture()]) {
      const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(read, 'app', ctx))
      expect(text).toContain('Movers and the mix are')
      expect(text).not.toContain('Quarter against quarter needs six months')
    }
  })
})

// A COMPARISON NEVER ATTEMPTED IS NOT A COMPARISON DRAWN. `unsettledItems`
// reads the verdicts the pages BUILT, so on a workspace whose quarter half
// cannot be read at all — production today, M3 unapplied — nothing is
// unanswered and the page fell to "Every comparison this quarter asked for was
// drawn.", five pages after one saying the quarter-on-quarter reading is not
// recorded for this workspace.
// THE READ PAGE ARGUES OVER THE QUARTER, so what it counts under that argument
// is the quarter's. `counted` walked the full verdict list — month verdicts
// included — under "What is counted under it", two lines below a paragraph
// saying "this quarter".
// EVERY DATE ON A CLIENT-FACING SHEET IS THE READER'S. The method table printed
// the quarter's bounds raw — "Period · 2026-07-01 – 2026-09-30" — where every
// other date on the eight pages goes through fullDate / shortDate / longMonth.
describe('the method page dates the quarter in words', () => {
  it('prints the period as dates a reader reads', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.method'].render(quarterlyFixture(), 'app', ctx))
    expect(text).toContain('1 Jul – 30 Sep 2026')
    expect(text).not.toContain('2026-07-01')
    expect(text).not.toContain('2026-09-30')
  })
})

// THE CATEGORY PAGE'S FOUR SILENCES, AND NO TWO OF THEM THE SAME CLAIM. The
// quarter's theme read is bounded to the movers the month named; a month that
// moved nothing names none, and that used to fall through to the measurement
// sentence — reporting a comparison that was never attempted as one that found
// nothing.
describe('the category page names which silence it is in', () => {
  it('says nothing was named to follow when the month moved nothing', () => {
    const thin = thinMonthFixture()
    // No theme comparison exists, because no theme was named to compare.
    expect(thin.category.quarter.some((v) => v.objectKind === 'theme')).toBe(false)
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(thin, 'app', ctx))
    expect(text).toContain('no theme was named to follow across this quarter')
    expect(text).not.toContain('carried a reading on both sides of this quarter')
    // And the state it is NOT in: the movers of a month that moved.
    expect(quarterlyFixture().category.quarter.some((v) => v.objectKind === 'theme')).toBe(true)
  })

  it('says the migration is missing where it is', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(formingFixture(), 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
  })

  it('says nothing at all where the pair was read and answered', () => {
    expect(quarterlyFixture().category.quarterNote).toBeNull()
  })
})

describe('the read page counts over the same window it argues over', () => {
  it('counts nothing where no quarter comparison could be made', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(formingFixture(), 'app', ctx))
    expect(text).not.toContain('What is counted under it')
  })

  it('counts the quarter’s own readings where they exist', () => {
    const read = quarterlyFixture()
    const quarter = read.read.verdicts.filter((v) => v.window.kind === 'quarter')
    const text = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(read, 'app', ctx))
    expect(text).toContain('What is counted under it')
    for (const line of read.read.counted) {
      // Every counted line names an object the QUARTER read, not a month one.
      expect(quarter.some((v) => line.startsWith(`${v.objectLabel}:`))).toBe(true)
    }
  })
})

// BUILD STATUS ABOUT AN UNSHIPPED FEATURE MUST NOT REACH A SENT ARTEFACT. The
// moves page forwarded the Market page's CLAIMS_CAVEAT unchanged, second
// sentence and all — the exact class WP18 removed from the monthly report.
describe('QR6 · what the claims caveat says on the artefact', () => {
  it('keeps the not-counted caveat and drops the build status', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.moves'].render(quarterlyFixture(), 'email', ctx))
    // Copy de-clutter E85: the not-counted state stays; the sentences that
    // restated the heading and the dating go.
    expect(text).toContain('is not counted yet')
    expect(text).not.toContain(QUARTERLY_CLAIMS_CAVEAT)
    expect(text).not.toContain('is not built yet')
    expect(CLAIMS_CAVEAT).toContain('is not built yet')
  })
})

describe('the last page tells a silence from a settled question', () => {
  it('says the quarter comparison was never attempted where it could not be', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(formingFixture(), 'app', ctx))
    expect(text).toContain('No quarter-on-quarter comparison was attempted')
    expect(text).not.toContain('Every comparison this quarter asked for was drawn')
  })

  it('still says every comparison was drawn where every comparison was made', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(quarterlyFixture(), 'app', ctx))
    expect(text).toContain('Every comparison this quarter asked for was drawn')
    expect(text).not.toContain('was attempted')
  })

  // THE PAGE WHOSE WHOLE PURPOSE IS TO LIST UNSETTLED ITEMS HAD NEVER BEEN
  // RENDERED WITH ONE. All four fixtures return `unsettled.items = []`, so the
  // copy-contract loop above passed over a page that broke rule (b) on every
  // row it drew: "not settled · comparison refused" was a data-copy="level"
  // with no "of N" in it, and none of the four reasons carries one. The items
  // here come from the real `unsettledItems` over real verdicts.
  it('keeps the copy contract with real unsettled rows on it', () => {
    const window = { kind: 'quarter' as const, from: '2026-07-01', to: '2026-09-30' }
    const verdicts: Verdict[] = [
      { objectKind: 'theme', objectId: 't9', objectLabel: 'Fit', audience: INDUSTRY_AUDIENCE, window, state: 'refused',
        value: { k: 1, n: 9 }, baseline: { k: 2, n: 12 }, changePts: null, bandPts: null, flags: [] },
      { objectKind: 'theme', objectId: 't8', objectLabel: 'Warranty', audience: INDUSTRY_AUDIENCE, window, state: 'too_little_data',
        value: { k: 2, n: 14 }, baseline: { k: 3, n: 19 }, changePts: null, bandPts: 3.4, flags: [] },
      { objectKind: 'theme', objectId: 't7', objectLabel: 'Price', audience: INDUSTRY_AUDIENCE, window, state: 'baseline_forming',
        value: { k: 4, n: 30 }, changePts: null, bandPts: null, flags: [] },
    ]
    const items = unsettledItems(verdicts)
    expect(items.length).toBe(3)
    const data = quarterlyFixture()
    data.unsettled = { ...data.unsettled, items, notAsked: null }
    for (const mode of MODES) assertCopyContract(render(QUARTERLY_BLOCKS['quarterly.unsettled'].render(data, mode, ctx)))
    expect(renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(data, 'email', ctx)))
      .toContain('not settled · comparison refused')
  })
})

describe('what each page owes the reader', () => {
  const data = quarterlyFixture()
  const forming = formingFixture()

  // THE RULE IS CHROME, NOT A PAGE. The deck's footer, the share page's header
  // and the email's masthead each print it once; a page that printed it too put
  // it twice on one sheet, which the browser render showed and the markup did
  // not. `transport.test.tsx` asserts the chrome carries it on every sheet.
  it('leaves the artefact-wide rule to the chrome, and says nothing twice', () => {
    for (const key of ['quarterly.cover', 'quarterly.method'] as const) {
      expect(renderText(QUARTERLY_BLOCKS[key].render(data, 'app', ctx))).not.toContain(QUARTERLY_RULE)
    }
    // The method page keeps a line of its own about its own labels.
    expect(renderText(QUARTERLY_BLOCKS['quarterly.method'].render(data, 'app', ctx)))
      .toContain('assigned by a fixed rule from counted data')
  })

  // Copy de-clutter E30 and L9: the Interpretation chip is the label; who
  // wrote the read is not a distinction a reader can act on.
  it('labels the interpretation page as interpretation, once', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(data, 'app', ctx))
    expect(text).toContain('Interpretation')
    expect(text).not.toContain('not a counted result')
    expect(text).not.toContain('We wrote this read ourselves')
  })

  it('says the category page is a month against a month, before any row', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(data, 'app', ctx))
    expect(text).toMatch(/Movers and the mix are \w+ against \w+\./)
  })

  it('draws the quarter’s own volume here and its object rows on page 2', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(data, 'app', ctx))
    // THE VOLUME, as two counts and never as a share of itself. The defect this
    // replaces printed "4,147 of 4,147 · no clear change" for every audience.
    expect(text).toContain('Videos read this quarter')
    expect(text).toContain('4,147')
    expect(text).toContain('against 3,810 in the quarter before it')
    expect(text).not.toContain('4,147 of 4,147')
    // THE QUARTER'S OBJECT ROWS MOVED TO PAGE 2 (Block D wave 2). `countedLines`
    // prints the three largest quarter readings off the SAME list, with both
    // sides' k of n, under the paragraph that argues from them — so a second
    // copy on this page was one artefact stating one comparison twice, and it
    // cost 279px of a 561px slide body.
    expect(text).not.toContain('Will it survive a wet commute 871')
    const read = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(data, 'app', ctx))
    expect(read).toContain('What is counted under it')
    expect(read).toContain('912 of 4,147')
    // AND THE POINTER NAMES A PAGE, NOT A NUMBER (D13). Only the print deck
    // paginates; the share shell and the email have no page numbers at all,
    // and the deck's own numbering moves when a snapshot omits a key.
    expect(text).not.toContain('the three largest quarter readings are under Our read')
    for (const mode of MODES) {
      expect(renderText(QUARTERLY_BLOCKS['quarterly.category'].render(data, mode, ctx))).not.toMatch(/on page \d/)
    }
  })

  it('never counts a comparison that cannot fail as an answered one', () => {
    // `confidenceOf` reads the same verdict list, so a self-comparison — which
    // always answered `no_clear_change` — inflated the confidence word too.
    for (const state of STATES) {
      for (const v of state.category.quarter) expect(v.value.k).not.toBe(v.value.n)
      for (const v of state.read.verdicts) expect(v.objectKind).not.toBe('audience')
    }
  })

  it('calls the category’s count the category’s, not every audience added up', () => {
    // The figure summed the window read across every audience — your own, each
    // rival's and the category's — and the prose called the total "the
    // category". On Össur's real Q3 rows that is ~1,306 against a category of
    // 1,134. The fixture's own pair is 4,147 category videos and 249 of yours.
    expect(data.cover.figures.quarter_videos?.value).toBe(4147)
    expect(renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(data, 'app', ctx))).toContain('The category was read across 4,147 videos')
  })

  it('argues the interpretation from the quarter’s own comparisons only', () => {
    // The slot's sentences all say "this quarter", so a month verdict handed to
    // it wrote "X cleared the band this quarter" about a month's reading — the
    // same figure the cover was calling a quarter change.
    const windows = new Set(data.read.interpretation ? data.category.quarter.map((v) => v.window.kind) : [])
    expect([...windows]).toEqual(['quarter'])
    const text = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(forming, 'app', ctx))
    expect(text).toContain('Nothing cleared its band this quarter')
  })

  it('states the volume of a read quarter and the silence of an unread one', () => {
    expect(forming.category.quarterVolume).toBeNull()
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(forming, 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
  })

  it('counts the advice ledger over the whole ledger, not over what it drew', () => {
    // "You acted on N of 12 this quarter" divided decisions dated inside the
    // quarter by the twelve OLDEST rows the page draws, out of 56 and 64.
    const text = renderText(QUARTERLY_BLOCKS['quarterly.moves'].render(data, 'app', ctx))
    expect(text).toMatch(/You have acted on \d+ of \d+\./)
    expect(text).not.toContain('every piece of advice this product has ever given you')
    expect(text).not.toMatch(/acted on \d+ of \d+ this quarter/)
    expect(data.moves.actedLine).toBe(marketFixture().advice.actedLine)
  })

  it('never lets a month outside the quarter speak for the quarter', () => {
    // The normal send: a Q3 review built on 6 October, whose month-level pages
    // are October's because nothing can rewind Overview, Market or Competitive
    // to a month that has passed. "November still filling" used to be stamped
    // on a closed quarter because both clauses keyed off overview.monthStatus.
    const after = afterQuarterFixture()
    expect(after.cover.stamp).toContain('the month-level pages read October, outside this quarter')
    expect(after.cover.stamp).not.toContain('still filling')
    expect(after.method.numbers[0].note).toBeUndefined()
    expect(after.category.basis).toContain('October is outside this quarter')
    // EVERY PAGE THAT PRINTS A MONTH FIGURE, not three of five. Page 3 named
    // its month and never said it fell outside the quarter, under a heading
    // reading "Q3 2026 against Q2 2026"; page 5 named no month at all and took
    // its meta from a different surface's read, printing "Sep 2026" while the
    // rest of the sheet said October.
    for (const key of ['quarterly.subjects', 'quarterly.rivals'] as const) {
      const text = renderText(QUARTERLY_BLOCKS[key].render(after, 'app', ctx))
      expect(text).toContain('October')
      expect(text).toContain('October is outside this quarter')
    }
    expect(after.rivals.monthLabel).toBe('October')
    // And a review of the quarter it is standing in still says so.
    expect(quarterlyFixture().cover.stamp).toContain('Q3 2026 still filling')
    expect(quarterlyFixture().cover.stamp).not.toContain('outside this quarter')
    for (const key of ['quarterly.subjects', 'quarterly.rivals'] as const) {
      expect(renderText(QUARTERLY_BLOCKS[key].render(quarterlyFixture(), 'app', ctx)))
        .not.toContain('outside this quarter')
    }
  })

  // Ruling L6: once per forwarded document, on its method page.
  it('states the no-causation promise once, on the method page', () => {
    expect(renderText(QUARTERLY_BLOCKS['quarterly.moves'].render(data, 'app', ctx))).not.toContain('We never claim you caused it.')
    expect(renderText(QUARTERLY_BLOCKS['quarterly.method'].render(data, 'app', ctx))).toContain('We never claim you caused it.')
  })

  it('never prints a MONTH’s record as the quarter’s', () => {
    // The fallback printed Overview's own record — a month's updates, a
    // month's video count and another page's refusals — under "How was this
    // quarter read?", above a table that said the corpus was not recorded.
    const text = renderText(QUARTERLY_BLOCKS['quarterly.method'].render(forming, 'app', ctx))
    expect(text).toContain('could not be recovered for this workspace')
    expect(text).not.toContain('3 updates delivered')
    expect(text).not.toContain('2,359 videos')
    expect(forming.method.lines).toEqual([])
  })

  it('tells an unrun check apart from a quiet quarter', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.method'].render(forming, 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
    expect(text).not.toMatch(/0 checks ran/)
  })

  it('says what each flag turned out to be', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.method'].render(data, 'app', ctx))
    expect(text).toContain('What it turned out to be')
  })

  it('tells "not observed" apart from "not recorded yet" on the rivals page', () => {
    // Nobody looked is not the same claim as we looked and they were not
    // there — the defect the Block B fix pass corrected on OV4 (c0102bd).
    const unrecorded = { ...data, rivals: { ...data.rivals, recorded: false } }
    expect(renderText(QUARTERLY_BLOCKS['quarterly.rivals'].render(unrecorded, 'app', ctx))).not.toContain('not observed')
    const recorded = {
      ...data,
      rivals: { ...data.rivals, recorded: true, rows: data.rivals.rows.map((r) => ({ ...r, attention: null, content: null })) },
    }
    expect(renderText(QUARTERLY_BLOCKS['quarterly.rivals'].render(recorded, 'app', ctx))).toContain('not observed')
  })

  it('carries Competitive’s own two rival reads rather than a second count of them', () => {
    // A deck composed from a page may not re-derive the page's figures: one
    // artefact, two counts of one thing, is how the two come to disagree.
    expect(data.rivals.ownPosts.map((c) => c.audience)).toEqual(
      competitiveFixture().ownClaims.map((c) => c.audience),
    )
    expect(data.rivals.saidAbout.map((s) => s.audience)).toEqual(
      competitiveFixture().saidAbout.map((s) => s.audience),
    )
    // Every census on a quarterly deck states the month its posts were
    // published in — the deck is quarter-scoped and this figure is not.
    for (const c of data.rivals.ownPosts) expect(c.basis).toMatch(/^posts published in /)
    // And nothing said about a rival is readable, so every row says so rather
    // than the section quietly not existing.
    for (const s of data.rivals.saidAbout) expect(s.empty).toBeTruthy()
  })

  it('draws the quarter columns on page 3, under the tenant’s OWN audience', () => {
    // Both faults at once: the verdicts were looked up under `subject:…` keys
    // nothing built, and the "you" key was the first RIVAL's audience where the
    // tenant's own is CLIENT_AUDIENCE. The best case that existed printed two
    // empty badges on every row and no sentence saying why.
    const text = renderText(QUARTERLY_BLOCKS['quarterly.subjects'].render(data, 'app', ctx))
    expect(data.subjects.rows[0].youQuarter).not.toBeNull()
    expect(data.subjects.rows[0].youQuarter?.audience).toBe(CLIENT_AUDIENCE)
    expect(data.subjects.rows[0].categoryQuarter).not.toBeNull()
    // THE ROW IS THE ARTBOARD'S FIVE COLUMNS NOW, NOT ONE SENTENCE. The build
    // stacked all four figures into "you 31% 26 of 84 · the category 22% 305 of
    // 1,388" and labelled each badge with its side because nothing else could
    // tell them apart; the port puts each figure in its own column under its own
    // header, which is what the labels were standing in for. So the assertion
    // moves from the sentence to the header row and the cells beneath it.
    expect(text).toContain('Subject You, September The category, September')
    expect(text).toContain('Durability 31.0% 26 of 84 22.0% 305 of 1,388')
    expect(data.subjects.quarterNote).toBeNull()
  })

  it('says why the quarter columns are empty rather than drawing two blanks', () => {
    const blank = { ...data, subjects: { ...data.subjects, rows: data.subjects.rows.map((r) => ({ ...r, youQuarter: null, categoryQuarter: null })), quarterNote: 'Your subjects are not counted as one window for this workspace yet, so the quarter columns cannot be drawn.' } }
    const text = renderText(QUARTERLY_BLOCKS['quarterly.subjects'].render(blank, 'app', ctx))
    expect(text).toContain('not counted as one window')
  })

  it('never prints a zero share for a side nobody read', () => {
    for (const state of STATES) {
      const text = renderText(QUARTERLY_BLOCKS['quarterly.subjects'].render(state, 'app', ctx))
      expect(text).not.toMatch(/0 of 0/)
    }
  })
})

describe('the model’s words are marked and the product’s are not', () => {
  it('marks a theme label so rule (c) cannot sweep it', () => {
    // "Concerns about declining quality" is a real register label; six blocks
    // failed rule (c) on labels like it in the Block B fix pass.
    const data = quarterlyFixture()
    const laden = {
      ...data,
      category: {
        ...data.category,
        growing: data.category.growing.map((m) => ({ ...m, label: 'Concerns about declining quality' })),
      },
    }
    for (const mode of MODES) {
      expect(copyViolations(render(QUARTERLY_BLOCKS['quarterly.category'].render(laden, mode, ctx)))).toEqual([])
    }
  })

  it('marks a stored status word so rule (a) does not check it for our digits', () => {
    const data = quarterlyFixture()
    const laden = {
      ...data,
      moves: { ...data.moves, advice: data.moves.advice.map((a) => ({ ...a, statusLabel: 'Working on it — 2 of 3 done' })) },
    }
    for (const mode of MODES) {
      expect(copyViolations(render(QUARTERLY_BLOCKS['quarterly.moves'].render(laden, mode, ctx)))).toEqual([])
    }
  })
})

// ---- D1 · the quarter gap on page 3 -------------------------------------------

describe('the two-audience gap the quarter can actually carry', () => {
  const row = () => quarterlyFixture().subjects.rows.find((r) => r.id === 's1')!

  it('is drawn between the two columns the table prints, at the quarter’s own n', () => {
    const gap = row().gap!
    expect(gap.window.kind).toBe('quarter')
    expect(gap.a.audience).toBe(CLIENT_AUDIENCE)
    expect(gap.b.audience).toBe(INDUSTRY_AUDIENCE)
    // The same counts the two quarter columns are drawn from — one reading of
    // one pair of numbers, never a second measurement.
    expect(gap.a.value).toEqual(row().youQuarter!.value)
    expect(gap.b.value).toEqual(row().categoryQuarter!.value)
  })

  it('clears its band where a month could not — which is the honest scale for this claim', () => {
    const gap = row().gap!
    expect(gap.state).toBe('apart')
    expect(gapLine(gap)).toBe('you 30.1% of 249 · The category 22.0% of 4,147 · 8.1 points apart (band 6)')
  })

  it('prints the prior quarter as its own dated reading with its own band, never as "narrowed"', () => {
    const line = gapBasisLine(row().gap!) as string
    expect(line).toMatch(/^7\.8 points apart in the quarter from April \(band /)
    expect(line).not.toContain('narrowed')
    expect(line.match(directionRe())).toBeNull()
  })

  it('names its own quarter, because the row’s body prints the MONTH’s levels', () => {
    const data = quarterlyFixture()
    const body = renderText(QUARTERLY_BLOCKS['quarterly.subjects'].render(data, 'app', ctx))
    // The row prints your month beside the category's month …
    expect(body).toContain('31.0% 26 of 84')
    // … and the gap is of the quarter, so the line wave 2 binds says so.
    const labelled = gapLine(row().gap!, { period: true })
    expect(labelled).toBe(
      'The quarter from July 2026 · you 30.1% of 249 · The category 22.0% of 4,147 · 8.1 points apart (band 6)',
    )
    expect(labelled.match(directionRe())).toBeNull()
  })

  it('claims no direction — no reader’s flag is true in wave 1', () => {
    expect(row().gap!.direction).toBeNull()
  })

  it('draws no gap where a column could not be drawn, and none at all with M3 unapplied', () => {
    expect(formingFixture().subjects.rows.every((r) => r.gap == null)).toBe(true)
  })

  // A SUBJECT NOBODY MENTIONED IS 0 OF N, NOT AN UNREAD COLUMN.
  // `window_subject_readings` emits no row for a zero, and requiring a row on
  // both sides dropped the subject — on Sealand's Q2 2026 card, six of seven.
  it('reads a subject with no row on a read side as zero, and still draws it', () => {
    const data = unmentionedFixture()
    const row = data.subjects.rows.find((r) => r.id === 's6')
    expect(row?.youQuarter?.value).toEqual({ k: 0, n: 249 })
    expect(row?.youQuarter?.baseline?.k).toBe(0)
    expect(row?.categoryQuarter).toBeTruthy()
    expect(renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(data, 'app', ctx)))
      .not.toContain('neither side read')
  })
})

describe('the quotes a page declares (qr.p3.quote, qr.p4.quote)', () => {
  it('pages 3 and 4 answer quotes() with refs, never words', () => {
    // The month's voices are the LEAD object's evidence, so the page that
    // claims them is the page the lead belongs to: a theme lead on page 4, a
    // subject lead on page 3.
    for (const [data, key] of [
      [quarterlyFixture(), 'quarterly.category'],
      [subjectLeadFixture(), 'quarterly.subjects'],
    ] as const) {
      const refs = blockAnswers(QUARTERLY_BLOCKS[key], data).quotes
      expect(refs.length).toBeGreaterThan(0)
      // `e:` / `c:` / `v:` — an ADDRESS. A block handing back text would be a
      // second place for a third party's words to leak into a snapshot.
      for (const ref of refs) expect(ref).toMatch(/^[ecvmp]:|^h:|^b:/)
    }
  })

  it('a page declares no quote for evidence cited about something else', () => {
    // A theme's supporting insights are not a subject's evidence, and the
    // Overview block already refuses them on exactly this rule. Unfiltered,
    // one printed artefact carried the same two quotes on pages 2, 3 and 4.
    expect(blockAnswers(QUARTERLY_BLOCKS['quarterly.subjects'], quarterlyFixture()).quotes).toEqual([])
    expect(blockAnswers(QUARTERLY_BLOCKS['quarterly.category'], subjectLeadFixture()).quotes).toEqual([])
  })

  it('declares none where nothing was read', () => {
    const data = formingFixture()
    for (const key of ['quarterly.subjects', 'quarterly.category'] as const) {
      expect(blockAnswers(QUARTERLY_BLOCKS[key], data).quotes).toEqual([])
    }
  })
})

// ---- the wave-2 port · every element this package bound ------------------------
//
// ONE ASSERTION PER ELEMENT THE MAPPING LISTED, so a later change that drops a
// field on the floor again fails here rather than in a screenshot six weeks on.
// `status/mock-gap/QuarterlyReview.md` is the list; the ids are its ids.

describe('the artboard port (Block D wave 2)', () => {
  const data = quarterlyFixture()
  const forming = formingFixture()
  const thinQuarter = thinQuarterFixture()
  const text = (key: keyof typeof QUARTERLY_BLOCKS, d = data) => renderText(QUARTERLY_BLOCKS[key].render(d, 'print', ctx))

  it('qr.p1.footer · the platforms the corpus was read on, and no per-month split', () => {
    const t = text('quarterly.cover')
    // The artboard's own first half of this line — page 7 was the only page
    // carrying it.
    expect(t).toContain('TikTok 38%')
    // AND NOT the artboard's per-month split: the figure beside it is a
    // WINDOWED count of distinct videos, which three month counts do not add
    // to (D8). Printing them side by side invites exactly that addition.
    expect(t).not.toMatch(/Jul [\d,]+ · Aug [\d,]+ · Sep [\d,]+/)
  })

  it('qr.p1 / qr.p2.meta · the corpus line is not printed twice on two sheets', () => {
    // It was. The whole line — mix, counts and updates — sat under the cover's
    // figures AND, verbatim, as the first line of the card beside the argument
    // on the very next sheet, where `readingCounter` was joined to it and the
    // cover's own stamp two lines above had already printed that too.
    const cover = text('quarterly.cover')
    const read = text('quarterly.read')
    // The counts are on the page that argues from them, once.
    expect(read).toContain('4,147 category videos read in Q3 2026')
    expect(cover).not.toContain('4,147 category videos read in Q3 2026')
    // The mix is on the cover, once — the artboard's own `qr.p1.footer`.
    expect(cover).toContain('TikTok 38%')
    expect(read).not.toContain('TikTok 38%')
  })

  // Never a guessed list: a workspace with no recorded mix gets no footer at
  // all rather than a sentence about our own bookkeeping.
  it('qr.p1.footer · prints nothing where no platform mix was recorded', () => {
    const forming = formingFixture()
    expect(forming.cover.corpus).toBe('')
    const t = renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(forming, 'print', ctx))
    expect(t).toContain(forming.cover.stamp)
  })

  it('qr.p1.stats · one magnitude in the display slot, its denominator under it', () => {
    // The 28px mono slot held a derived difference ("8.1 pts"), a raw count
    // ("41,200") and a LEVEL ("912 of 4,147") at one size, so the cover's
    // largest type did not read as one measure stated three times. A level is
    // set the way the whole product sets one: the magnitude, then the "of N"
    // under it — and the PAIR is still the level node rule (b) reads.
    const markup = render(QUARTERLY_BLOCKS['quarterly.cover'].render(data, 'print', ctx))
    expect(markup).toMatch(/text-\[28px\][^>]*>912</)
    expect(markup).toMatch(/data-copy="level"[\s\S]{0,400}of 4,147/)
    expect(markup).not.toMatch(/text-\[28px\][^>]*>912 of 4,147</)
    for (const mode of MODES) assertCopyContract(render(QUARTERLY_BLOCKS['quarterly.cover'].render(data, mode, ctx)))
  })

  it('qr.p1.cover · one h1 per document, and one gutter', () => {
    // The share shell puts each block inside a card with its own padding and
    // under its own 30px `<h1>`; the print deck's `Slide` carries an `<h1>`
    // too. The hero's own heading is subordinate to both.
    for (const mode of MODES) {
      expect(render(QUARTERLY_BLOCKS['quarterly.cover'].render(data, mode, ctx))).not.toContain('<h1')
    }
    expect(render(QUARTERLY_BLOCKS['quarterly.cover'].render(data, 'app', ctx))).not.toContain('px-[6%]')
    expect(render(QUARTERLY_BLOCKS['quarterly.cover'].render(data, 'print', ctx))).toContain('px-[6%]')
  })

  it('qr.p1.stats · the cover carries the quarter gap, the panel and a banded quarter step', () => {
    const t = text('quarterly.cover')
    // The gap, with both sides and the band — never "narrowed".
    expect(t).toContain('8.1 points apart (band 6)')
    expect(t).toContain('7.8 points apart in the quarter from April')
    // THE TWO DIFFERENCES DO NOT RUN TOGETHER, and the label is not joined to
    // the caption with a full stop it does not have. D1 is the whole reason
    // this card carries two readings instead of the word "narrowed"; they have
    // to read as two.
    expect(t).not.toContain('(band 6) · 7.8 points apart')
    // And "The category" does not carry its capital into mid-sentence.
    expect(t).toContain('you against the category')
    for (const mode of MODES) {
      expect(renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(data, mode, ctx))).not.toMatch(/\. [a-z]/)
    }
    expect(t.match(directionRe())).toBeNull()
    // The panel's level and the size of the panel, never "−18% since June".
    expect(t).toContain('a fixed panel of 214 accounts')
    expect(t).not.toContain('since June')
    // The largest banded quarter step, as its two counts.
    expect(t).toContain('against 686 of 3,810 in Q2 2026')
    // Exactly three cards, which is the mock's grid.
    expect(data.cover.stats).toHaveLength(3)
  })

  it('qr.p1.stats · falls back to real figures rather than three absences', () => {
    // Below the migrations none of the three mock measures reads, and a cover
    // of three silences is not the artefact.
    expect(forming.cover.stats).toHaveLength(3)
    expect(forming.cover.stats.map((s) => s.token)).toEqual(['lead_share', 'month_videos', 'readings'])
  })

  it('qr.p2.meta / .whatitmeans / .standingadvice / .confidence', () => {
    const t = text('quarterly.read')
    // The three facts that were split across pages 1 and 7.
    expect(t).toContain('4,147 category videos read in Q3 2026')
    // The counter is the cover's stat card's alone (copy de-clutter E16).
    expect(t).not.toContain('your 8th monthly reading')
    // The grounding count; its all-time basis is said once, under the moves
    // page's ledger (ruling C).
    expect(t).toContain('videos behind it')
    // The confidence dots are aria-hidden; the WORD and its sentence remain.
    expect(t).toContain('reasonable')
    expect(render(QUARTERLY_BLOCKS['quarterly.read'].render(data, 'print', ctx))).toContain('aria-hidden')
  })

  it('qr.p2.headline · the headline is ONE sentence, never the whole slot', () => {
    // `Interpretation.sentences` is one element per MODEL sentence and one
    // per composed CLAUSE GROUP where the code wrote it — and the quarterly
    // fallback's first element is two sentences. Cutting on elements set the
    // entire argument at 22px on every state this branch can render.
    for (const state of STATES) {
      const markup = render(QUARTERLY_BLOCKS['quarterly.read'].render(state, 'app', ctx))
      // AND THE SIZE IS ON THE PARAGRAPH. `TokenProse` renders its own `<p>`
      // with a 13.5px default unless a className is passed, so a size set on
      // a wrapper around it did nothing at all: the "headline" was body size
      // on every sheet this branch rendered.
      const headline = markup.match(/<p[^>]*text-\[27px\][^>]*>([\s\S]*?)<\/p>/)
      expect(headline).not.toBeNull()
      const words = headline![1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      expect(words.replace(/\.$/, '')).not.toContain('. ')
    }
  })

  it('qr.p2.whatitmeans · the card renders where the slot runs to three sentences', () => {
    // The guard is right — below three, splitting the last sentence out
    // leaves the headline with no body — but no state exercised the arm it
    // guards, so the element the brief listed as MISSING shipped nowhere.
    // `thinQuarterFixture()` reaches it the way production does: small
    // window reads, `quarterChange` answering `too_little_data`, and the
    // fallback composing its thin-comparison sentence as well as its opener.
    const t = text('quarterly.read', thinQuarter)
    expect(t).toContain('What it means')
    expect(t).toContain('carried too few videos to compare, so they are printed as levels only')
    // And the card does NOT appear where the slot is two sentences long.
    expect(text('quarterly.read')).not.toContain('What it means')
  })

  it('qr.p2.standingadvice · a pruned grounding says so rather than printing a zero', () => {
    const t = text('quarterly.read', forming)
    expect(t).toContain('no longer on record')
    expect(t).not.toContain('0 videos behind it')
  })

  it('the cover and page 3 lead with the SAME gap', () => {
    // Two rules for one claim: the cover sorted so `apart` won, page 3 took
    // the first row that carried a gap at all. `leadGap` is the one rule.
    for (const state of STATES) {
      const lead = leadGap(state.subjects.rows.map((r) => r.gap))
      if (!lead) continue
      const cover = renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(state, 'print', ctx))
      const page3 = renderText(QUARTERLY_BLOCKS['quarterly.subjects'].render(state, 'print', ctx))
      expect(cover).toContain(lead.objectLabel)
      expect(page3).toContain(`${lead.objectLabel}: `)
    }
  })

  it('qr.p3.* · five columns, the gap headline, the chart and the rival level', () => {
    const t = text('quarterly.subjects')
    expect(t).toContain('Subject You, September The category, September')
    expect(t).toContain('Durability 31.0% 26 of 84 22.0% 305 of 1,388')
    // The gap, NAMED, and labelled with its own period because the row prints
    // the month's. `gapLine` carries no object label of its own, so without
    // this the page's opening line read as the page's gap when it is one
    // subject's.
    expect(t).toContain('Durability: The quarter from July 2026 · you 30.1% of 249')
    // The chart, and the rival's own month as a level beside it.
    expect(render(QUARTERLY_BLOCKS['quarterly.subjects'].render(data, 'print', ctx))).toContain('<svg')
    expect(t).toContain('Freitag, September:')
  })

  it('qr.p4.movers · two banded arms, no direction word in a heading', () => {
    const t = text('quarterly.category')
    // THE DISTINGUISHING WORD FIRST. The two headings used to be identical
    // until their fifth word and both wrapped to two lines in a 1fr track.
    expect(t).toContain('Larger share than last month')
    expect(t).toContain('Smaller share than last month')
    // The band rides on every row's badge; the heading aside that said so
    // went (copy de-clutter E76).
    expect(t).not.toContain('each cleared its own band')
    // Still no direction word in either heading (D5).
    expect(t).not.toContain('Growing')
    expect(t).not.toContain('Fading')
    // The months a mover's own series carried, WITH THE UNIT — the same share
    // the FigureCell two rows up prints — and the first month it was read.
    expect(t).toContain('Jul 5.1% · Aug 6.8% · Sep 9.4%')
    expect(t).toContain('first read May 2026')
    // Rule (c) over the whole block, with live theme labels on it.
    for (const mode of MODES) assertCopyContract(render(QUARTERLY_BLOCKS['quarterly.category'].render(data, mode, ctx)))
  })

  it('qr.p4.flags · the register’s dormant themes, as flags and never as a direction', () => {
    const t = text('quarterly.category')
    expect(t).toContain('gone quiet')
    expect(t).toContain('last read Jun 2026')
    // The flag sits inside a verdict node — that marker is what says it is the
    // register's fact and not a claim about a series.
    expect(render(QUARTERLY_BLOCKS['quarterly.category'].render(data, 'print', ctx)))
      .toMatch(/data-copy="verdict"[^>]*>[^<]*<span[^>]*>gone quiet/)
  })

  it('qr.p4.movers · the movers’ note prints once, on every state', () => {
    // It was printed by the movers-empty arm AND unconditionally by the flags
    // block, so a month with nothing moving said it twice on one sheet.
    for (const state of STATES) {
      const note = state.category.moversNote
      if (!note) continue
      const t = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(state, 'print', ctx))
      expect(t.split(note).length - 1).toBe(1)
    }
  })

  it('qr.p4.kinds · rows with their own "of N", and no partition bar', () => {
    const t = text('quarterly.category')
    expect(t).toContain('470 of 1,388')
    // D4 · the kinds do not add up to the denominator and the page says so.
    expect(t).toContain('do not add up to them')
    expect(t).not.toContain('Other kinds')
  })

  it('qr.p4.attention · the chart and the banded step, never a raw percentage', () => {
    const t = text('quarterly.category')
    expect(t).toContain('a fixed panel of 214 accounts')
    expect(t).toContain('comparison refused')
    expect(t).not.toContain('18% since June')
  })

  it('qr.p4.mood · four rows including Mixed, with the framing footnote', () => {
    const t = text('quarterly.category')
    expect(t).toContain('Mixed')
    expect(t).toContain('20 of 1,112 judged')
  })

  it('qr.p4.mood · the partition bar D15 licenses, with its legend in the rows', () => {
    // A video is judged ONCE and the four shares are 100% of one denominator,
    // so D4 — which is about kinds, whose counts run to 175–228% of theirs —
    // never reached the mood. D15 governs it and licenses the bar.
    const markup = render(QUARTERLY_BLOCKS['quarterly.category'].render(data, 'print', ctx))
    // Four segments, one per mood, `mixed` among them.
    expect(markup).toContain('var(--mixed)')
    expect(markup).toContain('var(--positive)')
    expect(markup).toContain('var(--negative)')
    expect(markup).toContain('var(--neutral-seg)')
    // IDENTITY IS NEVER COLOUR ALONE. The bar carries no legend of its own
    // because the four rows under it are the legend — so every colour in the
    // bar is also beside a label. Four swatches in the bar, four in the rows.
    expect((markup.match(/var\(--mixed\)/g) ?? []).length).toBe(2)
    for (const mode of MODES) assertCopyContract(render(QUARTERLY_BLOCKS['quarterly.category'].render(data, mode, ctx)))
  })

  it('qr.p5.col.* · the month cells, and the refusal’s reason in print', () => {
    const t = text('quarterly.rivals')
    // THE UNIT IS IN THE HEADER AND ON EVERY CELL. The first cut drew two
    // shapes under one header — a `FigureCell` on a brand with no month
    // series and bare, unitless values on the ones that had one — so a
    // reader could not tell that "15%" and "2.4" were the same measure.
    expect(t).toContain('Attention % · Jul Aug Sep')
    expect(t).toContain('Content % · Jul Aug Sep')
    // Every month cell prints its unit, on the row that HAS a series…
    expect(t).toContain('2.4%')
    expect(t).toContain('0.9%')
    // …and the newest month's counts print under the cells, on every row,
    // so nothing on this table is a share of nothing in particular.
    expect(t).toContain('6,200 of 41,200')
    expect(t).toContain('2,400 of 41,200')
    expect(t).not.toContain('the counts under each cell are that month’s')
    // And no bare unitless month value survives anywhere on the table.
    expect(t).not.toMatch(/2\.4\s+0\.9/)
    // PRINTED, not a `title` — a tooltip is nothing at all on paper.
    expect(t).toContain('what we track changed inside this window')
  })

  it('qr.p5 · declares the comparisons it draws, and not the one it stopped drawing', () => {
    // The ported table has one badge column (`Change · attention`); the
    // content badge the old aside printed is gone, and `verdicts()` went on
    // declaring `contentVerdict` to `blockAnswers` — a comparison this
    // artefact does not print, counted as one it did.
    const drawn = QUARTERLY_BLOCKS['quarterly.rivals'].verdicts?.(data) ?? []
    const content = data.rivals.rows.map((r) => r.contentVerdict).filter((v) => v != null)
    expect(content.length).toBeGreaterThan(0)
    for (const v of content) expect(drawn).not.toContain(v)
    for (const v of data.rivals.rows.map((r) => r.attentionVerdict).filter((v) => v != null)) {
      expect(drawn).toContain(v)
    }
  })

  it('qr.p5.h2h · five measures, and three of them say why no band was drawn', () => {
    const t = text('quarterly.rivals')
    expect(t).toContain('Head to head, then and now')
    // CO18: the reader's words, not the analyst's — "a share of a population"
    // and "a median of per-video rates" were the analyst's sentence about the
    // measurement. What each has to carry is unchanged: why no band, and that
    // both months print in its place.
    expect(t).toContain('Comments per video is an average, not a count out of a total')
    expect(t).toContain('Engagement is the middle video’s rate')
    expect(t).toContain('Posts published is a plain count with nothing to be out of')
    // And the Reddit exclusion note the engagement rows need.
    expect(t).toContain('Reddit is excluded from every engagement figure')
  })

  it('qr.p5.whattheysay · three absence states, never a zero', () => {
    const t = text('quarterly.rivals')
    expect(t).toContain('No post was published in this period')
    expect(t).toContain('No account is configured for this rival')
    expect(t).toContain('cleared the comment floor')
  })

  it('qr.p5.whatasked · the brand prefix and the occurrence count', () => {
    const t = text('quarterly.rivals')
    expect(t).toContain('Ottobock: Viewers ask about')
    expect(t).toContain('41 comments behind it in this window')
  })

  // Ruling L6: the promise is on the method page, once per document.
  it('qr.p6.masthead · the moves page carries no promise over itself', () => {
    expect(text('quarterly.moves')).not.toContain('We never claim you caused it.')
    expect(text('quarterly.method')).toContain('We never claim you caused it.')
  })

  it('qr.p6.move1 · the reading behind a move, its control and its chart', () => {
    const t = text('quarterly.moves')
    expect(t).toContain('Push repairability')
    expect(t).toContain('declared 12 Aug')
    // The control audiences — what moved on the sides you did not touch, each
    // with the side it was read on. The label alone put two rows with the same
    // words and different denominators directly above one another.
    expect(t).toContain('Repair & warranty · in the category 153 of 1,388')
    expect(t).toContain('Repair & warranty · under Freitag 41 of 142')
    expect(render(QUARTERLY_BLOCKS['quarterly.moves'].render(data, 'print', ctx))).toContain('<svg')
    // AN UNREAD MOVE'S CARD SAYS ITS TITLE AND SUBJECT ONCE. `move.line` is a
    // whole ledger sentence that opens with both, and the card's eyebrow and
    // mono line had already printed them.
    expect(t).toContain('first scoring lands with the')
    expect(t).not.toMatch(/Say less about recycling[\s\S]{0,40}Say less about recycling/)
  })

  it('qr.p6.ledger · numbered, grounded, and what happened afterwards', () => {
    const t = text('quarterly.moves')
    // The basis once, under the ledger, not on each row (ruling C).
    expect(t.split('counted over everything we have read for you').length - 1).toBe(1)
    expect(t).toContain('videos behind it')
    expect(t).toContain('Afterwards:')
    // D12 · the ratio is the whole ledger's; the trailer is gone (ruling D).
    expect(t).toMatch(/You have acted on \d+ of \d+\./)
    expect(t).not.toContain('every piece of advice this product has ever given you')
  })

  it('qr.p6.sayhear · the counts are named as not recorded, never printed as zero', () => {
    const t = text('quarterly.moves')
    expect(t).toContain('how many pushed back is not counted yet')
    expect(t).not.toMatch(/echoed 0/)
  })

  it('qr.p6.plan · the plan re-checked, with the population every count is of', () => {
    const t = text('quarterly.moves')
    expect(t).toContain('The plan, re-checked')
    expect(t).toContain('Untested → Supported')
    // The basis only; the floor and the hold are How to read material (E86).
    expect(t).not.toContain('at least 1 real comment stands behind it')
    expect(t).not.toContain('nothing here is held across two updates before it is printed')
  })

  it('qr.p7.method · the record as four paragraphs, in order, with every word kept', () => {
    // Thirteen free-standing lines a pixel apart, each one line long in a
    // 674px column, read as a log beside the artboard's four paragraphs of
    // method prose. Nothing is regrouped and nothing is reworded: the
    // sentences are `recordLines`' own, in `recordLines`' own order.
    const markup = render(QUARTERLY_BLOCKS['quarterly.method'].render(data, 'print', ctx))
    const t = renderText(QUARTERLY_BLOCKS['quarterly.method'].render(data, 'print', ctx))
    for (const line of data.method.lines) expect(t).toContain(line)
    // In order, and each one exactly once.
    let at = -1
    for (const line of data.method.lines) {
      const next = t.indexOf(line)
      expect(next).toBeGreaterThan(at)
      at = next
      expect(t.split(line).length - 1).toBe(1)
    }
    // AND THEY SHARE PARAGRAPHS. Twelve sentences in four nodes means
    // consecutive sentences sit inside one `<p>`, separated by a space.
    expect(data.method.lines.length).toBeGreaterThan(4)
    expect(markup).toContain(`${data.method.lines[0]} ${data.method.lines[1]}`)
    for (const mode of MODES) assertCopyContract(render(QUARTERLY_BLOCKS['quarterly.method'].render(data, mode, ctx)))
  })

  it('qr.p7.numbers · Sources and Held back among them, and no language share (2026-09-24)', () => {
    const labels = data.method.numbers.map((r) => r.label)
    expect(labels).toContain('Sources')
    expect(labels).toContain('Held back')
    expect(labels).not.toContain('Languages')
    // D5 · deliberately not the mock's "Conversations".
    expect(labels).not.toContain('Conversations')
  })

  it('qr.p8.waiting · a headline and a badge per wait, as the artboard draws it', () => {
    const t = text('quarterly.unsettled')
    // THE ARTBOARD'S SHAPE: a named open question, then the badge that says
    // why it is open. Built as bare sentences the page printed three unheaded
    // paragraphs in a row.
    expect(t).toContain('Say less about recycling tracked 14 Sep')
    expect(t).toContain('no reading behind it yet')
    expect(t).toContain('Shipping and delivery times')
    expect(t).toContain('not read since Jun 2026')
    expect(t).toContain('A theme is never called dead, only dormant')
    // NO SENTENCE PRINTS ITSELF TWICE. `move.line` opens with the title and
    // the subject, and the wait is headed with the title, so the body is the
    // tail (`moveTail`) — the same rule page 6's card follows.
    expect(t).toContain('tracked 14 Sep · first scoring lands with the October reading')
    expect(t).not.toMatch(/Say less about recycling[\s\S]{0,40}Say less about recycling/)
    // AND NO AGREEMENT IS CLAIMED OVER A LABEL THIS CODE DID NOT WRITE. A
    // theme label is as often plural as singular.
    expect(t).not.toMatch(/times has not been read/)
    // THE BADGE IS A STATE, NEVER A DIRECTION. "gone quiet" is a
    // DIRECTION_WORD and belongs on page 4 inside a verdict node.
    for (const state of STATES) {
      for (const mode of MODES) assertCopyContract(render(QUARTERLY_BLOCKS['quarterly.unsettled'].render(state, mode, ctx)))
    }
  })

  it('qr.p8 · neither list is unbounded, and the page says what it did not show', () => {
    // A sheet is a fixed 297 × 167mm box with `overflow: hidden`. One wait is
    // produced per subject whose quarter column could not be drawn, per unread
    // move and per dormant theme, and one item per comparison that did not
    // clear — so a workspace whose quarter mostly could not be read overran the
    // page in silence, which is the one failure this artefact is arranged to
    // avoid. Both lists are bounded and the page prints the count it held back.
    const t = text('quarterly.unsettled', thinQuarter)
    expect(thinQuarter.unsettled.items.length).toBeLessThanOrEqual(3)
    expect(thinQuarter.unsettled.itemsMore).toBeGreaterThan(0)
    expect(t).toContain('more were drawn and did not clear their band')
    // And on a state with nothing held back, no remainder sentence appears.
    expect(data.unsettled.itemsMore).toBe(0)
    expect(data.unsettled.waitingMore).toBe(0)
    expect(text('quarterly.unsettled')).not.toContain('more are waiting on a reading')
  })

  it('qr.p8.heldback · the gate’s share, and why no sample is drawn', () => {
    const t = text('quarterly.unsettled')
    expect(t).toContain('of what the search plan gathered')
    expect(t).toContain('is not readable on this workspace’s own session')
  })

  it('qr.p8.searchplan · the term yield with its own clock named', () => {
    const t = text('quarterly.unsettled')
    expect(t).toContain('eco bag')
    expect(t).toContain('12 of 410 kept')
    expect(t).toContain('found something and kept nothing')
  })

  it('qr.p8.changelog · the dated log, with the actor as a role', () => {
    const t = text('quarterly.unsettled')
    expect(t).toContain('3 Sep 2026')
    expect(t).toContain('Poler was added to the tracked set')
    expect(t).toContain('an operator')
  })

  it('qr.p8.settles · no promised calendar date, on any state', () => {
    // D14 · the mock's "Next update: 4 October" has no field on this artefact.
    for (const state of STATES) {
      const t = renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(state, 'print', ctx))
      expect(t).not.toMatch(/Next update/i)
    }
  })

  it('qr.p8.footer · the privacy sentence is on the last page', () => {
    expect(text('quarterly.unsettled')).toContain('Commenters are never identified')
  })
})
