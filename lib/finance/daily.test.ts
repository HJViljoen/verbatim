import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { attentionLines, holdNotices, missedMonthLines, noticeEmail, nudgeNotices, planSends, runDay } from './daily'
import { PROFILE, invoice, yearOfInvoices } from './fixtures'
import { PROD_REF } from './prod'
import { nextBillablePeriod } from './periods'
import { applyPayments } from './ledger'
import type { Invoice } from './types'

// The daily job's decisions, pure (inngest/functions/finance-daily.ts runs
// them). Made-up names.

const READY: Invoice = invoice({
  number: '0111', currency: 'ZAR', total: 2625, periodStart: '2027-01-01', periodLabel: 'January 2027', issuedOn: '2026-12-15',
  dueOn: '2026-12-31', status: 'ready', pdfPath: 'c/0111.pdf', profileId: PROFILE.id, sentAt: null,
})

describe('the day a run acts for', () => {
  it('is today in Johannesburg, or an injected day only away from the real books', () => {
    const now = new Date('2026-12-14T22:30:00.000Z') // 00:30 on the 15th in Johannesburg
    const staging = 'https://stagingref.supabase.co'
    const prodDb = `https://${PROD_REF}.supabase.co`
    expect(runDay(now, undefined, { vercelEnv: 'production', supabaseUrl: prodDb })).toEqual({ today: '2026-12-15', injected: false })
    expect(runDay(now, '2027-03-15', { vercelEnv: 'production', supabaseUrl: prodDb })).toEqual({ today: '2026-12-15', injected: false })
    // a dev server or a preview on production's database (.env.local): refused too
    expect(runDay(now, '2027-03-15', { vercelEnv: undefined, supabaseUrl: prodDb })).toEqual({ today: '2026-12-15', injected: false })
    expect(runDay(now, '2027-03-15', { vercelEnv: 'preview', supabaseUrl: prodDb })).toEqual({ today: '2026-12-15', injected: false })
    expect(runDay(now, '2027-03-15', { vercelEnv: 'production', supabaseUrl: staging })).toEqual({ today: '2026-12-15', injected: false })
    // a rehearsal on another database
    expect(runDay(now, '2027-03-15', { vercelEnv: 'preview', supabaseUrl: staging })).toEqual({ today: '2027-03-15', injected: true })
    expect(runDay(now, '15 Dec', { vercelEnv: undefined, supabaseUrl: staging })).toEqual({ today: '2026-12-15', injected: false })
  })
})

describe('who sends what', () => {
  it('holds the next invoice for a tap while hold_next is on (D1), and sends it once it is off', () => {
    expect(planSends([READY], [PROFILE], '2026-12-15')).toEqual({ send: [], hold: [READY], attention: [] })
    expect(planSends([READY], [{ ...PROFILE, holdNext: false }], '2026-12-15')).toEqual({ send: [READY], hold: [], attention: [] })
  })

  it('never sends for a review profile or a paused one', () => {
    expect(planSends([READY], [{ ...PROFILE, holdNext: false, sendMode: 'review' }], '2026-12-15')).toEqual({ send: [], hold: [READY], attention: [] })
    expect(planSends([READY], [{ ...PROFILE, holdNext: false, active: false }], '2026-12-15')).toEqual({ send: [], hold: [READY], attention: [] })
  })

  it('leaves alone what it did not issue, has no PDF for, or is already done', () => {
    const p = { ...PROFILE, holdNext: false }
    expect(planSends([{ ...READY, profileId: null }], [p], '2026-12-15').send).toEqual([])
    expect(planSends([{ ...READY, pdfPath: null }], [p], '2026-12-15').send).toEqual([])
    expect(planSends([{ ...READY, status: 'sent' }, { ...READY, status: 'draft' }], [p], '2026-12-15').send).toEqual([])
  })

  it('sends only the upcoming month\'s invoice by itself; an older ready one waits for a tap whatever the profile says', () => {
    const p = { ...PROFILE, holdNext: false }
    // 15 Dec: January is the upcoming month
    expect(planSends([READY], [p], '2026-12-15').send).toEqual([READY])
    // January held and never sent; on 15 Jan the hold is lifted and February
    // is issued: February sends itself, January does not
    const feb = { ...READY, id: 'feb', number: '0112', periodStart: '2027-02-01', periodLabel: 'February 2027', issuedOn: '2027-01-15' }
    const plan = planSends([READY, feb], [p], '2027-01-15')
    expect(plan.send.map((i) => i.number)).toEqual(['0112'])
    expect(plan.hold.map((i) => i.number)).toEqual(['0111'])
    // printed only once January had begun: it waits too
    expect(planSends([READY], [p], '2027-01-02')).toMatchObject({ send: [], hold: [READY] })
    // a span that is not one month (past costs) never sends itself
    expect(planSends([{ ...READY, periodStart: null }], [p], '2026-12-15').send).toEqual([])
  })

  it('gives a voided month back: the job issues it again, under a new number, before the month starts', () => {
    // billed periods leave void (and credited) invoices out (lib/finance/issue.ts billedPeriods)
    expect(nextBillablePeriod(PROFILE, [], '2026-12-16')?.periodStart).toBe('2027-01-01')
    expect(nextBillablePeriod(PROFILE, ['2027-01-01'], '2026-12-16')).toBeNull()
  })

  it('never sends what may have gone, is in flight, or failed last time: it lists them for the operator', () => {
    const p = { ...PROFILE, holdNext: false }
    const unsure = { ...READY, status: 'unconfirmed' as const, sendError: 'No clear answer from the email service (timeout); it may have gone.' }
    const inFlight = { ...READY, number: '0112', status: 'sending' as const, sendClaimedAt: '2026-12-15T05:00:00.000Z' }
    const failed = { ...READY, number: '0113', sendError: 'domain not verified' }
    const plan = planSends([unsure, inFlight, failed], [p], '2026-12-15')
    expect(plan.send).toEqual([])
    expect(plan.hold).toEqual([])
    expect(plan.attention.map((a) => a.invoice.number)).toEqual(['0111', '0112', '0113'])
    const lines = attentionLines(plan.attention)
    expect(lines[0]).toBe('Invoice 0111 (Acme SA, January 2027) was not sent by the job: may have gone: No clear answer from the email service (timeout); it may have gone.. Check your Bcc copy, then use Send on Ops → Costs if it did not go.')
    expect(lines[2]).toContain('its last send failed: domain not verified')
  })
})

describe('what the operator is told', () => {
  it('says a held invoice once, by the day it was issued, with a link to Ops → Costs', () => {
    const n = holdNotices([READY])
    expect(n).toEqual([{ invoiceId: READY.id, number: '0111', kind: 'ready', onDay: '2026-12-15', line: '0111 (Acme SA, January 2027): R2,625.00, due 31 December 2026' }])
    const mail = noticeEmail('hold', n, 'https://app.example.test/dashboard/ops/costs')
    expect(mail.subject).toBe('Invoice 0111 is ready and waiting for you')
    expect(mail.text).toContain('Nothing goes to the client until you press Send on Ops → Costs.')
    expect(mail.text).toContain('• 0111 (Acme SA, January 2027): R2,625.00, due 31 December 2026')
    expect(mail.text).toContain('Open it: https://app.example.test/dashboard/ops/costs')
  })

  it('nudges each unpaid invoice once past its due date, and once on its promised day', () => {
    const { invoices, payments } = yearOfInvoices()
    const withPromise = invoices.map((i) => (i.number === '0110' ? { ...i, expectedOn: '2026-11-28' } : i))
    const on17 = nudgeNotices(withPromise, applyPayments(withPromise, payments, '2026-11-17'), '2026-11-17')
    expect(on17).toEqual([]) // due on receipt on the 17th: not late on the 17th
    const on28 = nudgeNotices(withPromise, applyPayments(withPromise, payments, '2026-11-28'), '2026-11-28')
    expect(on28.map((n) => [n.number, n.kind, n.onDay])).toEqual([
      ['0106', 'overdue', '2026-11-17'], ['0107', 'overdue', '2026-11-17'], ['0108', 'overdue', '2026-11-17'],
      ['0109', 'overdue', '2026-11-17'], ['0110', 'expected', '2026-11-28'],
    ])
    const mail = noticeEmail('nudge', on28, 'https://app.example.test/dashboard/ops/costs')
    expect(mail.subject).toBe('Money owed: 5 invoices unpaid')
    expect(mail.text).toContain('• 0107 (Acme SA, Past costs (prior to August 2026)): R7,875.00, due on receipt (issued 17 November 2026)')
    expect(mail.text).toContain('promised for 28 November 2026')
    expect(mail.text).toContain('never to the client')
  })

  it('says nothing about what is paid, credited or not yet sent', () => {
    const { invoices, payments } = yearOfInvoices()
    const all = [...payments, { id: 'p', clientId: invoices[0].clientId, receivedOn: '2026-11-20', amount: 18375, currency: 'ZAR' as const, reference: null, note: null }]
    expect(nudgeNotices(invoices, applyPayments(invoices, all, '2026-12-05'), '2026-12-05')).toEqual([])
    expect(nudgeNotices([READY], applyPayments([READY], [], '2027-02-01'), '2027-02-01')).toEqual([])
  })
})

describe('a month nobody billed', () => {
  const { invoices } = yearOfInvoices()

  it('says nothing while the month in hand has its invoice', () => {
    // 1 Dec: December is 0110
    expect(missedMonthLines([PROFILE], invoices, '2026-12-01')).toEqual([])
  })

  it('says so, weekly, when the month in hand has no live invoice', () => {
    // 1 Jan: no January invoice (its issue days went by)
    expect(missedMonthLines([PROFILE], invoices, '2027-01-01')).toEqual([
      'Acme SA has no invoice for January 2027. The daily job never bills a month that has begun, so it stays unbilled unless you issue one by hand; to skip the month on purpose, pause the billing profile. This reminder repeats weekly.',
    ])
    expect(missedMonthLines([PROFILE], invoices, '2027-01-02')).toEqual([])
    expect(missedMonthLines([PROFILE], invoices, '2027-01-08')).toHaveLength(1)
    // a void December counts as no December
    const voided = invoices.map((i) => (i.number === '0110' ? { ...i, status: 'void' as const } : i))
    expect(missedMonthLines([PROFILE], voided, '2026-12-08')).toHaveLength(1)
  })

  it('says nothing for a paused profile', () => {
    expect(missedMonthLines([{ ...PROFILE, active: false }], invoices, '2027-01-01')).toEqual([])
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
    expect(ids).toEqual(['day', 'issue', 'plan-print', 'print', 'plan-send', 'send', 'tell-held', 'nudge', 'fx', 'apify-usage', 'alert'])
    expect(src).not.toMatch(/withBrowser|printInvoicePdf|sendInvoiceEmail|sendInvoice\(/)
    expect(src).toContain('/api/admin/finance/invoices/${d.id}/render')
    expect(src).toContain('/api/admin/finance/invoices/${s.id}/send')
  })
})
