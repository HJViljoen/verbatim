import { describe, expect, it } from 'vitest'

import { BRAND_RULE_VERSION } from '../../brands/aliases'
import { SEALAND_CLIENT_ID } from '../../config'
import { SEPTEMBER_BRANDS, STAND_IN_CHECKS, emptyBrandsRead, shippedBrandsRead, stagingBrandsRead } from '../../test/brands-fixture'
import { BRANDS_HEAD_ALL, BRANDS_HEAD_ORGANIC, buildBrandsBlock, isBrandsRead, nameLineParts, organicBase, topicNote, brandsBlockFor, NINETY_DAY_NOTE } from './brands'

// Brands in your market in deploy 3's form (WP2.6): the name line first, then
// the brands counted in every video they come up in, on staging's brands_v1
// plan of 27 Sep (lib/test/brands-fixture.ts). The headline count leaves out
// every video any of our rival searches found: one base for every brand (the
// 27 Sep ruling).

const words = (b: ReturnType<typeof stagingBrandsRead>) =>
  nameLineParts(b).map((p) => (p.t === 'text' ? p.s : String(p.value))).join('')

describe('buildBrandsBlock', () => {
  it('counts the measured brands, headline count first, each over one base: the 516 of September’s 654 no rival search of ours found', () => {
    const b = stagingBrandsRead()
    expect(isBrandsRead(b)).toBe(true)
    expect(b.topics.map((t) => [t.label, t.kOrganic, t.nOrganic, t.kAny, t.n])).toEqual([
      ['Patagonia', 13, 516, 45, 654],
      ['The North Face', 6, 516, 36, 654],
      ['Cotopaxi', 3, 516, 28, 654],
      ['Freedom of Movement', null, 516, null, 654],
      ['Freitag', null, 516, null, 654],
      ['Old School', null, 516, null, 654],
      ['Rareform', null, 516, null, 654],
    ])
    expect(organicBase(b)).toBe(516)
    expect(organicBase(stagingBrandsRead('2026-08-01'))).toBe(249)
    expect(b.ninetyDayNote).toBe(NINETY_DAY_NOTE)
  })

  it('heads the headline column with exactly what it leaves out', () => {
    expect(BRANDS_HEAD_ORGANIC).toBe('Without any video our rival searches found')
    expect(BRANDS_HEAD_ALL).toBe('In all')
  })

  it('never prints a 0 or a count for a brand nobody measured: Freitag’s 6 stays unprinted', () => {
    const b = stagingBrandsRead()
    for (const label of ['Freitag', 'Rareform', 'Freedom of Movement', 'Old School']) {
      const t = b.topics.find((x) => x.label === label)!
      expect(t, label).toMatchObject({ kAny: null, kOrganic: null, noise: false, count: 'not_yet' })
      expect(topicNote(t)).toBe('not counted yet')
    }
    expect(topicNote(b.topics[0])).toBeNull()
  })

  it('prints every brand and your name "not counted yet" as deploy 3 ships: no production hand check yet, the mention layer full', () => {
    const b = shippedBrandsRead()
    expect(b.topics.map((t) => [t.label, t.count, t.kAny, t.kOrganic])).toEqual([
      ['Cotopaxi', 'not_yet', null, null],
      ['Freedom of Movement', 'not_yet', null, null],
      ['Freitag', 'not_yet', null, null],
      ['Old School', 'not_yet', null, null],
      ['Patagonia', 'not_yet', null, null],
      ['Rareform', 'not_yet', null, null],
      ['The North Face', 'not_yet', null, null],
    ])
    expect(b.topics.every((t) => topicNote(t) === 'not counted yet')).toBe(true)
    // Your name too: the 8 own posts are known, and still nothing prints
    // until production has checked the name.
    expect(b.nameLine).toBeNull()
    expect(words(b)).toBe('Your name in your market in September: not counted yet.')
  })

  it('prints "not counted yet" for every brand while the mention layer holds nothing (staging today)', () => {
    const b = emptyBrandsRead()
    expect(b.topics.every((t) => t.kAny == null && t.count === 'not_yet')).toBe(true)
    expect(b.nameLine).toBeNull()
    expect(words(b)).toBe('Your name in your market in September: not counted yet.')
  })

  it('prints the name line first, as none, where every match of your name is your own post (staging: 8)', () => {
    expect(stagingBrandsRead().nameLine).toEqual({ month: '2026-09-01', n: 654, k: 0, ownPosts: 8 })
    expect(words(stagingBrandsRead())).toBe('In September your name came up in none of your market’s 654 videos. The 8 videos that name you are your own posts.')
    expect(words(stagingBrandsRead('2026-08-01'))).toBe('In August your name came up in none of your market’s 377 videos.')
  })

  it('holds the name line at "not counted yet" while a match outside your own posts is unread, and prints the reading once read', () => {
    const base = { clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, checks: STAND_IN_CHECKS }
    const unread = buildBrandsBlock({ ...base, name: { hasRows: true, outside: ['v1'], ownPosts: 8 } })
    expect(unread.nameLine).toBeNull()
    const reads = { [SEALAND_CLIENT_ID]: [{ videoId: 'v1', brand: false, month: '2026-09-01', on: '2026-10-05', where: 'production' as const }] }
    // Every match read, but the name itself not checked on production: held.
    expect(buildBrandsBlock({ ...base, checks: undefined, name: { hasRows: true, outside: ['v1'], ownPosts: 8 }, nameReads: reads }).nameLine).toBeNull()
    const read = buildBrandsBlock({ ...base, name: { hasRows: true, outside: ['v1'], ownPosts: 8 }, nameReads: reads })
    expect(read.nameLine).toEqual({ month: '2026-09-01', n: 654, k: 0, ownPosts: 8 })
    const yes = buildBrandsBlock({ ...base, name: { hasRows: true, outside: ['v1'], ownPosts: 8 }, nameReads: { [SEALAND_CLIENT_ID]: [{ ...reads[SEALAND_CLIENT_ID][0], brand: true }] } })
    expect(words(yes)).toBe('In September your name came up in 1 of your market’s 654 videos. The 8 videos that name you are your own posts.')
  })

  it('prints a brand measured under the floor as mostly another word, with no count', () => {
    const checks = { [SEALAND_CLIENT_ID]: { Freitag: { headline: { read: 1, brand: 1 }, rest: { read: 39, brand: 9 }, on: '2026-10-05', where: 'production' as const, ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'a test check' } } }
    const b = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, name: { hasRows: true, outside: [], ownPosts: 8 }, checks })
    const freitag = b.topics.find((t) => t.label === 'Freitag')!
    expect(freitag).toMatchObject({ noise: true, kAny: null, count: 'noise' })
    expect(topicNote(freitag)).toBe('mostly the German word for Friday · not counted')
    // With only Freitag checked, the others are unmeasured: the brand
    // measured as noise sorts after any counted brand and before the rest.
    expect(b.topics.map((t) => t.count)).toEqual(['noise', 'not_yet', 'not_yet', 'not_yet', 'not_yet', 'not_yet', 'not_yet'])
  })

  it('keeps deploy 2’s line as a separate form', () => {
    expect(isBrandsRead(brandsBlockFor('2026-10-04T08:30:00.000Z'))).toBe(false)
    expect(isBrandsRead(null)).toBe(false)
  })
})
