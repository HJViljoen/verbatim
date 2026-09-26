import { describe, expect, it } from 'vitest'

import { pooledDenominators } from '../reading/market'
import type { MonthSeries } from '../reading/series'
import { scheduledUpdateAfter } from '../reading/reading-month'
import {
  byRailRank,
  fillMakerShares,
  kindsInLead,
  kindsInRows,
  makerKOf,
  MARKET_LINE,
  marketLineOf,
  marketTrail,
  monthCardState,
  monthsReadOf,
  subjectMonthVideos,
  SUBJECT_KINDS,
  type SubjectMember,
  type SubjectRail,
} from './subjects'

// WP2.2 · Subjects on the market: the pure half (plan §2.3 S1-S6). Figures are
// staging's Sealand September (read with the 20 Sep update) unless a case
// needs a smaller shape to show a rule.

const SEP = '2026-09-01'
const AUG = '2026-08-01'
const member = (over: Partial<SubjectMember> & { insightId: string }): SubjectMember => ({
  kind: 'praise', videoId: 'v1', client: false, analysed: true, evidence: [], ...over,
})
const comment = (date: string) => ({ source: 'comment', commentDate: `${date}T00:00:00+00:00` })

describe('subjectMonthVideos: the subject\'s market videos in a month, by the month rule', () => {
  it('counts a member cited on a comment dated in the month, once per video', () => {
    const { videos } = subjectMonthVideos([
      member({ insightId: 'i1', videoId: 'v1', evidence: [comment('2026-09-08')] }),
      member({ insightId: 'i2', videoId: 'v1', evidence: [comment('2026-09-09')] }),
      member({ insightId: 'i3', videoId: 'v2', evidence: [comment('2026-08-31')] }),
    ], SEP, new Set())
    expect([...videos]).toEqual(['v1'])
  })

  it('counts an on-camera-only member where its video occupies the month, and not otherwise', () => {
    const onCamera = member({ insightId: 'i1', videoId: 'v3', evidence: [{ source: 'video', commentDate: null }] })
    expect(subjectMonthVideos([onCamera], SEP, new Set(['v3'])).videos.size).toBe(1)
    expect(subjectMonthVideos([onCamera], SEP, new Set()).videos.size).toBe(0)
    expect(subjectMonthVideos([onCamera], SEP, null).videos.size).toBe(0)
  })

  it('does not count a member with comment evidence outside the month through the on-camera arm', () => {
    const m = member({ insightId: 'i1', videoId: 'v3', evidence: [comment('2026-08-12'), { source: 'video', commentDate: null }] })
    expect(subjectMonthVideos([m], SEP, new Set(['v3'])).videos.size).toBe(0)
  })

  it('leaves out the client\'s own audience and a video with no current analysis (decision E)', () => {
    const { videos } = subjectMonthVideos([
      member({ insightId: 'i1', videoId: 'own', client: true, evidence: [comment('2026-09-02')] }),
      member({ insightId: 'i2', videoId: 'unread', analysed: false, evidence: [comment('2026-09-02')] }),
    ], SEP, null)
    expect(videos.size).toBe(0)
  })

  it('holds the same videos by the kind of the member that placed them', () => {
    const { byKind } = subjectMonthVideos([
      member({ insightId: 'i1', videoId: 'v1', kind: 'praise', evidence: [comment('2026-09-08')] }),
      member({ insightId: 'i2', videoId: 'v1', kind: 'question', evidence: [comment('2026-09-08')] }),
      member({ insightId: 'i3', videoId: 'v2', kind: 'praise', evidence: [comment('2026-09-10')] }),
    ], SEP, null)
    expect(byKind.get('praise')?.size).toBe(2)
    expect(byKind.get('question')?.size).toBe(1)
  })
})

describe('kindsInRows and kindsInLead: what people say about the subject', () => {
  const byKind = (counts: Record<string, number>) =>
    new Map(Object.entries(counts).map(([k, n]) => [k, new Set(Array.from({ length: n }, (_, i) => `${k}${i}`))]))

  it('lists the six big kinds even at 0, largest first, then any other kind with a video', () => {
    const rows = kindsInRows(byKind({ praise: 93, purchase_intent: 4, feature_request: 4, objection: 4, question: 2, switching_signal: 1 }))
    expect(rows.map((r) => r.kind)).toEqual(['praise', 'purchase_intent', 'feature_request', 'objection', 'question', 'switching_signal', 'pain_point'])
    expect(rows.find((r) => r.kind === 'pain_point')?.k).toBe(0)
    expect(rows[0].label).toBe('Praising it')
    for (const k of SUBJECT_KINDS) expect(rows.some((r) => r.kind === k)).toBe(true)
  })

  it('says "almost all" only on a subject that carries a share (Looks & style, 93 of 103)', () => {
    const rows = kindsInRows(byKind({ praise: 93, purchase_intent: 4, feature_request: 4, objection: 4, question: 2 }))
    expect(kindsInLead({ of: 103, rows })).toBe('Almost all of it is praise: 93 of its 103 videos.')
  })

  it('names the most frequent kind as a count under 100 videos (Waterproofing, 11 of 29)', () => {
    const rows = kindsInRows(byKind({ pain_point: 11, question: 10, praise: 8 }))
    expect(kindsInLead({ of: 29, rows })).toBe('Most often, hitting a problem: 11 of its 29 videos.')
  })

  it('names no lead where two kinds tie, or none has a video', () => {
    expect(kindsInLead({ of: 29, rows: kindsInRows(byKind({ pain_point: 10, question: 10 })) })).toBeNull()
    expect(kindsInLead({ of: 29, rows: kindsInRows(byKind({})) })).toBeNull()
  })
})

describe('marketLineOf: one pooled line, the category\'s clock', () => {
  const point = (month: string, k: number | null, videos: number | null) => ({
    month, state: 'filling' as const, videos, comments: null, k, kComments: null, pct: null,
    audience: null, status: 'filling' as const, origin: 'live' as const, readAt: null, runId: null, frozenAt: null, clusteringKey: null, labels: [],
  })
  const line = (audience: string, points: ReturnType<typeof point>[]): MonthSeries => ({
    audience, names: [audience], objectId: 's1', objectLabel: 'Looks & style', points, notes: [], firstReadable: null, substrate: 'seeded',
  })
  // Staging's September: 625 in the category, 29 filed under four brands.
  const denominators = [
    { month: SEP, audience: 'industry-other', videos: 625, comments: 15792 },
    { month: SEP, audience: 'competitor:Cotopaxi', videos: 12, comments: 100 },
    { month: SEP, audience: 'competitor:Freitag', videos: 17, comments: 100 },
    { month: AUG, audience: 'industry-other', videos: 351, comments: 10188 },
    { month: AUG, audience: 'competitor:Cotopaxi', videos: 26, comments: 100 },
  ]
  const rivals = ['competitor:Cotopaxi', 'competitor:Freitag']
  const counts = pooledDenominators(denominators, rivals)

  it('pools k over the market\'s audiences, over the market\'s videos', () => {
    const out = marketLineOf({
      subjectId: 's1', label: 'Looks & style', months: [AUG, SEP], counts, rivalAudiences: rivals, read: () => true,
      lines: [
        line('industry-other', [point(AUG, 36, 351), point(SEP, 101, 625)]),
        line('competitor:Cotopaxi', [point(AUG, 2, 26), point(SEP, 1, 12)]),
        line('competitor:Freitag', [point(AUG, null, null), point(SEP, 1, 17)]),
      ],
    })!
    expect(out.audience).toBe(MARKET_LINE)
    expect(out.points.map((p) => [p.k, p.videos])).toEqual([[38, 377], [103, 654]])
    expect(out.points[1].pct).toBe(15.7)
  })

  it('reads a month the subject was not read in as no reading, never 0', () => {
    const out = marketLineOf({
      subjectId: 's1', label: 'x', months: [AUG, SEP], counts, rivalAudiences: rivals, read: (m) => m === SEP,
      lines: [line('industry-other', [point(AUG, 0, 351), point(SEP, 7, 625)])],
    })!
    expect(out.points[0].k).toBeNull()
    expect(monthsReadOf(out).map((p) => p.month)).toEqual([SEP])
  })

  it('prints the trail as levels with their bases, the count under 10 (§2.12)', () => {
    const out = marketLineOf({
      subjectId: 's1', label: 'Price', months: [AUG, SEP], counts, rivalAudiences: rivals, read: () => true,
      lines: [line('industry-other', [point(AUG, 5, 351), point(SEP, 25, 625)])],
    })!
    expect(marketTrail(out)).toEqual([
      { month: AUG, text: '5', of: 'of 377' },
      { month: SEP, text: '4%', of: 'of 654' },
    ])
  })
})

describe('the rail: its order and its maker tags', () => {
  const rail = (id: string, k: number | null, over: Partial<SubjectRail> = {}): SubjectRail => ({
    id, name: id, description: null, origin: 'category_theme', namedAt: '2026-09-23', status: 'active', calibration: 'ready',
    level: null, market: k == null ? null : { k, n: 654, pct: null }, note: null, verdict: null, selected: false, href: '', ...over,
  })

  it('ranks by the market\'s k, a row with no figure after, a named-but-not-confirmed row last', () => {
    const rows = [rail('Price', 25), rail('Proposed', null, { status: 'proposed' }), rail('Looks', 103), rail('Repair', 36, { calibration: 'failed' }), rail('Community', null)]
    expect([...rows].sort(byRailRank).map((r) => r.id)).toEqual(['Looks', 'Price', 'Community', 'Repair', 'Proposed'])
  })

  it('reads each subject\'s maker k off lens_readings, pooled over the market (staging: Looks & style 35 of 103)', () => {
    const lens = [
      { audience: 'industry-other', object_kind: 'subject', object_id: 's-looks', k: 35 },
      { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 220 },
      { audience: 'client', object_kind: 'subject', object_id: 's-looks', k: 4 },
    ]
    expect(makerKOf(lens, 's-looks', [])).toBe(35)
    expect(makerKOf(null, 's-looks', [])).toBeNull()
    const rows = [rail('s-looks', 103), rail('s-repair', 36, { calibration: 'failed' }), rail('s-new', null)]
    fillMakerShares(rows, { lens }, [])
    expect(rows[0].makerShare).toBeCloseTo(35 / 103)
    expect(rows[1].makerShare).toBeNull()
    expect(rows[2].makerShare).toBeNull()
    fillMakerShares(rows, { lens: null }, [])
    expect(rows[0].makerShare).toBeNull()
  })
})

describe('monthCardState: the words under a month', () => {
  const after = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })
  it('an ended month still filling names the update it settles with; a frozen one is final', () => {
    expect(monthCardState({ month: SEP, now: '2026-10-11T06:00:00Z', read: true, status: 'filling', paused: false, nextUpdateAfter: after })).toBe('ended · still filling until the 1 Nov update')
    expect(monthCardState({ month: AUG, now: '2026-10-11T06:00:00Z', read: true, status: 'frozen', paused: false, nextUpdateAfter: after })).toBe('final')
  })
  it('a running month is "so far", a paused tenant\'s "updates paused"; "complete" never', () => {
    expect(monthCardState({ month: '2026-10-01', now: '2026-10-20T06:00:00Z', read: true, status: 'filling', paused: false, nextUpdateAfter: after })).toBe('so far')
    expect(monthCardState({ month: SEP, now: '2026-10-11T06:00:00Z', read: true, status: 'filling', paused: true, nextUpdateAfter: after })).toBe('updates paused')
  })
  it('a month to come says when the pages move to it, and the next pair\'s later month when it settles', () => {
    expect(monthCardState({ month: '2026-10-01', now: '2026-10-02T06:00:00Z', read: false, status: null, paused: false, nextUpdateAfter: after })).toBe('so far from 16 Oct · ended from 1 Nov')
    expect(monthCardState({ month: '2026-11-01', now: '2026-10-02T06:00:00Z', read: false, status: null, paused: false, nextUpdateAfter: after, settlesWith: '2027-01-03T04:00:00.000Z' })).toBe('settles with the 3 Jan update')
  })
})
