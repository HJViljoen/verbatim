import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import { quoteTextHash } from '../../quote-text'
import { cleanQuote } from '../../quotes'
import { readingHandle } from '../../reading/read'
import { fakeDb } from '../../test/fake-db'
import { loadContentPage } from './content'

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

async function rootStatements(params: Record<string, string>): Promise<{ total: number; by: Record<string, number> }> {
  const db = fakeDb(contentTables() as never, contentRpcs() as never)
  await loadContentPage({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params }, { now: NOW })
  return countCalls(db.calls)
}

// TODAY'S CONTENT, before its depth became pages (17 Oct, measured by this
// harness on d4e1480b): the root this week 40, this month 40; a post idea
// opened in place (`?idea=1`) 46 (its videos, comments, their English, its
// words and the gate's context); the reply list (`?replies=1`) and your posts
// (`?posts=1`) opened in place 40, since the root reads both lists already.
describe('Content\'s statements', () => {
  it('counts each load', async () => {
    const week = await rootStatements({})
    const month = await rootStatements({ period: 'month' })
    const idea = await rootStatements({ idea: '1' })
    const replies = await rootStatements({ replies: '1' })
    const posts = await rootStatements({ posts: '1' })
    expect({ week: week.total, month: month.total, idea: idea.total, replies: replies.total, posts: posts.total }).toEqual({ week: 40, month: 40, idea: 46, replies: 40, posts: 40 })
  })
})
