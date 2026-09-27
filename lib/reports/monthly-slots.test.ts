import { describe, expect, it } from 'vitest'
import { MONTHLY_SLOT_STUBS, isFilled, monthlySlotsFrom, type MonthlySlot } from './monthly-slots'
import { brandsBlockFor, buildBrandsBlock, buildCheckLines } from '../pages/overview-market'
import { BRAND_RULE_VERSION } from '../brands/aliases'
import { SEALAND_CLIENT_ID } from '../config'
import { SEPTEMBER_BRANDS, emptyBrandsRead, noneFoundBrandsRead, shippedBrandsRead, stagingBrandsRead } from '../test/brands-fixture'
import { RECHECK_BUYERS, recheckRows, recheckRunFinish } from '../test/recheck-fixture'

// The monthly's four slots (market-first WP2.1): typed now, stubbed, and
// filled by the packages that own them.

describe('the slots', () => {
  it('are four stubs, each naming the package that fills it', () => {
    expect(MONTHLY_SLOT_STUBS).toEqual({
      change: { state: 'stub', owner: 'WP2.3' },
      arrivals: { state: 'stub', owner: 'WP2.7' },
      you: { state: 'stub', owner: 'WP2.5' },
      brands: { state: 'stub', owner: 'WP2.6' },
    })
  })

  it('are all stubs from a page that has none of the packages’ blocks', () => {
    expect(monthlySlotsFrom({})).toEqual(MONTHLY_SLOT_STUBS)
    // A copy, never the shared constant: a build that fills one slot must not
    // fill it for every build after it.
    expect(monthlySlotsFrom({})).not.toBe(MONTHLY_SLOT_STUBS)
  })

  it('fill "With this update" from the front page’s own block (WP2.7), and leave it a stub without one', () => {
    // Staging's 20 Sep update, as `update_arrivals` counts it (26 Sep).
    const arrivals = {
      run: { id: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', date: '2026-09-20T08:33:47.358Z' },
      months: [{ month: '2026-09-01', videosFirstRead: 395, commentsCaptured: 11999 }],
      current: { month: '2026-09-01', videos: 654, updates: 3 },
      newThemes: [],
      regrouped: null,
    }
    expect(monthlySlotsFrom({ arrivals })).toEqual({ ...MONTHLY_SLOT_STUBS, arrivals: { state: 'filled', value: arrivals } })
    expect(monthlySlotsFrom({ arrivals: undefined })).toEqual(MONTHLY_SLOT_STUBS)
  })

  it('tell a filled slot from a stub, and read a missing one as a stub', () => {
    const filled: MonthlySlot<{ checks: [] }> = { state: 'filled', value: { checks: [] } }
    expect(isFilled(filled)).toBe(true)
    expect(isFilled(MONTHLY_SLOT_STUBS.change)).toBe(false)
    expect(isFilled(undefined)).toBe(false)
    expect(isFilled(null)).toBe(false)
  })
})

describe('the slots WP2.3 and WP2.6 fill (monthlySlotsFrom)', () => {
  const checks = buildCheckLines({ rows: recheckRows(), month: '2026-09-01', runFinish: recheckRunFinish() })
  const buyers = { prevMonth: '2026-08-01', month: '2026-09-01', prev: RECHECK_BUYERS.august, curr: RECHECK_BUYERS.september, readWith: '2026-09-20T08:33:47.358Z' }

  it('fills the change slot with the page’s re-check, as the page holds it', () => {
    const slots = monthlySlotsFrom({ change: { checks, recheck: 'read', buyers } })
    expect(slots.change).toEqual({ state: 'filled', value: { checks, recheck: 'read', buyers } })
    // The other three are untouched.
    expect(slots.arrivals).toEqual(MONTHLY_SLOT_STUBS.arrivals)
    expect(slots.you).toEqual(MONTHLY_SLOT_STUBS.you)
  })

  it('fills it with no lines where the page prints no re-check: an answer, not a missing package', () => {
    expect(monthlySlotsFrom({ change: { checks: [] } }).change).toEqual({ state: 'filled', value: { checks: [], recheck: null, buyers: null } })
    expect(monthlySlotsFrom({ change: { checks: [], recheck: 'pending', buyers } }).change).toEqual({ state: 'filled', value: { checks: [], recheck: 'pending', buyers } })
  })

  it('fills the brands slot only with deploy 3’s form: deploy 2’s line is a promise, never sent', () => {
    expect(monthlySlotsFrom({ brands: stagingBrandsRead() }).brands).toEqual({ state: 'filled', value: stagingBrandsRead() })
    expect(monthlySlotsFrom({ brands: brandsBlockFor('2026-10-04T08:30:00.000Z') }).brands).toEqual(MONTHLY_SLOT_STUBS.brands)
    expect(monthlySlotsFrom({ brands: null }).brands).toEqual(MONTHLY_SLOT_STUBS.brands)
  })

  // The lead's ruling of 27 Sep (fast track): the monthly never sends a
  // brands section that is all "not counted yet".
  it('leaves the brands slot a stub where no brand is counted, none is "none found" and your name prints no line', () => {
    expect(monthlySlotsFrom({ brands: shippedBrandsRead() }).brands).toEqual(MONTHLY_SLOT_STUBS.brands)
    expect(monthlySlotsFrom({ brands: emptyBrandsRead() }).brands).toEqual(MONTHLY_SLOT_STUBS.brands)
    // Freitag mostly another word and the rest not counted yet: still no reading of a brand.
    const freitag = { [SEALAND_CLIENT_ID]: { Freitag: { headline: { read: 1, brand: 1 }, rest: { read: 39, brand: 9 }, on: '2026-10-05', where: 'production' as const, ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'a test check' } } }
    const noise = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, name: { hasRows: true, outside: [], ownPosts: 8 }, checks: freitag, mentionsRead: true })
    expect(noise.topics.map((t) => t.count)).toContain('noise')
    expect(monthlySlotsFrom({ brands: noise }).brands).toEqual(MONTHLY_SLOT_STUBS.brands)
  })

  it('fills it where a brand is "none found", or where only your name’s line prints', () => {
    expect(monthlySlotsFrom({ brands: noneFoundBrandsRead() }).brands).toEqual({ state: 'filled', value: noneFoundBrandsRead() })
    const name = { [SEALAND_CLIENT_ID]: { Sealand: { matches: 'none' as const, on: '2026-10-05', where: 'production' as const, ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'a test check' } } }
    const nameOnly = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, name: { hasRows: true, outside: [], ownPosts: 8 }, checks: name, mentionsRead: true })
    expect(nameOnly.nameLine).not.toBeNull()
    expect(nameOnly.topics.every((t) => t.count === 'not_yet')).toBe(true)
    expect(monthlySlotsFrom({ brands: nameOnly }).brands.state).toBe('filled')
  })

  it('reads nothing from a missing overview', () => {
    expect(monthlySlotsFrom(null)).toEqual(MONTHLY_SLOT_STUBS)
    expect(monthlySlotsFrom(undefined)).toEqual(MONTHLY_SLOT_STUBS)
  })
})
