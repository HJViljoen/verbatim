import { describe, expect, it } from 'vitest'

import { INSIGHT_CATEGORIES } from '../pipeline/schemas'
import {
  FLAGGED_KIND,
  KINDS,
  KIND_LABELS,
  KIND_ORDER,
  REDDIT_READ_KINDS,
  kindChange,
  kindLabel,
  kindMixTotalPct,
  kindShares,
  preRegisteredKind,
  redditRead,
  redditShare,
} from './kinds'
import type { PreRegisteredObject } from './anomaly'

// The numbers in these tests are production's, measured read-only on
// 2026-09-15 (research/kind-mix-attention-standings.md §1.3, re-verified
// against the database by WP5): Össur's category audience in September 2026 is
// 388 videos, and its kinds over that denominator are praise 182, question 138,
// pain_point 133, demographic_signal 72, purchase_intent 49, feature_request
// 40, objection 42, switching_signal 12, buying_trigger 12, misinformation 0.

const SEP_DENOM = 388
const SEP_KINDS = [
  { kind: 'praise', videos: 182 },
  { kind: 'question', videos: 138 },
  { kind: 'pain_point', videos: 133 },
  { kind: 'demographic_signal', videos: 72 },
  { kind: 'purchase_intent', videos: 49 },
  { kind: 'objection', videos: 42 },
  { kind: 'feature_request', videos: 40 },
  { kind: 'switching_signal', videos: 12 },
  { kind: 'buying_trigger', videos: 12 },
]

describe('the vocabulary', () => {
  it('is the pipeline enum, not a copy of it', () => {
    expect(KINDS).toBe(INSIGHT_CATEGORIES)
    expect(KINDS).toHaveLength(10)
  })

  it('has a client label for every kind the pipeline can write', () => {
    for (const kind of KINDS) {
      expect(KIND_LABELS[kind], kind).toBeTruthy()
      // Calibrated: a reader never sees the enum value.
      expect(KIND_LABELS[kind]).not.toContain('_')
    }
  })

  it('orders all ten and no more', () => {
    expect([...KIND_ORDER].sort()).toEqual([...KINDS].sort())
  })

  it('folds misinformation under flagged rather than ranking it', () => {
    expect(FLAGGED_KIND).toBe('misinformation')
    expect(KIND_ORDER[KIND_ORDER.length - 1]).toBe('misinformation')
  })

  it('degrades an unknown kind to itself rather than dropping it', () => {
    expect(kindLabel('brand_new_kind')).toBe('Brand new kind')
  })
})

describe('kindShares', () => {
  it('reads each kind against the one denominator', () => {
    const shares = kindShares(SEP_KINDS, SEP_DENOM)
    const question = shares.find((s) => s.kind === 'question')!
    expect(question.videos).toBe(138)
    expect(question.denominator).toBe(388)
    expect(question.pct).toBe(35.6)
    expect(question.label).toBe('Asking how it works')
    expect(shares.every((s) => s.denominator === SEP_DENOM)).toBe(true)
  })

  it('is not a composition — the real month sums to 175%', () => {
    const shares = kindShares(SEP_KINDS, SEP_DENOM)
    const kindVideos = SEP_KINDS.reduce((s, k) => s + k.videos, 0)
    expect(kindVideos).toBe(680)
    expect(kindMixTotalPct(shares)).toBeGreaterThan(100)
    expect(Math.round(kindMixTotalPct(shares))).toBe(175)
  })

  it('refuses a share with no denominator rather than calling it 0%', () => {
    const shares = kindShares([{ kind: 'question', videos: 3 }], 0)
    expect(shares[0].pct).toBeNull()
    expect(shares[0].videos).toBe(3)
  })

  it('shows only the kinds that were read, unless asked for the whole set', () => {
    const read = kindShares([{ kind: 'question', videos: 5 }], 100)
    expect(read).toHaveLength(1)
    const all = kindShares([{ kind: 'question', videos: 5 }], 100, { includeZero: KINDS })
    expect(all).toHaveLength(10)
    expect(all.find((s) => s.kind === 'misinformation')!.videos).toBe(0)
    expect(all.find((s) => s.kind === 'misinformation')!.pct).toBe(0)
  })

  it('reads in the fixed ladder, not by size', () => {
    const shares = kindShares(SEP_KINDS, SEP_DENOM)
    expect(shares.map((s) => s.kind).slice(0, 3)).toEqual(['question', 'pain_point', 'praise'])
  })

  it('carries the Reddit count off the platform mix, and null without one', () => {
    const shares = kindShares(
      [{ kind: 'question', videos: 138, platform_mix: { reddit: 66, tiktok: 40, youtube: 32 } }, { kind: 'praise', videos: 182 }],
      SEP_DENOM,
    )
    expect(shares.find((s) => s.kind === 'question')!.reddit).toBe(66)
    expect(shares.find((s) => s.kind === 'praise')!.reddit).toBeNull()
  })
})

describe('kindChange', () => {
  const augSep = {
    kind: 'objection',
    audience: 'industry-other',
    curr: { month: '2026-09-01', videos: 388, k: 42 },
    prev: { month: '2026-08-01', videos: 628, k: 33 },
  }

  it('answers in the shared verdict shape, with the month video count as n', () => {
    const v = kindChange(augSep)
    expect(v.objectKind).toBe('kind')
    expect(v.objectId).toBe('objection')
    expect(v.objectLabel).toBe('Pushing back')
    expect(v.value).toEqual({ k: 42, n: 388 })
    expect(v.baseline).toEqual({ k: 33, n: 628 })
    expect(v.changePts).toBe(5.6)
    expect(v.state).toBe('moved')
  })

  it('earns NO clustering caveat — a kind is an enum, not a grouping', () => {
    const v = kindChange(augSep)
    expect(v.flags).not.toContain('clustering_unknown')
    expect(v.flags).not.toContain('clustering_changed')
  })

  it('refuses a comparison the floors do not carry', () => {
    const v = kindChange({
      kind: 'praise',
      audience: 'client',
      curr: { month: '2026-09-01', videos: 19, k: 2 },
      prev: { month: '2026-08-01', videos: 20, k: 9 },
    })
    expect(v.state).toBe('too_little_data')
  })

  it('refuses a rename, through the shared rule, from the two keys alone', () => {
    // Sealand's rival set was rewritten on 2026-09-09 and the re-tag moved 253
    // videos between buckets. A kind comparison across that break cannot say
    // whether the share moved or the string did, and neither can the theme
    // series — so it answers the same way.
    const v = kindChange({
      kind: 'question',
      audience: 'competitor:Rareform Bags',
      prevAudience: 'competitor:Rareform',
      curr: { month: '2026-09-01', videos: 400, k: 40 },
      prev: { month: '2026-08-01', videos: 400, k: 20 },
    })
    expect(v.state).toBe('refused')
    expect(v.refusedReason).toBe('rename')
    expect(v.flags).toContain('renamed')
    // The counts still print: a refusal is not a hidden row.
    expect(v.value).toEqual({ k: 40, n: 400 })
    expect(v.changePts).toBeNull()
  })

  it('is one name, and one comparison, when nothing was renamed', () => {
    const v = kindChange({
      kind: 'question',
      audience: 'competitor:Rareform',
      curr: { month: '2026-09-01', videos: 400, k: 40 },
      prev: { month: '2026-08-01', videos: 400, k: 20 },
    })
    expect(v.state).not.toBe('refused')
    expect(v.flags).not.toContain('renamed')
  })
})

describe('the Reddit clause', () => {
  it('is exact for one kind', () => {
    const row = { kind: 'question', videos: 138, platform_mix: { reddit: 66, tiktok: 40, youtube: 32 } }
    expect(redditShare(row)).toBe(47.8)
    const read = redditRead([row], ['question'])
    expect(read.exact).toBe(true)
    expect(read.pct).toBe(47.8)
  })

  it('says so when two kinds are pooled — a video can carry both', () => {
    const read = redditRead([
      { kind: 'question', videos: 138, platform_mix: { reddit: 66 } },
      { kind: 'objection', videos: 42, platform_mix: { reddit: 10 } },
    ])
    expect(read.exact).toBe(false)
    expect(read.videos).toBe(180)
    expect(read.reddit).toBe(76)
    expect(read.pct).toBe(42.2)
    expect(read.kinds).toEqual(REDDIT_READ_KINDS)
  })

  it('has no answer without a platform mix, rather than answering zero', () => {
    expect(redditShare({ kind: 'question', videos: 138 })).toBeNull()
    expect(redditRead([{ kind: 'question', videos: 138 }]).pct).toBeNull()
  })

  it('has no answer for a kind with no videos', () => {
    expect(redditShare({ kind: 'misinformation', videos: 0, platform_mix: {} })).toBeNull()
  })
})

describe('preRegisteredKind', () => {
  it('produces the anomaly check shape off the same rows the chart draws', () => {
    const o = preRegisteredKind({
      kind: 'objection',
      audience: 'industry-other',
      weekVideos: 11,
      months: [{ month: '2026-06-01', videos: 40 }, { month: '2026-07-01', videos: 22 }],
    })
    expect(o.kind).toBe('kind')
    expect(o.id).toBe('objection')
    expect(o.label).toBe('Pushing back')
    expect(o.denominator).toBe('industry-other')
    expect(o.weekVideos).toBe(11)
    expect(o.months).toHaveLength(2)
  })

  // The seam WP8 meets: the value goes straight into the pre-registered set the
  // weekly check runs, so it has to BE that type, not resemble it.
  it('is the pinned PreRegisteredObject, not a structural twin of it', () => {
    const o: PreRegisteredObject = preRegisteredKind({
      kind: 'question',
      audience: 'industry-other',
      weekVideos: 9,
      months: [{ month: '2026-08-01', videos: 138 }],
    })
    const set: readonly PreRegisteredObject[] = [o]
    expect(set[0].id).toBe('question')
  })
})
