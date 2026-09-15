import { describe, it, expect } from 'vitest'

import { changedTerms, monthKeyOf, monthsRange, planAffects } from './config-affects'

describe('changedTerms — what moved, in the corpus’s own spelling', () => {
  it('takes both directions: added and removed', () => {
    expect(changedTerms(['cotopaxi', 'freitag', 'patagonia'], ['cotopaxi', 'rareform']))
      .toEqual(['freitag', 'patagonia', 'rareform'])
  })

  it('folds, because that is how a gather wrote down what it searched for', () => {
    // videos.source_keywords stores 'topo designs', not 'Topo Designs'.
    expect(changedTerms([], ['Topo Designs', 'Össur'])).toEqual(['ossur', 'topo designs'])
  })

  it('sees no change in a re-spelling that folds to the same term', () => {
    expect(changedTerms(['Cotopaxi'], ['cotopaxi'])).toEqual([])
  })

  it('has nothing to say about a value that is not a list', () => {
    expect(changedTerms('weekly', 'monthly')).toEqual([])
    expect(changedTerms(null, { Cotopaxi: { instagram: 'cotopaxi' } })).toEqual([])
    expect(changedTerms(undefined, undefined)).toEqual([])
  })

  it('drops empties rather than searching for nothing', () => {
    expect(changedTerms([], ['', '   ', 'poler'])).toEqual(['poler'])
  })
})

describe('planAffects — what to look for, per surface', () => {
  it('a term edit looks for the terms', () => {
    expect(planAffects({ surface: 'terms', field: 'industry_keywords', before: ['running blade'], after: ['#runningblade'] }))
      .toEqual({ terms: ['#runningblade', 'running blade'], audiences: [], basis: 'terms' })
  })

  it('a rival edit names the audiences as well as the terms', () => {
    expect(planAffects({ surface: 'rivals', field: 'competitor_names', before: ['Cotopaxi', 'Patagonia'], after: ['Cotopaxi'] }))
      .toEqual({ terms: ['patagonia'], audiences: ['competitor:Patagonia'], basis: 'rivals' })
  })

  it('a rename names both halves, old first, because that pair is the stitch', () => {
    const plan = planAffects({ surface: 'rival_rename', before: { name: 'Topo Designs' }, after: { name: 'Topo' } })
    expect(plan.audiences).toEqual(['competitor:Topo Designs', 'competitor:Topo'])
    expect(plan.terms).toEqual(['topo designs', 'topo'])
  })

  it('a subreddit edit looks for the r/ form the gather stores', () => {
    expect(planAffects({ surface: 'subreddits', before: ['bifl'], after: ['bifl', 'r/onebag'] }))
      .toEqual({ terms: ['r/onebag'], audiences: [], basis: 'subreddits' })
  })

  it('says "not known" for the surfaces that move no stored month', () => {
    // A handles edit moves rows stamped by account membership, which carry no
    // search term; cadence and knobs change the next gather, not the past.
    for (const surface of ['handles', 'cadence', 'knobs', 'schedule', 'subjects', 'other'] as const) {
      expect(planAffects({ surface, before: ['a'], after: ['b'] })).toEqual({ terms: [], audiences: [], basis: 'none' })
    }
  })

  it('and for the two corpus operations, which know their own rows', () => {
    // A re-tag's moved set is known only to the operation; a plan built from
    // before/after counts would be a guess.
    for (const surface of ['entity_retag', 'regate'] as const) {
      expect(planAffects({ surface, before: { client: 30 }, after: { client: 31 } }).basis).toBe('none')
    }
  })
})

describe('monthsRange — the band a change draws', () => {
  it('covers the month a single comment sits in', () => {
    expect(monthsRange(['2026-08'])).toBe('[2026-08-01,2026-09-01)')
  })

  it('spans first to last, whatever order they arrive in', () => {
    expect(monthsRange(['2026-09', '2021-12', '2024-12'])).toBe('[2021-12-01,2026-10-01)')
  })

  it('rolls December over into the next year', () => {
    expect(monthsRange(['2025-12'])).toBe('[2025-12-01,2026-01-01)')
  })

  it('takes a full date and uses only its month', () => {
    expect(monthsRange(['2026-08-17T04:10:00Z', '2026-08-01'])).toBe('[2026-08-01,2026-09-01)')
  })

  it('is null for nothing, because a band over nothing is not a band', () => {
    expect(monthsRange([])).toBeNull()
    expect(monthsRange(['', 'not-a-month'])).toBeNull()
  })
})

describe('monthKeyOf — the same clock the monthly reading uses', () => {
  it('reads the month in UTC, not the reader’s zone', () => {
    // monthly_denominators does date_trunc('month', comment_date at time zone
    // 'UTC'); a comment at 23:30 on the last of the month is that month.
    expect(monthKeyOf('2026-08-31T23:30:00Z')).toBe('2026-08')
    expect(monthKeyOf('2026-09-01T00:30:00Z')).toBe('2026-09')
    expect(monthKeyOf('2026-01-05T00:00:00Z')).toBe('2026-01')
  })

  it('is null for a date it cannot read', () => {
    expect(monthKeyOf('')).toBeNull()
    expect(monthKeyOf('soon')).toBeNull()
  })
})
