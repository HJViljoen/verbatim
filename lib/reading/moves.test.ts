import { describe, expect, it } from 'vitest'

import {
  actedTally,
  buildMoveCandidate,
  CARD_COMMENT_FLOOR,
  CARD_NOT_DECLARABLE,
  CARD_NO_POSTS,
  HOOK_UNCLASSIFIED,
  MOVE_NO_CLIENT_SERIES,
  MOVE_NO_MONTHS_RECORDED,
  MOVE_NO_TARGET_SERIES,
  MOVE_TOO_YOUNG,
  moveChartNote,
  readMove,
  type MoveCandidateInput,
  type MoveReadingInput,
  type MoveSeries,
} from './moves'
import type { Verdict } from './verdicts'

const MONTH = '2026-09-01'

const video = (over: Partial<MoveCandidateInput['clientVideos'][number]> = {}) => ({
  id: 'v1',
  upload_date: '2026-09-04',
  comments_count: 12,
  hook_style: 'question',
  classified_type: 'review',
  ...over,
})

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'subject',
  objectId: 's1',
  objectLabel: 'Durability',
  audience: 'client',
  window: { kind: 'month', from: MONTH, to: '2026-10-01' },
  basis: { from: '2026-08-01', to: MONTH },
  value: { k: 26, n: 84 },
  baseline: { k: 23, n: 85 },
  changePts: 3.9,
  bandPts: 13.6,
  state: 'too_little_data',
  flags: [],
  ...over,
})

function card(over: Partial<MoveCandidateInput> = {}) {
  const base: MoveCandidateInput = {
    month: MONTH,
    clientVideos: [
      video({ id: 'v1', comments_count: 40, hook_style: 'question' }),
      video({ id: 'v2', comments_count: 18, hook_style: 'demonstration' }),
      video({ id: 'v3', comments_count: 6, hook_style: 'question' }),
      video({ id: 'v4', comments_count: 2, hook_style: 'bold-claim' }),
      video({ id: 'v5', comments_count: 0, hook_style: null }),
      video({ id: 'v6', comments_count: 1, hook_style: 'question' }),
      video({ id: 'v7', comments_count: 0, hook_style: 'demonstration' }),
      video({ id: 'v8', comments_count: 3, hook_style: 'listicle' }),
      video({ id: 'v9', comments_count: 0, hook_style: 'bold-claim' }),
      // Published in August: on the same table, off this card.
      video({ id: 'vA', upload_date: '2026-08-29', comments_count: 90, hook_style: 'question' }),
    ],
    claims: [
      { source_video_id: 'v1', claim: 'Built to last a decade', entity: 'client' },
      { source_video_id: 'v2', claim: 'Built to last a decade', entity: 'client' },
      { source_video_id: 'v3', claim: 'Built to last a decade', entity: 'client' },
      { source_video_id: 'v1', claim: 'Made from 100% recycled sails', entity: 'client' },
      { source_video_id: 'v2', claim: 'Made from 100% recycled sails', entity: 'client' },
      { source_video_id: 'v4', claim: 'Made from 100% recycled sails', entity: 'client' },
      { source_video_id: 'v5', claim: 'Made from 100% recycled sails', entity: 'client' },
      // A rival's claim, filed against a rival's video, and a rival's claim
      // wrongly carrying one of ours.
      { source_video_id: 'vR', claim: 'Cheapest in the category', entity: 'competitor' },
      { source_video_id: 'v1', claim: 'Cheapest in the category', entity: 'competitor' },
    ],
    membership: [
      { subjectId: 's1', label: 'Durability', videoIds: ['v1', 'v2', 'v3', 'vA'] },
      { subjectId: 's2', label: 'Recycled materials', videoIds: ['v4', 'v5'] },
      { subjectId: 's3', label: 'Waterproofing', videoIds: ['vA'] },
    ],
    yours: verdict(),
    category: verdict({ audience: 'industry-other', value: { k: 305, n: 1388 }, baseline: { k: 264, n: 1388 }, changePts: 3, bandPts: 1.9, state: 'moved' }),
  }
  return buildMoveCandidate({ ...base, ...over })
}

describe('buildMoveCandidate — the pre-filled card', () => {
  it('counts the month’s own posts, dated by the post, with one denominator under every row', () => {
    const c = card()
    expect(c.month).toBe(MONTH)
    // Nine published in September; the August post is not on this card.
    expect(c.posts.value).toEqual({ k: 9, n: 9 })
    expect(c.posts.basis).toBe('posts published in September')
    // The floor is the comment floor, not a reading of the conversation.
    expect(c.commentFloor).toBe(CARD_COMMENT_FLOOR)
    expect(c.overFloor.value).toEqual({ k: 3, n: 9 })
    expect(c.overFloor.basis).toBe(c.posts.basis)
    // Five posts carried a claim of ours; the competitor's row on v1 is not
    // something we said and does not add a sixth.
    expect(c.claims.value).toEqual({ k: 5, n: 9 })
    expect(c.claimTopics).toEqual(['Made from 100% recycled sails', 'Built to last a decade'])
    expect(c.claimRows.map((r) => [r.claim, r.posts.k, r.posts.n])).toEqual([
      ['Made from 100% recycled sails', 4, 9],
      ['Built to last a decade', 3, 9],
    ])
    expect(c.claimTopics).not.toContain('Cheapest in the category')
  })

  it('splits the hooks over the posts count and over nothing else', () => {
    const c = card()
    expect(c.hooks.map((h) => [h.label, h.value.k])).toEqual([
      ['a question', 3],
      ['a bold claim', 2],
      ['a demonstration', 2],
      ['a list', 1],
      [HOOK_UNCLASSIFIED, 1],
    ])
    // Every hook row is a share of the SAME denominator — the posts count —
    // and the split adds to it rather than to 100% of anything else.
    expect(c.hooks.every((h) => h.value.n === c.posts.value.n)).toBe(true)
    expect(c.hooks.every((h) => h.basis === c.posts.basis)).toBe(true)
    expect(c.hooks.reduce((sum, h) => sum + h.value.k, 0)).toBe(c.posts.value.k)
  })

  it('matches subjects against this month’s posts only, and proposes the largest', () => {
    const c = card()
    expect(c.subjects).toEqual([
      { subjectId: 's1', label: 'Durability', matched: { k: 3, n: 9 } },
      { subjectId: 's2', label: 'Recycled materials', matched: { k: 2, n: 9 } },
    ])
    // Waterproofing matched only the August post, so it is not on this card.
    expect(c.subjects.find((s) => s.label === 'Waterproofing')).toBeUndefined()
    expect(c.proposal).toEqual({
      kind: 'subject',
      subjectId: 's1',
      title: 'What you published in September',
      direction: 'up',
    })
    expect(c.unread).toBeNull()
  })

  it('pairs your movement with the category’s, each carrying its own k, n and band', () => {
    const c = card()
    expect(c.movement.yours?.audience).toBe('client')
    expect(c.movement.category?.audience).toBe('industry-other')
    // Two verdicts, never one arrow over both: each side keeps its own
    // denominator and its own band.
    expect(c.movement.yours?.value.n).not.toBe(c.movement.category?.value.n)
    expect(c.movement.yours?.bandPts).not.toBeNull()
    expect(c.movement.category?.bandPts).not.toBeNull()
    // And neither is a direction word.
    expect(c.movement.yours?.direction ?? null).toBeNull()
    expect(c.movement.category?.direction ?? null).toBeNull()
  })

  it('a month with no posts of your own says so and proposes nothing', () => {
    const c = card({ clientVideos: [], claims: [], membership: [] })
    expect(c.posts.value).toEqual({ k: 0, n: 0 })
    expect(c.hooks).toEqual([])
    expect(c.subjects).toEqual([])
    expect(c.proposal).toBeNull()
    expect(c.unread).toBe(CARD_NO_POSTS)
  })

  it('denominates the subject rows on the posts we READ, never on every post', () => {
    // Nine published; three of them analysed. A subject matching two of those
    // three is 2 of 3 — printing 2 of 9 would be a statement about our gather
    // cadence wearing the client's noun.
    const c = card({ readPosts: 3 })
    expect(c.readPosts.value).toEqual({ k: 3, n: 9 })
    expect(c.readPosts.basis).toBe('posts published in September')
    expect(c.subjectsBasis).toBe('posts of yours we read in September')
    expect(c.subjects.map((x) => [x.label, x.matched.k, x.matched.n])).toEqual([
      ['Durability', 3, 3],
      ['Recycled materials', 2, 3],
    ])
    // Every other row keeps the published denominator.
    expect(c.posts.value.n).toBe(9)
    expect(c.overFloor.value.n).toBe(9)
    expect(c.hooks.every((h) => h.value.n === 9)).toBe(true)
  })

  it('says one population when everything published was read', () => {
    const c = card()
    expect(c.readPosts.value).toEqual({ k: 9, n: 9 })
    expect(c.subjectsBasis).toBe(c.posts.basis)
  })

  it('never claims to have read more than was published', () => {
    expect(card({ readPosts: 40 }).readPosts.value).toEqual({ k: 9, n: 9 })
  })

  it('a floor the caller names excludes the posts under it', () => {
    expect(card({ commentFloor: 20 }).overFloor.value).toEqual({ k: 1, n: 9 })
    expect(card({ commentFloor: 1 }).overFloor.value).toEqual({ k: 6, n: 9 })
  })

  it('without M4 the card still counts and has nothing to declare', () => {
    const c = card({ declarable: false })
    expect(c.posts.value).toEqual({ k: 9, n: 9 })
    expect(c.proposal).toBeNull()
    expect(c.unread).toBe(CARD_NOT_DECLARABLE)
  })

  it('a subject nothing matched never becomes a proposal', () => {
    const c = card({ membership: [] })
    expect(c.proposal).toBeNull()
    expect(c.unread).toBeNull()
  })
})

// ---- What a move did ---------------------------------------------------------

const series = (over: Partial<MoveSeries> = {}): MoveSeries => ({
  audience: 'client',
  label: 'You',
  touched: true,
  noClustering: true,
  points: [
    { month: '2026-07-01', k: 8, n: 110, pct: 7.3 },
    { month: '2026-08-01', k: 10, n: 112, pct: 8.9 },
    { month: '2026-09-01', k: 14, n: 118, pct: 11.9 },
  ],
  ...over,
})

function reading(over: Partial<MoveReadingInput> = {}) {
  const base: MoveReadingInput = {
    move: {
      id: 'mv1',
      title: 'Push repairability',
      kind: 'subject',
      declared_at: '2026-08-12',
      subject_id: 's9',
      registry_ids: null,
      lineage_id: null,
    },
    targetLabel: 'Repair & warranty',
    series: [series()],
    window: { kind: 'since', from: '2026-07-01', to: '2026-10-01' },
  }
  return readMove({ ...base, ...over })
}

describe('readMove — the one movement claim a move earns', () => {
  it('reads the month before the line against the latest month after it', () => {
    const r = reading()
    expect(r.on).toBe('on the subject Repair & warranty')
    expect(r.verdict).not.toBeNull()
    // July is the last complete month before the August declaration; September
    // is the latest month after it. August itself is drawn and not compared.
    expect(r.verdict?.baseline).toEqual({ k: 8, n: 110 })
    expect(r.verdict?.value).toEqual({ k: 14, n: 118 })
    expect(r.verdict?.basis?.from).toBe('2026-07-01')
    expect(r.verdict?.window.from).toBe('2026-09-01')
    // Both sides' n travel with the claim, and neither side is a sum.
    expect(r.verdict?.value.n).toBe(118)
    expect(r.verdict?.bandPts).not.toBeNull()
    // A move never earns a direction word.
    expect(r.verdict?.direction ?? null).toBeNull()
    expect(r.months).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(r.line).toBe('declared 12 Aug · read against the one month since')
    expect(r.unread).toBeNull()
  })

  it('prints the control beside the verdict when the control also moved', () => {
    const control = series({
      audience: 'industry-other',
      label: 'The category',
      touched: false,
      points: [
        { month: '2026-07-01', k: 120, n: 1300, pct: 9.2 },
        { month: '2026-08-01', k: 130, n: 1340, pct: 9.7 },
        { month: '2026-09-01', k: 190, n: 1388, pct: 13.7 },
      ],
    })
    const r = reading({ series: [series(), control] })
    expect(r.verdict).not.toBeNull()
    expect(r.control).toHaveLength(1)
    expect(r.control[0].audience).toBe('industry-other')
    expect(r.control[0].state).toBe('moved')
    // The control stands beside the verdict and is never differenced into it:
    // the client side's figures are the client side's alone.
    expect(r.verdict?.value).toEqual({ k: 14, n: 118 })
    expect(r.figures.videos_read.value).toBe(118)
    expect(r.figures.share_now.value).toBe(11.9)
    expect(r.figures.share_before.value).toBe(7.3)
  })

  it('a move younger than two months has no verdict and says why', () => {
    const young = series({
      points: [
        { month: '2026-08-01', k: 10, n: 112, pct: 8.9 },
        { month: '2026-09-01', k: 14, n: 118, pct: 11.9 },
      ],
    })
    const r = reading({ move: { id: 'mv2', title: 'Track: Waterproofing', kind: 'subject', declared_at: '2026-09-02', subject_id: 's4', registry_ids: null, lineage_id: null }, series: [young] })
    expect(r.verdict).toBeNull()
    expect(r.control).toEqual([])
    expect(r.figures).toEqual({})
    expect(r.unread).toBe(MOVE_TOO_YOUNG)
    expect(r.line).toBe('declared 2 Sep · read against no complete month since')
  })

  it('a move whose own side carries nothing says that instead', () => {
    const r = reading({ series: [series({ touched: false })] })
    expect(r.verdict).toBeNull()
    expect(r.unread).toBe(MOVE_NO_CLIENT_SERIES)
    // The untouched side is still read — it is the control.
    expect(r.control).toHaveLength(1)
  })

  it('a move on a piece of advice names nothing to count, and says so', () => {
    const r = reading({
      move: { id: 'mv8', title: 'Lead with repairability', kind: 'advice', declared_at: '2026-08-12', subject_id: null, registry_ids: null, lineage_id: 'l1' },
      targetLabel: null,
      series: [],
    })
    expect(r.verdict).toBeNull()
    expect(r.control).toEqual([])
    expect(r.months).toEqual([])
    expect(r.unread).toBe(MOVE_NO_TARGET_SERIES)
  })

  it('a subject or theme move with no months is never told it is advice', () => {
    // The state every subject move is in where `moves` (M4) is applied and the
    // month tables are not — which is the ordering production passes through.
    const subject = reading({ series: [] })
    expect(subject.verdict).toBeNull()
    expect(subject.unread).toBe(MOVE_NO_MONTHS_RECORDED)
    expect(subject.unread).not.toBe(MOVE_NO_TARGET_SERIES)
    // A subject move filed with a null target is the same absence, not advice.
    const untargeted = reading({
      move: { id: 'mv9', title: 'Push repairability', kind: 'subject', declared_at: '2026-08-12', subject_id: null, registry_ids: null, lineage_id: null },
      series: [],
    })
    expect(untargeted.unread).toBe(MOVE_NO_MONTHS_RECORDED)
    const themed = reading({
      move: { id: 'mv10', title: 'Answer the wet-commute question', kind: 'theme', declared_at: '2026-08-12', subject_id: null, registry_ids: ['t1'], lineage_id: null },
      series: [],
    })
    expect(themed.unread).toBe(MOVE_NO_MONTHS_RECORDED)
  })

  it('names a theme move by its themes and an advice move as advice', () => {
    const themed = reading({
      move: { id: 'mv3', title: 'Answer the wet-commute question', kind: 'theme', declared_at: '2026-08-12', subject_id: null, registry_ids: ['t1', 't2'], lineage_id: null },
      targetLabel: null,
    })
    expect(themed.on).toBe('on 2 themes')
    const one = reading({
      move: { id: 'mv4', title: 'One theme', kind: 'theme', declared_at: '2026-08-12', subject_id: null, registry_ids: ['t1'], lineage_id: null },
      targetLabel: 'Wet commute',
    })
    expect(one.on).toBe('on the theme Wet commute')
    const advice = reading({
      move: { id: 'mv5', title: 'Lead with repairability', kind: 'advice', declared_at: '2026-08-12', subject_id: null, registry_ids: null, lineage_id: 'l1' },
      targetLabel: null,
    })
    expect(advice.on).toBe('on a piece of advice')
    // An advice move is still counted on something countable — there is no
    // `advice` object kind and nothing counts a recommendation.
    expect(advice.verdict?.objectKind).toBe('subject')
  })

  it('marks a re-grouping on a theme move and claims none on a subject move', () => {
    // A SUBJECT has no clustering to be like-for-like about — membership is
    // not a clustering artefact — so its verdict carries no clustering flag at
    // all, rather than the `clustering_unknown` an absent key would earn.
    expect(reading().verdict?.flags).toEqual([])

    const themed = readMove({
      move: { id: 'mv6', title: 'Answer the wet-commute question', kind: 'theme', declared_at: '2026-08-12', subject_id: null, registry_ids: ['t1'], lineage_id: null },
      targetLabel: 'Wet commute',
      series: [
        series({
          noClustering: false,
          regimeByMonth: { '2026-07-01': 'cl-a', '2026-08-01': 'cl-a', '2026-09-01': 'cl-b' },
        }),
      ],
      window: { kind: 'since', from: '2026-07-01', to: '2026-10-01' },
    })
    // The band is still drawn — a re-grouping is marked, never refused — and
    // the caveat rides beside it.
    expect(themed.verdict?.flags).toContain('clustering_changed')
    expect(themed.verdict?.bandPts).not.toBeNull()
    expect(themed.verdict?.state).not.toBe('refused')

    const unrecorded = readMove({
      move: { id: 'mv7', title: 'Answer the wet-commute question', kind: 'theme', declared_at: '2026-08-12', subject_id: null, registry_ids: ['t1'], lineage_id: null },
      series: [series({ noClustering: false })],
      window: { kind: 'since', from: '2026-07-01', to: '2026-10-01' },
    })
    // Two months nobody recorded a grouping for is a DIFFERENT statement from
    // two groupings that differ, and the flag says which.
    expect(unrecorded.verdict?.flags).toContain('clustering_unknown')
  })
})

describe('actedTally — the whole ledger, never a quarter', () => {
  it('counts every identity ever recommended', () => {
    const t = actedTally(2, 5)
    expect(t).toEqual({
      decided: 2,
      of: 5,
      line: 'You have acted on 2 of 5 — every piece of advice this product has ever given you.',
    })
    expect(t.line).not.toMatch(/quarter/i)
  })

  it('says nothing has been recommended rather than printing 0 of 0', () => {
    expect(actedTally(0, 0).line).toBe('Nothing has been recommended yet.')
    expect(actedTally(0, 0).line).not.toMatch(/quarter/i)
  })

  it('reads the same as the ledger’s own line at the same numbers', () => {
    expect(actedTally(1, 64).line).toContain('1 of 64')
  })
})

describe('moveChartNote — two readings are not a line', () => {
  it('refuses the line below three readings and names the months instead', () => {
    expect(moveChartNote(series({ points: [] }))).toBe('no month reads')
    expect(moveChartNote(series({ points: [{ month: '2026-09-01', k: 10, n: 84, pct: 11.9 }] }))).toBe('Sep only')
    expect(
      moveChartNote(
        series({
          points: [
            { month: '2026-08-01', k: 8, n: 83, pct: 9.6 },
            { month: '2026-09-01', k: 10, n: 84, pct: 11.9 },
          ],
        }),
      ),
    ).toBe('Aug → Sep only')
    // Three readings and the line may be drawn.
    expect(moveChartNote(series())).toBeNull()
    expect(reading().chartNote).toBeNull()
  })

  it('a month with no denominator is not a reading', () => {
    const hollow = series({
      points: [
        { month: '2026-07-01', k: null, n: null, pct: null },
        { month: '2026-08-01', k: 8, n: 83, pct: 9.6 },
        { month: '2026-09-01', k: 10, n: 84, pct: 11.9 },
      ],
    })
    expect(moveChartNote(hollow)).toBe('Aug → Sep only')
  })
})
