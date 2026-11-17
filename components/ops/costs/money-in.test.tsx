import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { billingCycle } from '@/lib/costs/dates'
import type { CostsData } from '@/lib/costs/load'
import { DEFAULT_SETTINGS } from '@/lib/costs/types'
import { CLIENT, ISSUER, PROFILE, invoice, yearOfInvoices } from '@/lib/finance/fixtures'
import { render, renderText } from '@/lib/test/render'
import { CostsPageBody } from './page-body'

// What Ops → Costs PRINTS with Money in on top (operator only). Made-up names;
// a real year's amounts. The action modules are the server's; their
// references are all a render needs.

vi.mock('@/app/dashboard/ops/costs/actions', () => {
  const ok = async () => ({ ok: true, message: '' })
  return { saveBill: ok, deleteBill: ok, markBillPaid: ok, settleOverdue: ok, savePlan: ok, deletePlan: ok, saveSettings: ok, saveOpenaiBalance: ok, setToggle: ok }
})
vi.mock('@/app/dashboard/ops/costs/money-actions', () => {
  const ok = async () => ({ ok: true, message: '' })
  return { recordPayment: ok, deletePayment: ok, setExpected: ok, printInvoice: ok, sendInvoiceNow: ok, sendInvoiceTest: ok, saveProfile: ok, setHold: ok }
})

const TODAY = '2026-11-18'
const DATA: CostsData = {
  today: TODAY,
  bills: [],
  plans: [{ id: 'plan', clientId: CLIENT, name: null, stage: 'paying', price: 205, currency: 'USD', unpaidAmount: 1025, note: null, trialEndsOn: null, cadence: 'none', costPerRunUsd: null }],
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
    expect(text).toContain('Owed to you R29,520 $1,736 R25,830 of it overdue')
    expect(text).toContain('Due in the next 30 days R29,520')
    expect(text).toContain('Received this month R0')
    expect(text).toContain('Costs this month')
    expect(text).toContain('Left over this month')
  })

  it('takes "Owed to you" in the summary from the invoices, not the hand-kept figure', () => {
    // 1,025 dollars unpaid at R17 would read R17,425
    expect(text).not.toContain('R17,425')
    expect(text.match(/Owed to you R29,520/g)?.length).toBe(2)
    expect(text).toContain('Owes R29,520 on its invoices')
  })

  it('lists each invoice with its state, what it replaces and what it owes', () => {
    expect(text).toContain('Invoice 0010 December 2026 Open Acme SA Issued 17 Nov 2026 Due 30 Nov 2026')
    expect(text).toContain('Invoice 0006 September 2026 Overdue Acme SA Issued 17 Nov 2026 Due on receipt Replaces 0002')
    expect(text).toContain('R3,690.00 owed')
    expect(text).toContain('R14,760.00 owed')
    expect(text).toContain('Invoice 0002 September 2026 Credited')
    expect(text).toContain('CN-0001 September 2026 Credit note Acme SA Issued 17 Nov 2026 Cancels 0002')
    expect(text).toContain('Invoice 0001 June 2026 Paid')
    expect(text).toContain('Paid 8 Aug 2026')
    expect(text).toContain('They said they’ll pay on')
  })

  it('records payments and lists them', () => {
    expect(text).toContain('Record payment')
    expect(text).toContain('8 Aug 2026 $205.00 INV-0001 Delete…')
  })

  it('shows the billing, the next invoice and the hold', () => {
    expect(text).toContain('R3,690.00 a month to Acme SA · $205.00 at a fixed R18.00')
    expect(text).toContain('Next: January 2027, issued 15 Dec 2026, due 31 Dec 2026, held for your tap.')
    expect(text).toContain('Next one held for you')
    expect(text).toContain('Hold the next invoice for me')
    expect(text).toContain('The next email also says: “Invoices now come from my Verbatim address; the bank details are unchanged.”')
  })

  it('puts money in on the calendar beside the bills', () => {
    expect(text).toContain('Invoice for January 2027 issues (Acme SA) Money in')
    expect(text).toContain('Invoice 0010 due (Acme SA) Money in')
  })

  it('names Apify\'s own figure and the rate\'s day', () => {
    expect(text).toContain("Apify's own figure, read 18 Nov 2026.")
    expect(text).toContain('(ECB, 17 Nov 2026)')
    expect(text).toContain('Refresh the dollar rate daily')
  })

  it('offers Send, Print and a test on a ready invoice, and asks before it sends', () => {
    const ready = invoice({ number: '0011', status: 'ready', currency: 'ZAR', total: 3690, periodStart: '2027-01-01', periodLabel: 'January 2027', issuedOn: '2026-12-15', dueOn: '2026-12-31', profileId: PROFILE.id, pdfPath: 'c/0011.pdf', sentAt: null })
    const t = renderText(<CostsPageBody data={DATA} finance={{ ...FINANCE, invoices: [ready, ...invoices] }} pdfUrls={new Map([['c/0011.pdf', 'https://signed.test/x']])} now={NOW} />)
    expect(t).toContain('Invoice 0011 January 2027 Not sent Held for you')
    expect(t).toContain('Send… Print again Send a test to me')
    const editors = readFileSync(new URL('./money-editors.tsx', import.meta.url), 'utf8')
    expect(editors).not.toMatch(/window\.confirm|confirm\(/)
    expect(editors).toContain('Send invoice {invoice.number} to {recipients} now?')
  })

  it('says so, and keeps the costs, before the finance migration is in', () => {
    const t = renderText(<CostsPageBody data={DATA} finance={null} now={NOW} />)
    expect(t).toContain('Money in: the finance tables are not in this database yet.')
    expect(t).toContain('Owed to you R17,425') // the hand-kept figure, as before
    expect(t).toContain('Owes $1,025.00 (R17,425)')
    expect(render(<CostsPageBody data={DATA} finance={null} now={NOW} />)).not.toContain('Refresh the dollar rate daily')
  })
})
