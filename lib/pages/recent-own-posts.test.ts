import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { loadRecentOwnPosts as overviewPosts } from './overview'
import { loadRecentOwnPosts as marketPosts } from './market-surface'

// "Your posts" on Your market's questions line and census (overview.ts) and on
// Your moves' questions (market-surface.ts) are the posts off your own
// accounts, `source = 'owned'` through `ownedPosts` (depth v2, T7 for T14),
// never a creator's video that names you and so carries `is_client`.

const CLIENT = 'c-1'
const video = (id: string, over: Record<string, unknown>) => ({
  id, client_id: CLIENT, video_id: `p-${id}`, platform: 'instagram', video_url: `https://x/${id}`, account_name: 'acct',
  upload_date: '2026-09-10', caption: null, classified_type: null, hook_style: null, hook_text: null,
  engagement_rate: null, views: 10, likes: 1, comments_count: 3, topics: ['liner'], is_client: true,
  is_competitor: false, competitor_name: null, source: 'owned', sentiment: null, sentiment_source: null, analyzed_lane: null,
  ...over,
})

const rows = () => [
  video('b-own', {}),
  video('a-own', { upload_date: '2026-07-02', comments_count: 0 }),
  // A creator naming the brand: `is_client`, not ours.
  video('c-creator', { source: 'discovered', account_name: 'someone' }),
  // Ours, but outside the three months.
  video('d-old', { upload_date: '2026-06-30' }),
  // Ours, after the month.
  video('e-next', { upload_date: '2026-10-01' }),
]

describe('loadRecentOwnPosts reads your own accounts only', () => {
  it('Your market (overview): three months to the reading month, in id order', async () => {
    const db = fakeDb({ videos: rows() })
    const posts = await overviewPosts(db.client as never, CLIENT, '2026-09-01')
    expect(posts).toEqual([
      { id: 'a-own', upload_date: '2026-07-02', comments_count: 0, topics: ['liner'] },
      { id: 'b-own', upload_date: '2026-09-10', comments_count: 3, topics: ['liner'] },
    ])
    const read = db.calls.find((c) => c.table === 'videos')!
    expect(read.filters).toContain('source=owned')
    expect(read.filters.some((f) => f.startsWith('is_client'))).toBe(false)
  })

  it('Your moves (market-surface): the window it is handed, in id order', async () => {
    const db = fakeDb({ videos: rows() })
    const posts = await marketPosts(db.client as never, CLIENT, '2026-07-01', '2026-10-01')
    expect(posts).toEqual([
      { id: 'a-own', upload_date: '2026-07-02', topics: ['liner'], video_url: 'https://x/a-own' },
      { id: 'b-own', upload_date: '2026-09-10', topics: ['liner'], video_url: 'https://x/b-own' },
    ])
  })

  it('a failed read is null on Your market and a rejection on Your moves (its caller logs it)', async () => {
    const db = fakeDb({})
    expect(await overviewPosts(db.client as never, CLIENT, '2026-09-01')).toBeNull()
    await expect(marketPosts(db.client as never, CLIENT, '2026-07-01', '2026-10-01')).rejects.toBeTruthy()
  })
})
