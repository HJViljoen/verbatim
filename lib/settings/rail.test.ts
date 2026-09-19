import { describe, expect, it } from 'vitest'

import { SETTINGS_ADDRESSES, SETTINGS_SUBPAGES, railCountText, settingsSubPage } from './rail'

// The settings rail's table and its count budget (Block D wave 3, RC9). Pure:
// no render, no DOM — `railCountText` is arithmetic over two strings.

describe('railCountText — the unit is drawn where the ROW holds it', () => {
  it('prints the unit on the three rows that carry a count', () => {
    // Measured in Chromium at 1440 and at 375: the link's content box is 200px
    // at every width, and these three need 113 / 128 / 136px of it.
    expect(railCountText({ value: '21', unit: 'terms' }, 'Tracking')).toBe('21 terms')
    expect(railCountText({ value: '6', unit: 'subjects' }, 'Subjects')).toBe('6 subjects')
    expect(railCountText({ value: '22', unit: 'updates' }, 'The record')).toBe('22 updates')
  })

  it('still refuses the pair the rule was written about', () => {
    // "5 schedules" beside "Reports and recipients" is what printed "Reports
    // and recipi…", cutting the one entry a reader is least able to guess.
    // 22 characters of label leaves room for about six of count.
    expect(railCountText({ value: '5', unit: 'schedules' }, 'Reports and recipients')).toBe('5')
  })

  it('refuses a unit written as a whole phrase', () => {
    // `/dashboard/settings/subjects` passes "subjects being measured", which is
    // an accessible name rather than a unit. It stays one.
    expect(railCountText({ value: '6', unit: 'subjects being measured' }, 'Subjects')).toBe('6')
  })

  it('never returns an empty string, so a loaded count cannot vanish', () => {
    for (const s of SETTINGS_SUBPAGES) {
      expect(railCountText({ value: '1', unit: 'x'.repeat(60) }, s.label)).toBe('1')
    }
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
