import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { gateFor } from '../quote-context'
import { quoteGate, type QuoteVideo } from '../quote-gate'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import { flattenEvidence, type DatedEvidence } from './evidence'
import { HEADLINE_MAX_MAKER_SHARE } from '../pages/overview'
import {
  buildWeekPool, contradictsDominant, countsForTheWeek, dominantKindOf, invertMembers, isMakerLed, isOwnAccount, judgeTheme,
  lensesOf, makerShareOf, POOL_CAP, rankEligible, SUBJECT_MIN_MEMBERS, SUBJECT_SHARE_FLOOR, subjectForTheme,
  type PoolFacts, type PoolHead, type PoolTheme, type ThemeJudgement,
} from './pool'

// The week pool's rules, on fixtures (plan T1). No database: the loader's
// reads are the product's own readers, and what is tested here is what the
// pool DOES with what they return: who is eligible, in what order, which
// videos a maker's post takes out, which subject a theme belongs to, and that
// no comment's words leave the pool.

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
/** One citation, dated in the window, on a category video on the read lane
 *  unless told otherwise. */
function ev(o: {
  insight: string
  video: number
  text: string
  kind?: string
  description?: string
  rank?: number
  author?: string | null
  audience?: string
  lane?: string | null
  context?: Partial<QuoteVideo> | null
}): DatedEvidence {
  seq += 1
  const context = o.context === null ? null : bagVideo(o.video, o.context ?? {})
  return {
    insightId: o.insight,
    kind: o.kind ?? 'pain_point',
    description: o.description ?? `Paraphrase of ${o.insight}`,
    evidenceId: `e${String(seq).padStart(4, '0')}`,
    rank: o.rank ?? 1,
    commentId: `c${seq}`,
    commentDate: '2026-09-24T00:00:00+00:00',
    author: o.author ?? `viewer${seq}`,
    text: o.text,
    lang: 'en',
    english: null,
    video: {
      uuid: `v-${o.video}`,
      platform: 'youtube',
      videoId: `yt${o.video}`,
      audience: o.audience ?? INDUSTRY_AUDIENCE,
      lane: o.lane === undefined ? 'full' : o.lane,
      accountName: context?.accountName ?? `Creator ${o.video}`,
    },
    context,
  }
}

const COMFORT: PoolTheme = {
  themeId: 'th-comfort',
  label: 'Comfort depends on structure and straps',
  description: 'People say a pack is comfortable when its straps and back panel carry the load.',
  kind: 'pain_point',
  matchKind: 'strong',
  memberIds: ['i1', 'i2', 'i3', 'i4', 'i5'],
  weekVideos: 7,
}

// Lines that pass the strict comfort gate (they name a carry good and speak to
// straps, shoulders, the back), and lines that fail it for a named reason.
const PASS = [
  'The straps on this backpack dig into my shoulders after an hour of walking.',
  'My back hurts when the backpack is full, the shoulder straps need more padding.',
  'The hip belt on this backpack is too thin and my hips are sore by the end of the day.',
  'This backpack has no load lifters so the weight pulls on my shoulders all day.',
]
const OFF_TOPIC = 'These jeans fit perfectly and the fabric is soft on my legs.'

describe('the strict gate is the product quote gate (fixtures sanity)', () => {
  const strict = gateFor(SEALAND, { claim: COMFORT.label, requireRelevance: true, kind: 'pain_point' })
  it('passes the comfort lines and refuses the off-market one', () => {
    for (const text of PASS) expect(quoteGate({ text, lang: 'en', english: null, video: bagVideo(1) }, strict)).toMatchObject({ ok: true })
    expect(quoteGate({ text: OFF_TOPIC, lang: 'en', english: null, video: bagVideo(1) }, strict)).toMatchObject({ ok: false, reason: 'off_topic' })
  })
})

describe('lensesOf', () => {
  it('maps kinds to departments, product apart, leadership always', () => {
    expect(lensesOf([])).toEqual(['leadership'])
    expect(lensesOf(['purchase_intent'])).toEqual(['sales', 'leadership'])
    expect(lensesOf(['objection', 'buying_trigger'])).toEqual(['sales', 'leadership'])
    expect(lensesOf(['pain_point', 'feature_request'])).toEqual(['product', 'leadership'])
    expect(lensesOf(['question'])).toEqual(['content', 'leadership'])
    expect(lensesOf(['praise', 'switching_signal', 'demographic_signal'])).toEqual(['marketing', 'leadership'])
    // A fixed order whatever the kinds' order; an unknown kind reaches no one.
    expect(lensesOf(['question', 'praise', 'misinformation', 'objection', 'pain_point'])).toEqual(['sales', 'marketing', 'content', 'product', 'leadership'])
  })
})

describe('judgeTheme: eligibility', () => {
  it('counts distinct videos with at least one quote the strict gate passes', () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: PASS[0] }),
      ev({ insight: 'i1', video: 1, text: PASS[1] }), // same video: one video
      ev({ insight: 'i2', video: 2, text: PASS[2] }),
      ev({ insight: 'i3', video: 3, text: PASS[3] }),
      ev({ insight: 'i4', video: 4, text: OFF_TOPIC }), // fails the gate: not counted
      ev({ insight: 'other', video: 5, text: PASS[0] }), // not a member of the theme
    ]
    const j = judgeTheme(SEALAND, COMFORT, evidence)
    expect(j.gatedVideos).toBe(3)
    expect(rankEligible([j])).toHaveLength(1)
  })

  it('a theme on two gated videos is not eligible', () => {
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 1, text: PASS[0] }),
      ev({ insight: 'i2', video: 2, text: PASS[1] }),
      ev({ insight: 'i3', video: 3, text: OFF_TOPIC }),
    ])
    expect(j.gatedVideos).toBe(2)
    expect(rankEligible([j])).toEqual([])
  })

  it('counts the category on the read lane only', () => {
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 1, text: PASS[0] }),
      ev({ insight: 'i2', video: 2, text: PASS[1], audience: CLIENT_AUDIENCE }),
      ev({ insight: 'i3', video: 3, text: PASS[2], audience: 'competitor:Osprey' }),
      ev({ insight: 'i4', video: 4, text: PASS[3], lane: 'claims_only' }),
    ])
    expect(j.gatedVideos).toBe(1)
  })
})

describe('judgeTheme: the maker exclusion', () => {
  it('a video a maker posted never counts, even where its lines would pass', () => {
    const maker = { segment: 'maker' }
    const evidence = [
      ev({ insight: 'i1', video: 1, text: PASS[0], context: maker }),
      ev({ insight: 'i2', video: 2, text: PASS[1], context: maker }),
      ev({ insight: 'i3', video: 3, text: PASS[2], context: maker }),
      ev({ insight: 'i4', video: 4, text: PASS[3] }),
    ]
    expect(evidence.filter(countsForTheWeek)).toHaveLength(1)
    const j = judgeTheme(SEALAND, COMFORT, evidence)
    expect(j.gatedVideos).toBe(1)
    expect(j.quoteRefs.map((q) => q.thread)).toEqual(['youtube::yt4'])
    expect(rankEligible([j])).toEqual([])
  })

  it("a maker's own words on an unlabelled video are refused by the gate's maker rule", () => {
    const handmade = { segment: null, caption: 'I made this backpack by hand, handmade leather bag tutorial' }
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 1, text: PASS[0], context: handmade }),
      ev({ insight: 'i2', video: 2, text: PASS[1], context: handmade }),
      ev({ insight: 'i3', video: 3, text: PASS[2], context: handmade }),
    ])
    expect(j.gatedVideos).toBe(0)
  })
})

describe('judgeTheme: quotes, kinds and notes', () => {
  it('offers at most three refs, one per thread, best first, never the words', () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: PASS[0], rank: 2 }),
      ev({ insight: 'i1', video: 1, text: PASS[1], rank: 1 }),
      ev({ insight: 'i2', video: 2, text: PASS[2] }),
      ev({ insight: 'i3', video: 3, text: PASS[3] }),
      ev({ insight: 'i4', video: 4, text: PASS[0].replace('an hour', 'two hours') }),
    ]
    const j = judgeTheme(SEALAND, COMFORT, evidence)
    expect(j.quoteRefs).toHaveLength(3)
    expect(new Set(j.quoteRefs.map((q) => q.thread)).size).toBe(3)
    for (const q of j.quoteRefs) {
      expect(q.text).toBe('')
      expect(q.ref).toMatch(/^e:e\d{4}$/)
      expect(q.date).toBe('2026-09-24')
      expect(q.platform).toBe('youtube')
    }
  })

  it("never offers the video's own account answering under its post, but still counts the video", () => {
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 1, text: PASS[0], author: 'Creator 1' }),
      ev({ insight: 'i2', video: 2, text: PASS[1] }),
      ev({ insight: 'i3', video: 3, text: PASS[2] }),
    ])
    expect(isOwnAccount({ author: '@creator1', video: { accountName: 'Creator 1' } as DatedEvidence['video'] })).toBe(true)
    expect(j.gatedVideos).toBe(3)
    expect(j.quoteRefs.map((q) => q.thread).sort()).toEqual(['youtube::yt2', 'youtube::yt3'])
  })

  it('reads kinds and notes off the gated material only', () => {
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 1, text: PASS[0], kind: 'pain_point', description: 'Straps dig into shoulders on long walks.' }),
      ev({ insight: 'i2', video: 2, text: PASS[1], kind: 'pain_point', description: 'Straps dig into shoulders on long walks.' }),
      ev({ insight: 'i3', video: 3, text: PASS[2], kind: 'feature_request', description: 'Wants a thicker hip belt.' }),
      ev({ insight: 'i4', video: 4, text: OFF_TOPIC, kind: 'praise', description: 'Loves the jeans.' }),
    ])
    expect(j.kinds).toEqual(['pain_point', 'feature_request'])
    // One per wording; nothing from the line the gate refused.
    expect(j.notes).toEqual(['Straps dig into shoulders on long walks.', 'Wants a thicker hip belt.'])
  })
})

const judged = (id: string, gatedVideos: number, weekVideos: number, over: Partial<ThemeJudgement> = {}): ThemeJudgement => ({
  theme: { ...COMFORT, themeId: id, label: `Theme ${id}`, weekVideos },
  gatedVideos,
  gatedVideoIds: Array.from({ length: gatedVideos }, (_, i) => `v-${id}-${i}`),
  quoteRefs: [],
  kinds: ['question'],
  dominantKind: 'question',
  notes: [],
  seenVideos: weekVideos,
  makerVideos: 0,
  ...over,
})

describe('rankEligible', () => {
  it('ranks by gated videos, then the week, then the registry id; drops what is under three', () => {
    const ranked = rankEligible([
      judged('b', 3, 9), judged('a', 3, 9), judged('c', 5, 5), judged('d', 3, 12), judged('e', 2, 40),
    ])
    expect(ranked.map((j) => j.theme.themeId)).toEqual(['c', 'd', 'a', 'b'])
  })
})

const HEAD: PoolHead = {
  clientId: SEALAND,
  runId: 'run-27',
  window: { from: '2026-09-20T04:18:00+00:00', to: '2026-09-27T04:03:00+00:00' },
  month: '2026-09-01',
  weekVideos: 262,
  weekComments: 4528,
  monthVideos: 814,
}
const NO_FACTS: PoolFacts = { monthK: new Map(), flags: new Map(), subjectOf: new Map() }

describe('buildWeekPool', () => {
  it('caps at twelve, numbers in rank order, and judges thin on every eligible theme', () => {
    const many = rankEligible(Array.from({ length: 15 }, (_, i) => judged(`t${String(i).padStart(2, '0')}`, 20 - i, 30)))
    const pool = buildWeekPool(HEAD, many, NO_FACTS)
    expect(pool.candidates).toHaveLength(POOL_CAP)
    expect(pool.candidates.map((c) => c.id)).toEqual(Array.from({ length: 12 }, (_, i) => `C${i + 1}`))
    expect(pool.candidates[0].themeId).toBe('t00')
    expect(pool.thin).toBe(false)
    expect(buildWeekPool(HEAD, rankEligible([judged('x', 4, 4), judged('y', 3, 3)]), NO_FACTS).thin).toBe(true)
    expect(buildWeekPool(HEAD, [], NO_FACTS)).toMatchObject({ candidates: [], thin: true, monthVideos: 814 })
  })

  it("marks new by the existing themeFlags rule, never below the floor or for a regrouped identity", () => {
    const ranked = rankEligible([judged('new', 6, 9), judged('small', 5, 9), judged('regrouped', 4, 9), judged('heard', 3, 9)])
    const pool = buildWeekPool(HEAD, ranked, {
      monthK: new Map([['new', 12], ['small', 6], ['regrouped', 15], ['heard', 20]]),
      flags: new Map([
        ['new', { prevK: 0, heardBefore: false, regrouped: false }],
        ['small', { prevK: 0, heardBefore: false, regrouped: false }],
        ['regrouped', { prevK: 0, heardBefore: false, regrouped: true }],
        ['heard', { prevK: 4, heardBefore: true, regrouped: false }],
      ]),
      subjectOf: new Map(),
    })
    expect(Object.fromEntries(pool.candidates.map((c) => [c.themeId, c.isNew]))).toEqual({ new: true, small: false, regrouped: false, heard: false })
    expect(pool.candidates.find((c) => c.themeId === 'new')).toMatchObject({ monthK: 12, monthN: 814 })
  })
})

describe('subjectForTheme', () => {
  const subjectsOf = invertMembers(new Map([
    ['comfort', ['i1', 'i2', 'i3']],
    ['durability', ['i3', 'i4', 'i5']],
    ['price', ['p1', 'p2', 'p3']],
  ]))
  const others = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`)

  it('the rule, pinned: the most members, at least three of them and at least fifteen per cent', () => {
    expect(SUBJECT_MIN_MEMBERS).toBe(3)
    expect(SUBJECT_SHARE_FLOOR).toBe(0.15)
  })

  it('names the subject holding the most of the member insights', () => {
    expect(subjectForTheme(['i1', 'i2', 'i3', 'i4', 'x1'], subjectsOf)).toBe('comfort') // 3 of 5 against 2
  })

  it("names a subject on three of sixteen: membership's low recall ('Price feels hard to justify', 27 Sep)", () => {
    expect(subjectForTheme(['p1', 'p2', 'p3', ...others(13)], subjectsOf)).toBe('price') // 3 of 16, 19%
  })

  it('names none under three members, however large the share', () => {
    expect(subjectForTheme(['i1', 'i2', 'x1'], subjectsOf)).toBeNull() // 2 of 3
    expect(subjectForTheme(['i1', 'i2'], subjectsOf)).toBeNull() // 2 of 2
    expect(subjectForTheme([], subjectsOf)).toBeNull()
  })

  it('names none under fifteen per cent, however many members', () => {
    expect(subjectForTheme(['p1', 'p2', 'p3', ...others(18)], subjectsOf)).toBeNull() // 3 of 21, 14%
    expect(subjectForTheme(['p1', 'p2', 'p3', ...others(17)], subjectsOf)).toBe('price') // 3 of 20, 15%
  })

  it("counts a member once, and breaks a tie by the subjects' own order", () => {
    const tie = ['i1', 'i2', 'i3', 'i3', 'i4', 'i5', 'x1'] // comfort i1 i2 i3, durability i3 i4 i5: 3 each of 6
    expect(subjectForTheme(tie, subjectsOf, ['durability', 'comfort'])).toBe('durability')
    expect(subjectForTheme(tie, subjectsOf, ['comfort', 'durability'])).toBe('comfort')
  })
})

describe('the maker-led exclusion (T1/T2 fixups)', () => {
  it("reuses the front page's line rather than a copy of its number", () => {
    expect(isMakerLed({ seenVideos: 100, makerVideos: Math.floor(HEADLINE_MAX_MAKER_SHARE * 100) })).toBe(false)
    expect(isMakerLed({ seenVideos: 100, makerVideos: Math.floor(HEADLINE_MAX_MAKER_SHARE * 100) + 1 })).toBe(true)
    expect(makerShareOf({ seenVideos: 0, makerVideos: 0 })).toBe(0)
  })

  it("drops 'Admiration for handmade bag design' (25 of its 42 window videos makers') however many gated videos it has", () => {
    const handmade = judged('handmade', 9, 42, { seenVideos: 42, makerVideos: 25 })
    const market = judged('market', 3, 12, { seenVideos: 12, makerVideos: 3 }) // exactly a quarter: kept
    expect(rankEligible([handmade, market]).map((j) => j.theme.themeId)).toEqual(['market'])
  })

  it("judgeTheme counts the window's makers against every category read-lane video it saw", () => {
    const maker = { segment: 'maker' }
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 1, text: PASS[0], context: maker }),
      ev({ insight: 'i2', video: 2, text: PASS[1], context: maker }),
      ev({ insight: 'i3', video: 3, text: PASS[2] }),
      ev({ insight: 'i4', video: 4, text: PASS[3] }),
      ev({ insight: 'i5', video: 5, text: PASS[0].replace('an hour', 'a day') }),
      ev({ insight: 'i5', video: 6, text: PASS[1], audience: 'competitor:Osprey', context: maker }), // not the category
    ])
    expect(j).toMatchObject({ seenVideos: 5, makerVideos: 2, gatedVideos: 3 })
    expect(isMakerLed(j)).toBe(true) // 2 of 5
    expect(rankEligible([j])).toEqual([])
  })
})

describe('the dominant kind and kind-matched quotes (T1/T2 fixups)', () => {
  it('is the kind on the most videos, ties to the theme\'s own kind, then by name', () => {
    const e = (kind: string, video: number) => ev({ insight: 'i1', video, text: PASS[0], kind })
    expect(dominantKindOf([e('praise', 1), e('praise', 1), e('objection', 2), e('objection', 3)])).toBe('objection') // 2 videos to 1
    expect(dominantKindOf([e('praise', 1), e('objection', 2)], 'praise')).toBe('praise')
    expect(dominantKindOf([e('praise', 1), e('objection', 2)])).toBe('objection')
    expect(dominantKindOf([])).toBeNull()
  })

  it('praise and objection or pain point contradict each other; other kinds contradict nothing', () => {
    expect(contradictsDominant('objection', 'praise')).toBe(true)
    expect(contradictsDominant('pain_point', 'praise')).toBe(true)
    expect(contradictsDominant('praise', 'objection')).toBe(true)
    expect(contradictsDominant('praise', 'pain_point')).toBe(true)
    expect(contradictsDominant('question', 'praise')).toBe(false)
    expect(contradictsDominant('feature_request', 'pain_point')).toBe(false)
    expect(contradictsDominant('praise', null)).toBe(false)
  })

  // 'Cotopaxi praised for practical travel' printed objection quotes under a praise label.
  const PRAISED: PoolTheme = { ...COMFORT, themeId: 'th-praised', label: 'Travel backpack praised for practical travel', kind: 'praise' }
  const PRAISE_LINES = [
    'This travel backpack is so practical, the laptop sleeve and the pockets make airport security easy.',
    'I love how practical this backpack is for travel, everything has its own pocket.',
    'Best travel backpack I have owned, it opens like a suitcase and fits every carry on.',
  ]
  const OBJECTION_LINE = 'This backpack is too expensive for what it is, I would not pay that for a travel bag.'

  it('never lists a quote of a contradicting kind, even when it scores best, and prefers the dominant kind', () => {
    const evidence = [
      ev({ insight: 'o1', video: 1, text: OBJECTION_LINE, kind: 'objection' }),
      ev({ insight: 'q1', video: 2, text: 'Does this travel backpack fit under the seat on a budget airline?', kind: 'question' }),
      ev({ insight: 'p1', video: 3, text: PRAISE_LINES[0], kind: 'praise' }),
      ev({ insight: 'p2', video: 4, text: PRAISE_LINES[1], kind: 'praise' }),
      ev({ insight: 'p3', video: 5, text: PRAISE_LINES[2], kind: 'praise' }),
    ]
    const j = judgeTheme(SEALAND, { ...PRAISED, memberIds: ['o1', 'q1', 'p1', 'p2', 'p3'] }, evidence)
    expect(j.dominantKind).toBe('praise')
    const listed = j.quoteRefs.map((q) => evidence.find((e) => `e:${e.evidenceId}` === q.ref)?.kind)
    // Without the rule the objection took a place: the gate scores it with the
    // question, above the third praise line, which the evidence's order puts last.
    expect(listed).toEqual(['praise', 'praise', 'praise'])
    // The objection still counts toward the theme's evidence: only the quote is kind-matched.
    expect(j.gatedVideoIds).toContain('v-1')
  })

  it('fills from a kind that does not contradict when the dominant kind runs out', () => {
    const evidence = [
      ev({ insight: 'p1', video: 1, text: PRAISE_LINES[0], kind: 'praise' }),
      ev({ insight: 'p2', video: 2, text: PRAISE_LINES[1], kind: 'praise' }),
      ev({ insight: 'q1', video: 3, text: 'Does this travel backpack fit under the seat on a budget airline?', kind: 'question' }),
      ev({ insight: 'o1', video: 4, text: OBJECTION_LINE, kind: 'objection' }),
    ]
    const j = judgeTheme(SEALAND, { ...PRAISED, memberIds: ['p1', 'p2', 'q1', 'o1'] }, evidence)
    const kinds = j.quoteRefs.map((q) => evidence.find((e) => `e:${e.evidenceId}` === q.ref)?.kind)
    // The objection scores as well as the question; the dominant kind's two
    // come first and the question fills the third place.
    expect(kinds).toEqual(['praise', 'praise', 'question'])
    expect(new Set(j.quoteRefs.map((q) => q.thread)).size).toBe(j.quoteRefs.length)
  })

  it('carries the gated videos as ids, sorted, their count the gated count', () => {
    const j = judgeTheme(SEALAND, COMFORT, [
      ev({ insight: 'i1', video: 3, text: PASS[0] }),
      ev({ insight: 'i2', video: 1, text: PASS[1] }),
      ev({ insight: 'i3', video: 2, text: PASS[2] }),
      ev({ insight: 'i4', video: 9, text: OFF_TOPIC }),
    ])
    expect(j.gatedVideoIds).toEqual(['v-1', 'v-2', 'v-3'])
    expect(j.gatedVideos).toBe(3)
    const pool = buildWeekPool(HEAD, rankEligible([j]), NO_FACTS)
    expect(pool.candidates[0]).toMatchObject({ gatedVideoIds: ['v-1', 'v-2', 'v-3'], dominantKind: 'pain_point' })
  })
})

describe('the no-comment-text rule', () => {
  it('no comment text leaves the pool: quotes are refs with empty text, notes are descriptions', () => {
    const evidence = [
      ev({ insight: 'i1', video: 1, text: PASS[0], description: 'Straps dig in on long walks.' }),
      ev({ insight: 'i2', video: 2, text: PASS[1], description: 'Back hurts under a full load.' }),
      ev({ insight: 'i3', video: 3, text: PASS[2], description: 'Hip belt too thin.' }),
      ev({ insight: 'i4', video: 4, text: PASS[3], description: 'No load lifters.' }),
    ]
    const pool = buildWeekPool(HEAD, rankEligible([judgeTheme(SEALAND, COMFORT, evidence)]), NO_FACTS)
    expect(pool.candidates).toHaveLength(1)
    const json = JSON.stringify(pool)
    for (const e of evidence) {
      expect(json).not.toContain(e.text)
      // Not even a fragment long enough to be a voice.
      expect(json).not.toContain(e.text.slice(0, 24))
    }
    for (const c of pool.candidates) {
      for (const q of c.quoteRefs) expect(q.text).toBe('')
      expect(c.notes.every((n) => evidence.some((e) => e.description === n))).toBe(true)
    }
  })
})

describe('flattenEvidence', () => {
  const video = { id: 'v-1', platform: 'youtube', video_id: 'yt1', analyzed_lane: 'full', is_client: false, is_competitor: true, competitor_name: 'Cotopaxi', account_name: 'Creator 1' }
  const comment = (id: string, videoId: string, date: string | null = '2026-09-24T00:00:00+00:00') => ({ id, comment_date: date, platform: 'youtube', video_id: videoId, author: 'viewer' })

  it("keeps a citation on the insight's own video, files it by the videos' CASE, and drops what cannot be placed", () => {
    const rows = flattenEvidence([
      {
        id: 'i1', category: 'question', description: ' Asks about the size. ', videos: video,
        insight_evidence: [
          { id: 'e1', quote: 'Is this the 30L?', relevance_rank: null, comment_id: 'c1', comments: comment('c1', 'yt1') },
          { id: 'e2', quote: 'Other thread', relevance_rank: 1, comment_id: 'c2', comments: comment('c2', 'yt9') }, // another video
          { id: 'e3', quote: 'Undated', relevance_rank: 1, comment_id: 'c3', comments: comment('c3', 'yt1', null) },
        ],
      },
      { id: 'i2', category: 'praise', description: 'x', videos: null, insight_evidence: [{ id: 'e4', quote: 'Lovely', relevance_rank: 1, comment_id: 'c4', comments: comment('c4', 'yt1') }] },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      insightId: 'i1', kind: 'question', description: 'Asks about the size.', evidenceId: 'e1', rank: 99,
      video: { uuid: 'v-1', audience: 'competitor:Cotopaxi', lane: 'full', videoId: 'yt1' },
    })
  })
})
