import { describe, expect, it } from 'vitest'
import { FAILED_EXPLAINED } from '@/lib/subjects/calibration-state'
import { FAILED_EXPLAINED_EACH, FAILED_STATE } from './failed-words'

// Say a state once (the real-data pass, 8 Nov): the subjects being
// re-described are named together and why is said once, in
// FAILED_EXPLAINED's own words.

describe('the failed-subject words', () => {
  it('the state is FAILED_EXPLAINED\'s own first words', () => {
    expect(FAILED_STATE).toBe('Being re-described')
    expect(FAILED_EXPLAINED.startsWith(`${FAILED_STATE}: `)).toBe(true)
  })

  it('the plural keeps its state, its reason and its promise, with no figure', () => {
    expect(FAILED_EXPLAINED_EACH).toBe('Being re-described: a check found each of them catching comments about other things, so none shows a figure while we reword them.')
    expect(FAILED_EXPLAINED_EACH).not.toMatch(/\d/)
  })
})
