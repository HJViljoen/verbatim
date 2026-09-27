import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID, OSSUR_CLIENT_ID } from '../config'
import { brandRulesFor } from '../brands/aliases'
import type { SubredditEntry } from '../gather/types'
import { communitySince, countWord, exclusionGroups, firstSearched, searchedAs, setHistory, trackedSince } from './search-set'

// Sealand's change log and updates as staging holds them (read 27 Sep,
// read-only): the 6 Jul reconstruction, the 9 Sep and 13 Sep reconstructed
// rows, the 17 Sep script and the pipeline's 20 Sep community row, with the
// updates of 17 Aug to 24 Sep.

const row = (changed_at: string, surface: string, field: string | null, before: unknown, after: unknown, source: string) =>
  ({ changed_at, surface, field, before, after, source })

const SEALAND_CHANGES = [
  row('2026-07-06T04:19:53.577Z', 'terms', null, null, ['#sealandgear', 'cotopaxi', 'eco backpack', 'freitag', 'patagonia', 'poler', 'recycled bag', 'sealand gear', 'sealandgear', 'sustainable backpack', 'sustainable bags', 'topo designs', 'upcycled bag'], 'reconstructed'),
  row('2026-08-17T00:00:00Z', 'subreddits', 'subreddits', null, { name: 'backpacks', status: 'candidate' }, 'reconstructed'),
  row('2026-08-17T00:00:00Z', 'subreddits', 'subreddits', null, { name: 'travelgear', status: 'candidate' }, 'reconstructed'),
  row('2026-08-17T00:00:00Z', 'subreddits', 'subreddits', { name: 'zerowaste', status: 'candidate' }, { name: 'zerowaste', status: 'rejected' }, 'reconstructed'),
  row('2026-09-09T00:00:00Z', 'subreddits', 'subreddits', { name: 'backpacks', status: 'candidate' }, { name: 'backpacks', status: 'active' }, 'reconstructed'),
  row('2026-09-09T00:00:00Z', 'subreddits', 'subreddits', { name: 'travelgear', status: 'candidate' }, { name: 'travelgear', status: 'active' }, 'reconstructed'),
  row('2026-09-09T00:00:00Z', 'subreddits', 'subreddits', null, { name: 'onebag', status: 'candidate' }, 'reconstructed'),
  row('2026-09-09T16:24:15Z', 'rivals', 'competitor_names', ['Cotopaxi', 'Freitag', 'Patagonia', 'Poler', 'Topo Designs'], ['Cotopaxi', 'Freitag', 'Rareform'], 'reconstructed'),
  ...['cotopaxi', 'freitag', 'patagonia', 'poler', 'sealandgear', 'sustainable bags', 'topo designs'].map((t) => row('2026-09-09T18:17:56.893Z', 'terms', null, [t], null, 'reconstructed')),
  ...['cotopaxi backpack', 'freitag bag', 'rareform bag', 'recycled sailcloth', 'sailcloth bag', 'sealand bag', 'upcycled backpack'].map((t) => row('2026-09-09T18:17:56.893Z', 'terms', null, null, [t], 'reconstructed')),
  row('2026-09-13T10:00:58.467Z', 'terms', 'industry_keywords', null, ['handmade bag', 'sustainable fashion', 'travel gear'], 'reconstructed'),
  row('2026-09-13T10:00:58.467Z', 'terms', 'competitor_keywords', null, ['frtg'], 'reconstructed'),
  row('2026-09-17T16:02:56.854Z', 'terms', 'competitor_keywords',
    ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag'],
    ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand'], 'trigger'),
  row('2026-09-17T16:02:56.854Z', 'terms', 'industry_keywords',
    ['eco backpack', 'handmade bag', 'recycled bag', 'recycled sailcloth', 'sailcloth bag', 'sustainable backpack', 'sustainable fashion', 'travel gear', 'upcycled backpack', 'upcycled bag'],
    ['eco backpack', 'handmade bag', 'recycled bag', 'recycled sailcloth', 'sailcloth bag', 'sustainable backpack', 'sustainable fashion', 'travel gear', 'upcycled backpack', 'upcycled bag', 'made from waste', 'locally made south africa'], 'trigger'),
  row('2026-09-17T16:02:56.854Z', 'terms', 'exclude_terms', [], ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'], 'trigger'),
  row('2026-09-17T16:02:56.854Z', 'rivals', 'competitor_names', ['Cotopaxi', 'Freitag', 'Rareform'], ['Cotopaxi', 'Freitag', 'Rareform', 'The North Face', 'Patagonia', 'Freedom of Movement', 'Old School'], 'trigger'),
]
const SEALAND_UPDATES = ['2026-08-17T06:52:00Z', '2026-09-09T12:08:00Z', '2026-09-10T07:02:00Z', '2026-09-15T08:21:00Z', '2026-09-20T04:02:00Z', '2026-09-24T12:16:00Z']
  .map((startedAt) => ({ startedAt }))
const SEALAND_TERMS = [
  'sealand gear', '#sealandgear', 'sealand bag',
  'cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand',
  'eco backpack', 'handmade bag', 'recycled bag', 'recycled sailcloth', 'sailcloth bag', 'sustainable backpack', 'sustainable fashion',
  'travel gear', 'upcycled backpack', 'upcycled bag', 'made from waste', 'locally made south africa',
]

describe('the day we first searched each term', () => {
  const days = firstSearched(SEALAND_CHANGES, SEALAND_UPDATES)
  it('dates a term in the record\'s first rows "by" that day, since it may have been searched before', () => {
    expect(days.get('sealand gear')).toBe('by 6 Jul')
    expect(days.get('#sealandgear')).toBe('by 6 Jul')
    expect(days.get('upcycled bag')).toBe('by 6 Jul')
  })
  it('dates a reconstructed term by the update that first searched it', () => {
    expect(days.get('sealand bag')).toBe('9 Sep')
    expect(days.get('cotopaxi backpack')).toBe('9 Sep')
    expect(days.get('frtg')).toBe('13 Sep')
    expect(days.get('handmade bag')).toBe('13 Sep')
  })
  it('dates a term written down when it was added by the first update after it', () => {
    expect(days.get('north face backpack')).toBe('20 Sep')
    expect(days.get('made from waste')).toBe('20 Sep')
    expect(firstSearched(SEALAND_CHANGES, SEALAND_UPDATES.slice(0, 4)).get('fombrand')).toBe('not searched yet')
  })
  it('has no day for a term the log never names', () => {
    expect(days.has('wet commute bag')).toBe(false)
  })
})

describe('How the set got here', () => {
  it('starts where the record starts, then each day that changed what we search, then the two dates ahead while the set is held still', () => {
    const { steps, heldAfter } = setHistory({ changes: SEALAND_CHANGES, terms: SEALAND_TERMS, updates: SEALAND_UPDATES, locked: true, now: '2026-09-27T12:00:00Z' })
    expect(steps.map((s) => `${s.when}: ${s.words}`)).toEqual([
      'by 6 Jul: 6 of today’s terms',
      '9 Sep: 3 brands out and 1 in, 7 terms out and 7 in, 2 communities added',
      '13 Sep: 4 terms added',
      '17 Sep: 4 brands and 5 terms added, first searched 20 Sep',
      '6 Dec update: October against November: the first comparison read the same way',
      '1 Jan 2027: the earliest a change you ask for lands',
    ])
    expect(steps.map((s) => s.state)).toEqual(['past', 'past', 'past', 'past', 'ahead', 'ahead'])
    // The held-still stretch runs from the last change to the first date ahead.
    expect(heldAfter).toBe(3)
  })

  it('draws no date ahead for a workspace whose searches are not held still', () => {
    const { steps, heldAfter } = setHistory({ changes: SEALAND_CHANGES, terms: SEALAND_TERMS, updates: SEALAND_UPDATES, locked: false, now: '2026-09-27T12:00:00Z' })
    expect(steps.every((s) => s.state === 'past')).toBe(true)
    expect(heldAfter).toBeNull()
  })

  it('drops a date ahead once it has passed', () => {
    const { steps } = setHistory({ changes: SEALAND_CHANGES, terms: SEALAND_TERMS, updates: SEALAND_UPDATES, locked: true, now: '2026-12-10T12:00:00Z' })
    expect(steps.filter((s) => s.state === 'ahead').map((s) => s.when)).toEqual(['1 Jan 2027'])
  })

  it('says a day nobody has searched yet as that', () => {
    const { steps } = setHistory({ changes: SEALAND_CHANGES, terms: SEALAND_TERMS, updates: SEALAND_UPDATES.slice(0, 4), locked: false, now: '2026-09-18T12:00:00Z' })
    expect(steps.at(-1)?.words).toBe('4 brands and 5 terms added, not searched yet')
  })

  it('reads Össur\'s log: the reconstruction, the renamed hashtag and three communities', () => {
    const changes = [
      row('2026-07-01T15:01:35Z', 'terms', null, null, ['#prosthetics', 'amputee', 'ossur', 'ottobock', 'prosthetic arm', 'prosthetic leg', 'running blade'], 'reconstructed'),
      row('2026-07-03T10:38:55Z', 'terms', null, null, ['#runningblade'], 'reconstructed'),
      row('2026-07-03T10:38:55Z', 'terms', null, ['running blade'], null, 'reconstructed'),
      row('2026-08-23T00:00:00Z', 'subreddits', 'subreddits', { name: 'amputee', status: 'candidate' }, { name: 'amputee', status: 'active' }, 'reconstructed'),
      row('2026-08-23T00:00:00Z', 'subreddits', 'subreddits', { name: 'prosthetics', status: 'candidate' }, { name: 'prosthetics', status: 'active' }, 'reconstructed'),
      row('2026-09-13T00:00:00Z', 'subreddits', 'subreddits', { name: 'bionics', status: 'candidate' }, { name: 'bionics', status: 'active' }, 'reconstructed'),
    ]
    const terms = ['ossur', 'ottobock', 'amputee', 'prosthetic leg', 'prosthetic arm', '#runningblade', '#prosthetics']
    const { steps } = setHistory({ changes, terms, updates: [], locked: false, now: '2026-09-27T12:00:00Z' })
    expect(steps.map((s) => `${s.when}: ${s.words}`)).toEqual([
      'by 1 Jul: 6 of today’s terms',
      '3 Jul: 1 term out and 1 in',
      '23 Aug: 2 communities added',
      '13 Sep: 1 community added',
    ])
  })
})

describe('the communities we read', () => {
  it('dates each by the first logged row that made it active, else by the day it was found', () => {
    const entries: SubredditEntry[] = [
      { name: 'backpacks', status: 'active', discovered_at: '2026-08-17' },
      { name: 'travelgear', status: 'active', discovered_at: '2026-08-17' },
      { name: 'onebag', status: 'active', discovered_at: '2026-09-09' },
      { name: 'zerowaste', status: 'rejected', discovered_at: '2026-08-17' },
    ]
    const since = communitySince(entries, SEALAND_CHANGES)
    expect([...since]).toEqual([['backpacks', '9 Sep'], ['travelgear', '9 Sep'], ['onebag', '9 Sep']])
  })
})

describe('Not these, by the meaning each rules out', () => {
  it('groups Sealand\'s nine words under the four meanings, in order', () => {
    expect(exclusionGroups(SEALAND_CLIENT_ID, ['argentina', 'chile', 'torres del paine', 'ecuador', 'volcano', 'schengen', 'immigration', 'border control', 'hip hop'])).toEqual([
      { meaning: 'Patagonia, the region', words: ['argentina', 'chile', 'torres del paine'] },
      { meaning: 'Cotopaxi, the volcano', words: ['ecuador', 'volcano'] },
      { meaning: 'freedom of movement, at borders', words: ['schengen', 'immigration', 'border control'] },
      { meaning: 'old school, the music', words: ['hip hop'] },
    ])
  })
  it('puts a word no meaning names in a row of its own, and draws nothing for an empty list', () => {
    expect(exclusionGroups(SEALAND_CLIENT_ID, ['volcano', 'poker'])).toEqual([
      { meaning: 'Cotopaxi, the volcano', words: ['volcano'] },
      { meaning: null, words: ['poker'] },
    ])
    expect(exclusionGroups(OSSUR_CLIENT_ID, [])).toEqual([])
  })
})

describe('what each brand is searched as', () => {
  const terms = ['cotopaxi backpack', 'freitag bag', 'frtg', 'rareform bag', 'north face backpack', 'patagonia black hole', 'fombrand']
  const rule = (brand: string) => brandRulesFor(SEALAND_CLIENT_ID).find((r) => r.brand === brand) ?? null
  it('names each brand\'s own searches by its rule, alias and handle included', () => {
    expect(searchedAs('Freitag', rule('Freitag'), terms)).toEqual(['freitag bag', 'frtg'])
    expect(searchedAs('The North Face', rule('The North Face'), terms)).toEqual(['north face backpack'])
    expect(searchedAs('Freedom of Movement', rule('Freedom of Movement'), terms)).toEqual(['fombrand'])
    expect(searchedAs('Patagonia', rule('Patagonia'), terms)).toEqual(['patagonia black hole'])
    expect(searchedAs('Old School', rule('Old School'), terms)).toEqual([])
  })
  it('falls back to the terms that hold the name where the tenant has no rule', () => {
    expect(searchedAs('Ottobock', null, ['ottobock'])).toEqual(['ottobock'])
  })
})

describe('countWord', () => {
  it('spells one to twelve and prints the figure past them', () => {
    expect([countWord(4), countWord(7), countWord(12), countWord(13)]).toEqual(['four', 'seven', 'twelve', '13'])
  })
})

describe('since when each brand has been tracked', () => {
  it('dates a brand by the day the list took it in, and a returning brand by the day it came back', () => {
    expect(trackedSince('The North Face', SEALAND_CHANGES, '2026-09-20T04:18:33Z')).toBe('17 Sep')
    expect(trackedSince('Rareform', SEALAND_CHANGES, '2026-09-09T19:32:02Z')).toBe('9 Sep')
    // Taken off on 9 Sep, put back on 17 Sep.
    expect(trackedSince('Patagonia', SEALAND_CHANGES, '2026-07-06T04:19:53Z')).toBe('17 Sep')
  })
  it('says "by" the earliest evidence where the log never shows it arriving', () => {
    expect(trackedSince('Cotopaxi', SEALAND_CHANGES, '2026-06-28T14:41:28Z')).toBe('by 28 Jun')
    expect(trackedSince('Ottobock', [], null)).toBeNull()
  })
})
