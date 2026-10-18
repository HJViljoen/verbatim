import { describe, expect, it, vi } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import type { LoanEntry } from '@/lib/family-loan/types'
import { LoanBody } from './sections'

// What the loan page PRINTS (operator only), in each state. Made-up figures.
// The actions module is the server's; its references are all a render needs.

vi.mock('@/app/dashboard/ops/loan/actions', () => ({
  saveEntry: async () => ({ ok: true, message: '' }),
  deleteEntry: async () => ({ ok: true, message: '' }),
}))

const TODAY = '2026-10-18'
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

const OWING = [
  entry({ occurredOn: '2026-01-05', kind: 'borrowed', amountCents: 500_000, note: 'Test loan' }),
  entry({ occurredOn: '2026-02-01', kind: 'repaid', amountCents: 100_000 }),
  entry({ occurredOn: '2026-03-01', kind: 'repaid', amountCents: 50_000, note: 'Test repayment' }),
]

describe('the loan page', () => {
  it('leads with what is owed, then borrowed, paid back and the last repayment', () => {
    const text = renderText(<LoanBody entries={OWING} today={TODAY} />)
    expect(text).toContain('Owed to Dad now R3,500')
    expect(text).toContain('Borrowed R5,000')
    expect(text).toContain('Paid back R1,500')
    expect(text).toContain('Last repayment R500 1 Mar 2026')
  })

  it('lists the ledger newest first, with the balance after each entry', () => {
    const html = render(<LoanBody entries={OWING} today={TODAY} />)
    const text = renderText(<LoanBody entries={OWING} today={TODAY} />)
    expect(text).toContain('3 entries · newest first')
    const ledger = text.slice(text.indexOf('newest first'))
    const at = (s: string) => ledger.indexOf(s)
    expect(at('1 Mar 2026')).toBeGreaterThan(-1)
    expect(at('1 Mar 2026')).toBeLessThan(at('1 Feb 2026'))
    expect(at('1 Feb 2026')).toBeLessThan(at('5 Jan 2026'))
    expect(ledger).toContain('1 Mar 2026 Test repayment – Paid back R500 Balance after R3,500')
    expect(ledger).toContain('1 Feb 2026 – Paid back R1,000 Balance after R4,000')
    expect(ledger).toContain('5 Jan 2026 Test loan Borrowed R5,000 – Balance after R5,000')
    expect(html).toContain('role="table"')
    expect(html.match(/role="columnheader"/g)).toHaveLength(6)
  })

  it('offers Edit and a delete that asks in the page, never a browser dialog', () => {
    const html = render(<LoanBody entries={OWING} today={TODAY} />)
    expect(html.match(/>Edit</g)).toHaveLength(3)
    expect(html.match(/>Delete…</g)).toHaveLength(3)
    expect(html).not.toContain('confirm(')
  })

  it('says overpaid in words and never prints a negative debt', () => {
    const over = [
      entry({ occurredOn: '2026-01-01', kind: 'borrowed', amountCents: 100_000 }),
      entry({ occurredOn: '2026-02-01', kind: 'repaid', amountCents: 125_000 }),
    ]
    const text = renderText(<LoanBody entries={over} today={TODAY} />)
    expect(text).toContain('Overpaid R250')
    expect(text).toContain('You have paid Dad back R250 more than you borrowed.')
    expect(text).toContain('Balance after R250 overpaid')
    expect(text).not.toContain('Owed to Dad now')
    expect(text).not.toMatch(/[−-]R\d/)
  })

  it('says all paid back at zero', () => {
    const settled = [
      entry({ occurredOn: '2026-01-01', kind: 'borrowed', amountCents: 100_000 }),
      entry({ occurredOn: '2026-02-01', kind: 'repaid', amountCents: 100_000 }),
    ]
    expect(renderText(<LoanBody entries={settled} today={TODAY} />)).toContain('Owed to Dad now R0 All paid back.')
  })

  it('prints cents on every figure once one amount has them', () => {
    const cents = [...OWING, entry({ occurredOn: '2026-04-01', kind: 'repaid', amountCents: 12_345 })]
    const text = renderText(<LoanBody entries={cents} today={TODAY} />)
    expect(text).toContain('Owed to Dad now R3,376.55')
    expect(text).toContain('Borrowed R5,000.00')
  })

  it('has an empty state with no entries, and still the add form', () => {
    const html = render(<LoanBody entries={[]} today={TODAY} />)
    const text = renderText(<LoanBody entries={[]} today={TODAY} />)
    expect(text).toContain('Nothing recorded yet.')
    expect(text).toContain('No entries yet.')
    expect(html).not.toContain('role="table"')
    expect(text).toContain('Add an entry')
    expect(html).toContain(`value="${TODAY}"`)
    expect(html).toContain(`max="${TODAY}"`)
  })

  it('draws the add form: Borrowed or Paid back, the date, the amount and a note', () => {
    const html = render(<LoanBody entries={[]} today={TODAY} />)
    const radios = html.match(/<input type="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(2)
    expect(radios.every((r) => r.includes('name="kind"'))).toBe(true)
    expect(radios.find((r) => r.includes('value="borrowed"'))).toContain('checked=""')
    expect(radios.find((r) => r.includes('value="repaid"'))).not.toContain('checked')
    expect(html).toContain('name="occurredOn"')
    expect(html).toContain('name="amount"')
    expect(html).toContain('inputMode="decimal"')
    expect(html).toContain('name="note"')
    expect(html).not.toContain('name="id"')
  })
})
