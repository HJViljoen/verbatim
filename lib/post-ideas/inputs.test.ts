import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INDUSTRY_AUDIENCE } from '../rivals'
import { fakeDb } from '../test/fake-db'

// THE WINDOW THE STEP READS (Heinrich, 13 Oct: post ideas refresh every week
// and read the question comments of the four weeks ending at the run's window
// end). The reads are the product's own readers, stood in here so the test can
// see WHICH days each was asked for: the conversations' window reading and
// their dated evidence over the four weeks, the client's own posts over their
// three months to the run's end. What the selection does with the rows is
// select.test.ts's.

const calls = vi.hoisted(() => ({
  window: [] as { from: string; to: string; runId?: string | null; audiences?: readonly string[] }[],
  evidence: [] as { from: string; to: string }[],
  owned: [] as { from: string; to: string }[],
  pool: [] as string[][],
}))

vi.mock('../reading/read', async (orig) => ({
  ...(await orig<typeof import('../reading/read')>()),
  loadWindowReading: vi.fn(async (_db: unknown, _client: string, o: { from: string; to: string; runId?: string | null; audiences?: readonly string[] }) => {
    calls.window.push(o)
    return {
      denominators: [],
      themes: [
        { audience: INDUSTRY_AUDIENCE, theme_id: 'th-liner', videos: 9 },
        { audience: INDUSTRY_AUDIENCE, theme_id: 'th-quiet', videos: 2 },
      ],
    }
  }),
}))

vi.mock('../written/pool', async (orig) => ({
  ...(await orig<typeof import('../written/pool')>()),
  loadPoolThemes: vi.fn(async (_db: unknown, _client: string, _run: string, raw: readonly { theme_id: string; videos: number }[]) => {
    calls.pool.push(raw.map((r) => r.theme_id))
    return raw.map((r) => ({ themeId: r.theme_id, label: 'Questions about liner lifespan', description: null, kind: 'question', matchKind: null, memberIds: ['ins-1'], weekVideos: r.videos }))
  }),
}))

vi.mock('../written/evidence', async (orig) => ({
  ...(await orig<typeof import('../written/evidence')>()),
  loadTrackedBrands: vi.fn(async () => []),
  loadDatedEvidence: vi.fn(async (_db: unknown, _client: string, _ids: readonly string[], period: { from: string; to: string }) => {
    calls.evidence.push(period)
    return []
  }),
}))

vi.mock('../reading/owned', async (orig) => ({
  ...(await orig<typeof import('../reading/owned')>()),
  ownedPosts: vi.fn(async (_scope: unknown, w: { from: string; to: string }) => {
    calls.owned.push(w)
    return { basis: 'published', window: w, posts: [], total: 0, byPlatform: [] }
  }),
}))

const { loadPostIdeaInputs, ownedFrom } = await import('./step')

const CLIENT = '00000000-0000-4000-8000-0000000000c0'
const RUN = '00000000-0000-4000-8000-0000000000a1'

function admin(window: { start: string; end: string }): SupabaseClient {
  return fakeDb({
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    pipeline_runs: [{ id: RUN, client_id: CLIENT, window_start: window.start, window_end: window.end, window_basis: 'anchored' }],
  }).client as SupabaseClient
}

beforeEach(() => {
  calls.window.length = 0
  calls.evidence.length = 0
  calls.owned.length = 0
  calls.pool.length = 0
})

describe('loadPostIdeaInputs: the four weeks to the run\'s window end', () => {
  it('reads the conversations and their comments over the 28 days ending at the run\'s end, under the run\'s clustering', async () => {
    // Össur's 4 to 11 Oct run.
    const inputs = await loadPostIdeaInputs(admin({ start: '2026-10-04T11:45:54.031+00:00', end: '2026-10-11T04:00:32.885+00:00' }), { clientId: CLIENT, runId: RUN })
    const read = { from: '2026-09-13T04:00:32.885Z', to: '2026-10-11T04:00:32.885+00:00' }
    expect(inputs.read).toEqual(read)
    expect(inputs.window).toEqual({ from: '2026-10-04T11:45:54.031+00:00', to: '2026-10-11T04:00:32.885+00:00' })
    // ONE window reading over the four weeks (an arbitrary window, never a
    // sum of weeks), on the category, under this run's clustering.
    expect(calls.window).toEqual([{ ...read, runId: RUN, audiences: [INDUSTRY_AUDIENCE] }])
    // Only a conversation on three videos in the four weeks is judged.
    expect(calls.pool).toEqual([['th-liner']])
    // Its comments, dated by the comment, over the same four weeks.
    expect(calls.evidence).toEqual([read])
  })

  it('keeps the client\'s own posts on their three months, to the run\'s end, and the month on the run\'s week', async () => {
    const inputs = await loadPostIdeaInputs(admin({ start: '2026-10-04T04:01:17.279Z', end: '2026-10-11T04:00:32.889Z' }), { clientId: CLIENT, runId: RUN })
    expect(inputs.month).toBe('2026-10-01')
    expect(calls.owned).toEqual([{ from: ownedFrom('2026-10-01'), to: '2026-10-11T04:00:32.889Z' }])
    expect(ownedFrom('2026-10-01')).toBe('2026-08-01')
  })

  it('reads four weeks even where the run\'s own window is longer or shorter than a week', async () => {
    // A thirty-day first update.
    const long = await loadPostIdeaInputs(admin({ start: '2026-09-01T04:00:00Z', end: '2026-10-01T04:00:00Z' }), { clientId: CLIENT, runId: RUN })
    expect(long.read).toEqual({ from: '2026-09-03T04:00:00.000Z', to: '2026-10-01T04:00:00Z' })
    // A same-day rerun minutes wide.
    const short = await loadPostIdeaInputs(admin({ start: '2026-10-11T04:00:00Z', end: '2026-10-11T04:20:00Z' }), { clientId: CLIENT, runId: RUN })
    expect(short.read).toEqual({ from: '2026-09-13T04:20:00.000Z', to: '2026-10-11T04:20:00Z' })
  })

  it('a run that carries no window reads nothing and says so', async () => {
    const db = fakeDb({
      clients: [{ id: CLIENT, company_name: 'Össur' }],
      pipeline_runs: [{ id: RUN, client_id: CLIENT, window_start: null, window_end: null, window_basis: null }],
    }).client as SupabaseClient
    await expect(loadPostIdeaInputs(db, { clientId: CLIENT, runId: RUN })).rejects.toThrow(/carries no window/)
    expect(calls.window).toEqual([])
  })
})
