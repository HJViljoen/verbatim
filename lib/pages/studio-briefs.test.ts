import { describe, expect, it } from 'vitest'

import { studioBriefs, type MonthlyBriefRowRead } from './studio-briefs'

// The Studio's Monthly briefs (T8 wired): which ledger rows a client reads,
// in what order, named how. Pure; the read is one select.

const row = (role: string, month: string, o: Partial<MonthlyBriefRowRead> = {}): MonthlyBriefRowRead => ({
  role, month, status: 'ready', snapshot_id: `snap-${role}-${month}`, report_snapshots: { created_at: '2026-10-04T05:30:00.000Z' }, ...o,
})

describe('studioBriefs', () => {
  it('lists the ready briefs, newest month first and the four in the Studio\'s order, each named and dated', () => {
    const out = studioBriefs([row('leadership', '2026-09-01'), row('sales', '2026-09-01'), row('content', '2026-10-01'), row('marketing', '2026-09-01')])
    expect(out.map((b) => `${b.month} ${b.role}`)).toEqual(['2026-10-01 content', '2026-09-01 sales', '2026-09-01 marketing', '2026-09-01 leadership'])
    expect(out[1]).toEqual({
      snapshotId: 'snap-sales-2026-09-01', role: 'sales', name: 'Sales brief', what: 'Who is buying, what holds them back, and the words to use.',
      forWho: 'Sales', month: '2026-09-01', monthLabel: 'September 2026', writtenOn: 'Sun 4 Oct',
    })
  })

  it('never lists a thin or failed brief, one with no snapshot, or a row that is not a brief', () => {
    expect(studioBriefs([
      row('sales', '2026-09-01', { status: 'failed', snapshot_id: null }),
      row('content', '2026-09-01', { status: 'thin', snapshot_id: null }),
      row('marketing', '2026-09-01', { snapshot_id: null }),
      row('finance', '2026-09-01'),
    ])).toEqual([])
  })
})
