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
    theme_observations: themes.map((n) => ({ client_id: CLIENT, run_id: RUN, theme_id: fixtureId(n), label: `Conversation ${n}`, category: 'question', member_insight_ids: [`ins-${n}`] })),
    theme_registry: themes.map((n) => ({ id: fixtureId(n), client_id: CLIENT, canonical_label: `Conversation ${n}`, member_slugs: [] })),
    subjects: [{
      id: subject, client_id: CLIENT, name: 'Cost & access', description: 'Cost.', status: 'active', created_at: '2026-09-01T00:00:00.000Z',
      calibrated_at: '2026-10-01T00:00:00.000Z', calibration_precision: 0.9, calibration_n: 40, calibration_judge_version: judgeVersionFor(CLIENT),
    }],
    subject_memberships: themes.map((n) => ({ client_id: CLIENT, subject_id: subject, audience_insight_id: `ins-${n}`, member: true })),
    month_denominators: ['2026-09-01', '2026-10-01'].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', videos: 300, comments: 4000, platform_mix: { tiktok: 200, instagram: 100 }, status: 'filling', run_id: RUN, read_at: `${month.slice(0, 7)}-28T00:00:00.000Z` })),
    month_theme_readings: themes.map((n) => ({ client_id: CLIENT, month: '2026-10-01', audience: 'industry-other', theme_id: fixtureId(n), videos: 10 + n, platform_mix: { tiktok: 5, instagram: 5 + n }, status: 'filling', run_id: RUN })),
    month_subject_readings: ['2026-09-01', '2026-10-01'].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', subject_id: subject, videos: 70, comments: 400, status: 'filling', run_id: RUN, judge_version: judgeVersionFor(CLIENT) })),
    month_kind_readings: ['2026-09-01', '2026-10-01'].flatMap((month) => ['question', 'praise'].map((kind) => ({ client_id: CLIENT, month, audience: 'industry-other', kind, videos: 120, comments: 400, status: 'filling', run_id: RUN }))),
    month_evidence_refs: themes.map((n) => ({ client_id: CLIENT, month: '2026-10-01', object_kind: 'theme', audience: 'industry-other', object_id: fixtureId(n), video_ids: ['v1'], comment_ids: ['c1'] })),
    audience_insights: [],
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
    window_subject_readings: () => [],
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
// reads only what it prints.
describe('Market\'s statements, page by page', () => {
  it('counts each load', async () => {
    const week = await statements({})
    const month = await statements({ period: 'month' })
    const conv = await statements({}, { kind: 'conversation', id: fixtureId(3) })
    const subject = await statements({}, { kind: 'subject', id: fixtureSubjectId('cost') })
    const read = await statements({}, { kind: 'week' })
    expect({ week: week.total, month: month.total, conv: conv.total, subject: subject.total, read: read.total }).toEqual({ week: 36, month: 28, conv: 40, subject: 34, read: 15 })
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
