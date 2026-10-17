import { describe, expect, it } from 'vitest'

import { fakeDb } from '../../test/fake-db'
import { readingHandle } from '../../reading/read'
import { judgeVersionFor } from '../../subjects/types'
import { fixtureId, fixtureRead, fixtureSubjectId, withSubjectReads } from './market-fixture'
import { loadMarket, marketParams, type MarketView } from './market'

// MARKET'S STATEMENTS, COUNTED OFFLINE. Every `.from(table)` and `.rpc(fn)` a
// page load makes, against a table-driven stand-in for the database
// (lib/test/fake-db.ts): a small tenant with one delivered update, its
// published week read and its themed run. The count is the number the
// production dump script prints (`scripts/market-v2-dump.ts`), measured here
// without a network, so a change to what a page reads shows up as a number in
// a diff. The absolute figures are this stand-in's; production pages more
// rows past the 1,000 cap, so a real load can read a few more pages of the
// same tables.

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const RUN = '00000000-0000-4000-8000-0000000000bb'

function tables() {
  const read = withSubjectReads(fixtureRead())
  const themes = [1, 3, 5]
  const subject = fixtureSubjectId('cost')
  return {
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    pipeline_runs: [{
      id: RUN, client_id: CLIENT, status: 'completed', started_at: '2026-10-12T04:00:00.000Z', completed_at: '2026-10-12T06:00:00.000Z',
      errors: [], window_start: read.window.from, window_end: read.window.to, options: {},
    }],
    week_reads: [{ client_id: CLIENT, run_id: RUN, kind: 'week', status: 'ready', month: '2026-10-01', window_end: read.window.to, data: read, created_at: '2026-10-12T06:00:00.000Z' }],
    themes: [{ client_id: CLIENT, run_id: RUN, created_at: '2026-10-12T05:00:00.000Z', registry_id: fixtureId(3), description: 'People describe insurance refusals.' }],
    // Three members each, so the subject's placement (`placeSubject`, at
    // least three of a conversation's members) puts all three inside Cost &
    // access, and its page lists them.
    theme_observations: themes.map((n) => ({ client_id: CLIENT, run_id: RUN, theme_id: fixtureId(n), label: `Conversation ${n}`, category: 'question', member_insight_ids: [`ins-${n}`, `ins-${n}-b`, `ins-${n}-c`] })),
    theme_registry: themes.map((n) => ({ id: fixtureId(n), client_id: CLIENT, canonical_label: `Conversation ${n}`, member_slugs: [] })),
    subjects: [{
      id: subject, client_id: CLIENT, name: 'Cost & access', description: 'Cost.', status: 'active', created_at: '2026-09-01T00:00:00.000Z',
      calibrated_at: '2026-10-01T00:00:00.000Z', calibration_precision: 0.9, calibration_n: 40, calibration_judge_version: judgeVersionFor(CLIENT),
    }],
    subject_memberships: themes.flatMap((n) => [`ins-${n}`, `ins-${n}-b`, `ins-${n}-c`].map((id) => ({ client_id: CLIENT, subject_id: subject, audience_insight_id: id, member: true }))),
    month_denominators: ['2026-09-01', '2026-10-01'].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', videos: 300, comments: 4000, platform_mix: { tiktok: 200, instagram: 100 }, status: 'filling', run_id: RUN, read_at: `${month.slice(0, 7)}-28T00:00:00.000Z` })),
    month_theme_readings: themes.map((n) => ({ client_id: CLIENT, month: '2026-10-01', audience: 'industry-other', theme_id: fixtureId(n), videos: 10 + n, platform_mix: { tiktok: 5, instagram: 5 + n }, status: 'filling', run_id: RUN })),
    // The category's, and the client's own posts, which the market leaves out.
    month_subject_readings: ['2026-09-01', '2026-10-01'].flatMap((month) => ['industry-other', 'client'].map((audience) => ({ client_id: CLIENT, month, audience, subject_id: subject, videos: audience === 'client' ? 9 : 70, comments: 400, status: 'filling', run_id: RUN, judge_version: judgeVersionFor(CLIENT) }))),
    month_kind_readings: ['2026-09-01', '2026-10-01'].flatMap((month) => ['question', 'praise'].map((kind) => ({ client_id: CLIENT, month, audience: 'industry-other', kind, videos: 120, comments: 400, status: 'filling', run_id: RUN }))),
    month_evidence_refs: themes.map((n) => ({ client_id: CLIENT, month: '2026-10-01', object_kind: 'theme', audience: 'industry-other', object_id: fixtureId(n), video_ids: ['v1'], comment_ids: ['c1'] })),
    audience_insights: [],
    // Conversation 3's counted comment this week, cited by its member insight
    // (one of the carers' own) and by another conversation's.
    insight_evidence: [
      { id: 'e1', audience_insight_id: 'ins-3', comment_id: 'c1', source: 'comment' },
      { id: 'e2', audience_insight_id: 'ins-1', comment_id: 'c1', source: 'comment' },
    ],
    comments: [{ id: 'c1', client_id: CLIENT, comment_date: '2026-10-07T10:00:00.000Z', platform: 'tiktok', video_id: 'n1' }],
    consumer_profiles: [{ client_id: CLIENT, run_date: '2026-10-12', personas: [{ key: 'carers', name: 'Caregivers and family', registryIds: [fixtureId(3)], insightIds: ['ins-3'] }] }],
    competitors: [],
    tracking_configs: [{ client_id: CLIENT, competitor_names: [], own_handles: {} }],
  }
}

function rpcs() {
  const themes = [1, 3, 5]
  return {
    window_denominators: () => [{ audience: 'industry-other', videos: 226, comments: 3000, platform_mix: { tiktok: 150, instagram: 76 } }],
    window_theme_readings: () => themes.map((n) => ({ audience: 'industry-other', theme_id: fixtureId(n), videos: 4 + n, comments: 20, platform_mix: { tiktok: 3, instagram: 1 + n } })),
    monthly_evidence_refs: () => themes.map((n) => ({ audience: 'industry-other', theme_id: fixtureId(n), video_ids: ['v1'], comment_ids: ['c1'] })),
    market_week_volumes: () => [],
    // The subject over the week's window, as the month's rows read it: the
    // category's 60 and the client's own 9, which the market leaves out.
    window_subject_readings: () => ['industry-other', 'client'].map((audience) => ({ audience, subject_id: fixtureSubjectId('cost'), videos: audience === 'client' ? 9 : 60, comments: 300, platform_mix: { tiktok: 40 }, excluded_on_camera: 0, excluded_undated: 0 })),
  }
}

/** One page load's statements: every table and function it named, counted. */
async function statements(raw: Record<string, string>, view?: MarketView): Promise<{ total: number; by: Record<string, number> }> {
  const db = fakeDb(tables() as never, rpcs() as never)
  await loadMarket({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params: marketParams(raw), view, now: new Date('2026-10-14T09:00:00.000Z') })
  const by: Record<string, number> = {}
  for (const c of db.calls) by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] = (by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] ?? 0) + 1
  return { total: db.calls.length, by }
}

// TODAY'S MARKET before the pages (17 Oct, measured by this harness at
// 8be41baa): the week 39, the week with the lead conversation open in place
// 45, the week with a subject open in place 40, the month 28. Each page now
// reads only what it prints. At 2fc55c9b a conversation's page was 40 and a
// subject's 34; each read one more on 17 Oct: a conversation's counts its
// groups (`insight_evidence` on its counted comments, one read a 250), and a
// subject's reads its week's share on the level's base
// (`window_subject_readings`; the window's market is the window read's,
// memoised).
//
// THE SUBJECT AS THE HUB (F3-Market-Subject, 17 Oct). Since the harness's
// three conversations have three members each, all three sit inside Cost &
// access, so its page reads who each is about (`monthly_evidence_refs`, one
// read for the window, as at 13773763: 36 with them inside). The hub adds
// three: its two earlier weeks on the level's base (`window_subject_readings`
// for each; their markets are the window reads', memoised) and every
// conversation's own description (`themes`, one read a 250). 39.
describe('Market\'s statements, page by page', () => {
  it('counts each load', async () => {
    const week = await statements({})
    const month = await statements({ period: 'month' })
    const conv = await statements({}, { kind: 'conversation', id: fixtureId(3) })
    const subject = await statements({}, { kind: 'subject', id: fixtureSubjectId('cost') })
    const subjectMonth = await statements({ period: 'month' }, { kind: 'subject', id: fixtureSubjectId('cost') })
    const read = await statements({}, { kind: 'week' })
    expect({ week: week.total, month: month.total, conv: conv.total, subject: subject.total, read: read.total }).toEqual({ week: 36, month: 28, conv: 41, subject: 39, read: 15 })
    // A conversation's groups are counted on its page alone (the week's
    // read resolves its quotes' evidence refs there, as it always has).
    expect(conv.by['from:insight_evidence']).toBe(1)
    for (const page of [week, month, subject]) expect(page.by['from:insight_evidence']).toBeUndefined()
    // The subject's three weeks on the level's base are read once each, on a
    // subject's page this week alone.
    expect(subject.by['rpc:window_subject_readings']).toBe(3)
    // Their n is each window read's own market: three windows, no fourth.
    expect(subject.by['rpc:window_denominators']).toBe(3)
    // The conversations' descriptions: one read beside the themed run's.
    expect(subject.by['from:themes']).toBe(2)
    for (const page of [week, month, conv, read, subjectMonth]) expect(page.by['rpc:window_subject_readings']).toBeUndefined()
    // The top page's week names no group and no "doing" on its small cards:
    // no profile read and no lead's kinds.
    expect(week.by['from:consumer_profiles']).toBeUndefined()
    expect(week.by['from:month_evidence_refs']).toBeUndefined()
    // The week's page reads one window and no subject, flag or reading.
    expect(read.by['rpc:window_theme_readings']).toBe(1)
    expect(read.by['from:subjects']).toBeUndefined()
    expect(read.by['from:anomaly_flags']).toBeUndefined()
    // A conversation's and a subject's page read no weekly volume and no kinds.
    for (const page of [conv, subject]) {
      expect(page.by['rpc:market_week_volumes']).toBeUndefined()
      expect(page.by['from:month_kind_readings']).toBeUndefined()
    }
  })
})

// ONE BASE FOR A SUBJECT'S TWO SHARES (17 Oct, F2-Market-Subject: "34% · 82
// of 241 videos this week" beside "31% · 99 of 318 videos in October so
// far"). The month tile's level is the subject's month reading pooled over
// the market's audiences, of the market's videos; the week tile is the same
// reading over the week's window, pooled over the same audiences, of the
// market's videos in the window. Until then the week counted only the videos
// a member's comment dates, which here is none (the stand-in holds no
// evidence): the tile printed 0% beside a month of 23%.
describe('a subject\'s week tile and month tile read one base', () => {
  async function load(rpcOver: Record<string, unknown> = {}) {
    const db = fakeDb(tables() as never, { ...rpcs(), ...rpcOver } as never)
    return loadMarket({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params: marketParams({}), view: { kind: 'subject', id: fixtureSubjectId('cost') }, now: new Date('2026-10-14T09:00:00.000Z') })
  }

  it('the week is the subject reading over the window, pooled as the month is: the client\'s own posts left out of both', async () => {
    const page = (await load())!.subjectPage!
    expect(page.panel.level).toMatchObject({ k: 70, n: 300 })
    expect(page.week).toEqual({ k: 60, n: 226 })
    // Not the blocks' base: no comment dates a member in the stand-in.
    expect(page.panel.detail?.cited).toEqual({ month: 0, week: 0 })
  })

  it('a read that fails, or answers no row, is unread: never a figure from another base', async () => {
    expect((await load({ window_subject_readings: () => ({ error: { code: 'XX000', message: 'boom' } }) }))!.subjectPage!.week).toBe('unread')
    expect((await load({ window_subject_readings: () => [] }))!.subjectPage!.week).toBe('unread')
  })

  it('its three weeks on the same base, oldest first, the newest the week tile\'s (F3-Market-Subject)', async () => {
    const page = (await load())!.subjectPage!
    expect(page.weeks).toEqual([60, 60, 60])
    // A window whose read fails is unread, never 0, and never from another base.
    let call = 0
    const failing = (await load({ window_subject_readings: () => (call++ === 0 ? { error: { code: 'XX000', message: 'boom' } } : [{ audience: 'industry-other', subject_id: fixtureSubjectId('cost'), videos: 50 }]) }))!.subjectPage!
    expect(failing.weeks).toEqual([null, 50, 50])
    expect(failing.week).toEqual({ k: 50, n: 226 })
  })

  it('every conversation inside it, biggest first, each with its own description and who it is about', async () => {
    const page = (await load())!.subjectPage!
    expect(page.inside.map((c) => [c.conv.label, c.conv.week, c.description ?? null])).toEqual([
      ['Conversation 5', 9, null], ['Conversation 3', 7, 'People describe insurance refusals.'], ['Conversation 1', 5, null],
    ])
    expect(page.insideTotal).toBe(3)
  })

  it('this month there is no week tile', async () => {
    const db = fakeDb(tables() as never, rpcs() as never)
    const data = await loadMarket({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params: marketParams({ period: 'month' }), view: { kind: 'subject', id: fixtureSubjectId('cost') }, now: new Date('2026-10-14T09:00:00.000Z') })
    expect(data!.subjectPage!.week).toBeNull()
  })
})

// A CONVERSATION'S GROUPS, COUNTED (17 Oct, F2-Market-Conversation: "New
// amputees, first year · 15 of 23"): the citations on its counted comments
// this week, its own member insights' alone, each group's videos of the
// conversation's videos this week (its stats' figure).
describe('a conversation\'s "who\'s saying it" counts each group over its own videos', () => {
  async function load(over: Record<string, unknown> = {}) {
    const db = fakeDb({ ...tables(), ...over } as never, rpcs() as never)
    return loadMarket({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params: marketParams({}), view: { kind: 'conversation', id: fixtureId(3) }, now: new Date('2026-10-14T09:00:00.000Z') })
  }

  it('Caregivers and family: 1 of the conversation\'s 7 videos this week', async () => {
    const page = (await load())!.convPage!
    expect(page.week).toMatchObject({ k: 7 })
    expect(page.panel.groupBase).toEqual({ n: 7, text: 'this week' })
    expect(page.panel.groups).toEqual([{ key: 'carers', name: 'Caregivers and family', href: '/dashboard/voices?group=carers#group-panel', videos: 1 }])
  })

  it('a citations read that fails keeps Pass E\'s names, with no count and no base', async () => {
    const { insight_evidence: _gone, ...rest } = tables()
    const db = fakeDb(rest as never, rpcs() as never)
    const page = (await loadMarket({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params: marketParams({}), view: { kind: 'conversation', id: fixtureId(3) }, now: new Date('2026-10-14T09:00:00.000Z') }))!.convPage!
    expect(page.panel.groupBase).toBeNull()
    expect(page.panel.groups).toEqual([{ key: 'carers', name: 'Caregivers and family', href: '/dashboard/voices?group=carers#group-panel' }])
  })
})

// A FOREIGN ID NAMES NOTHING (the fresh check, 17 Oct). The level pages take
// an id or a slug from the URL and read on the service role, so every read
// that could name a subject or a conversation is filtered by the session's
// client: a subject (`loadActiveSubjects`), a registry label
// (`loadRegistryLabels`), a slug (`loadLinkedTheme`, `resolveSlug`), a theme's
// description, its months and its evidence. Another workspace's id or slug,
// handed to either page, lands on the calm "not followed" state, and none of
// that workspace's words reaches the page's data, breadcrumb or switcher.
describe('a foreign id names nothing', () => {
  const OTHER = '00000000-0000-4000-8000-0000000000cc'
  const FOREIGN_THEME = fixtureId(9)
  const FOREIGN_SUBJECT = '00000000-0000-4000-8000-0000000000f1'
  const SECRET = /Other workspace/

  function withForeign() {
    const t = tables()
    return {
      ...t,
      theme_registry: [
        ...t.theme_registry.map((r) => (r.id === fixtureId(3) ? { ...r, member_slugs: ['own-slug'] } : r)),
        { id: FOREIGN_THEME, client_id: OTHER, canonical_label: 'Other workspace conversation', member_slugs: ['foreign-slug'] },
      ],
      themes: [...t.themes, { client_id: OTHER, run_id: RUN, created_at: '2026-10-12T05:00:00.000Z', registry_id: FOREIGN_THEME, description: 'Other workspace description.' }],
      theme_observations: [...t.theme_observations, { client_id: OTHER, run_id: RUN, theme_id: FOREIGN_THEME, label: 'Other workspace conversation', category: 'question', member_insight_ids: ['ins-x'] }],
      month_theme_readings: [...t.month_theme_readings, { client_id: OTHER, month: '2026-10-01', audience: 'industry-other', theme_id: FOREIGN_THEME, videos: 40, platform_mix: { tiktok: 40 }, status: 'filling', run_id: RUN }],
      subjects: [...t.subjects, { ...t.subjects[0], id: FOREIGN_SUBJECT, client_id: OTHER, name: 'Other workspace subject' }],
    }
  }

  async function load(view: MarketView) {
    const db = fakeDb(withForeign() as never, rpcs() as never)
    return loadMarket({ supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params: marketParams({}), view, now: new Date('2026-10-14T09:00:00.000Z') })
  }

  it.each([
    ['a conversation by another workspace\'s registry id', { kind: 'conversation', id: FOREIGN_THEME }],
    ['a conversation by another workspace\'s slug', { kind: 'conversation', id: 'foreign-slug' }],
    ['a subject by another workspace\'s id', { kind: 'subject', id: FOREIGN_SUBJECT }],
  ] as [string, MarketView][])('%s: the calm missing state, and none of its words', async (_label, view) => {
    const data = await load(view)
    expect(data?.missing).toBe(true)
    expect(data?.convPage).toBeUndefined()
    expect(data?.subjectPage).toBeUndefined()
    expect(JSON.stringify(data)).not.toMatch(SECRET)
  })

  it('the session\'s own slug and subject still open their pages (the control)', async () => {
    const conv = await load({ kind: 'conversation', id: 'own-slug' })
    expect(conv?.missing).toBeFalsy()
    expect(conv?.convPage?.panel.label).toBe('Conversation 3')
    const subject = await load({ kind: 'subject', id: fixtureSubjectId('cost') })
    expect(subject?.missing).toBeFalsy()
    expect(subject?.subjectPage?.panel.name).toBe('Cost & access')
    // The switcher lists the session's subjects alone.
    expect(JSON.stringify(subject?.crumbs ?? [])).not.toMatch(SECRET)
  })
})
