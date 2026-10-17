import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import { fakeDb } from '../../test/fake-db'
import { readingHandle } from '../../reading/read'
import { judgeVersionFor } from '../../subjects/types'
import { loadVoices, parseVoicesParams } from './voices'
import { BRAND_MISSING, CREATOR_MISSING, CREATOR_REDDIT, GROUP_MISSING, levelParams, loadVoicesBrand, loadVoicesCreator, loadVoicesGroup } from './voices-levels'

// VOICES' STATEMENTS, COUNTED OFFLINE (the Market harness's pattern,
// lib/pages/v2/market-statements.test.ts). Every `.from(table)` and
// `.rpc(fn)` a page load makes, against a table-driven stand-in for the
// database (lib/test/fake-db.ts): an Össur-shaped September with two groups,
// two creators at the floor, a counted rival and its own posts.

const CLIENT = OSSUR_CLIENT_ID
const OTHER = '00000000-0000-4000-8000-0000000000cc'
const RUN = '00000000-0000-4000-8000-0000000000bb'
const OTTO = '00000000-0000-4000-8000-00000000077a'
const SUBJECT = '00000000-0000-4000-8000-0000000000s1'.replace('s1', '51')
const REG = (n: number) => `00000000-0000-4000-8000-00000000${String(n).padStart(4, '0')}`
const V = (n: number) => `00000000-0000-4000-8000-0000000d${String(n).padStart(4, '0')}`
const SEP = '2026-09-01'
const NOW = new Date('2026-10-14T09:00:00.000Z')

/** Six market videos: three by @stepbystep.amp, three by The Amputee
 *  Diaries; and one of Ottobock's own posts. */
function tables() {
  const video = (n: number, account: string, platform: string, over: Record<string, unknown> = {}) => ({
    id: V(n), client_id: CLIENT, platform, video_id: `p${n}`, video_url: `https://example.com/v/${n}`, account_name: account, account_followers: 1000 * n,
    scraped_at: '2026-09-28T06:00:00.000Z', caption: `Caption ${n}`, comments_count: 100 + n, upload_date: '2026-09-1' + n, is_client: false,
    is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered', analyzed_run_id: RUN, ...over,
  })
  const comment = (n: number, videoN: number, platform: string) => ({
    id: `c${n}`, client_id: CLIENT, comment_date: `2026-09-${String(10 + n).padStart(2, '0')}T10:00:00.000Z`, platform, video_id: `p${videoN}`, comment_id: `pc${n}`, author: `viewer${n}`, likes: 0,
  })
  return {
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    pipeline_runs: [{ id: RUN, client_id: CLIENT, status: 'completed', started_at: '2026-09-27T04:00:00.000Z', completed_at: '2026-09-27T06:00:00.000Z', errors: [], window_start: '2026-09-20T00:00:00.000Z', window_end: '2026-09-27T00:00:00.000Z', options: {} }],
    tracking_configs: [{ client_id: CLIENT, competitor_names: ['Ottobock'], own_handles: {}, competitor_handles: {}, competitor_keywords: [], watched_brands: [], report_period: 'weekly', report_day: 'sunday' }],
    competitors: [{ id: OTTO, client_id: CLIENT, name: 'Ottobock', retired_at: null, first_seen_at: '2026-08-01T00:00:00.000Z', superseded_by: null }],
    month_denominators: ['2026-08-01', SEP].flatMap((month) => ['industry-other', 'competitor:Ottobock'].map((audience) => ({
      client_id: CLIENT, month, audience, videos: audience === 'industry-other' ? 300 : 20, comments: 4000, platform_mix: { tiktok: 200, youtube: 100 }, status: 'frozen', run_id: RUN, read_at: `${month.slice(0, 7)}-28T00:00:00.000Z`,
    }))),
    consumer_profiles: [{
      client_id: CLIENT, run_id: RUN, run_date: '2026-09-27T05:00:00.000Z',
      personas: [
        { key: 'carers', name: 'Caregivers and family', oneLiner: 'Parents and partners asking on someone’s behalf.', wants: 'Clear answers.', blockers: 'Costs.', triggers: 'A clinician.', howTheyTalk: ['my son’s leg'], who: [{ signal: 'parent-of-amputee', count: 4 }], insightIds: ['ins-1', 'ins-2'], registryIds: [REG(1), REG(2)], evidenceCount: 2, sourceVideoCount: 2, prevalence: 'Common', platformMix: {}, scope: 'category', themeIds: [] },
        { key: 'athletes', name: 'Active and athletic', oneLiner: 'Want proof a device keeps up.', wants: 'Proof.', blockers: 'Judged not necessary.', triggers: 'A blade in their sport.', howTheyTalk: [], who: [], insightIds: ['ins-3'], registryIds: [REG(2)], evidenceCount: 1, sourceVideoCount: 1, prevalence: 'Common', platformMix: {}, scope: 'category', themeIds: [] },
      ],
    }],
    videos: [
      video(1, '@stepbystep.amp', 'tiktok'), video(2, '@stepbystep.amp', 'tiktok'), video(3, '@stepbystep.amp', 'tiktok'),
      video(4, 'The Amputee Diaries', 'youtube'), video(5, 'The Amputee Diaries', 'youtube'), video(6, 'The Amputee Diaries', 'youtube'),
      video(7, 'ottobockofficial', 'instagram', { source: 'competitor_owned', is_competitor: true, competitor_name: 'Ottobock', upload_date: '2026-09-20' }),
      // Another workspace's video, which no page of this tenant's may name.
      { ...video(9, 'Other workspace creator', 'tiktok'), client_id: OTHER, caption: 'Other workspace video' },
    ],
    comments: [comment(1, 1, 'tiktok'), comment(2, 2, 'tiktok'), comment(3, 4, 'youtube'), comment(4, 5, 'youtube'), comment(5, 7, 'instagram')],
    insight_evidence: [
      { id: 'e1', audience_insight_id: 'ins-1', comment_id: 'c1', source: 'comment', quote: 'My daughter outgrew her socket in four months, is that normal for kids?', relevance_rank: 1, redacted: false, lang: null, english: null },
      { id: 'e2', audience_insight_id: 'ins-2', comment_id: 'c2', source: 'comment', quote: 'Insurance covered the leg but not the liners, nobody warned us about that.', relevance_rank: 1, redacted: false, lang: null, english: null },
      { id: 'e3', audience_insight_id: 'ins-3', comment_id: 'c3', source: 'comment', quote: 'Which blade do you run trails with, mine keeps slipping on the downhill?', relevance_rank: 1, redacted: false, lang: null, english: null },
      { id: 'e4', audience_insight_id: 'ins-1', comment_id: 'c4', source: 'comment', quote: 'Our clinic said the C-Leg is the only knee insurance will look at for him.', relevance_rank: 2, redacted: false, lang: null, english: null },
      { id: 'e5', audience_insight_id: 'ins-o', comment_id: 'c5', source: 'comment', quote: 'Got the C-Leg approved after a year of fighting, worth it but the fight nearly broke me.', relevance_rank: 1, redacted: false, lang: null, english: null },
    ],
    audience_insights: [],
    audience_insights_current: [{ id: 'ins-o', client_id: CLIENT, source_video_id: V(7) }],
    comment_translations: [],
    month_evidence_refs: [
      { client_id: CLIENT, month: SEP, object_kind: 'theme', audience: 'industry-other', object_id: REG(1), video_ids: [V(1), V(2), V(4)], comment_ids: ['c1', 'c2'] },
      { client_id: CLIENT, month: SEP, object_kind: 'theme', audience: 'industry-other', object_id: REG(2), video_ids: [V(4), V(5)], comment_ids: ['c3', 'c4'] },
    ],
    theme_registry: [
      { id: REG(1), client_id: CLIENT, canonical_label: 'Growing out of a socket', member_slugs: [] },
      { id: REG(2), client_id: CLIENT, canonical_label: 'Running on a blade', member_slugs: [] },
    ],
    themes: [
      { client_id: CLIENT, run_id: RUN, created_at: '2026-09-27T05:00:00.000Z', registry_id: REG(1), description: 'A child’s socket stops fitting within months.' },
      { client_id: CLIENT, run_id: RUN, created_at: '2026-09-27T05:00:00.000Z', registry_id: REG(2), description: 'Runners compare blades.' },
    ],
    theme_observations: [
      { client_id: CLIENT, run_id: RUN, theme_id: REG(1), label: 'Growing out of a socket', category: 'question', member_insight_ids: ['ins-1', 'ins-2', 'ins-1b'] },
      { client_id: CLIENT, run_id: RUN, theme_id: REG(2), label: 'Running on a blade', category: 'question', member_insight_ids: ['ins-3', 'ins-3b', 'ins-3c'] },
    ],
    subjects: [{
      id: SUBJECT, client_id: CLIENT, name: 'Fit & comfort', description: 'Fit.', status: 'active', created_at: '2026-09-01T00:00:00.000Z', named_at: '2026-09-01T00:00:00.000Z',
      calibrated_at: '2026-10-01T00:00:00.000Z', calibration_precision: 0.9, calibration_n: 40, calibration_judge_version: judgeVersionFor(CLIENT), superseded_by: null,
    }],
    subject_memberships: ['ins-1', 'ins-2', 'ins-1b'].map((id) => ({ client_id: CLIENT, subject_id: SUBJECT, audience_insight_id: id, member: true })),
    month_subject_readings: ['2026-08-01', SEP].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', subject_id: SUBJECT, videos: 70, comments: 400, status: 'frozen', run_id: RUN, judge_version: judgeVersionFor(CLIENT) })),
    month_brand_readings: ['2026-07-01', '2026-08-01', SEP].flatMap((month) => [
      { client_id: CLIENT, month, audience: 'industry-other', brand_key: 'client', k_any: 4, k_content: 2, k_comment: 3, k_organic: 3, n: 300, n_organic: 280, status: 'frozen' },
      { client_id: CLIENT, month, audience: 'industry-other', brand_key: OTTO, k_any: 3, k_content: 1, k_comment: 2, k_organic: 2, n: 300, n_organic: 280, status: 'frozen' },
    ]),
    brand_mentions: [
      { id: 'bm1', client_id: CLIENT, video_id: V(1), brand_key: 'client', source: 'content', comment_id: null, comment_month: null, method: 'rule', rule_version: 'brands_v1' },
      { id: 'bm2', client_id: CLIENT, video_id: V(4), brand_key: OTTO, source: 'comment', comment_id: 'c3', comment_month: SEP, method: 'rule', rule_version: 'brands_v1' },
    ],
    competitive_insights: [
      { id: 'f1', client_id: CLIENT, run_id: RUN, category: 'topic_ownership', competitor_name: 'Ottobock', title: 'Ottobock’s talk turns on getting a knee paid for', finding: 'Where the market talks about knees in general, the videos naming Ottobock are about approvals.', impact_level: 'high', created_at: '2026-09-27T05:00:00.000Z' },
      { id: 'f2', client_id: CLIENT, run_id: RUN, category: 'positioning', competitor_name: 'Ottobock', title: 'Prosthetists mention it as what their clinic fits first', finding: null, impact_level: 'medium', created_at: '2026-09-27T05:00:00.000Z' },
    ],
    month_kind_readings: [{ client_id: CLIENT, month: SEP, audience: 'competitor:Ottobock', kind: 'question', videos: 3 }],
    video_claims: [{ id: 'k1', client_id: CLIENT, source_video_id: V(7), entity: 'competitor', claim: 'Approval stories from people who won an appeal.', quote: 'I won my appeal.' }],
    product_mentions: [],
    keyword_performance: [],
    config_changes: [],
    month_pair_comparability: [],
  }
}

function rpcs() {
  return {
    market_month_videos: () => [1, 2, 3, 4, 5, 6].map((n) => ({ video_id: V(n), audience: 'industry-other', platform: n <= 3 ? 'tiktok' : 'youtube' })),
    lens_readings: () => [
      { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: 2, n: 2 },
      { audience: 'industry-other', object_kind: 'kind', object_id: 'praise', k: 1, n: 2 },
      { audience: 'industry-other', object_kind: 'kind', object_id: 'question', k: 2, n: 2 },
      { audience: 'industry-other', object_kind: 'subject', object_id: SUBJECT, k: 1, n: 2 },
    ],
    window_theme_readings: () => [{ audience: 'competitor:Ottobock', theme_id: REG(1), videos: 2 }],
  }
}

type Counted = { total: number; by: Record<string, number> }

function counted(db: ReturnType<typeof fakeDb>): Counted {
  const by: Record<string, number> = {}
  for (const c of db.calls) by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] = (by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] ?? 0) + 1
  return { total: db.calls.length, by }
}

type Tables = ReturnType<typeof tables>

function harness(over: Partial<Record<keyof Tables, unknown>> = {}, rpcOver: Record<string, unknown> = {}) {
  const db = fakeDb({ ...tables(), ...over } as never, { ...rpcs(), ...rpcOver } as never)
  const base = { supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), now: NOW.toISOString() }
  return { db, base }
}

async function rootStatements(raw: Record<string, string> = {}): Promise<Counted> {
  const { db, base } = harness()
  await loadVoices({ ...base, params: parseVoicesParams(raw) })
  return counted(db)
}

async function groupLoad(key: string, raw: Record<string, string> = {}, over: Partial<Record<keyof Tables, unknown>> = {}) {
  const { db, base } = harness(over)
  const data = await loadVoicesGroup({ ...base, params: levelParams(raw), key })
  return { data, db, n: counted(db) }
}
async function brandLoad(key: string, raw: Record<string, string> = {}, over: Partial<Record<keyof Tables, unknown>> = {}) {
  const { db, base } = harness(over)
  const data = await loadVoicesBrand({ ...base, params: levelParams(raw), key })
  return { data, db, n: counted(db) }
}
async function creatorLoad(segments: string[], raw: Record<string, string> = {}, over: Partial<Record<keyof Tables, unknown>> = {}) {
  const { db, base } = harness(over)
  const data = await loadVoicesCreator({ ...base, params: levelParams(raw), segments })
  return { data, db, n: counted(db) }
}

// TODAY'S VOICES BEFORE THE PAGES (17 Oct, measured by this harness at
// fff60bbb, the panels still in place): the root 27, the root with a group's
// panel open 35, with a rival's 39, with a creator's 28. Each page now reads
// only what it prints. The root is unchanged (it reads no panel's extras).
// A GROUP'S PAGE, 40: the root's month, market and group cross, then its
// subjects' placement (`loadSubjectPlacement`) and their levels on the market
// (`loadObjectReadings`: the denominators, the subject months, the clock),
// its conversations' refs, labels, members on the themed run and
// descriptions, the brands in its videos (their identity, month rows and
// sets), its phrases' English and its three quotes (the gate's reads, then
// one bounded read of their evidence's insights). A BRAND'S PAGE, 39: its
// three months of rows (one read for every brand, which the switcher orders),
// its sets and its one lens call, the groups' videos (no membership read), the
// findings, a rival's ninety days (asked, its own claims, what is said about
// it, labelled off the themed run's members). A CREATOR'S PAGE, 24: the
// month's refs for the floor, then its conversations' refs with their counted
// comments, its own videos, those comments' citations under its videos alone,
// their English, its groups, its one lens call and the brands' sets.
describe('Voices\' statements, page by page', () => {
  it('counts each load', async () => {
    const root = await rootStatements()
    const group = (await groupLoad('carers')).n
    const brand = (await brandLoad(OTTO)).n
    const creator = (await creatorLoad(['tiktok', '@stepbystep.amp'])).n
    expect({ root: root.total, group: group.total, brand: brand.total, creator: creator.total }).toEqual({ root: 27, group: 40, brand: 39, creator: 24 })
    // The root reads no level page's extras: no run themes, descriptions,
    // placement memberships beyond the cross's, quotes or claims.
    for (const t of ['from:theme_observations', 'from:themes', 'from:video_claims', 'from:comment_translations', 'from:comments']) expect(root.by[t], t).toBeUndefined()
    // A creator's page reads its own videos once beside the market's rows and
    // the owned posts, and no group quote, finding or claim.
    expect(creator.by['from:videos']).toBe(3)
    for (const t of ['from:competitive_insights', 'from:video_claims', 'from:theme_observations', 'from:comments']) expect(creator.by[t], t).toBeUndefined()
    // A group's page reads no finding, no claim and no lens.
    for (const t of ['from:competitive_insights', 'from:video_claims', 'rpc:lens_readings']) expect(group.by[t], t).toBeUndefined()
    // A brand's page: one lens call, its own; one month-rows read.
    expect(brand.by['rpc:lens_readings']).toBe(1)
    expect(brand.by['from:month_brand_readings']).toBe(1)
  })

  it('opening a video or listing every one on a creator\'s page reads nothing more', async () => {
    const opened = (await creatorLoad(['tiktok', '@stepbystep.amp'], { video: V(1) })).n.total
    const every = (await creatorLoad(['tiktok', '@stepbystep.amp'], { videos: 'all' })).n.total
    expect([opened, every]).toEqual([24, 24])
  })
})

// WHAT EACH PAGE READ, FROM THE STAND-IN (the builders are pinned over their
// fixtures in voices-levels.test.ts; these pin the reads' glue).
describe('the level pages\' reads', () => {
  it('a group: its videos of the market, its subject with the conversation inside it, its conversations, labelled quotes', async () => {
    const { data } = await groupLoad('carers')
    if (data.kind !== 'group') throw new Error('missing')
    expect(data.month).toMatchObject({ month: SEP, monthWords: 'September', monthLabel: 'the last full month', n: 6 })
    expect(data.videos).toBe(3)
    expect(data.topSubject).toMatchObject({ label: 'Fit & comfort', k: 3 })
    expect(data.cards.map((c) => [c.name, c.k, c.inside.map((x) => [x.label, x.k]), c.market])).toEqual([['Fit & comfort', 3, [['Growing out of a socket', 2]], { k: 70, n: 320 }]])
    expect(data.conversations.map((c) => [c.label, c.k, c.all, c.subject?.name ?? null, c.description])).toEqual([
      ['Growing out of a socket', 2, 3, 'Fit & comfort', 'A child’s socket stops fitting within months.'],
      ['Running on a blade', 1, 2, null, 'Runners compare blades.'],
    ])
    expect(data.conversations[0].href).toBe(`/dashboard/market/conversations/${REG(1)}?period=month&month=2026-09`)
    // Each of its comments labelled with one of its own conversations.
    expect(data.quotes.map((q) => [q.ref, q.from?.label ?? null])).toEqual([['e:e1', 'Growing out of a socket'], ['e:e4', 'Growing out of a socket'], ['e:e2', 'Growing out of a socket']])
    expect(data.crumbs.map((c) => c.label)).toEqual(['Voices', 'Caregivers and family'])
    expect(data.crumbs[1].menu?.items.map((i) => [i.label, i.current])).toEqual([['Caregivers and family', true], ['Active and athletic', false]])
  })

  it('a brand: its finding leads, its month rows, the groups and creators on its videos, a rival\'s ninety days', async () => {
    const { data } = await brandLoad(OTTO)
    if (data.kind !== 'brand') throw new Error('missing')
    expect(data).toMatchObject({ label: 'Ottobock', state: 'counted', named: { k: 2, n: 280 }, any: { k: 3, n: 300 }, praised: { k: 1, n: 2 }, complained: { k: 0, n: 2 } })
    expect(data.lead?.title).toBe('Ottobock’s talk turns on getting a knee paid for')
    expect(data.findings.map((f) => f.title)).toEqual(['Prosthetists mention it as what their clinic fits first'])
    expect(data.months.map((m) => [m.label, m.k, m.n])).toEqual([['July', 2, 280], ['August', 2, 280], ['September', 2, 280]])
    expect(data.where).toEqual({ comment: 2, content: 1, n: 3 })
    expect(data.groups.map((g) => [g.name, g.k])).toEqual([['Active and athletic', 1]])
    expect(data.creators.map((c) => [c.account, c.k])).toEqual([['The Amputee Diaries', 1]])
    expect(data.claims).toEqual([{ id: 'k1', claim: 'Approval stories from people who won an appeal.' }])
    expect(data.said.map((q) => q.text)).toEqual(['Got the C-Leg approved after a year of fighting, worth it but the fight nearly broke me.'])
    expect(data.window).toMatchObject({ from: '2026-06-30', to: '2026-09-28' })
    // Any name an old link carries finds the same brand.
    for (const key of ['Ottobock', 'competitor:Ottobock', 'ottobock']) expect(((await brandLoad(key)).data as { brandKey?: string }).brandKey, key).toBe(OTTO)
    // Your own brand: no ninety days, no finding.
    const you = (await brandLoad('client')).data
    expect(you).toMatchObject({ kind: 'brand', you: true, window: null, lead: null, claims: [], said: [] })
  })

  it('a creator: its biggest conversation, its videos most counted first, every printable comment naming its conversation', async () => {
    const { data } = await creatorLoad(['tiktok', '@stepbystep.amp'])
    if (data.kind !== 'creator') throw new Error('missing')
    expect(data).toMatchObject({ account: '@stepbystep.amp', platformLabel: 'TikTok', videos: 3, followers: 3000, atFloor: 2 })
    expect(data.lead).toMatchObject({ label: 'Growing out of a socket', k: 2, ofTheme: 3 })
    expect(data.evidence.cards.map((v) => [v.caption, v.counted, v.quotes.map((q) => q.conv?.label ?? null)])).toEqual([
      ['Caption 2', 1, ['Growing out of a socket']], ['Caption 1', 1, ['Growing out of a socket']], ['Caption 3', 0, []],
    ])
    expect(data.groups.map((g) => [g.name, g.k])).toEqual([['Caregivers and family', 2]])
    expect(data.siblings.map((s) => s.account)).toEqual(['The Amputee Diaries'])
    // The account alone (an old link's one segment) names the same creator.
    expect(((await creatorLoad(['@stepbystep.amp'])).data as { key?: string }).key).toBe('tiktok|@stepbystep.amp')
  })
})

// A FOREIGN OR NON-MEMBER ID NAMES NOTHING (the brief: every new param is
// honoured only for the tenant's own rows and the page's own set). Each page
// takes an id from the URL and reads on the service role, so every read that
// could name a group, a brand, a creator or a video is filtered by the
// session's client.
describe('a foreign or non-member address names nothing', () => {
  const SECRET = /Other workspace/
  function withForeign() {
    const t = tables()
    return {
      consumer_profiles: [...t.consumer_profiles, { client_id: OTHER, run_id: RUN, run_date: '2026-09-30T05:00:00.000Z', personas: [{ key: 'foreign', name: 'Other workspace group', oneLiner: 'Other workspace one-liner', insightIds: ['ins-x'], registryIds: [] }] }],
      competitors: [...t.competitors, { id: '00000000-0000-4000-8000-0000000000f2', client_id: OTHER, name: 'Other workspace brand', retired_at: null, first_seen_at: '2026-08-01T00:00:00.000Z', superseded_by: null }],
      theme_registry: [...t.theme_registry, { id: REG(9), client_id: OTHER, canonical_label: 'Other workspace conversation', member_slugs: [] }],
    }
  }

  it('another workspace\'s group key, brand or creator: the calm missing state, and none of its words', async () => {
    const g = await groupLoad('foreign', {}, withForeign())
    expect(g.data).toEqual({ kind: 'missing', level: 'group', line: GROUP_MISSING })
    const b = await brandLoad('Other workspace brand', {}, withForeign())
    expect(b.data).toEqual({ kind: 'missing', level: 'brand', line: BRAND_MISSING })
    const c = await creatorLoad(['tiktok', 'Other workspace creator'], {}, withForeign())
    expect(c.data).toEqual({ kind: 'missing', level: 'creator', line: CREATOR_MISSING })
    for (const x of [g, b, c]) expect(JSON.stringify(x.data)).not.toMatch(SECRET)
  })

  it('a key the profile does not hold, an untracked brand, a creator under the floor, and Reddit each name nothing', async () => {
    expect((await groupLoad('nobody')).data).toMatchObject({ kind: 'missing', line: GROUP_MISSING })
    expect((await brandLoad('Patagonia')).data).toMatchObject({ kind: 'missing', line: BRAND_MISSING })
    // ottobockofficial's one post is not a market video; a creator with fewer
    // than three is under the floor.
    expect((await creatorLoad(['instagram', 'ottobockofficial'])).data).toMatchObject({ kind: 'missing', line: CREATOR_MISSING })
    expect((await creatorLoad(['reddit', 'r/amputee'])).data).toMatchObject({ kind: 'missing', line: CREATOR_REDDIT })
  })

  it('?video= names only the creator\'s own video: a foreign, another creator\'s or a malformed id opens nothing', async () => {
    for (const id of [V(9), V(4), 'not-an-id']) {
      const { data } = await creatorLoad(['tiktok', '@stepbystep.amp'], { video: id })
      if (data.kind !== 'creator') throw new Error('missing')
      expect(data.evidence.cards.map((v) => v.open)).toEqual([false, false, false])
      expect(JSON.stringify(data)).not.toMatch(SECRET)
    }
    const own = (await creatorLoad(['tiktok', '@stepbystep.amp'], { video: V(1) })).data
    expect(own.kind === 'creator' && own.evidence.cards.find((v) => v.id === V(1))?.open).toBe(true)
  })

  // THE READS THEMSELVES FILTER, NOT ONLY THE PARAMS: refs naming another
  // workspace's video and comment, cited by the tenant's own insight, never
  // reach a card, a count or a word, and every videos and citations read of a
  // creator's page names the session's client.
  it('another workspace\'s video and comment in the refs reach no card, count or word', async () => {
    const t = tables()
    const over = {
      comments: [...t.comments, { id: 'cf', client_id: OTHER, comment_date: '2026-09-15T10:00:00.000Z', platform: 'tiktok', video_id: 'p1', comment_id: 'x', author: 'foreign', likes: 0 }],
      insight_evidence: [...t.insight_evidence, { id: 'ef', audience_insight_id: 'ins-1', comment_id: 'cf', source: 'comment', quote: 'Other workspace words about the socket that outgrew a child.', relevance_rank: 1, redacted: false, lang: null, english: null }],
      month_evidence_refs: t.month_evidence_refs.map((r) => (r.object_id === REG(1) ? { ...r, video_ids: [...r.video_ids, V(9)], comment_ids: [...r.comment_ids, 'cf'] } : r)),
    }
    const { data, db } = await creatorLoad(['tiktok', '@stepbystep.amp'], {}, over)
    if (data.kind !== 'creator') throw new Error('missing')
    expect(data.evidence.cards.map((v) => [v.id, v.counted, v.quotable])).toEqual([[V(2), 1, 1], [V(1), 1, 1], [V(3), 0, 0]])
    expect(JSON.stringify(data)).not.toMatch(SECRET)
    for (const c of db.calls.filter((x) => x.table === 'videos')) expect(c.filters, 'videos').toContain(`client_id=${CLIENT}`)
    for (const c of db.calls.filter((x) => x.table === 'insight_evidence' && x.columns?.includes('quote'))) expect(c.filters, 'insight_evidence').toContain(`comments.client_id=${CLIENT}`)
    for (const c of db.calls.filter((x) => x.table === 'month_evidence_refs' || x.table === 'theme_registry')) expect(c.filters, c.table).toContain(`client_id=${CLIENT}`)
  })

  it('a group\'s and a brand\'s own reads name the session\'s client', async () => {
    const g = await groupLoad('carers')
    for (const c of g.db.calls.filter((x) => ['theme_observations', 'themes', 'theme_registry', 'month_evidence_refs', 'subject_memberships'].includes(x.table))) expect(c.filters, c.table).toContain(`client_id=${CLIENT}`)
    for (const c of g.db.calls.filter((x) => x.table === 'insight_evidence' && x.columns?.includes('comments!inner(client_id)'))) expect(c.filters).toContain(`comments.client_id=${CLIENT}`)
    const b = await brandLoad(OTTO)
    for (const c of b.db.calls.filter((x) => ['video_claims', 'videos', 'month_brand_readings', 'competitive_insights', 'theme_observations'].includes(x.table))) expect(c.filters, c.table).toContain(`client_id=${CLIENT}`)
  })
})
