import { describe, it, expect } from 'vitest'
import {
  CLASSIFIED_TYPES,
  CLASSIFIED_TYPE_DEFS,
  HOOK_STYLES,
  HOOK_STYLE_DEFS,
  enumDefLines,
} from './schemas'

describe('classifier enum definitions (2026-09-11)', () => {
  it('defines every classified_type and hook_style', () => {
    // The prompts used to hand the model bare labels; enumDefLines throws if a
    // value ever loses its clause, which is what keeps the two in lockstep.
    expect(() => enumDefLines(CLASSIFIED_TYPES, CLASSIFIED_TYPE_DEFS)).not.toThrow()
    expect(() => enumDefLines(HOOK_STYLES, HOOK_STYLE_DEFS)).not.toThrow()
    expect(enumDefLines(CLASSIFIED_TYPES, CLASSIFIED_TYPE_DEFS)).toHaveLength(CLASSIFIED_TYPES.length)
    expect(enumDefLines(HOOK_STYLES, HOOK_STYLE_DEFS)).toHaveLength(HOOK_STYLES.length)
  })

  it('throws rather than silently shipping an undefined value', () => {
    expect(() => enumDefLines(['nonexistent'], {})).toThrow(/no definition/)
  })

  it('keeps the lines in enum order, one clause each', () => {
    const lines = enumDefLines(CLASSIFIED_TYPES, CLASSIFIED_TYPE_DEFS)
    expect(lines[0].startsWith('- tutorial: ')).toBe(true)
    for (const l of lines) expect(l.length).toBeGreaterThan('- x: '.length)
  })
})
