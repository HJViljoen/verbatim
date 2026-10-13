import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { MEDICAL_LINE, MEDICAL_MARKET_CLIENTS, printsMedicalLine } from './medical'

describe('the medical team line', () => {
  it('prints for Össur, whose market is medical', () => {
    expect(printsMedicalLine(OSSUR_CLIENT_ID)).toBe(true)
  })

  it('does not print for Sealand, whose market is bags', () => {
    expect(printsMedicalLine(SEALAND_CLIENT_ID)).toBe(false)
  })

  it('does not print for a workspace nobody has marked', () => {
    expect(printsMedicalLine('00000000-0000-4000-8000-000000000000')).toBe(false)
  })

  it('is one set, holding Össur alone today', () => {
    expect([...MEDICAL_MARKET_CLIENTS]).toEqual([OSSUR_CLIENT_ID])
  })

  it('is a sentence that tells the reader to check, with no digit and no dash', () => {
    expect(MEDICAL_LINE).toMatch(/medical team/)
    expect(MEDICAL_LINE).not.toMatch(/\d/)
    expect(MEDICAL_LINE).not.toMatch(/—/)
    expect(MEDICAL_LINE.endsWith('.')).toBe(true)
  })
})
