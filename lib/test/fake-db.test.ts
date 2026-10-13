import { describe, expect, it } from 'vitest'

import { fakeDb } from './fake-db'

// The fake's one join and its filters (Phase 4 fix round and its check): a
// filter on a joined column reads the attached row, and an operator the fake
// does not know throws, so a test cannot pass by a filter it ignored.

const tables = () => ({
  insight_evidence: [
    { id: 'e1', audience_insight_id: 'i1', comment_id: 'c1', source: 'comment' },
    { id: 'e2', audience_insight_id: 'i1', comment_id: 'c2', source: 'comment' },
    { id: 'e3', audience_insight_id: 'i2', comment_id: 'gone', source: 'comment' },
  ],
  comments: [
    { id: 'c1', comment_date: '2026-10-05', author: null, status: 'kept' },
    { id: 'c2', comment_date: '2026-09-01', author: '@a', status: 'hidden' },
  ],
})

type Q = { data: Record<string, unknown>[] | null }
type B = Record<string, (...a: unknown[]) => B> & PromiseLike<Q>
const ids = (r: Q) => (r.data ?? []).map((x) => x.id)
const sel = (): B => ((fakeDb(tables()).client as { from(t: string): B }).from('insight_evidence')).select('id, comments!inner(id, comment_date, author, status)')

describe('fakeDb: a flat !inner embed', () => {
  it('attaches the related row and drops a parent without one', async () => {
    const r = await sel()
    expect(ids(r)).toEqual(['e1', 'e2'])
    expect((r.data![0] as { comments: unknown }).comments).toEqual({ id: 'c1', comment_date: '2026-10-05', author: null, status: 'kept' })
  })

  it('reads joined columns in every filter', async () => {
    const run = async (b: B) => ids(await b)
    expect(await run(sel().gte('comments.comment_date', '2026-10-01'))).toEqual(['e1'])
    expect(await run(sel().lt('comments.comment_date', '2026-10-01'))).toEqual(['e2'])
    expect(await run(sel().eq('comments.status', 'kept'))).toEqual(['e1'])
    expect(await run(sel().is('comments.author', null))).toEqual(['e1'])
    expect(await run(sel().not('comments.author', 'is', null))).toEqual(['e2'])
    expect(await run(sel().not('comments.status', 'in', '("hidden")'))).toEqual(['e1'])
    expect(await run(sel().in('comments.status', ['hidden']))).toEqual(['e2'])
  })

  it('throws on a not() operator it does not know, rather than filter nothing', () => {
    expect(() => sel().not('comments.status', 'ilike', '%k%')).toThrow(/not supported/)
  })
})
