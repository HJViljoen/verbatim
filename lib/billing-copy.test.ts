import { describe, expect, it } from 'vitest'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from './config'
import { planLabel, TRIAL_BY_AGREEMENT, TRIAL_BY_AGREEMENT_LINE } from './billing-copy'

// The billing page's default for Sealand (29 Sep 2026): a free trial priced
// with Heinrich, never "complimentary … never charged", never a raw plan key.

describe('billing copy', () => {
  it('holds Sealand, and only Sealand, on a trial priced with Heinrich', () => {
    expect(TRIAL_BY_AGREEMENT.has(SEALAND_CLIENT_ID)).toBe(true)
    expect(TRIAL_BY_AGREEMENT.has(OSSUR_CLIENT_ID)).toBe(false)
    expect(TRIAL_BY_AGREEMENT_LINE).toBe('Free trial. Pricing for the testing round is agreed directly with Heinrich.')
    expect(TRIAL_BY_AGREEMENT_LINE).not.toMatch(/complimentary|never charged/i)
  })

  it('prints a plan key in words', () => {
    expect(planLabel('design_partner')).toBe('Design partner')
    expect(planLabel('trial')).toBe('Trial')
    expect(planLabel(null)).toBe('—')
  })
})
