import { describe, expect, it } from 'vitest'

import type { Verdict } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'

import { INTERPRETATION_LABEL, composeInterpretation, verdictBlock } from './interpret'

const figures: FigureTable = {
  reg1_videos: { label: 'videos carrying this theme', value: '3', kind: 'count' },
  client_videos: { label: 'videos read for your audience', value: '28', kind: 'count' },
}

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 'reg1',
  objectLabel: 'Durability',
  audience: 'client',
  window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
  value: { k: 3, n: 28 },
  changePts: null,
  bandPts: null,
  state: 'no_clear_change',
  flags: [],
  ...over,
})

describe('composeInterpretation — the three labelled slots', () => {
  it('keeps the model’s sentences when they survive both rules', () => {
    const draft = 'Durability is growing, and it is the thread buyers keep returning to. Price talk follows it.'
    const out = composeInterpretation('interpretation_monthly', [verdict({ state: 'moved', direction: 'growing' })], figures, [], { draft })
    expect(out.fallback).toBe(false)
    expect(out.sentences).toHaveLength(2)
    expect(out.label).toBe(INTERPRETATION_LABEL)
  })

  it('caps the monthly slot at two sentences, because the design says two', () => {
    const draft = 'One. Two. Three. Four.'
    expect(composeInterpretation('interpretation_monthly', [], figures, [], { draft }).sentences).toHaveLength(2)
  })

  it('falls back when the scrubbers empty the draft, and says so', () => {
    const draft = 'Durability is growing across the category.'
    const out = composeInterpretation('interpretation_monthly', [verdict()], figures, [], { draft })
    expect(out.fallback).toBe(true)
    expect(out.reason).toBe('nothing_usable')
    expect(out.note).toBe('We wrote this read ourselves this month.')
    expect(out.scrub.droppedDirection).toBe(1)
  })

  it('writes the design’s own gate sentence when nothing moved', () => {
    const out = composeInterpretation('interpretation_monthly', [verdict()], figures, [])
    expect(out.sentences[0]).toBe('Nothing moved clearly this month. Here is where you stand.')
    expect(out.reason).toBe('nothing_moved')
  })

  it('states a level with its denominator, in tokens the surface substitutes', () => {
    const out = composeInterpretation('interpretation_monthly', [verdict()], figures, [])
    expect(out.sentences[1]).toBe('Durability came up in [[reg1_videos]] of the [[client_videos]] videos read for this audience.')
  })

  it('omits the level rather than inventing a key the table lacks', () => {
    const out = composeInterpretation('interpretation_monthly', [verdict()], {}, [])
    expect(out.sentences).toHaveLength(1)
  })

  it('names what moved when something did', () => {
    const out = composeInterpretation('interpretation_monthly', [
      verdict({ state: 'moved', objectLabel: 'Durability' }),
      verdict({ state: 'moved', objectId: 'reg2', objectLabel: 'Fit' }),
    ], figures, [])
    expect(out.sentences[0]).toBe('Durability and Fit moved clearly this month, and the rest held where they were.')
  })

  it('says why a comparison was refused, in the reader’s words', () => {
    const out = composeInterpretation('interpretation_quarterly', [
      verdict({ state: 'refused', refusedReason: 'rename' }),
    ], figures, [])
    expect(out.sentences.some((s) => s.includes('a brand was renamed inside the window'))).toBe(true)
  })

  it('writes the quarterly thin and refusal sentences as sentences', () => {
    // Sentence-initial capital, and the verb agreeing with its subject. Both
    // shipped wrong: "two of these carried…" and "two could have been compared
    // and WAS not", in prose the product signs as its own.
    const two = composeInterpretation('interpretation_quarterly', [
      verdict({ state: 'too_little_data', objectLabel: 'Durability' }),
      verdict({ state: 'too_little_data', objectId: 'reg2', objectLabel: 'Fit' }),
      verdict({ state: 'refused', objectId: 'reg3', objectLabel: 'Comfort', refusedReason: 'rename' }),
      verdict({ state: 'refused', objectId: 'reg4', objectLabel: 'Price', refusedReason: 'rename' }),
    ], figures, [])
    expect(two.sentences).toContain('Two of these carried too few videos to compare, so they are printed as levels only.')
    expect(two.sentences.some((line) => line.startsWith('Two could have been compared and were not, because '))).toBe(true)
  })

  it('writes the singular quarterly sentences in the singular', () => {
    const one = composeInterpretation('interpretation_quarterly', [
      verdict({ state: 'too_little_data', objectLabel: 'Durability' }),
      verdict({ state: 'refused', objectId: 'reg3', objectLabel: 'Comfort', refusedReason: 'rename' }),
    ], figures, [])
    expect(one.sentences).toContain('One of these carried too few videos to compare, so it is printed as a level only.')
    expect(one.sentences.some((line) => line.startsWith('One could have been compared and was not, because '))).toBe(true)
  })

  it('measures a week against its months, never on its own', () => {
    const out = composeInterpretation('interpretation_anomaly', [], figures, [])
    expect(out.sentences[0]).toBe('This week reads like the three months behind it.')
    expect(out.sentences[1]).toContain('never on its own')
  })

  it('carries quotes as refs beside the prose, capped per slot, never inside it', () => {
    const quotes = [{ ref: 'e:1' }, { ref: 'e:2' }, { ref: 'e:3' }]
    const out = composeInterpretation('interpretation_anomaly', [], figures, quotes, { draft: 'People ask about the fit.' })
    expect(out.quotes).toEqual([{ ref: 'e:1' }, { ref: 'e:2' }])
    expect(out.sentences.join(' ')).not.toContain('e:1')
  })

  it('drops a sentence in which the model typed a figure', () => {
    const out = composeInterpretation('interpretation_monthly', [verdict()], figures, [], {
      draft: 'Durability came up in 3 of 28 videos. Buyers settle the fit before the price.',
    })
    expect(out.sentences).toEqual(['Buyers settle the fit before the price.'])
    expect(out.scrub.droppedDigits).toBe(1)
  })
})

describe('verdictBlock — the contract as the model receives it', () => {
  it('hands over figure keys and labels, never a value', () => {
    const block = verdictBlock([verdict({ state: 'moved', changePts: 5.4, bandPts: 4.1 })], figures)
    expect(block).toContain('[[reg1_videos]] — videos carrying this theme')
    // The figures half carries no values at all — keys and labels only.
    const figuresHalf = block.split('FIGURES')[1]
    expect(figuresHalf).not.toContain('28')
    expect(figuresHalf.replace(/\[\[[a-z0-9_]+\]\]/g, '')).not.toMatch(/\d/)
    // The verdict half carries the denominator, because a claim without its n
    // is not checkable — that is the contract, not a leak.
    expect(block).toContain('change=5.4pts')
    expect(block).toContain('n=28')
  })

  it('says outright that a verdict without a direction owes no direction word', () => {
    expect(verdictBlock([verdict()], figures)).toContain('direction=NONE')
  })

  it('says outright that no verdicts means no movement claim at all', () => {
    const block = verdictBlock([], {})
    expect(block).toContain('You may not say anything moved')
    expect(block).toContain('Any digit you type deletes the sentence it is in.')
  })
})
