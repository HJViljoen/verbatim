import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../../config'
import type { PostIdeaCover, PostIdeaLength, PostIdeaRow } from '../../post-ideas/types'
import { printsMedicalLine } from '../../post-ideas/medical'
import { ideasReadWindow } from '../../post-ideas/select'
import { summariseOwnedPosts, type OwnedPosts } from '../../reading/owned'
import type { Verdict } from '../../reading/verdicts'
import type { ReplyRow } from '../week'
import {
  agentHref, askedBlock, conversationHref, contentWeek, daysPhrase, ideaOwnedFrom, ideasReadOf, ideasWeekOf, flagVerdict, groupsByConversation, ideaCard, mixSentence,
  newVerdict, postsBlock, repliesView, storedPersonas, subquestionRows, wordsToBorrow, worksBasis,
  type AskedBlock, type ContentMonth, type ContentOpen, type ContentPageData, type ContentPeriod, type IdeaCard,
  type IdeaPanel, type IdeasWeek, type MarketVideoCard, type PanelQuote, type PostsBlock, type WorksBlock, type WorksRow,
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

const RUN = 'r0000000-0000-4000-8000-000000000001'
const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z' }
/** The four weeks the ideas read, ending where the run's window ends. */
const READ = ideasReadWindow(WINDOW)
const ID = (n: number) => `c${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`
const VID = (n: number) => `v${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`
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

const idea = (over: Partial<PostIdeaRow> & Pick<PostIdeaRow, 'rank' | 'registry_id' | 'title'>): PostIdeaRow => ({
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

const post = (n: number, platform: string, upload: string, classified: string | null, hook: string | null, rate: number | null, caption: string, topics: string[]) => ({
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

const reply = (n: number, intent: ReplyRow['intent'], under: ReplyRow['under'], text: string, platform: string, date: string, context: string, reason: string): ReplyRow => ({
  id: ID(500 + n),
  intent,
  date,
  context,
  reason,
  platform,
  quote: { ref: `m:${ID(500 + n)}`, text },
  href: intent === 'misinformation' ? null : `https://example.com/v/${n}`,
  insightId: `ins${n}`,
  ...(under ? { under } : {}),
})

/** The reply queue: twelve comments, seven under Össur's own posts. */
export const OSSUR_REPLIES = {
  rows: [
    reply(1, 'buying', 'own_post', 'Where can I try the Navii in Cape Town? My clinic only has older knees.', 'instagram', '2026-10-09T10:00:00.000Z', 'under your post · 12 likes', 'Looking for a fitting'),
    reply(2, 'buying', 'own_post', 'Is the Pro-Flex covered by medical aid here or do I pay myself?', 'tiktok', '2026-10-09T08:00:00.000Z', 'under your post', 'Cost questions before buying'),
    reply(3, 'buying', 'names_you', 'Booking a fitting for this foot next month, any tips before I go?', 'youtube', '2026-10-08T15:00:00.000Z', 'under @stepbystep.amp’s post', 'Ready to be fitted'),
    reply(4, 'buying', 'own_post', 'How do I get a quote for the Rheo through my prosthetist?', 'instagram', '2026-10-07T12:00:00.000Z', 'under your post · 3 likes', 'Asking how to buy'),
    reply(5, 'question', 'own_post', 'Can the Navii go in the sea or only the shower?', 'instagram', '2026-10-10T09:00:00.000Z', 'under your post · 8 likes', 'Water and the knee'),
    reply(6, 'question', 'names_you', 'How long did your liner last before it started slipping?', 'youtube', '2026-10-09T19:00:00.000Z', 'under @theamputeediaries’s post', 'How long liners last'),
    reply(7, 'question', 'own_post', 'Does the sleeve come in a child size?', 'instagram', '2026-10-06T11:00:00.000Z', 'under your post', 'Sizes for children'),
    reply(8, 'question', 'elsewhere', 'Which knee would you pick for hiking on rough ground?', 'tiktok', '2026-10-06T07:00:00.000Z', 'under @limbcare.clinic’s post', 'Choosing a knee'),
    reply(9, 'question', 'own_post', 'Is there a waiting list for the Pro-Flex in the UK?', 'tiktok', '2026-10-05T16:00:00.000Z', 'under your post', 'Getting hold of it'),
    reply(10, 'objection', 'names_you', 'Mine squeaks after six months and the clinic says that is normal.', 'youtube', '2026-10-08T21:00:00.000Z', 'under @runningonblades’s post', 'Noise and wear'),
    reply(11, 'objection', 'elsewhere', 'Too expensive for most of us without insurance help.', 'instagram', '2026-10-07T09:00:00.000Z', 'under @amp.life’s post', 'Price'),
  ] as ReplyRow[],
  flagged: [
    reply(12, 'misinformation', 'elsewhere', 'You can’t swim with any prosthetic leg, the water ruins them all.', 'tiktok', '2026-10-06T13:00:00.000Z', 'awareness only, never a reply prompt', 'Water and prostheses'),
  ] as ReplyRow[],
  counts: [],
  total: 11,
  window: { from: WINDOW.from, to: WINDOW.to, basis: 'previous_run' },
  unread: null,
}

/** Who asks, the subjects, and the week's counts of the conversations. */
const ASKED_LABELS = [
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
const WEEK_COUNTS = new Map([[REG.liner, 23], [REG.insurance, 19], [REG.water, 8], [REG.socket, 12], [REG.knee, 10], [REG.skin, 9], [REG.school, 7], [REG.blade, 6], [REG.clean, 5]])
const MONTH_COUNTS = new Map([[REG.liner, 31], [REG.insurance, 31], [REG.water, 8], [REG.socket, 17], [REG.knee, 14], [REG.skin, 13], [REG.school, 9], [REG.blade, 10], [REG.clean, 9]])
const W1 = new Map([[REG.liner, 9], [REG.insurance, 6], [REG.water, 0], [REG.socket, 8], [REG.knee, 11], [REG.skin, 9], [REG.school, 3], [REG.blade, 7], [REG.clean, 4]])
const W2 = new Map([[REG.liner, 14], [REG.insurance, 7], [REG.water, 0], [REG.socket, 9], [REG.knee, 10], [REG.skin, 8], [REG.school, 5], [REG.blade, 6], [REG.clean, 2]])
const SUBJECTS = new Map<string, string | null>([
  [REG.socket, 'Fit & comfort'], [REG.knee, 'Choosing'], [REG.skin, 'Fit & comfort'], [REG.school, 'Community'], [REG.blade, 'Function & movement'], [REG.clean, 'Fit & comfort'],
])

export function askedFixture(period: ContentPeriod = 'week', expanded = false): AskedBlock {
  const block = askedBlock({
    period,
    questions: ASKED_LABELS,
    counts: { week: WEEK_COUNTS, month: MONTH_COUNTS },
    weeks: [W1, W2, WEEK_COUNTS],
    exclude: new Set([REG.liner, REG.insurance, REG.water]),
    groups: groupsByConversation(OSSUR_PERSONAS),
    subjects: SUBJECTS,
    owned: OSSUR_OWNED_SINCE,
    since: ideaOwnedFrom('2026-10-01'),
    expanded,
  })
  return block
}

/** The anomaly check's flag on insurance refusals this week. */
const INSURANCE_FLAG: Verdict = flagVerdict({
  object_kind: 'theme', object_id: REG.insurance, label: 'Insurance refusals for powered knees', denominator: 'market',
  week_k: 19, week_n: 241, baseline_k: 39, baseline_n: 1906, change_pts: 5.8, band_pts: 3.6,
}, WINDOW)

/** The ideas' four weeks (14 Sep to 11 Oct): each idea's videos over all of
 *  them (distinct videos, so fewer than the weeks' sum), and the market's. */
const READ_COUNTS = new Map([[REG.liner, 48], [REG.insurance, 33], [REG.water, 8]])
const READ_MARKET = 640
/** The first of the four weeks (14 Sep); the other three are W1, W2 and the
 *  page's week. */
const W0 = new Map([[REG.liner, 6], [REG.insurance, 4], [REG.water, 0]])

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

const VIDEOS: MarketVideoCard[] = [
  { id: VID(1), title: 'Your liner has an expiry date. Here is how to read it.', account: 'theamputeediaries', platform: 'youtube', format: 'Tutorial', opening: 'A question', multiple: 2.6, url: 'https://example.com/v1' },
  { id: VID(2), title: 'Three signs your liner is done.', account: 'stepbystep.amp', platform: 'tiktok', format: 'Tutorial', opening: 'A bold claim', multiple: 2.2, url: 'https://example.com/v2' },
  { id: VID(3), title: 'We get this question every week.', account: 'limbcare.clinic', platform: 'instagram', format: 'Educational', opening: 'A question', multiple: 1.7, url: 'https://example.com/v3' },
]

const QUOTES: PanelQuote[] = [
  { ref: `m:${ID(1)}`, text: 'Is it normal that my liner feels loose after six months? Nobody told me they wear out.', platform: 'instagram', date: '2026-10-06T10:00:00.000Z' },
  { ref: `m:${ID(2)}`, text: 'Mine stops holding by lunchtime now. New liner or new socket?', platform: 'tiktok', date: '2026-10-08T10:00:00.000Z' },
  { ref: `m:${ID(3)}`, text: 'How do you all know when to replace it? My clinic never said.', platform: 'youtube', date: '2026-10-09T10:00:00.000Z' },
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

export function ideaPanelFixture(rank: 1 | 2 | 3 = 1, clientId = OSSUR_CLIENT_ID, older = false): IdeaPanel {
  const row = OSSUR_IDEAS.find((i) => i.rank === rank)!
  const card = ideaCards(clientId).find((c) => c.rank === rank)!
  return {
    card: { ...card, groups: groupsByConversation(OSSUR_PERSONAS).get(row.registry_id) ?? [] },
    cover: row.cover.text,
    length: row.cover.length ?? null,
    subquestions: subquestionRows(row),
    asked: row.cover.asked ?? null,
    week: ideasWeekFixture(older),
    videos: rank === 1 ? VIDEOS : VIDEOS.slice(1),
    words: wordsToBorrow([
      { id: 'w1', phrase: 'feels loose' },
      { id: 'w2', phrase: 'nobody told me they wear out' },
      { id: 'w3', phrase: 'stops holding by lunchtime' },
      { id: 'w4', phrase: 'my skin can tell' },
    ]),
    quotes: rank === 1 ? QUOTES : QUOTES.slice(0, 1),
    askHref: agentHref(`Draft an outline for a post that answers this question from my market: ${row.title}`),
    conversationHref: conversationHref(row.registry_id),
  }
}

export interface ContentFixtureOptions {
  clientId?: string
  period?: ContentPeriod
  open?: ContentOpen
  asked?: boolean
  ideas?: 'ready' | 'not_on' | 'none' | 'stale'
  /** The ideas were written for an earlier week (the step stored none since). */
  olderIdeas?: boolean
}

/** The page as the board draws it: Össur's week of 4 to 10 October. */
export function contentFixture(opts: ContentFixtureOptions = {}): ContentPageData {
  const clientId = opts.clientId ?? OSSUR_CLIENT_ID
  const period = opts.period ?? 'week'
  const open = opts.open ?? null
  const ideasState = opts.ideas ?? 'ready'
  const week = contentWeek(RUN, WINDOW)!
  const cards = ideasState === 'ready' ? ideaCards(clientId) : []
  const repliesWindow = period === 'month' ? { from: OCT.from, to: WINDOW.to, phrase: 'in October so far' } : { from: week.from, to: week.to, phrase: daysPhrase(week.first, week.last) }
  return {
    brand: clientId === SEALAND_CLIENT_ID ? 'Sealand' : 'Össur',
    period,
    week,
    month: OCT,
    market: { week: 241, month: 318 },
    ideas: { state: ideasState, cards, week: cards.length > 0 ? ideasWeekFixture(opts.olderIdeas) : null },
    works: worksFixture(),
    replies: repliesView(OSSUR_REPLIES, repliesWindow),
    posts: postsFixture(),
    asked: askedFixture(period, opts.asked ?? false),
    open: open?.kind === 'idea' && ideasState !== 'ready' ? null : open,
    ideaPanel: open?.kind === 'idea' && ideasState === 'ready' ? ideaPanelFixture(open.rank, clientId, opts.olderIdeas) : null,
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
    ideas: { state: 'not_on', cards: [], week: null },
    works: { month: month.month, complete: false, formats: [], openings: [], posts: 0, sentence: null, basis: null, unread: 'Too few of the market’s videos published in October so far have a format and a response figure to compare yet.' },
    replies: { ...repliesView(null, null), unread: 'No update has covered a week yet, so there is no reply list.' },
    posts: { month: month.month, complete: false, total: 0, byPlatform: [], response: null, best: null, rows: [], unread: null },
    asked: { period: 'week', rows: [], total: 0, touched: 0, since: ideaOwnedFrom(month.month), expanded: false, unread: null },
    open: null,
    ideaPanel: null,
  }
}
