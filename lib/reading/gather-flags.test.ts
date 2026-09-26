import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { pairSentence } from '../calibration'
import { CHANGES, SEALAND_LOG, SEALAND_SCHEDULE, SEALAND_UPDATES, row, sealandJudge } from '../test/sealand-pairs'
import { changesFromLog, nextComparablePair, pairOnVerdict, type PairRow } from './comparability'
import {
  GATHER_FLAG_FIELDS,
  gatherFlagsFromLog,
  isGatherFlagChange,
  isGatherFlagRow,
  loadAppPairOn,
  ourChangesWithoutGatherFlags,
  withGatherFlags,
} from './gather-flags'
import { readingHandle } from './read'

// A spending-capped update is a gather flag, per decision D, not a change of
// ours (Heinrich's default of 26 Sep, R-c). The capped row is WP1.4's
// `log-tracking-eras --capped-run` row: `other` / `gather_capped`, dated at the
// update, with its run id. Staging's stand-in is the 20 Sep partial run
// (b67b56de, logged at 20 Sep 04:18:34Z, exec/logs/staging-mf1-rehearsal).

const CAPPED_0920 = row({
  id: 'capped-0920', changed_at: '2026-09-20T04:18:34.000Z', surface: 'other', field: 'gather_capped',
  run_id: 'run-2026-09-20', note: 'An update gathered less than usual because a spending cap was reached.',
})
const LOG = [...SEALAND_LOG, CAPPED_0920]

/** A fresh, clean (Aug, Sep) row read through the 4 Oct update: no search
 *  outside the unchanged set, no change measured, depth held, gathers healthy.
 *  A stand-in shape, so that only the capped update is left to judge. */
const CLEAN: PairRow = {
  prevMonth: '2026-08-01', month: '2026-09-01',
  searchOutside: { prev: { k: 0, n: 351 }, curr: { k: 0, n: 625 } },
  codeChanges: [],
  depth: { prevMedian: 21, currMedian: 21 },
  gather: [{ month: '2026-08-01', runs: 2, partial: 0, searchesShort: 0 }, { month: '2026-09-01', runs: 4, partial: 0, searchesShort: 0 }],
  lateCapture: null,
  readThroughRun: 'run-2026-10-04',
  methodVersion: 'mf1_v1',
  computedAt: '2026-10-05T08:00:00.000Z',
}

describe('the gather flags in the change log', () => {
  it('is the capped update and nothing else', () => {
    expect(GATHER_FLAG_FIELDS).toEqual(['gather_capped'])
    expect(isGatherFlagRow(CAPPED_0920)).toBe(true)
    expect(isGatherFlagRow(row({ changed_at: '2026-09-24T12:16:00.000Z', surface: 'other', field: 'attention_panel' }))).toBe(false)
    expect(isGatherFlagRow(row({ changed_at: '2026-09-24T12:16:00.000Z', surface: 'other' }))).toBe(false)
    expect(gatherFlagsFromLog(LOG)).toEqual([{ id: 'capped-0920', at: '2026-09-20T04:18:34.000Z', month: '2026-09-01', runId: 'run-2026-09-20' }])
  })

  it('leaves the capped update out of the changes of ours, and keeps every other change', () => {
    expect(changesFromLog(LOG).map((c) => c.id)).toContain('capped-0920')
    const ours = ourChangesWithoutGatherFlags(LOG)
    expect(ours.map((c) => c.id)).not.toContain('capped-0920')
    expect(ours.map((c) => c.id)).toEqual(CHANGES.map((c) => c.id))
  })

  it('knows a grouped change that is only a gather flag', () => {
    const capped = changesFromLog(LOG).find((c) => c.id === 'capped-0920')!
    expect(isGatherFlagChange(capped, LOG)).toBe(true)
    const other = changesFromLog([row({ id: 'o', changed_at: '2026-09-21T00:00:00.000Z', surface: 'other', field: 'max_videos' })])[0]
    expect(isGatherFlagChange(other, LOG)).toBe(false)
    expect(isGatherFlagChange(CHANGES[0], LOG)).toBe(false)
  })
})

describe('a capped update on the judge', () => {
  const now = '2026-10-05T08:00:00.000Z'

  it('refused the pair as an unmeasured change of ours before (the pipeline rule, unchanged)', () => {
    const old = sealandJudge(now, [CLEAN], changesFromLog([CAPPED_0920]))('2026-08-01', '2026-09-01', 'market')
    expect(old.mode).toBe('refuse')
    expect(old.reasons).toEqual([expect.objectContaining({ kind: 'code_change', changeId: 'capped-0920', share: null })])
  })

  it('now flags it for run health, and refuses nothing by itself', () => {
    const judge = withGatherFlags(sealandJudge(now, [CLEAN], ourChangesWithoutGatherFlags([CAPPED_0920])), gatherFlagsFromLog([CAPPED_0920]))
    for (const view of ['market', 'themes', 'brands'] as const) {
      const pair = judge('2026-08-01', '2026-09-01', view)
      expect(pair.mode).toBe('flag')
      expect(pair.reasons.map((r) => r.kind)).toEqual(['gather'])
      // No verdict flag and no words: a pair flagged only for run health prints
      // as a pair read the same way (pairOnVerdict).
      expect(pairOnVerdict(pair)).toEqual({ refused: null, flag: false, note: null })
    }
  })

  it('flags only the pairs whose months hold the capped update', () => {
    const judge = withGatherFlags(sealandJudge(now, [], []), gatherFlagsFromLog([CAPPED_0920]))
    expect(judge('2026-08-01', '2026-09-01', 'market').reasons.map((r) => r.kind)).toContain('gather')
    expect(judge('2026-09-01', '2026-10-01', 'market').reasons.map((r) => r.kind)).toContain('gather')
    expect(judge('2026-07-01', '2026-08-01', 'market').reasons.map((r) => r.kind)).not.toContain('gather')
  })

  it('adds no second gather reason where the measured row already flags run health', () => {
    const sick: PairRow = { ...CLEAN, gather: [{ month: '2026-09-01', runs: 4, partial: 1, searchesShort: 0 }] }
    const judge = withGatherFlags(sealandJudge(now, [sick], []), gatherFlagsFromLog([CAPPED_0920]))
    expect(judge('2026-08-01', '2026-09-01', 'market').reasons.filter((r) => r.kind === 'gather')).toHaveLength(1)
  })

  it('never names the capped update as the change a refusal is for (Sealand, 2 Oct, no rows)', () => {
    const at = '2026-10-02T06:00:00.000Z'
    const before = sealandJudge(at, [], changesFromLog(LOG))('2026-08-01', '2026-09-01', 'market')
    expect(before.reasons.some((r) => r.changeId === 'capped-0920')).toBe(true)
    const judge = withGatherFlags(sealandJudge(at, [], ourChangesWithoutGatherFlags(LOG)), gatherFlagsFromLog(LOG))
    const pair = judge('2026-08-01', '2026-09-01', 'market')
    expect(pair.mode).toBe('refuse')
    expect(pair.reasons.filter((r) => r.kind === 'searches' || r.kind === 'code_change').map((r) => r.changeId)).not.toContain('capped-0920')
    // The words are the search change's, as they were without the flag.
    expect(pairSentence(pairOnVerdict(pair).note!)).toBe(pairSentence(pairOnVerdict(sealandJudge(at, [], CHANGES)('2026-08-01', '2026-09-01', 'market')).note!))
  })

  it('does not move the first pair read the same way', () => {
    const cappedOct = row({ id: 'capped-1011', changed_at: '2026-10-11T04:00:00.000Z', surface: 'other', field: 'gather_capped' })
    const log = [...SEALAND_LOG, cappedOct]
    const opts = { nextUpdateAfter: SEALAND_SCHEDULE, readingMonth: '2026-09-01' }
    // As a change of ours, one capped Sunday in October pushed the first
    // comparison a month back.
    expect(nextComparablePair('2026-10-12T00:00:00.000Z', changesFromLog(log), [], opts)).toMatchObject({ prevMonth: '2026-11-01', month: '2026-12-01' })
    expect(nextComparablePair('2026-10-12T00:00:00.000Z', ourChangesWithoutGatherFlags(log), [], opts)).toMatchObject({ prevMonth: '2026-10-01', month: '2026-11-01' })
  })
})

describe('loadAppPairOn', () => {
  it('refuses every pair, and never rejects, when its reads fail', async () => {
    const failing = { from: () => { throw new Error('connection reset') } } as unknown as SupabaseClient
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const pair = await loadAppPairOn(readingHandle('gather-flags-test', failing), '2026-10-02T06:00:00.000Z')
      const p = pair('2026-08-01', '2026-09-01', 'market')
      expect(p.mode).toBe('refuse')
      expect(p.reasons.map((r) => r.kind)).toEqual(['unmeasured'])
      expect(logged).toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })

  it('reads the log, the rows, the updates and the schedule, and judges the capped update as a gather flag', async () => {
    const tables: Record<string, unknown[]> = {
      config_changes: [CAPPED_0920],
      month_pair_comparability: [],
      pipeline_runs: SEALAND_UPDATES.map((u) => ({ id: u.id, completed_at: u.finishedAt })),
    }
    const query = (name: string) => {
      const rows = tables[name] ?? []
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'range']) q[m] = () => q
      q.maybeSingle = async () => ({ data: name === 'tracking_configs' ? { report_period: 'weekly', report_day: 'sunday' } : null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
      return q
    }
    const client = { from: query } as unknown as SupabaseClient
    const pair = await loadAppPairOn(readingHandle('gather-flags-load', client), '2026-10-05T08:00:00.000Z')
    const p = pair('2026-08-01', '2026-09-01', 'market')
    // No row yet: unmeasured, as before, but the capped update is no longer
    // listed as a change of ours; it is the pair's run-health flag.
    expect(p.mode).toBe('refuse')
    expect(p.reasons.map((r) => r.kind)).toEqual(['unmeasured', 'gather'])
  })
})
