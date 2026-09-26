import { describe, expect, it } from 'vitest'

import { confirmedSubjects, ORIGIN_UNCONFIRMED, subjectOriginWords } from './subject-origin'

// Subject origins printed truthfully (market-first decision G, WP3.1).

const CANDIDATE = 'the category raised it in the videos we read'

describe('subjectOriginWords', () => {
  const none = new Map<string, string>()

  it('reads today\'s eight "picked for you, not yet confirmed": written by script, created_by null, no confirmation on record', () => {
    // Staging, 27 Sep: all seven of Sealand's live subjects are active with
    // created_by null; three carry origin 'client', which is not the truth.
    for (const id of ['waterproofing', 'repair', 'looks', 'durability', 'price', 'comfort', 'community']) {
      expect(subjectOriginWords({ id, status: 'active', created_by: null }, none, CANDIDATE)).toBe(ORIGIN_UNCONFIRMED)
    }
    expect(ORIGIN_UNCONFIRMED).toBe('picked for you, not yet confirmed')
  })

  it('says when the client confirmed it', () => {
    const confirmed = new Map([['travel', '2026-10-13T18:00:00Z']])
    expect(subjectOriginWords({ id: 'travel', status: 'active', created_by: null }, confirmed, CANDIDATE)).toBe('you confirmed it on 13 Oct')
  })

  it('credits a member who named it through the product', () => {
    expect(subjectOriginWords({ id: 'x', status: 'active', created_by: 'user-1' }, none, CANDIDATE)).toBe('you named it')
  })

  it('keeps a candidate\'s reason on a proposed row', () => {
    expect(subjectOriginWords({ id: 'x', status: 'proposed', created_by: null }, none, CANDIDATE)).toBe(CANDIDATE)
  })
})

describe('confirmedSubjects', () => {
  it('takes the operator\'s confirmation rows and a member\'s activation, the earliest of each, and nothing else', () => {
    const rows = [
      // scripts/new-subjects.ts's row
      { field: 'confirmed', after: { id: 'travel', name: 'Travel fit & carry-on', confirmed_on: '2026-10-13' }, actor_kind: 'operator', changed_at: '2026-10-14T08:00:00Z' },
      // M4's status trigger, a member activating a proposed subject
      { field: 'subjects', after: { id: 'materials', status: 'active' }, actor_kind: 'user', changed_at: '2026-10-15T08:00:00Z' },
      { field: 'subjects', after: { id: 'materials', status: 'active' }, actor_kind: 'user', changed_at: '2026-10-12T08:00:00Z' },
      // M14's insert trigger for a row written by SQL: not a confirmation
      { field: 'subjects', after: { id: 'looks', status: 'active', origin: 'own_claims' }, actor_kind: 'sql', changed_at: '2026-09-23T08:00:00Z' },
      // a calibration row
      { field: 'calibration', after: { id: 'comfort' }, actor_kind: 'script', changed_at: '2026-09-24T08:00:00Z' },
      // a retirement by a member
      { field: 'subjects', after: { id: 'repair', status: 'retired' }, actor_kind: 'user', changed_at: '2026-10-13T08:00:00Z' },
    ]
    expect([...confirmedSubjects(rows)]).toEqual([['travel', '2026-10-14T08:00:00Z'], ['materials', '2026-10-12T08:00:00Z']])
  })
})
