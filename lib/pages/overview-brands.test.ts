import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { marketMonthIds } from './overview-brands'

// The month's market videos as Your market reads them once for its brands
// block and its subjects' maker shares (the deploy-3 review): on the market's
// own audiences, so a retired rival's filed videos never enter "of N" while
// the page's pooled denominators leave them out. Stand-in ids; the audiences
// are staging Sealand's (the category, three tracked rivals, and Poler and
// Topo Designs, retired on 9 Sep).

const ROWS = [
  { video_id: 'v1', audience: 'industry-other' },
  { video_id: 'v2', audience: 'competitor:Patagonia' },
  { video_id: 'v3', audience: 'competitor:Poler' },
  { video_id: 'v4', audience: 'competitor:Cotopaxi' },
]

function stub(rows: typeof ROWS) {
  const calls: { name: string; args: unknown }[] = []
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args })
      const chain = {
        order: () => chain,
        range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('marketMonthIds', () => {
  it('keeps the category and the tracked brands, and leaves a retired rival’s filed videos out', async () => {
    const { client, calls } = stub(ROWS)
    const ids = await marketMonthIds(client, 'c', '2026-09-15', ['competitor:Patagonia', 'competitor:Cotopaxi', 'industry-other'])
    expect(ids).toEqual(['v1', 'v2', 'v4'])
    expect(calls).toEqual([{ name: 'market_month_videos', args: { p_client: 'c', p_month: '2026-09-01' } }])
  })

  it('keeps every row where no audiences are named (the brands block read on its own)', async () => {
    const { client } = stub(ROWS)
    expect(await marketMonthIds(client, 'c', '2026-09-01')).toEqual(['v1', 'v2', 'v3', 'v4'])
  })
})
