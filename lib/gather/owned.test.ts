import { describe, expect, it } from 'vitest'
import {
  acceptSnapshot,
  followerFloorPct,
  supportsOwnedProfile,
  emptyProfileIsGlitch,
  stampOwnedSource,
  ownedRawRows,
  igRawsByShortcode,
  ownPostsInWindow,
  stopUploadsWalk,
  buildOwnedCensus,
  ownedCensusTotal,
  ownedCommentRefs,
  OWN_POSTS_CEILING,
} from './owned'
import { shareFootnoteLead } from '../calibration'

describe('supportsOwnedProfile', () => {
  it('covers the three scraped platforms', () => {
    expect(supportsOwnedProfile('instagram')).toBe(true)
    expect(supportsOwnedProfile('tiktok')).toBe(true)
    expect(supportsOwnedProfile('youtube')).toBe(true)
  })

  it('excludes Reddit — a subreddit is not a brand-owned account', () => {
    // Wave 3: own_handles.reddit must be SKIPPED, not thrown. The daily
    // snapshot cron would otherwise fail for that tenant every morning.
    expect(supportsOwnedProfile('reddit')).toBe(false)
  })

  it('excludes unknown platforms', () => {
    expect(supportsOwnedProfile('facebook')).toBe(false)
  })
})

describe('acceptSnapshot', () => {
  it('rejects null/zero glitch reads', () => {
    expect(acceptSnapshot(61000, null).ok).toBe(false)
    expect(acceptSnapshot(61000, undefined).ok).toBe(false)
    expect(acceptSnapshot(61000, 0)).toEqual({ ok: false, reason: 'zero-count' })
  })

  it('rejects >20% single-step jumps, accepts normal movement', () => {
    expect(acceptSnapshot(61000, 40000).ok).toBe(false) // -34% — wrong-account/logged-out read
    expect(acceptSnapshot(61000, 80000).ok).toBe(false)
    expect(acceptSnapshot(61000, 62500)).toEqual({ ok: true }) // +2.5% — real growth
  })

  it('accepts any positive first reading (no prior)', () => {
    expect(acceptSnapshot(null, 12500)).toEqual({ ok: true })
  })
})

describe('followerFloorPct', () => {
  it('keeps the base floor for exact-count platforms', () => {
    expect(followerFloorPct('instagram', 61234, 1.5)).toBe(1.5)
    expect(followerFloorPct('tiktok', 23258, 1.5)).toBe(1.5)
  })

  it('raises the YouTube floor so 2 rounding steps cannot fake an event', () => {
    // 12,500 subs → 3-sig-fig rounding step = 100 → floor = 2*100/12500 = 1.6%
    expect(followerFloorPct('youtube', 12500, 1.5)).toBeCloseTo(1.6, 5)
    // 999 subs → 3 digits shown exactly (step 1) → base floor stands
    expect(followerFloorPct('youtube', 999, 1.5)).toBe(1.5)
    // 1M subs → step 10,000 → 2% — rounding dominates even at scale
    expect(followerFloorPct('youtube', 1_000_000, 1.5)).toBeCloseTo(2, 5)
  })
})

describe('emptyProfileIsGlitch', () => {
  it('flags the 2026-08-16 Instagram case: 1,494 posts reported, none returned', () => {
    expect(emptyProfileIsGlitch(1494, 0)).toBe(true)
  })

  it('accepts a genuinely empty account — an explicit zero is the only real emptiness', () => {
    expect(emptyProfileIsGlitch(0, 0)).toBe(false)
  })

  it('flags a null postsCount with no posts — the same glitch, second presentation', () => {
    // 2026-08-16, one hour after the 1,494-posts case: the same handle came
    // back followers-present, postsCount null, zero posts. Keying the guard on
    // postsCount > 0 would have stayed silent through exactly the failure it
    // exists to catch.
    expect(emptyProfileIsGlitch(null, 0)).toBe(true)
  })

  it('is irrelevant once any post came back', () => {
    expect(emptyProfileIsGlitch(1494, 12)).toBe(false)
    expect(emptyProfileIsGlitch(null, 12)).toBe(false)
    expect(emptyProfileIsGlitch(0, 12)).toBe(false)
  })
})

describe('stampOwnedSource', () => {
  const posts = [{ video_id: 'a' }, { video_id: 'b' }, { video_id: 'c' }]

  it('gives every row an explicit source — PostgREST sends NULL for a missing key', () => {
    // The 2026-08-16 YouTube failure: 2 of 12 posts already known, so those
    // rows carried no `source` key, PostgREST filled NULL, and the NOT NULL
    // constraint rejected the whole upsert (23502).
    const rows = stampOwnedSource(posts, [{ video_id: 'a', source: 'discovered' }])
    expect(rows.every((r) => typeof r.source === 'string' && r.source.length > 0)).toBe(true)
  })

  it('keeps an already-discovered client post on the discovered layer', () => {
    // Flipping it to 'owned' would drop it out of the SoV series and fake a
    // share decline — metric continuity beats layer purity.
    const rows = stampOwnedSource(posts, [{ video_id: 'a', source: 'discovered' }])
    expect(rows.find((r) => r.video_id === 'a')!.source).toBe('discovered')
  })

  it("keeps a post already stored as 'owned' on the owned layer", () => {
    const rows = stampOwnedSource(posts, [{ video_id: 'b', source: 'owned' }])
    expect(rows.find((r) => r.video_id === 'b')!.source).toBe('owned')
  })

  it("stamps posts new to us as 'owned'", () => {
    const rows = stampOwnedSource(posts, [{ video_id: 'a', source: 'discovered' }])
    expect(rows.find((r) => r.video_id === 'c')!.source).toBe('owned')
  })

  it("treats a stored NULL source as new rather than propagating the NULL", () => {
    const rows = stampOwnedSource(posts, [{ video_id: 'a', source: null }])
    expect(rows.find((r) => r.video_id === 'a')!.source).toBe('owned')
  })

  it('preserves every input field', () => {
    const rows = stampOwnedSource([{ video_id: 'a', views: 12 }], [])
    expect(rows[0]).toEqual({ video_id: 'a', views: 12, source: 'owned' })
  })
})

describe('ownedRawRows — own posts into the transcribe pool (Brand Voice)', () => {
  const ctx = { clientId: 'c', runId: 'r' }
  const post = (video_id: string, platform: 'youtube' | 'tiktok' | 'instagram' = 'youtube') =>
    ({ video_id, platform, video_url: `u/${video_id}` }) as unknown as Parameters<typeof ownedRawRows>[0][number]

  it('files one video_raw row per post that has a raw item, keyed by this run', () => {
    const rows = ownedRawRows([post('a'), post('b')], { a: { id: 'a' } }, ctx)
    expect(rows).toEqual([{ client_id: 'c', run_id: 'r', platform: 'youtube', video_id: 'a', raw: { id: 'a' } }])
  })
  it('returns nothing when the profile carried no raws (IG refetch failed)', () => {
    expect(ownedRawRows([post('a')], undefined, ctx)).toEqual([])
  })
})

describe('igRawsByShortcode', () => {
  it('keys posts-mode items by shortCode with a url fallback; first wins; skips junk', () => {
    const out = igRawsByShortcode([
      { shortCode: 'Db6AVCIiJPK', audioUrl: 'x' },
      { url: 'https://www.instagram.com/reel/Dbn476REwYZ/', videoUrl: 'y' },
      { shortCode: 'Db6AVCIiJPK', audioUrl: 'dup' },
      null as unknown as Record<string, unknown>,
      { nothing: true },
    ])
    expect(Object.keys(out)).toEqual(['Db6AVCIiJPK', 'Dbn476REwYZ'])
    expect(out.Db6AVCIiJPK.audioUrl).toBe('x')
  })
})


// ---- The census (2026-09-09) -------------------------------------------------
// The client's own post count for the window must be EXACT. The old read took
// the 12 most recent posts per platform and called it a week; Sealand published
// 28 on Instagram in 30 days.

const post = (upload_date: string | null) => ({ upload_date })

describe('ownPostsInWindow — the census cut', () => {
  it('keeps posts on or after the window start', () => {
    const kept = ownPostsInWindow([post('2026-08-09'), post('2026-08-10'), post('2026-09-01')], '2026-08-10')
    expect(kept.map((p) => p.upload_date)).toEqual(['2026-08-10', '2026-09-01'])
  })

  it('drops undated posts — a count cannot include a post it cannot date', () => {
    expect(ownPostsInWindow([post(null), post('2026-09-01')], '2026-08-10')).toHaveLength(1)
  })

  it('keeps everything when there is no window (a baseline read)', () => {
    expect(ownPostsInWindow([post(null), post('2019-01-01')], null)).toHaveLength(2)
  })

  it('filters rather than stopping at the first old post — brands pin posts to the top', () => {
    // A pinned 2024 post sits above this month's; a walk would stop on it and
    // report zero for an account that posted all week.
    const feed = [post('2024-01-01'), post('2026-09-08'), post('2026-09-07')]
    expect(ownPostsInWindow(feed, '2026-08-10')).toHaveLength(2)
  })
})

describe('stopUploadsWalk — how far the YouTube uploads walk goes', () => {
  it('stops when a whole page falls before the window', () => {
    expect(stopUploadsWalk(['2026-07-01', '2026-06-30'], '2026-08-10', 2)).toBe(true)
  })

  it('keeps going while any item on the page is in the window', () => {
    expect(stopUploadsWalk(['2026-09-01', '2026-07-01'], '2026-08-10', 2)).toBe(false)
  })

  it('keeps going past an undated item rather than ending on it', () => {
    expect(stopUploadsWalk([null, '2026-07-01'], '2026-08-10', 2)).toBe(false)
  })

  it('stops at the ceiling, whatever the dates say', () => {
    expect(stopUploadsWalk(['2026-09-01'], '2026-08-10', OWN_POSTS_CEILING)).toBe(true)
  })

  it('takes one page when there is no window (the daily snapshot)', () => {
    expect(stopUploadsWalk(['2026-09-01'], null, 1)).toBe(true)
  })
})

describe('buildOwnedCensus', () => {
  const opts = {
    handles: { instagram: 'sealandgear', youtube: 'UCCthtmYgmon7h0meZaC1FEQ' },
    since: '2026-08-10',
    until: '2026-09-09',
  }
  const row = (over: Partial<{ platform: string; source: string | null; is_client: boolean; account_name: string; upload_date: string }>) => ({
    platform: 'instagram', source: 'owned', is_client: true, account_name: 'sealandgear', upload_date: '2026-09-01', ...over,
  })

  it("counts the client's own in-window posts per platform", () => {
    const census = buildOwnedCensus([row({}), row({ upload_date: '2026-08-20' })], opts)
    expect(census.instagram).toEqual({ posts: 2, since: '2026-08-10', until: '2026-09-09', handle: 'sealandgear' })
  })

  it('reports zero for a configured platform that published nothing', () => {
    expect(buildOwnedCensus([row({})], opts).youtube.posts).toBe(0)
  })

  it('counts an own post the keyword gather discovered first', () => {
    // stampOwnedSource keeps such a row on 'discovered' forever (metric
    // continuity) — but the client still published it.
    expect(buildOwnedCensus([row({ source: 'discovered' })], opts).instagram.posts).toBe(1)
  })

  it('matches YouTube rows by the channel title the owned read stored, not the channel id', () => {
    const rows = [
      row({ platform: 'youtube', account_name: 'Sealand Gear', source: 'owned' }),
      row({ platform: 'youtube', account_name: 'Sealand Gear', source: 'discovered' }),
    ]
    expect(buildOwnedCensus(rows, opts).youtube.posts).toBe(2)
  })

  it("never counts someone else's video about the brand", () => {
    expect(buildOwnedCensus([row({ source: 'discovered', account_name: 'some.reviewer' })], opts).instagram.posts).toBe(0)
  })

  it('excludes posts outside the window and posts with no date', () => {
    const rows = [row({ upload_date: '2026-08-09' }), row({ upload_date: '2026-09-10' }), { platform: 'instagram', source: 'owned', is_client: true, account_name: 'sealandgear', upload_date: null }]
    expect(buildOwnedCensus(rows, opts).instagram.posts).toBe(0)
  })

  it('ignores platforms with no configured handle', () => {
    expect(buildOwnedCensus([row({ platform: 'tiktok' })], opts).tiktok).toBeUndefined()
  })
})

describe('ownedCensusTotal', () => {
  it('sums the platforms', () => {
    expect(ownedCensusTotal({ instagram: { posts: 28, since: 'a', until: 'b', handle: 'x' }, youtube: { posts: 0, since: 'a', until: 'b', handle: 'y' } })).toBe(28)
  })

  it('is null when no census was written (updates before 2026-09-09)', () => {
    expect(ownedCensusTotal(null)).toBeNull()
    expect(ownedCensusTotal({})).toBeNull()
  })
})

describe('shareFootnoteLead — what you published vs what the market said', () => {
  it('separates the two facts once the census exists', () => {
    expect(shareFootnoteLead(28, 12)).toBe('You published 28 posts this update · the market posted about you 12 times')
  })

  it('says one post and one time in the singular', () => {
    expect(shareFootnoteLead(1, 1)).toBe('You published 1 post this update · the market posted about you 1 time')
  })

  it('keeps the old wording for an update written before the census', () => {
    expect(shareFootnoteLead(null, 56)).toBe('56 of your videos')
    expect(shareFootnoteLead(null, 0)).toBe('none of your videos')
  })
})

describe('ownedCommentRefs shares the gather window rule', () => {
  const p = (upload_date: string | null, comments_count: number) => ({ upload_date, comments_count, video_id: 'v', video_url: 'u' }) as never
  it("keeps undated posts (inWindow's rule — a patchy platform is never blanked)", () => {
    expect(ownedCommentRefs([p(null, 9)], { windowStart: '2026-08-10', threshold: 5 })).toHaveLength(1)
  })
  it('drops posts below the comment threshold and outside the window', () => {
    expect(ownedCommentRefs([p('2026-09-01', 2)], { windowStart: '2026-08-10', threshold: 5 })).toHaveLength(0)
    expect(ownedCommentRefs([p('2026-07-01', 9)], { windowStart: '2026-08-10', threshold: 5 })).toHaveLength(0)
  })
})
