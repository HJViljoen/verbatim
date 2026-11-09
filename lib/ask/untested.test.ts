import { describe, expect, it } from 'vitest'

import { NOBODY_RAISES_IT, TOO_FEW_TO_JUDGE, untestedWords } from './untested'

// What an untested claim says (Heinrich, 9 Nov), on the thread, Your moves,
// Market's card and the quarterly alike: whether people raise it at all.
describe('untestedWords', () => {
  it('says how many videos raise it, under the floor, and that it is too few to judge', () => {
    expect(untestedWords({ raisedIn: 3 })).toBe('Raised in 3 videos, too few to judge')
    expect(untestedWords({ raisedIn: 1 })).toBe('Raised in 1 video, too few to judge')
  })

  it('says nobody raises it on none, Your moves’ own words', () => {
    expect(untestedWords({ raisedIn: 0 })).toBe('Nobody raises it')
    expect(NOBODY_RAISES_IT).toBe('Nobody raises it')
  })

  it('says what is true either way on a reading stored before the count was', () => {
    expect(untestedWords({})).toBe('Too few videos to judge')
    expect(untestedWords({ raisedIn: null })).toBe(TOO_FEW_TO_JUDGE)
  })

  it('says a verdict waits on a claim the hold leaves untested, never "too few"', () => {
    expect(untestedWords({ raisedIn: 7, pending: { verdict: 'contradicts' } })).toBe('Raised in 7 videos, waiting for a second update to agree')
    expect(untestedWords({ pending: { verdict: 'echoes' } })).toBe('Waiting for a second update to agree')
  })
})
