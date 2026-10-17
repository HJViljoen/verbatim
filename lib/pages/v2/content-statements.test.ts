import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import { quoteTextHash } from '../../quote-text'
import { cleanQuote } from '../../quotes'
import { readingHandle } from '../../reading/read'
import { fakeDb } from '../../test/fake-db'
import { loadContentPage } from './content'
import { loadContentIdea } from './content-idea'
import { loadContentPosts } from './content-posts'
import { loadContentReplies } from './content-replies'

// CONTENT'S STATEMENTS, COUNTED OFFLINE (depth as pages, 17 Oct; the Market
// harness's pattern, lib/pages/v2/market-statements.test.ts). Every
// `.from(table)` and `.rpc(fn)` a page load makes, against a table-driven
// stand-in for the database (lib/test/fake-db.ts): Össur (post ideas on), one
// delivered update with its published week read and its post ideas, a few
// market videos and comments, and its own posts. The absolute figures are this
// stand-in's; production pages more rows past the 1,000 cap.

export const CLIENT = OSSUR_CLIENT_ID
export const OTHER = '00000000-0000-4000-8000-0000000000cc'
export const RUN = '00000000-0000-4000-8000-0000000000bb'
export const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z' }
export const READ = { from: '2026-09-13T04:02:00.000Z', to: '2026-10-11T04:02:00.000Z' }
export const LINER = '00000000-0000-4000-8000-00000000a001'
export const KNEE = '00000000-0000-4000-8000-00000000a002'
export const ASKED = '00000000-0000-4000-8000-00000000a003'
export const IDEA = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`
export const VID = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`
export const OWN = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`
export const CMT = (n: number) => `00000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`

const idea = (rank: 1 | 2, registry: string, title: string, comments: number[], videos: number[]) => ({
  id: IDEA(rank), client_id: CLIENT, run_id: RUN, window_start: WINDOW.from, window_end: WINDOW.to,
  read_start: READ.from, read_end: READ.to, rank, registry_id: registry, title,
  cover: { text: 'What it should cover', length: { fromSeconds: 30, toSeconds: 45, videos: 9, basis: 'format' }, asked: { comments: comments.length, videos: videos.length } },
  subquestions: [
    { label: 'How long it should last', commentIds: comments.slice(0, 3).map(CMT), videoIds: videos.slice(0, 2).map(VID) },
    { label: 'The signs it is worn out', commentIds: comments.slice(3).map(CMT), videoIds: videos.slice(2).map(VID) },
  ],
  format: 'tutorial', format_multiple: 2.1, opening: 'question', opening_multiple: 1.8,
  model: 'gpt-5.4', prompt_version: 'post_ideas_v3', created_at: '2026-10-11T05:10:00.000Z',
})

const marketVideo = (n: number, over: Record<string, unknown> = {}) => ({
  id: VID(n), client_id: CLIENT, video_id: `mv${n}`, platform: ['tiktok', 'instagram', 'youtube'][n % 3], video_url: `https://example.com/v/${n}`,
  account_name: `creator${n}`, caption: `Your liner has an expiry date, part ${n}`, hook_text: null, classified_type: 'tutorial', hook_style: 'question',
  engagement_rate: 3 + n / 10, views: 1000 * n, likes: 10, comments_count: 20, upload_date: '2026-10-03', topics: ['liner', 'prosthetic'],
  is_client: false, is_competitor: false, competitor_name: null, source: 'discovered', hashtags: [], sentiment: null, sentiment_source: null, analyzed_lane: null,
  ...over,
})

const ownPost = (n: number, upload: string) => marketVideo(0, {
  id: OWN(n), video_id: `own${n}`, platform: n % 2 ? 'instagram' : 'tiktok', account_name: 'ossur', caption: `Meet the Navii, part ${n}`,
  classified_type: 'promotional', hook_style: 'before-after', engagement_rate: 2 + n / 10, upload_date: upload, is_client: true, source: 'owned', topics: ['navii'],
})

const comment = (n: number, video: { platform: string; video_id: string }, text: string, date = '2026-10-07T10:00:00.000Z') => ({
  id: CMT(n), client_id: CLIENT, author: `viewer${n}`, text, likes: n % 4, comment_date: date, platform: video.platform, video_id: video.video_id, comment_id: `native${n}`,
})

export function contentTables() {
  const market = Array.from({ length: 6 }, (_, i) => marketVideo(i + 1))
  const own = [ownPost(1, '2026-10-09'), ownPost(2, '2026-10-06'), ownPost(3, '2026-09-20')]
  const texts = [
    'How long does a liner usually last before it starts slipping?',
    'Is it normal that my liner feels loose after six months?',
    'How do you know when it is time to replace the liner?',
    'Mine stops holding by lunchtime now, new liner or new socket?',
    'Does a thicker liner last longer or does it just feel hotter?',
    'Where can I try the Navii knee near Cape Town this month?',
    'Is the knee covered by medical aid or do I pay myself?',
    'Can the Navii go in the sea or only in the shower?',
  ]
  const comments = [
    ...texts.slice(0, 5).map((t, i) => comment(i + 1, market[i], t)),
    comment(6, own[0], texts[5]), comment(7, own[0], texts[6]), comment(8, own[1], texts[7]),
  ]
  return {
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    post_ideas: [
      idea(1, LINER, 'How long does a liner last, and how do you know it is time to replace it?', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),
      idea(2, KNEE, 'What to do when insurance says no to a powered knee', [6, 7], [1, 2]),
    ],
    week_reads: [{ client_id: CLIENT, run_id: RUN, kind: 'week', status: 'ready', month: '2026-10-01', window_end: WINDOW.to, data: { version: 2, window: WINDOW, newThisWeek: [] }, created_at: '2026-10-11T06:00:00.000Z' }],
    theme_observations: [LINER, KNEE, ASKED].map((id, i) => ({ client_id: CLIENT, run_id: RUN, theme_id: id, label: ['Liner lifespan and replacement', 'Insurance refusals for powered knees', 'Getting a prosthetic leg wet'][i], category: 'question', member_insight_ids: [] })),
    consumer_profiles: [{ client_id: CLIENT, run_date: '2026-10-11', personas: [{ key: 'carers', name: 'Caregivers and family', registryIds: [LINER, ASKED] }] }],
    tracking_configs: [{ client_id: CLIENT, competitor_names: [], own_handles: { instagram: 'ossur', tiktok: 'ossur' }, brand_keywords: ['ossur', 'össur', 'navii'], competitor_keywords: [], industry_keywords: ['prosthetic', 'liner', 'knee'] }],
    competitors: [],
    videos: [...market, ...own, marketVideo(9, { id: '00000000-0000-4000-8000-0000000002ff', client_id: OTHER, account_name: 'Other workspace creator', caption: 'Other workspace video' })],
    comments,
    audience_insights_current: [
      { id: 'ins-1', client_id: CLIENT, category: 'purchase_intent', theme: 'looking_for_a_fitting', description: 'Where to try it', strength_score: 8 },
      { id: 'ins-2', client_id: CLIENT, category: 'question', theme: 'water_and_the_knee', description: 'Water', strength_score: 7 },
    ],
    insight_evidence: [
      { id: 'ev-6', audience_insight_id: 'ins-1', comment_id: CMT(6), source: 'comment', source_video_id: OWN(1), quote: texts[5], relevance_rank: 1, redacted: false },
      { id: 'ev-7', audience_insight_id: 'ins-1', comment_id: CMT(7), source: 'comment', source_video_id: OWN(1), quote: texts[6], relevance_rank: 1, redacted: false },
      { id: 'ev-8', audience_insight_id: 'ins-2', comment_id: CMT(8), source: 'comment', source_video_id: OWN(2), quote: texts[7], relevance_rank: 1, redacted: false },
    ],
    comment_translations: comments.map((c) => ({ comment_id: c.id, text_hash: quoteTextHash(cleanQuote(c.text)), language: 'en', english: c.text })),
    language_samples_current: [
      { id: 'ls-1', client_id: CLIENT, comment_id: CMT(2), phrase: 'feels loose' },
      { id: 'ls-2', client_id: CLIENT, comment_id: CMT(4), phrase: 'stops holding by lunchtime' },
    ],
    anomaly_checks: [],
    anomaly_flags: [],
    subjects: [],
    subject_memberships: [],
  }
}

export function contentRpcs() {
  return {
    window_denominators: () => [{ audience: 'industry-other', videos: 240, comments: 3000, platform_mix: { tiktok: 120, instagram: 80, youtube: 40 } }],
    window_theme_readings: () => [LINER, KNEE, ASKED].map((id, i) => ({ audience: 'industry-other', theme_id: id, videos: 20 - 4 * i, comments: 40, platform_mix: { tiktok: 10, instagram: 6, youtube: 4 - i } })),
    segments_for_videos: () => [],
  }
}

/** One load's statements: every table and function it named, counted. */
export function countCalls(calls: readonly { op: string; table: string }[]): { total: number; by: Record<string, number> } {
  const by: Record<string, number> = {}
  for (const c of calls) by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] = (by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] ?? 0) + 1
  return { total: calls.length, by }
}

const NOW = new Date('2026-10-13T08:00:00.000Z')

type Load = (scope: Parameters<typeof loadContentPage>[0]) => Promise<unknown>

/** One load's statements against a fresh stand-in, and what it returned. */
async function measure<T>(load: (scope: Parameters<typeof loadContentPage>[0]) => Promise<T>, params: Record<string, string> = {}, tables = contentTables()): Promise<{ total: number; by: Record<string, number>; data: T; calls: { op: string; table: string; filters: string[] }[] }> {
  const db = fakeDb(tables as never, contentRpcs() as never)
  const data = await load({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params })
  return { ...countCalls(db.calls), data, calls: db.calls }
}

const root: Load = (scope) => loadContentPage(scope, { now: NOW })
const rootPage = (scope: Parameters<typeof loadContentPage>[0]) => loadContentPage(scope, { now: NOW })
const ideaPage = (id: string) => (scope: Parameters<typeof loadContentPage>[0]) => loadContentIdea(scope, id, { now: NOW })
const replies = (scope: Parameters<typeof loadContentPage>[0]) => loadContentReplies(scope, { now: NOW })
const posts = (scope: Parameters<typeof loadContentPage>[0]) => loadContentPosts(scope, { now: NOW })

// TODAY'S CONTENT, before its depth became pages (17 Oct, measured by this
// harness on d4e1480b): the root this week 40, this month 40; a post idea
// opened in place (`?idea=1`) 46 (its videos, comments, their English, its
// words and the gate's context); the reply list (`?replies=1`) and your posts
// (`?posts=1`) opened in place 40, since the root reads both lists already.
//
// AS PAGES (17 Oct): the root reads what it always read for its cards, 40 in
// either period (an old panel param never reaches it: the route redirects
// first). An idea's page reads 32: the row by id, the newest set's run and
// the published read (the root's anchor), its set (the switcher), its label,
// the flags, the groups, the rivals, the window readings over the days it
// read (its four weeks, and the month), your posts (the touch test), its
// sub-questions' comments, their English and the gate's context, the words to
// borrow, the market videos and the month's playbook (the typical video);
// opening a sub-question reads nothing more. The reply list's page reads 19:
// the root's anchor, the brand, the queue the root card counts, the videos
// its comments sit under, your posts this month and the ideas' figures for
// the foot; the month and a kind in full the same. Your posts' page reads 15:
// the anchor, your posts this month, the playbook, the comments under the
// posts shown and their English, and the foot's ideas; every post listed, or
// one post opened, the same.
describe('Content\'s statements, page by page', () => {
  it('counts each load', async () => {
    const week = await measure(root)
    const month = await measure(root, { period: 'month' })
    const idea = await measure(ideaPage(IDEA(1)))
    const ideaOpen = await measure(ideaPage(IDEA(1)), { sub: '1' })
    const list = await measure(replies)
    const listMonth = await measure(replies, { period: 'month' })
    const listKind = await measure(replies, { kind: 'buy' })
    const own = await measure(posts)
    const ownAll = await measure(posts, { all: '1' })
    const ownOpen = await measure(posts, { post: OWN(1) })
    expect({
      week: week.total, month: month.total, idea: idea.total, ideaOpen: ideaOpen.total,
      replies: list.total, repliesMonth: listMonth.total, repliesKind: listKind.total,
      posts: own.total, postsAll: ownAll.total, postsOpen: ownOpen.total,
    }).toEqual({
      week: 40, month: 40, idea: 32, ideaOpen: 32,
      replies: 19, repliesMonth: 19, repliesKind: 19,
      posts: 15, postsAll: 15, postsOpen: 15,
    })
    // The idea's row is read once, by id, and its set once, by its run.
    expect(idea.by['from:post_ideas']).toBe(3)
    // The level pages read no reply queue but the reply list's own, and the
    // root's cards read no idea row by id.
    for (const page of [idea, own]) expect(page.by['from:audience_insights_current']).toBeUndefined()
    expect(list.by['from:audience_insights_current']).toBe(1)
    // Your posts' page reads the comments under the posts it shows, once.
    expect(own.by['from:comments']).toBe(1)
  })
})

// ---- isolation: every new param names only the tenant's own rows ------------------
//
// The idea's id, its `?sub=`, your posts' `?post=` and the reply list's
// videos are honoured only for the session's tenant and the page's own set;
// every new read names the session's client, so a test fails where a read's
// client filter is removed (the filters are asserted, not only the outcome).

const FOREIGN_IDEA = '00000000-0000-4000-8000-0000000001ff'
const FOREIGN_COMMENT = '00000000-0000-4000-8000-0000000004ff'
const FOREIGN_POST = '00000000-0000-4000-8000-0000000003ff'

function withForeign() {
  const t = contentTables()
  const [first, ...rest] = t.post_ideas
  return {
    ...t,
    // Another workspace's idea, and a comment of theirs named by our idea's
    // first sub-question (a stored id that resolves to their row).
    post_ideas: [
      { ...first, subquestions: [{ ...first.subquestions[0], commentIds: [...first.subquestions[0].commentIds, FOREIGN_COMMENT] }, ...first.subquestions.slice(1)] },
      ...rest,
      { ...first, id: FOREIGN_IDEA, client_id: OTHER, run_id: '00000000-0000-4000-8000-0000000000dd', title: 'Other workspace idea' },
    ],
    comments: [
      ...t.comments,
      { id: FOREIGN_COMMENT, client_id: OTHER, author: 'foreign', text: 'Other workspace comment asking how long it lasts?', likes: 0, comment_date: '2026-10-07T10:00:00.000Z', platform: 'tiktok', video_id: 'mv1', comment_id: 'nf' },
      // Another workspace's comment under a video with our own post's id.
      { id: '00000000-0000-4000-8000-0000000004fe', client_id: OTHER, author: 'foreign', text: 'Other workspace comment under the same video id?', likes: 0, comment_date: '2026-10-09T10:00:00.000Z', platform: 'instagram', video_id: 'own1', comment_id: 'nf2' },
    ],
    videos: [...t.videos, { ...t.videos[0], id: FOREIGN_POST, client_id: OTHER, source: 'owned', account_name: 'Other workspace account', caption: 'Other workspace post', upload_date: '2026-10-08' }],
  }
}

const filtersOf = (calls: { table: string; filters: string[] }[], table: string) => calls.filter((c) => c.table === table).map((c) => c.filters)

describe('a post idea\'s page reads only the tenant\'s own idea', () => {
  it('another workspace\'s idea names nothing: the calm line, and nothing read past the first wave', async () => {
    const r = await measure(ideaPage(FOREIGN_IDEA), {}, withForeign())
    expect(r.data).toMatchObject({ state: 'missing', page: null })
    expect(r.total).toBe(3)
    expect(JSON.stringify(r.data)).not.toContain('Other workspace')
  })

  it('a malformed id reads nothing at all', async () => {
    for (const id of ['nope', `${IDEA(1)}x`, "1' or 1=1", '']) {
      const r = await measure(ideaPage(id), {}, withForeign())
      expect(r.data, id).toMatchObject({ state: 'missing' })
      expect(r.total, id).toBe(0)
    }
  })

  it('a workspace with post ideas switched off reads nothing and prints no stored idea', async () => {
    const db = fakeDb(withForeign() as never, contentRpcs() as never)
    const off = '00000000-0000-4000-8000-0000000000ee'
    const data = await loadContentIdea({ supabase: db.client as never, clientId: off, reading: readingHandle(off, db.client as never), params: {} }, IDEA(1), { now: NOW })
    expect(data.state).toBe('not_on')
    expect(db.calls).toHaveLength(0)
  })

  it('a workspace whose post ideas table is not there yet reads as not switched on, as the root does, never as a failed read', async () => {
    const { post_ideas: _gone, ...tables } = contentTables()
    const r = await measure(ideaPage(IDEA(1)), {}, tables as ReturnType<typeof contentTables>)
    expect(r.data).toMatchObject({ state: 'not_on', page: null })
  })

  it('every read it makes names the session\'s client, and another workspace\'s comment never reaches a card', async () => {
    const r = await measure(ideaPage(IDEA(1)), { sub: '1' }, withForeign())
    expect(r.data.state).toBe('ready')
    for (const f of filtersOf(r.calls, 'post_ideas')) expect(f).toContain(`client_id=${CLIENT}`)
    for (const table of ['comments', 'videos', 'language_samples_current', 'theme_observations', 'consumer_profiles']) {
      for (const f of filtersOf(r.calls, table)) expect(f, table).toContain(`client_id=${CLIENT}`)
    }
    expect(JSON.stringify(r.data)).not.toContain('Other workspace')
    // The opened sub-question lists only the tenant's comments.
    const first = r.data.page!.subquestions[0]
    expect(first.open).toBe(true)
    expect(first.quotes.every((q) => !q.text.includes('Other workspace'))).toBe(true)
  })

  it('opens only a sub-question the idea has', async () => {
    for (const sub of ['9', 'x', '0']) {
      const r = await measure(ideaPage(IDEA(1)), { sub })
      expect(r.data.page!.subquestions.some((s) => s.open), sub).toBe(false)
    }
  })

  it('the session\'s own idea opens (the control)', async () => {
    const r = await measure(ideaPage(IDEA(2)), {}, withForeign())
    expect(r.data).toMatchObject({ state: 'ready', page: { id: IDEA(2), rank: 2 } })
    // The switcher lists the set's two ideas, the other workspace's not.
    expect(r.data.crumbs[1].menu!.items.map((i) => i.key)).toEqual([IDEA(1), IDEA(2)])
  })
})

describe('your posts\' page reads only the tenant\'s own posts and their comments', () => {
  it('another workspace\'s post id opens nothing, and no other workspace\'s post or comment reaches a card', async () => {
    const r = await measure(posts, { post: FOREIGN_POST }, withForeign())
    expect(r.data.cards.some((c) => c.open)).toBe(false)
    expect(r.data.cards.map((c) => c.id)).not.toContain(FOREIGN_POST)
    expect(JSON.stringify(r.data)).not.toContain('Other workspace')
    for (const table of ['videos', 'comments']) {
      for (const f of filtersOf(r.calls, table)) expect(f, table).toContain(`client_id=${CLIENT}`)
    }
  })

  it('the session\'s own post opens (the control)', async () => {
    const r = await measure(posts, { post: OWN(2) }, withForeign())
    expect(r.data.cards.find((c) => c.id === OWN(2))?.open).toBe(true)
  })
})

describe('the reply list\'s page reads only the tenant\'s own videos', () => {
  it('names the session\'s client on every read of videos and comments', async () => {
    const r = await measure(replies, {}, withForeign())
    for (const f of filtersOf(r.calls, 'videos')) expect(f).toContain(`client_id=${CLIENT}`)
    expect(JSON.stringify(r.data)).not.toContain('Other workspace')
    // Its comments are under the videos the queue read: each named by its row.
    expect(r.data.kinds.flatMap((k) => k.videos).every((v) => v.id === null || [OWN(1), OWN(2), OWN(3), ...[1, 2, 3, 4, 5, 6].map(VID)].includes(v.id))).toBe(true)
  })
})

// ---- an idea's page beside the root's card ------------------------------------------
//
// The page and the card that opened it read the same rules (the root's anchor,
// lib/pages/v2/content.ts `loadContentPage`), so they never disagree about a
// week, a month or a flag.

const OLD_RUN = '00000000-0000-4000-8000-0000000000b0'
const OLD_WINDOW = { from: '2026-09-27T04:03:00.000Z', to: '2026-10-04T04:02:00.000Z' }
const OLD_READ = { from: '2026-09-06T04:02:00.000Z', to: '2026-10-04T04:02:00.000Z' }

/** Idea 1 from a set a week older than the published read, the read naming
 *  its conversation new this week. */
function olderSet() {
  const t = contentTables()
  const [first] = t.post_ideas
  return {
    ...t,
    post_ideas: [{ ...first, run_id: OLD_RUN, window_start: OLD_WINDOW.from, window_end: OLD_WINDOW.to, read_start: OLD_READ.from, read_end: OLD_READ.to }],
    week_reads: [{ ...t.week_reads[0], data: { version: 2, window: WINDOW, newThisWeek: [{ themeId: LINER, label: 'Liner lifespan and replacement' }] } }],
  }
}

describe('a post idea\'s page beside the root\'s card', () => {
  it('judges the week read\'s "new" over the page\'s month, as the card does, never an older set\'s own month', async () => {
    const r = await measure(ideaPage(IDEA(1)), {}, olderSet() as ReturnType<typeof contentTables>)
    const page = r.data.page!
    // The idea's figures sit beside ITS month (an older set's read window's).
    expect(page.week.current).toBe(false)
    expect(page.week.month.month).toBe('2026-09-01')
    // Its "new" is the page's week's flag, on the page's month.
    expect(page.flag?.flags).toContain('new')
    expect(page.flag?.window).toMatchObject({ kind: 'month', from: '2026-10-01' })
    // The card on the root says the same.
    const root = await measure(rootPage, {}, olderSet() as ReturnType<typeof contentTables>)
    expect(root.data.ideas.cards[0].flag?.window).toEqual(page.flag?.window)
  })

  it('an idea from the newest set, older than the published read, says the root\'s own line', async () => {
    const r = await measure(ideaPage(IDEA(1)), {}, olderSet() as ReturnType<typeof contentTables>)
    expect(r.data.page!.older).toBe('No new ideas this week. These are from the week of 28 Sep.')
  })

  it('an idea from an earlier set than the newest never says "No new ideas this week": it names its week', async () => {
    const t = contentTables()
    const earlier = { ...t.post_ideas[0], id: IDEA(9), run_id: OLD_RUN, window_start: OLD_WINDOW.from, window_end: OLD_WINDOW.to, read_start: OLD_READ.from, read_end: OLD_READ.to, created_at: '2026-10-04T05:10:00.000Z' }
    const r = await measure(ideaPage(IDEA(9)), {}, { ...t, post_ideas: [...t.post_ideas, earlier] })
    const page = r.data.page!
    expect(page.week.current).toBe(false)
    expect(page.older).toBe('This idea was written for the week of 28 Sep, before the ideas Content shows now.')
    // Its switcher is its own set's (one idea), never this week's.
    expect(r.data.crumbs[1].menu).toBeNull()
  })
})
