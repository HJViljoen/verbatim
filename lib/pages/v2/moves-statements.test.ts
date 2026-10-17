import { describe, expect, it, vi } from 'vitest'

// No embedding call, ever: the short list's vectors are drawn unmerged
// offline (lib/pages/advice-shortlist.ts never throws; it logs and returns
// null).
vi.mock('../../pipeline/cluster', async (orig) => ({ ...(await orig<typeof import('../../pipeline/cluster')>()), embedTexts: async () => { throw new Error('offline') } }))

import { fakeDb } from '../../test/fake-db'
import { readingHandle } from '../../reading/read'
import { judgeVersionFor } from '../../subjects/types'
import { loadMovesPage } from './moves'
import { loadAdvicePage, loadMovePage, loadRecordPage } from './moves-levels-load'

// YOUR MOVES' STATEMENTS, COUNTED OFFLINE (levels as pages, 17 Oct): every
// `.from(table)` and `.rpc(fn)` a page load makes, against the table-driven
// stand-in (lib/test/fake-db.ts), as Market's harness counts its pages
// (./market-statements.test.ts). A small tenant: one delivered update, three
// pieces of advice (one decided), two dated moves (one on a ready subject,
// one on the first piece of advice), the advice's evidence and the subject's
// comments since its move. The figures are this stand-in's; production pages
// more rows past the 1,000 cap.

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000cc'
const RUN = '00000000-0000-4000-8000-0000000000bb'
const L1 = '00000000-0000-4000-8000-0000000000a1'
const L2 = '00000000-0000-4000-8000-0000000000a2'
const L3 = '00000000-0000-4000-8000-0000000000a3'
const SUBJECT = '00000000-0000-4000-8000-0000000000c1'
const T1 = '00000000-0000-4000-8000-0000000000e1'
const T2 = '00000000-0000-4000-8000-0000000000e2'
const V1 = '00000000-0000-4000-8000-0000000000d1'
const V2 = '00000000-0000-4000-8000-0000000000d2'
const FOREIGN_VIDEO = '00000000-0000-4000-8000-0000000000f9'
const M_SUBJECT = '00000000-0000-4000-8000-0000000000b1'
const M_ADVICE = '00000000-0000-4000-8000-0000000000b2'
const NOW = new Date('2026-10-14T09:00:00.000Z')

const rec = (lineage: string, n: number, over: Record<string, unknown> = {}) => ({
  id: `${lineage.slice(0, -2)}${String(10 + n).padStart(2, '0')}`, lineage_id: lineage, client_id: CLIENT, title: `Advice ${n}`, type: 'customer_experience', status: 'new',
  priority: n === 1 ? 'high' : 'medium', created_at: '2026-10-12T06:00:00.000Z', run_id: RUN, based_on: { insight_ids: ['mi-1'] },
  reasoning: 'People ask where to get a device. A desk would answer them.', hero_quote: null, ...over,
})

function tables() {
  return {
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    pipeline_runs: [{ id: RUN, client_id: CLIENT, status: 'completed', started_at: '2026-10-12T04:00:00.000Z', completed_at: '2026-10-12T06:00:00.000Z', errors: [], window_start: '2026-10-05T00:00:00.000Z', window_end: '2026-10-12T00:00:00.000Z', options: {} }],
    recommendations: [rec(L1, 1, { hero_quote: 'Where can I get a powered knee fitted near Leeds, and who covers it?' }), rec(L2, 2), rec(L3, 3, { based_on: { insight_ids: ['ci-1'] } })],
    rec_decisions: [{ id: 'd-1', client_id: CLIENT, lineage_id: L3, status: 'dismissed', decided_at: '2026-10-13T10:00:00.000Z' }],
    moves: [
      { id: M_SUBJECT, client_id: CLIENT, kind: 'subject', subject_id: SUBJECT, registry_ids: null, lineage_id: null, title: 'Clinic campaign', declared_at: '2026-09-14T00:00:00.000Z', dated_on: '2026-09-14', status: 'active', direction: 'up' },
      { id: M_ADVICE, client_id: CLIENT, kind: 'advice', subject_id: null, registry_ids: null, lineage_id: L1, title: 'Help desk pilot', declared_at: '2026-10-05T00:00:00.000Z', dated_on: null, status: 'active', direction: 'up' },
    ],
    subjects: [{
      id: SUBJECT, client_id: CLIENT, name: 'Community', description: 'Community.', status: 'active', created_at: '2026-09-01T00:00:00.000Z',
      calibrated_at: '2026-10-01T00:00:00.000Z', calibration_precision: 0.9, calibration_n: 40, calibration_judge_version: judgeVersionFor(CLIENT),
    }],
    subject_memberships: ['ins-1', 'ins-2'].map((id) => ({ client_id: CLIENT, subject_id: SUBJECT, audience_insight_id: id, member: true })),
    month_denominators: ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', videos: 300, comments: 4000, platform_mix: { tiktok: 200, instagram: 100 }, status: 'filling', run_id: RUN, read_at: `${month.slice(0, 7)}-28T00:00:00.000Z` })),
    month_theme_readings: ['2026-07-01', '2026-08-01', '2026-09-01'].flatMap((month) => [T1, T2].map((t, i) => ({ client_id: CLIENT, month, audience: 'industry-other', theme_id: t, videos: 10 + i, platform_mix: { tiktok: 5 }, status: 'filling', run_id: RUN }))),
    month_subject_readings: ['2026-07-01', '2026-08-01', '2026-09-01'].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', subject_id: SUBJECT, videos: 40, comments: 300, status: 'filling', run_id: RUN, judge_version: judgeVersionFor(CLIENT) })),
    market_insights: [{ id: 'mi-1', client_id: CLIENT, run_id: RUN, title: 'Access decides who gets fitted', evidence: { supporting_theme_ids: ['ins-1', 'ins-2', 'ins-3'] } }],
    competitive_insights: [{ id: 'ci-1', client_id: CLIENT, title: 'A rival is about cost' }],
    audience_insights: [
      { id: 'ins-1', client_id: CLIENT, theme: 'access', source_video_id: V1, category: 'question' },
      { id: 'ins-2', client_id: CLIENT, theme: 'access', source_video_id: V2, category: 'pain_point' },
      { id: 'ins-3', client_id: CLIENT, theme: 'cost', source_video_id: V2, category: 'question' },
    ],
    themes: [
      { id: 'th-1', client_id: CLIENT, run_id: RUN, created_at: '2026-10-12T05:00:00.000Z', registry_id: T1, supporting_insight_ids: ['ins-1', 'ins-2'], description: 'Where to get a device.' },
      { id: 'th-2', client_id: CLIENT, run_id: RUN, created_at: '2026-10-12T05:00:00.000Z', registry_id: T2, supporting_insight_ids: ['ins-3'], description: 'What it costs.' },
    ],
    theme_registry: [{ id: T1, client_id: CLIENT, canonical_label: 'Price and location questions' }, { id: T2, client_id: CLIENT, canonical_label: 'Cost frustration' }],
    theme_observations: [{ client_id: CLIENT, run_id: RUN, theme_id: T1, label: 'Price and location questions', category: 'question', member_insight_ids: ['ins-1', 'ins-2'] }],
    insight_evidence: [
      { id: 'e1', audience_insight_id: 'ins-1', comment_id: 'c1', source: 'comment', quote: 'Where can I get a powered knee fitted near Leeds, and who covers it?', relevance_rank: 1, redacted: false },
      { id: 'e2', audience_insight_id: 'ins-2', comment_id: 'c2', source: 'comment', quote: 'My insurance refused the powered knee twice and the appeal is still open.', relevance_rank: 1, redacted: false },
      { id: 'e3', audience_insight_id: 'ins-3', comment_id: 'c3', source: 'comment', quote: 'How much does a powered knee cost if insurance says no?', relevance_rank: 1, redacted: false },
    ],
    comments: [
      { id: 'c1', client_id: CLIENT, comment_date: '2026-09-20T10:00:00.000Z', platform: 'tiktok', video_id: 'n1', author: 'viewer1' },
      { id: 'c2', client_id: CLIENT, comment_date: '2026-10-02T10:00:00.000Z', platform: 'tiktok', video_id: 'n2', author: 'viewer2' },
      { id: 'c3', client_id: CLIENT, comment_date: '2026-10-03T10:00:00.000Z', platform: 'tiktok', video_id: 'n2', author: 'viewer3' },
    ],
    videos: [
      { id: V1, client_id: CLIENT, platform: 'tiktok', video_id: 'n1', video_url: 'https://www.tiktok.com/@a/video/n1', account_name: '@stepbystep.amp', caption: 'My first fitting', comments_count: 40, upload_date: '2026-09-18', is_client: false, is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered' },
      { id: V2, client_id: CLIENT, platform: 'tiktok', video_id: 'n2', video_url: 'https://www.tiktok.com/@a/video/n2', account_name: '@runner', caption: 'Insurance said no', comments_count: 90, upload_date: '2026-10-01', is_client: false, is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered' },
      { id: FOREIGN_VIDEO, client_id: OTHER, platform: 'tiktok', video_id: 'n9', video_url: 'https://x', account_name: 'Other workspace creator', caption: 'Other workspace video', comments_count: 5, upload_date: '2026-10-03', is_client: false, is_competitor: false, competitor_name: null, hashtags: [], topics: [], source: 'discovered' },
    ],
    comment_translations: [],
    consumer_profiles: [{ client_id: CLIENT, run_date: '2026-10-12', personas: [{ key: 'new', name: 'New amputees, first year', registryIds: [T1], insightIds: ['ins-1'] }] }],
    competitors: [],
    tracking_configs: [{ client_id: CLIENT, competitor_names: [], own_handles: {} }],
    plan_checks: [],
    brand_mentions: [],
  }
}

type Tables = ReturnType<typeof tables>

function scopeOf(db: ReturnType<typeof fakeDb>, params: Record<string, string> = {}) {
  return { supabase: db.client as never, clientId: CLIENT, reading: readingHandle(CLIENT, db.client as never), params }
}

/** One page load's statements: every table and function it named, counted. */
async function statements(load: (db: ReturnType<typeof fakeDb>) => Promise<unknown>, over: Partial<Tables> = {}): Promise<{ total: number; by: Record<string, number>; data: unknown; calls: ReturnType<typeof fakeDb>['calls'] }> {
  vi.setSystemTime(NOW)
  const db = fakeDb({ ...tables(), ...over } as never)
  const data = await load(db)
  const by: Record<string, number> = {}
  for (const c of db.calls) by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] = (by[`${c.op === 'rpc' ? 'rpc' : 'from'}:${c.table}`] ?? 0) + 1
  return { total: db.calls.length, by, data, calls: db.calls }
}

const root = (db: ReturnType<typeof fakeDb>) => loadMovesPage(scopeOf(db), { canDecide: true })
const advice = (id: string, params: Record<string, string> = {}) => (db: ReturnType<typeof fakeDb>) => loadAdvicePage(scopeOf(db, params), id, { canDecide: true })
const move = (id: string, params: Record<string, string> = {}) => (db: ReturnType<typeof fakeDb>) => loadMovePage(scopeOf(db, params), id, { canDecide: true })
const record = (params: Record<string, string> = {}) => (db: ReturnType<typeof fakeDb>) => loadRecordPage(scopeOf(db, params))

// BEFORE (d4e1480b, measured by this harness on a scratch copy of the base):
// the root 37; the root with a piece of advice open in place (`?advice=`,
// its hero quote read through the gate) 43; the root with the record open in
// place (`?advice=all`) 37: the record rode on every root read. A move's Open
// went to Market, so a move had no load of its own.
//
// NOW: the root 37 (it reads no quote and no record any more, and the same
// reads for its cards and moves); a piece of advice's page 33 (the root's
// core, no plan and no conclusions, plus its conversations, its cited
// comments once for its numbers and its quotes, its videos, the English of
// its candidates); a dated move's page 37 (the core, every move's line for
// the switcher, then its comments since its day, their videos and kinds);
// the record 3 (the latest update, the advice and its decisions).
describe('Your moves\' statements, page by page', () => {
  it('counts each load', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const r = await statements(root)
    const a = await statements(advice(L1))
    const m = await statements(move(M_SUBJECT))
    const rc = await statements(record())
    const opened = await statements(move(M_SUBJECT, { video: V1 }))
    const every = await statements(move(M_SUBJECT, { videos: 'all' }))
    const all = await statements(record({ all: '1' }))
    vi.useRealTimers()
    expect({ root: r.total, advice: a.total, move: m.total, record: rc.total }).toEqual({ root: 37, advice: 33, move: 37, record: 3 })
    // Opening a video, listing every one, or every piece of the record reads nothing more.
    expect([opened.total, every.total, all.total]).toEqual([37, 37, 3])
    // The advice's cited comments are read once, for its numbers and its
    // quotes together; its videos once; no plan and no conclusions.
    expect(a.by['from:insight_evidence']).toBe(1)
    expect(a.by['from:videos']).toBe(1)
    expect(a.by['from:plan_checks']).toBeUndefined()
    // The root reads no comment at all (no quote at level 1) and no record.
    expect(r.by['from:insight_evidence']).toBeUndefined()
    expect(r.by['from:comment_translations']).toBeUndefined()
    // A move's comments since its day once, its videos once; no plan.
    expect(m.by['from:insight_evidence']).toBe(1)
    expect(m.by['from:videos']).toBe(1)
    expect(m.by['from:plan_checks']).toBeUndefined()
    // The record reads three tables and no month at all.
    expect(Object.keys(rc.by).sort()).toEqual(['from:pipeline_runs', 'from:rec_decisions', 'from:recommendations'])
  })
})

describe('a piece of advice\'s page reads its own rows only', () => {
  it('its conversations, its numbers and one comment from its conversation, from the tenant\'s rows', async () => {
    const { data } = await statements(advice(L1))
    const page = data as Exclude<Awaited<ReturnType<typeof loadAdvicePage>>, 'missing' | null>
    expect(page.conversations).toMatchObject({ videos: 2, rows: [{ id: T1, label: 'Price and location questions', videos: 2, target: true, description: 'Where to get a device.' }, { id: T2, videos: 1 }] })
    expect(page.numbers).toMatchObject({ n: 2, where: { n: 2 } })
    expect(page.quotes !== 'unread' && page.quotes.map((q) => q.conv?.label)).toEqual(['Price and location questions', 'Cost frustration'])
    // The move dated on it, and its switcher's advice waiting (the third is decided).
    expect(page.moves !== 'unread' && page.moves.cards.map((c) => c.id)).toEqual([M_ADVICE])
    expect(page.crumbs[1].menu?.items.map((i) => i.key)).toEqual([L1, L2])
  })

  it('a recommendation id (an old `?rec=`) names its lineage; another workspace\'s or an unknown id is the calm missing state', async () => {
    const { data: byRec } = await statements(advice(rec(L1, 1).id))
    expect(byRec !== 'missing' && byRec !== null && (byRec as { card: { lineageId: string } }).card.lineageId).toBe(L1)
    const foreign = { recommendations: [...tables().recommendations, { ...rec('00000000-0000-4000-8000-0000000000a9', 9), client_id: OTHER, title: 'Other workspace advice' }] }
    // Its lineage, and its own recommendation id (an old `?rec=` of theirs).
    for (const id of ['00000000-0000-4000-8000-0000000000a9', rec('00000000-0000-4000-8000-0000000000a9', 9).id, 'not-an-id', '']) {
      const { data } = await statements(advice(id), foreign)
      expect(data).toBe('missing')
      expect(JSON.stringify(data)).not.toMatch(/Other workspace/)
    }
  })

  it('another workspace\'s insight, comment and video named in its evidence reach no figure and no word; every read names the client', async () => {
    const t = tables()
    const over = {
      market_insights: [{ ...t.market_insights[0], evidence: { supporting_theme_ids: ['ins-1', 'ins-2', 'ins-3', 'ins-x'] } }],
      audience_insights: [...t.audience_insights, { id: 'ins-x', client_id: OTHER, theme: 'x', source_video_id: FOREIGN_VIDEO, category: 'praise' }],
      comments: [...t.comments, { id: 'cf', client_id: OTHER, comment_date: '2026-10-02T10:00:00.000Z', platform: 'tiktok', video_id: 'n1', author: 'foreign' }],
      insight_evidence: [...t.insight_evidence, { id: 'ef', audience_insight_id: 'ins-1', comment_id: 'cf', source: 'comment', quote: 'Other workspace words about a powered knee fitting near Leeds.', relevance_rank: 0, redacted: false }],
    }
    const { data, calls } = await statements(advice(L1), over)
    const page = data as Exclude<Awaited<ReturnType<typeof loadAdvicePage>>, 'missing' | null>
    expect(page.numbers).toMatchObject({ n: 2 })
    expect(JSON.stringify(data)).not.toMatch(/Other workspace/)
    for (const c of calls.filter((x) => x.table === 'videos' || x.table === 'audience_insights' || x.table === 'themes')) expect(c.filters, c.table).toContain(`client_id=${CLIENT}`)
    for (const c of calls.filter((x) => x.table === 'insight_evidence')) expect(c.filters).toContain(`comments.client_id=${CLIENT}`)
  })

  it('a read that fails says so in its section, never as an empty one', async () => {
    const { insight_evidence: _e, ...noEvidence } = tables()
    const db = fakeDb(noEvidence as never)
    vi.setSystemTime(NOW)
    const page = await loadAdvicePage(scopeOf(db), L1, { canDecide: true }) as Exclude<Awaited<ReturnType<typeof loadAdvicePage>>, 'missing' | null>
    expect(page.numbers).toBe('unread')
    expect(page.quotes).toBe('unread')
    expect(page.conversations).not.toBe('unread')
  })

  it('a failed read under its conversations says so, never "no conversation"; a failed read of what it rests on throws, so the shell says it', async () => {
    vi.setSystemTime(NOW)
    type Page = Exclude<Awaited<ReturnType<typeof loadAdvicePage>>, 'missing' | null>
    for (const drop of ['themes', 'theme_registry']) {
      const { [drop]: _gone, ...rest } = tables() as Record<string, unknown>
      const page = await loadAdvicePage(scopeOf(fakeDb(rest as never)), L1, { canDecide: true }) as Page
      expect(page.conversations, drop).toBe('unread')
      expect(page.line, drop).toBe('unread')
      expect(page.card.aim, drop).toBeNull()
    }
    // Read as none, these would print "since replaced" and "no evidence".
    for (const drop of ['market_insights', 'audience_insights']) {
      const { [drop]: _gone, ...rest } = tables() as Record<string, unknown>
      await expect(loadAdvicePage(scopeOf(fakeDb(rest as never)), L1, { canDecide: true }), drop).rejects.toThrow(/could not be read/)
    }
  })

  it('a member gets no decision and no day to date it; a decided piece offers none either', async () => {
    const db = fakeDb(tables() as never)
    const member = await loadAdvicePage(scopeOf(db), L1, { canDecide: false }) as Exclude<Awaited<ReturnType<typeof loadAdvicePage>>, 'missing' | null>
    expect(member.canDecide).toBe(false)
    expect(member.dating).toBeNull()
    const decided = await loadAdvicePage(scopeOf(fakeDb(tables() as never)), L3, { canDecide: true }) as Exclude<Awaited<ReturnType<typeof loadAdvicePage>>, 'missing' | null>
    expect(decided.card.status).toBe('dismissed')
    expect(decided.dating).toBeNull()
  })
})

describe('a dated move\'s page reads its own rows only', () => {
  it('its comments since its day, by its subject\'s members, on the market\'s videos', async () => {
    const { data } = await statements(move(M_SUBJECT))
    const page = data as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>
    expect(page.card.id).toBe(M_SUBJECT)
    expect(page.window.from).toBe('2026-09-14T00:00:00.000Z')
    expect(page.evidence).toMatchObject({ state: 'ready', total: 2 })
    expect(page.evidence.videos.map((v) => v.aboutCount)).toEqual([1, 1])
    expect(page.facts).toMatchObject({ n: 2 })
    expect(page.others.map((c) => c.id)).toEqual([M_ADVICE])
    // The switcher: every dated move, the newest first, this one ticked.
    expect(page.crumbs[1].menu?.items.map((i) => [i.key, i.current])).toEqual([[M_ADVICE, false], [M_SUBJECT, true]])
  })

  it('another workspace\'s move id is missing; a foreign or non-member video id opens nothing', async () => {
    for (const id of ['00000000-0000-4000-8000-0000000000b9', 'nope']) expect((await statements(move(id))).data).toBe('missing')
    for (const video of [FOREIGN_VIDEO, '00000000-0000-4000-8000-0000000000e9', 'not-an-id']) {
      const { data } = await statements(move(M_SUBJECT, { video }))
      const page = data as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>
      expect(page.evidence.videos.every((v) => !v.open)).toBe(true)
      expect(JSON.stringify(data)).not.toMatch(/Other workspace/)
    }
    const { data } = await statements(move(M_SUBJECT, { video: V1 }))
    expect((data as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>).evidence.videos.find((v) => v.id === V1)?.open).toBe(true)
  })

  it('a comment before its day, another workspace\'s comment and the client\'s own posts reach nothing; every read names the client', async () => {
    const t = tables()
    const OWN = '00000000-0000-4000-8000-0000000000d3'
    const over = {
      comments: [
        ...t.comments,
        { id: 'c-old', client_id: CLIENT, comment_date: '2026-09-01T10:00:00.000Z', platform: 'tiktok', video_id: 'n1', author: 'early' },
        { id: 'c-for', client_id: OTHER, comment_date: '2026-10-02T10:00:00.000Z', platform: 'tiktok', video_id: 'n9', author: 'foreign' },
        { id: 'c-own', client_id: CLIENT, comment_date: '2026-10-02T10:00:00.000Z', platform: 'tiktok', video_id: 'n3', author: 'fan' },
      ],
      insight_evidence: [
        ...t.insight_evidence,
        { id: 'e-old', audience_insight_id: 'ins-1', comment_id: 'c-old', source: 'comment', quote: 'Words from before the move about a running clinic.', relevance_rank: 1, redacted: false },
        { id: 'e-for', audience_insight_id: 'ins-1', comment_id: 'c-for', source: 'comment', quote: 'Other workspace words about a running clinic.', relevance_rank: 1, redacted: false },
        { id: 'e-own', audience_insight_id: 'ins-2', comment_id: 'c-own', source: 'comment', quote: 'Words under the client own post about the clinic.', relevance_rank: 1, redacted: false },
      ],
      videos: [...t.videos, { ...t.videos[0], id: OWN, video_id: 'n3', is_client: true, account_name: 'Össur', caption: 'Our own clinic post' }],
    }
    const { data, calls } = await statements(move(M_SUBJECT, { videos: 'all' }), over)
    const page = data as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>
    expect(page.evidence.total).toBe(2)
    const json = JSON.stringify(data)
    for (const leak of [/before the move/, /Other workspace/, /client own post/, /Our own clinic post/]) expect(json).not.toMatch(leak)
    for (const c of calls.filter((x) => x.table === 'videos' || x.table === 'subject_memberships')) expect(c.filters, c.table).toContain(`client_id=${CLIENT}`)
    for (const c of calls.filter((x) => x.table === 'insight_evidence')) expect(c.filters).toContain(`comments.client_id=${CLIENT}`)
  })

  it('a failed read under the moves\' lines throws, so the shell says it: never the missing line, "names nothing" or "no reading"', async () => {
    vi.setSystemTime(NOW)
    // The themes an advice move is read on, and what the advice rests on.
    for (const drop of ['themes', 'market_insights']) {
      const { [drop]: _gone, ...rest } = tables() as Record<string, unknown>
      await expect(loadMovePage(scopeOf(fakeDb(rest as never)), M_ADVICE, { canDecide: true }), drop).rejects.toThrow(/could not be read/)
    }
  })

  it('U6: a failed subject\'s reason is said on its move\'s own page, even when another move on it is listed first', async () => {
    vi.setSystemTime(NOW)
    const t = tables()
    const M_LATER = '00000000-0000-4000-8000-0000000000b3'
    const failed = {
      subjects: [{ ...t.subjects[0], calibration_precision: 0.2, calibration_n: 400 }],
      moves: [...t.moves, { ...t.moves[0], id: M_LATER, title: 'Later clinic push', declared_at: '2026-10-01T00:00:00.000Z', dated_on: '2026-10-01' }],
    }
    const { data } = await statements(move(M_SUBJECT), failed as never)
    const page = data as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>
    expect(page.others.map((c) => c.id)).toContain(M_LATER)
    expect(page.card.unread).toBe('not_ready')
    expect(page.evidence.state).toBe('held')
  })

  it('U6: a move on a subject whose check is open lists nothing it said and reads no member; a failed read is unread', async () => {
    const t = tables()
    const open = { subjects: [{ ...t.subjects[0], calibration_precision: 0.4 }] }
    const { data, by } = await statements(move(M_SUBJECT), open)
    const page = data as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>
    expect(page.evidence.state).toBe('held')
    expect(page.facts).toBeNull()
    expect(by['from:subject_memberships']).toBeUndefined()
    expect(by['from:insight_evidence']).toBeUndefined()
    const { insight_evidence: _e, ...noEvidence } = t
    const db = fakeDb(noEvidence as never)
    const failed = await loadMovePage(scopeOf(db), M_SUBJECT, { canDecide: true }) as Exclude<Awaited<ReturnType<typeof loadMovePage>>, 'missing' | null>
    expect(failed.evidence.state).toBe('unread')
  })
})

describe('the advice record', () => {
  it('every piece once, grouped by what was decided; six no longer raised unless `?all=1`', async () => {
    const { data } = await statements(record())
    const page = data as NonNullable<Awaited<ReturnType<typeof loadRecordPage>>>
    expect(page).toMatchObject({ total: 3, decided: 1, waiting: 2, since: '2026-10-12' })
    expect(page.groups.map((g) => [g.key, g.rows.length])).toEqual([['waiting', 2], ['decided', 1], ['gone', 0]])
  })

  it('reads another workspace\'s advice never, and before the first update it is the first-run line', async () => {
    const t = tables()
    const { data } = await statements(record(), { recommendations: [...t.recommendations, { ...rec('00000000-0000-4000-8000-0000000000a9', 9), client_id: OTHER, title: 'Other workspace advice' }] })
    expect(JSON.stringify(data)).not.toMatch(/Other workspace/)
    expect((await statements(record(), { pipeline_runs: [] })).data).toBeNull()
  })
})
