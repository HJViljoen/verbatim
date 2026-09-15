import { describe, it, expect } from 'vitest'
import { noDirectionRule, stripThemeRefs } from './prose-rules'

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
})

describe('stripThemeRefs', () => {
  it('removes the bracketed handles the prompt already bans', () => {
    expect(stripThemeRefs('Buyers ask about fit [T4] before price.')).toBe('Buyers ask about fit before price.')
    expect(stripThemeRefs('Fit and price (T4, T12) lead.')).toBe('Fit and price lead.')
  })
})
