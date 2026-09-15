import { describe, expect, it } from 'vitest'

import { backReadBlockers, type SubjectBackReadState } from './read'

const s = (over: Partial<SubjectBackReadState>): SubjectBackReadState => ({
  id: 'a', name: 'Comfort', status: 'active', decided: 120, undecided: 0, ...over,
})

describe('backReadBlockers', () => {
  it('lets a confirmed, judged set through', () => {
    expect(backReadBlockers([s({ id: 'a' }), s({ id: 'b', name: 'Price' })])).toEqual([])
  })

  it('refuses when nothing is confirmed — the failure that has no second chance', () => {
    // Every already-closed audience-month takes a subject row exactly once
    // (decision K). Spending that on an empty set loses the history of every
    // subject named afterwards.
    const out = backReadBlockers([s({ status: 'proposed' })])
    expect(out.some((line) => line.includes('no subject is confirmed yet'))).toBe(true)
  })

  it('names the subjects that are still only proposed', () => {
    const out = backReadBlockers([s({ id: 'a' }), s({ id: 'b', name: 'Looks medical', status: 'proposed' })])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('Looks medical')
    expect(out[0]).toContain('not confirmed')
  })

  it('names a confirmed subject nothing has judged yet', () => {
    const out = backReadBlockers([s({ id: 'a' }), s({ id: 'b', name: 'Price', decided: 0 })])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('Price')
    expect(out[0]).toContain('subject-membership')
  })

  it('ignores retired subjects entirely — they are not what a back-read is for', () => {
    expect(backReadBlockers([s({ id: 'a' }), s({ id: 'r', status: 'retired', decided: 0 })])).toEqual([])
  })

  it('names a subject whose backfill stopped part-way — the budgetStopped case', () => {
    const out = backReadBlockers([s({ id: 'a' }), s({ id: 'b', name: 'Price', decided: 800, undecided: 412 })])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('412 pair(s) still undecided')
  })

  it('reports every reason at once, so one re-run fixes the lot', () => {
    const out = backReadBlockers([
      s({ id: 'a', status: 'proposed' }),
      s({ id: 'b', name: 'Price', decided: 0, status: 'active' }),
    ])
    expect(out).toHaveLength(2)
  })
})
