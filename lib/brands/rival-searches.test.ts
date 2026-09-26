import { describe, expect, it } from 'vitest'

import { overlapSpellings, pgTextArray, rivalFoundOf, rivalSearchTerms, withoutRivalSearches } from './rival-searches'

// The one base every brand's headline count sits over (decision E, the
// research's F37, the 27 Sep ruling): the market's videos that no rival search
// of ours found, current or retired. The terms are staging's rival bucket as
// keyword_performance holds it for Sealand (27 Sep), and its
// competitor_keywords then.

const RUN_TERMS = [
  // Until 9 Sep: the bare names, Poler and Topo Designs among them (retired).
  'cotopaxi', 'freitag', 'patagonia', 'poler', 'topo designs',
  // From 9, 13 and 20 Sep.
  'cotopaxi backpack', 'freitag bag', 'rareform bag', 'frtg', 'fombrand', 'north face backpack', 'patagonia black hole',
].map((keyword) => ({ keyword, bucket: 'competitor' }))
const CONFIGURED = ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand']

describe('the rival searches', () => {
  it('are every term run in the rival bucket, retired ones included, and every term configured as one now', () => {
    const terms = rivalSearchTerms(RUN_TERMS, CONFIGURED)
    expect(terms.size).toBe(12)
    for (const t of ['poler', 'topo designs', 'patagonia', 'north face backpack']) expect(terms.has(t), t).toBe(true)
    // A term configured and not yet run is one too; another bucket's is not.
    expect(rivalSearchTerms([{ keyword: 'upcycled bag', bucket: 'industry' }], ['Osprey Farpoint ']).has('osprey farpoint')).toBe(true)
    expect(rivalSearchTerms([{ keyword: 'upcycled bag', bucket: 'industry' }], null).size).toBe(0)
  })

  it('asks the overlap for each spelling as stored and as compared, quoted so a comma or a quote cannot split a term', () => {
    expect(overlapSpellings([{ keyword: 'North Face Backpack' }], ['frtg'])).toEqual(['North Face Backpack', 'frtg', 'north face backpack'])
    expect(pgTextArray(['north face backpack', 'a,b', 'say "hi"'])).toBe('{"north face backpack","a,b","say \\"hi\\""}')
  })

  it('finds a video by its first-found terms or its terms now, whichever brand the search was for', () => {
    const rival = rivalSearchTerms(RUN_TERMS, CONFIGURED)
    const found = rivalFoundOf([
      { id: 'v1', terms: ['upcycled bag', 'Patagonia Black Hole'] }, // a rival search among others
      { id: 'v2', terms: ['upcycled bag'] },
      { id: 'v3', terms: ['poler'] }, // a retired rival's search
      { id: 'v4', terms: null },
      { id: 'v2', terms: ['frtg'] }, // its first-found terms name one
    ], rival)
    expect([...found].sort()).toEqual(['v1', 'v2', 'v3'])
    expect(withoutRivalSearches(['v1', 'v2', 'v3', 'v4', 'v5'], found)).toEqual(['v4', 'v5'])
  })
})
