import { describe, expect, it } from 'vitest'
import { PAGE_KEYS } from './types'
import { ALL_SECTION_PAGES, LEGACY_SECTION_PAGES, SECTION_PAGES } from '../reports/types'

// A page key is a stored contract (types.ts): it is what a snapshot's ref, a
// built report's section and an export event name. These are the rules that
// keep the three lists that spend it from drifting apart — WP9 found them
// hand-kept in four places and disagreeing in one.

describe('PAGE_KEYS', () => {
  it('is unique and holds the nine Phase 1 surfaces plus the retired keys', () => {
    expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length)
    for (const k of ['overview', 'subjects', 'voice', 'market', 'competitive', 'week', 'agent'] as const) {
      expect(PAGE_KEYS).toContain(k)
    }
    // Retired, and still stored: dropping one of these from the union is what
    // silently shortens a built deck, a share page and the digest email.
    for (const k of ['dashboard', 'content', 'profile'] as const) expect(PAGE_KEYS).toContain(k)
  })

  it('contains every page a report section may name', () => {
    for (const p of ALL_SECTION_PAGES) expect(PAGE_KEYS).toContain(p)
  })
})

describe('SECTION_PAGES', () => {
  it('offers Overview and Subjects and no longer offers the Dashboard', () => {
    expect(SECTION_PAGES).toContain('overview')
    expect(SECTION_PAGES).toContain('subjects')
    expect(SECTION_PAGES).not.toContain('dashboard')
  })

  it('leaves This week out of Phase 1 reports', () => {
    expect(SECTION_PAGES).not.toContain('week')
    expect(ALL_SECTION_PAGES).not.toContain('week')
  })

  it('still validates the retired keys, so a stored report stays editable', () => {
    expect(LEGACY_SECTION_PAGES).toEqual(['dashboard'])
    expect(ALL_SECTION_PAGES).toContain('dashboard')
    expect(new Set(ALL_SECTION_PAGES).size).toBe(ALL_SECTION_PAGES.length)
  })
})
