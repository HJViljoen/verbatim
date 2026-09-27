import { describe, expect, it } from 'vitest'
import { changesInMonth } from './weekly'
import { SEALAND_SEPTEMBER_CHANGES } from '@/components/blocks/weekly/fixture'

describe('the weekly’s dated list of our changes (market-first WP3.7)', () => {
  const later = {
    changeId: '23de186e-0461-4d59-87fa-4eb7a695861d',
    date: '2026-09-26T16:43:53.937022+00:00',
    surface: 'segment' as const,
    words: 'How we mark makers’ videos',
    detail: null,
    reach: null,
    months: [],
  }
  const august = { ...later, changeId: 'aug', date: '2026-08-17T07:05:43.716Z', words: 'Accounts added for Sealand' }

  it('keeps the changes made in the reading month, by the reading’s clock', () => {
    const lines = changesInMonth([later, august, ...SEALAND_SEPTEMBER_CHANGES], '2026-09-01', '2026-09-22T12:00:00.000Z')
    expect(lines.map((l) => l.changeId)).not.toContain(later.changeId)
    expect(lines.map((l) => l.changeId)).not.toContain('aug')
    expect(lines).toHaveLength(SEALAND_SEPTEMBER_CHANGES.length)
  })

  it('keeps a change made on the clock’s own day once the clock has passed it', () => {
    expect(changesInMonth([later], '2026-09-01', '2026-09-27T09:00:00.000Z')).toHaveLength(1)
  })
})
