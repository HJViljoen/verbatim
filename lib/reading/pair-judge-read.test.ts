import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pairSentence } from '../calibration'
import { pairOnVerdict } from './comparability'
import { loadPairOn, readingHandle } from './read'

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
