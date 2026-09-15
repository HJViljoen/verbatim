import { describe, expect, it } from 'vitest'

import { moveTarget, moveTitle, subjectSetVerdict } from './moves'
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
