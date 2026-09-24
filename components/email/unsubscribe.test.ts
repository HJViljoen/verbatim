import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONE UNSUBSCRIBE SENTENCE (copy de-clutter 2026-09-24, ruling N). The
// quarterly email said "in Verbatim, in Settings", the report email "in
// Verbatim in the Studio" and the brief email "in the Studio": three wordings
// of one fact. The shortest is the one kept, in all three.
const CLAUSE = 'an owner or admin changes it in the Studio.'
const src = (f: string) => readFileSync(join(__dirname, f), 'utf8')

describe('the unsubscribe line', () => {
  it('is worded identically in the quarterly and brief emails', () => {
    for (const f of ['quarterly.tsx', 'document.tsx', 'document-brief.tsx']) {
      expect(src(f), f).toContain(CLAUSE)
      expect(src(f), f).not.toContain('changes it in Verbatim')
    }
  })

  it('leaves the quarterly masthead without the figures-out-of rule', () => {
    expect(src('quarterly.tsx')).not.toContain('{QUARTERLY_RULE}')
  })
})
