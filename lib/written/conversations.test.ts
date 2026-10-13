import { describe, expect, it } from 'vitest'

import { setApartIds, weekConversations } from './conversations'

// The week's conversations as the week's lead ranks them (T11b): the
// category's window count, the month beside it, Market's set-apart mark.

describe('setApartIds: Market\'s mark, from the month\'s maker shares', () => {
  it('half or more makers\' own, or half or more off-topic, is set apart; a row that is not a count is not', () => {
    const ids = setApartIds([
      { registry_id: 'makers', videos: 10, maker: 5, noise: 0, labelled: 10 },
      { registry_id: 'noise', videos: 10, maker: 1, noise: 6, labelled: 10 },
      { registry_id: 'market', videos: 10, maker: 4, noise: 4, labelled: 10 },
      { registry_id: 'broken', videos: 0, maker: 3, noise: 3, labelled: 0 },
    ])
    expect([...ids].sort()).toEqual(['makers', 'noise'])
    expect(setApartIds(null).size).toBe(0)
  })
})

describe('weekConversations', () => {
  it('every labelled theme, its category week and month, its mark, the biggest this week first', () => {
    const out = weekConversations({
      themes: [
        { themeId: 'b', label: ' Second ', weekVideos: 9 },
        { themeId: 'a', label: 'First', weekVideos: 14 },
        { themeId: 'c', label: '', weekVideos: 30 },
        { themeId: 'd', label: 'Unread month', weekVideos: 9 },
      ],
      monthK: new Map([['a', 40], ['b', 21]]),
      setApart: new Set(['b']),
    })
    expect(out).toEqual([
      { registryId: 'a', label: 'First', week: 14, month: 40, setApart: false },
      { registryId: 'b', label: 'Second', week: 9, month: 21, setApart: true },
      { registryId: 'd', label: 'Unread month', week: 9, month: null, setApart: false },
    ])
  })
})
