import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID } from '../../config'
import { INDUSTRY_AUDIENCE } from '../../rivals'
import { fakeDb } from '../../test/fake-db'

// THE CONTENT PAGE AND ITS TILE READ THE IDEAS' FOUR WEEKS (Heinrich, 13 Oct:
// the ideas refresh weekly and read the question comments of the four weeks
// ending at their run's end). The window reads are stood in so the test sees
// WHICH days each was asked for: the ideas' stored `read_start` / `read_end`
// as one arbitrary window (never a sum of weeks), each of its four weeks for
// the bare counts, and the page's month beside them, all under the page's
// run's clustering. The switch is turned on here (it is off for every tenant).

const asked = vi.hoisted(() => [] as { from: string; to: string; runId: string | null }[])

vi.mock('../../config', async (orig) => ({
  ...(await orig<typeof import('../../config')>()),
  postIdeasEnabled: () => true,
}))

/** Every window answers: the market 640 videos, the liner conversation 48, and
 *  each of the four weeks by its start (6, 9, 14, 23). */
const WEEKLY: Record<string, number> = {
  '2026-09-13T04:02:00.000Z': 6,
  '2026-09-20T04:02:00.000Z': 9,
  '2026-09-27T04:02:00.000Z': 14,
  '2026-10-04T04:02:00.000Z': 23,
}
vi.mock('../../reading/read', async (orig) => ({
  ...(await orig<typeof import('../../reading/read')>()),
  loadWindowReading: vi.fn(async (_db: unknown, _client: string, o: { from: string; to: string; runId?: string | null }) => {
    asked.push({ from: o.from, to: o.to, runId: o.runId ?? null })
    const k = WEEKLY[o.from] ?? (o.from === '2026-09-13T04:02:00.000Z' ? 48 : 31)
    const four = o.from === '2026-09-13T04:02:00.000Z' && o.to === '2026-10-11T04:02:00.000Z'
    // September in full (an older set's own month): 27 of 839.
    const sep = o.from === '2026-09-01T00:00:00.000Z' && o.to === '2026-10-01T00:00:00.000Z'
    return {
      denominators: [{ audience: INDUSTRY_AUDIENCE, videos: four ? 640 : sep ? 839 : 318, comments: 0, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }],
      themes: o.runId ? [{ audience: INDUSTRY_AUDIENCE, theme_id: LINER, videos: four ? 48 : sep ? 27 : k, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 }] : null,
    }
  }),
}))

vi.mock('../../reading/owned', async (orig) => ({
  ...(await orig<typeof import('../../reading/owned')>()),
  ownedPosts: vi.fn(async (_scope: unknown, w: { from: string; to: string }) => ({ basis: 'published', window: w, posts: [], total: 0, byPlatform: [] })),
}))

const { loadContentPage, topContent } = await import('./content')

const LINER = 'a1000000-0000-4000-8000-000000000001'
const RUN = 'r0000000-0000-4000-8000-000000000001'

const idea = {
  id: 'i0000001-0000-4000-8000-000000000000', client_id: OSSUR_CLIENT_ID, run_id: RUN,
  window_start: '2026-10-04T04:03:00.000Z', window_end: '2026-10-11T04:02:00.000Z',
  read_start: '2026-09-13T04:02:00.000Z', read_end: '2026-10-11T04:02:00.000Z',
  rank: 1, registry_id: LINER, title: 'How long does a liner last, and how do you know it is time to replace it?',
  cover: { text: 'How long liners usually last' }, subquestions: [], format: null, format_multiple: null, opening: null, opening_multiple: null,
  model: 'gpt-5.4', prompt_version: 'post_ideas_v3', created_at: '2026-10-11T05:10:00.000Z',
}

/** A newer run's published week (11 to 18 Oct), which wrote no ideas: the
 *  ideas shown are then the older run's. */
const RUN2 = 'r0000000-0000-4000-8000-000000000002'
const NEWER = { from: '2026-10-11T04:03:00.000Z', to: '2026-10-18T04:02:00.000Z' }
const newerRead = { client_id: OSSUR_CLIENT_ID, run_id: RUN2, kind: 'week', status: 'ready', month: '2026-10-01', window_end: NEWER.to, data: { version: 2, window: NEWER, newThisWeek: [] } }

function scope(opts: { newer?: boolean } = {}): Parameters<typeof topContent>[0] {
  const db = fakeDb({
    post_ideas: [{ ...idea }],
    clients: [{ id: OSSUR_CLIENT_ID, company_name: 'Össur' }],
    theme_observations: [RUN, RUN2].map((run) => ({ client_id: OSSUR_CLIENT_ID, run_id: run, theme_id: LINER, label: 'Liner lifespan and replacement', category: 'question', member_insight_ids: [] })),
    ...(opts.newer ? { week_reads: [{ ...newerRead }] } : {}),
  }).client as SupabaseClient
  return { supabase: db, clientId: OSSUR_CLIENT_ID, reading: { client: db, clientId: OSSUR_CLIENT_ID }, params: {} } as Parameters<typeof topContent>[0]
}

const FOUR = { from: '2026-09-13T04:02:00.000Z', to: '2026-10-11T04:02:00.000Z', runId: RUN }
const NOW = new Date('2026-10-13T08:00:00.000Z')

beforeEach(() => {
  asked.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('the Content page reads each idea over the four weeks its set read', () => {
  it('reads the four weeks as one window and each of its weeks, under the page\'s run, beside the month', async () => {
    const data = await loadContentPage(scope(), { now: NOW })
    // The four weeks, once; each of their weeks; never a sum.
    expect(asked).toContainEqual(FOUR)
    for (const from of Object.keys(WEEKLY)) expect(asked.some((a) => a.from === from && a.runId === RUN)).toBe(true)
    expect(asked).toContainEqual({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-11T04:02:00.000Z', runId: RUN })
    expect(data.ideas.state).toBe('ready')
    expect(data.ideas.week?.read).toMatchObject({ label: '14 Sep to 11 Oct' })
    const [card] = data.ideas.cards
    expect(card.read).toEqual({ k: 48, n: 640 })
    expect(card.month).toEqual({ k: 31, n: 318 })
    expect(card.weeks).toEqual([
      { label: '14 Sep', count: 6 }, { label: '21 Sep', count: 9 }, { label: '28 Sep', count: 14 }, { label: '5 Oct', count: 23 },
    ])
  })
})

describe('the Dashboard\'s Content tile reads the same four weeks', () => {
  it('reads the four weeks and the month only (no weeks, no page week), and names the days', async () => {
    const top = await topContent(scope(), { now: NOW, published: null })
    expect(asked).toEqual(expect.arrayContaining([FOUR, { from: '2026-10-01T00:00:00.000Z', to: '2026-10-11T04:02:00.000Z', runId: RUN }]))
    expect(asked).toHaveLength(2)
    expect(top.state).toBe('ready')
    expect(top.idea?.read).toEqual({ k: 48, n: 640 })
    expect(top.idea?.month).toEqual({ k: 31, n: 318 })
    expect(top.idea?.ideasWeek.read.label).toBe('14 Sep to 11 Oct')
  })
})

describe('an OLDER set of ideas sits beside its own month, never the page\'s (the lead\'s ruling, 13 Oct)', () => {
  // The page's week is 11 to 18 Oct (October so far); the ideas are the 4 to
  // 11 Oct run's, read 14 Sep to 11 Oct, so their month is September in full
  // (`readingMonthOf` over their read window): the four weeks and the month
  // always share days.
  const SEPT = { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', runId: RUN2 }

  it('on the page', async () => {
    const data = await loadContentPage(scope({ newer: true }), { now: NOW })
    expect(data.week?.runId).toBe(RUN2)
    expect(data.month).toMatchObject({ month: '2026-10-01', complete: false })
    expect(data.ideas.week).toMatchObject({ current: false, month: { month: '2026-09-01', complete: true }, read: { label: '14 Sep to 11 Oct' } })
    expect(asked).toContainEqual({ ...FOUR, runId: RUN2 })
    expect(asked).toContainEqual(SEPT)
    const [card] = data.ideas.cards
    expect(card.read).toEqual({ k: 48, n: 640 })
    expect(card.month).toEqual({ k: 27, n: 839 })
  })

  it('on the tile', async () => {
    const published = { runId: RUN2, month: '2026-10-01', windowEnd: NEWER.to, data: { window: NEWER } } as never
    const top = await topContent(scope(), { now: NOW, published })
    expect(asked).toEqual(expect.arrayContaining([{ ...FOUR, runId: RUN2 }, SEPT]))
    expect(top.idea).toMatchObject({ read: { k: 48, n: 640 }, month: { k: 27, n: 839 }, monthWords: 'in September' })
    expect(top.idea?.ideasWeek.current).toBe(false)
    expect(top.line).toBe('No new ideas this week. These are from the week of 5 Oct.')
  })

  it('this week\'s ideas stay beside the page\'s month, read once', async () => {
    const top = await topContent(scope(), { now: NOW, published: null })
    expect(top.idea?.monthWords).toBe('in October so far')
    expect(asked.filter((a) => a.from === '2026-10-01T00:00:00.000Z')).toHaveLength(1)
  })
})
