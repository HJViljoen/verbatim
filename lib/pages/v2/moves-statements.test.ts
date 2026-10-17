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

describe('Your moves\' statements, page by page', () => {
  it('counts each load', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const r = await statements(root)
    const a = await statements(advice(L1))
    const m = await statements(move(M_SUBJECT))
    const rc = await statements(record())
    vi.useRealTimers()
    console.log(JSON.stringify({ root: r.total, advice: a.total, move: m.total, record: rc.total, rootBy: r.by, adviceBy: a.by, moveBy: m.by, recordBy: rc.by }, null, 1))
    expect(r.total).toBeGreaterThan(0)
  })
})
