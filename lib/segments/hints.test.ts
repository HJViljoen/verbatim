import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { SEGMENT_HINTS, resolvedHints, segmentHintsFor } from './hints'

// The per-tenant hints are the research's class definitions (CQ §C for
// Sealand's 150, CQ §D for Össur's 60), so these tests pin the examples the
// research actually found.

describe('the segment hints', () => {
  it('exist for Sealand and Össur only: any other tenant is not judged', () => {
    expect(Object.keys(SEGMENT_HINTS).sort()).toEqual([SEALAND_CLIENT_ID, OSSUR_CLIENT_ID].sort())
    expect(segmentHintsFor('11111111-1111-4111-8111-111111111111')).toBeNull()
  })

  it('Sealand’s: bags as the market, sewing and craft as makers, the bare-name magnets as off-topic (CQ F19–F22)', () => {
    const h = segmentHintsFor(SEALAND_CLIENT_ID)!
    expect(h.market).toMatch(/^bags, backpacks, luggage/)
    expect(h.maker).toContain('crochet tutorials')
    for (const magnet of ['"poler"', '"cotopaxi"', '"sealand gear"', '"freitag"', '"topo designs"']) expect(h.offTopic).toContain(magnet)
    expect(h.buyer).toContain('A finished handmade bag shown for sale counts')
  })

  it('Össur’s: lived experience is "other", not off-topic, and DIY prosthetics are makers (CQ F35–F36)', () => {
    const h = segmentHintsFor(OSSUR_CLIENT_ID)!
    expect(h.market).toMatch(/^prostheses/)
    expect(h.other).toMatch(/^lived experience or inspiration/)
    expect(h.maker).toContain('3D-printed')
    expect(h.offTopic).toContain('#runningblade')
    expect(h.buyer).toContain('Ottobock')
  })

  it('carry no em dash in any line the model reads', () => {
    for (const h of Object.values(SEGMENT_HINTS)) for (const line of Object.values(h)) expect(line).not.toContain('—')
  })
})

describe('resolvedHints', () => {
  it('replaces the market line with a stored description, and lists homonyms once, trimmed', () => {
    const base = segmentHintsFor(SEALAND_CLIENT_ID)!
    const r = resolvedHints(base, { excludeTerms: [' Cotopaxi volcano', '', 'Cotopaxi volcano '], marketDescription: '  bags for travel ' })
    expect(r.hints.market).toBe('bags for travel')
    expect(r.hints.maker).toBe(base.maker)
    expect(r.homonyms).toEqual(['Cotopaxi volcano'])
  })

  it('keeps the tenant’s market line when no description is stored (MF3 not applied, or blank)', () => {
    const base = segmentHintsFor(SEALAND_CLIENT_ID)!
    expect(resolvedHints(base).hints).toBe(base)
    expect(resolvedHints(base, { marketDescription: '   ', excludeTerms: null })).toEqual({ hints: base, homonyms: [] })
  })
})
