import { describe, expect, it } from 'vitest'

import { BRAND_RULE_VERSION } from '../../brands/aliases'
import { SEALAND_CLIENT_ID } from '../../config'
import { NO_MATCH_CHECKS, SEPTEMBER_BRANDS, STAND_IN_CHECKS, emptyBrandsRead, noneFoundBrandsRead, uncheckedBrandsRead, stagingBrandsRead } from '../../test/brands-fixture'
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

  it('prints every brand and your name "not counted yet" with no production hand check, the mention layer full', () => {
    const b = uncheckedBrandsRead()
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

  // Finish-list item 24: on the front page "your market’s 654 videos" read as
  // a client's own customers. The monthly passes nothing and keeps its words.
  it('says "the market you sell into" where the front page asks for it', () => {
    const wider = (b: ReturnType<typeof stagingBrandsRead>) =>
      nameLineParts(b, { wider: true }).map((p) => (p.t === 'text' ? p.s : String(p.value))).join('')
    expect(wider(stagingBrandsRead())).toBe('In September your name came up in none of the 654 videos from the market you sell into. The 8 videos that name you are your own posts.')
    const unread = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, checks: STAND_IN_CHECKS, name: { hasRows: true, outside: ['v1'], ownPosts: 8 } })
    expect(wider(unread)).toBe('Your name in the market you sell into, in September: not counted yet.')
  })

  it('holds the name line at "not counted yet" while a match outside your own posts is unread, and prints the reading once read', () => {
    const base = { clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, checks: STAND_IN_CHECKS }
    const unread = buildBrandsBlock({ ...base, name: { hasRows: true, outside: ['v1'], ownPosts: 8 } })
    expect(unread.nameLine).toBeNull()
    const reads = { [SEALAND_CLIENT_ID]: [{ videoId: 'v1', brand: false, month: '2026-09-01', on: '2026-10-05', where: 'production' as const }] }
    // Every match read, but the name itself not checked on production: held.
    expect(buildBrandsBlock({ ...base, checks: { [SEALAND_CLIENT_ID]: {} }, name: { hasRows: true, outside: ['v1'], ownPosts: 8 }, nameReads: reads }).nameLine).toBeNull()
    const read = buildBrandsBlock({ ...base, name: { hasRows: true, outside: ['v1'], ownPosts: 8 }, nameReads: reads })
    expect(read.nameLine).toEqual({ month: '2026-09-01', n: 654, k: 0, ownPosts: 8 })
    const yes = buildBrandsBlock({ ...base, name: { hasRows: true, outside: ['v1'], ownPosts: 8 }, nameReads: { [SEALAND_CLIENT_ID]: [{ ...reads[SEALAND_CLIENT_ID][0], brand: true }] } })
    expect(words(yes)).toBe('In September your name came up in 1 of your market’s 654 videos. The 8 videos that name you are your own posts.')
  })

  it('prints production’s September name line from the shipped entries: the one video outside your own posts, read as you', () => {
    // Production's plan of 27 Sep: 852 videos, a8fdd6fe the only one naming
    // Sealand outside its own posts (lib/brands/precision.ts NAME_READS).
    const b = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 852, nOrganic: 672, rivals: SEPTEMBER_BRANDS, name: { hasRows: true, outside: ['a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26'], ownPosts: 0 } })
    expect(b.nameLine).toEqual({ month: '2026-09-01', n: 852, k: 1, ownPosts: 0 })
    expect(words(b)).toBe('In September your name came up in 1 of your market’s 852 videos.')
    // An unread video outside your own posts still holds the line.
    expect(buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 852, nOrganic: 672, rivals: SEPTEMBER_BRANDS, name: { hasRows: true, outside: ['a8fdd6fe-e2d6-434c-a207-6f17eb3f9b26', 'unread'], ownPosts: 0 } }).nameLine).toBeNull()
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

  // The lead's ruling of 27 Sep (fast track): a brand production's list held
  // no match of prints "none found", a real zero by the rule; "not counted
  // yet" stays only for a brand whose matches exist and are not checked.
  it('prints "none found" for a brand production’s list held no match of, in a month with none', () => {
    const b = noneFoundBrandsRead()
    expect(b.topics.map((t) => [t.label, t.count, t.kAny, t.kOrganic])).toEqual([
      ['Freedom of Movement', 'none', null, null],
      ['Old School', 'none', null, null],
      ['Rareform', 'none', null, null],
      ['Cotopaxi', 'not_yet', null, null],
      ['Freitag', 'not_yet', null, null],
      ['Patagonia', 'not_yet', null, null],
      ['The North Face', 'not_yet', null, null],
    ])
    expect(b.topics.slice(0, 3).map(topicNote)).toEqual(['none found', 'none found', 'none found'])
    expect(b.topics.slice(3).every((t) => topicNote(t) === 'not counted yet')).toBe(true)
    // Your name has matches (its own posts) and no production check: held.
    expect(words(b)).toBe('Your name in your market in September: not counted yet.')
  })

  it('sorts a brand none found after the counted ones and before the rest', () => {
    const checks = { [SEALAND_CLIENT_ID]: { ...STAND_IN_CHECKS[SEALAND_CLIENT_ID], ...NO_MATCH_CHECKS[SEALAND_CLIENT_ID] } }
    const b = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, name: { hasRows: true, outside: [], ownPosts: 8 }, checks, mentionsRead: true })
    expect(b.topics.map((t) => [t.label, t.count])).toEqual([
      ['Patagonia', 'counted'], ['The North Face', 'counted'], ['Cotopaxi', 'counted'],
      ['Freedom of Movement', 'none'], ['Old School', 'none'], ['Rareform', 'none'],
      ['Freitag', 'not_yet'],
    ])
  })

  it('prints "not counted yet", not "none found", for a month where a match turned up after the check', () => {
    // A later gather finds Rareform in September: that match passed no hand check.
    const rivals = SEPTEMBER_BRANDS.map((r) => (r.label === 'Rareform' ? { ...r, hasRows: true, kAny: 2, kOrganic: 1 } : r))
    const b = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals, name: { hasRows: true, outside: [], ownPosts: 8 }, checks: NO_MATCH_CHECKS, mentionsRead: true })
    const rareform = b.topics.find((t) => t.label === 'Rareform')!
    expect(rareform).toMatchObject({ count: 'not_yet', kAny: null, kOrganic: null })
    expect(topicNote(rareform)).toBe('not counted yet')
    // A month with none still prints none found, though another month holds a match.
    const other = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-08-01', n: 377, nOrganic: 249, rivals: SEPTEMBER_BRANDS.map((r) => (r.label === 'Rareform' ? { ...r, hasRows: true } : r)), name: { hasRows: true, outside: [], ownPosts: 0 }, checks: NO_MATCH_CHECKS, mentionsRead: true })
    expect(topicNote(other.topics.find((t) => t.label === 'Rareform')!)).toBe('none found')
  })

  it('prints no "none found" where the mention layer could not be read: nothing found there is no zero', () => {
    for (const mentionsRead of [false, undefined]) {
      const b = buildBrandsBlock({ clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, name: { hasRows: false, outside: [], ownPosts: 0 }, checks: NO_MATCH_CHECKS, mentionsRead })
      expect(b.topics.every((t) => t.count === 'not_yet'), String(mentionsRead)).toBe(true)
    }
  })

  it('prints your name line as none where the list held no match of it, even with no row of it in the layer', () => {
    const checks = { [SEALAND_CLIENT_ID]: { Sealand: { matches: 'none' as const, on: '2026-10-05', where: 'production' as const, ruleVersion: BRAND_RULE_VERSION, of: 'September', source: 'a test check' } } }
    const base = { clientId: SEALAND_CLIENT_ID, month: '2026-09-01', n: 654, nOrganic: 516, rivals: SEPTEMBER_BRANDS, name: { hasRows: false, outside: [], ownPosts: 0 }, checks }
    expect(words(buildBrandsBlock({ ...base, mentionsRead: true }))).toBe('In September your name came up in none of your market’s 654 videos.')
    expect(buildBrandsBlock({ ...base, mentionsRead: false }).nameLine).toBeNull()
    // Its own posts only: the same line, with them named apart.
    expect(words(buildBrandsBlock({ ...base, name: { hasRows: true, outside: [], ownPosts: 8 }, mentionsRead: true })))
      .toBe('In September your name came up in none of your market’s 654 videos. The 8 videos that name you are your own posts.')
  })

  it('keeps deploy 2’s line as a separate form', () => {
    expect(isBrandsRead(brandsBlockFor('2026-10-04T08:30:00.000Z'))).toBe(false)
    expect(isBrandsRead(null)).toBe(false)
  })
})
