import { describe, it, expect } from 'vitest'
import { splitDelta, pickRechecks, scrapeBaseline, type KnownVideoState, type RecheckCandidate } from './delta'
import type { VideoInsert } from './types'

// Delta-scraping invariants worth locking (2026-07-16):
//  - a resurfaced video without growth never earns a paid re-scrape
//  - growth is measured against the count AT LAST SCRAPE, not last find —
//    otherwise slow drift below the growth bar re-baselines itself each week
//    and the video is never re-scraped
//  - the cap keeps a viral week from blowing up the Apify bill, biggest
//    growth first so the cap spends on the most active videos

const video = (id: string, comments = 0): VideoInsert =>
  ({ video_id: id, video_url: `https://x/${id}`, comments_count: comments }) as unknown as VideoInsert

const state = (id: string, over: Partial<KnownVideoState> = {}): KnownVideoState => ({
  video_id: id,
  video_url: `https://x/${id}`,
  comments_count: 10,
  comments_count_at_scrape: 10,
  upload_date: '2026-07-01',
  is_client: false,
  is_competitor: false,
  competitor_name: null,
  ...over,
})

const cand = (id: string, freshCount: number, baseline: number): RecheckCandidate =>
  ({ video_id: id, video_url: `https://x/${id}`, freshCount, baseline })

describe('splitDelta', () => {
  it('separates never-seen videos from already-stored ones', () => {
    const known = new Map([['b', state('b')]])
    const { fresh, resurfaced } = splitDelta([video('a'), video('b')], known)
    expect(fresh.map((v) => v.video_id)).toEqual(['a'])
    expect(resurfaced.map((r) => r.video.video_id)).toEqual(['b'])
    expect(resurfaced[0].state).toBe(known.get('b'))
  })

  it('treats everything as fresh when nothing is stored (baseline run)', () => {
    const { fresh, resurfaced } = splitDelta([video('a'), video('b')], new Map())
    expect(fresh).toHaveLength(2)
    expect(resurfaced).toHaveLength(0)
  })
})

describe('scrapeBaseline', () => {
  it('prefers the count at last scrape', () => {
    expect(scrapeBaseline({ comments_count: 40, comments_count_at_scrape: 25 })).toBe(25)
  })

  it('falls back to the stored count for never-scraped / pre-feature rows', () => {
    expect(scrapeBaseline({ comments_count: 40, comments_count_at_scrape: null })).toBe(40)
  })
})

describe('pickRechecks', () => {
  const opts = { minGrowth: 3, threshold: 5, cap: 25 }

  it('skips unchanged and shrunk counts (deleted comments, metadata jitter)', () => {
    expect(pickRechecks([cand('a', 10, 10), cand('b', 8, 10)], opts)).toEqual([])
  })

  it('skips growth below the minimum — one straggler does not cover an actor run', () => {
    expect(pickRechecks([cand('a', 12, 10)], opts)).toEqual([])
  })

  it('re-scrapes a video that grew enough', () => {
    const picked = pickRechecks([cand('a', 15, 10)], opts)
    expect(picked).toEqual([{ video_id: 'a', video_url: 'https://x/a', comments_count: 15 }])
  })

  it('applies the platform comment threshold to the fresh count', () => {
    // grew 0 → 4: enough growth, but still below the scrape-worthy bar
    expect(pickRechecks([cand('a', 4, 0)], opts)).toEqual([])
    // null threshold (YouTube): growth alone decides
    expect(pickRechecks([cand('a', 4, 0)], { ...opts, threshold: null })).toHaveLength(1)
  })

  it('caps the list, biggest growth first', () => {
    const picked = pickRechecks(
      [cand('small', 14, 10), cand('big', 60, 10), cand('mid', 30, 10)],
      { ...opts, cap: 2 },
    )
    expect(picked.map((r) => r.video_id)).toEqual(['big', 'mid'])
  })
})
