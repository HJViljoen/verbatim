import { describe, expect, it } from 'vitest'

import {
  askAboutTheme,
  noThemeOpen,
  openThemeId,
  platformShares,
  themeKindCounts,
  voiceSurfaceHref,
} from './voice-surface'
import type { MarketTheme } from './overview-market'

// The pure half of Conversation (market-first WP2.4; the page was Voice, Phase 1
// WP13). Everything here decides what a reader is TOLD or where a link takes
// them: which theme the pane opens, what the Ask link asks, what a theme's
// comments did, and which of the reader's choices a link keeps. No I/O, per
// AGENTS.md.

describe('voiceSurfaceHref', () => {
  it('keeps the reader’s month through a theme click, so a row never jumps the page back to the reading month', () => {
    expect(voiceSurfaceHref({ month: '2026-08' }, { theme: 't1' })).toBe('/dashboard/voice?month=2026-08&theme=t1')
  })

  it('keeps the expanded board and the open theme together, and drops a key set to null', () => {
    expect(voiceSurfaceHref({ board: 'all', theme: 't1' }, { board: null })).toBe('/dashboard/voice?theme=t1')
    expect(voiceSurfaceHref({ theme: 't1' }, { board: 'all' })).toBe('/dashboard/voice?theme=t1&board=all')
  })

  it('carries none of a stored link’s keys the page no longer reads (?themes=, ?horizon=, ?audience=)', () => {
    expect(voiceSurfaceHref({ themes: 'wet_commute', horizon: 'last_3', audience: 'client' }, { theme: 't1' })).toBe('/dashboard/voice?theme=t1')
  })

  it('is the bare address when nothing is selected', () => {
    expect(voiceSurfaceHref({})).toBe('/dashboard/voice')
  })
})

describe('askAboutTheme: the pane’s "Ask about this" (plan §2.8 D3)', () => {
  it('sends `?ask=`, which the Ask box reads, with the month by name', () => {
    expect(askAboutTheme('Price and sale questions', '2026-09-01'))
      .toBe('/dashboard/agent?ask=What%20is%20behind%20%E2%80%9CPrice%20and%20sale%20questions%E2%80%9D%20in%20September%3F')
  })

  it('never sends `?q=`, which Ask ignores, and never says "this month"', () => {
    const href = askAboutTheme('Price and sale questions', '2026-09-01')
    expect(href).not.toContain('?q=')
    expect(decodeURIComponent(href)).not.toContain('this month')
  })

  it('stays inside the 300 characters the Ask box takes', () => {
    const q = decodeURIComponent(askAboutTheme('x'.repeat(400), '2026-09-01').split('?ask=')[1])
    expect(q.length).toBe(300)
  })
})

describe('themeKindCounts: what people did in a theme’s comments', () => {
  it('counts VIDEOS per kind, over the theme’s own videos in the month, biggest first', () => {
    const month = new Set(['v1', 'v2', 'v3'])
    const got = themeKindCounts([
      { category: 'purchase_intent', source_video_id: 'v1' },
      { category: 'purchase_intent', source_video_id: 'v1' },
      { category: 'purchase_intent', source_video_id: 'v2' },
      { category: 'question', source_video_id: 'v3' },
      // A video outside the month's set and an insight with no video are not counted.
      { category: 'question', source_video_id: 'v9' },
      { category: 'praise', source_video_id: null },
    ], month)
    expect(got).toEqual([
      { kind: 'purchase_intent', label: 'Ready to buy', videos: 2 },
      { kind: 'question', label: 'Asking how it works', videos: 1 },
    ])
  })

  it('says "Praising it" for praise, the market’s word (decision K)', () => {
    expect(themeKindCounts([{ category: 'praise', source_video_id: 'v1' }], new Set(['v1']))[0].label).toBe('Praising it')
  })
})

describe('openThemeId: which theme the pane opens (plan §2.4 C3)', () => {
  const t = (registryId: string): MarketTheme => ({
    registryId, label: registryId, labelStripped: false, kind: null, k: 10, n: 625, prev: null,
    makerShare: null, noiseShare: null, identityNewThisRun: false, flags: [], provenance: null,
  })
  const board = { rows: [t('a'), t('lead')], makers: [t('m')], setAside: [], below: { count: 2, rows: null } }

  it('the lead by default; the one the reader asked for, or a stored link named, where the month holds it', () => {
    expect(openThemeId({ asked: null, linked: null, lead: 'lead', board })).toBe('lead')
    expect(openThemeId({ asked: 'm', linked: null, lead: 'lead', board })).toBe('m')
    expect(openThemeId({ asked: null, linked: 'a', lead: 'lead', board })).toBe('a')
  })

  it('ignores an id the month does not hold, and falls to the biggest row where nothing may lead', () => {
    expect(openThemeId({ asked: 'gone', linked: null, lead: 'lead', board })).toBe('lead')
    expect(openThemeId({ asked: null, linked: null, lead: null, board })).toBe('a')
    expect(openThemeId({ asked: null, linked: null, lead: null, board: { rows: [], makers: null, setAside: null, below: { count: 0, rows: null } } })).toBeNull()
  })

  it('opens a theme at 3 to 9 only while the board lists it', () => {
    const expanded = { ...board, below: { count: 1, rows: [t('b')] } }
    expect(openThemeId({ asked: 'b', linked: null, lead: 'lead', board })).toBe('lead')
    expect(openThemeId({ asked: 'b', linked: null, lead: 'lead', board: expanded })).toBe('b')
  })

  it('says why nothing is open in the month’s own words', () => {
    expect(noThemeOpen('2026-09-01')).toBe('No theme carried 3 videos or more in September yet, so there is nothing to open.')
  })
})

describe('platformShares', () => {
  it('reads staging’s Sealand September category: 625 videos over four platforms, largest first', () => {
    const shares = platformShares({ reddit: 115, tiktok: 180, youtube: 277, instagram: 53 }, 625)
    expect(shares.map((s) => [s.platform, s.videos])).toEqual([['youtube', 277], ['tiktok', 180], ['reddit', 115], ['instagram', 53]])
    expect(shares[0].pct).toBe(44.3)
  })

  it('omits a platform the month did not carry, answers nothing with no mix, and never divides by a missing base', () => {
    expect(platformShares({ tiktok: 6, youtube: 0 }, 6).map((s) => s.platform)).toEqual(['tiktok'])
    expect(platformShares(null, 100)).toEqual([])
    expect(platformShares({ tiktok: 4 }, null)[0].pct).toBeNull()
  })
})
