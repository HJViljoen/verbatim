import { describe, expect, it } from 'vitest'

import { pickSubjects, subjectNames } from '../../scripts/subject-membership'

// The --subjects filter scripts/subject-membership.ts and
// scripts/subject-calibration.ts share (plan WP3.1): the subjects confirmed on
// the 13 Oct call are judged and checked on their own. Neither script is run
// here (no read, no spend); these are the pure halves.

// Staging's active set, 27 Sep 2026, in named_at order, plus §2.3's two candidates.
const ACTIVE = ['Waterproofing', 'Repair & warranty', 'Looks & style', 'Durability', 'Price', 'Comfort', 'Community & purpose',
  'Travel fit & carry-on', 'Materials & origin'].map((name, i) => ({ id: `s${i}`, name }))

describe('subjectNames', () => {
  it('splits on commas and trims', () => {
    expect(subjectNames(' Travel fit & carry-on , Materials & origin ')).toEqual(['Travel fit & carry-on', 'Materials & origin'])
  })
  it('refuses an empty value', () => {
    expect(() => subjectNames(undefined)).toThrow(/one or more subject names/)
    expect(() => subjectNames(' , ')).toThrow(/one or more subject names/)
  })
})

describe('pickSubjects', () => {
  it('keeps the set\'s own order and matches case-blind', () => {
    expect(pickSubjects(ACTIVE, ['materials & ORIGIN', 'Travel fit & carry-on']).map((s) => s.id)).toEqual(['s7', 's8'])
  })
  it('refuses the whole run when a name is not an active subject, naming each one', () => {
    expect(() => pickSubjects(ACTIVE, ['Travel fit & carry-on', 'Sustainability', 'Weight']))
      .toThrow('REFUSED: not an active subject of this tenant: "Sustainability", "Weight". Nothing priced, nothing sent.')
  })
})
