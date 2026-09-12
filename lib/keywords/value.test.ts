import { describe, it, expect } from 'vitest'
import { insightBearingUpdates, recentUpdates, summariseTerms, termValue, type KeywordPerfRow } from './value'

// The rule these tests pin is the one scripts/keyword-roi.ts printed as
// DROP-CANDIDATE: >=3 insight-bearing updates, <5% kept, >=100 found, 0
// insights. Pooling and the insight-bearing filter are the whole subtlety —
// a term looks dead in an update whose analysis never ran.

const row = (o: Partial<KeywordPerfRow> = {}): KeywordPerfRow => ({
  run_id: 'r1',
  platform: 'instagram',
  keyword: 'bags',
  bucket: 'industry',
  videos_found: 0,
  gate_survived: 0,
  eligible_videos: 0,
  insights_contributed: 0,
  ...o,
})

/** n updates of a term that finds a lot and keeps almost none. */
const deadTerm = (n: number, opts: { found?: number; kept?: number; insights?: number } = {}) =>
  Array.from({ length: n }, (_, i) =>
    row({
      run_id: `r${i}`,
      videos_found: opts.found ?? 50,
      gate_survived: opts.kept ?? 1,
      insights_contributed: opts.insights ?? 0,
    }),
  )

/** One row per update that carries the update's insights, so the update counts. */
const liveTerm = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    row({ run_id: `r${i}`, keyword: 'sealand', bucket: 'brand', videos_found: 40, gate_survived: 30, insights_contributed: 4 }),
  )

describe('insightBearingUpdates', () => {
  it('counts an update whose terms contributed any insight at all', () => {
    const rows = [row({ run_id: 'a', insights_contributed: 0 }), row({ run_id: 'a', keyword: 'x', insights_contributed: 2 })]
    expect([...insightBearingUpdates(rows)]).toEqual(['a'])
  })

  it('leaves out an update that produced nothing anywhere — a gather-only update', () => {
    expect(insightBearingUpdates([row({ run_id: 'b', insights_contributed: 0 })]).size).toBe(0)
  })

  it('treats a null insights_contributed as not-yet-attributed, never as a zero', () => {
    expect(insightBearingUpdates([row({ run_id: 'c', insights_contributed: null })]).size).toBe(0)
  })
})

describe('termValue', () => {
  it('pools found, kept, eligible and insights across every update', () => {
    const rows = [
      row({ run_id: 'a', videos_found: 10, gate_survived: 4, eligible_videos: 2, insights_contributed: 1 }),
      row({ run_id: 'b', platform: 'youtube', videos_found: 30, gate_survived: 6, eligible_videos: 3, insights_contributed: 2 }),
    ]
    const s = termValue(rows, insightBearingUpdates(rows))
    expect(s).toMatchObject({ keyword: 'bags', bucket: 'industry', updates: 2, found: 40, kept: 10, eligible: 5, insights: 3 })
    expect(s.platforms).toEqual(['instagram', 'youtube'])
    expect(s.keptRate).toBeCloseTo(0.25)
  })

  it('flags a term that found a lot, kept almost none and produced no insights', () => {
    const rows = [...deadTerm(3), ...liveTerm(3)]
    const bags = termValue(rows.filter((r) => r.keyword === 'bags'), insightBearingUpdates(rows))
    expect(bags.worthReviewing).toBe(true)
    expect(bags.because).toHaveLength(3)
    expect(bags.because[0]).toContain('3 of 150')
    expect(bags.because[2]).toContain('3 updates')
  })

  it('says nothing about a term measured over fewer than three updates', () => {
    const rows = [...deadTerm(2), ...liveTerm(2)]
    const bags = termValue(rows.filter((r) => r.keyword === 'bags'), insightBearingUpdates(rows))
    expect(bags.worthReviewing).toBe(false)
    expect(bags.because).toEqual([])
  })

  it('says nothing about a term that has not found 100 posts yet', () => {
    const rows = [...deadTerm(3, { found: 20, kept: 0 }), ...liveTerm(3)]
    const bags = termValue(rows.filter((r) => r.keyword === 'bags'), insightBearingUpdates(rows))
    expect(bags.found).toBe(60)
    expect(bags.worthReviewing).toBe(false)
  })

  it('says nothing about a term keeping 5% or more', () => {
    const rows = [...deadTerm(3, { found: 100, kept: 5 }), ...liveTerm(3)]
    const bags = termValue(rows.filter((r) => r.keyword === 'bags'), insightBearingUpdates(rows))
    expect(bags.worthReviewing).toBe(false)
  })

  it('says nothing about a term that contributed even one insight', () => {
    const rows = [...deadTerm(3, { insights: 1 }), ...liveTerm(3)]
    const bags = termValue(rows.filter((r) => r.keyword === 'bags'), insightBearingUpdates(rows))
    expect(bags.worthReviewing).toBe(false)
  })

  it('never condemns a term on updates whose analysis never ran', () => {
    // Same dead numbers, but no update produced an insight anywhere: the term
    // has not been given a fair chance, so the rule must stay silent.
    const rows = deadTerm(5)
    const bags = termValue(rows, insightBearingUpdates(rows))
    expect(bags.found).toBe(250)
    expect(bags.worthReviewing).toBe(false)
  })
})

describe('summariseTerms', () => {
  it('pools a term across platforms by default, worst relevance first', () => {
    const rows = [
      row({ run_id: 'a', keyword: 'bags', videos_found: 100, gate_survived: 2 }),
      row({ run_id: 'a', platform: 'youtube', keyword: 'bags', videos_found: 100, gate_survived: 8 }),
      row({ run_id: 'a', keyword: 'sealand', bucket: 'brand', videos_found: 20, gate_survived: 18, insights_contributed: 3 }),
    ]
    const out = summariseTerms(rows)
    expect(out.map((t) => t.keyword)).toEqual(['bags', 'sealand'])
    expect(out[0]).toMatchObject({ found: 200, kept: 10, platforms: ['instagram', 'youtube'] })
  })

  it('keeps platforms apart when asked, so a term can die on one and live on another', () => {
    const rows = [
      row({ run_id: 'a', keyword: 'bags', videos_found: 100, gate_survived: 2 }),
      row({ run_id: 'a', platform: 'youtube', keyword: 'bags', videos_found: 100, gate_survived: 80 }),
    ]
    const out = summariseTerms(rows, 'platform-term')
    expect(out.map((t) => t.key)).toEqual(['instagram::bags', 'youtube::bags'])
  })
})

describe('recentUpdates', () => {
  const dated = (run_id: string, created_at: string) => ({ run_id, created_at })

  it('keeps every row of the k newest updates and nothing older', () => {
    const rows = [
      dated('old', '2026-07-01T00:00:00Z'),
      dated('new', '2026-09-10T00:00:00Z'),
      dated('new', '2026-09-10T00:00:30Z'),
      dated('mid', '2026-08-01T00:00:00Z'),
    ]
    expect(recentUpdates(rows, 2).map((r) => r.run_id)).toEqual(['new', 'new', 'mid'])
  })

  it('returns everything when there are fewer updates than asked for', () => {
    const rows = [dated('a', '2026-09-01T00:00:00Z')]
    expect(recentUpdates(rows, 8)).toHaveLength(1)
  })

  it('keeps the caller’s row order, so a sorted read stays sorted', () => {
    const rows = [dated('b', '2026-09-02T00:00:00Z'), dated('a', '2026-09-01T00:00:00Z')]
    expect(recentUpdates(rows, 2).map((r) => r.run_id)).toEqual(['b', 'a'])
  })
})

describe('summariseTerms — a term that is dead on one platform only', () => {
  // Sealand's real case: "freitag" finds 182 and keeps 3 on Instagram while
  // earning insights on YouTube. Pooled, it looks fine; the client should
  // still hear about Instagram.
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => row({ run_id: `r${i}`, platform: 'instagram', keyword: 'freitag', bucket: 'competitor', videos_found: 40, gate_survived: 1, insights_contributed: 0 })),
    ...Array.from({ length: 5 }, (_, i) => row({ run_id: `r${i}`, platform: 'youtube', keyword: 'freitag', bucket: 'competitor', videos_found: 40, gate_survived: 30, insights_contributed: 6 })),
  ]

  it('flags the pooled row and names the platform that earned the flag', () => {
    const [freitag] = summariseTerms(rows)
    expect(freitag.worthReviewing).toBe(true)
    expect(freitag.reviewPlatforms).toEqual(['instagram'])
    expect(freitag.because[0]).toContain('on Instagram it found 200 posts and kept 5')
    expect(freitag.because[1]).toContain('one platform')
  })

  it('keeps the pooled numbers pooled — the columns do not change', () => {
    const [freitag] = summariseTerms(rows)
    expect(freitag).toMatchObject({ found: 400, kept: 155, insights: 30 })
  })

  it('says nothing when every platform is healthy', () => {
    const healthy = rows.filter((r) => r.platform === 'youtube')
    expect(summariseTerms(healthy)[0].worthReviewing).toBe(false)
  })

  it('folds the term key, so two spellings of one term are one row', () => {
    const mixed = [
      row({ run_id: 'a', keyword: 'Ossur', bucket: 'brand', videos_found: 10, gate_survived: 5 }),
      row({ run_id: 'a', keyword: 'ossur', bucket: 'brand', videos_found: 10, gate_survived: 5 }),
    ]
    const out = summariseTerms(mixed)
    expect(out).toHaveLength(1)
    expect(out[0].found).toBe(20)
  })
})
