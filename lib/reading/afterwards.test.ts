import { describe, it, expect } from 'vitest'

import { AFTERWARDS_MIN_READINGS, afterwardsFor, audiencePhrase, groundingFor } from './afterwards'

const videoMap = (pairs: [string, string | null][]) => new Map<string, string | null>(pairs)

describe('audiencePhrase', () => {
  it('reads mid-sentence, unlike the Title Case column heading', () => {
    expect(audiencePhrase('client')).toBe('your audience')
    expect(audiencePhrase('industry-other')).toBe('the category')
    expect(audiencePhrase('competitor:Freitag')).toBe('Freitag’s audience')
    // Anything else is passed through rather than guessed at.
    expect(audiencePhrase('pooled')).toBe('pooled')
  })
})

describe('groundingFor', () => {
  it('counts DISTINCT videos behind the cited evidence', () => {
    const g = groundingFor({
      basedOn: ['i1', 'i2', 'i3'],
      videoByInsight: videoMap([['i1', 'v1'], ['i2', 'v1'], ['i3', 'v2']]),
      themeIds: ['durability', 'durability', 'zips'],
      audience: 'industry-other',
      month: '2026-09-18',
    })
    expect(g).not.toBeNull()
    expect(g?.videos).toBe(2)
    expect(g?.themes).toBe(2)
    expect(g?.audience).toBe('industry-other')
  })

  it('is null on an empty based_on — nothing recorded is not zero videos', () => {
    expect(
      groundingFor({ basedOn: [], videoByInsight: videoMap([]), themeIds: [], audience: 'client', month: '2026-09-01' }),
    ).toBeNull()
  })

  it('reads a row whose market insights are ALSO gone as pruned, not as unrecorded', () => {
    // The chain is based_on -> market_insights -> audience_insights, and the
    // caller resolves the first link before this function sees it. A row that
    // cited two insights and resolves to none is the pruned case wearing the
    // unrecorded label.
    const g = groundingFor({
      basedOn: [],
      videoByInsight: videoMap([]),
      themeIds: [],
      audience: 'client',
      month: '2026-09-01',
      cited: 2,
    })
    expect(g).not.toBeNull()
    expect(g?.pruned).toBe(true)
    expect(g?.videos).toBe(0)
    expect(g?.line).toContain('no longer on record')
  })

  it('still says nothing was recorded where nothing was', () => {
    expect(
      groundingFor({ basedOn: [], videoByInsight: videoMap([]), themeIds: [], audience: 'client', month: '2026-09-01', cited: 0 }),
    ).toBeNull()
  })

  it('degrades to a smaller count when SOME of the evidence has been pruned away', () => {
    const g = groundingFor({
      basedOn: ['i1', 'gone'],
      videoByInsight: videoMap([['i1', 'v1']]),
      themeIds: ['durability'],
      audience: 'client',
      month: '2026-09-01',
    })
    expect(g?.videos).toBe(1)
    expect(g?.pruned).toBe(false)
  })

  it('says the evidence is gone rather than printing "0 videos" (the whole of production today)', () => {
    // Sealand's twelve drawn ledger rows, measured 2026-09-18: every one cites
    // between one and eight audience_insights ids and every one of those rows
    // has been pruned. "0 videos behind it" down a whole page is a claim about
    // the evidence; the truth is a later update replaced it.
    const g = groundingFor({
      basedOn: ['gone-1', 'gone-2'],
      videoByInsight: videoMap([]),
      themeIds: [],
      audience: 'industry-other',
      month: '2026-09-01',
    })
    expect(g).not.toBeNull()
    expect(g?.videos).toBe(0)
    expect(g?.pruned).toBe(true)
    expect(g?.line).toContain('no longer on record')
    expect(g?.line).not.toMatch(/\b0 videos\b/)
  })

  it('names the population as the whole corpus and never as one month (D8)', () => {
    const g = groundingFor({
      basedOn: ['i1'],
      videoByInsight: videoMap([['i1', 'v1']]),
      themeIds: ['durability'],
      audience: 'industry-other',
      month: '2026-09-18',
    })
    // The count is all-time. The line must not read as a share of a month or
    // of an audience — the mock's "41 videos in the category, September" is
    // two populations in one sentence.
    expect(g?.pruned).toBe(false)
    expect(g?.line).toContain('everything we have read for you')
    expect(g?.line).not.toContain('in the category')
    expect(g?.line).toContain('not over one month')
  })
})

const SERIES = [
  { month: '2026-06-01', k: 8, n: 110 },
  { month: '2026-07-01', k: 9, n: 118 },
  { month: '2026-08-01', k: 11, n: 124 },
  { month: '2026-09-01', k: 18, n: 130 },
]

describe('afterwardsFor', () => {
  it('reads two months either side of the decision, banded', () => {
    const a = afterwardsFor({
      decidedAt: '2026-07-04',
      targetIds: ['reg-1'],
      objectLabel: 'Repair & warranty',
      series: SERIES,
      audience: 'client',
    })
    expect(a.state).toBe('reading')
    expect(a.verdict).not.toBeNull()
    // The newest month after the decision against the newest month before it.
    expect(a.verdict?.value).toEqual({ k: 18, n: 130 })
    expect(a.verdict?.baseline).toEqual({ k: 8, n: 110 })
    // HALF-OPEN, like every other window in the product: [month, nextMonth).
    // `{ from: m, to: m }` is an EMPTY interval, and anything that measures a
    // verdict's span or filters rows by it reads "1 Sep to 1 Sep".
    expect(a.verdict?.window).toEqual({ kind: 'month', from: '2026-09-01', to: '2026-10-01' })
    expect(a.verdict?.basis).toEqual({ from: '2026-06-01', to: '2026-07-01' })
    expect(a.months).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('never sums months — the denominator is one month, not the pool', () => {
    const a = afterwardsFor({ decidedAt: '2026-07-04', targetIds: ['reg-1'], series: SERIES, audience: 'client' })
    // Aug + Sep pooled would be n = 254; either month alone is what is read.
    expect(a.verdict?.value.n).toBe(130)
    expect(a.verdict?.baseline?.n).toBe(110)
  })

  it('leaves the decision’s own month out of both sides and says so', () => {
    const a = afterwardsFor({
      decidedAt: '2026-08-14',
      targetIds: ['reg-1'],
      series: SERIES,
      audience: 'client',
    })
    // Only September is strictly after August, so one reading of two.
    expect(a.state).toBe('too_soon')
    expect(a.months).toEqual(['2026-09-01'])
    expect(a.line).toContain('Aug 2026')
    expect(a.line).toContain('partway through it')
  })

  it('is too_soon with one reading and names how many it has', () => {
    const a = afterwardsFor({
      decidedAt: '2026-08-14',
      targetIds: ['reg-1'],
      series: SERIES,
      audience: 'client',
    })
    expect(a.verdict).toBeNull()
    expect(a.line).toContain('One month')
    expect(a.line).toContain(String(AFTERWARDS_MIN_READINGS))
  })

  it('is too_soon, not blank, when nothing has been decided', () => {
    const a = afterwardsFor({ decidedAt: null, targetIds: ['reg-1'], series: SERIES, audience: 'client' })
    expect(a.state).toBe('too_soon')
    expect(a.line).toContain('have not decided')
    expect(a.line).not.toBe('—')
  })

  it('is too_soon when there is nothing before the decision to compare against', () => {
    const a = afterwardsFor({
      decidedAt: '2026-05-20',
      targetIds: ['reg-1'],
      series: SERIES,
      audience: 'client',
    })
    expect(a.state).toBe('too_soon')
    expect(a.line).toContain('no month')
  })

  it('is no_target when the advice names nothing we follow', () => {
    const a = afterwardsFor({ decidedAt: '2026-07-04', targetIds: [], series: SERIES, audience: 'client' })
    expect(a.state).toBe('no_target')
    expect(a.verdict).toBeNull()
    expect(a.line).toContain('does not name a subject or a theme')
  })

  it('refuses across each of the four bookkeeping breaks, with its own sentence', () => {
    const seen = new Set<string>()
    for (const reason of ['unlogged_era', 'tracking_change', 'clustering_changed', 'rename'] as const) {
      const a = afterwardsFor({
        decidedAt: '2026-07-04',
        targetIds: ['reg-1'],
        series: SERIES,
        audience: 'client',
        refused: reason,
      })
      expect(a.state).toBe('refused')
      expect(a.verdict).toBeNull()
      expect(a.line.length).toBeGreaterThan(0)
      seen.add(a.line)
    }
    expect(seen.size).toBe(4)
  })

  it('skips months with no denominator rather than reading them as zero', () => {
    const a = afterwardsFor({
      decidedAt: '2026-06-20',
      targetIds: ['reg-1'],
      series: [
        { month: '2026-05-01', k: 4, n: 90 },
        { month: '2026-06-01', k: 0, n: 0 },
        { month: '2026-07-01', k: 0, n: 0 },
        { month: '2026-08-01', k: 11, n: 124 },
        { month: '2026-09-01', k: 18, n: 130 },
      ],
      audience: 'client',
    })
    expect(a.state).toBe('reading')
    expect(a.months).toEqual(['2026-08-01', '2026-09-01'])
    expect(a.verdict?.baseline).toEqual({ k: 4, n: 90 })
  })

  it('prints the band beside the change and no direction word of its own', () => {
    const a = afterwardsFor({ decidedAt: '2026-07-04', targetIds: ['reg-1'], series: SERIES, audience: 'client' })
    expect(a.line).toMatch(/band \d+\.\d points/)
    expect(a.line).not.toMatch(/\b(grew|grow|growing|fell|falling|fading|rose|rising|up|down|narrowed|improved)\b/i)
    // The word for the state belongs to the badge vocabulary (D11), changed in
    // one place — never copied into a lib string.
    expect(a.line).not.toContain('too few to compare')
    expect(a.line).not.toContain('no clear change')
  })

  it('accepts an unsorted series', () => {
    const shuffled = [SERIES[3], SERIES[0], SERIES[2], SERIES[1]]
    const a = afterwardsFor({ decidedAt: '2026-07-04', targetIds: ['reg-1'], series: shuffled, audience: 'client' })
    expect(a.verdict?.value).toEqual({ k: 18, n: 130 })
    expect(a.verdict?.baseline).toEqual({ k: 8, n: 110 })
  })
})

describe('afterwardsFor — the comparison carries its caveats', () => {
  it('flags a pair nobody recorded a grouping for, which is today’s whole corpus', () => {
    const a = afterwardsFor({ decidedAt: '2026-07-04', targetIds: ['reg-1'], series: SERIES, audience: 'client' })
    // Every month frozen before the clustering fingerprint shipped carries no
    // key, and two unknowns are deliberately not one regime — so `flags: []`
    // here would be a positive claim that there is nothing to caveat.
    expect(a.verdict?.flags).toContain('clustering_unknown')
  })

  it('flags two months grouped differently as a re-grouping, not as unknown', () => {
    const a = afterwardsFor({
      decidedAt: '2026-07-04',
      targetIds: ['reg-1'],
      series: SERIES.map((p, i) => ({ ...p, clusteringKey: i < 2 ? 'k-old' : 'k-new' })),
      audience: 'client',
    })
    expect(a.verdict?.flags).toContain('clustering_changed')
    expect(a.verdict?.flags).not.toContain('clustering_unknown')
  })

  it('draws no comparison at all across a rename, and says which silence it is', () => {
    const a = afterwardsFor({
      decidedAt: '2026-07-04',
      targetIds: ['reg-1'],
      series: SERIES.map((p, i) => ({ ...p, clusteringKey: 'k1', audience: i < 2 ? 'competitor:Old' : 'competitor:New' })),
      audience: 'competitor:New',
    })
    expect(a.state).toBe('refused')
    // The band and the change are not printed beside a refusal (D2).
    expect(a.verdict).toBeNull()
    expect(a.line).toMatch(/renamed/)
  })

  it('says nothing about a grouping where every month is in one', () => {
    const a = afterwardsFor({
      decidedAt: '2026-07-04',
      targetIds: ['reg-1'],
      series: SERIES.map((p) => ({ ...p, clusteringKey: 'k1', audience: 'client' })),
      audience: 'client',
    })
    expect(a.state).toBe('reading')
    expect(a.verdict?.flags).toEqual([])
  })
})

describe('afterwardsFor — which silence a cell prints', () => {
  it('says the decision is missing before it says the target is', () => {
    // Production today: a June recommendation whose cited insights have been
    // pruned resolves to no target AND has never been decided on. The cell a
    // reader is owed names the thing that resolves on the calendar.
    const a = afterwardsFor({ decidedAt: null, targetIds: [], series: [], audience: 'client' })
    expect(a.state).toBe('too_soon')
    expect(a.line).toContain('have not decided')
    expect(a.line).not.toContain('does not name a subject')
  })

  it('still says no_target for a row that HAS been decided on', () => {
    const a = afterwardsFor({ decidedAt: '2026-07-04', targetIds: [], series: SERIES, audience: 'client' })
    expect(a.state).toBe('no_target')
  })
})
