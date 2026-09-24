import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { activePreset, archivePresets, collapseMonth, lastDayOf, loadReportsPageContext, presetLine } from './page-context'
import type { UpdateInput } from '../readiness/types'

// The record's eight reads are not this file's subject — `lib/reading/record`
// has its own tier — and a stub deep enough to satisfy them would be a second
// implementation of them. The footnote's own degradation is asserted through
// this door instead: what the page does when the record cannot be read.
vi.mock('../reading/record', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reading/record')>()
  return { ...actual, loadRecordInputs: vi.fn(async () => { throw new Error('record unavailable') }) }
})

const run = (day: string, status = 'completed'): UpdateInput => ({
  id: day,
  status,
  startedAt: `${day}T06:00:00.000Z`,
  completedAt: `${day}T07:00:00.000Z`,
})

describe('lastDayOf', () => {
  it('is the month’s own last day, leap year included', () => {
    expect(lastDayOf('2026-09-01')).toBe('2026-09-30')
    expect(lastDayOf('2026-02-01')).toBe('2026-02-28')
    expect(lastDayOf('2024-02-01')).toBe('2024-02-29')
    expect(lastDayOf('2026-12-01')).toBe('2026-12-31')
  })
})

describe('archivePresets', () => {
  const updates = [
    run('2026-07-05'), run('2026-08-02'), run('2026-08-30'),
    run('2026-09-06'), run('2026-09-13'), run('2026-09-20'), run('2026-09-27'),
  ]

  it('is this month, the two before it, and all-time', () => {
    const p = archivePresets(updates, '2026-09-01')
    expect(p.map((x) => x.label)).toEqual(['September', 'August', 'July', 'Since we started'])
    expect(p.map((x) => x.updates)).toEqual([4, 2, 1, 7])
  })

  it('crosses a year boundary without naming the wrong months', () => {
    const p = archivePresets([], '2026-01-01')
    expect(p.map((x) => x.label)).toEqual(['January', 'December', 'November', 'Since we started'])
    expect(p[1].from).toBe('2025-12-01')
    expect(p[1].to).toBe('2025-12-31')
  })

  // AN UPDATE IS COUNTED WHEN IT SETTLED WELL. A failed run happened, and the
  // delivery record counts it as a failure; this line is about what was
  // DELIVERED in a month, which is what the chip beside it claims.
  it('counts what was delivered, not what was attempted', () => {
    const p = archivePresets([...updates, run('2026-09-28', 'failed')], '2026-09-01')
    expect(p[0].updates).toBe(4)
  })

  // The dated list reads oldest first, the way the artboard draws it.
  it('dates them oldest first', () => {
    const p = archivePresets(updates, '2026-09-01')
    expect(p[0].dates).toEqual(['6 Sep', '13 Sep', '20 Sep', '27 Sep'])
  })

  it('bounds each chip on the DAY, which is what the archive’s filter compares', () => {
    const p = archivePresets([], '2026-09-01')
    expect(p[0].from).toBe('2026-09-01')
    expect(p[0].to).toBe('2026-09-30')
    expect(p[3].from).toBeNull()
    expect(p[3].to).toBeNull()
  })
})

describe('presetLine', () => {
  const p = archivePresets(
    [run('2026-09-06'), run('2026-09-13'), run('2026-09-20'), run('2026-09-27')],
    '2026-09-01',
  )

  it('counts UPDATES and names their days', () => {
    expect(presetLine(p[0])).toBe('4 updates in September · 6, 13, 20, 27 Sep')
  })

  it('says nothing ran rather than printing a zero', () => {
    expect(presetLine(p[1])).toBe('No update in August.')
  })

  it('drops the dates where they are not a line', () => {
    const many = { ...p[0], key: 'all', label: 'Since we started', updates: 23, dates: Array(23).fill('6 Apr') }
    expect(presetLine(many)).toBe('23 updates on record')
  })
})

describe('collapseMonth', () => {
  it('names the month once where they are all in one', () => {
    expect(collapseMonth(['6 Sep', '13 Sep', '20 Sep', '27 Sep'])).toBe('6, 13, 20, 27 Sep')
  })

  // "6, 13, 20, 27 Sep" about two Septembers is two lies in one line.
  it('names every month where they are not', () => {
    expect(collapseMonth(['30 Aug', '6 Sep'])).toBe('30 Aug, 6 Sep')
  })

  it('leaves one date alone', () => {
    expect(collapseMonth(['6 Sep'])).toBe('6 Sep')
  })
})

describe('activePreset', () => {
  const p = archivePresets([], '2026-09-01')

  it('is the all-time chip where the reader has set no filter', () => {
    expect(activePreset(p, { from: null, to: null })).toBe('all')
  })

  it('is the month whose exact bounds the filter carries', () => {
    expect(activePreset(p, { from: '2026-08-01', to: '2026-08-31' })).toBe('2026-08-01')
  })

  // A hand-typed range is nobody's chip, and lighting one would tell a reader
  // the dates in the two inputs beside it are not what is being shown.
  it('is nothing for a range a reader typed', () => {
    expect(activePreset(p, { from: '2026-08-14', to: '2026-09-02' })).toBeNull()
  })
})


// ---- the I/O half -----------------------------------------------------------
//
// EVERY PART DEGRADES ALONE is the claim this loader's header makes, and it is
// the half where a failed read can be printed as a fact. The stub is the
// smallest chainable thing PostgREST's builder looks like: `from` picks a
// table's answer, every filter returns the builder, and awaiting it — or
// `range`, which is what `selectAll` calls — resolves it.

type Answer = { data: unknown; error: unknown }

function stub(tables: Record<string, Answer>): SupabaseClient {
  const answerFor = (table: string): Answer => tables[table] ?? { data: [], error: null }
  const client = {
    from(table: string) {
      const resolve = () => Promise.resolve(answerFor(table))
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => resolve(),
        maybeSingle: () => resolve(),
        single: () => resolve(),
        range: () => resolve(),
        then: (ok: (v: Answer) => unknown, no?: (e: unknown) => unknown) => resolve().then(ok, no),
      }
      return builder
    },
  }
  return client as unknown as SupabaseClient
}

const RUNS = [
  { id: 'r1', status: 'completed', started_at: '2026-09-06T06:00:00.000Z', completed_at: '2026-09-06T07:00:00.000Z', scheduled_for: '2026-09-06T06:00:00.000Z' },
  { id: 'r2', status: 'completed', started_at: '2026-09-13T06:00:00.000Z', completed_at: '2026-09-13T07:00:00.000Z', scheduled_for: null },
]

const NOW = '2026-09-18T09:00:00.000Z'

describe('loadReportsPageContext', () => {
  it('reads the brand, the updates and the month it is in', async () => {
    const ctx = await loadReportsPageContext(
      stub({
        clients: { data: { company_name: 'Sealand' }, error: null },
        pipeline_runs: { data: RUNS, error: null },
      }),
      'c1',
      { now: NOW },
    )
    expect(ctx.brand).toBe('Sealand')
    expect(ctx.month).toBe('2026-09-01')
    expect(ctx.context).toContain('Sealand')
    expect(ctx.delivery?.total).toBe(2)
    expect(ctx.presets.map((p) => p.updates)).toEqual([2, 0, 0, 2])
    expect(ctx.updatesUnread).toBe(false)
  })

  // A FAILED RUN READ IS NOT A WORKSPACE WITH NO UPDATES. `?? []` lit the
  // all-time chip and printed "No update on record." into a tile listing the
  // sends — the rule the page states about itself, broken in the one new
  // loader.
  it('does not turn a failed run read into "No update on record."', async () => {
    const ctx = await loadReportsPageContext(
      stub({
        clients: { data: { company_name: 'Sealand' }, error: null },
        pipeline_runs: { data: null, error: { message: 'connection reset' } },
      }),
      'c1',
      { now: NOW },
    )
    expect(ctx.presets).toEqual([])
    expect(ctx.delivery).toBeNull()
    expect(ctx.updatesUnread).toBe(true)
    // and nothing anywhere in the context asserts an empty record
    expect(JSON.stringify(ctx)).not.toContain('No update on record')
  })

  // `slotsRecorded` was hardcoded false inside a composer whose own header
  // said the flag is "false until 20260915090000 is applied" — which it has
  // been since 2026-09-15. `loadUpdates` probes the column instead.
  it('takes the slots flag from the column, not from a constant', async () => {
    const ctx = await loadReportsPageContext(
      stub({
        clients: { data: { company_name: 'Sealand' }, error: null },
        pipeline_runs: { data: RUNS, error: null },
      }),
      'c1',
      { now: NOW },
    )
    expect(ctx.delivery?.scheduledServed).toEqual({ scheduled: 1, byHand: 1 })
  })

  it('degrades one line at a time — no brand, and no record', async () => {
    const ctx = await loadReportsPageContext(
      stub({
        clients: { data: null, error: { message: 'nope' } },
        pipeline_runs: { data: RUNS, error: null },
      }),
      'c1',
      { now: NOW },
    )
    expect(ctx.brand).toBe('Your workspace')
    // the record's eight reads threw (mocked): the footnote is absent, and the
    // archive below it is untouched
    expect(ctx.method).toBeNull()
    expect(ctx.presets).toHaveLength(4)
  })
})
