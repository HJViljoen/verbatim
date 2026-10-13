import { describe, expect, it } from 'vitest'

import { flagWordOf } from '@/components/v2'
import { OSSUR_CLIENT_ID } from '../../config'
import type { PostIdeaRow } from '../../post-ideas/types'
import type { OwnedPosts } from '../../reading/owned'
import { buildPlaybook, type PlaybookVideo } from '../playbook'
import {
  anchorOf, askedBlock, contentHref, contentMonth, contentWeek, coverLength, daysLabel, daysPhrase, flagVerdict,
  fmtMultiple, groupsByConversation, ideaCard, IDEAS_EMPTY, marketVideoCards, mixSentence, newVerdict, openingChip,
  openingLabel, ownTouch, parseContentParams, pooledThemeVideos, pooledVideos, postsBlock, postTitle, recipe,
  repliesView, storedPersonas, subquestionRows, threeWeeks, topContentEmpty, typicalRate, wordsToBorrow, worksBlock,
  worksRows, type PanelVideoRow, type WorksRow,
} from './content'
import { OCT, OSSUR_IDEAS, OSSUR_OWNED, OSSUR_PERSONAS, OSSUR_REPLIES, REG } from './content-fixture'

const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z' }

describe('the URL', () => {
  it('reads the period, one panel and the expanded table; anything else is the default', () => {
    expect(parseContentParams({})).toEqual({ period: 'week', open: null, asked: false })
    expect(parseContentParams({ period: 'month', idea: '2' })).toEqual({ period: 'month', open: { kind: 'idea', rank: 2 }, asked: false })
    expect(parseContentParams({ idea: '7' }).open).toBeNull()
    expect(parseContentParams({ replies: '1' }).open).toEqual({ kind: 'replies' })
    expect(parseContentParams({ posts: '1', asked: 'all' })).toEqual({ period: 'week', open: { kind: 'posts' }, asked: true })
    expect(parseContentParams({ period: 'year' }).period).toBe('week')
  })

  it('writes the page back with the period kept and the panel anchored', () => {
    expect(contentHref({ period: 'week', open: null, asked: false })).toBe('/dashboard/content')
    expect(contentHref({ period: 'week', open: { kind: 'idea', rank: 1 }, asked: false })).toBe('/dashboard/content?idea=1#idea-panel')
    expect(contentHref({ period: 'month', open: { kind: 'replies' }, asked: false })).toBe('/dashboard/content?period=month&replies=1#replies-panel')
    expect(contentHref({ period: 'week', open: null, asked: true })).toBe('/dashboard/content?asked=all#also-asked')
    expect(contentHref({ period: 'week', open: { kind: 'posts' }, asked: true })).toBe('/dashboard/content?posts=1&asked=all#posts-panel')
  })
})

describe('the clocks', () => {
  it('takes the week off the run window: the days it holds, named', () => {
    const w = contentWeek('run', WINDOW)!
    // A comment dated 4 October sits at 00:00, before the window opens at 04:03
    // (lib/written/month.ts): the window holds 5 to 11 October.
    expect(w).toMatchObject({ first: '2026-10-05', last: '2026-10-11', days: 7, label: '5 to 11 Oct', isWeek: true })
    expect(daysLabel('2026-09-28', '2026-10-04')).toBe('28 Sep to 4 Oct')
    expect(daysPhrase('2026-10-05', '2026-10-11')).toBe('between 5 and 11 Oct')
    expect(daysPhrase('2026-09-28', '2026-10-04')).toBe('between 28 Sep and 4 Oct')
    expect(contentWeek('run', { from: 'x', to: 'y' })).toBeNull()
  })

  it('restates a week against the month it falls in, so far; a week across two months against the first, in full', () => {
    expect(contentMonth(contentWeek('r', WINDOW), new Date('2026-10-13T00:00:00Z'))).toEqual({ month: '2026-10-01', complete: false, from: '2026-10-01T00:00:00.000Z', to: WINDOW.to })
    const across = contentWeek('r', { from: '2026-09-27T04:03:00.000Z', to: '2026-10-04T04:02:00.000Z' })
    expect(contentMonth(across, new Date())).toMatchObject({ month: '2026-09-01', complete: true, to: '2026-10-01T00:00:00.000Z' })
    // No update yet: the calendar month of the clock, so far.
    expect(contentMonth(null, new Date('2026-10-13T08:00:00Z'))).toMatchObject({ month: '2026-10-01', complete: false })
  })

  it('reads three weeks only for a seven-day week, each the week moved back a week', () => {
    const three = threeWeeks(contentWeek('r', WINDOW)!)!
    expect(three.map((w) => w.label)).toEqual(['21 Sep', '28 Sep', '5 Oct'])
    expect(three[0]).toMatchObject({ from: '2026-09-20T04:03:00.000Z', to: '2026-09-27T04:02:00.000Z' })
    expect(three[2]).toMatchObject(WINDOW)
    expect(threeWeeks(contentWeek('r', { from: '2026-09-10T04:00:00.000Z', to: '2026-10-11T04:00:00.000Z' })!)).toBeNull()
  })
})

describe('the market pooled', () => {
  const audiences = ['competitor:Ottobock', 'industry-other']
  it('adds a theme across the market audiences and leaves your own posts out', () => {
    const rows = [
      { audience: 'industry-other', theme_id: 't1', videos: 20, comments: 40, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
      { audience: 'competitor:Ottobock', theme_id: 't1', videos: 3, comments: 5, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
      { audience: 'client', theme_id: 't1', videos: 9, comments: 9, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
      { audience: 'industry-other', theme_id: 't2', videos: 0, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 },
    ]
    expect(pooledThemeVideos(rows, audiences)).toEqual(new Map([['t1', 23]]))
    expect(pooledThemeVideos(null, audiences)).toBeNull()
    expect(pooledVideos([
      { audience: 'industry-other', videos: 225, comments: 1, platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
      { audience: 'competitor:Ottobock', videos: 16, comments: 1, platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
      { audience: 'client', videos: 30, comments: 1, platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
    ], audiences)).toBe(241)
    expect(pooledVideos(null, audiences)).toBeNull()
  })
})

describe('who asks', () => {
  it('reads the stored groups defensively and names each conversation’s, no count', () => {
    const personas = storedPersonas([{ key: 'a', name: 'New amputees', registryIds: ['t1', 't1', 7] }, { name: 'Caregivers', registryIds: ['t1'] }, { key: 'x' }, null])
    expect(personas).toEqual([{ key: 'a', name: 'New amputees', registryIds: ['t1'] }, { key: 'Caregivers', name: 'Caregivers', registryIds: ['t1'] }])
    expect(groupsByConversation(personas).get('t1')).toEqual([{ key: 'a', name: 'New amputees' }, { key: 'Caregivers', name: 'Caregivers' }])
    expect(storedPersonas('nope')).toEqual([])
  })
})

describe('formats and openings', () => {
  it('names an opening as the chart does and as a chip does', () => {
    expect(openingLabel('question')).toBe('A question')
    expect(openingLabel('demonstration')).toBe('Showing it')
    expect(openingChip('question')).toBe('Open with a question')
    expect(openingChip('demonstration')).toBe('Open by showing it')
    expect(recipe('tutorial', 2.14, 'format')).toEqual({ key: 'tutorial', label: 'Tutorial', name: 'Tutorial', multiple: 2.1 })
    expect(recipe('personal-story', 1.6, 'opening')).toEqual({ key: 'personal-story', label: 'Open with a personal story', name: 'A personal story', multiple: 1.6 })
    expect(recipe(null, 2, 'format')).toBeNull()
    expect(recipe('story', 0, 'format')?.multiple).toBeNull()
    expect(fmtMultiple(1)).toBe('1.0×')
    expect(fmtMultiple(2.14)).toBe('2.1×')
  })
})

describe('your posts against a conversation', () => {
  it('runs the one word check: touched, none, no posts, unread', () => {
    expect(ownTouch(['Getting a prosthetic leg wet'], OSSUR_OWNED)).toEqual({ state: 'touched', touched: 1, posts: 9 })
    expect(ownTouch(['Liner lifespan and replacement'], OSSUR_OWNED)).toEqual({ state: 'none', touched: 0, posts: 9 })
    expect(ownTouch(['x'], { ...OSSUR_OWNED, posts: [], total: 0, byPlatform: [] })).toEqual({ state: 'no_posts', touched: 0, posts: 0 })
    expect(ownTouch(['x'], null)).toEqual({ state: 'unread', touched: 0, posts: 0 })
  })
})

describe('an idea', () => {
  it('counts its sub-questions off their ids, most asked first, and the videos they were asked under', () => {
    const { rows, asking } = subquestionRows({
      subquestions: [
        { label: 'B', commentIds: ['c1', 'c1', 'c2'], videoIds: ['v1'] },
        { label: 'A', commentIds: ['c3', 'c4', 'c5'], videoIds: ['v1', 'v2', 'v2'] },
        { label: ' ', commentIds: ['c6'], videoIds: ['v3'] },
        { label: 'Empty', commentIds: [], videoIds: [] },
      ],
    })
    expect(rows).toEqual([{ label: 'A', videos: 2, comments: 3 }, { label: 'B', videos: 1, comments: 2 }])
    expect(asking).toBe(3)
  })

  it('reads a length the writer put in the cover, and nothing else', () => {
    expect(coverLength({ text: 'x', length: ' 30 to 45 seconds ' })).toBe('30 to 45 seconds')
    expect(coverLength({ text: 'x' })).toBeNull()
    expect(coverLength({ text: 'x', length: 30 })).toBeNull()
  })

  it('assembles a card from the stored row and code’s readings', () => {
    const card = ideaCard({
      idea: OSSUR_IDEAS[0], label: 'Liner lifespan and replacement', week: { k: 23, n: 241 }, month: { k: 31, n: 318 },
      weeks: [{ label: '20 Sep', count: 9 }], flag: null, groups: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }],
      owned: OSSUR_OWNED, subject: null, medical: true,
    })
    expect(card).toMatchObject({ rank: 1, registryId: REG.liner, groups: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }], medical: true })
    expect(card.format).toMatchObject({ label: 'Tutorial', multiple: 2.1 })
    expect(card.opening).toMatchObject({ label: 'Open with a question', multiple: 1.8 })
    expect(card.own.state).toBe('none')
  })

  it('earns "Unusual this week" off a stored flag and "New" off the week read, nothing else', () => {
    const flagged = flagVerdict({ object_kind: 'theme', object_id: 't', label: 'X', denominator: 'market', week_k: 19, week_n: 241, baseline_k: 39, baseline_n: 1906, change_pts: '5.8', band_pts: '3.6' }, WINDOW)
    expect(flagWordOf(flagged)).toBe('unusual')
    expect(flagged.window).toEqual({ kind: 'week', ...WINDOW })
    expect(flagWordOf(newVerdict('t', 'X', OCT, { k: 8, n: 318 }))).toBe('new')
  })
})

describe('the anchor', () => {
  const published = { runId: 'pub', month: '2026-10-01', windowEnd: WINDOW.to, data: { window: { from: '2026-09-27T04:03:00.000Z', to: '2026-10-04T04:02:00.000Z' } } } as never
  it('is the ideas’ run where there are ideas, else the published read’s, else none', () => {
    expect(anchorOf(OSSUR_IDEAS, published)?.runId).toBe(OSSUR_IDEAS[0].run_id)
    expect(anchorOf([], published)).toMatchObject({ runId: 'pub', label: '28 Sep to 4 Oct' })
    expect(anchorOf([], null)).toBeNull()
  })
})

describe('market videos where it came up', () => {
  const v = (id: string, over: Partial<PanelVideoRow>): PanelVideoRow => ({
    id, video_id: id, platform: 'tiktok', video_url: null, account_name: 'acct', caption: null, hook_text: null,
    classified_type: 'tutorial', hook_style: 'question', engagement_rate: null, source: 'discovered', is_client: false, views: 0, ...over,
  })
  it('leaves your own posts out, reads Reddit with no multiple, best response first, then views', () => {
    const cards = marketVideoCards([
      v('a', { engagement_rate: 3 }),
      v('b', { engagement_rate: '7.8' }),
      v('own', { engagement_rate: 30, source: 'owned', is_client: true }),
      v('r', { engagement_rate: 50, platform: 'reddit', views: 9000 }),
      v('c', { engagement_rate: null, views: 100 }),
      v('a', { engagement_rate: 3 }),
    ], 3.0, 5)
    expect(cards.map((c) => [c.id, c.multiple])).toEqual([['b', 2.6], ['a', 1], ['r', null], ['c', null]])
    expect(cards[0]).toMatchObject({ format: 'Tutorial', opening: 'A question', account: 'acct' })
    expect(marketVideoCards([v('a', { engagement_rate: 3 })], null)[0].multiple).toBeNull()
  })

  it('names a video by its opening, else its caption’s first sentence, without hashtags or links', () => {
    expect(postTitle({ hook_text: 'Your liner has an expiry date.', caption: 'x' })).toBe('Your liner has an expiry date.')
    expect(postTitle({ hook_text: 'Hi', caption: '\nMeet the Navii. Built for wet days. #ossur https://x.y' })).toBe('Meet the Navii.')
    expect(postTitle({ caption: '#a #b' })).toBeNull()
    expect(postTitle({ caption: 'word '.repeat(40) })!.length).toBeLessThanOrEqual(80)
  })
})

describe('words to borrow', () => {
  it('keeps short readable phrases, one wording once, each a phrase ref', () => {
    const words = wordsToBorrow([
      { id: 's1', phrase: '“nobody told me they wear out”' },
      { id: 's2', phrase: 'Nobody told me they wear out' },
      { id: 's3', phrase: 'ok' },
      { id: 's4', phrase: 'x'.repeat(70) },
      { id: 's5', phrase: 'I can feel it rubbing on my skin' },
      // Not readable as English on its own words (the one gate, lib/quotes.ts).
      { id: 's6', phrase: 'stops holding by lunchtime' },
    ])
    expect(words).toEqual([
      { ref: 'p:s1', text: 'nobody told me they wear out' },
      { ref: 'p:s5', text: 'I can feel it rubbing on my skin' },
    ])
  })
})

// ---- What works, through the real playbook ---------------------------------------------

const video = (id: string, over: Partial<PlaybookVideo>): PlaybookVideo => ({
  id, upload_date: '2026-10-05', platform: 'tiktok', classified_type: null, hook_style: null, engagement_rate: null,
  is_client: false, is_competitor: false, competitor_name: null, source: 'discovered', sentiment: null, sentiment_source: null, analyzed_lane: null, ...over,
})

function playbook() {
  const market: PlaybookVideo[] = []
  let n = 0
  const add = (count: number, classified: string, hook: string, rate: number) => {
    for (let i = 0; i < count; i++) market.push(video(`m${n++}`, { classified_type: classified, hook_style: hook, engagement_rate: rate }))
  }
  add(4, 'story', 'personal-story', 9)
  add(5, 'tutorial', 'question', 6)
  add(6, 'promotional', 'before-after', 2)
  const owned = [
    video('o1', { source: 'owned', is_client: true, classified_type: 'promotional', hook_style: 'before-after', engagement_rate: 2 }),
    video('o2', { source: 'owned', is_client: true, classified_type: 'promotional', hook_style: 'before-after', engagement_rate: 1 }),
    video('o3', { source: 'owned', is_client: true, classified_type: 'story', hook_style: 'personal-story', engagement_rate: 8 }),
  ]
  // A creator's video naming the brand: in neither column.
  const naming = video('n1', { is_client: true, classified_type: 'tutorial', hook_style: 'question', engagement_rate: 40 })
  return buildPlaybook({ month: '2026-10-01', brand: 'Össur', rival: null, videos: [...market, ...owned, naming], clientSide: 'owned' })
}

describe('what works', () => {
  it('draws the market’s kinds best response first, with your own posts of each kind', () => {
    const pb = playbook()
    expect(typicalRate(pb)).toBe(6)
    const rows = worksRows(pb, 'formats', (k) => k)
    expect(rows.map((r) => [r.key, r.multiple, r.yours, r.share])).toEqual([
      ['story', 1.5, 1, 26.7],
      ['tutorial', 1, 0, 33.3],
      ['promotional', 0.3, 2, 40],
    ])
    expect(worksRows(pb, 'hooks', openingLabel).map((r) => r.label)).toEqual(['A personal story', 'A question', 'A before and after'])
  })

  it('writes the sentence about your mix from the rows, every number a figure', () => {
    const rows = (yours: number[]): WorksRow[] => [
      { key: 'story', label: 'Story', share: 22, multiple: 3.1, yours: yours[0] },
      { key: 'promotional', label: 'Promotional', share: 12, multiple: 0.7, yours: yours[1] },
    ]
    const text = (parts: ReturnType<typeof mixSentence>) => (parts ?? []).map((p) => (typeof p === 'string' ? p : `[${p.figure}]`)).join('')
    expect(text(mixSentence({ formats: rows([1, 6]), openings: [{ key: 'question', label: 'A question', share: 19, multiple: 1.8, yours: 2 }], posts: 9, unclassified: 2, month: '2026-10-01', complete: false })))
      .toBe('[6 of your 9] posts in October so far were promotional videos, which draw [0.7×] a typical video. Story videos draw [3.1×], and you made one. The opening you used most is with a question ([2 of 9]), which draws [1.8×]. [2] of your posts have no format read yet.')
    expect(text(mixSentence({ formats: rows([0, 1]), openings: [], posts: 1, unclassified: 0, month: '2026-09-01', complete: true })))
      .toBe('[1 of your 1] posts in September was a promotional video, which draw [0.7×] a typical video. Story videos draw [3.1×], and none of yours were.')
    expect(text(mixSentence({ formats: rows([0, 0]), openings: [], posts: 0, unclassified: 0, month: '2026-10-01', complete: false }))).toBe('You published nothing of your own in October so far.')
  })

  it('says what it was read off, or why it cannot be read', () => {
    const block = worksBlock({ playbook: playbook(), owned: OSSUR_OWNED, month: OCT })
    expect(block.unread).toBeNull()
    expect(block.basis?.[1]).toEqual({ figure: '15 of 15' })
    expect(worksBlock({ playbook: null, owned: null, month: OCT }).unread).toMatch(/could not be read/)
    const thin = buildPlaybook({ month: '2026-10-01', brand: 'Össur', rival: null, videos: [video('a', { classified_type: 'story', engagement_rate: 2 })], clientSide: 'owned' })
    expect(worksBlock({ playbook: thin, owned: OSSUR_OWNED, month: OCT }).unread).toMatch(/Too few/)
  })
})

describe('your posts', () => {
  it('states a typical response only off three rated posts, and picks the best', () => {
    const block = postsBlock({ owned: OSSUR_OWNED, typical: 3, month: OCT })
    expect(block.total).toBe(9)
    expect(block.response).toEqual({ multiple: 0.8, rated: 6 })
    expect(block.best).toMatchObject({ title: 'Meet the Navii.', multiple: 2.2, format: 'How-to' })
    const few: OwnedPosts = { ...OSSUR_OWNED, posts: OSSUR_OWNED.posts.slice(0, 2), total: 2 }
    expect(postsBlock({ owned: few, typical: 3, month: OCT }).response).toBeNull()
    expect(postsBlock({ owned: OSSUR_OWNED, typical: null, month: OCT }).response).toBeNull()
    expect(postsBlock({ owned: null, typical: 3, month: OCT }).unread).toMatch(/could not be read/)
  })
})

describe('worth a reply', () => {
  const window = { from: WINDOW.from, to: WINDOW.to, phrase: 'between 4 and 10 Oct' }
  it('counts the comments it picked by what they ask and whose post they sit under', () => {
    const view = repliesView(OSSUR_REPLIES, window)
    expect(view.total).toBe(12)
    expect(view.counts).toEqual({ buying: 4, question: 5, objection: 2, flagged: 1 })
    expect(view.under).toEqual({ own: 6, about: 3, elsewhere: 3 })
    expect(repliesView(null, window).unread).toMatch(/could not be read/)
    expect(repliesView({ ...OSSUR_REPLIES, rows: [], flagged: [], unread: 'This update covered no window.' }, window).unread).toBe('This update covered no window.')
  })
})

describe('also asked', () => {
  const questions = [
    { registryId: 'idea', label: 'Liner lifespan' },
    { registryId: 'a', label: 'Socket fit for children' },
    { registryId: 'b', label: 'Getting a prosthetic leg wet' },
    { registryId: 'c', label: 'Knee choice' },
    { registryId: 'z', label: 'Nobody this week' },
  ]
  const counts = new Map([['idea', 30], ['a', 12], ['b', 9], ['c', 11]])
  const base = { period: 'week' as const, questions, counts, weeks: [new Map([['a', 1]]), new Map(), counts], exclude: new Set(['idea']), groups: new Map([['a', [{ key: 'g', name: 'G' }]]]), subjects: new Map([['a', 'Fit']]), owned: OSSUR_OWNED, expanded: false }

  it('leaves out the ideas, what nobody asked and what your posts touched on, most videos first', () => {
    const block = askedBlock(base)
    expect(block.rows.map((r) => [r.registryId, r.videos, r.weeks])).toEqual([['a', 12, [1, 0, 12]], ['c', 11, [0, 0, 11]]])
    expect(block.rows[0]).toMatchObject({ groups: [{ key: 'g', name: 'G' }], subject: 'Fit' })
    expect(block).toMatchObject({ total: 2, touched: 1 })
  })

  it('shows five until asked for all, and drops the weeks where any week is unread', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ registryId: `q${i}`, label: `Question number ${i}` }))
    const counts8 = new Map(many.map((q, i) => [q.registryId, 10 - i]))
    expect(askedBlock({ ...base, questions: many, counts: counts8, weeks: null }).rows).toHaveLength(5)
    expect(askedBlock({ ...base, questions: many, counts: counts8, weeks: null, expanded: true }).rows).toHaveLength(8)
    expect(askedBlock({ ...base, weeks: [null, new Map(), counts] }).rows[0].weeks).toBeNull()
    expect(askedBlock({ ...base, questions: null }).unread).toMatch(/could not be read/)
  })
})

describe('the empty states', () => {
  it('say why there is no idea, and the Dashboard tile says where the questions are', () => {
    expect(IDEAS_EMPTY.not_on).toBe('Post ideas are not switched on for this workspace yet.')
    expect(topContentEmpty('none')).toBe('No post ideas were written for this week. The questions people asked are on Content.')
    expect(topContentEmpty('unread')).toBe(IDEAS_EMPTY.unread)
  })
})

describe('the fixture', () => {
  it('builds Össur’s week the way the loader does', () => {
    const persona = groupsByConversation(OSSUR_PERSONAS)
    expect(persona.get(REG.liner)?.map((g) => g.name)).toEqual(['New amputees, first year', 'Caregivers and family', 'Long-time users upgrading'])
    expect(OSSUR_IDEAS.every((i: PostIdeaRow) => i.client_id === OSSUR_CLIENT_ID)).toBe(true)
  })
})
