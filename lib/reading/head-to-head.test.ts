import { describe, it, expect } from 'vitest'

import { directionRe } from '../test/copy-contract'
import { FACE_OFF_FLOOR, headToHead, recurrenceOf, type HeadToHeadSide } from './head-to-head'

// CO3 · the head-to-head, re-based on the months.
//
// The numbers are the artboard's (mock-sealand, Competitive §3): Sealand 84
// videos against Freitag's 142, 21 and 34 comments a video, 3.1% and 4.4%
// median engagement on 58 and 101 rated, 64% of 71 judged against 57% of 126,
// 9 own posts against 14. What the artboard prints as "+2", "+0.2 pt" and
// "▲ 2 pts" is asserted here as a refusal with a reason, which is what
// deviations D2 and D3 rule.

const side = (over: Partial<HeadToHeadSide> & { audience: string; label: string }): HeadToHeadSide => ({
  month: null,
  previous: null,
  engagement: { median: null, n: 0 },
  published: 0,
  sentiment: { positive: 0, judged: 0 },
  ownPosts: null,
  ...over,
})

const SEALAND = side({
  audience: 'client',
  label: 'Sealand',
  month: { videos: 84, comments: 1764 },
  previous: { videos: 91, comments: 1729 },
  engagement: { median: 3.1, n: 58 },
  engagementPrev: { median: 2.9, n: 54 },
  published: 84,
  publishedPrev: 91,
  sentiment: { positive: 45, judged: 71 },
  sentimentPrev: { positive: 43, judged: 69 },
  ownPosts: 9,
  ownPostsPrev: 11,
})

const FREITAG = side({
  audience: 'competitor:Freitag',
  label: 'Freitag',
  month: { videos: 142, comments: 4828 },
  previous: { videos: 138, comments: 4554 },
  engagement: { median: 4.4, n: 101 },
  engagementPrev: { median: 4.2, n: 96 },
  published: 142,
  publishedPrev: 138,
  sentiment: { positive: 72, judged: 126 },
  sentimentPrev: { positive: 73, judged: 126 },
  ownPosts: 14,
  ownPostsPrev: 12,
})

const h2h = (over: Partial<Parameters<typeof headToHead>[0]> = {}) =>
  headToHead({
    month: '2026-09-01',
    previousMonth: '2026-08-01',
    you: SEALAND,
    them: FREITAG,
    readThisMonth: 1388,
    readPreviousMonth: 1455,
    ...over,
  })

describe('headToHead · the five measures', () => {
  it('draws one row per measure, each side carrying its own k of n', () => {
    const r = h2h()
    expect(r.measures.map((m) => m.key)).toEqual([
      'videos',
      'comments_per_video',
      'engagement',
      'sentiment',
      'posts',
    ])
    const videos = r.measures[0]
    expect(videos.you!.value).toEqual({ k: 84, n: 1388 })
    expect(videos.them!.value).toEqual({ k: 142, n: 1388 })
    expect(videos.you!.pct).toBe(6.1)
    expect(videos.them!.pct).toBe(10.2)
  })

  it('carries "then" beside "now" on every side that has a month before it', () => {
    const videos = h2h().measures[0]
    expect(videos.you!.prev!.value).toEqual({ k: 91, n: 1455 })
    expect(videos.them!.prev!.value).toEqual({ k: 138, n: 1455 })
  })

  it('bands YOUR side month on month, and the rival’s on the same terms', () => {
    const videos = h2h().measures[0]
    expect(videos.verdict).not.toBeNull()
    expect(videos.verdict!.value).toEqual({ k: 84, n: 1388 })
    expect(videos.verdict!.baseline).toEqual({ k: 91, n: 1455 })
    expect(videos.verdict!.bandPts).not.toBeNull()
    expect(videos.rivalVerdict!.objectLabel).toBe('Freitag')
    // …and never you against them: no verdict anywhere compares the two
    // brands' shares of two different denominators (decision D1).
    for (const m of h2h().measures) {
      for (const v of [m.verdict, m.rivalVerdict]) {
        if (v) expect(v.audience === 'client' || v.audience === 'competitor:Freitag').toBe(true)
      }
    }
  })

  it('refuses a band on the rate, the median and the count, and says why on each', () => {
    const r = h2h()
    const rate = r.measures.find((m) => m.key === 'comments_per_video')!
    const median = r.measures.find((m) => m.key === 'engagement')!
    const posts = r.measures.find((m) => m.key === 'posts')!
    for (const m of [rate, median, posts]) {
      expect(m.verdict).toBeNull()
      expect(m.rivalVerdict).toBeNull()
      expect(m.verdictWhy).toContain('no band is drawn over it')
    }
    expect(rate.verdictWhy).toContain('rate')
    expect(median.verdictWhy).toContain('median')
    expect(posts.verdictWhy).toContain('count')
  })

  it('prints the engagement figure with the videos it was read off, of the videos published', () => {
    const median = h2h().measures.find((m) => m.key === 'engagement')!
    expect(median.you!.text).toBe('3.1% median')
    expect(median.you!.value).toEqual({ k: 58, n: 84 })
    expect(median.them!.value).toEqual({ k: 101, n: 142 })
    expect(median.basisLine).toBe('videos published in September')
  })

  it('dates the share measures by the comment and the engagement by the upload', () => {
    const r = h2h()
    expect(r.measures.find((m) => m.key === 'videos')!.basisLine).toBe('videos and comments dated in September')
    expect(r.measures.find((m) => m.key === 'engagement')!.basisLine).toBe('videos published in September')
  })

  it('gives own posts no denominator rather than inventing one', () => {
    const posts = h2h().measures.find((m) => m.key === 'posts')!
    expect(posts.you!.value).toEqual({ k: 9, n: 0 })
    expect(posts.you!.pct).toBeNull()
    expect(posts.you!.text).toBe('9')
  })

  it('draws no verdict when both sides are under the floor, and names the floor', () => {
    const thin = (s: HeadToHeadSide): HeadToHeadSide => ({
      ...s,
      month: { videos: 4, comments: 20 },
      previous: { videos: 3, comments: 18 },
      sentiment: { positive: 2, judged: 4 },
      sentimentPrev: { positive: 1, judged: 3 },
    })
    const r = h2h({ you: thin(SEALAND), them: thin(FREITAG), readThisMonth: 40, readPreviousMonth: 38 })
    const videos = r.measures.find((m) => m.key === 'videos')!
    expect(videos.verdict).toBeNull()
    expect(videos.rivalVerdict).toBeNull()
    expect(videos.verdictWhy).toContain(String(FACE_OFF_FLOOR))
    const sentiment = r.measures.find((m) => m.key === 'sentiment')!
    expect(sentiment.verdict).toBeNull()
    expect(sentiment.you!.value).toEqual({ k: 2, n: 4 })
  })

  it('says the previous month is missing when it is, instead of blaming the floor', () => {
    // 840 and 1,420 videos a side and no August row: "Under 10 videos on a
    // side" is a false statement about our own bookkeeping, printed beside a
    // figure that is fine.
    const wide = (s: HeadToHeadSide): HeadToHeadSide => ({
      ...s,
      month: s.audience === 'client' ? { videos: 840, comments: 9000 } : { videos: 1420, comments: 14000 },
      previous: null,
      sentiment: { positive: 400, judged: 700 },
      sentimentPrev: undefined,
    })
    const r = h2h({ you: wide(SEALAND), them: wide(FREITAG), readThisMonth: 4000, readPreviousMonth: 0 })
    for (const key of ['videos', 'sentiment'] as const) {
      const m = r.measures.find((x) => x.key === key)!
      expect(m.you!.prev).toBeUndefined()
      expect(m.verdict).toBeNull()
      expect(m.verdictWhy).toBe('Aug 2026 has not been read on this measure, so this month has nothing to be compared with.')
      expect(m.verdictWhy).not.toContain(String(FACE_OFF_FLOOR))
    }
  })

  it('says nothing about a verdict where the side itself is absent — `why` says that', () => {
    const r = h2h({ you: side({ audience: 'client', label: 'Sealand' }) })
    const videos = r.measures.find((m) => m.key === 'videos')!
    expect(videos.you).toBeNull()
    expect(videos.verdictWhy).toBeNull()
    expect(videos.why).toContain('Sealand')
  })

  it('marks a level read off too few videos, so the refusal sits beside the figure', () => {
    // Össur's September positive share is 5 of 5 judged videos. The level reads
    // "100%" and the only refusal was in `verdictWhy`, which is the ROW's — so
    // a tile could print "100%" in full confidence beside a footnote nobody
    // ties to it.
    const thin = (s: HeadToHeadSide): HeadToHeadSide => ({
      ...s,
      month: { videos: 4, comments: 20 },
      previous: { videos: 3, comments: 18 },
      sentiment: { positive: 5, judged: 5 },
      sentimentPrev: { positive: 4, judged: 9 },
    })
    const r = h2h({ you: thin(SEALAND), them: FREITAG, readThisMonth: 200, readPreviousMonth: 190 })
    const sentiment = r.measures.find((m) => m.key === 'sentiment')!
    expect(sentiment.you!.text).toBe('100%')
    expect(sentiment.you!.belowFloor).toBe(true)
    expect(sentiment.you!.prev!.belowFloor).toBe(true)
    expect(sentiment.them!.belowFloor).toBe(false)
    expect(r.measures.find((m) => m.key === 'videos')!.you!.belowFloor).toBe(true)

    // A floor applies to the two BANDED measures and to nothing else: a rate,
    // a median and a count are refused a band for a reason that is not the n.
    for (const key of ['comments_per_video', 'engagement', 'posts'] as const) {
      expect(r.measures.find((m) => m.key === key)!.you!.belowFloor).toBeNull()
    }
  })

  it('leaves an unobserved side null with a sentence, never a zero', () => {
    const r = h2h({ them: side({ audience: 'competitor:Rareform', label: 'Rareform' }) })
    const videos = r.measures.find((m) => m.key === 'videos')!
    expect(videos.them).toBeNull()
    expect(videos.why).toContain('Rareform')
    expect(videos.why).toContain('Sep 2026')
    expect(r.footerLine).toContain('No month has been read for Rareform')
  })

  it('says so when neither side has a month at all', () => {
    const r = h2h({
      you: side({ audience: 'client', label: 'Sealand' }),
      them: side({ audience: 'competitor:Rareform', label: 'Rareform' }),
    })
    expect(r.unread).toContain('nothing to put side by side')
  })

  it('names the rival’s videos and what they are of, in the footer', () => {
    expect(h2h().footerLine).toBe('142 videos of theirs read in Sep 2026, of 1,388 read in all.')
  })

  it('carries the Reddit exclusion note and no direction word', () => {
    const r = h2h()
    expect(r.excludedNote).toContain('capped at 40')
    const words = [
      r.footerLine,
      r.excludedNote,
      ...r.measures.flatMap((m) => [m.label, m.basisLine, m.verdictWhy ?? '', m.why ?? '']),
    ].join(' ')
    expect(directionRe().test(words)).toBe(false)
  })
})

describe('recurrenceOf · identity, never a label', () => {
  it('flags a conclusion with no earlier month as new', () => {
    const r = recurrenceOf('reg-1', ['2026-09-01'], '2026-09-01')
    expect(r.isNew).toBe(true)
    expect(r.seenIn).toEqual(['2026-09-01'])
    expect(r.line).toBe('First heard in Sep 2026.')
  })

  it('counts the months it has been heard in and names the first', () => {
    const r = recurrenceOf('reg-2', ['2026-06-01', '2026-07-01', '2026-09-01'], '2026-09-01')
    expect(r.isNew).toBe(false)
    expect(r.line).toBe('Heard in 3 months, first in Jun 2026.')
  })

  it('names the one month rather than counting it, when it was not heard this month', () => {
    // Heard in August, not in September: `seenIn.length === 1` and not new,
    // which printed "Heard in 1 months, first in Aug 2026."
    const r = recurrenceOf('reg-5', ['2026-08-01'], '2026-09-01')
    expect(r.isNew).toBe(false)
    expect(r.seenIn).toEqual(['2026-08-01'])
    expect(r.line).toBe('Heard in Aug 2026.')
  })

  it('ignores a month after the one being read, and de-duplicates', () => {
    const r = recurrenceOf('reg-3', ['2026-10-01', '2026-08-01', '2026-08-01', '2026-09-01'], '2026-09-01')
    expect(r.seenIn).toEqual(['2026-08-01', '2026-09-01'])
    expect(r.isNew).toBe(false)
  })

  it('normalises a full date to its month start', () => {
    expect(recurrenceOf('reg-4', ['2026-08-14T00:00:00.000Z'], '2026-09-30').seenIn).toEqual(['2026-08-01'])
  })
})
