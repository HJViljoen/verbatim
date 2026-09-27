import { describe, expect, it } from 'vitest'

import type { ConfigChange } from '../config-log'
import { printNote, readChangeLog } from './change-log'

// A stored change note printed with no em dash (WP3.10 copy debt). The row
// stays as stored; only the reading changes.

describe('printNote', () => {
  it('reads each em dash as a comma, and none at either end', () => {
    // M14's own note, stored by the trigger on every subject written outside the product.
    expect(printNote('Confirmed on creation: this subject was counted from the moment it was written, and it was not written through the product — no member confirmed it.'))
      .toBe('Confirmed on creation: this subject was counted from the moment it was written, and it was not written through the product, no member confirmed it.')
    expect(printNote('— Poler added —')).toBe('Poler added')
    expect(printNote('Terms changed —.')).toBe('Terms changed.')
    expect(printNote('  ')).toBeNull()
    expect(printNote(null)).toBeNull()
  })

  it('reaches the change log as printed', () => {
    const row = {
      id: 'c1', client_id: 'x', changed_at: '2026-09-17T09:00:00Z', surface: 'rivals', field: 'competitor_names',
      before: ['Cotopaxi'], after: ['Cotopaxi', 'Poler'], actor_kind: 'operator', actor_user_id: null, actor_label: 'x',
      run_id: null, source: 'logged', rows_affected: null, note: 'Poler was added as a rival — its months start here.',
    } as unknown as ConfigChange
    const view = readChangeLog({ rows: [row] })
    const said = JSON.stringify(view)
    expect(said).toContain('Poler was added as a rival, its months start here.')
    expect(said).not.toContain('—')
  })
})
