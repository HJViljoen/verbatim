import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { billingCycle } from '@/lib/costs/dates'
import type { CostsData } from '@/lib/costs/load'
import { DEFAULT_SETTINGS } from '@/lib/costs/types'
import { CLIENT, ISSUER, PROFILE, invoice, yearOfInvoices } from '@/lib/finance/fixtures'
import { render, renderText } from '@/lib/test/render'
import { CostsPageBody } from './page-body'

// What Ops → Costs PRINTS with Money in on top (operator only). Made-up
// names, prices and numbers (lib/finance/fixtures.ts). The action modules are the server's; their
// references are all a render needs.

vi.mock('@/app/dashboard/ops/costs/actions', () => {
  const ok = async () => ({ ok: true, message: '' })
  return { saveBill: ok, deleteBill: ok, markBillPaid: ok, settleOverdue: ok, savePlan: ok, deletePlan: ok, saveSettings: ok, saveOpenaiBalance: ok, setToggle: ok }
})
vi.mock('@/app/dashboard/ops/costs/money-actions', () => {
  const ok = async () => ({ ok: true, message: '' })
  return { recordPayment: ok, deletePayment: ok, setExpected: ok, printInvoice: ok, sendInvoiceNow: ok, sendInvoiceTest: ok, saveProfile: ok, setHold: ok, voidInvoice: ok }
})

const TODAY = '2026-11-18'
const DATA: CostsData = {
  today: TODAY,
  bills: [],
  plans: [{ id: 'plan', clientId: CLIENT, name: null, stage: 'paying', price: 150, currency: 'USD', unpaidAmount: 600, note: null, trialEndsOn: null, cadence: 'none', costPerRunUsd: null }],
  settings: { ...DEFAULT_SETTINGS, usdZar: 17, fxAuto: true, fxOn: '2026-11-17' },
  clients: [{ id: CLIENT, name: 'Acme', isActive: true, trialEndsAt: null, reportPeriod: null }],
  measured: [],
  usage: [],
  recentRuns: [],
  apifyCycle: billingCycle(TODAY, 9),
  apifyCycleSpendUsd: 0.53,
  apifyCycleSource: 'api',
  apifyApiReadAt: '2026-11-18T05:00:00.000Z',
  openaiSinceBalanceUsd: null,
}
const { invoices, payments } = yearOfInvoices()
const FINANCE = { issuer: ISSUER, profiles: [PROFILE], invoices, payments }
const NOW = new Date('2026-11-18T08:00:00.000Z')

describe('Ops → Costs with Money in', () => {
  const text = renderText(<CostsPageBody data={DATA} finance={FINANCE} now={NOW} />)

  it('leads with what is owed, due, received, the month\'s costs and what is left', () => {
    expect(text).toContain('Owed to you R18,375 $1,081 R15,750 of it overdue')
    expect(text).toContain('Due in the next 30 days R18,375')
    expect(text).toContain('Received this month R0')
    expect(text).toContain('Costs this month')
    expect(text).toContain('Left over this month')
  })

  it('takes "Owed to you" in the summary from the invoices, not the hand-kept figure', () => {
    // 600 dollars unpaid at R17 would read R10,200
    expect(text).not.toContain('R10,200')
    expect(text.match(/Owed to you R18,375/g)?.length).toBe(2)
    expect(text).toContain('Owes R18,375 on its invoices')
  })

  it('prints one "Owed to you": with a client that has no invoices, both figures add its hand-kept amount', () => {
    const other = '00000000-0000-0000-0000-0000000000b2'
    const data: CostsData = {
      ...DATA,
      clients: [...DATA.clients, { id: other, name: 'Beta', isActive: true, trialEndsAt: null, reportPeriod: null }],
      plans: [...DATA.plans, { id: 'plan-b', clientId: other, name: null, stage: 'paying', price: 100, currency: 'ZAR', unpaidAmount: 1000, note: null, trialEndsOn: null, cadence: 'none', costPerRunUsd: null }],
    }
    const t = renderText(<CostsPageBody data={data} finance={FINANCE} now={NOW} />)
    // R18,375 on the invoices + R1,000 kept by hand for Beta
    expect(t.match(/Owed to you R19,375/g)?.length).toBe(2)
    expect(t).toContain('R15,750 of it overdue · R1,000 of it kept by hand, for clients with no invoices')
    expect(t).not.toMatch(/Owed to you R18,375/)
  })

  it('lists each invoice with its state, what it replaces and what it owes', () => {
    expect(text).toContain('Invoice 0110 December 2026 Open Acme SA Issued 17 Nov 2026 Due 30 Nov 2026')
    expect(text).toContain('Invoice 0106 September 2026 Overdue Acme SA Issued 17 Nov 2026 Due on receipt Replaces 0102')
    expect(text).toContain('R2,625.00 owed')
    expect(text).toContain('R7,875.00 owed')
    expect(text).toContain('Invoice 0102 September 2026 Credited')
    expect(text).toContain('CN-0101 September 2026 Credit note Acme SA Issued 17 Nov 2026 Cancels 0102')
    expect(text).toContain('Invoice 0101 June 2026 Paid')
    expect(text).toContain('Paid 8 Aug 2026')
    expect(text).toContain('They said they’ll pay on')
  })

  it('records payments and lists them', () => {
    expect(text).toContain('Record payment')
    expect(text).toContain('8 Aug 2026 $150.00 INV-0101 Delete…')
  })

  it('shows the billing, the next invoice and the hold', () => {
    expect(text).toContain('R2,625.00 a month to Acme SA · $150.00 at a fixed R17.50')
    expect(text).toContain('Next: January 2027, issued 15 Dec 2026, due 31 Dec 2026, held for your tap.')
    expect(text).toContain('Next one held for you')
    expect(text).toContain('Hold the next invoice for me')
    expect(text).toContain('The next email also says: “Invoices now come from my Verbatim address; the bank details are unchanged.”')
  })

  it('puts money in on the calendar beside the bills', () => {
    expect(text).toContain('Invoice for January 2027 issues (Acme SA) Money in')
    expect(text).toContain('Invoice 0110 due (Acme SA) Money in')
  })

  it('names Apify\'s own figure and the rate\'s day', () => {
    expect(text).toContain("Apify's own figure, read 18 Nov 2026.")
    expect(text).toContain('(ECB, 17 Nov 2026)')
    expect(text).toContain('Refresh the dollar rate daily')
  })

  it('offers Send, Print and a test on a ready invoice, and asks before it sends', () => {
    const ready = invoice({ number: '0111', status: 'ready', currency: 'ZAR', total: 2625, periodStart: '2027-01-01', periodLabel: 'January 2027', issuedOn: '2026-12-15', dueOn: '2026-12-31', profileId: PROFILE.id, pdfPath: 'c/0111.pdf', sentAt: null })
    const t = renderText(<CostsPageBody data={DATA} finance={{ ...FINANCE, invoices: [ready, ...invoices] }} pdfUrls={new Map([['c/0111.pdf', 'https://signed.test/x']])} now={NOW} />)
    expect(t).toContain('Invoice 0111 January 2027 Not sent Held for you')
    expect(t).toContain('Send… Print again Send a test to me Void…')
    // sent, credited and paid invoices (all of the base year) cannot be voided
    expect(text).not.toContain('Void…')
    const editors = readFileSync(new URL('./money-editors.tsx', import.meta.url), 'utf8')
    expect(editors).not.toMatch(/window\.confirm|confirm\(/)
    expect(editors).toContain('Send invoice {invoice.number} to {recipients} now?')
    expect(editors).toContain('Voiding gives ${invoice.periodLabel} back: the daily job issues it again, under a new number, on its next run before the month starts. To skip a month, pause the billing profile instead.')
  })

  it('shows an invoice that may have gone, offers only a confirmed Send again, and says the job leaves it alone', () => {
    const unsure = invoice({ number: '0111', status: 'unconfirmed', currency: 'ZAR', total: 2625, periodStart: '2027-01-01', periodLabel: 'January 2027', issuedOn: '2026-12-15', dueOn: '2026-12-31', profileId: PROFILE.id, pdfPath: 'c/0111.pdf', sentAt: null, sendError: 'No clear answer from the email service (timeout); it may have gone.' })
    const t = renderText(<CostsPageBody data={DATA} finance={{ ...FINANCE, invoices: [unsure, ...invoices] }} now={NOW} />)
    expect(t).toContain('Invoice 0111 January 2027 May have gone')
    expect(t).toContain('It may have gone (No clear answer from the email service (timeout); it may have gone.). The daily job will not send it again.')
    expect(t).toContain('Send again…')
    const editors = readFileSync(new URL('./money-editors.tsx', import.meta.url), 'utf8')
    expect(editors).toContain('Check your Bcc copy in Gmail first: it may already have gone.')
    expect(editors).toContain('<input type="hidden" name="confirmUnsure" value="1" />')
  })

  it('says so, and keeps the costs, before the finance migration is in', () => {
    const t = renderText(<CostsPageBody data={DATA} finance={null} now={NOW} />)
    expect(t).toContain('Money in: the finance tables are not in this database yet.')
    expect(t).toContain('Owed to you R10,200') // the hand-kept figure, as before
    expect(t).toContain('Owes $600.00 (R10,200)')
    expect(render(<CostsPageBody data={DATA} finance={null} now={NOW} />)).not.toContain('Refresh the dollar rate daily')
  })
})
