import { describe, expect, it } from 'vitest'

import { SETTINGS_ADDRESSES, SETTINGS_SUBPAGES, settingsSubPage, settingsTabs } from './rail'

// The settings area's table of tabs. Pure: no render, no DOM.

describe('the settings tabs, as the E8 board draws them (Design v2)', () => {
  it('shows a client What you track, Your products, Your subjects, Team and Billing, in that order', () => {
    expect(settingsTabs(false).map((s) => s.label)).toEqual(['What you track', 'Your products', 'Your subjects', 'Team', 'Billing'])
  })

  it('gives the operator Readiness, The record and How to read after them', () => {
    expect(settingsTabs(true).map((s) => s.label)).toEqual([
      'What you track', 'Your products', 'Your subjects', 'Team', 'Billing', 'Readiness', 'The record', 'How to read',
    ])
  })

  it('serves the subject editor at the address it always had, as a client\'s tab (T10c)', () => {
    // Design v2 folded the Subjects page into Market; the editor came back to
    // Settings, under the key and address stored links already carry.
    expect(settingsSubPage('subjects')).toMatchObject({ href: '/dashboard/settings/subjects', label: 'Your subjects', tab: 'all' })
    expect(settingsSubPage('products')).toMatchObject({ href: '/dashboard/settings/products', label: 'Your products', tab: 'all' })
  })

  it('draws no tab for Reports and recipients, and keeps its address served', () => {
    expect(settingsTabs(true).some((s) => s.key === 'reports')).toBe(false)
    expect(SETTINGS_ADDRESSES).toContain(settingsSubPage('reports').href)
  })

  it('serves the addresses it served before, and Your products beside them', () => {
    expect([...SETTINGS_ADDRESSES].sort()).toEqual([
      '/dashboard/billing', '/dashboard/settings', '/dashboard/settings/how-to-read', '/dashboard/settings/products',
      '/dashboard/settings/readiness', '/dashboard/settings/record', '/dashboard/settings/reports', '/dashboard/settings/subjects',
      '/dashboard/team',
    ])
  })
})

describe('the settings rail table', () => {
  it('serves every address exactly once', () => {
    expect(new Set(SETTINGS_ADDRESSES).size).toBe(SETTINGS_ADDRESSES.length)
  })

  it('resolves every key it lists', () => {
    for (const s of SETTINGS_SUBPAGES) expect(settingsSubPage(s.key).href).toBe(s.href)
    expect(() => settingsSubPage('nope' as never)).toThrow()
  })
})
