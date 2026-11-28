import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Instagram's routed search (28 Nov 2026): TikHub's hashtag feed first, the
// Apify actor last, and the search exactly what it was before whenever TikHub
// is not set up, is over budget, fails, or finds nothing. The feed itself is
// stubbed (its paging has its own tests, providers/tikhub-instagram.test.ts);
// the adapter, the router and the Apify input are the real ones.

const h = vi.hoisted(() => ({ feed: vi.fn() }))
vi.mock('./providers/tikhub-instagram', async (orig) => ({ ...(await orig<object>()), fetchHashtagFeed: h.feed }))

import { routedSearch, type RoutedSearchDeps } from './gather'
import { instagram } from './platforms/instagram'
import { ProviderError } from './providers/transport'
import { IG_HASHTAG_DEADLINE_MS, IG_HASHTAG_MAX_PAGES, RUN_SCRAPE_BUDGET_USD, periodSince } from '../config'
import type { GatherConfig, RawItem } from './types'

const END = '2026-11-29T04:00:00.000Z'
const config: GatherConfig = {
  brand_keywords: ['sealand gear'], competitor_keywords: [], competitor_names: [], industry_keywords: ['upcycled bag'],
  exclude_terms: [], platforms: ['instagram'], max_videos: 100, comment_depth: 50, report_period: 'weekly',
  window: { start: '2026-11-22T04:00:00.000Z', end: END, basis: 'anchored' }, own_handles: {}, subreddits: [],
}
const T0 = 1_000_000
const APIFY_ITEMS: RawItem[] = [{ shortCode: 'APIFY1', url: 'https://www.instagram.com/p/APIFY1/' }]
const FEED_ITEMS: RawItem[] = [{ provider: 'tikhub', shortCode: 'TIK1', url: 'https://www.instagram.com/p/TIK1/' }]
const feedResult = (items: RawItem[], partial: string | null = null) => ({ items, seen: items.length, pages: 1, costUsd: 0.002, partial })

function deps(over: Partial<RoutedSearchDeps> & { elapsed?: number } = {}) {
  const runActor = vi.fn(async (..._args: unknown[]) => APIFY_ITEMS)
  const spendSoFar = vi.fn(async (_runId: string) => 0)
  return {
    runActor, spendSoFar,
    deps: { runActor, spendSoFar, now: () => T0 + (over.elapsed ?? 0), ...over } as RoutedSearchDeps,
  }
}
const search = (d: RoutedSearchDeps, variant: 'reels' | 'posts' = 'reels', keyword = 'upcycled bag') =>
  routedSearch({ key: 'instagram.search', adapter: instagram, config, keyword, variant, runId: 'run-1', startedAt: T0 }, d)

const ENV = ['TIKHUB_API_KEY', 'TREG_API_KEY', 'GATHER_INSTAGRAM_SEARCH_PROVIDERS'] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
  for (const k of ENV) delete process.env[k]
  h.feed.mockReset()
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('instagram.fetchVideos — TikHub’s feed for one keyword and variant', () => {
  beforeEach(() => { h.feed.mockResolvedValue(feedResult(FEED_ITEMS)) })

  it('asks for the reels feed on reels and the recent feed on posts, bounded like the actor', async () => {
    await instagram.fetchVideos!(config, ['upcycled bag'], 40, { variant: 'reels' })
    await instagram.fetchVideos!(config, ['upcycled bag'], 40, { variant: 'posts' })
    const asked = h.feed.mock.calls.map(([a]) => a)
    expect(asked[0]).toEqual({ tag: 'upcycledbag', feed: 'reels', since: '2026-11-22', limit: 40, maxPages: IG_HASHTAG_MAX_PAGES, deadlineMs: IG_HASHTAG_DEADLINE_MS })
    expect(asked[1].feed).toBe('recent')
    // The same lower bound the Apify actor gets: the two cannot drift.
    expect(asked[0].since).toBe(instagram.videoSearch!(config, ['upcycled bag'], 40, { variant: 'reels' }).input.onlyPostsNewerThan)
  })

  it('keeps the period-derived bound on a baseline run, as the actor does', async () => {
    const baseline = { ...config, window: { start: null, end: END, basis: 'baseline' as const } }
    await instagram.fetchVideos!(baseline, ['bag'], 40, { variant: 'reels' })
    expect(h.feed.mock.calls[0][0].since).toBe(periodSince('weekly'))
  })

  it('folds the keyword into a tag, and calls nothing when nothing is left of it', async () => {
    await instagram.fetchVideos!(config, ['Össur'], 40, { variant: 'reels' })
    expect(h.feed.mock.calls[0][0].tag).toBe('ossur')
    h.feed.mockClear()
    expect(await instagram.fetchVideos!(config, ['#!?'], 40, { variant: 'reels' })).toEqual([])
    expect(h.feed).not.toHaveBeenCalled()
  })

  it('passes a feed cut short on as a note', async () => {
    h.feed.mockResolvedValue(feedResult(FEED_ITEMS, 'TikHub ran out of time partway through a hashtag feed, and the search kept the posts it had found'))
    const note = vi.fn()
    expect(await instagram.fetchVideos!(config, ['bag'], 40, { variant: 'reels', note })).toEqual(FEED_ITEMS)
    expect(note).toHaveBeenCalledWith('TikHub ran out of time partway through a hashtag feed, and the search kept the posts it had found')
  })
})

describe('routedSearch — Instagram, TikHub first and Apify last', () => {
  it('with TikHub not set up, makes exactly the Apify call it always made, and says so', async () => {
    const d = deps()
    const r = await search(d.deps, 'posts')
    expect(h.feed).not.toHaveBeenCalled()
    expect(d.spendSoFar).not.toHaveBeenCalled()
    const { actor, input } = instagram.videoSearch!(config, ['upcycled bag'], config.max_videos, { variant: 'posts' })
    expect(d.runActor.mock.calls).toEqual([[actor, input]])
    expect(r).toEqual({ raw: APIFY_ITEMS, provider: 'apify', notes: ['TikHub was skipped (TikHub is not set up), so the search used Apify'] })
  })

  it('takes TikHub’s answer when it has one, and never starts Apify', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    h.feed.mockResolvedValue(feedResult(FEED_ITEMS))
    const d = deps()
    const r = await search(d.deps)
    expect(r).toEqual({ raw: FEED_ITEMS, provider: 'tikhub', notes: [] })
    expect(d.runActor).not.toHaveBeenCalled()
    expect(d.spendSoFar).toHaveBeenCalledWith('run-1')
  })

  it('falls back to Apify when TikHub fails, with the reason', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    h.feed.mockRejectedValue(new ProviderError('http', 'TikHub answered HTTP 402: insufficient balance', { status: 402 }))
    const d = deps()
    const r = await search(d.deps)
    expect(r.provider).toBe('apify')
    expect(r.raw).toBe(APIFY_ITEMS)
    expect(r.notes).toEqual(['TikHub did not work (TikHub answered HTTP 402: insufficient balance), so the search used Apify'])
    expect(d.runActor.mock.calls[0]).toHaveLength(2) // no time was spent: the old call, default timeout
  })

  it('falls back to Apify when TikHub finds nothing in the window', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    h.feed.mockResolvedValue(feedResult([]))
    const r = await search(deps().deps)
    expect(r.provider).toBe('apify')
    expect(r.notes).toEqual(['TikHub found nothing, so the search also tried Apify'])
  })

  it('skips TikHub once the run’s direct spend reaches the budget', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    const d = deps()
    d.spendSoFar.mockResolvedValue(RUN_SCRAPE_BUDGET_USD)
    const r = await search(d.deps)
    expect(h.feed).not.toHaveBeenCalled()
    expect(r.provider).toBe('apify')
    expect(r.notes).toEqual([`TikHub was skipped (this update’s direct scraping spend reached its limit of $${RUN_SCRAPE_BUDGET_USD}), so the search used Apify`])
  })

  it('gives a late Apify fallback only what is left of the step', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    h.feed.mockRejectedValue(new ProviderError('timeout', 'TikHub did not answer within 30 s'))
    const d = deps({ elapsed: 120_000 })
    await search(d.deps)
    // 280 s budget, 120 s gone, 20 s for runActor's grace and the dataset read.
    expect(d.runActor.mock.calls[0][2]).toEqual({ timeoutSecs: 140 })
  })

  it('does not start Apify with under 30 s left: TikHub’s empty answer stands', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    h.feed.mockResolvedValue(feedResult([]))
    const d = deps({ elapsed: 235_000 })
    const r = await search(d.deps)
    expect(d.runActor).not.toHaveBeenCalled()
    expect(r).toEqual({
      raw: [], provider: 'tikhub',
      notes: ['TikHub found nothing, so the search also tried Apify', 'Apify did not work either (there was not enough time left in the step to start it)'],
    })
  })

  it('throws Apify’s error when both sources fail, as a lone Apify failure always did', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    h.feed.mockRejectedValue(new ProviderError('schema', 'TikHub’s answer was not in the shape Verbatim reads (no item list)'))
    const d = deps()
    const down = new Error('Apify 500: down')
    d.runActor.mockRejectedValue(down)
    await expect(search(d.deps)).rejects.toBe(down)
  })

  it('carries the feed’s own note ahead of the router’s', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    const cut = 'TikHub failed partway through a hashtag feed (TikHub answered HTTP 502), and the search kept the posts it had found'
    h.feed.mockResolvedValue(feedResult(FEED_ITEMS, cut))
    const r = await search(deps().deps)
    expect(r).toEqual({ raw: FEED_ITEMS, provider: 'tikhub', notes: [cut] })
  })

  it('rolls back to Apify alone with one env line, saying nothing', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    process.env.GATHER_INSTAGRAM_SEARCH_PROVIDERS = 'apify'
    const d = deps()
    const r = await search(d.deps)
    expect(h.feed).not.toHaveBeenCalled()
    expect(r).toEqual({ raw: APIFY_ITEMS, provider: 'apify', notes: [] })
    expect(d.runActor.mock.calls[0]).toHaveLength(2)
  })
})
