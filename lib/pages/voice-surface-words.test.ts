import { describe, expect, it } from 'vitest'

import { pooledDenominators } from '../reading/market'
import {
  WORDS_PER_KIND,
  WORDS_SHORTLIST_PER_THEME,
  buildWords,
  firstExcerpt,
  marketKindVideos,
  shortlistWords,
  wordsOrder,
  type WordsCandidate,
  type WordsTheme,
} from './voice-surface-words'

// C5 · The market's words (market-first WP3.8). REAL NUMBERS: every kind count,
// rank, like count, date and quote below is staging's (zfmxrrugaihxpubunleu,
// data to 20 Sep), read on 27 Sep for Sealand's September: the kind rows per
// audience, and the bank's candidates off the themed update b67b56de. Ids are
// shortened to their first eight characters; commenters' handles are not
// copied (a commenter is never identified), so `author` is a stand-in wherever
// the own-account rule is not what a test is about.

const SEP = '2026-09-01'
const RIVALS = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']

const KIND_ROWS = [
  ...([['feature_request', 146], ['objection', 107], ['pain_point', 250], ['praise', 449], ['purchase_intent', 371], ['question', 317]] as const)
    .map(([kind, videos]) => ({ month: SEP, audience: 'industry-other', kind, videos })),
  ...([
    ['competitor:Cotopaxi', 'feature_request', 1], ['competitor:Cotopaxi', 'objection', 3], ['competitor:Cotopaxi', 'pain_point', 5],
    ['competitor:Cotopaxi', 'praise', 7], ['competitor:Cotopaxi', 'purchase_intent', 5], ['competitor:Cotopaxi', 'question', 8],
    ['competitor:Freitag', 'praise', 4], ['competitor:Freitag', 'purchase_intent', 2], ['competitor:Freitag', 'question', 3],
    ['competitor:Patagonia', 'feature_request', 3], ['competitor:Patagonia', 'objection', 4], ['competitor:Patagonia', 'pain_point', 5],
    ['competitor:Patagonia', 'praise', 3], ['competitor:Patagonia', 'purchase_intent', 2], ['competitor:Patagonia', 'question', 4],
    ['competitor:The North Face', 'feature_request', 1], ['competitor:The North Face', 'objection', 1], ['competitor:The North Face', 'pain_point', 3],
    ['competitor:The North Face', 'praise', 5], ['competitor:The North Face', 'purchase_intent', 1], ['competitor:The North Face', 'question', 2],
  ] as const).map(([audience, kind, videos]) => ({ month: SEP, audience, kind, videos })),
]
const DENOMS = [
  { month: SEP, audience: 'industry-other', videos: 625, comments: 15792 },
  { month: SEP, audience: 'competitor:Cotopaxi', videos: 12, comments: 206 },
  { month: SEP, audience: 'competitor:Freitag', videos: 6, comments: 40 },
  { month: SEP, audience: 'competitor:Patagonia', videos: 5, comments: 122 },
  { month: SEP, audience: 'competitor:The North Face', videos: 6, comments: 44 },
]

// Four of the board's fourteen rows (staging's September), with their kinds
// and videos.
const THEMES = new Map<string, WordsTheme>([
  ['4c312c8b', { label: 'More colors and variants wanted', kind: 'feature_request', k: 20 }],
  ['0c0784d8', { label: 'Frustration with bag weight', kind: 'pain_point', k: 11 }],
  ['daf7426d', { label: 'Comfort problems when carrying', kind: 'pain_point', k: 10 }],
  ['f329a7dd', { label: 'Confusion about airline size rules', kind: 'question', k: 12 }],
])

/** A staging candidate, as `loadWordsCandidates` returns it. */
function cand(over: Partial<WordsCandidate> & Pick<WordsCandidate, 'evidenceId' | 'commentId' | 'themeId' | 'insightKind' | 'quote'>): WordsCandidate {
  return {
    rank: 1,
    likes: 0,
    lang: 'en',
    english: null,
    commentDate: '2026-09-12T00:00:00+00:00',
    author: 'a commenter',
    videoAccount: 'r/onebag',
    platform: 'reddit',
    nativeCommentId: null,
    videoId: null,
    videoUrl: null,
    resolves: true,
    segment: 'market',
    ...over,
  }
}

// feature_request on "More colors and variants wanted" (rank 1 each).
const PINK = cand({ evidenceId: 'af769f6b', commentId: '2b0c1fa4', themeId: '4c312c8b', insightKind: 'feature_request', likes: 78, commentDate: '2026-09-19T00:00:00+00:00', platform: 'tiktok', videoAccount: 'SLIPPERS/SHOES/BAGS IN IBADAN.', quote: 'If you made it in pink and a bigger size I would buy it immediately 😭' })
const BLACK = cand({ evidenceId: '61e9691e', commentId: '422a619f', themeId: '4c312c8b', insightKind: 'feature_request', likes: 3, platform: 'instagram', videoAccount: 'maya.vindish', quote: 'Does it exist also on black ?' })
// pain_point, rank 1: the bag-weight theme's, the comfort theme's, and a pain
// insight's excerpt inside the airline-size (question) theme.
const WEIGHT = cand({ evidenceId: '3e6546d0', commentId: '2d73a9a0', themeId: '0c0784d8', insightKind: 'pain_point', likes: 2, commentDate: '2026-09-17T00:00:00+00:00', quote: 'I want this pack, but it weighs almost 3.5 lbs? Is that right?' })
const BENTO = cand({ evidenceId: 'b02a70b2', commentId: '837b34e9', themeId: '0c0784d8', insightKind: 'pain_point', likes: 1, commentDate: '2026-09-14T00:00:00+00:00', platform: 'youtube', videoAccount: 'Travel Tips by Laurie', quote: 'I bought a bento bag and was so excited to take it on my trip to Northern Europe. However it was so so heavy to carry that I will not use it on a long trip.' })
const SHOULDER = cand({ evidenceId: 'ef6c9169', commentId: '17944403', themeId: 'daf7426d', insightKind: 'pain_point', likes: 1, platform: 'youtube', videoAccount: '조은fine', lang: 'ko', english: "If a lot of stuff goes into the bag, doesn't the shoulder get heavy??", quote: '가방 물건 많이 들어가게 되면 어깨가 무겁지는 않나여??' })
const BIN = cand({ evidenceId: '2bd2f531', commentId: '4a13f627', themeId: 'f329a7dd', insightKind: 'pain_point', likes: 7, commentDate: '2026-09-08T00:00:00+00:00', videoAccount: 'r/clinicalresearch', quote: 'It also fits in EVERY overhead bin, even the smallest regional jet, which is amazing.' })

const KIND_VIDEOS = marketKindVideos(KIND_ROWS, pooledDenominators(DENOMS, RIVALS), SEP, RIVALS)

function build(candidates: WordsCandidate[], over: Partial<Parameters<typeof buildWords>[0]> = {}) {
  return buildWords({ month: SEP, candidates, kindVideos: KIND_VIDEOS, themes: THEMES, anchors: null, segments: 'measured', ...over })
}
const card = (b: ReturnType<typeof build>, kind: string) => b.kinds.find((k) => k.kind === kind)
const texts = (b: ReturnType<typeof build>, kind: string) => card(b, kind)?.quotes.map((q) => q.quote.text) ?? []

describe('marketKindVideos (decision E: the kinds on the pooled market)', () => {
  it('adds the tracked brands’ audiences to the category’s', () => {
    expect(Object.fromEntries(KIND_VIDEOS)).toEqual({
      praise: 468, purchase_intent: 381, question: 334, pain_point: 263, feature_request: 151, objection: 115,
    })
  })

  it('reads 0 for a kind the month read none of, and nothing for a month not read', () => {
    const noObjection = marketKindVideos(KIND_ROWS.filter((r) => r.kind !== 'objection'), pooledDenominators(DENOMS, RIVALS), SEP, RIVALS)
    expect(noObjection.get('objection')).toBe(0)
    expect(marketKindVideos([], pooledDenominators(DENOMS, RIVALS), SEP, RIVALS).size).toBe(0)
  })
})

describe('buildWords: the cards', () => {
  it('draws one card per kind at 10 videos or more, biggest first, in the market’s words', () => {
    const b = build([])
    expect(b.kinds.map((k) => [k.label, k.videos])).toEqual([
      ['Praising it', 468], ['Ready to buy', 381], ['Asking how it works', 334],
      ['Hitting a problem', 263], ['Asking for something', 151], ['Pushing back', 115],
    ])
    expect(b.themes).toBe(4)
  })

  it('leaves out a kind under 10, and draws nothing where the kinds were not read', () => {
    const thin = new Map(KIND_VIDEOS)
    thin.set('objection', 9)
    expect(build([], { kindVideos: thin }).kinds.map((k) => k.kind)).not.toContain('objection')
    expect(build([], { kindVideos: null }).kinds).toEqual([])
  })
})

describe('buildWords: which quotes (plan §4.0 "Quotes"; most-liked is only the tie-break)', () => {
  it('takes the card’s own-kind themes first, so a pain card does not lead with a question theme’s praise-like excerpt', () => {
    const b = build([BIN, WEIGHT, SHOULDER])
    // BIN has the most likes (7) but sits in a question theme.
    expect(texts(b, 'pain_point')).toEqual([WEIGHT.quote, SHOULDER.quote, BIN.quote])
  })

  it('orders by the evidence’s rank before the theme’s size, and by size before likes', () => {
    const rank2 = { ...WEIGHT, rank: 2 }
    expect(texts(build([rank2, SHOULDER]), 'pain_point')).toEqual([SHOULDER.quote, WEIGHT.quote])
    // Same rank: the bigger theme (bag weight, 11) before comfort (10), whatever the likes.
    expect(texts(build([{ ...SHOULDER, likes: 40 }, WEIGHT]), 'pain_point')).toEqual([WEIGHT.quote, SHOULDER.quote])
    // Same rank and theme: likes decide which of the theme's quotes is its one.
    expect(texts(build([BENTO, WEIGHT]), 'pain_point')).toEqual([WEIGHT.quote])
    expect(texts(build([{ ...BENTO, likes: 21 }, WEIGHT]), 'pain_point')).toEqual([BENTO.quote])
  })

  it('takes at most one quote a theme and three a card', () => {
    const b = build([PINK, BLACK, WEIGHT, BENTO, SHOULDER, BIN])
    expect(texts(b, 'feature_request')).toEqual([PINK.quote])
    expect(card(b, 'pain_point')?.quotes).toHaveLength(WORDS_PER_KIND)
  })

  it('prints a comment once on the whole bank, and one wording once', () => {
    const asPraise = { ...PINK, evidenceId: 'x1', insightKind: 'praise' }
    // The same comment cited by a praise insight of the same theme: the bigger
    // card (praise, 468) takes it, and the wish card does not print it again.
    const b = build([PINK, asPraise, BLACK])
    expect(texts(b, 'praise')).toEqual([PINK.quote])
    expect(texts(b, 'feature_request')).toEqual([BLACK.quote])
    const sameWords = { ...WEIGHT, commentId: 'other', evidenceId: 'x2', themeId: 'daf7426d' }
    expect(texts(build([WEIGHT, sameWords]), 'pain_point')).toEqual([WEIGHT.quote])
  })

  it('refuses a quote whose c: ref resolves to another excerpt of the comment', () => {
    expect(texts(build([{ ...WEIGHT, resolves: false }]), 'pain_point')).toEqual([])
  })

  it('refuses a quote dated outside the month', () => {
    expect(texts(build([{ ...WEIGHT, commentDate: '2026-08-31T00:00:00+00:00' }]), 'pain_point')).toEqual([])
    expect(texts(build([{ ...WEIGHT, commentDate: '2026-10-01T00:00:00+00:00' }]), 'pain_point')).toEqual([])
  })

  it('refuses the video’s own account talking under its own post', () => {
    // Staging: the creator answering under their own Instagram post.
    const own = cand({ evidenceId: '54a5029d', commentId: '1d4a162a', themeId: '4c312c8b', insightKind: 'feature_request', likes: 1, platform: 'instagram', author: 'a maker', videoAccount: 'A Maker', quote: 'Voting on my poll cuz we need black totes 😂😂😂' })
    expect(texts(build([own]), 'feature_request')).toEqual([])
  })

  it('refuses a sale offer or an ad (default M-c), and a quote this reader cannot read', () => {
    const ad = cand({ evidenceId: '3e3dc214', commentId: 'a781837d', themeId: '4c312c8b', insightKind: 'feature_request', likes: 6, platform: 'youtube', quote: 'To purchase: Search Saddlecrestco.store in your browser for the website❤️ Or click the link in my profile🫶 https://saddlecrestco.store' })
    expect(texts(build([ad]), 'feature_request')).toEqual([])
    expect(texts(build([{ ...SHOULDER, english: null }]), 'pain_point')).toEqual([])
  })

  it('refuses a quote under an off-topic video, and marks one under a maker’s', () => {
    expect(texts(build([{ ...WEIGHT, segment: 'noise' }]), 'pain_point')).toEqual([])
    const b = build([{ ...PINK, segment: 'maker' }])
    expect(card(b, 'feature_request')?.quotes[0].maker).toBe(true)
    // No mark where the segments were not read.
    expect(card(build([{ ...PINK, segment: 'maker' }], { segments: 'unknown' }), 'feature_request')?.quotes[0].maker).toBe(false)
  })

  it('takes only a comment the theme’s month record rests on, where the record was read', () => {
    const anchors = new Map([['0c0784d8', new Set(['837b34e9'])]])
    expect(texts(build([WEIGHT, BENTO], { anchors }), 'pain_point')).toEqual([BENTO.quote])
    // A theme with no record row gives nothing.
    expect(texts(build([SHOULDER], { anchors }), 'pain_point')).toEqual([])
  })

  it('draws only from the themes it was given', () => {
    const outside = { ...WEIGHT, themeId: '03cabe7e' }
    expect(texts(build([outside]), 'pain_point')).toEqual([])
  })

  it('anchors the quote on the comment (c:), with its theme, platform, date and likes', () => {
    const q = card(build([PINK]), 'feature_request')?.quotes[0]
    expect(q).toMatchObject({
      quote: { ref: 'c:2b0c1fa4', text: PINK.quote, lang: 'en', english: null },
      themeId: '4c312c8b',
      theme: 'More colors and variants wanted',
      platform: 'tiktok',
      date: '2026-09-19T00:00:00+00:00',
      likes: 78,
      maker: false,
    })
  })
})

describe('shortlistWords (what reaches the translation read)', () => {
  it('keeps the bank’s order and caps each theme', () => {
    const many = Array.from({ length: WORDS_SHORTLIST_PER_THEME + 2 }, (_, i) => ({ ...BENTO, evidenceId: `e${i}`, commentId: `c${i}`, likes: i }))
    const short = shortlistWords([...many, SHOULDER], SEP, null, THEMES)
    expect(short.filter((c) => c.themeId === '0c0784d8')).toHaveLength(WORDS_SHORTLIST_PER_THEME)
    expect(short.map((c) => c.commentId)).toContain(SHOULDER.commentId)
    // The most-liked first within the theme.
    expect(short[0].commentId).toBe(`c${WORDS_SHORTLIST_PER_THEME + 1}`)
  })

  it('drops what cannot print before translating: not resolving, out of the month, off-topic', () => {
    const short = shortlistWords([{ ...WEIGHT, resolves: false }, { ...BENTO, commentDate: '2026-08-02T00:00:00+00:00' }, { ...SHOULDER, segment: 'noise' }, BIN], SEP, null, THEMES)
    expect(short.map((c) => c.commentId)).toEqual([BIN.commentId])
  })

  it('orders own-kind themes first (wordsOrder)', () => {
    expect([BIN, WEIGHT].sort(wordsOrder(THEMES)).map((c) => c.commentId)).toEqual([WEIGHT.commentId, BIN.commentId])
  })
})

describe('firstExcerpt (what a c: ref resolves to)', () => {
  it('is the lowest evidence id with words', () => {
    expect(firstExcerpt([{ id: 'b2', quote: 'second' }, { id: 'a1', quote: 'first' }, { id: '0', quote: null }])).toEqual({ id: 'a1', quote: 'first' })
    expect(firstExcerpt([])).toBeNull()
  })
})

describe('the bank through the quote gate (walkthrough, 29 Sep; lib/quote-gate.ts)', () => {
  const gate = { market: 'carry' as const, makerRule: true }
  const IBADAN = { platform: 'tiktok', videoId: '7686980095516462356', accountName: 'SLIPPERS/SHOES/BAGS IN IBADAN.', caption: 'Viral TASSEL bag in nude colour combo. Available to order.  PRICE: 25,000', hashtags: ['handmadebagsinibadan'], topics: ['handmade bags', 'sales'] }
  const ONEBAG = { platform: 'reddit', videoId: '1wiu2cf', accountName: 'r/onebag', caption: 'PSA: Osprey Sojourn Porter 46 $99 on Sierra. Very duffel like bag with a tuckable harness.', hashtags: [], topics: [] }
  const LAURIE = { platform: 'youtube', videoId: 'laurie-1', accountName: 'Travel Tips by Laurie', caption: 'Best travel bags for Europe', hashtags: [], topics: ['travel bag'] }
  const WORK_BAG = { platform: 'youtube', videoId: '7nSE0b5iiSc', accountName: '조은fine', caption: '보부상 직장인 가방 추천', hashtags: [], topics: ['work bag'] }

  it('drops a seller’s post, keeps the market’s own, and takes one quote per video in a card', () => {
    const b = build([
      { ...PINK, context: IBADAN },
      { ...BLACK, context: null },
      { ...WEIGHT, context: ONEBAG },
      { ...BENTO, context: LAURIE },
      { ...SHOULDER, context: WORK_BAG },
      // A second pain line from the r/onebag thread, in another theme: the card's one per video.
      { ...BIN, themeId: 'daf7426d', commentId: '4a13f62x', context: ONEBAG },
    ], { gate })
    expect(texts(b, 'feature_request')).toEqual([])
    expect(texts(b, 'pain_point')).toEqual([WEIGHT.quote, SHOULDER.quote])
  })

  it('prints no quote under a maker’s video now, marked or not', () => {
    const b = build([{ ...WEIGHT, segment: 'maker', context: ONEBAG }, { ...SHOULDER, context: WORK_BAG }], { gate })
    expect(texts(b, 'pain_point')).toEqual([SHOULDER.quote])
    expect(card(b, 'pain_point')?.quotes.some((q) => q.maker)).toBe(false)
  })
})
