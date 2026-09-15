import { describe, expect, it } from 'vitest'

import {
  MOODS,
  MOOD_LABELS,
  SENTIMENT_SOURCE_BREAK,
  crossesSentimentBreak,
  framingShare,
  isAudienceSentiment,
  moodChange,
  moodCountsBalance,
  moodShares,
} from './mood'

// Production, measured read-only 2026-09-15 and re-verified by WP5
// (research/kind-mix-attention-standings.md §2.2). Össur's category audience:
//   Aug 2026  judged 537  positive 440  negative 10  neutral 31  mixed 56  framing 67
//   Sep 2026  judged 338  positive 245  negative 19  neutral 29  mixed 45  framing 39
// Sealand's category: Aug 351/241/11/28/71 (framing 16), Sep 407/318/11/20/58 (27).

const OSSUR_AUG = { month: '2026-08-01', judged: 537, positive: 440, negative: 10, neutral: 31, mixed: 56, judged_framing: 67 }
const OSSUR_SEP = { month: '2026-09-01', judged: 338, positive: 245, negative: 19, neutral: 29, mixed: 45, judged_framing: 39 }
const SEALAND_AUG = { month: '2026-08-01', judged: 351, positive: 241, negative: 11, neutral: 28, mixed: 71, judged_framing: 16 }
const SEALAND_SEP = { month: '2026-09-01', judged: 407, positive: 318, negative: 11, neutral: 20, mixed: 58, judged_framing: 27 }

describe('the family rule', () => {
  it('takes stamped provenance first', () => {
    expect(isAudienceSentiment({ sentiment_source: 'audience', analyzed_lane: 'claims_only' })).toBe(true)
    expect(isAudienceSentiment({ sentiment_source: 'framing', analyzed_lane: 'full' })).toBe(false)
  })

  it('falls back to the lane, because only the full lane read the comments', () => {
    expect(isAudienceSentiment({ analyzed_lane: 'full' })).toBe(true)
    expect(isAudienceSentiment({ analyzed_lane: 'claims_only' })).toBe(false)
    expect(isAudienceSentiment({})).toBe(false)
  })

  // Every column the rule reads is nullable, and this is the arm the SQL in
  // monthly_audience_stats had wrong: an `or` over two comparisons against NULL
  // is NULL, not false, so `filter (where is_audience)` and
  // `filter (where not is_audience)` both dropped such a video and it landed in
  // neither count. Here it is framing, and the migration's CASE now agrees.
  it('counts an unstamped, unlaned video as framing rather than as nothing', () => {
    expect(isAudienceSentiment({ sentiment_source: null, analyzed_lane: null })).toBe(false)
    expect(isAudienceSentiment({ sentiment_source: null, analyzed_lane: 'claims_only' })).toBe(false)
    expect(isAudienceSentiment({ sentiment_source: null, analyzed_lane: 'full' })).toBe(true)
  })
})

describe('the four-way distribution', () => {
  it('reads all four, best news first', () => {
    expect(MOODS).toEqual(['positive', 'mixed', 'neutral', 'negative'])
    const shares = moodShares(OSSUR_SEP)
    expect(shares.map((s) => s.mood)).toEqual(['positive', 'mixed', 'neutral', 'negative'])
    expect(shares.map((s) => s.label)).toEqual([MOOD_LABELS.positive, MOOD_LABELS.mixed, MOOD_LABELS.neutral, MOOD_LABELS.negative])
  })

  it('shows why the negative share alone would look broken', () => {
    const aug = moodShares(OSSUR_AUG)
    const sep = moodShares(OSSUR_SEP)
    expect(aug.find((s) => s.mood === 'negative')!.pct).toBe(1.9)
    expect(sep.find((s) => s.mood === 'negative')!.pct).toBe(5.6)
    // mixed has room where negative does not — decision T's whole argument.
    expect(sep.find((s) => s.mood === 'mixed')!.pct).toBe(13.3)
  })

  it('has no share at all when nothing was judged', () => {
    const none = moodShares({ judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0 })
    expect(none.every((s) => s.pct === null)).toBe(true)
  })

  it('balances: the four counts are every judged video', () => {
    for (const m of [OSSUR_AUG, OSSUR_SEP, SEALAND_AUG, SEALAND_SEP]) expect(moodCountsBalance(m)).toBe(true)
    expect(moodCountsBalance({ judged: 10, positive: 1, negative: 1, neutral: 1, mixed: 1 })).toBe(false)
  })

  it('says how much of the month was judged the other way', () => {
    expect(framingShare(OSSUR_AUG)).toBe(11.1)
    expect(framingShare(OSSUR_SEP)).toBe(10.3)
    expect(framingShare({ judged: 0, positive: 0, negative: 0, neutral: 0, mixed: 0 })).toBeNull()
  })
})

describe('moodChange', () => {
  it('fires on the one tenant-month pair in production that has the evidence', () => {
    const v = moodChange({ audience: 'industry-other', curr: OSSUR_SEP, prev: OSSUR_AUG })
    expect(v.objectKind).toBe('mood')
    expect(v.objectId).toBe('negative')
    expect(v.value).toEqual({ k: 19, n: 338 })
    expect(v.baseline).toEqual({ k: 10, n: 537 })
    expect(v.changePts).toBe(3.8)
    expect(v.bandPts).toBe(2.8)
    expect(v.state).toBe('moved')
    // …and it is also the one pair whose span crosses 2026-08-18. The verdict
    // carries the caveat so a caller cannot print "the mood moved" across a
    // change in what the number means without being told.
    expect(v.flags).toContain('measurement_changed')
  })

  it('marks the break on every pair whose span reaches across it, and on no other', () => {
    const counts = (month: string) => ({ month, judged: 200, positive: 150, negative: 20, neutral: 20, mixed: 10 })
    const spans = (prev: string, curr: string) =>
      moodChange({ audience: 'industry-other', curr: counts(curr), prev: counts(prev) })
        .flags.includes('measurement_changed')
    // August straddles the break, so the pair BEFORE it crosses it too.
    expect(spans('2026-07-01', '2026-08-01')).toBe(true)
    expect(spans('2026-08-01', '2026-09-01')).toBe(true)
    expect(spans('2026-06-01', '2026-07-01')).toBe(false)
    expect(spans('2026-09-01', '2026-10-01')).toBe(false)
  })

  it('does not fire on Sealand, where the change is inside the band', () => {
    const v = moodChange({ audience: 'industry-other', curr: SEALAND_SEP, prev: SEALAND_AUG })
    expect(v.state).toBe('no_clear_change')
    expect(Math.abs(v.changePts!)).toBeLessThan(v.bandPts!)
  })

  it('uses the JUDGED count as n, never the month video count', () => {
    const v = moodChange({ audience: 'industry-other', curr: OSSUR_SEP, prev: OSSUR_AUG })
    expect(v.value.n).toBe(338)
    expect(v.value.n).not.toBe(388) // the month's videos
  })

  it('refuses every rival and own-brand audience at today\'s volumes', () => {
    const v = moodChange({
      audience: 'competitor:Ottobock',
      curr: { month: '2026-09-01', judged: 24, positive: 22, negative: 0, neutral: 1, mixed: 1 },
      prev: { month: '2026-08-01', judged: 48, positive: 42, negative: 1, neutral: 4, mixed: 1 },
    })
    expect(v.state).toBe('too_little_data')
  })

  it('can be asked about another share', () => {
    const v = moodChange({ audience: 'industry-other', curr: OSSUR_SEP, prev: OSSUR_AUG, mood: 'positive' })
    expect(v.objectId).toBe('positive')
    expect(v.value).toEqual({ k: 245, n: 338 })
  })

  it('earns no clustering caveat — a re-grouping cannot move how a video was received', () => {
    const v = moodChange({ audience: 'industry-other', curr: OSSUR_SEP, prev: OSSUR_AUG })
    expect(v.flags).not.toContain('clustering_unknown')
    expect(v.flags).not.toContain('clustering_changed')
  })
})

describe('the 2026-08-18 break', () => {
  it('is drawn on a window that spans it', () => {
    expect(SENTIMENT_SOURCE_BREAK).toBe('2026-08-18')
    expect(crossesSentimentBreak('2026-07-01', '2026-09-01')).toBe(true)
    expect(crossesSentimentBreak('2026-08-01', '2026-09-01')).toBe(true)
  })

  it('is not drawn on a window entirely on one side of it', () => {
    expect(crossesSentimentBreak('2026-06-01', '2026-08-01')).toBe(false)
    expect(crossesSentimentBreak('2026-08-18', '2026-09-01')).toBe(false)
    expect(crossesSentimentBreak('2026-09-01', '2026-10-01')).toBe(false)
  })

  it('reads an instant as well as a month start', () => {
    expect(crossesSentimentBreak('2026-08-17T23:00:00.000Z', '2026-08-19T00:00:00.000Z')).toBe(true)
  })
})
