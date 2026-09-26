import { describe, expect, it, vi } from 'vitest'

// No model call: the query vectors are stubbed. The corpus search is the fake
// database's `match_insights`, below.
vi.mock('../pipeline/cluster', () => ({ embedTexts: async (qs: string[]) => qs.map(() => [0.1, 0.2]) }))

import { fakeDb } from '../test/fake-db'
import { insideWindow, retrieveForQueries, scopeAdmits, type RetrievalScope } from './retrieve'

// A pool shaped like Sealand's on staging (GA F11): category insights, the
// client's own, and insights on videos filed under a tracked rival, which
// today's rule never retrieves. Ids and dates only; no volume is claimed.
const RUN = 'run-0920'
const CLIENT = 'client-sealand'

const insight = (id: string, video: string, theme = 'packing') => ({
  id, client_id: CLIENT, theme, description: `${id} description`, emotion: null, journey_stage: null, source_video_id: video,
})
const video = (id: string, tags: { client?: boolean; rival?: string | null }, upload: string) => ({
  id, is_client: Boolean(tags.client), is_competitor: Boolean(tags.rival), competitor_name: tags.rival ?? null, upload_date: upload,
})
const evidence = (id: string, insightId: string, comment: string | null, rank = 1) => ({
  id, audience_insight_id: insightId, quote: `quote ${id}`, relevance_rank: rank, comment_id: comment, source_video_id: null, source: comment ? 'comment' : 'video', redacted: false,
})

function world(hits: string[]) {
  return fakeDb(
    {
      themes: [
        { id: 't1', client_id: CLIENT, run_id: RUN, registry_id: 'reg-carry', label: 'Confusion over airline bag sizes', bucket: 'industry-other', supporting_insight_ids: ['cat-1', 'cat-2', 'cli-1'] },
        { id: 't2', client_id: CLIENT, run_id: RUN, registry_id: 'reg-coto', label: 'Cotopaxi colour choices', bucket: 'competitor:Cotopaxi', supporting_insight_ids: ['coto-1', 'coto-2'] },
        { id: 't3', client_id: CLIENT, run_id: RUN, registry_id: 'reg-pata', label: 'Patagonia repairs', bucket: 'competitor:Patagonia', supporting_insight_ids: ['pata-1'] },
      ],
      audience_insights: [
        insight('cat-1', 'v-cat-1'), insight('cat-2', 'v-cat-2'), insight('cli-1', 'v-cli-1'),
        insight('coto-1', 'v-coto-1'), insight('coto-2', 'v-coto-2'), insight('pata-1', 'v-pata-1'),
      ],
      videos: [
        video('v-cat-1', {}, '2026-09-02'), video('v-cat-2', {}, '2023-05-01'), video('v-cli-1', { client: true }, '2026-09-10'),
        video('v-coto-1', { rival: 'Cotopaxi' }, '2026-08-20'), video('v-coto-2', { rival: 'Cotopaxi' }, '2025-11-01'),
        video('v-pata-1', { rival: 'Patagonia' }, '2026-09-05'),
      ],
      insight_evidence: [
        evidence('e1', 'cat-1', 'c-sep'), evidence('e2', 'cat-2', 'c-old'), evidence('e3', 'cli-1', 'c-sep2'),
        evidence('e4', 'coto-1', 'c-aug'), evidence('e5', 'coto-2', null), evidence('e6', 'pata-1', 'c-sep3'),
      ],
      comments: [
        { id: 'c-sep', comment_date: '2026-09-14' }, { id: 'c-old', comment_date: '2024-02-03' }, { id: 'c-sep2', comment_date: '2026-09-18' },
        { id: 'c-aug', comment_date: '2026-08-22' }, { id: 'c-sep3', comment_date: '2026-09-07' },
      ],
      comment_translations: [],
    },
    { match_insights: () => hits.map((id, i) => ({ id, similarity: 0.6 - i * 0.01 })) },
  )
}

const ALL = ['pata-1', 'coto-1', 'cat-1', 'coto-2', 'cat-2', 'cli-1']

describe('retrieveForQueries: the existing caller sees the rule it always had', () => {
  it('drops every rival voice after the cap, reads no dates and all time', async () => {
    const { client, calls } = world(ALL)
    const ctx = await retrieveForQueries(client as never, { clientId: CLIENT, runId: RUN, queries: ['carry-on size'] })
    expect(ctx.insights.map((i) => i.id)).toEqual(['cat-1', 'cat-2', 'cli-1'])
    expect(ctx.insights.every((i) => !i.bucket.startsWith('competitor:'))).toBe(true)
    // No comment read, no upload day: nothing about a window happens here.
    expect(calls.some((c) => c.table === 'comments')).toBe(false)
    expect(calls.find((c) => c.table === 'videos')?.columns).toBe('id, is_client, is_competitor, competitor_name')
  })

  it('caps BEFORE it scopes, so a rival-heavy search loses slots, exactly as before', async () => {
    const { client } = world(ALL)
    const ctx = await retrieveForQueries(client as never, { clientId: CLIENT, runId: RUN, queries: ['q'], limit: 3 })
    // The top three are Patagonia, Cotopaxi and one category insight: two of
    // the three slots go to voices the rule then drops.
    expect(ctx.insights.map((i) => i.id)).toEqual(['cat-1'])
  })
})

describe('retrieveForQueries with the market scope (WP3.9)', () => {
  const allTime: RetrievalScope = { rivals: [], window: null }

  it('a Cotopaxi question retrieves the insights filed under Cotopaxi, and no other rival’s', async () => {
    const { client } = world(ALL)
    const ctx = await retrieveForQueries(client as never, {
      clientId: CLIENT, runId: RUN, queries: ['cotopaxi colours'], scope: { rivals: ['Cotopaxi'], window: null },
    })
    const ids = ctx.insights.map((i) => i.id)
    expect(ids).toContain('coto-1')
    expect(ids).toContain('coto-2')
    expect(ids).not.toContain('pata-1')
    expect(ctx.insights.find((i) => i.id === 'coto-1')?.bucket).toBe('competitor:Cotopaxi')
    expect(ctx.insights.find((i) => i.id === 'coto-1')?.themeRef?.registryId).toBe('reg-coto')
  })

  it('a question that names no rival reads the market without any rival’s filed voices', async () => {
    const { client } = world(ALL)
    const ctx = await retrieveForQueries(client as never, { clientId: CLIENT, runId: RUN, queries: ['q'], scope: allTime })
    expect(ctx.insights.map((i) => i.id)).toEqual(['cat-1', 'cat-2', 'cli-1'])
  })

  it('scopes BEFORE the cap, so the cap counts only what the answer may use', async () => {
    const { client } = world(ALL)
    const ctx = await retrieveForQueries(client as never, { clientId: CLIENT, runId: RUN, queries: ['q'], limit: 3, scope: allTime })
    expect(ctx.insights.map((i) => i.id)).toEqual(['cat-1', 'cat-2', 'cli-1'])
  })

  it('the 90-day window is dated by the comment, and by the upload day where no comment is quoted', async () => {
    const { client } = world(ALL)
    // 90 days to the end of September, half-open.
    const window = { from: '2026-07-03', to: '2026-10-01' }
    const ctx = await retrieveForQueries(client as never, {
      clientId: CLIENT, runId: RUN, queries: ['q'], scope: { rivals: ['Cotopaxi'], window },
    })
    const ids = ctx.insights.map((i) => i.id)
    // cat-2's only quoted comment is from 2024: outside, whatever its video.
    expect(ids).not.toContain('cat-2')
    // coto-2 quotes no comment and its video is from 2025: outside.
    expect(ids).not.toContain('coto-2')
    expect(ids).toEqual(['coto-1', 'cat-1', 'cli-1'])
  })

  it('all time keeps the old evidence the window leaves out', async () => {
    const { client } = world(ALL)
    const ctx = await retrieveForQueries(client as never, { clientId: CLIENT, runId: RUN, queries: ['q'], scope: { rivals: ['Cotopaxi'], window: null } })
    expect(ctx.insights.map((i) => i.id)).toEqual(['coto-1', 'cat-1', 'coto-2', 'cat-2', 'cli-1'])
  })

  it('a failed read is an error, never an empty corpus', async () => {
    const { client } = world(ALL)
    const broken = { ...(client as object), from: (t: string) => (t === 'comments' ? { select: () => { throw new Error('comments: timeout') } } : (client as { from: (t: string) => unknown }).from(t)) }
    await expect(
      retrieveForQueries(broken as never, { clientId: CLIENT, runId: RUN, queries: ['q'], scope: { rivals: [], window: { from: '2026-07-03', to: '2026-10-01' } } }),
    ).rejects.toThrow()
  })
})

describe('the scope rules, pure', () => {
  it('admits the client, the category and an unfiled insight; a rival only by name', () => {
    const s: RetrievalScope = { rivals: ['cotopaxi '], window: null }
    expect(scopeAdmits('client', s)).toBe(true)
    expect(scopeAdmits('industry-other', s)).toBe(true)
    expect(scopeAdmits(null, s)).toBe(true)
    expect(scopeAdmits('competitor:Cotopaxi', s)).toBe(true)
    expect(scopeAdmits('competitor:Patagonia', s)).toBe(false)
    expect(scopeAdmits('competitor:Össur', { rivals: ['Ossur'], window: null })).toBe(true)
  })

  it('dates an insight by any quoted comment, else by its upload day, and never undated', () => {
    const w = { from: '2026-07-03', to: '2026-10-01' }
    expect(insideWindow(['2024-02-03', '2026-09-14'], null, w)).toBe(true)
    expect(insideWindow(['2024-02-03'], '2026-09-01', w)).toBe(false)
    expect(insideWindow([], '2026-09-01', w)).toBe(true)
    expect(insideWindow([], null, w)).toBe(false)
    expect(insideWindow([], null, null)).toBe(true)
    // Half-open: the window's end day is outside.
    expect(insideWindow(['2026-10-01'], null, w)).toBe(false)
  })
})
