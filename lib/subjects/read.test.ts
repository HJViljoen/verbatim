import { describe, expect, it } from 'vitest'

import { backReadBlockers, subjectFreezeHold, type MembershipOutcome, type SubjectBackReadState } from './read'

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

describe('subjectFreezeHold', () => {
  const ok = (name: string): NonNullable<MembershipOutcome> => ({
    subjectName: name, skipped: null, budgetStopped: false, unanswered: 0,
  })

  it('writes the subject months when every subject was decided', () => {
    expect(subjectFreezeHold([ok('Comfort'), ok('Price')])).toBeNull()
  })

  it('writes them for a tenant with no subjects at all — there is nothing to be short about', () => {
    expect(subjectFreezeHold([])).toBeNull()
  })

  it('holds when a subject refused on coverage — the case the record could not undo', () => {
    // judgeSubject writes no membership row, but the rows from LAST run are
    // still on file, so the month reading is short rather than empty and the
    // freeze would make it permanent.
    const hold = subjectFreezeHold([ok('Comfort'), { ...ok('Price'), skipped: 'coverage_short' }])
    expect(hold).toContain('Price')
    expect(hold).toContain('not embedded enough')
  })

  it('holds when a step ran out of retries', () => {
    expect(subjectFreezeHold([ok('Comfort'), null])).toContain('ran out of retries')
  })

  it('holds when the pass stopped at its ceiling', () => {
    expect(subjectFreezeHold([{ ...ok('Comfort'), budgetStopped: true }])).toContain('pass ceiling')
  })

  it('holds when the judge left pairs undecided, and says how many', () => {
    expect(subjectFreezeHold([{ ...ok('Comfort'), unanswered: 7 }])).toContain('Comfort: 7')
  })

  it('does not hold for a migration that is not applied or a tenant with no subjects', () => {
    // Neither writes anything and neither is short: there is no membership to
    // under-count. The side simply reads empty.
    expect(subjectFreezeHold([{ ...ok(''), skipped: 'migration' }])).toBeNull()
    expect(subjectFreezeHold([{ ...ok(''), skipped: 'no_subjects' }])).toBeNull()
  })

  it('reports every reason in one sentence', () => {
    const hold = subjectFreezeHold([
      { ...ok('Comfort'), skipped: 'coverage_short' },
      { ...ok('Price'), budgetStopped: true },
      null,
    ])
    expect(hold).toContain('Comfort')
    expect(hold).toContain('Price')
    expect(hold).toContain('ran out of retries')
  })
})
