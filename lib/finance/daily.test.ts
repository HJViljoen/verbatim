import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { holdNotices, noticeEmail, nudgeNotices, planSends, runDay } from './daily'
import { PROFILE, invoice, yearOfInvoices } from './fixtures'
import { applyPayments } from './ledger'
import type { Invoice } from './types'

// The daily job's decisions, pure (inngest/functions/finance-daily.ts runs
// them). Made-up names.

const READY: Invoice = invoice({
  number: '0011', currency: 'ZAR', total: 3690, periodStart: '2027-01-01', periodLabel: 'January 2027', issuedOn: '2026-12-15',
  dueOn: '2026-12-31', status: 'ready', pdfPath: 'c/0011.pdf', profileId: PROFILE.id, sentAt: null,
})

describe('the day a run acts for', () => {
  it('is today in Johannesburg, or an injected day anywhere but production', () => {
    const now = new Date('2026-12-14T22:30:00.000Z') // 00:30 on the 15th in Johannesburg
    expect(runDay(now, undefined, 'production')).toEqual({ today: '2026-12-15', injected: false })
    expect(runDay(now, '2027-03-15', 'production')).toEqual({ today: '2026-12-15', injected: false })
    expect(runDay(now, '2026-12-15', 'preview')).toEqual({ today: '2026-12-15', injected: true })
    expect(runDay(now, '2026-12-15', undefined)).toEqual({ today: '2026-12-15', injected: true })
    expect(runDay(now, '15 Dec', undefined)).toEqual({ today: '2026-12-15', injected: false })
  })
})

describe('who sends what', () => {
  it('holds the next invoice for a tap while hold_next is on (D1), and sends it once it is off', () => {
    expect(planSends([READY], [PROFILE])).toEqual({ send: [], hold: [READY] })
    expect(planSends([READY], [{ ...PROFILE, holdNext: false }])).toEqual({ send: [READY], hold: [] })
  })

  it('never sends for a review profile or a paused one', () => {
    expect(planSends([READY], [{ ...PROFILE, holdNext: false, sendMode: 'review' }])).toEqual({ send: [], hold: [READY] })
    expect(planSends([READY], [{ ...PROFILE, holdNext: false, active: false }])).toEqual({ send: [], hold: [READY] })
  })

  it('leaves alone what it did not issue, has no PDF for, or is already done', () => {
    const p = { ...PROFILE, holdNext: false }
    expect(planSends([{ ...READY, profileId: null }], [p]).send).toEqual([])
    expect(planSends([{ ...READY, pdfPath: null }], [p]).send).toEqual([])
    expect(planSends([{ ...READY, status: 'sent' }, { ...READY, status: 'draft' }], [p]).send).toEqual([])
    // a send that crashed mid-way is offered again (the claim decides)
    expect(planSends([{ ...READY, status: 'sending' }], [p]).send).toHaveLength(1)
  })
})

describe('what the operator is told', () => {
  it('says a held invoice once, by the day it was issued, with a link to Ops → Costs', () => {
    const n = holdNotices([READY])
    expect(n).toEqual([{ invoiceId: READY.id, number: '0011', kind: 'ready', onDay: '2026-12-15', line: '0011 (Acme SA, January 2027): R3,690.00, due 31 December 2026' }])
    const mail = noticeEmail('hold', n, 'https://app.example.test/dashboard/ops/costs')
    expect(mail.subject).toBe('Invoice 0011 is ready and waiting for you')
    expect(mail.text).toContain('Nothing goes to the client until you press Send on Ops → Costs.')
    expect(mail.text).toContain('• 0011 (Acme SA, January 2027): R3,690.00, due 31 December 2026')
    expect(mail.text).toContain('Open it: https://app.example.test/dashboard/ops/costs')
  })

  it('nudges each unpaid invoice once past its due date, and once on its promised day', () => {
    const { invoices, payments } = yearOfInvoices()
    const withPromise = invoices.map((i) => (i.number === '0010' ? { ...i, expectedOn: '2026-11-28' } : i))
    const on17 = nudgeNotices(withPromise, applyPayments(withPromise, payments, '2026-11-17'), '2026-11-17')
    expect(on17).toEqual([]) // due on receipt on the 17th: not late on the 17th
    const on28 = nudgeNotices(withPromise, applyPayments(withPromise, payments, '2026-11-28'), '2026-11-28')
    expect(on28.map((n) => [n.number, n.kind, n.onDay])).toEqual([
      ['0006', 'overdue', '2026-11-17'], ['0007', 'overdue', '2026-11-17'], ['0008', 'overdue', '2026-11-17'],
      ['0009', 'overdue', '2026-11-17'], ['0010', 'expected', '2026-11-28'],
    ])
    const mail = noticeEmail('nudge', on28, 'https://app.example.test/dashboard/ops/costs')
    expect(mail.subject).toBe('Money owed: 5 invoices unpaid')
    expect(mail.text).toContain('• 0007 (Acme SA, Past costs (prior to August 2026)): R14,760.00, due on receipt (issued 17 November 2026)')
    expect(mail.text).toContain('promised for 28 November 2026')
    expect(mail.text).toContain('never to the client')
  })

  it('says nothing about what is paid, credited or not yet sent', () => {
    const { invoices, payments } = yearOfInvoices()
    const all = [...payments, { id: 'p', clientId: invoices[0].clientId, receivedOn: '2026-11-20', amount: 29520, currency: 'ZAR' as const, reference: null, note: null }]
    expect(nudgeNotices(invoices, applyPayments(invoices, all, '2026-12-05'), '2026-12-05')).toEqual([])
    expect(nudgeNotices([READY], applyPayments([READY], [], '2027-02-01'), '2027-02-01')).toEqual([])
  })
})

describe('the job', () => {
  const src = readFileSync(new URL('../../inngest/functions/finance-daily.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../../app/api/inngest/route.ts', import.meta.url), 'utf8')

  it('runs at 07:00 Johannesburg, one at a time, and is registered', () => {
    expect(src).toContain("triggers: [{ cron: 'TZ=Africa/Johannesburg 0 7 * * *' }, { event: 'finance/daily.run' }]")
    expect(src).toContain('concurrency: { limit: 1 }')
    expect(route).toMatch(/functions: \[[^\]]*\bfinanceDaily\b[^\]]*\]/)
  })

  it('keeps its step ids in order, and never prints or emails a client inside a step', () => {
    const ids = [...src.matchAll(/step\.run\(\s*[`'"]([^`'":$]+)/g)].map((m) => m[1])
    expect(ids).toEqual(['day', 'issue', 'plan-print', 'print', 'plan-send', 'send', 'tell-held', 'nudge', 'alert'])
    expect(src).not.toMatch(/withBrowser|printInvoicePdf|sendInvoiceEmail|sendInvoice\(/)
    expect(src).toContain('/api/admin/finance/invoices/${d.id}/render')
    expect(src).toContain('/api/admin/finance/invoices/${s.id}/send')
  })
})
