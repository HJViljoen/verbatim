import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { SEALAND_LENS } from './fixture'
import { lensCategoryVideos, lensCounts, lensThemes, loadViewLens } from './lens'

// A view's readings off `month_lens_readings`, on Sealand's staging lens rows
// (lib/views/fixture.ts: what deploy 4's step writes for August and September
// 2026, read on staging without writing anything). September's market on
// staging is 654 videos: 381 read as buyers, 220 as makers' and 53 as
// off-topic (market_month_videos with segments_for_videos, 27 Sep).

const RIVALS = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']

describe('lensCounts: the view’s pooled market (decision E)', () => {
  it('pools the category and the brands you track, per month, on each lens', () => {
    const buyers = lensCounts(SEALAND_LENS.buyers, RIVALS)
    expect(buyers.get('2026-09-01')).toEqual({ month: '2026-09-01', videos: 381, comments: 9799, category: 355, rivalFiled: 26 })
    expect(buyers.get('2026-08-01')).toMatchObject({ videos: 146, category: 127, rivalFiled: 19 })
    expect(lensCounts(SEALAND_LENS.makers, RIVALS).get('2026-09-01')).toMatchObject({ videos: 220, category: 220, rivalFiled: 0 })
    expect(lensCounts(SEALAND_LENS.all_but_noise, RIVALS).get('2026-09-01')).toMatchObject({ videos: 601, category: 575, rivalFiled: 26 })
  })

  it('leaves a retired rival’s audience out of the market, as the stored rows do', () => {
    expect(lensCounts(SEALAND_LENS.buyers, ['competitor:Cotopaxi']).get('2026-09-01')).toMatchObject({ videos: 364, rivalFiled: 9 })
  })
})

describe('lensThemes and lensCategoryVideos', () => {
  it('reads each category theme’s videos on the lens, and the category’s n', () => {
    expect(lensThemes(SEALAND_LENS.buyers, '2026-09-01').get('03cabe7e')).toBe(57)
    expect(lensThemes(SEALAND_LENS.makers, '2026-09-01').get('faaa44da')).toBe(63)
    expect(lensThemes(SEALAND_LENS.buyers, '2026-08-01').get('03cabe7e')).toBe(15)
    expect(lensCategoryVideos(SEALAND_LENS.buyers, '2026-09-01')).toBe(355)
    expect(lensCategoryVideos(SEALAND_LENS.buyers, '2026-07-01')).toBeNull()
  })

  it('puts every video of a theme in exactly one of buyers, makers and off-topic (September’s biggest theme)', () => {
    const k = (lens: keyof typeof SEALAND_LENS) => lensThemes(SEALAND_LENS[lens], '2026-09-01').get('03cabe7e') ?? 0
    // 88 videos on the stored rows, a third of them makers' (the Conversation fixture): 57 + 31, no off-topic.
    expect(k('buyers') + k('makers')).toBe(88)
    expect(k('all_but_noise')).toBe(88)
  })
})

/** The one read, over a stand-in that answers as PostgREST does. */
function client(answer: { data: unknown[] | null; error: { message: string } | null }, calls: string[] = []): SupabaseClient {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order']) q[m] = (...a: unknown[]) => { calls.push(`${m}(${JSON.stringify(a)})`); return q }
  q.range = () => Promise.resolve(answer)
  return { from: (t: string) => { calls.push(`from(${t})`); return q } } as unknown as SupabaseClient
}

describe('loadViewLens', () => {
  it('reads nothing for Everything', async () => {
    const calls: string[] = []
    expect(await loadViewLens(client({ data: [], error: null }, calls), 'c', 'everything', ['2026-08-01', '2026-09-01'])).toEqual({ state: 'everything', view: 'everything' })
    expect(calls).toEqual([])
  })

  it('reads the view’s lens for the months the page prints, in one read', async () => {
    const calls: string[] = []
    const got = await loadViewLens(client({ data: SEALAND_LENS.buyers, error: null }, calls), 'c', 'buyers', ['2026-09-01', '2026-08-01'])
    expect(got.state).toBe('read')
    expect(calls).toContain('from(month_lens_readings)')
    expect(calls).toContain('eq(["lens","buyers"])')
    expect(calls).toContain('in(["month",["2026-08-01","2026-09-01"]])')
  })

  it('says not read where MF3 is not applied, where the reading month has no row, or on an error', async () => {
    const missing = { data: null, error: { message: "Could not find the table 'public.month_lens_readings' in the schema cache" } }
    expect(await loadViewLens(client(missing), 'c', 'makers', ['2026-09-01'])).toEqual({ state: 'not_read', view: 'makers', lens: 'makers', why: 'missing' })
    const augustOnly = SEALAND_LENS.buyers.filter((r) => r.month === '2026-08-01')
    expect(await loadViewLens(client({ data: augustOnly, error: null }), 'c', 'buyers', ['2026-08-01', '2026-09-01'])).toMatchObject({ state: 'not_read', why: 'no_rows' })
    const quiet = console.error
    console.error = () => {}
    try {
      expect(await loadViewLens(client({ data: null, error: { message: 'boom' } }), 'c', 'market', ['2026-09-01'])).toMatchObject({ state: 'not_read', lens: 'all_but_noise', why: 'error' })
    } finally {
      console.error = quiet
    }
  })
})
