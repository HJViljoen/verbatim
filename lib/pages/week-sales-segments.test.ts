import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { fakeDb } from '../test/fake-db'
import { noiseCommentsOf } from './noise'
import { loadQuoteVideos } from './agent-thread'
import { buildSales } from './week'

// For Sales' and the weekly report's noise filter on the service role (9 Nov,
// the live-data bugs' review): `segments_for_videos` is service_role's alone,
// and This week (behind /api/export, page "week") and the weekly report handed
// buildSales and loadSubjectQuotes the session client, so the read was
// refused, the filter failed open, and a Sealand export quoted a comment from
// under a video marked noise. The segments are read on the client the caller
// passes for them (the reading handle's); the tenant is the session's.

const CLIENT = SEALAND_CLIENT_ID
const WINDOW = { from: '2026-10-04T04:03:00.000Z', to: '2026-10-11T04:02:00.000Z', basis: 'content' as const }
const DENIED = { error: { code: '42501', message: 'permission denied for function segments_for_videos' } }
const noiseOn = (bad: string) => (args: Record<string, unknown>) => (args.p_video_ids as string[]).map((id) => ({ video_id: id, segment: id === bad ? 'noise' : 'market', labelled: false }))

const cite = (n: number, videoUuid: string) => ({
  category: 'praise', themeId: 't1', themeLabel: 'Carry comfort', audience: 'industry-other', videoUuid, commentUuid: `cm-${n}`,
  evidenceId: `ev-${n}`, quote: `This bag is the most comfortable thing I own, number ${n} in my list.`, lang: null, english: null,
  platform: 'tiktok', commentDate: '2026-10-06T10:00:00.000Z', href: null,
})

describe('For Sales reads the noise segments on the service role', () => {
  it('quotes no comment from under a noise video when the session client is refused the function', async () => {
    const session = fakeDb({}, { segments_for_videos: () => DENIED })
    const admin = fakeDb({}, { segments_for_videos: noiseOn('v-noise') })
    const sales = await buildSales({
      supabase: session.client as never, admin: admin.client as never, clientId: CLIENT, window: WINDOW, windowVideos: 10, subjects: null,
      citations: Promise.resolve([cite(1, 'v-noise'), cite(2, 'v-market')]),
    })
    expect(admin.calls.filter((c) => c.table === 'segments_for_videos')).toHaveLength(1)
    expect(session.calls.filter((c) => c.table === 'segments_for_videos')).toEqual([])
    expect(sales.praise.map((q) => q.quote.text)).toEqual([cite(2, 'v-market').quote])
  })

  it('the weekly report\'s subject quotes take the same client for the segments', async () => {
    const session = fakeDb({ videos: [
      { id: 'v-noise', client_id: CLIENT, platform: 'tiktok', video_id: 'n1' },
      { id: 'v-market', client_id: CLIENT, platform: 'tiktok', video_id: 'n2' },
    ] }, { segments_for_videos: () => DENIED })
    const admin = fakeDb({}, { segments_for_videos: noiseOn('v-noise') })
    const noise = await noiseCommentsOf(session.client as never, CLIENT, [{ id: 'c1', platform: 'tiktok', video_id: 'n1' }, { id: 'c2', platform: 'tiktok', video_id: 'n2' }], admin.client as never)
    expect([...noise]).toEqual(['c1'])
    expect(session.calls.filter((c) => c.table === 'segments_for_videos')).toEqual([])
  })
})

describe('an Agent thread\'s quote videos read their segments on the service role', () => {
  it('asks the segments of the client passed for them, never the session\'s', async () => {
    const session = fakeDb({ videos: [{ id: 'v-noise', client_id: CLIENT, is_competitor: false, competitor_name: null }] }, { segments_for_videos: () => DENIED })
    const admin = fakeDb({}, { segments_for_videos: noiseOn('v-noise') })
    const out = await loadQuoteVideos(session.client as never, admin.client as never, CLIENT, ['v-noise'])
    expect(out.get('v-noise')).toMatchObject({ segment: 'noise' })
    expect(session.calls.filter((c) => c.table === 'segments_for_videos')).toEqual([])
    expect(admin.calls.filter((c) => c.op !== 'rpc')).toEqual([])
  })
})
