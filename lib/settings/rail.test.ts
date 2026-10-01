import { describe, expect, it } from 'vitest'

import { SETTINGS_ADDRESSES, SETTINGS_SUBPAGES, settingsSubPage, settingsTabs } from './rail'

// The settings area's table of tabs. Pure: no render, no DOM.

describe('the settings tabs, as the Page-Settings artboard draws them', () => {
  it('shows a client What you track, Team and Billing, in that order', () => {
    expect(settingsTabs(false).map((s) => s.label)).toEqual(['What you track', 'Team', 'Billing'])
  })

  it('gives the operator Readiness, The record and How to read after them', () => {
    expect(settingsTabs(true).map((s) => s.label)).toEqual(['What you track', 'Team', 'Billing', 'Readiness', 'The record', 'How to read'])
  })

  it('draws no tab for the pages that moved, and keeps their addresses served', () => {
    for (const key of ['subjects', 'reports'] as const) {
      expect(settingsTabs(true).some((s) => s.key === key)).toBe(false)
      expect(SETTINGS_ADDRESSES).toContain(settingsSubPage(key).href)
    }
  })

  it('serves the same addresses as before the split', () => {
    expect([...SETTINGS_ADDRESSES].sort()).toEqual([
      '/dashboard/billing', '/dashboard/settings', '/dashboard/settings/how-to-read', '/dashboard/settings/readiness',
      '/dashboard/settings/record', '/dashboard/settings/reports', '/dashboard/settings/subjects', '/dashboard/team',
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
