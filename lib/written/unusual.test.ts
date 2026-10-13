import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { weekFlagRows, type CheckRow, type FlagRow } from '../pages/week'
import { fakeDb } from '../test/fake-db'
import { frozenFlag, loadWeekUnusual, unusualOf } from './unusual'

// The update's anomaly check, frozen into the week's read by `write-week-read`
// (depth v2, T11b): the same flags This week prints, by the same rule
// (`weekFlagRows`), each with its verdict, no quote.

const WINDOW = { from: '2026-10-04T04:00:00.000Z', to: '2026-10-11T04:00:00.000Z' }

function check(over: Partial<CheckRow> = {}): CheckRow {
  return {
    run_id: 'run-1', week_start: WINDOW.from, week_end: WINDOW.to, outcome: 'flagged', reason: null, note: 'Two flags.',
    set_size: 31, tested: 11, flagged_count: 2, update_videos: 241, median_videos: 220, ...over,
  }
}

function flag(over: Partial<FlagRow> = {}): FlagRow {
  return {
    run_id: 'run-1', object_kind: 'theme', object_id: 'reg-1', label: 'Insurance refusals for powered knees', denominator: 'every audience together',
    week_k: 19, week_n: 241, baseline_k: 38, baseline_n: 1089,
    baseline_months: ['2026-07-01', '2026-08-01', '2026-09-01'], baseline_filling_months: ['2026-09-01'], baseline_regime: 'one',
    change_pts: 4.4, band_pts: 2.1, rank: 1, flagged_count: 2,
    explanation: { sentences: ['A sentence.'] }, explanation_model: 'gpt-4.1-mini', quote_refs: [{ ref: 'c:abc', context: 'tiktok' }],
    ...over,
  }
}

describe('which flags are the week\'s: one rule for This week and the email', () => {
  it('none without a row, or where the check raised nothing; rank order where it flagged; null where the flags cannot be read', () => {
    expect(weekFlagRows(undefined, [flag()])).toEqual([])
    expect(weekFlagRows(null, [flag()])).toEqual([])
    for (const outcome of ['nothing_unusual', 'suppressed', 'no_window', 'missing_migration']) expect(weekFlagRows(check({ outcome }), [flag()])).toEqual([])
    const two = weekFlagRows(check(), [flag({ rank: 2, object_id: 'b' }), flag({ rank: 1, object_id: 'a' })])
    expect(two?.map((f) => f.object_id)).toEqual(['a', 'b'])
    expect(weekFlagRows(check(), null)).toBeNull()
    expect(weekFlagRows(check(), [])).toBeNull()
  })
})

describe('a stored flag, frozen with its verdict', () => {
  it('keeps the counts, the months and the band, and earns the week verdict the chip reads', () => {
    const f = frozenFlag(flag(), WINDOW)!
    expect(f).toMatchObject({
      objectKind: 'theme', objectId: 'reg-1', label: 'Insurance refusals for powered knees',
      week: { k: 19, n: 241 }, baseline: { k: 38, n: 1089 }, baselineMonths: ['2026-07-01', '2026-08-01', '2026-09-01'],
      changePts: 4.4, bandPts: 2.1, rank: 1,
    })
    expect(f.verdict).toMatchObject({
      objectKind: 'theme', objectId: 'reg-1', state: 'moved',
      window: { kind: 'week', from: WINDOW.from, to: WINDOW.to },
      basis: { from: '2026-07-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
      value: { k: 19, n: 241 }, baseline: { k: 38, n: 1089 }, changePts: 4.4, bandPts: 2.1,
    })
    // A baseline still filling is the verdict's caveat; never a direction.
    expect(f.verdict.flags).toEqual(['thin'])
    expect(f.verdict.direction).toBeUndefined()
    // No quote travels with it.
    expect(JSON.stringify(f)).not.toContain('c:abc')
    expect(JSON.stringify(f)).not.toContain('A sentence.')
  })
  it('reads numeric columns PostgREST hands back as strings, and refuses a kind it does not know', () => {
    const f = frozenFlag(flag({ change_pts: '4.40' as unknown as number, band_pts: '2.10' as unknown as number }), WINDOW)!
    expect([f.changePts, f.bandPts]).toEqual([4.4, 2.1])
    expect(frozenFlag(flag({ object_kind: 'platform' }), WINDOW)).toBeNull()
    expect(frozenFlag(flag({ baseline_regime: 'mixed' }), WINDOW)!.verdict.flags).toEqual(['clustering_changed', 'thin'])
  })
})

describe('the check, as the read keeps it', () => {
  it('flagged: the flags in rank order and how many cleared', () => {
    const u = unusualOf(check(), [flag({ rank: 2, object_id: 'b', object_kind: 'kind', label: 'Questions' }), flag()], WINDOW)
    expect(u.outcome).toBe('flagged')
    expect(u.flags.map((f) => f.objectId)).toEqual(['reg-1', 'b'])
    expect(u.flaggedCount).toBe(2)
    expect(u.unread).toBeUndefined()
  })
  it('nothing raised, or no row at all: no flags, and the outcome says which', () => {
    expect(unusualOf(check({ outcome: 'nothing_unusual', flagged_count: 0 }), [], WINDOW)).toEqual({ outcome: 'nothing_unusual', flags: [], flaggedCount: 0 })
    expect(unusualOf(undefined, null, WINDOW)).toEqual({ outcome: null, flags: [], flaggedCount: 0 })
  })
  it('a row that flagged with flags that could not be read is unread, never quiet', () => {
    expect(unusualOf(check(), null, WINDOW)).toEqual({ outcome: 'flagged', flags: [], flaggedCount: 2, unread: true })
  })
})

describe('loadWeekUnusual', () => {
  it('reads the run\'s own check and flags and freezes them', async () => {
    const db = fakeDb({
      anomaly_checks: [{ ...check(), client_id: 'c1' }, { ...check(), run_id: 'run-0', client_id: 'c1' }],
      anomaly_flags: [{ ...flag(), client_id: 'c1' }, { ...flag({ run_id: 'run-0', object_id: 'old' }), client_id: 'c1' }],
    })
    const u = await loadWeekUnusual(db.client as SupabaseClient, { clientId: 'c1', runId: 'run-1', window: WINDOW })
    expect(u?.flags.map((f) => f.objectId)).toEqual(['reg-1'])
  })
  it('survives a database without the anomaly tables: no row, no flags, no throw', async () => {
    const db = fakeDb({})
    expect(await loadWeekUnusual(db.client as SupabaseClient, { clientId: 'c1', runId: 'run-1', window: WINDOW })).toEqual({ outcome: null, flags: [], flaggedCount: 0 })
  })
})
