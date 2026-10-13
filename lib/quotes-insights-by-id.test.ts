import { describe, expect, it } from 'vitest'

import { fakeDb } from './test/fake-db'
import { fetchInsightsByIds } from './quotes'

// Phase 4 fix check: the weekly email reads Your moves' tile on the admin
// client, so the insight-by-id read takes the tenant where its caller names it.
describe('fetchInsightsByIds', () => {
  const rows = [
    { id: 'i1', client_id: 'c1', source_video_id: 'v1' },
    { id: 'i2', client_id: 'c2', source_video_id: 'v2' },
  ]
  it('filters by the tenant where one is named', async () => {
    const db = fakeDb({ audience_insights: rows })
    expect(await fetchInsightsByIds(db.client, ['i1', 'i2'], 'id, source_video_id', 'c1')).toEqual([rows[0]])
    expect(db.calls[0].filters).toContain('client_id=c1')
  })
  it('reads by id alone where none is named, as every other caller does', async () => {
    const db = fakeDb({ audience_insights: rows })
    expect((await fetchInsightsByIds(db.client, ['i1', 'i2'], 'id, source_video_id')).map((r) => (r as { id: string }).id)).toEqual(['i1', 'i2'])
  })
})
