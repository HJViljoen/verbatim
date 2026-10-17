import { OSSUR_CLIENT_ID } from '../../config'
import { printsMedicalLine } from '../../post-ideas/medical'
import type { PostIdeaRow } from '../../post-ideas/types'
import type { QuoteVideo } from '../../quote-gate'
import { gateFor } from '../../quote-context'
import { summariseOwnedPosts, type OwnedPost } from '../../reading/owned'
import {
  agentHref, conversationHref, contentWeek, groupsByConversation, ideaOwnedFrom, ideasWeekOf, mixSentence, monthWords, ownTouch,
  postsBlock, recipe, repliesView, wordsToBorrow, type ContentPeriod, type MarketVideoCard,
} from './content'
import { earlierIdeaLine, ideaCrumbs, subquestionCards, type ContentIdeaData, type IdeaPage, type IdeaPageState, type SubCommentRow } from './content-idea'
import { contentCrumb, elsewhereIdeas, POSTS_PAGE, postsLine, REPLIES_PAGE, repliesLine, type Elsewhere } from './content-levels'
import { contentPostsHref, type ReplySection } from './content-address'
import { kindCounts, postCards, shownPosts, type PostCommentRow, type PostsPageData } from './content-posts'
import { replyKinds, replyPlatforms, repliesDates, repliesLead, type RepliesPageData, type ReplyVideoRow } from './content-replies'
import { formatLabel, openingLabel } from './content'
import {
  ASKED_LABELS, ID, IDEA_VIDEOS, idea, INSURANCE_FLAG, MONTH_COUNTS, OCT, OSSUR_FORMATS, OSSUR_IDEAS, OSSUR_OWNED, OSSUR_OWNED_SINCE, OSSUR_PERSONAS,
  OSSUR_REPLIES, OSSUR_TYPICAL, post, READ_COUNTS, READ_MARKET, REG, REPLY_VIDEOS, RUN, VID, W0, W1, W2, WEEK_COUNTS, WINDOW,
} from './content-fixture'

// CONTENT'S LEVEL PAGES' FIXTURES (depth as pages, 17 Oct; the G5 boards):
// Össur-shaped, the boards' own illustrative figures and words (the board
// report lists the invented ones: the sub-questions' comments, one in
// Spanish, the platform split, every reply's video and poster, the posts'
// comments, the whole thin idea apart from its title, cover, format and
// length), built through the loaders' pure builders, so the render tests and
// the shots exercise the same shaping the loaders do. No tenant row is read.

const WEEK = contentWeek(RUN, WINDOW)!

/** A market video the sub-questions' comments sit under, as the quote gate
 *  reads it. */
const MARKET_VIDEO: QuoteVideo = {
  platform: 'tiktok', videoId: 'mv1', caption: 'Your liner has an expiry date', hashtags: [], topics: ['liner', 'prosthetic'],
  accountName: 'The Amputee Diaries', isClient: false, isCompetitor: false, competitorName: null, source: 'discovered', segment: null,
}

/** The first comments of each of idea 1's sub-questions, as the board quotes
 *  them; the rest are the same kind of question, worded apart. */
const SUB_TEXTS: Record<number, { text: string; platform: string; date: string }[]> = {
  0: [
    { text: 'Mine lasted eight months before it started slipping. Is that normal?', platform: 'instagram', date: '2026-10-05T10:00:00.000Z' },
    { text: 'How long does yours last if you run every day?', platform: 'instagram', date: '2026-10-08T10:00:00.000Z' },
  ],
  1: [
    { text: 'Is it normal that my liner feels loose after six months? Nobody told me they wear out.', platform: 'instagram', date: '2026-10-06T10:00:00.000Z' },
    { text: 'Mine stops holding by lunchtime now. New liner or new socket?', platform: 'tiktok', date: '2026-10-08T10:00:00.000Z' },
  ],
  2: [
    { text: 'Does a thicker liner last longer, or does it just feel hotter?', platform: 'tiktok', date: '2026-10-02T10:00:00.000Z' },
    { text: 'Is the gel one worth it over the silicone one?', platform: 'youtube', date: '2026-09-27T10:00:00.000Z' },
  ],
  3: [
    { text: 'Does medical aid cover a new liner every year, or do I pay for it myself?', platform: 'instagram', date: '2026-10-09T10:00:00.000Z' },
    { text: '¿El seguro cubre un liner nuevo cada año?', platform: 'tiktok', date: '2026-09-30T10:00:00.000Z' },
  ],
}
const SPANISH = '¿El seguro cubre un liner nuevo cada año?'
const FILLERS = [
  'How often do you all change yours, every year or sooner?',
  'Does sweat in summer make the liner wear out faster for anyone else?',
  'My prosthetist never said how long it should last, what is normal?',
  'Is it worth keeping a spare liner for when the first one goes?',
  'How do you tell the difference between a worn liner and a bad fit?',
  'Does washing it every night make it last longer or shorter?',
  'Anyone found a liner that lasts more than a year with daily use?',
  'What is the first sign yours is going, the smell or the slipping?',
  'Do thicker liners really hold up better on long walking days?',
  'Should the clinic replace it for free if it tears within months?',
  'Is it normal to need a new liner when your weight changes a little?',
  'How long did your very first liner last compared with now?',
  'Does the cold make a liner crack sooner in winter months?',
  'How many hours a day do you wear yours before it gets loose?',
  'Is a cheaper liner worth it if you have to replace it twice as often?',
  'Can you repair a small tear or does it have to go straight away?',
  'Why does mine roll down at the top after a few weeks of wear?',
  'Does lotion on the skin wear the inside of the liner faster?',
  'How do you store a spare so it does not lose its shape?',
  'Is it the liner or the socket when you start to get blisters?',
  'Does running every day shorten the life of a liner a lot?',
  'Will my insurer pay for two liners a year or only one?',
  'Is the silicone one better than gel for people who sweat a lot?',
  'How do you know a new liner is the right size before you buy it?',
  'Does a liner last longer if you rotate between two of them?',
]

/** Idea 1's sub-question comments: a row per stored id, the board's words
 *  first. */
function subRows(row: PostIdeaRow, texts: Record<number, { text: string; platform: string; date: string }[]>): SubCommentRow[] {
  let f = 0
  return row.subquestions.flatMap((s, si) => s.commentIds.map((id, ci) => {
    const t = texts[si]?.[ci]
    return {
      id,
      text: t?.text ?? FILLERS[f++ % FILLERS.length],
      platform: t?.platform ?? 'tiktok',
      comment_date: t?.date ?? '2026-10-01T10:00:00.000Z',
      video_id: 'mv1',
    }
  }))
}

/** The thin idea (Össur's dry run, 13 Oct): its title, cover, format and
 *  length are the row's; the rest is the board's. */
export const THIN_IDEA: PostIdeaRow = idea({
  id: 'i0000009-0000-4000-8000-000000000000',
  rank: 1,
  registry_id: 'a1000000-0000-4000-8000-000000000010',
  title: 'Why use this instead of a prosthesis, and how does it work?',
  cover: {
    text: 'Why someone might use this setup or a prosthesis, how it sits in a shoe and what the opening does, what movement and balance look like, and what everyday tasks and longer days feel like',
    length: { fromSeconds: 10, toSeconds: 60, videos: 28, basis: 'format' },
    asked: { comments: 9, videos: 6 },
  },
  subquestions: [
    { label: 'Why use this instead', commentIds: Array.from({ length: 6 }, (_, i) => ID(300 + i)), videoIds: Array.from({ length: 4 }, (_, i) => VID(70 + i)) },
    { label: 'How it works with shoes', commentIds: Array.from({ length: 3 }, (_, i) => ID(310 + i)), videoIds: Array.from({ length: 2 }, (_, i) => VID(80 + i)) },
  ],
  format: 'story', format_multiple: 1.1, opening: null, opening_multiple: null,
})

const THIN_TEXTS: Record<number, { text: string; platform: string; date: string }[]> = {
  0: [
    { text: 'Why not a prosthetic leg instead? Curious, not judging.', platform: 'tiktok', date: '2026-10-08T10:00:00.000Z' },
    { text: 'Is this easier day to day than a full leg?', platform: 'tiktok', date: '2026-09-29T10:00:00.000Z' },
  ],
  1: [{ text: 'How does the shoe stay on when you step down on it?', platform: 'instagram', date: '2026-10-06T10:00:00.000Z' }],
}

const THIN_VIDEOS: MarketVideoCard[] = [
  { id: VID(70), title: 'Day 400 with my rotationplasty, ask me anything', account: '@rotation.life', platform: 'tiktok', format: 'Story', opening: 'A question', multiple: null, url: 'https://example.com/v70' },
  { id: VID(80), title: 'How my foot works inside the shoe', account: '@onefoot.forward', platform: 'instagram', format: 'How-to', opening: 'Showing it', multiple: null, url: 'https://example.com/v80' },
]

export interface IdeaFixtureOptions {
  rank?: 1 | 2 | 3
  /** The board's thin idea (G5-Content-Idea-Thin). */
  thin?: boolean
  /** Written for an earlier week than the root's. */
  older?: boolean
  /** A sub-question's comments opened (`?sub=`). */
  sub?: number | null
  /** The page names no idea. */
  state?: Exclude<IdeaPageState, 'ready'>
  /** The sub-questions' comments could not be read. */
  commentsUnread?: boolean
  clientId?: string
}

/** A post idea's page as the G5 boards draw it. */
export function contentIdeaFixture(opts: IdeaFixtureOptions = {}): ContentIdeaData {
  if (opts.state) return { state: opts.state, page: null, crumbs: [contentCrumb()] }
  const clientId = opts.clientId ?? OSSUR_CLIENT_ID
  const row = opts.thin ? THIN_IDEA : OSSUR_IDEAS.find((i) => i.rank === (opts.rank ?? 1))!
  const set = opts.thin ? [THIN_IDEA] : OSSUR_IDEAS.slice(0, 2)
  const older = opts.older ? { ...row, run_id: 'r0000000-0000-4000-8000-000000000000', window_start: '2026-09-20T04:03:00.000Z', window_end: '2026-09-27T04:02:00.000Z', read_start: '2026-08-30T04:02:00.000Z', read_end: '2026-09-27T04:02:00.000Z' } : row
  const ideasWeek = ideasWeekOf([older], WEEK)!
  const rows = opts.commentsUnread ? null : subRows(row, opts.thin ? THIN_TEXTS : SUB_TEXTS)
  const translations = new Map([[SPANISH, { lang: 'es', english: 'Does insurance cover a new liner every year?' }]])
  const labels = ideasReadOf4()
  const id = row.registry_id
  const label = opts.thin ? 'How the prosthesis works' : row.registry_id === REG.liner ? 'How long a liner lasts' : ASKED_LABELS.find((l) => l.registryId === id)?.label ?? null
  const flag = id === REG.insurance ? INSURANCE_FLAG : null
  const page: IdeaPage = {
    id: row.id,
    rank: row.rank,
    registryId: id,
    title: row.title,
    label,
    cover: row.cover.text,
    medical: printsMedicalLine(clientId),
    week: ideasWeek,
    read: opts.thin ? { k: 22, n: READ_MARKET } : { k: READ_COUNTS.get(id) ?? 0, n: READ_MARKET },
    month: opts.thin ? { k: 13, n: 318 } : { k: MONTH_COUNTS.get(id) ?? 0, n: 318 },
    weeks: opts.thin
      ? [3, 2, 4, 13].map((count, i) => ({ label: labels[i], count }))
      : [W0, W1, W2, WEEK_COUNTS].map((m, i) => ({ label: labels[i], count: m.get(id) ?? 0 })),
    platforms: opts.thin
      ? [{ platform: 'tiktok', videos: 14 }, { platform: 'instagram', videos: 6 }, { platform: 'youtube', videos: 2 }]
      : [{ platform: 'tiktok', videos: 21 }, { platform: 'instagram', videos: 16 }, { platform: 'youtube', videos: 11 }],
    flag,
    format: recipe(row.format, row.format_multiple, 'format'),
    opening: recipe(row.opening, row.opening_multiple, 'opening'),
    length: row.cover.length ?? null,
    asked: row.cover.asked ?? null,
    subquestions: subquestionCards({ idea: row, rows, translations, video: (cid) => ({ ...MARKET_VIDEO, videoId: `mv-${cid}` }), gate: gateFor(clientId, { allowOwn: true, claim: row.title }), open: opts.sub ?? null }),
    groups: opts.thin ? [] : groupsByConversation(OSSUR_PERSONAS).get(id) ?? [],
    own: ownTouch([label ?? row.title], OSSUR_OWNED_SINCE, ideaOwnedFrom('2026-10-01')),
    words: opts.thin ? [] : wordsToBorrow([
      { id: 'w1', phrase: 'feels loose' },
      { id: 'w2', phrase: 'nobody told me they wear out' },
      { id: 'w3', phrase: 'stops holding by lunchtime' },
      { id: 'w4', phrase: 'my skin can tell' },
    ]),
    videos: opts.thin ? THIN_VIDEOS : row.rank === 1 ? IDEA_VIDEOS : IDEA_VIDEOS.slice(1),
    typicalWords: monthWords(ideasWeek.month),
    askHref: agentHref(`Draft an outline for a post that answers this question from my market: ${row.title}`),
    conversationHref: conversationHref(id),
    // An earlier set than the anchor run's (a newer set exists): the loader's
    // `earlierIdeaLine`, never the root's "No new ideas this week".
    older: ideasWeek.current ? null : earlierIdeaLine(ideasWeek, true),
  }
  const siblings = set.map((r) => ({ id: r.id, title: r.title, rank: r.rank, flag: r.registry_id === REG.insurance ? INSURANCE_FLAG : null }))
  return { state: 'ready', page, crumbs: ideaCrumbs(page, siblings, ideasWeek) }
}

/** The four weeks' names (14 Sep, 21 Sep, 28 Sep, 5 Oct). */
function ideasReadOf4(): string[] {
  return ideasWeekOf(OSSUR_IDEAS, WEEK)!.read.weeks!.map((w) => w.label)
}

// ---- Elsewhere on Content ------------------------------------------------------------

const ELSEWHERE_READ = {
  market: READ_MARKET,
  themes: READ_COUNTS,
  month: { market: 318, themes: MONTH_COUNTS },
}

function elsewhere(page: 'posts' | 'replies', opts: { noIdeas?: boolean } = {}): Elsewhere {
  const anchor = { ideas: opts.noIdeas ? [] : OSSUR_IDEAS, ideasWeek: ideasWeekOf(OSSUR_IDEAS, WEEK) }
  return {
    ideas: elsewhereIdeas(anchor, ELSEWHERE_READ),
    medical: printsMedicalLine(OSSUR_CLIENT_ID),
    ideasLine: opts.noIdeas ? 'Post ideas are not switched on for this workspace.' : null,
    page: page === 'posts' ? { ...POSTS_PAGE, line: postsLine(9, OCT) } : { ...REPLIES_PAGE, line: repliesLine(WEEK, OCT) },
  }
}

// ---- Worth a reply --------------------------------------------------------------------

export interface RepliesFixtureOptions {
  period?: ContentPeriod
  kind?: ReplySection | null
  /** The list could not be read; or no update has covered a week. */
  state?: 'unread' | 'no_week' | 'empty'
  noIdeas?: boolean
}

/** The reply list's page as the G5 board draws it. */
export function contentRepliesFixture(opts: RepliesFixtureOptions = {}): RepliesPageData {
  const period = opts.period ?? 'week'
  const window = period === 'month' ? { from: OCT.from, to: WINDOW.to, phrase: 'in October so far' } : { from: WEEK.from, to: WEEK.to, phrase: 'between 5 and 11 Oct' }
  const block = opts.state === 'empty' ? { ...OSSUR_REPLIES, rows: [], flagged: [], total: 0 } : OSSUR_REPLIES
  const view = opts.state === 'unread'
    ? repliesView(null, window)
    : opts.state === 'no_week'
      ? { ...repliesView(null, null), unread: 'No update has covered a week yet, so there is no reply list.' }
      : repliesView(block, window)
  const videos = new Map<string, ReplyVideoRow>(Object.values(REPLY_VIDEOS).map((v) => [v.id, { ...v }]))
  return {
    brand: 'Össur',
    period,
    view,
    dates: opts.state === 'no_week' ? null : repliesDates(period, WEEK, OCT),
    isWeek: true,
    kinds: replyKinds(view, videos, { period, kind: opts.kind ?? null }),
    platforms: replyPlatforms(view),
    lead: repliesLead(period, opts.state === 'no_week' ? null : window, true),
    crumbs: [contentCrumb(), { label: 'Worth a reply', href: null }],
    elsewhere: elsewhere('posts', { noIdeas: opts.noIdeas }),
    askHref: agentHref('What do people want from us in the comments worth a reply between 5 and 11 Oct, and how should we answer them?'),
  }
}

// ---- Your posts -----------------------------------------------------------------------

/** The comments under each of the first posts, as the board quotes them; the
 *  rest under each are short and plain. Post 3's others are a single emoji,
 *  which never prints. */
const POST_TEXTS: Record<number, string[]> = {
  1: ['Can the Navii go in the sea or only the shower?', 'Finally a knee I could take to the beach.'],
  2: ['Is the Pro-Flex covered by medical aid here or do I pay myself?', 'What is the difference from the old Pro-Flex?'],
  3: ['Will you bring this to a fair in South Africa?'],
  4: ['Can I switch from my old foot to the Pro-Flex without a new socket?', 'This made me cry. A year is nothing, keep going.'],
  5: ['Where can I try the Navii in Cape Town? My clinic only has older knees.', 'How do I get a quote for the Rheo through my prosthetist?'],
}
const POST_FILLERS = [
  'Love seeing this, thank you for sharing it with us all.',
  'My prosthetist showed me this last week and I want to try it.',
  'Does this come in a smaller size for teenagers as well?',
  'How long is the waiting list for one of these right now?',
  'Great to see real people using it on normal days out.',
  'Is there a clinic in Durban that fits this one already?',
  'This is exactly the kind of video I needed to see today.',
  'Would this work for someone with a shorter residual limb?',
]

/** Comments under the posts: as many as each post's own count. */
export function postCommentRows(posts: readonly OwnedPost[]): PostCommentRow[] {
  let f = 0
  return posts.flatMap((p, pi) => Array.from({ length: p.comments_count }, (_, i) => {
    const n = pi + 1
    const text = POST_TEXTS[n]?.[i] ?? (n === 3 ? '🔥' : POST_FILLERS[f++ % POST_FILLERS.length])
    return { id: `pc${String(n).padStart(2, '0')}${String(i).padStart(3, '0')}-0000-4000-8000-000000000000`, text, platform: p.platform, comment_date: `${p.upload_date}T${String(20 - Math.min(i, 9)).padStart(2, '0')}:00:00.000Z`, video_id: p.video_id, author: `viewer${i}` }
  }))
}

export interface PostsFixtureOptions {
  all?: boolean
  post?: string | null
  state?: 'unread' | 'none' | 'comments_unread'
  noIdeas?: boolean
}

/** Your posts' page as the G5 board draws it. */
export function contentPostsFixture(opts: PostsFixtureOptions = {}): PostsPageData {
  const owned = opts.state === 'unread' ? null : opts.state === 'none' ? summariseOwnedPosts([], { from: '2026-10-01', to: '2026-11-01' }) : OSSUR_OWNED
  const posts = owned?.posts ?? []
  const open = opts.post && posts.some((p) => p.id === opts.post) ? opts.post : null
  const shown = shownPosts(posts, { all: Boolean(opts.all), open })
  const block = postsBlock({ owned, typical: OSSUR_TYPICAL, month: OCT })
  const formats = kindCounts(posts, 'classified_type', formatLabel)
  const openings = kindCounts(posts, 'hook_style', openingLabel)
  const desktop = opts.all ? 0 : Math.max(0, posts.length - shown.length)
  const phoneShown = opts.all ? shown.length : shown.filter((p, i) => i < 3 || p.id === open).length
  const phone = Math.max(0, posts.length - phoneShown)
  return {
    month: OCT,
    block,
    lead: owned && owned.total > 0 ? mixSentence({ formats: OSSUR_FORMATS, openings: [], posts: owned.total, unclassified: 0, month: OCT.month, complete: false }) : owned ? [`You published nothing of your own ${monthWords(OCT)}.`] : null,
    cards: postCards({ posts: shown, typical: OSSUR_TYPICAL, best: block.best?.id ?? null, comments: opts.state === 'comments_unread' ? null : postCommentRows(posts), translations: new Map(), gate: gateFor(OSSUR_CLIENT_ID, { allowOwn: true }), open, all: Boolean(opts.all) }),
    more: !opts.all && (desktop > 0 || phone > 0) ? { href: contentPostsHref({ all: true }), desktop, phone } : null,
    all: Boolean(opts.all),
    capped: null,
    formats: formats.rows,
    openings: openings.rows,
    unread: { format: formats.unread, opening: openings.unread },
    commentsUnread: opts.state === 'comments_unread',
    crumbs: [contentCrumb(), { label: 'Your posts', href: null }],
    elsewhere: elsewhere('replies', { noIdeas: opts.noIdeas }),
    askHref: agentHref('How did my own posts do in October so far, and what did people say under them?'),
  }
}

/** A month with more posts than `POSTS_MAX` would list, for `?all=1`. */
export function manyPosts(n: number): OwnedPost[] {
  return Array.from({ length: n }, (_, i) => ({ ...post(100 + i, 'instagram', `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, 'promotional', 'before-after', 2, `Post ${i}`, []), comments_count: 0 }))
}
