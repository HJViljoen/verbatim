import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { saveWeekRead, standsAsMonthRead, withKeptSubjectReads, type WeekReadRow } from './store'

// The run that closes a month writes its long-run read unless one stands
// already (`longRunWritten`). A read the backfill wrote before the month
// closed (`partialThrough`, scripts/backfill-platform.ts) does not stand: the
// closing run still writes the full one, which then takes its place.

describe('standsAsMonthRead', () => {
  it('a ready or thin read stands; a failed one does not', () => {
    expect(standsAsMonthRead({ status: 'ready' })).toBe(true)
    expect(standsAsMonthRead({ status: 'thin', partial_through: null })).toBe(true)
    expect(standsAsMonthRead({ status: 'failed' })).toBe(false)
  })
  it('a read written before its month closed does not stand, ready or not', () => {
    expect(standsAsMonthRead({ status: 'ready', partial_through: '2026-09-27' })).toBe(false)
    expect(standsAsMonthRead({ status: 'thin', partial_through: '2026-09-27' })).toBe(false)
  })
})

// A fallback that writes a run's week read again (scripts/week-read.ts
// --write, backfill-platform --write) keeps the subjects' reads the run's row
// held (14 Oct, the lead's ruling): they live on that row, and nothing else
// would write them back.
describe('saveWeekRead keeps the subjects\' reads of the row it replaces', () => {
  const READS = { version: 1, promptVersion: 'subject_read_v1', month: '2026-10-01', read: { from: '2026-10-01', to: '2026-10-11' }, status: 'ready', model: 'gpt-5.4', costUsd: 0.06, subjects: [{ subjectId: 's', name: 'S', status: 'ready', saying: ['P.'], means: '', basedOn: [] }] } as const
  const row = (data: Record<string, unknown> | null, over: Partial<WeekReadRow> = {}): WeekReadRow => ({
    client_id: 'c', run_id: 'r', kind: 'week', month: '2026-10-01', window_start: 'a', window_end: 'b', status: 'ready', cost_usd: 0.4,
    data: data as unknown as WeekReadRow['data'], ...over,
  })
  /** A client holding one stored row, recording the upsert. */
  function stub(stored: Record<string, unknown> | null) {
    const writes: WeekReadRow[] = []
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: stored ? { data: stored } : null, error: null }), upsert: async (r: WeekReadRow) => { writes.push(r); return { error: null } } }
    return { client: { from: () => q } as unknown as SupabaseClient, writes }
  }

  it('the rewritten week read carries the old row\'s reads over', async () => {
    const db = stub({ version: 2, headline: 'Old', subjectReads: READS })
    await saveWeekRead(db.client, row({ version: 2, headline: 'New' }))
    expect(db.writes).toHaveLength(1)
    expect(db.writes[0].data).toEqual({ version: 2, headline: 'New', subjectReads: READS })
  })

  it('never across months, never over reads of its own, never onto a failed row or a month row', async () => {
    const other = withKeptSubjectReads(row({ version: 2 }, { month: '2026-11-01' }), { version: 2, subjectReads: READS } as never)
    expect((other.data as { subjectReads?: unknown }).subjectReads).toBeUndefined()
    const own = { ...READS, costUsd: 0.01 }
    expect((withKeptSubjectReads(row({ version: 2, subjectReads: own }), { version: 2, subjectReads: READS } as never).data as { subjectReads?: unknown }).subjectReads).toBe(own)
    expect(withKeptSubjectReads(row(null, { status: 'failed', month: null }), { version: 2, subjectReads: READS } as never).data).toBeNull()
    const month = row({ kind: 'longrun' }, { kind: 'month' })
    expect(withKeptSubjectReads(month, { version: 2, subjectReads: READS } as never)).toBe(month)
    // A failed row is written as it is, with no read first.
    const db = stub({ version: 2, subjectReads: READS })
    await saveWeekRead(db.client, row(null, { status: 'failed', month: null }))
    expect(db.writes[0].data).toBeNull()
  })
})
