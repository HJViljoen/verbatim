import { describe, expect, it } from 'vitest'

import { SETTINGS_ADDRESSES, SETTINGS_SUBPAGES, settingsSubPage } from './rail'

// The settings area's table of tabs. Pure: no render, no DOM.

describe('the settings tabs, in the approved preview\'s order', () => {
  it('draws the preview\'s six tabs first, in its order, and Readiness after them', () => {
    expect(SETTINGS_SUBPAGES.map((s) => s.label)).toEqual([
      'What we read', 'Subjects', 'The record', 'Reports and recipients', 'Team', 'How to read',
      // Pages still send a reader to "Settings › Readiness"
      // (lib/reading/own-posts.ts), so the tab stays, after the six.
      'Readiness',
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
