import { describe, expect, it } from 'vitest'
import { monthAxis, NO_CLIENT, pivot, usageFromRow, type UsageRow } from './usage'

const months = monthAxis('2026-10-09', 6)

const row = (month: string, vendor: UsageRow['vendor'], clientName: string | null, usd: number): UsageRow => ({
  month, vendor, clientId: clientName ? `id-${clientName}` : null, clientName, usd,
})

describe('the six months', () => {
  it('runs from May to October, this month last', () => {
    expect(months).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
    expect(monthAxis('2027-01-31', 3)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
})

describe('the spend tables', () => {
  const rows = [
    row('2026-09-01', 'openai', 'Össur', 30),
    row('2026-09-01', 'apify', 'Össur', 20),
    row('2026-10-01', 'openai', 'Sealand', 60),
    row('2026-10-01', 'transcripts', null, 1),
    row('2026-03-01', 'openai', 'Össur', 999), // outside the axis
  ]

  it('by vendor: all three, in order, a quiet month as zero', () => {
    const p = pivot(rows, months, 'vendor')
    expect(p.rows.map((r) => r.label)).toEqual(['OpenAI', 'Transcripts', 'Apify'])
    expect(p.rows[0].cells).toEqual([0, 0, 0, 0, 30, 60])
    expect(p.totals).toEqual([0, 0, 0, 0, 50, 61])
    expect(p.grand).toBe(111)
  })

  it('by client: biggest first, spend with no client last', () => {
    const p = pivot(rows, months, 'client')
    expect(p.rows.map((r) => r.label)).toEqual(['Sealand', 'Össur', NO_CLIENT])
    expect(p.rows[1].total).toBe(50)
  })

  it('reads a function row and skips a vendor it does not know', () => {
    expect(usageFromRow({ month: '2026-10-01', vendor: 'apify', client_id: 'x', client_name: 'Össur', usd: '7.5000' }))
      .toEqual({ month: '2026-10-01', vendor: 'apify', clientId: 'x', clientName: 'Össur', usd: 7.5 })
    expect(usageFromRow({ month: '2026-10-01', vendor: 'other', usd: 1 })).toBeNull()
  })
})
