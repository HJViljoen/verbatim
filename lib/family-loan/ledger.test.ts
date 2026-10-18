import { describe, expect, it } from 'vitest'
import { chronological, standingOf, summariseLoan } from './ledger'
import { entryFromRow, entryToRow } from './rows'
import type { LoanEntry } from './types'

// Made-up figures only: round hundreds, a fictional year's dates.

let seq = 0
const entry = (over: Partial<LoanEntry>): LoanEntry => {
  seq += 1
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`,
    occurredOn: '2026-01-01',
    kind: 'borrowed',
    amountCents: 100_000,
    note: null,
    sourceRef: null,
    createdAt: `2026-01-01T08:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...over,
  }
}

describe('the summary', () => {
  it('is borrowed less paid back, with the last repayment by date', () => {
    const s = summariseLoan([
      entry({ occurredOn: '2026-01-05', kind: 'borrowed', amountCents: 100_000 }),
      entry({ occurredOn: '2026-03-01', kind: 'repaid', amountCents: 20_000 }),
      entry({ occurredOn: '2026-02-01', kind: 'repaid', amountCents: 10_000 }),
      entry({ occurredOn: '2026-02-10', kind: 'borrowed', amountCents: 50_000 }),
    ])
    expect(s).toMatchObject({
      borrowedCents: 150_000,
      repaidCents: 30_000,
      outstandingCents: 120_000,
      standing: 'owing',
      lastRepayment: { on: '2026-03-01', amountCents: 20_000 },
    })
  })

  it('has no last repayment before the first one', () => {
    const s = summariseLoan([entry({ kind: 'borrowed', amountCents: 40_000 })])
    expect(s.lastRepayment).toBeNull()
    expect(s.outstandingCents).toBe(40_000)
  })

  it('reads every state: nothing, owing, settled, overpaid', () => {
    expect(summariseLoan([]).standing).toBe('empty')
    expect(summariseLoan([]).lines).toEqual([])
    expect(standingOf(1, 1)).toBe('owing')
    const settled = summariseLoan([
      entry({ occurredOn: '2026-01-01', kind: 'borrowed', amountCents: 30_000 }),
      entry({ occurredOn: '2026-01-02', kind: 'repaid', amountCents: 30_000 }),
    ])
    expect(settled).toMatchObject({ outstandingCents: 0, standing: 'settled' })
  })

  it('says overpaid when more was paid back than borrowed, the outstanding below zero', () => {
    const s = summariseLoan([
      entry({ occurredOn: '2026-01-01', kind: 'borrowed', amountCents: 50_000 }),
      entry({ occurredOn: '2026-02-01', kind: 'repaid', amountCents: 30_000 }),
      entry({ occurredOn: '2026-03-01', kind: 'repaid', amountCents: 30_000 }),
    ])
    expect(s).toMatchObject({ outstandingCents: -10_000, standing: 'overpaid' })
    expect(s.lines[0].balanceAfterCents).toBe(-10_000)
  })

  it('sums in whole cents, so cents never drift', () => {
    const tenths = Array.from({ length: 10 }, (_, i) => entry({ occurredOn: `2026-01-${String(i + 1).padStart(2, '0')}`, amountCents: 10 }))
    const s = summariseLoan([...tenths, entry({ occurredOn: '2026-02-01', kind: 'repaid', amountCents: 30 })])
    expect(s.borrowedCents).toBe(100)
    expect(s.outstandingCents).toBe(70)
  })
})

describe('the ledger', () => {
  it('runs the balance oldest first and lists newest first', () => {
    const s = summariseLoan([
      entry({ occurredOn: '2026-03-01', kind: 'repaid', amountCents: 25_000, note: 'third' }),
      entry({ occurredOn: '2026-01-01', kind: 'borrowed', amountCents: 100_000, note: 'first' }),
      entry({ occurredOn: '2026-02-01', kind: 'borrowed', amountCents: 20_000, note: 'second' }),
    ])
    expect(s.lines.map((l) => [l.entry.note, l.balanceAfterCents])).toEqual([
      ['third', 95_000],
      ['second', 120_000],
      ['first', 100_000],
    ])
  })

  it('orders one day\'s entries by when they were written, whatever order they arrive in', () => {
    const lent = entry({ occurredOn: '2026-04-01', kind: 'borrowed', amountCents: 10_000, createdAt: '2026-04-01T09:00:00Z', note: 'lent' })
    const back = entry({ occurredOn: '2026-04-01', kind: 'repaid', amountCents: 10_000, createdAt: '2026-04-01T17:30:00.25Z', note: 'back' })
    for (const order of [[lent, back], [back, lent]]) {
      const s = summariseLoan(order)
      expect(s.lines.map((l) => [l.entry.note, l.balanceAfterCents])).toEqual([['back', 0], ['lent', 10_000]])
      expect(s.lastRepayment).toEqual({ on: '2026-04-01', amountCents: 10_000 })
    }
  })

  it('compares written times as instants, not as text (an import may write another offset)', () => {
    const a = entry({ occurredOn: '2026-05-01', createdAt: '2026-05-01T10:00:00+02:00', note: 'a' }) // 08:00 UTC
    const b = entry({ occurredOn: '2026-05-01', createdAt: '2026-05-01T09:00:00+00:00', note: 'b' }) // 09:00 UTC
    expect(chronological([b, a]).map((e) => e.note)).toEqual(['a', 'b'])
  })

  it('breaks a full tie (same day, same instant) by id, so the order never depends on arrival', () => {
    const one = entry({ id: '00000000-0000-0000-0000-00000000000a', occurredOn: '2026-06-01', createdAt: '2026-06-01T08:00:00Z', note: 'a' })
    const two = entry({ id: '00000000-0000-0000-0000-00000000000b', occurredOn: '2026-06-01', createdAt: '2026-06-01T08:00:00Z', note: 'b' })
    expect(chronological([two, one]).map((e) => e.note)).toEqual(['a', 'b'])
    expect(chronological([one, two]).map((e) => e.note)).toEqual(['a', 'b'])
  })

  it('takes the later-written of two repayments on one day as the last', () => {
    const s = summariseLoan([
      entry({ occurredOn: '2026-07-01', kind: 'borrowed', amountCents: 90_000 }),
      entry({ occurredOn: '2026-07-09', kind: 'repaid', amountCents: 20_000, createdAt: '2026-07-09T12:00:00Z' }),
      entry({ occurredOn: '2026-07-09', kind: 'repaid', amountCents: 30_000, createdAt: '2026-07-09T08:00:00Z' }),
    ])
    expect(s.lastRepayment).toEqual({ on: '2026-07-09', amountCents: 20_000 })
  })
})

describe('the rows', () => {
  it('reads a stored row into whole cents, as PostgREST hands numeric over', () => {
    const row = {
      id: 'e1', occurred_on: '2026-01-05', kind: 'repaid', amount: 1250.1, note: null,
      source_ref: 'REF-TEST-1', created_at: '2026-01-05T08:00:00.123456+00:00',
    }
    expect(entryFromRow(row)).toEqual({
      id: 'e1', occurredOn: '2026-01-05', kind: 'repaid', amountCents: 125_010, note: null,
      sourceRef: 'REF-TEST-1', createdAt: '2026-01-05T08:00:00.123456+00:00',
    })
    expect(entryFromRow({ ...row, amount: '0.29' }).amountCents).toBe(29)
  })

  it('refuses a kind the table cannot hold', () => {
    expect(() => entryFromRow({ id: 'x', occurred_on: '2026-01-01', kind: 'gift', amount: 1 })).toThrow(/unknown kind/)
  })

  it('writes the four columns a form owns, and never the bank reference', () => {
    const row = entryToRow({ kind: 'borrowed', occurredOn: '2026-01-05', amountCents: 125_050, note: 'test' })
    expect(row).toEqual({ kind: 'borrowed', occurred_on: '2026-01-05', amount: 1250.5, note: 'test' })
    expect(JSON.stringify(entryToRow({ kind: 'repaid', occurredOn: '2026-01-05', amountCents: 29, note: null }))).toContain('"amount":0.29')
  })
})
