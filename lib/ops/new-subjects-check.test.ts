import { describe, expect, it } from 'vitest'

import { COVERAGE_TARGET, coverageLine, coveredVideos, monthRowsCheck } from '../../scripts/new-subjects-check'

// scripts/new-subjects-check.ts (plan WP3.1 done-when), the pure parts.

describe('monthRowsCheck', () => {
  it('passes a new subject with September and October rows and no August row', () => {
    const r = monthRowsCheck(['2026-09-01', '2026-10-01'], true)
    expect(r.ok).toBe(true)
    expect(r.words).toBe('rows: Sep · Oct · OK')
  })

  it('fails a new subject with an August row, or missing a month', () => {
    expect(monthRowsCheck(['2026-08-01', '2026-09-01', '2026-10-01'], true).words).toContain('an August row (must have none)')
    const none = monthRowsCheck([], true)
    expect(none.ok).toBe(false)
    expect(none.words).toBe('rows: none of Aug, Sep, Oct · no September row, no October row')
  })

  it('lists, and does not judge, a subject the file does not name', () => {
    // Staging, 27 Sep: today's subjects hold August and September rows.
    expect(monthRowsCheck(['2026-08-01', '2026-09-01'], false)).toEqual({ aug: true, sep: true, oct: false, ok: true, words: 'rows: Aug · Sep' })
  })
})

describe('coveredVideos', () => {
  const market = [
    { id: 'v1', platform: 'youtube', videoId: 'yt1' },
    { id: 'v2', platform: 'tiktok', videoId: 'tt2' },
    { id: 'v3', platform: 'reddit', videoId: 'rd3' },
  ]
  it('counts a video once through a cited comment in the month, or as the source of an on-camera-only member', () => {
    const covered = coveredVideos({
      market,
      insights: [
        { id: 'i1', sourceVideoId: 'v1' },
        { id: 'i2', sourceVideoId: 'v2' },    // on camera only: counts
        { id: 'i3', sourceVideoId: 'v3' },    // on camera AND a comment: the comment arm decides
        { id: 'i4', sourceVideoId: 'v9' },    // on camera, not a market video this month
      ],
      evidence: [
        { insightId: 'i1', source: 'comment', commentId: 'c1' },
        { insightId: 'i1', source: 'comment', commentId: 'c2' },
        { insightId: 'i2', source: 'video', commentId: null },
        { insightId: 'i3', source: 'video_text', commentId: null },
        { insightId: 'i3', source: 'comment', commentId: 'c-old' },
        { insightId: 'i4', source: 'video', commentId: null },
      ],
      // c-old is dated outside the month, so it is not passed in.
      comments: [{ id: 'c1', platform: 'youtube', videoId: 'yt1' }, { id: 'c2', platform: 'youtube', videoId: 'yt1' }],
    })
    expect([...covered].sort()).toEqual(['v1', 'v2'])
  })
})

describe('coverageLine', () => {
  it('prints the count, the share and the target (staging, September, today\'s seven subjects)', () => {
    // Read on staging 27 Sep 2026: 219 of the 654 September market videos.
    expect(coverageLine(219, 654, 'September')).toBe('219 of 654 September market videos (33.5%) · NOT over the 40% target')
    expect(COVERAGE_TARGET).toBe(0.4)
  })

  it('says over only past the target', () => {
    expect(coverageLine(262, 654, 'October')).toContain(' · over the 40% target')
    expect(coverageLine(0, 0, 'October')).toBe('no October market videos read yet: the coverage line cannot be drawn')
  })
})
