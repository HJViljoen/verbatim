import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { QUARTERLY_BLOCK_KEYS, QUARTERLY_RULE, quarterGateSentence } from '@/lib/reports/quarterly'
import { CLIENT_AUDIENCE } from '@/lib/rivals'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { QUARTERLY_BLOCKS, quarterlyBlocksFor } from './index'
import { afterQuarterFixture, closedFixture, formingFixture, quarterlyFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [quarterlyFixture(), formingFixture(), closedFixture(), afterQuarterFixture()]

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

  it('is on the last page, with when it settles', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.unsettled'].render(forming, 'app', ctx))
    expect(text).toContain('Quarter against quarter needs six months')
    expect(text).toContain('once six stand behind it')
  })

  it('is gone once six readings stand behind it', () => {
    const read = quarterlyFixture()
    const text = renderText(QUARTERLY_BLOCKS['quarterly.cover'].render(read, 'app', ctx))
    expect(text).toContain('your 8th monthly reading')
    expect(text).not.toContain('the quarter view needs 6')
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
    // And a review of the quarter it is standing in still says so.
    expect(quarterlyFixture().cover.stamp).toContain('Q3 2026 still filling')
    expect(quarterlyFixture().cover.stamp).not.toContain('outside this quarter')
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
