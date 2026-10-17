import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import type { PostIdeaRow } from '../../post-ideas/types'
import { gateFor } from '../../quote-context'
import type { QuoteVideo } from '../../quote-gate'
import {
  contentIdeaHref, contentIdeaPath, contentPostsHref, contentRepliesHref, CONTENT_POSTS_PATH, CONTENT_REPLIES_PATH, isContentPage, postAnchor, subAnchor,
} from './content-address'
import { flagNote, ideaCrumbs, openedSubNote, showSubComments, subParam, subquestionCards, SUB_COMMENTS_MAX, type SubCommentRow } from './content-idea'
import { anchorFrom, elsewhereIdeas, elsewhereIdeasLine, postsLine, repliesLine } from './content-levels'
import { kindCounts, leadOf, postCards, postParam, POSTS_MAX, shownPosts, type PostCommentRow } from './content-posts'
import { kindParam, replyKinds, replyLinkLabel, replyPlatforms, repliesDates, repliesLead, REPLY_VIDEOS_PHONE, type ReplyVideoRow } from './content-replies'
import { contentWeek, formatLabel, openingLabel, repliesView } from './content'
import { INSURANCE_FLAG, OCT, OSSUR_IDEAS, OSSUR_OWNED, OSSUR_REPLIES, REPLY_VIDEOS, RUN, WINDOW } from './content-fixture'
import { contentIdeaFixture, manyPosts, postCommentRows } from './content-levels-fixture'

// CONTENT'S LEVEL PAGES, THEIR PURE BUILDERS (depth as pages, 17 Oct; the G5
// boards): the addresses, the idea's path and switcher, its sub-questions and
// their comments, the reply list grouped under its videos, your posts and the
// comments under them, the root's anchor and the foot.

const WEEK = contentWeek(RUN, WINDOW)!

describe('Content\'s addresses', () => {
  it('names an idea by its row, a sub-question by its place, the reply list with its period and kind, your posts with all or one open', () => {
    expect(contentIdeaPath('i-1')).toBe('/dashboard/content/ideas/i-1')
    expect(contentIdeaHref('i-1', { sub: 2 })).toBe(`/dashboard/content/ideas/i-1?sub=2#${subAnchor(2)}`)
    expect(contentRepliesHref()).toBe(CONTENT_REPLIES_PATH)
    expect(contentRepliesHref({ period: 'month', kind: 'questions' })).toBe('/dashboard/content/replies?period=month&kind=questions#questions')
    expect(contentPostsHref()).toBe(CONTENT_POSTS_PATH)
    expect(contentPostsHref({ all: true })).toBe('/dashboard/content/posts?all=1#posted')
    expect(contentPostsHref({ post: 'p-1' })).toBe(`/dashboard/content/posts?post=p-1#${postAnchor('p-1')}`)
  })

  it('knows its own pages', () => {
    for (const p of ['/dashboard/content', '/dashboard/content/replies', '/dashboard/content/posts', '/dashboard/content/ideas/x']) expect(isContentPage(p), p).toBe(true)
    for (const p of ['/dashboard/content/ideas', '/dashboard/content/ideas/x/y', '/dashboard/market']) expect(isContentPage(p), p).toBe(false)
  })
})

describe('a post idea\'s path and switcher', () => {
  const set = OSSUR_IDEAS.slice(0, 3).map((r) => ({ id: r.id, title: r.title, rank: r.rank, flag: r.rank === 2 ? INSURANCE_FLAG : null }))
  const week = { label: '5 to 11 Oct' }

  it('reads "Content / {idea}", the set in rank order, the page ticked, a flag as its state word and never a figure', () => {
    const crumbs = ideaCrumbs({ id: set[0].id, title: set[0].title }, [...set].reverse(), week)
    expect(crumbs.map((c) => [c.label, c.href])).toEqual([['Content', '/dashboard/content'], [set[0].title, null]])
    expect(crumbs[1].slot).toBe('post_idea')
    const menu = crumbs[1].menu!
    expect(menu).toMatchObject({ label: 'Post ideas for 5 to 11 Oct', switchLabel: 'Switch to another post idea', wide: 460 })
    expect(menu.items.map((i) => [i.label, i.current, i.note])).toEqual([
      [set[0].title, true, null], [set[1].title, false, 'Unusual this week'], [set[2].title, false, null],
    ])
    expect(menu.items.map((i) => i.href)).toEqual(set.map((r) => `/dashboard/content/ideas/${r.id}`))
    for (const i of menu.items) expect(i.note ?? '').not.toMatch(/\d/)
  })

  it('draws no chevron with one idea', () => {
    expect(ideaCrumbs({ id: set[0].id, title: set[0].title }, set.slice(0, 1), week)[1].menu).toBeNull()
  })

  it('words a flag as the chip does, and nothing else', () => {
    expect(flagNote(INSURANCE_FLAG)).toBe('Unusual this week')
    expect(flagNote(null)).toBeNull()
  })
})

describe('a post idea\'s sub-questions', () => {
  const row: PostIdeaRow = OSSUR_IDEAS[0]
  const video = (id: string): QuoteVideo => ({ platform: 'tiktok', videoId: `mv-${id}`, caption: 'c', hashtags: [], topics: ['liner'], accountName: 'A', isClient: false, isCompetitor: false, competitorName: null, source: 'discovered', segment: null })
  const rows: SubCommentRow[] = row.subquestions.flatMap((s, si) => s.commentIds.map((id, ci) => ({ id, text: `How long should a liner last for someone like me, question ${si}.${ci}?`, platform: 'instagram', comment_date: '2026-10-05T10:00:00.000Z', video_id: 'mv' })))
  const cards = (open: number | null, r: SubCommentRow[] | null = rows) => subquestionCards({ idea: row, rows: r, translations: new Map(), video, gate: gateFor(OSSUR_CLIENT_ID, { allowOwn: true, claim: row.title }), open })

  it('counts each off its ids, the most videos first, its figure of the videos asked', () => {
    const c = cards(null)
    expect(c.map((x) => [x.n, x.label, x.videos, x.comments, x.of])).toEqual([
      [1, 'How long it should last', 11, 14, 23], [2, 'The signs it is worn out', 8, 9, 23], [3, 'Whether liners differ', 5, 6, 23], [4, 'Whether medical aid pays', 4, 4, 23],
    ])
  })

  it('shows two comments, one a video, and counts every one that may print; opened, every one', () => {
    const [first] = cards(null)
    expect(first.quotes).toHaveLength(2)
    expect(first.quotable).toBe(14)
    expect(first.href).toBe(`/dashboard/content/ideas/${row.id}?sub=1#sub-1`)
    expect(showSubComments(first)).toEqual({ shown: 14, of: null })
    const open = cards(1)[0]
    expect(open.quotes).toHaveLength(14)
    expect(open.open).toBe(true)
    expect(open.href).toBe(`/dashboard/content/ideas/${row.id}#sub-1`)
    expect(showSubComments(open)).toBeNull()
    expect(openedSubNote(open)).toBeNull()
  })

  it('says "Show 9 of 14" where fewer may print, and opened says the rest are counted, not quoted', () => {
    const fewer = rows.map((r, i) => (i < 5 ? { ...r, text: '🔥' } : r))
    const [first] = cards(null, fewer)
    expect(first.quotable).toBe(9)
    expect(showSubComments(first)).toEqual({ shown: 9, of: 14 })
    expect(openedSubNote(cards(1, fewer)[0])).toBe('The other 5 are counted, not quoted: a comment prints only where it reads clearly and speaks to this.')
  })

  it('caps an opened list and says the cap is the reason', () => {
    expect(openedSubNote({ open: true, quotable: SUB_COMMENTS_MAX + 20, comments: SUB_COMMENTS_MAX + 30 })).toBe(`The first ${SUB_COMMENTS_MAX} of the ${SUB_COMMENTS_MAX + 20} that can be quoted are shown; 10 more are counted, not quoted.`)
  })

  it('where its comments could not be read, prints none and counts none that may print', () => {
    const c = cards(null, null)
    expect(c.every((x) => x.quotes.length === 0 && x.quotable === null)).toBe(true)
    expect(c.map((x) => x.comments)).toEqual([14, 9, 6, 4])
  })

  it('opens only a sub-question the idea has (`?sub=`)', () => {
    expect(['1', '4', ' 2 ', '0', '5', 'x', '1.5', '', undefined].map((v) => subParam(v, 4))).toEqual([1, 4, 2, null, null, null, null, null, null])
    expect(subParam(['3', '1'], 4)).toBe(3)
  })

  it('the fixture draws the board\'s idea through these builders', () => {
    const d = contentIdeaFixture()
    expect(d.page!.subquestions.map((s) => s.comments)).toEqual([14, 9, 6, 4])
    expect(d.page!.read).toEqual({ k: 48, n: 640 })
    expect(d.page!.month).toEqual({ k: 31, n: 318 })
  })
})

describe('the reply list, grouped as the page draws it', () => {
  const view = repliesView(OSSUR_REPLIES, { from: WEEK.from, to: WEEK.to, phrase: 'between 5 and 11 Oct' })
  const videos = new Map<string, ReplyVideoRow>(Object.values(REPLY_VIDEOS).map((v) => [v.id, { ...v }]))

  it('lists the four kinds in order, each comment under the video it was written on', () => {
    const kinds = replyKinds(view, videos, { period: 'week', kind: null })
    expect(kinds.map((k) => [k.key, k.comments, k.videos.length])).toEqual([['buy', 5, 4], ['questions', 3, 3], ['objections', 3, 3], ['wrong', 1, 1]])
    const [rheo] = kinds[0].videos
    expect(rheo).toMatchObject({ account: '@ossur', platform: 'Instagram', posted: '7 Oct', caption: 'Rheo Knee. Designed around you.', under: 'own_post', hrefLabel: 'Open the post on Instagram' })
    expect(rheo.comments.map((c) => [c.date, c.likes])).toEqual([['9 Oct', 12], ['7 Oct', 3]])
    expect(kinds[0].videos[3]).toMatchObject({ account: 'The Amputee Diaries', under: 'names_you', hrefLabel: 'Reply on YouTube' })
    // Wrong information carries no reply link, by construction.
    expect(kinds[3].videos[0]).toMatchObject({ href: null, hrefLabel: null })
  })

  it('on a phone, lists two videos a kind and offers the rest by an address; a kind asked for is listed in full', () => {
    const kinds = replyKinds(view, videos, { period: 'week', kind: null })
    expect(kinds.map((k) => k.moreHref)).toEqual(['/dashboard/content/replies?kind=buy#buy', '/dashboard/content/replies?kind=questions#questions', '/dashboard/content/replies?kind=objections#objections', null])
    expect(REPLY_VIDEOS_PHONE).toBe(2)
    const full = replyKinds(view, videos, { period: 'month', kind: 'buy' })
    expect(full[0]).toMatchObject({ full: true, moreHref: null })
    expect(full[1].moreHref).toBe('/dashboard/content/replies?period=month&kind=questions#questions')
  })

  it('keeps a video whose row was not read, named by its platform; a comment with no video stands alone', () => {
    const kinds = replyKinds(view, new Map(), { period: 'week', kind: null })
    expect(kinds[0].videos).toHaveLength(4)
    expect(kinds[0].videos[0]).toMatchObject({ id: null, account: null, platform: 'Instagram', posted: null, caption: null })
    expect(kinds[0].videos[0].comments).toHaveLength(2)
    const bare = { ...view, rows: view.rows.map(({ videoRowId: _v, ...r }) => r) }
    expect(replyKinds(bare, videos, { period: 'week', kind: null })[0].videos).toHaveLength(5)
  })

  it('counts the comments by platform, names the days and writes its one line', () => {
    expect(replyPlatforms(view)).toEqual([{ platform: 'instagram', comments: 4 }, { platform: 'tiktok', comments: 4 }, { platform: 'youtube', comments: 4 }])
    expect(repliesDates('week', WEEK, OCT)).toBe('5 to 11 October')
    expect(repliesDates('month', WEEK, OCT)).toBe('October so far')
    expect(repliesDates('month', WEEK, { month: '2026-09-01', complete: true })).toBe('September')
    expect(repliesDates('week', null, OCT)).toBeNull()
    expect(repliesLead('week', null, true)).toBe('Comments from these seven days that ask you something, push back, or say they want to buy, each under the video it was written on.')
    expect(repliesLead('month', { from: '', to: '', phrase: 'in October so far' }, true)).toMatch(/^Comments from October so far that ask you something/)
    expect(repliesLead('week', null, false)).toMatch(/^Comments from these days that/)
    expect(replyLinkLabel('youtube')).toBe('Reply on YouTube')
    expect(replyLinkLabel('tiktok')).toBe('Open the post on TikTok')
  })

  it('takes only a kind it lists (`?kind=`)', () => {
    expect(['buy', 'questions', 'objections', 'wrong', 'all', 'buying', undefined].map((v) => kindParam(v))).toEqual(['buy', 'questions', 'objections', 'wrong', null, null, null])
  })
})

describe('your posts, and the comments under them', () => {
  const posts = OSSUR_OWNED.posts
  const comments = postCommentRows(posts)
  const gate = gateFor(OSSUR_CLIENT_ID, { allowOwn: true })
  const cards = (o: { open?: string | null; all?: boolean; comments?: PostCommentRow[] | null } = {}) =>
    postCards({ posts: shownPosts(posts, { all: Boolean(o.all), open: o.open ?? null }), typical: 3, best: posts[0].id, comments: o.comments === undefined ? comments : o.comments, translations: new Map(), gate, open: o.open ?? null, all: Boolean(o.all) })

  it('lists five, newest first, every one with `?all=1` (at most sixty), and the one `?post=` opens wherever it falls', () => {
    expect(shownPosts(posts, { all: false, open: null })).toHaveLength(5)
    expect(shownPosts(posts, { all: true, open: null })).toHaveLength(9)
    expect(shownPosts(posts, { all: false, open: posts[7].id }).map((p) => p.id)).toEqual([...posts.slice(0, 5), posts[7]].map((p) => p.id))
    expect(shownPosts(manyPosts(80), { all: true, open: null })).toHaveLength(POSTS_MAX)
  })

  it('opens only one of the month\'s own posts (`?post=`)', () => {
    expect(postParam(posts[2].id.toUpperCase(), posts)).toBe(posts[2].id)
    expect(postParam('00000000-0000-4000-8000-0000000002ff', posts)).toBeNull()
    expect(postParam('junk', posts)).toBeNull()
    expect(postParam(undefined, posts)).toBeNull()
  })

  it('draws each post\'s format, opening and response, the best marked, its comments and two that may print', () => {
    const [first, second, third] = cards()
    expect(first).toMatchObject({ platform: 'Instagram', posted: '10 Oct', format: 'How-to', opening: 'Showing it', multiple: 2.2, best: true, held: 6, onPlatform: null, quotable: 6 })
    expect(first.quotes.map((q) => q.text)).toEqual(['Can the Navii go in the sea or only the shower?', 'Finally a knee I could take to the beach.'])
    expect(second.best).toBe(false)
    // Its other comments a single emoji: one may print of eight.
    expect(third).toMatchObject({ held: 8, quotable: 1 })
    expect(first.href).toBe(`/dashboard/content/posts?post=${first.id}#post-${first.id}`)
  })

  it('leaves the post\'s own account\'s replies out, and states the platform\'s count where it holds more', () => {
    const own = [...comments, { id: 'own-reply', text: 'Thanks for asking, DM us and we will help you find a clinic.', platform: posts[0].platform, comment_date: '2026-10-10T23:00:00.000Z', video_id: posts[0].video_id, author: '@Ossur' }]
    const [first] = cards({ comments: own })
    expect(first.held).toBe(6)
    expect(first.quotes.map((q) => q.text)).not.toContain('Thanks for asking, DM us and we will help you find a clinic.')
    const fewer = comments.filter((c) => c.video_id !== posts[0].video_id || c.text?.startsWith('Can'))
    expect(cards({ comments: fewer })[0]).toMatchObject({ held: 1, onPlatform: 6, ownLeftOut: false })
    // The account replied: its reply is left out, and the card says so.
    expect(cards({ comments: own })[0]).toMatchObject({ held: 6, ownLeftOut: true })
    expect(cards({ comments: [...fewer, own[own.length - 1]] })[0]).toMatchObject({ held: 1, onPlatform: 6, ownLeftOut: true })
    expect(cards({ comments: null })[0].ownLeftOut).toBe(false)
  })

  it('opened, every comment that may print; unread, none', () => {
    const [open] = cards({ open: posts[0].id })
    expect(open.quotes).toHaveLength(6)
    expect(open.href).toBe(`/dashboard/content/posts#post-${posts[0].id}`)
    expect(cards({ comments: null })[0]).toMatchObject({ held: null, quotes: [], quotable: 0 })
  })

  it('counts them by format and by opening, the posts not read apart', () => {
    expect(kindCounts(posts, 'classified_type', formatLabel)).toEqual({ rows: [
      { key: 'promotional', label: 'Promotional', posts: 6 }, { key: 'behind-the-scenes', label: 'Behind the scenes', posts: 1 }, { key: 'how-to', label: 'How-to', posts: 1 }, { key: 'story', label: 'Story', posts: 1 },
    ], unread: 0 })
    expect(kindCounts(posts, 'hook_style', openingLabel).unread).toBe(1)
  })

  it('leads with code\'s sentence about the mix, its formats half', () => {
    const playbook = { formats: { sides: [] }, hooks: { sides: [] } } as never
    expect(leadOf(playbook, { ...OSSUR_OWNED, total: 0, posts: [] }, OCT)).toEqual(['You published nothing of your own in October so far.'])
    expect(leadOf(playbook, OSSUR_OWNED, OCT)).toBeNull()
  })
})

describe('the root\'s anchor, and the foot', () => {
  it('is the root\'s own rule: the newer week, ideas too old not printed, the state the row prints', () => {
    const a = anchorFrom({ state: 'ready', rows: OSSUR_IDEAS }, null, new Date('2026-10-13T08:00:00.000Z'))
    expect(a).toMatchObject({ ideasState: 'ready', week: { runId: RUN }, month: { month: '2026-10-01' } })
    expect(a.ideas).toHaveLength(3)
    const published = { runId: 'r-new', month: '2026-11-01', windowEnd: '2026-11-15T04:02:00.000Z', data: { window: { from: '2026-11-08T04:03:00.000Z', to: '2026-11-15T04:02:00.000Z' } } } as never
    const stale = anchorFrom({ state: 'ready', rows: OSSUR_IDEAS }, published, new Date('2026-11-16T08:00:00.000Z'))
    expect(stale).toMatchObject({ ideasState: 'stale', ideas: [], week: { runId: 'r-new' } })
    expect(anchorFrom(null, null, new Date()).ideasState).toBe('unread')
    expect(anchorFrom({ state: 'not_on', rows: [] }, null, new Date()).ideasState).toBe('not_on')
  })

  it('names the root\'s first two ideas, the four weeks only beside their month', () => {
    const anchor = anchorFrom({ state: 'ready', rows: OSSUR_IDEAS }, null, new Date('2026-10-13T08:00:00.000Z'))
    const read = { market: 640, themes: new Map([[OSSUR_IDEAS[0].registry_id, 48]]), month: { market: 318, themes: new Map([[OSSUR_IDEAS[0].registry_id, 31]]) } }
    const ideas = elsewhereIdeas(anchor, read)
    expect(ideas).toHaveLength(2)
    expect(ideas[0]).toMatchObject({ rank: 1, read: { k: 48, n: 640 }, month: 31, readLabel: '14 Sep to 11 Oct', monthWords: 'in October so far', href: `/dashboard/content/ideas/${OSSUR_IDEAS[0].id}` })
    // No month: no four-week figure (decision 1).
    expect(elsewhereIdeas(anchor, { ...read, month: { market: null, themes: null } })[0]).toMatchObject({ read: null, month: null })
    expect(elsewhereIdeas(anchor, null)[0]).toMatchObject({ read: null, month: null })
    expect(elsewhereIdeasLine('ready')).toBeNull()
    expect(elsewhereIdeasLine('none')).toBe('No post ideas were written for this week.')
  })

  it('words the other evidence page: your posts\' count, and the reply list\'s days with no count (the foot does not read the list)', () => {
    expect(postsLine(9, OCT)).toEqual([{ figure: '9' }, ' posts in October so far'])
    expect(postsLine(null, OCT)).toEqual(['Your posts could not be read just now.'])
    expect(repliesLine(WEEK, OCT)).toEqual(['Comments written between 5 and 11 Oct worth an answer from you'])
  })
})
