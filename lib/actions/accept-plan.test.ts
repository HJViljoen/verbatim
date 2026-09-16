import { describe, expect, it } from 'vitest'

import { ACCEPTED_MESSAGE, MOVE_UNRECORDED_MESSAGE, planAfterMove } from './accept-plan'
import { SUBJECTS_NOT_APPLIED } from '../subjects/moves'

describe('planAfterMove — what a press of "Accept this advice" says', () => {
  it('tracks it from today when the move landed', () => {
    expect(planAfterMove({ ok: true, message: 'Tracking it from today.' }))
      .toEqual({ do: 'mark', message: ACCEPTED_MESSAGE })
  })

  it('marks the row and says what is not switched on, when M4 is not applied', () => {
    // THE ARM PRODUCTION IS IN. `moves` does not exist on either tenant, an
    // advice-kinded move has no subject to pre-read, so `declareMove` fails at
    // the INSERT — and its message is couldNotSave's, not the "not switched
    // on" sentence. Matching on the prose therefore marked the row Done and
    // then told the client "Could not save. Try again", which is how a second
    // rec_decisions row gets written.
    const declared = { ok: false, message: 'Could not save. Try again, and tell us if it keeps happening.', missing: true }
    expect(planAfterMove(declared)).toEqual({ do: 'mark-only', message: MOVE_UNRECORDED_MESSAGE })
    expect(MOVE_UNRECORDED_MESSAGE).not.toMatch(/could not save/i)
    expect(MOVE_UNRECORDED_MESSAGE).toContain('Marked as Done')
  })

  it('reads the code and never the sentence — the two no longer agree', () => {
    // The pre-read arm DOES carry the prose, and both arms must plan the same.
    expect(planAfterMove({ ok: false, message: SUBJECTS_NOT_APPLIED, missing: true }).do).toBe('mark-only')
    expect(SUBJECTS_NOT_APPLIED).toContain('not switched on')
  })

  it('refuses without writing anything when the move failed for another reason', () => {
    const declared = { ok: false, message: 'That subject is not yours to track.' }
    expect(planAfterMove(declared)).toEqual({ do: 'refuse', message: 'That subject is not yours to track.' })
  })

  it('never returns a plan that writes a status under a "could not save" sentence', () => {
    const cases = [
      { ok: true, message: 'x' },
      { ok: false, message: 'Could not save. Try again, and tell us if it keeps happening.', missing: true },
      { ok: false, message: 'Could not save. Try again, and tell us if it keeps happening.' },
    ]
    for (const c of cases) {
      const plan = planAfterMove(c)
      if (plan.do !== 'refuse') expect(plan.message).not.toMatch(/could not save/i)
    }
  })
})
