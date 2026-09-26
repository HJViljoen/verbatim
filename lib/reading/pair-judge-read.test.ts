import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pairSentence } from '../calibration'
import { pairOnVerdict } from './comparability'
import { loadPairOn, pairRowFromStored, readingHandle } from './read'

// The month-pair judge a loader holds fails CLOSED (market-first decision D,
// WP1.3 review fix). Its inputs are the change log, the pair rows, the updates
// and the schedule; any read error other than MF1's missing table used to take
// the whole page, or Ask's answer, down with it. Now every pair is refused as
// unmeasured and the page renders. Never the other way: a read error that let
// a pair through would print "moved" over our own changes.

describe('loadPairOn', () => {
  it('refuses every pair, and never rejects, when its reads fail', async () => {
    const failing = { from: () => { throw new Error('connection reset') } } as unknown as SupabaseClient
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const pair = await loadPairOn(readingHandle('pair-judge-read-test', failing), '2026-10-02T06:00:00.000Z')
      const p = pair('2026-08-01', '2026-09-01', 'industry-other')
      expect(p.mode).toBe('refuse')
      expect(p.reasons.map((r) => r.kind)).toEqual(['unmeasured'])
      expect(pairSentence(pairOnVerdict(p).note!)).toBe('Not compared yet.')
      expect(logged).toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })
})

describe('pairRowFromStored: WP1.8\u2019s one figure (the 26 Sep ruling)', () => {
  // Staging's (Aug, Sep) row as measure-comparability wrote it on 26 Sep 16:42Z.
  const stored = {
    prev_month: '2026-08-01', month: '2026-09-01',
    search_outside_prev: 148, videos_prev: 351, search_outside_curr: 376, videos_curr: 625,
    code_changes: [], depth_prev_median: 21, depth_curr_median: 14, gather: [], late_capture: null,
    read_through_run: 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4', method_version: 'mf1_v1', computed_at: '2026-09-26T16:42:06.059334+00:00',
    added_only_curr: 356, market_videos_curr: 654,
  }

  it('reads the market count beside the strict one, which it leaves as it was', () => {
    const row = pairRowFromStored(stored)
    expect(row.addedOnly).toEqual({ k: 356, n: 654 })
    expect(row.searchOutside.curr).toEqual({ k: 376, n: 625 })
  })

  it('reads a row written before the columns, or with one side missing, as not measured', () => {
    expect(pairRowFromStored({ ...stored, added_only_curr: null, market_videos_curr: null }).addedOnly).toBeNull()
    const { added_only_curr: _a, market_videos_curr: _m, ...before } = stored
    expect(pairRowFromStored(before).addedOnly).toBeNull()
    expect(pairRowFromStored({ ...stored, market_videos_curr: null }).addedOnly).toBeNull()
  })
})
