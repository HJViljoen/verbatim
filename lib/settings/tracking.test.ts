import { describe, expect, it } from 'vitest'

import type { SubredditEntry } from '../gather/types'
import { OWN_POSTS_NO_ACCOUNTS } from '../reading/own-posts'
import type { Competitor } from '../rivals'
import { communityRows, communityWords, tableRows, unconfiguredShare, UNCONFIGURED_SHOWN } from './communities'
import { RIVAL_PRECEDENCE, rivalRows, rivalState } from './rivals-view'
import { termYieldByMonth, TERM_YIELD_BASIS, type KeywordRunRow } from './terms'

// ---- the per-term yield -----------------------------------------------------

const run = (keyword: string, found: number, kept: number, at: string): KeywordRunRow =>
  ({ keyword, videos_found: found, gate_survived: kept, created_at: at })

describe('termYieldByMonth', () => {
  it('groups by the month the UPDATE ran, and says so', () => {
    const out = termYieldByMonth([
      run('sealand gear', 100, 2, '2026-08-17T06:00:00Z'),
      run('sealand gear', 164, 4, '2026-09-13T06:00:00Z'),
      run('upcycled bag', 60, 55, '2026-09-13T06:00:00Z'),
    ])
    expect(out.map((t) => t.keyword)).toEqual(['sealand gear', 'upcycled bag'])
    expect(out[0].months.map((m) => m.month)).toEqual(['2026-08', '2026-09'])
    expect(out[0]).toMatchObject({ found: 264, kept: 6, keptPct: 2.3 })
    expect(TERM_YIELD_BASIS).toContain('not by when the comments were written')
  })

  it('pools two gathers in one month rather than drawing two points', () => {
    const out = termYieldByMonth([
      run('amputee', 10, 8, '2026-09-06T06:00:00Z'),
      run('amputee', 10, 2, '2026-09-13T06:00:00Z'),
    ])
    expect(out[0].months).toEqual([{ month: '2026-09', found: 20, kept: 10, keptPct: 50 }])
  })

  it('is empty rather than zero when a term never ran', () => {
    expect(termYieldByMonth([])).toEqual([])
    expect(termYieldByMonth([run('  ', 5, 1, '2026-09-01T00:00:00Z')])).toEqual([])
  })
})

// ---- the communities --------------------------------------------------------

const entry = (over: Partial<SubredditEntry> & { name: string }): SubredditEntry =>
  ({ status: 'active', discovered_at: '2026-08-01', ...over })

describe('communityRows', () => {
  const rows = communityRows({
    entries: [
      entry({ name: 'r/Prosthetics', probe: { sampled: 20, kept: 14, at: '2026-08-10' } }),
      entry({ name: 'bionics', status: 'candidate' }),
      entry({ name: 'onebag' }),
      entry({ name: 'sekiro', status: 'rejected' }),
    ],
    roi: [
      { subreddit: 'prosthetics', posts: 26, eligible: 20, comments: 300, insights: 40, yield: 1.5 },
      { subreddit: 'amputee', posts: 23, eligible: 18, comments: 210, insights: 31, yield: 1.3 },
    ],
    gate: [{ key: 'prosthetics', label: 'r/prosthetics', found: 32, kept: 26, keptPct: 81.3, unjudged: 0 }],
  })

  it('folds four spellings of one community into one row', () => {
    expect(rows.filter((r) => r.key === 'prosthetics')).toHaveLength(1)
    expect(rows.find((r) => r.key === 'prosthetics')).toMatchObject({
      status: 'active', posts: 26, comments: 300, insights: 40, keptPct: 81.3,
    })
  })

  it('draws a community nobody configured, because that is the fact worth having', () => {
    const amputee = rows.find((r) => r.key === 'amputee')!
    expect(amputee.unconfigured).toBe(true)
    expect(amputee.status).toBeNull()
    expect(communityWords(amputee)).toBe('not on your list — the search found it')
    expect(unconfiguredShare(rows)).toEqual({ posts: 49, fromUnconfigured: 23, pct: 46.9 })
  })

  it('tells a hand-watched community from a measured one', () => {
    expect(communityWords(rows.find((r) => r.key === 'onebag')!)).toBe('watched by hand, never sampled')
    expect(communityWords(rows.find((r) => r.key === 'prosthetics')!)).toBe('watched')
    expect(communityWords(rows.find((r) => r.key === 'bionics')!)).toBe('proposed, not yet sampled')
    expect(communityWords(rows.find((r) => r.key === 'sekiro')!)).toBe('ruled out')
  })

  it('leaves the kept-rate null rather than zero when the record is closed', () => {
    const closed = communityRows({ entries: [entry({ name: 'amputee' })], roi: [], gate: [] })
    expect(closed[0].keptPct).toBeNull()
    expect(closed[0].found).toBeNull()
  })

  it('orders watched, then proposed, then ruled out, then the uninvited', () => {
    expect(rows.map((r) => r.key)).toEqual(['prosthetics', 'onebag', 'bionics', 'sekiro', 'amputee'])
  })

  it('draws every configured community and only the biggest of the uninvited', () => {
    // Measured on production the search drags in 103 communities on Össur and
    // 175 on Sealand, almost all one or two posts. A panel that printed them
    // all would bury the three that are configured.
    const noisy = Array.from({ length: UNCONFIGURED_SHOWN + 4 }, (_, i) => ({
      subreddit: `noise${i}`, posts: UNCONFIGURED_SHOWN + 4 - i, eligible: 0, comments: 0, insights: 0, yield: 0,
    }))
    const all = communityRows({ entries: [entry({ name: 'amputee' })], roi: noisy })
    const table = tableRows(all)
    expect(table.shown.filter((r) => !r.unconfigured).map((r) => r.key)).toEqual(['amputee'])
    expect(table.shown.filter((r) => r.unconfigured)).toHaveLength(UNCONFIGURED_SHOWN)
    expect(table.hidden).toBe(4)
    // Nothing is dropped from the arithmetic, only from the table.
    expect(table.hiddenPosts).toBe(4 + 3 + 2 + 1)
    expect(unconfiguredShare(all).fromUnconfigured).toBe(noisy.reduce((n, r) => n + r.posts, 0))
  })
})

// ---- the rivals -------------------------------------------------------------

const competitor = (over: Partial<Competitor> & { name: string; slug: string }): Competitor => ({
  id: over.slug, client_id: 't1', first_seen_at: '2026-06-28', retired_at: null,
  superseded_by: null, created_by: null, created_at: '2026-06-28T00:00:00Z', ...over,
})

describe('rivalRows', () => {
  const rows = rivalRows({
    names: ['Cotopaxi', 'Freitag', 'Ottobock'],
    handles: {
      Cotopaxi: { instagram: 'cotopaxiofficial', tiktok: 'cotopaxi', youtube: 'UCjGWYNy7xrGOJ72AeMBb-hA' },
      Freitag: { instagram: 'freitaglab' },
    },
    identities: [
      competitor({ name: 'Cotopaxi', slug: 'cotopaxi' }),
      competitor({ name: 'Freitag', slug: 'freitag' }),
      competitor({ name: 'Patagonia', slug: 'patagonia', retired_at: '2026-09-09' }),
    ],
    census: [
      { competitorName: 'Cotopaxi', platform: 'instagram', captured: 20, read: 3, publishedThisMonth: 5 },
      { competitorName: 'Cotopaxi', platform: 'tiktok', captured: 11, read: 0, publishedThisMonth: 3 },
      { competitorName: 'Freitag', platform: 'instagram', captured: 28, read: 0, publishedThisMonth: 14 },
    ],
    month: '2026-09-01',
  })

  it('tells named, configured and read apart — three states, not two', () => {
    const ottobock = rows.find((r) => r.name === 'Ottobock')!
    expect(ottobock.noAccounts).toBe(true)
    expect(rivalState(ottobock)).toBe('no accounts configured — nothing they publish is being read')

    const freitag = rows.find((r) => r.name === 'Freitag')!
    expect(rivalState(freitag)).toContain('28 of their posts captured, none read')

    const cotopaxi = rows.find((r) => r.name === 'Cotopaxi')!
    expect(rivalState(cotopaxi)).toBe('31 of their posts captured, 3 read')
  })

  it('reads a handle of nothing but spaces as no account at all', () => {
    // A BEHAVIOUR CHANGE, ON PURPOSE. `noAccounts` used to be `filter(Boolean)`,
    // so a handle saved as "  " counted as a configured account and the panel
    // stayed green about a rival nobody was reading. `ownPostCensus` trims
    // before it decides the same thing, and one product may not answer "is this
    // account configured" two ways.
    const [blank] = rivalRows({
      names: ['Poler'],
      handles: { Poler: { instagram: '   ', tiktok: '' } },
      identities: [],
      census: [],
      month: '2026-09-01',
    })
    expect(blank.noAccounts).toBe(true)
    expect(blank.ownPosts).toBeNull()
    expect(blank.ownPostsWhy).toBe(OWN_POSTS_NO_ACCOUNTS)
  })

  it('carries the capture-versus-read census per platform — the only real handle check', () => {
    const cotopaxi = rows.find((r) => r.name === 'Cotopaxi')!
    expect(cotopaxi.perPlatform).toEqual([
      { platform: 'instagram', handle: 'cotopaxiofficial', captured: 20, read: 3 },
      { platform: 'tiktok', handle: 'cotopaxi', captured: 11, read: 0 },
      { platform: 'youtube', handle: 'UCjGWYNy7xrGOJ72AeMBb-hA', captured: 0, read: 0 },
    ])
  })

  it('keeps a rival nobody tracks any more, because its months are frozen under its name', () => {
    const patagonia = rows.find((r) => r.name === 'Patagonia')!
    expect(patagonia.retiredAt).toBe('2026-09-09')
    expect(rivalState(patagonia)).toContain('the line ends here, on 2026-09-09')
  })

  it('draws a rival with no identity row at all — the table never loses a tracked name', () => {
    const ottobock = rows.find((r) => r.name === 'Ottobock')!
    expect(ottobock.identity).toBeNull()
    expect(ottobock.trackedSince).toBeNull()
  })

  it('counts what each rival PUBLISHED this month, with the post’s own clock beside it', () => {
    const cotopaxi = rows.find((r) => r.name === 'Cotopaxi')!
    // Eight across two platforms, and the basis travels with the figure: the
    // rest of this page is not dated at all, so an undated count would be read
    // as all-time — which is what `captured` (31) is.
    expect(cotopaxi.ownPosts).toEqual({ value: { k: 8, n: 8 }, basis: 'posts published in September', month: '2026-09-01' })
    expect(cotopaxi.ownPostsWhy).toBeNull()
    expect(rows.find((r) => r.name === 'Freitag')!.ownPosts?.value).toEqual({ k: 14, n: 14 })
  })

  it('gives a rival with no account a sentence, never a zero', () => {
    const ottobock = rows.find((r) => r.name === 'Ottobock')!
    expect(ottobock.ownPosts).toBeNull()
    expect(ottobock.ownPostsWhy).toContain('No account is configured')
  })

  it('draws no own-post column at all for a caller that has not named a month', () => {
    const [only] = rivalRows({ names: ['Ottobock'], handles: {}, identities: [], census: [] })
    expect(only.ownPosts).toBeNull()
    expect(only.ownPostsWhy).toBeNull()
  })

  it('never counts a rival nobody tracks any more as having published nothing', () => {
    const patagonia = rows.find((r) => r.name === 'Patagonia')!
    expect(patagonia.ownPosts).toBeNull()
    expect(patagonia.ownPostsWhy).toContain('No longer tracked')
  })

  it('states the precedence rule in one sentence, as the design asks', () => {
    expect(RIVAL_PRECEDENCE).toContain('whatever the words in it say')
    expect(RIVAL_PRECEDENCE.split('.').filter((s) => s.trim()).length).toBeLessThanOrEqual(2)
  })
})
