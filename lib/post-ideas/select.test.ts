import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import type { QuoteVideo } from '../quote-gate'
import { INDUSTRY_AUDIENCE } from '../rivals'
import type { DatedEvidence } from '../written/evidence'
import type { PoolTheme, ThemeJudgement } from '../written/pool'
import {
  bestRow, choosePlay, ideaLength, isQuestionConversation, LENGTH_MAX_SECONDS, LENGTH_MIN_VIDEOS, POST_IDEA_CANDIDATES, POST_IDEA_MIN_MULTIPLE, POST_IDEAS_MAX,
  questionComments, rankQuestions, roundSeconds, untouchedQuestions, withHandles, type PlayVideo,
} from './select'

// Which question conversations become post ideas, and what code decides
// about each (T13). No database: the reads are the product's own readers,
// and what is tested is what the selection DOES with what they return.

const SEALAND = SEALAND_CLIENT_ID

const bagVideo = (n: number, over: Partial<QuoteVideo> = {}): QuoteVideo => ({
  platform: 'youtube',
  videoId: `yt${n}`,
  caption: 'My everyday backpack for travel: a carry on review after six months',
  hashtags: ['backpack', 'onebag'],
  topics: ['travel backpack', 'carry on'],
  accountName: `Creator ${n}`,
  isClient: false,
  isCompetitor: false,
  competitorName: null,
  source: 'discovered',
  segment: 'market',
  ...over,
})

let seq = 0
function ev(o: { insight: string; video: number; text: string; kind?: string; rank?: number; english?: string | null; audience?: string; lane?: string | null; segment?: QuoteVideo['segment']; insider?: boolean }): DatedEvidence {
  seq += 1
  return {
    insightId: o.insight,
    kind: o.kind ?? 'question',
    description: `Paraphrase of ${o.insight}`,
    theme: `slug_${o.insight}`,
    evidenceId: `e${String(seq).padStart(4, '0')}`,
    rank: o.rank ?? 1,
    commentId: `cm${seq}`,
    commentDate: '2026-10-07T00:00:00+00:00',
    author: `viewer${seq}`,
    text: o.text,
    lang: 'en',
    english: o.english ?? null,
    video: { uuid: `v-${o.video}`, platform: 'youtube', videoId: `yt${o.video}`, audience: o.audience ?? INDUSTRY_AUDIENCE, lane: o.lane === undefined ? 'full' : o.lane, accountName: `Creator ${o.video}` },
    context: bagVideo(o.video, o.segment ? { segment: o.segment } : {}),
    ...(o.insider ? { insider: true } : {}),
  }
}

const WATERPROOF: PoolTheme = {
  themeId: 'th-waterproof',
  label: 'Questions about backpack waterproofing',
  description: 'People ask whether the backpack keeps a laptop dry in heavy rain.',
  kind: 'question',
  matchKind: 'strong',
  memberIds: ['q1', 'q2', 'q3', 'q4'],
  weekVideos: 6,
}

const ASKS = [
  'Is this backpack waterproof enough for a laptop in heavy rain?',
  'How long does the waterproof coating on this backpack last?',
  'Does the backpack zipper let water in when it rains hard?',
  'Can I wash this backpack without ruining the waterproofing?',
  'Will the backpack keep my camera dry on a rainy commute?',
  'Does the roll top on this backpack really keep the rain out?',
]

describe('questionComments: the conversation\'s question comments, as the writer reads them', () => {
  it('reads only this theme\'s members, on category videos of the read lane, never a maker\'s video or a brand insider', () => {
    const evidence = [
      ev({ insight: 'q1', video: 1, text: ASKS[0] }),
      ev({ insight: 'q2', video: 2, text: ASKS[1] }),
      ev({ insight: 'other', video: 3, text: ASKS[2] }),
      ev({ insight: 'q3', video: 4, text: ASKS[3], audience: 'competitor:Rareform' }),
      ev({ insight: 'q3', video: 5, text: ASKS[4], lane: 'claims_only' }),
      ev({ insight: 'q4', video: 6, text: ASKS[5], segment: 'maker' }),
      ev({ insight: 'q4', video: 7, text: ASKS[2], insider: true }),
    ]
    const out = questionComments(SEALAND, WATERPROOF, evidence)
    expect(out.map((c) => c.videoId).sort()).toEqual(['v-1', 'v-2'])
  })

  it('takes the question-kind citations where they reach three videos, and every counted one where they do not', () => {
    const praise = ev({ insight: 'q4', video: 9, text: 'This backpack kept my laptop dry through a storm in Lisbon last week.', kind: 'praise' })
    const asking = [ev({ insight: 'q1', video: 1, text: ASKS[0] }), ev({ insight: 'q2', video: 2, text: ASKS[1] }), ev({ insight: 'q3', video: 3, text: ASKS[2] })]
    expect(questionComments(SEALAND, WATERPROOF, [...asking, praise]).map((c) => c.videoId).sort()).toEqual(['v-1', 'v-2', 'v-3'])
    // Two videos of questions: a price conversation's "how much?" is often filed as buying intent.
    expect(questionComments(SEALAND, WATERPROOF, [...asking.slice(0, 2), praise]).map((c) => c.videoId).sort()).toEqual(['v-1', 'v-2', 'v-9'])
  })

  it('takes one row per comment, reads the English where there is one, and draws round the videos under a cap', () => {
    const twice = ev({ insight: 'q1', video: 1, text: ASKS[0] })
    const again = { ...twice, insightId: 'q2', evidenceId: 'e9999', rank: 5 }
    const translated = ev({ insight: 'q3', video: 2, text: 'Ist dieser Rucksack wasserdicht genug für einen Laptop?', english: ASKS[0] })
    const out = questionComments(SEALAND, WATERPROOF, [twice, again, translated])
    expect(out).toHaveLength(2)
    expect(out.find((c) => c.videoId === 'v-2')?.text).toBe(ASKS[0])

    // Video 1 has four comments, video 2 and 3 one each: a cap of three takes
    // one from each video before a second from any.
    const many = [
      ...ASKS.slice(0, 4).map((text, i) => ev({ insight: 'q1', video: 1, text, rank: i + 1 })),
      ev({ insight: 'q2', video: 2, text: ASKS[4] }),
      ev({ insight: 'q3', video: 3, text: ASKS[5] }),
    ]
    expect(questionComments(SEALAND, WATERPROOF, many, 3).map((c) => c.videoId).sort()).toEqual(['v-1', 'v-2', 'v-3'])
  })
})

// ---- The conversations ----------------------------------------------------------------

const judgement = (o: { id: string; label: string; kind?: string; dominant?: string; lenient: number; gated?: number; week?: number; makers?: number }): ThemeJudgement => ({
  theme: { themeId: o.id, label: o.label, description: null, kind: o.kind ?? 'question', matchKind: 'strong', memberIds: [], weekVideos: o.week ?? o.lenient },
  lenientVideos: o.lenient,
  lenientVideoIds: [],
  gatedVideos: o.gated ?? 1,
  gatedVideoIds: [],
  quoteRefs: [],
  quoteOptions: [],
  kinds: [o.dominant ?? o.kind ?? 'question'],
  dominantKind: o.dominant ?? o.kind ?? 'question',
  notes: [],
  seenVideos: o.lenient,
  makerVideos: o.makers ?? 0,
})

describe('rankQuestions and untouchedQuestions: the conversations handed to the writer', () => {
  const judged = [
    judgement({ id: 'th-small', label: 'Questions about strap length', lenient: 3 }),
    judgement({ id: 'th-rain', label: 'Questions about waterproof backpack coating', lenient: 9 }),
    judgement({ id: 'th-praise', label: 'Praise for the roll top', kind: 'praise', lenient: 20 }),
    judgement({ id: 'th-fit', label: 'Hip belt fit', kind: 'pain_point', dominant: 'question', lenient: 5 }),
    judgement({ id: 'th-thin', label: 'Questions about colours', lenient: 2 }),
    judgement({ id: 'th-maker', label: 'Questions about sewing patterns', lenient: 8, makers: 6 }),
    judgement({ id: 'th-laptop', label: 'Questions about laptop sleeve size', lenient: 6 }),
  ]

  it('takes question conversations the week pool would take, biggest first: filed as questions, or mostly asking this week', () => {
    expect(rankQuestions(judged).map((j) => j.theme.themeId)).toEqual(['th-rain', 'th-laptop', 'th-fit', 'th-small'])
    expect(isQuestionConversation(judgement({ id: 'x', label: 'x', kind: 'question', dominant: 'purchase_intent', lenient: 3 }))).toBe(true)
    expect(isQuestionConversation(judgement({ id: 'x', label: 'x', kind: 'praise', lenient: 3 }))).toBe(false)
  })

  it('leaves out a conversation the client\'s own posts touched, by the one rule every page uses', () => {
    const posts = [{ id: 'own-1', topics: ['waterproof coating test', 'backpack in rain'], upload_date: '2026-10-02', video_url: null }]
    const { kept, covered } = untouchedQuestions(rankQuestions(judged), posts)
    expect(kept.map((k) => k.judgement.theme.themeId)).toEqual(['th-laptop', 'th-fit', 'th-small'])
    expect(kept.every((k) => k.touch === 'none')).toBe(true)
    expect(covered).toEqual([{ themeId: 'th-rain', label: 'Questions about waterproof backpack coating', posts: ['own-1'] }])
  })

  it('leaves nothing out on a guess where the client\'s posts could not be read', () => {
    const { kept, covered } = untouchedQuestions(rankQuestions(judged), null)
    expect(kept.map((k) => k.touch)).toEqual(['unread', 'unread', 'unread', 'unread'])
    expect(covered).toEqual([])
  })

  it('hands the writer one more than it stores, and no more', () => {
    expect(POST_IDEAS_MAX).toBe(3)
    expect(POST_IDEA_CANDIDATES).toBe(4)
    const lots = Array.from({ length: 7 }, (_, i) => judgement({ id: `th-${i}`, label: `Questions about pocket ${i}`, lenient: 10 - i }))
    expect(untouchedQuestions(lots, []).kept).toHaveLength(4)
  })
})

// ---- The format, the opening, the length ---------------------------------------------

const play = (id: string, o: Partial<PlayVideo>): PlayVideo => ({
  id, upload_date: '2025-03-01', platform: 'tiktok', classified_type: null, hook_style: null, engagement_rate: null, duration_seconds: null, ...o,
})

/** The market's videos on one question, published across many months. */
const ON_QUESTION: PlayVideo[] = [
  // Tutorials: 6, 7, 8 (median 7), long ones.
  play('t1', { classified_type: 'tutorial', hook_style: 'question', engagement_rate: 6, duration_seconds: 40, upload_date: '2025-11-02' }),
  play('t2', { classified_type: 'tutorial', hook_style: 'question', engagement_rate: 7, duration_seconds: 35, upload_date: '2026-02-14' }),
  play('t3', { classified_type: 'tutorial', hook_style: 'question', engagement_rate: 8, duration_seconds: 52, upload_date: '2026-10-01' }),
  // Reviews: 2, 3, 4.
  play('r1', { classified_type: 'review', hook_style: 'bold-claim', engagement_rate: 2, duration_seconds: 90, upload_date: '2026-06-01' }),
  play('r2', { classified_type: 'review', hook_style: 'bold-claim', engagement_rate: 3, duration_seconds: 120, upload_date: '2026-07-01' }),
  play('r3', { classified_type: 'review', hook_style: 'bold-claim', engagement_rate: 4, duration_seconds: 100, upload_date: '2026-08-01' }),
  // A story on two videos only: under the floor, however high.
  play('s1', { classified_type: 'story', hook_style: 'personal-story', engagement_rate: 30, duration_seconds: 20 }),
  play('s2', { classified_type: 'story', hook_style: 'personal-story', engagement_rate: 28, duration_seconds: 25 }),
  // Reddit: its rate is against a ceiling and is never read.
  play('rd1', { platform: 'reddit', classified_type: 'review', hook_style: 'bold-claim', engagement_rate: 99 }),
  play('rd2', { platform: 'reddit', classified_type: 'review', hook_style: 'bold-claim', engagement_rate: 98 }),
  play('rd3', { platform: 'reddit', classified_type: 'review', hook_style: 'bold-claim', engagement_rate: 97 }),
]

describe('choosePlay: the playbook\'s own reading over the market\'s videos on the question, whenever published', () => {
  it('picks the format and the opening with the highest median at or above the floor multiple, against the question\'s own median video', () => {
    const p = choosePlay(ON_QUESTION, '2026-10-01')
    // Rated (Reddit out): 6 7 8 2 3 4 30 28, median 6.5. Tutorial 7 / 6.5.
    expect(p.format).toBe('tutorial')
    expect(p.formatMultiple).toBe(1.1)
    expect(p.opening).toBe('question')
    expect(p.openingMultiple).toBe(1.1)
    expect(p.videos).toBe(11)
    expect(p.rated).toBe(8)
  })

  it('reads every video handed in, published in any month (a month slice would leave the tutorials under the floor)', () => {
    const p = choosePlay(ON_QUESTION, '2026-10-01')
    expect(p.format).not.toBeNull()
  })

  it('chooses nothing where no group clears three rated videos, or none runs above the typical video', () => {
    expect(choosePlay(ON_QUESTION.filter((v) => v.classified_type !== 'tutorial'), '2026-10-01').format).toBeNull()
    expect(choosePlay([], '2026-10-01')).toMatchObject({ format: null, formatMultiple: null, opening: null, openingMultiple: null, length: null, videos: 0, rated: 0 })
    expect(POST_IDEA_MIN_MULTIPLE).toBe(1.1)
  })

  it('bestRow: the highest median, then the most rated videos, then the key', () => {
    const row = (key: string, median: number, n: number, multiple: number) => ({ key, label: key, value: { k: n, n: 10 }, pct: null, engagement: { median, n, band: null }, multiple })
    expect(bestRow({ rows: [row('b', 5, 3, 1.5), row('a', 5, 3, 1.5), row('c', 5, 4, 1.5)] })?.key).toBe('c')
    expect(bestRow({ rows: [row('b', 5, 3, 1.5), row('a', 5, 3, 1.5)] })?.key).toBe('a')
    expect(bestRow({ rows: [row('a', 5, 3, 1.05)] })).toBeNull()
  })
})

describe('ideaLength: how long the post should run, from code', () => {
  const MORE: PlayVideo[] = [
    ...ON_QUESTION,
    play('t4', { classified_type: 'tutorial', engagement_rate: 9, duration_seconds: 44 }),
    play('t5', { classified_type: 'tutorial', engagement_rate: 10, duration_seconds: 31 }),
    play('t6', { classified_type: 'tutorial', engagement_rate: 6.6, duration_seconds: 600 }),
  ]

  it('reads the middle half of the chosen format\'s short-form durations among the videos at or above the typical response', () => {
    expect([LENGTH_MIN_VIDEOS, LENGTH_MAX_SECONDS]).toEqual([5, 180])
    // Tutorials at or above 6.5 and short: t2 35, t3 52, t4 44, t5 31; four,
    // under the floor (t6 runs ten minutes and is another post). So any
    // format: 20, 25, 31, 35, 44, 52; quartiles at ranks 2 and 5.
    expect(ideaLength(MORE, 'tutorial', 6.5)).toEqual({ fromSeconds: 25, toSeconds: 45, videos: 6, basis: 'question' })
    // With the typical response lower, five tutorials count: 31 35 40 44 52.
    expect(ideaLength(MORE, 'tutorial', 5)).toEqual({ fromSeconds: 35, toSeconds: 45, videos: 5, basis: 'format' })
  })

  it('is null where too few videos carry a duration, or there is no typical response', () => {
    expect(ideaLength(MORE.map((v) => ({ ...v, duration_seconds: 0 })), 'tutorial', 5)).toBeNull()
    expect(ideaLength(ON_QUESTION, 'tutorial', 6.5)).toBeNull()
    expect(ideaLength(MORE, 'tutorial', null)).toBeNull()
  })

  it('rounds to five seconds under a minute and fifteen above', () => {
    expect([roundSeconds(2), roundSeconds(37), roundSeconds(58), roundSeconds(68), roundSeconds(100), roundSeconds(140)]).toEqual([5, 35, 60, 75, 105, 135])
  })
})

describe('withHandles', () => {
  it('names the conversations Q1… in rank order and the comments c1… across the set, and counts what was asked', () => {
    const base = { themeId: 't', label: 'l', description: null, weekVideos: 3, lenientVideos: 3, touch: 'none' as const, play: choosePlay([], '2026-10-01') }
    const out = withHandles([
      { ...base, themeId: 'a', comments: [{ commentId: 'x1', videoId: 'v1', text: 'a?' }, { commentId: 'x2', videoId: 'v1', text: 'b?' }] },
      { ...base, themeId: 'b', comments: [{ commentId: 'y1', videoId: 'v2', text: 'c?' }] },
    ])
    expect(out.map((c) => c.handle)).toEqual(['Q1', 'Q2'])
    expect(out.flatMap((c) => c.comments.map((x) => x.handle))).toEqual(['c1', 'c2', 'c3'])
    expect(out[0].asked).toEqual({ comments: 2, videos: 1 })
  })
})
