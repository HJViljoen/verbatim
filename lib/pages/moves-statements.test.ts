import { describe, expect, it } from 'vitest'

import { statementsBlock } from './moves-statements'
import type { StatementReading } from '../statements/types'

const reading = (month: string, base: number, complete = true): StatementReading => ({
  version: 'v', month, complete,
  market: { videos: 10, base }, own: { videos: 0 },
  stance: { of: 'market', base: 10, backs: 5, doubts: 1, asks: 2 },
  says: 'People like it.', who: [{ about: 'market', videos: 10 }], members: 12,
})

describe('statementsBlock', () => {
  const statements = [
    { id: 's2', text: 'Second', created_at: '2026-10-02T00:00:00Z' },
    { id: 's1', text: 'First', created_at: '2026-10-01T00:00:00Z' },
    { id: 's3', text: 'Just added', created_at: '2026-10-03T00:00:00Z' },
  ]

  it('draws the newest month only, oldest statement first, and an unmeasured row as words alone', () => {
    const b = statementsBlock({
      statements,
      readings: [
        { statement_id: 's1', month: '2026-08-01', data: reading('2026-08-01', 700), measured_at: '2026-09-01T00:00:00Z' },
        { statement_id: 's1', month: '2026-09-01', data: reading('2026-09-01', 852), measured_at: '2026-10-01T00:00:00Z' },
        { statement_id: 's2', month: '2026-09-01', data: reading('2026-09-01', 852), measured_at: '2026-10-02T00:00:00Z' },
      ],
      canEdit: true,
      brand: 'Sealand',
    })
    expect(b.month).toBe('2026-09-01')
    expect(b.base).toBe(852)
    expect(b.complete).toBe(true)
    expect(b.statements.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(b.statements[0].reading?.market.base).toBe(852)
    expect(b.statements[2].reading).toBeNull()
  })

  it('ignores readings of retired statements and has no month when nothing is measured', () => {
    const b = statementsBlock({
      statements: statements.slice(2),
      readings: [{ statement_id: 'gone', month: '2026-09-01', data: reading('2026-09-01', 852), measured_at: '2026-10-01T00:00:00Z' }],
      canEdit: false,
      brand: 'Sealand',
    })
    expect(b.month).toBeNull()
    expect(b.base).toBeNull()
    expect(b.statements).toEqual([{ id: 's3', text: 'Just added', reading: null }])
  })
})
