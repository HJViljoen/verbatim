import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import type { PostIdeaCover, PostIdeaLength, PostIdeaRow } from '../../post-ideas/types'
import { printsMedicalLine } from '../../post-ideas/medical'
import { ideasReadWindow } from '../../post-ideas/select'
import { summariseOwnedPosts, type OwnedPosts } from '../../reading/owned'
import type { Verdict } from '../../reading/verdicts'
import type { ReplyRow } from '../week'
import {
  askedWithLead, contentWeek, daysPhrase, ideaOwnedFrom, ideasReadOf, ideasWeekOf, flagVerdict, groupsByConversation, ideaCard, mixSentence,
  newVerdict, postsBlock, repliesView, storedPersonas, worksBasis,
  ASKED_NO_WEEK, IDEA_SLOTS,
  type AskedBlock, type ContentMonth, type ContentPageData, type ContentPeriod, type IdeaCard,
  type IdeasState, type IdeasWeek, type MarketVideoCard, type PostsBlock, type QuestionSlot, type WorksBlock, type WorksRow, type AskedRow,
} from './content'

// The Content page's fixtures (depth v2, T6): Össur-shaped, drawn from the
// E5 boards' own illustrative numbers, built through the loader's pure
// builders so the render tests and the shots exercise the same shaping the
// loader does. No tenant row is read. Where a board label has no stored value
// the fixture files it under the nearest one (the report lists them):
// Demonstration is `how-to`, Answering a comment `educational`, Day in the
// life `behind-the-scenes`, Product showcase `promotional`; the opening "The
// brand's name" has no nearest value and the fixture shows `before-after`.
//
// THE IDEA ROWS ARE T13'S SHAPE (lib/post-ideas/types.ts on depth/t13-ideas,
// copied from an Össur dry-run row's structure, not its words): `cover.text`
// is the writer's, `cover.length` and `cover.asked` are code's, a
// sub-question's `commentIds` are `comments.id` and its `videoIds`
// `videos.id`, and the multiples are on the question (1× = a typical market
// video on it).

export const RUN = 'r0000000-0000-4000-8000-000000000001'
export const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z' }
/** The four weeks the ideas read, ending where the run's window ends. */
const READ = ideasReadWindow(WINDOW)
export const ID = (n: number) => `c${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`
export const VID = (n: number) => `v${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`
const ids = (from: number, n: number, f = ID) => Array.from({ length: n }, (_, i) => f(from + i))

export const REG = {
  liner: 'a1000000-0000-4000-8000-000000000001',
  insurance: 'a1000000-0000-4000-8000-000000000002',
  water: 'a1000000-0000-4000-8000-000000000003',
  socket: 'a1000000-0000-4000-8000-000000000004',
  knee: 'a1000000-0000-4000-8000-000000000005',
  skin: 'a1000000-0000-4000-8000-000000000006',
  school: 'a1000000-0000-4000-8000-000000000007',
  blade: 'a1000000-0000-4000-8000-000000000008',
  clean: 'a1000000-0000-4000-8000-000000000009',
}

/** A cover as T13 stores it (`PostIdeaCover`). */
const cover = (text: string, length: PostIdeaLength | null, asked: NonNullable<PostIdeaCover['asked']>): PostIdeaCover =>
  ({ text, ...(length ? { length } : {}), asked })

export const idea = (over: Partial<PostIdeaRow> & Pick<PostIdeaRow, 'rank' | 'registry_id' | 'title'>): PostIdeaRow => ({
  id: `i000000${over.rank}-0000-4000-8000-000000000000`,
  client_id: OSSUR_CLIENT_ID,
  run_id: RUN,
  window_start: WINDOW.from,
  window_end: WINDOW.to,
  // The four weeks the ideas read (`ideasReadWindow`): 14 Sep to 11 Oct.
  read_start: READ.from,
  read_end: READ.to,
  cover: { text: '' },
  subquestions: [],
  format: null,
  format_multiple: null,
  opening: null,
  opening_multiple: null,
  model: 'gpt-5.4',
  prompt_version: 'post_ideas_v1',
  created_at: '2026-10-11T05:10:00.000Z',
  ...over,
})

/** Össur's three ideas, as `post_ideas` would hold them. */
export const OSSUR_IDEAS: PostIdeaRow[] = [
  idea({
    rank: 1,
    registry_id: REG.liner,
    title: 'How long does a liner last, and how do you know it is time to replace it?',
    cover: cover('How long liners usually last, the signs it is time, and what wears them out faster', { fromSeconds: 30, toSeconds: 45, videos: 9, basis: 'format' }, { comments: 33, videos: 23 }),
    subquestions: [
      { label: 'How long it should last', commentIds: ids(1, 14), videoIds: ids(1, 11, VID) },
      { label: 'The signs it is worn out', commentIds: ids(20, 9), videoIds: ids(5, 8, VID) },
      { label: 'Whether liners differ', commentIds: ids(40, 6), videoIds: ids(12, 5, VID) },
      { label: 'Whether medical aid pays', commentIds: ids(60, 4), videoIds: ids(18, 4, VID) },
    ],
    format: 'tutorial', format_multiple: 2.1, opening: 'question', opening_multiple: 1.8,
  }),
  idea({
    rank: 2,
    registry_id: REG.insurance,
    title: 'What to do when insurance says no to a powered knee',
    cover: cover('What people were told, what they tried next, and who to ask for help with an appeal', { fromSeconds: 25, toSeconds: 75, videos: 50, basis: 'question' }, { comments: 17, videos: 15 }),
    subquestions: [
      { label: 'How to appeal a refusal', commentIds: ids(100, 10), videoIds: ids(30, 9, VID) },
      { label: 'Which paperwork helps', commentIds: ids(120, 7), videoIds: ids(36, 6, VID) },
    ],
    format: 'story', format_multiple: 3.1, opening: 'personal-story', opening_multiple: 1.6,
  }),
  idea({
    rank: 3,
    registry_id: REG.water,
    title: 'Can you get a prosthetic leg wet?',
    cover: cover('Which parts can get wet, which cannot, and what people use at the beach and in the shower', null, { comments: 9, videos: 8 }),
    subquestions: [
      { label: 'Showering with it on', commentIds: ids(200, 5), videoIds: ids(50, 5, VID) },
      { label: 'Swimming legs', commentIds: ids(210, 4), videoIds: ids(53, 4, VID) },
    ],
    format: 'how-to', format_multiple: 2.4, opening: 'demonstration', opening_multiple: 1.4,
  }),
]

/** The profile's groups, as `consumer_profiles.personas` stores them. */
export const OSSUR_PERSONAS = storedPersonas([
  { key: 'new-amputees', name: 'New amputees, first year', registryIds: [REG.liner, REG.skin, REG.clean] },
  { key: 'caregivers', name: 'Caregivers and family', registryIds: [REG.liner, REG.socket, REG.school] },
  { key: 'long-time', name: 'Long-time users upgrading', registryIds: [REG.insurance, REG.knee, REG.liner] },
  { key: 'active', name: 'Active and athletic', registryIds: [REG.water, REG.blade] },
])

export const OCT: ContentMonth = { month: '2026-10-01', complete: false, from: '2026-10-01T00:00:00.000Z', to: WINDOW.to }

export const post = (n: number, platform: string, upload: string, classified: string | null, hook: string | null, rate: number | null, caption: string, topics: string[]) => ({
  id: `p${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`,
  video_id: `own${n}`,
  platform,
  video_url: `https://example.com/own/${n}`,
  account_name: 'ossur',
  upload_date: upload,
  caption,
  classified_type: classified,
  hook_style: hook,
  hook_text: null,
  engagement_rate: rate,
  views: 1000 + n * 100,
  likes: 40 + n,
  comments_count: 5 + n,
  topics,
  is_client: true,
  is_competitor: false,
  competitor_name: null,
  source: 'owned',
  sentiment: null,
  sentiment_source: null,
  analyzed_lane: null,
})

/** Össur's own posts, October so far: nine, six of them product showcases. */
export const OSSUR_OWNED: OwnedPosts = {
  basis: 'published',
  window: { from: '2026-10-01', to: '2026-11-01' },
  posts: [
    post(1, 'instagram', '2026-10-10', 'how-to', 'demonstration', 6.6, 'Meet the Navii. Built for wet days and long walks.', ['navii', 'wet', 'leg', 'waterproof']),
    post(2, 'tiktok', '2026-10-09', 'promotional', 'before-after', 2.1, 'Our new Pro-Flex range is here.', ['pro-flex', 'foot']),
    post(3, 'instagram', '2026-10-08', 'promotional', 'before-after', 1.9, 'Össur at the Orthopädie fair in Leipzig.', ['fair', 'leipzig']),
    post(4, 'youtube', '2026-10-08', 'story', 'personal-story', 4.4, 'Running again after a year: one athlete’s story.', ['running', 'blade', 'athlete']),
    post(5, 'instagram', '2026-10-07', 'promotional', 'before-after', null, 'Rheo Knee. Designed around you.', ['rheo', 'knee']),
    post(6, 'tiktok', '2026-10-06', 'promotional', 'before-after', 1.6, 'Five reasons clinicians choose Össur.', ['clinicians']),
    post(7, 'instagram', '2026-10-05', 'promotional', 'before-after', null, 'New colours for the Unity sleeve.', ['unity', 'sleeve']),
    post(8, 'youtube', '2026-10-03', 'behind-the-scenes', 'before-after', 2.7, 'A day at our Reykjavik workshop.', ['workshop', 'reykjavik']),
    post(9, 'instagram', '2026-10-02', 'promotional', null, null, 'World Mobility Day, from all of us.', ['mobility']),
  ],
  total: 9,
  byPlatform: [{ platform: 'instagram', posts: 5 }, { platform: 'tiktok', posts: 2 }, { platform: 'youtube', posts: 2 }],
}

/** Your posts since August (the touch test's window: the reading month and
 *  the two before, to the week's end): October's nine and four older. */
export const OSSUR_OWNED_SINCE: OwnedPosts = summariseOwnedPosts([
  ...OSSUR_OWNED.posts,
  post(10, 'instagram', '2026-09-24', 'promotional', 'before-after', null, 'Pro-Flex, for every step.', ['pro-flex']),
  post(11, 'youtube', '2026-09-12', 'educational', 'question', 2.2, 'How we fit a socket, step by step.', ['socket', 'fitting']),
  post(12, 'tiktok', '2026-08-28', 'promotional', 'bold-claim', 1.1, 'Meet the team behind Rheo.', ['rheo', 'team']),
  post(13, 'instagram', '2026-08-03', 'story', 'personal-story', null, 'Back on the trail.', ['hiking']),
], { from: ideaOwnedFrom('2026-10-01'), to: '2026-10-11T04:02:00.000Z' })

/** The market's typical rate this month (the category's median video). */
export const OSSUR_TYPICAL = 3.0

const row = (key: string, label: string, share: number, multiple: number, yours: number): WorksRow => ({ key, label, share, multiple, yours })

/** What works, as the board draws it (formats and openings best first). */
export const OSSUR_FORMATS: WorksRow[] = [
  row('story', 'Story', 22, 3.1, 1),
  row('how-to', 'How-to', 14, 2.4, 1),
  row('tutorial', 'Tutorial', 18, 2.1, 0),
  row('educational', 'Educational', 9, 1.6, 0),
  row('behind-the-scenes', 'Behind the scenes', 16, 1.2, 1),
  row('promotional', 'Promotional', 12, 0.7, 6),
]
export const OSSUR_OPENINGS: WorksRow[] = [
  row('question', 'A question', 19, 1.8, 0),
  row('personal-story', 'A personal story', 24, 1.6, 1),
  row('demonstration', 'Showing it', 15, 1.4, 1),
  row('bold-claim', 'A bold claim', 11, 1.2, 0),
  row('statistic', 'A statistic', 6, 0.9, 0),
  row('before-after', 'A before and after', 9, 0.6, 7),
]

export function worksFixture(month: ContentMonth = OCT): WorksBlock {
  return {
    month: month.month,
    complete: month.complete,
    formats: OSSUR_FORMATS,
    openings: OSSUR_OPENINGS,
    posts: 9,
    sentence: mixSentence({ formats: OSSUR_FORMATS, openings: OSSUR_OPENINGS, posts: 9, unclassified: 0, month: month.month, complete: month.complete }),
    basis: worksBasis(412, 640, month),
    unread: null,
  }
}

export function postsFixture(month: ContentMonth = OCT): PostsBlock {
  return postsBlock({ owned: OSSUR_OWNED, typical: OSSUR_TYPICAL, month })
}

/** The videos the reply list's comments sit under (the G5 board's: your own
 *  posts, creators' posts about you, and others'). */
export const REPLY_VIDEOS = {
  rheo: { id: 'p0000005-0000-4000-8000-000000000000', platform: 'instagram', video_url: 'https://example.com/own/5', account_name: '@ossur', caption: 'Rheo Knee. Designed around you.', upload_date: '2026-10-07' },
  proflex: { id: 'p0000002-0000-4000-8000-000000000000', platform: 'tiktok', video_url: 'https://example.com/own/2', account_name: '@ossur', caption: 'Our new Pro-Flex range is here.', upload_date: '2026-10-09' },
  running: { id: 'p0000004-0000-4000-8000-000000000000', platform: 'youtube', video_url: 'https://example.com/own/4', account_name: '@ossur', caption: 'Running again after a year: one athlete’s story.', upload_date: '2026-10-08' },
  diariesFoot: { id: 'm0000001-0000-4000-8000-000000000000', platform: 'youtube', video_url: 'https://example.com/m/1', account_name: 'The Amputee Diaries', caption: 'Trying the Pro-Flex foot for a month', upload_date: '2026-10-04' },
  navii: { id: 'p0000001-0000-4000-8000-000000000000', platform: 'instagram', video_url: 'https://example.com/own/1', account_name: '@ossur', caption: 'Meet the Navii. Built for wet days and long walks.', upload_date: '2026-10-10' },
  diariesLiner: { id: 'm0000002-0000-4000-8000-000000000000', platform: 'youtube', video_url: 'https://example.com/m/2', account_name: 'The Amputee Diaries', caption: 'Your liner has an expiry date. Here’s how to read it.', upload_date: '2026-09-28' },
  clinicians: { id: 'p0000006-0000-4000-8000-000000000000', platform: 'tiktok', video_url: 'https://example.com/own/6', account_name: '@ossur', caption: 'Five reasons clinicians choose Össur.', upload_date: '2026-10-06' },
  blades: { id: 'm0000003-0000-4000-8000-000000000000', platform: 'youtube', video_url: 'https://example.com/m/3', account_name: 'Running On Blades', caption: 'Six months with my Rheo: the honest review', upload_date: '2026-10-01' },
  amplife: { id: 'm0000004-0000-4000-8000-000000000000', platform: 'instagram', video_url: 'https://example.com/m/4', account_name: '@amp.life', caption: 'What my first year of prosthetics cost', upload_date: '2026-10-05' },
  trail: { id: 'm0000005-0000-4000-8000-000000000000', platform: 'tiktok', video_url: 'https://example.com/m/5', account_name: '@trail.legs', caption: 'First hike on the new knee, 12 km of rocks', upload_date: '2026-10-04' },
  beach: { id: 'm0000006-0000-4000-8000-000000000000', platform: 'tiktok', video_url: 'https://example.com/m/6', account_name: '@beach.amputee', caption: 'Beach day, leg off or leg on?', upload_date: '2026-10-04' },
} as const

type ReplyVideo = (typeof REPLY_VIDEOS)[keyof typeof REPLY_VIDEOS]

const reply = (n: number, intent: ReplyRow['intent'], under: ReplyRow['under'], text: string, video: ReplyVideo, date: string, reason: string, likes = 0): ReplyRow => ({
  id: ID(500 + n),
  intent,
  date,
  context: under === 'own_post' ? 'under your post' : `under ${video.account_name}’s post`,
  reason,
  platform: video.platform,
  quote: { ref: `m:${ID(500 + n)}`, text },
  href: intent === 'misinformation' ? null : video.platform === 'youtube' ? `${video.video_url}?lc=native${n}` : video.video_url,
  insightId: `ins${n}`,
  ...(under ? { under } : {}),
  videoRowId: video.id,
  ...(likes > 0 ? { likes } : {}),
})

/** The reply queue as the G5 board draws it: twelve comments, five ready to
 *  buy, three questions, three objections and one wrong, six under Össur's
 *  own posts, three under posts about it, three elsewhere. */
export const OSSUR_REPLIES = {
  rows: [
    reply(1, 'buying', 'own_post', 'Where can I try the Navii in Cape Town? My clinic only has older knees.', REPLY_VIDEOS.rheo, '2026-10-09T10:00:00.000Z', 'Looking for a fitting', 12),
    reply(2, 'buying', 'own_post', 'How do I get a quote for the Rheo through my prosthetist?', REPLY_VIDEOS.rheo, '2026-10-07T12:00:00.000Z', 'Asking how to buy', 3),
    reply(3, 'buying', 'own_post', 'Is the Pro-Flex covered by medical aid here or do I pay myself?', REPLY_VIDEOS.proflex, '2026-10-09T08:00:00.000Z', 'Cost before buying'),
    reply(4, 'buying', 'own_post', 'Can I switch from my old foot to the Pro-Flex without a new socket?', REPLY_VIDEOS.running, '2026-10-09T15:00:00.000Z', 'Changing from another foot', 2),
    reply(5, 'buying', 'names_you', 'Booking a fitting for this foot next month, any tips before I go?', REPLY_VIDEOS.diariesFoot, '2026-10-08T15:00:00.000Z', 'Ready to be fitted'),
    reply(6, 'question', 'own_post', 'Can the Navii go in the sea or only the shower?', REPLY_VIDEOS.navii, '2026-10-10T09:00:00.000Z', 'Water and the knee', 8),
    reply(7, 'question', 'names_you', 'How long did your liner last before it started slipping?', REPLY_VIDEOS.diariesLiner, '2026-10-09T19:00:00.000Z', 'How long liners last'),
    reply(8, 'question', 'own_post', 'Is there a waiting list for the Pro-Flex in the UK?', REPLY_VIDEOS.clinicians, '2026-10-07T16:00:00.000Z', 'Getting hold of it'),
    reply(9, 'objection', 'names_you', 'Mine squeaks after six months and the clinic says that is normal.', REPLY_VIDEOS.blades, '2026-10-08T21:00:00.000Z', 'Noise and wear', 5),
    reply(10, 'objection', 'elsewhere', 'Too expensive for most of us without insurance help.', REPLY_VIDEOS.amplife, '2026-10-07T09:00:00.000Z', 'Price'),
    reply(11, 'objection', 'elsewhere', 'The waiting time at my clinic for this knee is eight months.', REPLY_VIDEOS.trail, '2026-10-06T09:00:00.000Z', 'Waiting times'),
  ] as ReplyRow[],
  flagged: [
    reply(12, 'misinformation', 'elsewhere', 'You can’t swim with any prosthetic leg, the water ruins them all.', REPLY_VIDEOS.beach, '2026-10-06T13:00:00.000Z', 'Water and prostheses'),
  ] as ReplyRow[],
  counts: [],
  total: 11,
  window: { from: WINDOW.from, to: WINDOW.to, basis: 'previous_run' },
  unread: null,
}

/** Who asks, the subjects, and the week's counts of the conversations. */
export const ASKED_LABELS = [
  { registryId: REG.liner, label: 'Liner lifespan and replacement' },
  { registryId: REG.insurance, label: 'Insurance refusals for powered knees' },
  { registryId: REG.water, label: 'Getting a prosthetic leg wet' },
  { registryId: REG.socket, label: 'How a socket should fit as a child grows' },
  { registryId: REG.knee, label: 'Which knee suits my activity level' },
  { registryId: REG.skin, label: 'Looking after the skin under a liner' },
  { registryId: REG.school, label: 'Getting a child to wear it to school' },
  { registryId: REG.blade, label: 'Running on a blade for the first time' },
  { registryId: REG.clean, label: 'Cleaning a liner at home' },
]
export const WEEK_COUNTS = new Map([[REG.liner, 23], [REG.insurance, 19], [REG.water, 8], [REG.socket, 12], [REG.knee, 10], [REG.skin, 9], [REG.school, 7], [REG.blade, 6], [REG.clean, 5]])
export const MONTH_COUNTS = new Map([[REG.liner, 31], [REG.insurance, 31], [REG.water, 8], [REG.socket, 17], [REG.knee, 14], [REG.skin, 13], [REG.school, 9], [REG.blade, 10], [REG.clean, 9]])
export const W1 = new Map([[REG.liner, 9], [REG.insurance, 6], [REG.water, 0], [REG.socket, 8], [REG.knee, 11], [REG.skin, 9], [REG.school, 3], [REG.blade, 7], [REG.clean, 4]])
export const W2 = new Map([[REG.liner, 14], [REG.insurance, 7], [REG.water, 0], [REG.socket, 9], [REG.knee, 10], [REG.skin, 8], [REG.school, 5], [REG.blade, 6], [REG.clean, 2]])
const SUBJECTS = new Map<string, string | null>([
  [REG.socket, 'Fit & comfort'], [REG.knee, 'Choosing'], [REG.skin, 'Fit & comfort'], [REG.school, 'Community'], [REG.blade, 'Function & movement'], [REG.clean, 'Fit & comfort'],
])

export function askedFixture(period: ContentPeriod = 'week', expanded = false): AskedBlock {
  return askedSplit(period, expanded, 3).asked
}

/** The also-asked list beside `ideas` printed ideas (the first ones, by
 *  rank): the table, and the questions the ideas row's other cards hold. */
export function askedSplit(period: ContentPeriod, expanded: boolean, ideas: number, opts: { groups?: boolean; subjects?: boolean } = {}): { asked: AskedBlock; lead: AskedRow[] } {
  return askedWithLead({
    lead: Math.max(0, IDEA_SLOTS - ideas),
    period,
    questions: ASKED_LABELS,
    counts: { week: WEEK_COUNTS, month: MONTH_COUNTS },
    weeks: [W1, W2, WEEK_COUNTS],
    exclude: new Set(OSSUR_IDEAS.slice(0, ideas).map((i) => i.registry_id)),
    groups: opts.groups === false ? THIN_GROUPS : groupsByConversation(OSSUR_PERSONAS),
    subjects: opts.subjects === false ? THIN_SUBJECTS : SUBJECTS,
    owned: OSSUR_OWNED_SINCE,
    since: ideaOwnedFrom('2026-10-01'),
    expanded,
  })
}

/** The thin real state's groups and subjects (Össur and Sealand on 13 Oct):
 *  most questions cited by no group, and some held by no subject. */
const THIN_GROUPS = groupsByConversation(storedPersonas([{ key: 'first-time', name: 'First-time buyer', registryIds: [REG.insurance, REG.knee] }]))
const THIN_SUBJECTS = new Map<string, string | null>([[REG.liner, 'Fit & comfort'], [REG.insurance, 'Cost & access'], [REG.knee, 'Choosing']])

/** The anomaly check's flag on insurance refusals this week. */
export const INSURANCE_FLAG: Verdict = flagVerdict({
  object_kind: 'theme', object_id: REG.insurance, label: 'Insurance refusals for powered knees', denominator: 'market',
  week_k: 19, week_n: 241, baseline_k: 39, baseline_n: 1906, change_pts: 5.8, band_pts: 3.6,
}, WINDOW)

/** The ideas' four weeks (14 Sep to 11 Oct): each idea's videos over all of
 *  them (distinct videos, so fewer than the weeks' sum), and the market's. */
export const READ_COUNTS = new Map([[REG.liner, 48], [REG.insurance, 33], [REG.water, 8]])
export const READ_MARKET = 640
/** The first of the four weeks (14 Sep); the other three are W1, W2 and the
 *  page's week. */
export const W0 = new Map([[REG.liner, 6], [REG.insurance, 4], [REG.water, 0]])

export function ideaCards(clientId = OSSUR_CLIENT_ID): IdeaCard[] {
  const groups = groupsByConversation(OSSUR_PERSONAS)
  const read = (id: string) => ({ k: READ_COUNTS.get(id) ?? 0, n: READ_MARKET })
  const month = (id: string) => ({ k: MONTH_COUNTS.get(id) ?? 0, n: 318 })
  const labels = ideasReadOf(OSSUR_IDEAS[0])!.weeks!.map((w) => w.label)
  const weeks = (id: string) => [W0, W1, W2, WEEK_COUNTS].map((m, i) => ({ label: labels[i], count: m.get(id) ?? 0 }))
  const subjects: Record<string, { id: string; name: string }> = {
    [REG.liner]: { id: 's-fit', name: 'Fit & comfort' },
    [REG.insurance]: { id: 's-cost', name: 'Cost & access' },
    [REG.water]: { id: 's-function', name: 'Function & movement' },
  }
  return OSSUR_IDEAS.map((i) => ideaCard({
    idea: i,
    label: ASKED_LABELS.find((l) => l.registryId === i.registry_id)?.label ?? null,
    read: read(i.registry_id),
    month: month(i.registry_id),
    weeks: weeks(i.registry_id),
    flag: i.registry_id === REG.insurance ? INSURANCE_FLAG : i.registry_id === REG.water ? newVerdict(REG.water, 'Getting a prosthetic leg wet', OCT, month(REG.water)) : null,
    groups: groups.get(i.registry_id) ?? [],
    owned: OSSUR_OWNED_SINCE,
    since: ideaOwnedFrom('2026-10-01'),
    subject: subjects[i.registry_id] ?? null,
    medical: printsMedicalLine(clientId),
  }))
}

/** The market videos where idea 1 came up, as the G5 board names them. */
export const IDEA_VIDEOS: MarketVideoCard[] = [
  { id: VID(1), title: 'Your liner has an expiry date. Here is how to read it.', account: 'The Amputee Diaries', platform: 'youtube', format: 'Tutorial', opening: 'A question', multiple: 2.6, url: 'https://example.com/v1' },
  { id: VID(2), title: 'Three signs your liner is done.', account: '@stepbystep.amp', platform: 'tiktok', format: 'Tutorial', opening: 'A bold claim', multiple: 2.2, url: 'https://example.com/v2' },
  { id: VID(3), title: 'We get this question every week.', account: '@limbcare.clinic', platform: 'instagram', format: 'Educational', opening: 'A question', multiple: 1.7, url: 'https://example.com/v3' },
]

/** The run two weeks before: the week an older set of ideas was written for. */
const OLDER_RUN = 'r0000000-0000-4000-8000-000000000000'
const OLDER_WINDOW = { from: '2026-09-20T04:03:00.000Z', to: '2026-09-27T04:02:00.000Z' }

/** The ideas' own week: this page's (`current`), or two weeks before; and
 *  the four weeks each read. */
export function ideasWeekFixture(older = false): IdeasWeek {
  if (!older) return ideasWeekOf(OSSUR_IDEAS, contentWeek(RUN, WINDOW))!
  // The same ideas, written two weeks before: their own week and four weeks,
  // and so their own month (August in full: their four weeks began in it).
  const read = ideasReadWindow(OLDER_WINDOW)
  const rows = OSSUR_IDEAS.map((i) => ({ ...i, run_id: OLDER_RUN, window_start: OLDER_WINDOW.from, window_end: OLDER_WINDOW.to, read_start: read.from, read_end: read.to }))
  return ideasWeekOf(rows, contentWeek(RUN, WINDOW))!
}

export interface ContentFixtureOptions {
  clientId?: string
  period?: ContentPeriod
  asked?: boolean
  /** `fewer`: a set of one idea (the step's floor held the rest back);
   *  `two`: a set of two, as G5-Content draws it. */
  ideas?: IdeasState | 'fewer' | 'two'
  /** The ideas were written for an earlier week (the step stored none since). */
  olderIdeas?: boolean
}

/** The question cards a row of `ideas` ideas leaves, as the loader shapes
 *  them: the top of the also-asked list, each with the flag an idea on it
 *  would wear. */
function questionSlots(lead: readonly AskedRow[], flags = true): QuestionSlot[] {
  return lead.map((r) => ({
    ...r,
    flag: flags && r.registryId === REG.insurance ? INSURANCE_FLAG : null,
    platforms: splitAcross(r.week ?? 0),
    comments: { week: (r.week ?? 0) * 3 + 2, month: (r.month ?? 0) * 3 + 4 },
  }))
}

/** A question's videos this week spread over the platforms, the most first
 *  (illustrative: TikTok about half, then YouTube, Instagram, Reddit). */
function splitAcross(videos: number): { platform: string; videos: number }[] {
  const tiktok = Math.ceil(videos / 2)
  const youtube = Math.ceil((videos - tiktok) / 2)
  const instagram = Math.ceil((videos - tiktok - youtube) / 2)
  const reddit = videos - tiktok - youtube - instagram
  return [['tiktok', tiktok], ['youtube', youtube], ['instagram', instagram], ['reddit', reddit]]
    .filter(([, n]) => (n as number) > 0)
    .map(([platform, n]) => ({ platform: platform as string, videos: n as number }))
}

/** The page as the board draws it: Össur's week of 4 to 10 October. */
export function contentFixture(opts: ContentFixtureOptions = {}): ContentPageData {
  const clientId = opts.clientId ?? OSSUR_CLIENT_ID
  const period = opts.period ?? 'week'
  const ideasState: IdeasState = opts.ideas === 'fewer' || opts.ideas === 'two' ? 'ready' : opts.ideas ?? 'ready'
  const week = contentWeek(RUN, WINDOW)!
  const cards = ideasState === 'ready' ? ideaCards(clientId).slice(0, opts.ideas === 'fewer' ? 1 : opts.ideas === 'two' ? 2 : 3) : []
  const { asked, lead } = askedSplit(period, opts.asked ?? false, cards.length)
  const repliesWindow = period === 'month' ? { from: OCT.from, to: WINDOW.to, phrase: 'in October so far' } : { from: week.from, to: week.to, phrase: daysPhrase(week.first, week.last) }
  return {
    brand: clientId === SEALAND_CLIENT_ID ? 'Sealand' : 'Össur',
    period,
    week,
    month: OCT,
    market: { week: 241, month: 318 },
    ideas: { state: ideasState, cards, week: cards.length > 0 ? ideasWeekFixture(opts.olderIdeas) : null, questions: questionSlots(lead) },
    works: worksFixture(),
    replies: repliesView(OSSUR_REPLIES, repliesWindow),
    posts: postsFixture(),
    asked,
  }
}

/**
 * THE THIN REAL STATE (parity pass, 13 Oct): the page as both tenants'
 * production rows drew it on 13 Oct, through the loader's own builders. Post
 * ideas not switched on (so three question cards), nothing flagged, most
 * questions cited by no group and some held by no subject, every comment worth
 * a reply under someone else's post, thirteen posts of your own (more than the
 * board's nine marks) none of which has a response figure (Sealand's
 * Instagram photos), so no typical post and no best one. The board's shape
 * must hold in it.
 */
export function contentThinFixture(): ContentPageData {
  const base = contentFixture({ ideas: 'not_on' })
  const { asked, lead } = askedSplit('week', false, 0, { groups: false, subjects: false })
  const owned13: OwnedPosts = summariseOwnedPosts(
    Array.from({ length: 13 }, (_, i) => ({ ...OSSUR_OWNED.posts[i % 9], id: `p${String(100 + i).padStart(7, '0')}-0000-4000-8000-000000000000`, platform: 'instagram', engagement_rate: null })),
    { from: '2026-10-01', to: '2026-11-01' },
  )
  const elsewhere = { ...OSSUR_REPLIES, rows: OSSUR_REPLIES.rows.slice(0, 9).map((r) => ({ ...r, under: 'elsewhere' as const })), flagged: [] }
  const formats = OSSUR_FORMATS.map((r, i) => ({ ...r, yours: [2, 0, 0, 0, 0, 3][i] }))
  const openings = OSSUR_OPENINGS.map((r, i) => ({ ...r, yours: [0, 2, 0, 3, 0, 0][i] }))
  return {
    ...base,
    market: { week: 153, month: 288 },
    ideas: { state: 'not_on', cards: [], week: null, questions: questionSlots(lead, false) },
    works: {
      ...worksFixture(),
      formats, openings, posts: 13,
      sentence: mixSentence({ formats, openings, posts: 13, unclassified: 8, month: OCT.month, complete: false }),
      basis: worksBasis(690, 757, OCT),
    },
    replies: repliesView(elsewhere, base.replies.window),
    posts: postsBlock({ owned: owned13, typical: OSSUR_TYPICAL, month: OCT }),
    asked,
  }
}

/** A workspace with no update yet and no posts: every block's empty state. */
export function contentEmptyFixture(): ContentPageData {
  const month: ContentMonth = { month: '2026-10-01', complete: false, from: '2026-10-01T00:00:00.000Z', to: '2026-10-13T08:00:00.000Z' }
  return {
    brand: 'Össur',
    period: 'week',
    week: null,
    month,
    market: { week: null, month: null },
    ideas: { state: 'not_on', cards: [], week: null, questions: [] },
    works: { month: month.month, complete: false, formats: [], openings: [], posts: 0, sentence: null, basis: null, unread: 'Too few of the market’s videos published in October so far have a format and a response figure to compare yet.' },
    replies: { ...repliesView(null, null), unread: 'No update has covered a week yet, so there is no reply list.' },
    posts: { month: month.month, complete: false, total: 0, byPlatform: [], response: null, best: null, rows: [], unread: null },
    asked: { period: 'week', rows: [], total: 0, touched: 0, since: ideaOwnedFrom(month.month), posts: 0, expanded: false, unread: ASKED_NO_WEEK },
  }
}
