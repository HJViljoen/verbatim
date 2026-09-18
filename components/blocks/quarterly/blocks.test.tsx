import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations, directionRe } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { QUARTERLY_BLOCK_KEYS, QUARTERLY_CLAIMS_CAVEAT, QUARTERLY_RULE, quarterGateSentence } from '@/lib/reports/quarterly'
import { CLAIMS_CAVEAT } from '@/lib/pages/market-surface'
import { unsettledItems } from '@/lib/pages/quarterly'
import type { Verdict } from '@/lib/reading/verdicts'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { gapBasisLine, gapLine } from '@/lib/reading/gap'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { competitiveFixture } from '@/components/pages/competitive-surface/fixture'
import { QUARTERLY_BLOCKS, quarterlyBlocksFor } from './index'
import { afterQuarterFixture, closedFixture, formingFixture, quarterlyFixture, subjectLeadFixture, thinMonthFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [quarterlyFixture(), formingFixture(), closedFixture(), afterQuarterFixture(), thinMonthFixture()]

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
    expect(text).toContain('Quarter against quarter needs six months')
    expect(text).toContain('once six stand behind it')
    // Three readings, the latest September: October, November, December make
    // six. `firstQuarterVerdictMonth` computes it and was called by nothing.
    expect(text).toContain('at one reading a month, with Dec 2026')
  })

  it('is gone once six readings stand behind it', () => {
    const read = quarterlyFixture()
    const text = renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(read, 'app', ctx))
    expect(text).toContain('your 8th monthly reading')
    expect(text).not.toContain('the quarter view needs 6')
  })

  // ON EVERY PAGE THAT PRINTS IT, not only the cover. The category page printed
  // it unconditionally, so a workspace standing at eight readings — one that
  // cleared the gate two readings ago — was told "Quarter against quarter needs
  // six months — you have 8." as a live caveat under its own basis line.
  it('is on the category page below six readings, and gone above', () => {
    expect(renderText(QUARTERLY_BLOCKS['quarterly.category'].render(forming, 'app', ctx)))
      .toContain(quarterGateSentence(3))
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
  it('keeps the first sentence and drops the build status', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.moves'].render(quarterlyFixture(), 'email', ctx))
    expect(text).toContain(QUARTERLY_CLAIMS_CAVEAT)
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

  it('labels the interpretation page as interpretation, and says who wrote it', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.read'].render(data, 'app', ctx))
    expect(text).toContain('Interpretation')
    expect(text).toContain('not a counted result')
    // No model draft in a fixture, so the product wrote it — and says so.
    expect(text).toContain('We wrote this read ourselves this quarter.')
  })

  it('says the category page is a month against a month, before any row', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(data, 'app', ctx))
    expect(text).toMatch(/Movers and the mix are \w+ against \w+\./)
  })

  it('draws the quarter’s own reading where the window pair was taken', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(data, 'app', ctx))
    expect(text).toContain('The quarter against the quarter before it')
    // The theme half — unreachable until the window read asked for it.
    expect(text).toContain('Will it survive a wet commute')
    // And the volume as two counts, never as a share of itself. The defect
    // this replaces printed "4,147 of 4,147 · no clear change".
    expect(text).toContain('4,147 videos')
    expect(text).toContain('against 3,810 in the quarter before it')
    expect(text).not.toContain('4,147 of 4,147')
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
    expect(text).toContain('every piece of advice this product has ever given you')
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

  it('states the rule of the moves page on the moves page', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.moves'].render(data, 'app', ctx))
    expect(text).toContain('We never claim you caused it.')
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
    // Each badge says whose side it is, in the row body's own order.
    expect(text).toMatch(/Durability you .* the category /)
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
    expect(gapLine(gap)).toBe('you 30.1% of 249 · The category 22% of 4,147 · 8.1 points apart (band 6)')
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
    expect(body).toContain('31% 26 of 84')
    // … and the gap is of the quarter, so the line wave 2 binds says so.
    const labelled = gapLine(row().gap!, { period: true })
    expect(labelled).toBe(
      'The quarter from July 2026 · you 30.1% of 249 · The category 22% of 4,147 · 8.1 points apart (band 6)',
    )
    expect(labelled.match(directionRe())).toBeNull()
  })

  it('claims no direction — no reader’s flag is true in wave 1', () => {
    expect(row().gap!.direction).toBeNull()
  })

  it('draws no gap where a column could not be drawn, and none at all with M3 unapplied', () => {
    const price = quarterlyFixture().subjects.rows.find((r) => r.id === 's2')
    expect(price?.gap ?? null).toBeNull()
    expect(formingFixture().subjects.rows.every((r) => r.gap == null)).toBe(true)
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
