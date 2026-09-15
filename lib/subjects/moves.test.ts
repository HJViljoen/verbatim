import { describe, expect, it } from 'vitest'

import { activationCheck, moveTarget, moveTitle, sameName, subjectSetVerdict } from './moves'
import { MOVE_MAX_THEMES, SUBJECTS_MAX, SUBJECTS_MIN } from './types'

describe('moveTarget', () => {
  it('takes a subject for a subject move', () => {
    expect(moveTarget({ kind: 'subject', subjectId: 's1' }))
      .toEqual({ subject_id: 's1', registry_ids: null, lineage_id: null })
  })

  it('takes up to five themes for a theme move, deduplicated', () => {
    expect(moveTarget({ kind: 'theme', registryIds: ['t1', 't2', 't1'] }))
      .toEqual({ subject_id: null, registry_ids: ['t1', 't2'], lineage_id: null })
  })

  it('takes a lineage for an advice move — never a recommendation id', () => {
    // recommendations are deleted and re-inserted every update; the lineage is
    // the identity that survives it (lib/pipeline/rec-lineage.ts).
    expect(moveTarget({ kind: 'advice', lineageId: 'l1' }))
      .toEqual({ subject_id: null, registry_ids: null, lineage_id: 'l1' })
  })

  it('refuses a move with no target', () => {
    expect(moveTarget({ kind: 'subject' })).toBe('Pick the subject this is about.')
    expect(moveTarget({ kind: 'theme', registryIds: [] })).toBe('Pick at least one theme.')
    expect(moveTarget({ kind: 'advice' })).toBe('Name the recommendation this came from.')
  })

  it('refuses a move with two targets, whichever pair', () => {
    const line = 'A move is about one thing: a subject, some themes, or a piece of advice.'
    expect(moveTarget({ kind: 'subject', subjectId: 's', registryIds: ['t'] })).toBe(line)
    expect(moveTarget({ kind: 'subject', subjectId: 's', lineageId: 'l' })).toBe(line)
    expect(moveTarget({ kind: 'theme', registryIds: ['t'], subjectId: 's' })).toBe(line)
    expect(moveTarget({ kind: 'advice', lineageId: 'l', subjectId: 's' })).toBe(line)
  })

  it('holds the theme cap the initiatives CHECK already holds', () => {
    const six = Array.from({ length: MOVE_MAX_THEMES + 1 }, (_, i) => `t${i}`)
    expect(moveTarget({ kind: 'theme', registryIds: six })).toContain(`at most ${MOVE_MAX_THEMES}`)
  })

  it('refuses a kind this product does not track', () => {
    expect(moveTarget({ kind: 'vibes' as never })).toContain('vibes')
  })
})

describe('moveTitle', () => {
  it('collapses whitespace so a title reads the same on a chart as in the form', () => {
    expect(moveTitle('  Make   comfort the thing\npeople mention ')).toBe('Make comfort the thing people mention')
  })

  it('refuses an empty title and one past the column', () => {
    expect(moveTitle('   ')).toBeNull()
    expect(moveTitle('x'.repeat(121))).toBeNull()
    expect(moveTitle('x'.repeat(120))).toHaveLength(120)
  })
})

describe('subjectSetVerdict', () => {
  it('says how far off a tenant still setting up is, without refusing it', () => {
    const short = subjectSetVerdict(3)
    expect(short.state).toBe('short')
    expect(short.line).toContain(`${SUBJECTS_MIN}-${SUBJECTS_MAX}`)
  })

  it('is ready across the whole range', () => {
    for (let n = SUBJECTS_MIN; n <= SUBJECTS_MAX; n++) expect(subjectSetVerdict(n).state).toBe('ready')
  })

  it('says why too many is a problem, in the reader’s terms', () => {
    const over = subjectSetVerdict(SUBJECTS_MAX + 1)
    expect(over.state).toBe('over')
    expect(over.line).toContain('enough of the conversation to read')
  })

  it('carries no pipeline jargon', () => {
    for (const n of [0, 3, 6, 12]) {
      const { line } = subjectSetVerdict(n)
      for (const word of ['run', 'Pass', 'cluster', 'embedding', 'judge']) expect(line).not.toContain(word)
    }
  })
})

describe('activationCheck', () => {
  it('confirms a proposed subject — the one write that starts the counting', () => {
    // Everything downstream filters on `active`: the judge, the month reading
    // and the freeze. A named subject is `proposed` and measures nothing until
    // this returns `activate`.
    expect(activationCheck({ status: 'proposed' }, 4)).toEqual({ do: 'activate' })
  })

  it('does nothing to a subject that is already being counted', () => {
    expect(activationCheck({ status: 'active' }, 6).do).toBe('nothing')
  })

  it('refuses to bring a stopped subject back under its old line', () => {
    const v = activationCheck({ status: 'retired' }, 2)
    expect(v.do).toBe('refuse')
    expect(v.do === 'refuse' && v.message).toContain('new line')
  })

  it('refuses a subject that is not this tenant\u2019s', () => {
    expect(activationCheck(null, 0).do).toBe('refuse')
  })

  it('holds the ceiling on the way up, and only on the way up', () => {
    expect(activationCheck({ status: 'proposed' }, SUBJECTS_MAX - 1).do).toBe('activate')
    const over = activationCheck({ status: 'proposed' }, SUBJECTS_MAX)
    expect(over.do).toBe('refuse')
    expect(over.do === 'refuse' && over.message).toContain('enough of the conversation to read')
  })

  it('carries no pipeline jargon in anything it says', () => {
    const lines = [
      activationCheck(null, 0),
      activationCheck({ status: 'active' }, 1),
      activationCheck({ status: 'retired' }, 1),
      activationCheck({ status: 'proposed' }, SUBJECTS_MAX),
    ].map((v) => (v.do === 'activate' ? '' : v.message))
    for (const line of lines) {
      for (const word of ['run', 'Pass', 'cluster', 'embedding', 'judge', 'status']) expect(line).not.toContain(word)
    }
  })
})

describe('sameName', () => {
  it('compares the way the partial unique index does — lower(trim(name))', () => {
    expect(sameName('Comfort', ' comfort ')).toBe(true)
    expect(sameName('COMFORT', 'Comfort')).toBe(true)
  })

  it('does not call two different subjects one', () => {
    // A re-description keeps the name and retires the row it replaces; a name
    // already taken by a DIFFERENT live subject is still refused.
    expect(sameName('Comfort', 'Comfort under load')).toBe(false)
  })
})
