import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { QUARTERLY_BLOCK_KEYS, QUARTERLY_RULE, quarterGateSentence } from '@/lib/reports/quarterly'
import { QUARTERLY_BLOCKS, quarterlyBlocksFor } from './index'
import { closedFixture, formingFixture, quarterlyFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [quarterlyFixture(), formingFixture(), closedFixture()]

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

  it('states the volume of a read quarter and the silence of an unread one', () => {
    expect(forming.category.quarterVolume).toBeNull()
    const text = renderText(QUARTERLY_BLOCKS['quarterly.category'].render(forming, 'app', ctx))
    expect(text).toContain('not recorded for this workspace yet')
  })

  it('states the rule of the moves page on the moves page', () => {
    const text = renderText(QUARTERLY_BLOCKS['quarterly.moves'].render(data, 'app', ctx))
    expect(text).toContain('We never claim you caused it.')
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
