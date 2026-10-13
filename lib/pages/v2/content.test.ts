import { afterEach, describe, expect, it } from 'vitest'

import { flagWordOf } from '@/components/v2'
import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import type { PostIdeaRow } from '../../post-ideas/types'
import type { OwnedPosts } from '../../reading/owned'
import { buildPlaybook, type PlaybookVideo } from '../playbook'
import {
  anchorOf, askedBlock, contentHref, contentMonth, contentWeek, daysLabel, daysPhrase, flagVerdict,
  article, askedPhrase, ideaOwnedFrom, ideasReadOf, ideasStale, ideasWeekOf, ideaWeeks, IDEAS_STALE_DAYS, lengthWords, olderIdeasLine, ownedTo, readIdeas, repliesWindowOf, topContent, touchPosts,
  fmtMultiple, groupsByConversation, ideaCard, IDEAS_EMPTY, marketVideoCards, mixSentence, newVerdict, openingChip,
  openingLabel, ownTouch, parseContentParams, pooledThemeVideos, pooledVideos, postsBlock, postTitle, recipe,
  repliesView, storedPersonas, subquestionRows, threeWeeks, topContentEmpty, typicalRate, wordsToBorrow, worksBlock,
  worksRows, type PanelVideoRow, type WorksRow,
} from './content'
import { OCT, OSSUR_IDEAS, OSSUR_OWNED, OSSUR_OWNED_SINCE, OSSUR_PERSONAS, OSSUR_REPLIES, REG } from './content-fixture'

const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z' }

describe('the URL', () => {
  it('reads the period, one panel and the expanded table; anything else is the default', () => {
    expect(parseContentParams({})).toEqual({ period: 'week', open: null, asked: false })
    expect(parseContentParams({ period: 'month', idea: '2' })).toEqual({ period: 'month', open: { kind: 'idea', rank: 2 }, asked: false })
    expect(parseContentParams({ idea: '7' }).open).toBeNull()
    expect(parseContentParams({ replies: '1' }).open).toEqual({ kind: 'replies' })
    // An old reply link's tab (`?reply=question#worth-a-reply`) opens the list.
    expect(parseContentParams({ reply: 'question' }).open).toEqual({ kind: 'replies' })
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
  const AUG = '2026-08-01'
  it('runs the step’s word check: touched, none, no posts, unread', () => {
    expect(ownTouch(['Getting a prosthetic leg wet'], OSSUR_OWNED, AUG)).toEqual({ state: 'touched', touched: 1, posts: 9, since: AUG })
    expect(ownTouch([' Liner lifespan and replacement '], OSSUR_OWNED, AUG)).toEqual({ state: 'none', touched: 0, posts: 9, since: AUG })
    expect(ownTouch(['x'], { ...OSSUR_OWNED, posts: [], total: 0, byPlatform: [] }, AUG)).toEqual({ state: 'no_posts', touched: 0, posts: 0, since: AUG })
    expect(ownTouch(['x'], null, AUG)).toEqual({ state: 'unread', touched: 0, posts: 0, since: AUG })
  })

  it('reads the step’s window: the reading month and the two before, to the week’s end', () => {
    expect(ideaOwnedFrom('2026-10-01')).toBe('2026-08-01')
    expect(ideaOwnedFrom('2026-01-15')).toBe('2025-11-01')
    expect(OSSUR_OWNED_SINCE.total).toBe(13)
    const cut = touchPosts(OSSUR_OWNED_SINCE, '2026-10-01', '2026-10-08T04:00:00.000Z')!
    // The week ends on the 8th: posts of the 8th onwards are out, as in the
    // step's `ownedPosts({ from: ownedFrom(month), to: window.to })`.
    expect(cut.posts.map((p) => p.upload_date).every((d) => d >= '2026-08-01' && d < '2026-10-08')).toBe(true)
    expect(cut.total).toBe(9)
    expect(touchPosts(null, '2026-10-01', WINDOW.to)).toBeNull()
  })
})

describe('an idea', () => {
  it('counts its sub-questions off their ids, most asked first, and the videos they were asked under', () => {
    const rows = subquestionRows({
      subquestions: [
        { label: 'B', commentIds: ['c1', 'c1', 'c2'], videoIds: ['v1'] },
        { label: 'A', commentIds: ['c3', 'c4', 'c5'], videoIds: ['v1', 'v2', 'v2'] },
        { label: ' ', commentIds: ['c6'], videoIds: ['v3'] },
        { label: 'Empty', commentIds: [], videoIds: [] },
      ],
    })
    expect(rows).toEqual([{ label: 'A', videos: 2, comments: 3 }, { label: 'B', videos: 1, comments: 2 }])
  })

  it('says a length in seconds, and in minutes past ninety', () => {
    expect(lengthWords({ fromSeconds: 30, toSeconds: 45 })).toBe('30 to 45 seconds')
    expect(lengthWords({ fromSeconds: 45, toSeconds: 45 })).toBe('45 seconds')
    expect(lengthWords({ fromSeconds: 25, toSeconds: 75 })).toBe('25 to 75 seconds')
    expect(lengthWords({ fromSeconds: 90, toSeconds: 165 })).toBe('1:30 to 2:45 minutes')
  })

  it('assembles a card from the stored row and code’s readings', () => {
    const card = ideaCard({
      idea: OSSUR_IDEAS[0], label: 'Liner lifespan and replacement', read: { k: 48, n: 640 }, month: { k: 31, n: 318 },
      weeks: [{ label: '20 Sep', count: 9 }], flag: null, groups: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }],
      owned: OSSUR_OWNED, since: '2026-08-01', subject: null, medical: true,
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

describe('the anchor and the ideas’ week', () => {
  const read = (from: string, to: string) => ({ runId: 'pub', month: '2026-10-01', windowEnd: to, data: { window: { from, to } } }) as never
  const older = read('2026-09-27T04:03:00.000Z', '2026-10-04T04:02:00.000Z')
  const newer = read('2026-10-11T04:03:00.000Z', '2026-10-18T04:02:00.000Z')
  const ideasAt = (from: string, to: string): PostIdeaRow[] => OSSUR_IDEAS.map((i) => ({ ...i, run_id: 'old', window_start: from, window_end: to }))

  it('is the newest of the published read’s week and the ideas’ week', () => {
    expect(anchorOf(OSSUR_IDEAS, older)?.runId).toBe(OSSUR_IDEAS[0].run_id)
    expect(anchorOf(OSSUR_IDEAS, newer)).toMatchObject({ runId: 'pub', label: '12 to 18 Oct' })
    expect(anchorOf([], older)).toMatchObject({ runId: 'pub', label: '28 Sep to 4 Oct' })
    expect(anchorOf(OSSUR_IDEAS, null)?.runId).toBe(OSSUR_IDEAS[0].run_id)
    expect(anchorOf([], null)).toBeNull()
  })

  it('prints the ideas’ own week, and says so where it is not the page’s', () => {
    const page = anchorOf(OSSUR_IDEAS, older)
    expect(ideasWeekOf(OSSUR_IDEAS, page)).toMatchObject({ runId: OSSUR_IDEAS[0].run_id, label: '5 to 11 Oct', phrase: 'the week of 5 Oct', current: true, read: { label: '14 Sep to 11 Oct' } })
    const two = ideasAt('2026-09-27T04:03:00.000Z', '2026-10-04T04:02:00.000Z')
    const week = ideasWeekOf(two, anchorOf(two, newer))!
    expect(week).toMatchObject({ label: '28 Sep to 4 Oct', current: false })
    expect(olderIdeasLine(week)).toBe('No new ideas this week. These are from the week of 28 Sep.')
    // A window that is not a week is named by its days.
    expect(ideasWeekOf(ideasAt('2026-09-13T04:03:00.000Z', '2026-10-04T04:02:00.000Z'), null)?.phrase).toBe('14 Sep to 4 Oct')
    expect(ideasWeekOf([], page)).toBeNull()
  })

  it('names the four weeks the ideas read, and each of their weeks, from the stored window', () => {
    const read = ideasReadOf(OSSUR_IDEAS[0])!
    expect(read).toMatchObject({ from: '2026-09-13T04:02:00.000Z', to: '2026-10-11T04:02:00.000Z', label: '14 Sep to 11 Oct' })
    expect(askedPhrase(read)).toBe('From questions asked 14 Sep to 11 Oct')
    expect(read.weeks).toEqual([
      { from: '2026-09-13T04:02:00.000Z', to: '2026-09-20T04:02:00.000Z', label: '14 Sep' },
      { from: '2026-09-20T04:02:00.000Z', to: '2026-09-27T04:02:00.000Z', label: '21 Sep' },
      { from: '2026-09-27T04:02:00.000Z', to: '2026-10-04T04:02:00.000Z', label: '28 Sep' },
      { from: '2026-10-04T04:02:00.000Z', to: '2026-10-11T04:02:00.000Z', label: '5 Oct' },
    ])
    // Össur's real run end (not on the minute): the last week ends exactly
    // where the read does.
    const real = ideasReadOf({ read_start: '2026-09-13T04:00:32.885Z', read_end: '2026-10-11T04:00:32.885+00:00' })!
    expect(real.label).toBe('14 Sep to 11 Oct')
    expect(real.weeks?.at(-1)?.to).toBe('2026-10-11T04:00:32.885+00:00')
    // A window that is not whole weeks (a row read one week, or a partial
    // window) is named by its days and draws no weekly counts.
    expect(ideasReadOf({ read_start: '2026-10-04T11:45:54.031Z', read_end: '2026-10-11T04:00:32.885Z' })).toMatchObject({ label: '5 to 11 Oct', weeks: null })
    expect(ideasReadOf({ read_start: '2026-10-04', read_end: 'x' })).toBeNull()
  })

  it('reads an idea\'s weekly counts only where every week was read', () => {
    const read = ideasReadOf(OSSUR_IDEAS[0])!
    const m = (n: number) => new Map([[REG.liner, n]])
    expect(ideaWeeks(read, [m(6), m(9), m(14), m(23)], REG.liner)?.map((w) => `${w.label} ${w.count}`)).toEqual(['14 Sep 6', '21 Sep 9', '28 Sep 14', '5 Oct 23'])
    expect(ideaWeeks(read, [m(6), m(9), m(14), m(23)], REG.water)?.map((w) => w.count)).toEqual([0, 0, 0, 0])
    expect(ideaWeeks(read, [m(6), null, m(14), m(23)], REG.liner)).toBeNull()
    expect(ideaWeeks(read, [m(6), m(9), m(14)], REG.liner)).toBeNull()
    expect(ideaWeeks({ weeks: null }, [m(6)], REG.liner)).toBeNull()
  })

  it('stops printing ideas more than four weeks older than the page’s week', () => {
    const page = anchorOf([], newer)
    expect(ideasStale(ideasAt('2026-09-20T04:03:00.000Z', '2026-09-27T04:02:00.000Z'), page)).toBe(false)
    expect(ideasStale(ideasAt('2026-09-13T04:03:00.000Z', '2026-09-20T04:02:00.000Z'), page)).toBe(false)
    expect(ideasStale(ideasAt('2026-09-06T04:03:00.000Z', '2026-09-13T04:02:00.000Z'), page)).toBe(true)
    expect(ideasStale(OSSUR_IDEAS, null)).toBe(false)
    expect(ideasStale([], page)).toBe(false)
    expect(IDEAS_STALE_DAYS).toBe(28)
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
      .toBe('[6 of your 9] posts in October so far were promotional videos, which draw [0.7×] a typical video. Story videos draw [3.1×], and you made one. The opening you used most is a question ([2 of 9]), which draws [1.8×]. [2] of your posts have no format read yet.')
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
  const monthCounts = new Map([['idea', 40], ['a', 14], ['b', 9], ['c', 30]])
  const base = { period: 'week' as const, questions, counts: { week: counts, month: monthCounts }, weeks: [new Map([['a', 1]]), new Map(), counts], exclude: new Set(['idea']), groups: new Map([['a', [{ key: 'g', name: 'G' }]]]), subjects: new Map([['a', 'Fit']]), owned: OSSUR_OWNED, since: '2026-08-01', expanded: false }

  it('leaves out the ideas, what nobody asked and what your posts touched on, most videos first', () => {
    const block = askedBlock(base)
    expect(block.rows.map((r) => [r.registryId, r.week, r.month, r.weeks])).toEqual([['a', 12, 14, [1, 0, 12]], ['c', 11, 30, [0, 0, 11]]])
    // The month ranks by the month's own counts.
    expect(askedBlock({ ...base, period: 'month' }).rows.map((r) => r.registryId)).toEqual(['c', 'a'])
    expect(block.rows[0]).toMatchObject({ groups: [{ key: 'g', name: 'G' }], subject: 'Fit' })
    expect(block).toMatchObject({ total: 2, touched: 1, since: '2026-08-01' })
  })

  it('shows five until asked for all, and drops the weeks where any week is unread', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ registryId: `q${i}`, label: `Question number ${i}` }))
    const counts8 = new Map(many.map((q, i) => [q.registryId, 10 - i]))
    expect(askedBlock({ ...base, questions: many, counts: { week: counts8, month: counts8 }, weeks: null }).rows).toHaveLength(5)
    expect(askedBlock({ ...base, questions: many, counts: { week: counts8, month: counts8 }, weeks: null, expanded: true }).rows).toHaveLength(8)
    expect(askedBlock({ ...base, counts: { week: null, month: monthCounts } }).unread).toMatch(/could not be read/)
    expect(askedBlock({ ...base, weeks: [null, new Map(), counts] }).rows[0].weeks).toBeNull()
    expect(askedBlock({ ...base, questions: null }).unread).toMatch(/could not be read/)
  })
})

describe('the empty states', () => {
  it('say why there is no idea, and the Dashboard tile says where the questions are', () => {
    expect(IDEAS_EMPTY.not_on).toBe('Post ideas are not switched on for this workspace.')
    expect(topContentEmpty('stale')).toBe('No new post ideas in the last four weeks. The questions people asked are on Content.')
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

describe('the clocks of the reply list and your posts', () => {
  const across = contentWeek('r', { from: '2026-09-27T04:03:00.000Z', to: '2026-10-04T04:02:00.000Z' })!
  const sept = contentMonth(across, new Date('2026-10-05T00:00:00Z'))

  it('lists a month’s replies only from that month, never past its end', () => {
    expect(repliesWindowOf('month', across, sept)).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', phrase: 'in September' })
    expect(repliesWindowOf('week', across, sept)).toEqual({ from: across.from, to: across.to, phrase: 'between 28 Sep and 4 Oct' })
    expect(repliesWindowOf('week', null, sept)).toBeNull()
  })

  it('reads your posts to the later of the month’s end and the week’s, as the step does', () => {
    expect(ownedTo(sept, across)).toBe(across.to)
    expect(ownedTo(OCT, contentWeek('r', WINDOW))).toBe('2026-11-01T00:00:00.000Z')
    expect(ownedTo(OCT, null)).toBe('2026-11-01T00:00:00.000Z')
  })
})

describe('post ideas switched off for a workspace (opt-in, POST_IDEAS_ENABLED: on for Sealand and Össur since 13 Oct)', () => {
  const untouchable = new Proxy({}, { get: () => { throw new Error('read') } }) as never
  const scope = (clientId: string) => ({ supabase: untouchable, clientId, reading: { client: untouchable, clientId }, params: {} })
  const OFF_LINE = { state: 'not_on', idea: null, href: '/dashboard/content', line: 'Post ideas are not switched on for this workspace. The questions people asked are on Content.' }
  const saved = { on: process.env.POST_IDEAS, off: process.env.POST_IDEAS_OFF }
  afterEach(() => {
    if (saved.on === undefined) delete process.env.POST_IDEAS
    else process.env.POST_IDEAS = saved.on
    if (saved.off === undefined) delete process.env.POST_IDEAS_OFF
    else process.env.POST_IDEAS_OFF = saved.off
  })

  it('reads nothing, prints no stored idea and says so, on the page and on the tile, for a workspace the map does not turn on', async () => {
    delete process.env.POST_IDEAS
    delete process.env.POST_IDEAS_OFF
    const other = '00000000-0000-4000-8000-0000000000d1'
    expect(await readIdeas(untouchable, other)).toEqual({ state: 'not_on', rows: [] })
    expect(await topContent(scope(other))).toEqual(OFF_LINE)
  })

  it('both tenants read their ideas now, and the emergency off-switch still reads nothing for either', async () => {
    delete process.env.POST_IDEAS
    delete process.env.POST_IDEAS_OFF
    for (const id of [OSSUR_CLIENT_ID, SEALAND_CLIENT_ID]) await expect(readIdeas(untouchable, id)).rejects.toThrow('read')
    process.env.POST_IDEAS = '0'
    for (const id of [OSSUR_CLIENT_ID, SEALAND_CLIENT_ID]) {
      expect(await readIdeas(untouchable, id)).toEqual({ state: 'not_on', rows: [] })
      expect(await topContent(scope(id))).toEqual(OFF_LINE)
    }
  })
})

describe('a or an', () => {
  it('reads "an educational video" and "a how-to video"', () => {
    expect(article('Educational')).toBe('an')
    expect(article('entertainment')).toBe('an')
    expect(article('How-to')).toBe('a')
    const text = (mixSentence({ formats: [{ key: 'educational', label: 'Educational', share: 9, multiple: 1.6, yours: 1 }], openings: [], posts: 3, unclassified: 0, month: '2026-10-01', complete: false }) ?? [])
      .map((p) => (typeof p === 'string' ? p : p.figure)).join('')
    expect(text).toBe('1 of your 3 posts in October so far was an educational video, which draw 1.6× a typical video.')
  })
})
