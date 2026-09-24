import { describe, it, expect } from 'vitest'
import {
  jaccard,
  matchThemes,
  dormantIds,
  matchTally,
  normaliseTitle,
  scorePair,
  sizeWeight,
  themedRunWindow,
  type RegistryEntry,
  type IncomingTheme,
} from './theme-registry'
import { audienceFold } from '../rivals'

// Theme-identity invariants worth locking (shape B-lite, 2026-08-17). Every one
// of these is a case measured on the Sealand X→Y pair, where Pass A output was
// byte-identical and 48 of 58 "new" themes were the same theme relabelled:
//  - a theme whose MEMBERS are unchanged keeps its identity no matter what the
//    labeller called it this week (the 48-false-new case)
//  - matching never crosses entity buckets
//  - one registry entry per run: a split continues the larger half and opens a
//    fresh entry for the smaller, rather than two themes claiming one identity
//  - the weak band needs BOTH signals to agree before continuing a time series
//  - dormancy hides, never deletes; a match revives

const entry = (id: string, ids: string[], over: Partial<RegistryEntry> = {}): RegistryEntry => ({
  id,
  bucket: 'industry-other',
  member_insight_ids: ids,
  embedding: null,
  status: 'active',
  canonical_label: `label-${id}`,
  ...over,
})

const theme = (key: string, ids: string[], over: Partial<IncomingTheme> = {}): IncomingTheme => ({
  key,
  bucket: 'industry-other',
  memberInsightIds: ids,
  label: `theme-${key}`,
  embedding: null,
  ...over,
})

/** Stand-in cosine: 1 when the two vectors are identical, else their first element. */
const cos = (a: number[], b: number[]) => (a[0] === b[0] ? 1 : Math.min(a[0], b[0]))

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint ones', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1)
    expect(jaccard(['a'], ['b'])).toBe(0)
  })
  it('ignores order and duplicates', () => {
    expect(jaccard(['b', 'a', 'a'], ['a', 'b'])).toBe(1)
  })
  it('scores partial overlap', () => {
    expect(jaccard(['a', 'b', 'c'], ['a', 'b'])).toBeCloseTo(2 / 3)
  })
  it('treats two empty sets as no evidence of identity', () => {
    expect(jaccard([], [])).toBe(0)
  })
})

describe('matchThemes', () => {
  it('keeps identity when only the LABEL changed — the 48-false-new case', () => {
    const reg = [entry('r1', ['i1', 'i2', 'i3'], { canonical_label: 'Is the lodge easy to reach' })]
    const [m] = matchThemes([theme('t1', ['i1', 'i2', 'i3'], { label: 'Access road and trail questions' })], reg)
    expect(m).toEqual({ key: 't1', themeId: 'r1', kind: 'exact', score: 1, arm: 'insight' })
  })

  it('opens a new entry when nothing overlaps', () => {
    const [m] = matchThemes([theme('t1', ['x1'])], [entry('r1', ['i1', 'i2'])])
    expect(m.themeId).toBeNull()
    expect(m.kind).toBe('new')
  })

  it('never matches across entity buckets', () => {
    const reg = [entry('r1', ['i1', 'i2'], { bucket: 'competitor:Patagonia' })]
    const [m] = matchThemes([theme('t1', ['i1', 'i2'], { bucket: 'client' })], reg)
    expect(m.themeId).toBeNull()
  })

  it('matches on strong overlap below an exact set', () => {
    const [m] = matchThemes([theme('t1', ['i1', 'i2', 'i3'])], [entry('r1', ['i1', 'i2', 'i3', 'i4'])])
    expect(m.kind).toBe('strong')
    expect(m.themeId).toBe('r1')
    expect(m.score).toBeCloseTo(0.75)
  })

  it('a split continues the larger half and opens a fresh entry for the smaller', () => {
    const reg = [entry('r1', ['i1', 'i2', 'i3', 'i4'])]
    const res = matchThemes([theme('big', ['i1', 'i2', 'i3']), theme('small', ['i4'])], reg)
    const big = res.find((r) => r.key === 'big')!
    const small = res.find((r) => r.key === 'small')!
    expect(big.themeId).toBe('r1')
    expect(small.themeId).toBeNull()
    expect(small.kind).toBe('new')
    expect(small.splitFrom).toBe('r1')
  })

  it('a merge keeps one identity and reports the absorbed entry', () => {
    const reg = [entry('r1', ['i1', 'i2', 'i3']), entry('r2', ['i4'])]
    const [m] = matchThemes([theme('t1', ['i1', 'i2', 'i3', 'i4'])], reg)
    expect(m.themeId).toBe('r1')
    expect(m.mergedFrom).toEqual(['r2'])
  })

  it('one registry entry is claimed at most once per run', () => {
    const reg = [entry('r1', ['i1', 'i2'])]
    const res = matchThemes([theme('a', ['i1', 'i2']), theme('b', ['i1', 'i2'])], reg)
    expect(res.filter((r) => r.themeId === 'r1')).toHaveLength(1)
    expect(res.filter((r) => r.themeId === null)).toHaveLength(1)
  })

  it('the weak band needs BOTH membership and label agreement', () => {
    const reg = [entry('r1', ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'], { embedding: [0.9] })]
    const incoming = [theme('t1', ['i1', 'i2'], { embedding: [0.9] })] // jaccard ≈ 0.29
    expect(matchThemes(incoming, reg, { cosine: cos })[0].kind).toBe('weak')
    // same membership, labels that disagree → no match
    const apart = [theme('t1', ['i1', 'i2'], { embedding: [0.1] })]
    expect(matchThemes(apart, reg, { cosine: cos })[0].themeId).toBeNull()
    // and without a cosine function the weak band is never entered
    expect(matchThemes(incoming, reg)[0].themeId).toBeNull()
  })

  it('matching a dormant entry revives it', () => {
    const reg = [entry('r1', ['i1', 'i2'], { status: 'dormant' })]
    expect(matchThemes([theme('t1', ['i1', 'i2'])], reg)[0].kind).toBe('revived')
  })

  it('is deterministic when two entries tie', () => {
    const reg = [entry('rB', ['i1', 'i2']), entry('rA', ['i1', 'i2'])]
    const once = matchThemes([theme('t1', ['i1', 'i2'])], reg)[0].themeId
    const twice = matchThemes([theme('t1', ['i1', 'i2'])], [...reg].reverse())[0].themeId
    expect(once).toBe(twice)
  })
})

// ---- The re-analysis-stable key (item 3, 2026-09-18) ------------------------
// Every case below is one the production measurement named (re-run it with
// scripts/theme-key-backtest.ts): the corpus-wide re-mint (0 of 334 identities
// carried on insight ids, 36 on video ids — all of them above the evidence
// floor, where the insight key carried none), the near-superset property above
// that floor (Össur re-assigns nothing on any transition; Sealand re-assigns 2
// and 3, each a two-video theme whose videos and whose label point at different
// entries), and the collision the video key brings with it (58.5% of Össur's
// themes stand on one video, 218 of 757 share it with another theme).

const withVideos = (e: RegistryEntry, ids: string[]): RegistryEntry => ({ ...e, member_video_ids: ids })

describe('sizeWeight', () => {
  it('trusts a membership at the floor and damps one below it', () => {
    expect(sizeWeight(2, 2)).toBe(1)
    expect(sizeWeight(9, 2)).toBe(1)
    expect(sizeWeight(1, 2)).toBe(0.5)
    expect(sizeWeight(0, 2)).toBe(0)
  })
})

describe('normaliseTitle', () => {
  it('folds case, accents and punctuation, and nothing else', () => {
    expect(normaliseTitle('Össur — "Fit & Comfort"')).toBe('ossur fit comfort')
    expect(normaliseTitle('fit  and   comfort')).toBe('fit and comfort')
    expect(normaliseTitle('   ')).toBe('')
    expect(normaliseTitle(null)).toBe('')
  })
})

describe('scorePair', () => {
  it('reads the video arm where the candidate clears the floor', () => {
    const s = scorePair(
      { memberInsightIds: ['new1', 'new2'], memberVideoIds: ['v1', 'v2'] },
      { member_insight_ids: ['old1', 'old2'], member_video_ids: ['v1', 'v2'] },
      2,
    )
    expect(s).toEqual({ score: 1, arm: 'video', video: 1, insight: 0 })
  })

  it('falls to the insight arm when the candidate has no stored video set', () => {
    const s = scorePair(
      { memberInsightIds: ['i1', 'i2'], memberVideoIds: ['v1', 'v2'] },
      { member_insight_ids: ['i1', 'i2'] },
      2,
    )
    expect(s).toEqual({ score: 1, arm: 'insight', video: 0, insight: 1 })
  })

  it('takes whichever arm reads higher — the change is a rescue, not a re-key', () => {
    const s = scorePair(
      { memberInsightIds: ['i1', 'i2'], memberVideoIds: ['v1', 'v9'] },
      { member_insight_ids: ['i1', 'i2'], member_video_ids: ['v1', 'v2'] },
      2,
    )
    expect(s.arm).toBe('insight')
    expect(s.score).toBe(1)
    expect(s.video).toBeCloseTo(1 / 3)
  })

  it('a single-video theme cannot reach 1.0 on the video arm', () => {
    // Either the candidate is below the floor and the arm never runs…
    expect(scorePair(
      { memberInsightIds: [], memberVideoIds: ['v1'] },
      { member_insight_ids: [], member_video_ids: ['v1'] },
      2,
    )).toEqual({ score: 0, arm: 'insight', video: 0, insight: 0 })
    // …or it clears it, an identical set is impossible, and the damp halves
    // what is left into the band where the words have to agree too.
    expect(scorePair(
      { memberInsightIds: [], memberVideoIds: ['v1'] },
      { member_insight_ids: [], member_video_ids: ['v1', 'v2'] },
      2,
    ).score).toBe(0.25)
  })
})

describe('matchThemes — the video arm', () => {
  it('carries identity across a corpus-wide re-read, where insight ids carry none', () => {
    const reg = [withVideos(entry('r1', ['old1', 'old2', 'old3']), ['v1', 'v2', 'v3'])]
    const [m] = matchThemes(
      [theme('t1', ['new1', 'new2', 'new3'], { memberVideoIds: ['v1', 'v2', 'v3'] })],
      reg,
    )
    expect(m.themeId).toBe('r1')
    expect(m.kind).toBe('exact')
    // and on the ids alone it is a brand new theme
    expect(matchThemes([theme('t1', ['new1', 'new2', 'new3'])], [entry('r1', ['old1', 'old2', 'old3'])])[0].themeId)
      .toBeNull()
  })

  it('leaves a below-floor candidate to the insight arm, collisions and all', () => {
    // Two themes standing on the same single video: the video arm is not
    // consulted at all, so identity is not handed out alphabetically.
    const reg = [
      withVideos(entry('rA', ['i1', 'i2']), ['v1']),
      withVideos(entry('rB', ['i3', 'i4']), ['v1']),
    ]
    const res = matchThemes([
      theme('a', ['i3', 'i4'], { memberVideoIds: ['v1'] }),
      theme('b', ['i1', 'i2'], { memberVideoIds: ['v1'] }),
    ], reg)
    expect(res.find((r) => r.key === 'a')!.themeId).toBe('rB')
    expect(res.find((r) => r.key === 'b')!.themeId).toBe('rA')
  })

  it('breaks a video tie on the insight reading, then on the words', () => {
    const reg = [
      withVideos(entry('rA', ['x1'], { embedding: [0.1] }), ['v1', 'v2']),
      withVideos(entry('rB', ['i1', 'i2'], { embedding: [0.1] }), ['v1', 'v2']),
      withVideos(entry('rC', ['x2'], { embedding: [0.9] }), ['v1', 'v2']),
    ]
    // rB shares the insight ids, so it wins the tie although rA sorts first.
    const [m] = matchThemes(
      [theme('t1', ['i1', 'i2'], { memberVideoIds: ['v1', 'v2'], embedding: [0.9] })],
      reg,
      { cosine: cos },
    )
    expect(m.themeId).toBe('rB')
    // With no insight overlap anywhere, the words decide: rC, not rA.
    const [n] = matchThemes(
      [theme('t2', ['n1', 'n2'], { memberVideoIds: ['v1', 'v2'], embedding: [0.9] })],
      reg,
      { cosine: cos },
    )
    expect(n.themeId).toBe('rC')
  })

  it('still claims one entry at most once when both arms agree', () => {
    const reg = [withVideos(entry('r1', ['i1', 'i2']), ['v1', 'v2'])]
    const res = matchThemes([
      theme('a', ['i1', 'i2'], { memberVideoIds: ['v1', 'v2'] }),
      theme('b', ['i1', 'i2'], { memberVideoIds: ['v1', 'v2'] }),
    ], reg)
    expect(res.filter((r) => r.themeId === 'r1')).toHaveLength(1)
    expect(res.filter((r) => r.themeId === null)).toHaveLength(1)
  })

  it('attributes a split on the same score the match used', () => {
    const reg = [
      withVideos(entry('r1', ['i1']), ['v1', 'v2', 'v3', 'v4']),
      withVideos(entry('r2', ['i2']), ['v9']),
    ]
    const res = matchThemes([
      theme('big', ['i1'], { memberVideoIds: ['v1', 'v2', 'v3'] }),
      theme('small', ['i1'], { memberVideoIds: ['v4'] }),
    ], reg)
    expect(res.find((r) => r.key === 'big')!.themeId).toBe('r1')
    const small = res.find((r) => r.key === 'small')!
    expect(small.themeId).toBeNull()
    expect(small.splitFrom).toBe('r1')
  })

  it('reports which arm claimed the identity, so the record can say', () => {
    // `exact` alone is ambiguous after the cutover: it means "identical insight
    // sets" or "identical video sets with entirely different insight rows".
    const reg = [
      withVideos(entry('rv', ['old1', 'old2'], { bucket: 'client' }), ['v1', 'v2']),
      entry('ri', ['i1', 'i2'], { bucket: 'industry-other' }),
    ]
    const res = matchThemes([
      theme('onVideos', ['new1', 'new2'], { bucket: 'client', memberVideoIds: ['v1', 'v2'] }),
      theme('onInsights', ['i1', 'i2'], { bucket: 'industry-other' }),
      theme('unclaimed', ['z1'], { bucket: 'client', memberVideoIds: ['z9'] }),
    ], reg)
    const by = (k: string) => res.find((r) => r.key === k)!
    expect(by('onVideos').kind).toBe('exact')
    expect(by('onVideos').arm).toBe('video')
    expect(by('onInsights').kind).toBe('exact')
    expect(by('onInsights').arm).toBe('insight')
    expect(by('unclaimed').themeId).toBeNull()
    expect(by('unclaimed').arm).toBeUndefined()
  })

  it('does not call a shared video a split — lineage needs the weak band', () => {
    // Measured on Össur's d346b0f7 (757 themes): within one run a theme shares
    // an insight set with another theme 0.00 times on average — clusters
    // partition the insights — but shares at least one VIDEO with an
    // above-floor theme in its bucket 4.70 times on average, max 123. At the
    // old bar (any score above zero) nearly every new entry would be born
    // asserting a parent_theme_id it never split from.
    const videos = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10']
    const reg = [withVideos(entry('r1', ['i1', 'i2']), videos)]
    const res = matchThemes([
      theme('holder', ['i1', 'i2'], { memberVideoIds: videos }),
      theme('stranger', ['n1'], { memberVideoIds: ['v1', 'w1'] }),
    ], reg)
    expect(res.find((r) => r.key === 'holder')!.themeId).toBe('r1')
    const stranger = res.find((r) => r.key === 'stranger')!
    expect(stranger.themeId).toBeNull()
    expect(stranger.kind).toBe('new')
    expect(stranger.splitFrom).toBeUndefined()
    expect(scorePair(
      { memberInsightIds: ['n1'], memberVideoIds: ['v1', 'w1'] },
      { member_insight_ids: ['i1', 'i2'], member_video_ids: videos },
    ).score).toBeLessThan(0.25)
  })
})

describe('matchThemes — what may cross a bucket', () => {
  const reg = [withVideos(entry('r1', ['i1', 'i2'], {
    bucket: 'competitor:Cotopaxi',
    canonical_label: 'Zipper pulls break',
  }), ['v1', 'v2'])]

  it('an exact title crosses two spellings of ONE rival', () => {
    const [m] = matchThemes([theme('t1', ['n1'], {
      bucket: 'competitor:cotopaxi ',
      label: 'Zipper pulls break!',
      memberVideoIds: ['v9'],
    })], reg, { bucketKey: audienceFold })
    expect(m.themeId).toBe('r1')
    expect(m.kind).toBe('strong')
  })

  it('membership alone does not cross, even for the same rival', () => {
    const [m] = matchThemes([theme('t1', ['i1', 'i2'], {
      bucket: 'competitor:cotopaxi',
      label: 'Something else entirely',
      memberVideoIds: ['v1', 'v2'],
    })], reg, { bucketKey: audienceFold })
    expect(m.themeId).toBeNull()
  })

  it('and a title never crosses two different rivals, or a rival and the client', () => {
    const other = [theme('t1', ['n1'], { bucket: 'competitor:Freitag', label: 'Zipper pulls break' })]
    expect(matchThemes(other, reg, { bucketKey: audienceFold })[0].themeId).toBeNull()
    const own = [theme('t2', ['n1'], { bucket: 'client', label: 'Zipper pulls break' })]
    expect(matchThemes(own, reg, { bucketKey: audienceFold })[0].themeId).toBeNull()
  })

  it('without the fold, nothing crosses at all — the default is the literal bucket', () => {
    const [m] = matchThemes([theme('t1', ['n1'], {
      bucket: 'competitor:cotopaxi ',
      label: 'Zipper pulls break',
    })], reg)
    expect(m.themeId).toBeNull()
  })
})

describe('themedRunWindow', () => {
  const entries = [
    { last_seen_run_id: 'r3', last_seen_at: '2026-09-13T00:00:00Z' },
    { last_seen_run_id: 'r2', last_seen_at: '2026-09-06T00:00:00Z' },
    { last_seen_run_id: 'r2', last_seen_at: '2026-09-06T00:00:00Z' },
    { last_seen_run_id: 'r1', last_seen_at: '2026-08-30T00:00:00Z' },
    { last_seen_run_id: null, last_seen_at: null },
  ]
  it('is this run plus the newest themed runs, newest first and deduplicated', () => {
    expect(themedRunWindow(entries, 'now', 3)).toEqual(['now', 'r3', 'r2'])
  })
  it('never counts a gather-only run: it is not in the registry at all', () => {
    // 'gather' closed completed and themed nothing, so no entry names it.
    expect(themedRunWindow(entries, 'now', 4)).toEqual(['now', 'r3', 'r2', 'r1'])
  })
  it('does not list this run twice when entries already name it', () => {
    expect(themedRunWindow([{ last_seen_run_id: 'now', last_seen_at: 'x' }, ...entries], 'now', 2))
      .toEqual(['now', 'r3'])
  })
})

describe('dormantIds', () => {
  const reg = [
    { id: 'a', last_seen_run_id: 'r3', status: 'active' },
    { id: 'b', last_seen_run_id: 'r1', status: 'active' },
    { id: 'c', last_seen_run_id: null, status: 'active' },
    { id: 'd', last_seen_run_id: 'r1', status: 'dormant' },
  ]
  it('marks entries unseen across the window, skipping already-dormant ones', () => {
    expect(dormantIds(reg, ['r3', 'r2', 'r1x'], 3)).toEqual(['b', 'c'])
  })
  it('keeps an entry seen anywhere in the window', () => {
    expect(dormantIds(reg, ['r3', 'r2', 'r1'], 3)).toEqual(['c'])
  })
})

describe('matchTally', () => {
  it('counts every kind, including zeros', () => {
    const t = matchTally([
      { key: '1', themeId: 'r1', kind: 'exact', score: 1 },
      { key: '2', themeId: null, kind: 'new', score: 0 },
      { key: '3', themeId: 'r2', kind: 'exact', score: 1 },
    ])
    expect(t).toEqual({ exact: 2, strong: 0, weak: 0, new: 1, revived: 0 })
  })
})
