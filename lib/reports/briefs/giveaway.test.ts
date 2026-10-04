import { describe, expect, it } from 'vitest'

import { GIVEAWAY } from './build'

describe('a giveaway post, by its caption', () => {
  it('flags a giveaway or a competition, never an event that names its prizes', () => {
    for (const c of ['DELI2SEA 2026 GIVEAWAY. WIN a Deli2Sea experience for you + your favourite person!', 'Tag two friends to enter', 'Our spring competition is open']) expect(GIVEAWAY.test(c), c).toBe(true)
    for (const c of ['MEET THE FOUNDERS OF MOVE FOR THE COAST. Spot prizes on the day.', 'Walking again after my first fitting', 'A win for the coast clean-up crew']) expect(GIVEAWAY.test(c), c).toBe(false)
  })
})
