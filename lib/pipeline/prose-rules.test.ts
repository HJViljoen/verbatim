import { describe, it, expect } from 'vitest'
import { MAGNITUDE_WORDS } from '../prose/scrub'
import { DIRECTION_PROMPT_EXAMPLES, directionHits } from '../calibration'
import { CALIBRATED_PROSE_RULE, noDirectionRule, stripThemeRefs } from './prose-rules'

describe('noDirectionRule — the prompt sentence follows the slot’s policy', () => {
  // The defect this replaces: one constant promising "a sentence that names one
  // without a verdict behind it is deleted before the reader sees it", added to
  // four prompts of which only Pass D-a's brief runs the direction rule.
  it('promises deletion only where the direction rule actually runs', () => {
    expect(noDirectionRule('report_cover')).toContain('is deleted before the reader sees it.')
    expect(noDirectionRule('pass_c_finding')).not.toContain('deleted')
    expect(noDirectionRule('pass_d_b_recommendation')).not.toContain('deleted')
    expect(noDirectionRule('pass_e_persona')).not.toContain('deleted')
  })

  it('tells a digits-only slot what does happen instead', () => {
    expect(noDirectionRule('pass_d_b_recommendation')).toContain('counted against this prompt')
  })

  it('names the deliverable when one prompt writes several and only one enforces', () => {
    const rule = noDirectionRule('pass_d_a_insight', 'pass_d_a_consumer_summary', 'pass_d_a_brief', 'pass_d_a_say_vs_hear')
    expect(rule).toContain('in the executive brief a sentence that names one without a verdict behind it is deleted')
    expect(rule).toContain('everywhere else it is counted against this prompt as a defect')
  })

  it('bans the same words in every variant', () => {
    for (const rule of [noDirectionRule('report_cover'), noDirectionRule('pass_c_finding')]) {
      for (const word of ['growing', 'fading', 'rising', 'increasing', 'momentum', 'steady']) {
        expect(rule).toContain(`"${word}"`)
      }
    }
  })

  // The mirror of the MAGNITUDE test below, and the one that was missing: the
  // prompt banned "picking up" while DIRECTION_WORDS held only "picked up", so
  // on a `both` slot the sentence promised deletion for a phrase nothing
  // deleted — invisible because nothing held the two together.
  it('names no word the direction rule does not catch', () => {
    const quoted = [...noDirectionRule('report_cover').matchAll(/"([a-z][a-z ]*)"/g)].map((m) => m[1])
    const named = quoted.filter((w) => w !== 'stronger than last time')
    expect(named.length).toBeGreaterThan(10)
    for (const word of named) {
      expect(directionHits(`Objections ${word} this month.`).length).toBeGreaterThan(0)
    }
  })

  it('names every example the list offers', () => {
    const rule = noDirectionRule('report_cover')
    for (const word of DIRECTION_PROMPT_EXAMPLES) expect(rule).toContain(`"${word}"`)
  })
})

describe('CALIBRATED_PROSE_RULE — the prompt’s banned list is the code’s banned list', () => {
  // `growing` and `increasingly` were named here as magnitude words after they
  // left MAGNITUDE_WORDS for DIRECTION_WORDS, so the prompt asked for one rule
  // and the code ran another.
  it('names no word the magnitude strip does not strip', () => {
    const quoted = [...CALIBRATED_PROSE_RULE.matchAll(/"([a-z]+)"/g)].map((m) => m[1])
    const magnitude = quoted.filter((w) => !['T4', 'T12'].includes(w))
    expect(magnitude.length).toBeGreaterThan(5)
    for (const word of magnitude) expect(MAGNITUDE_WORDS).toContain(word)
  })

  it('leaves the direction words to the direction rule', () => {
    for (const word of ['growing', 'increasingly', 'increasing', 'fading']) {
      expect(CALIBRATED_PROSE_RULE).not.toContain(`"${word}"`)
    }
  })
})

describe('stripThemeRefs', () => {
  it('removes the bracketed handles the prompt already bans', () => {
    expect(stripThemeRefs('Buyers ask about fit [T4] before price.')).toBe('Buyers ask about fit before price.')
    expect(stripThemeRefs('Fit and price (T4, T12) lead.')).toBe('Fit and price lead.')
  })
})
