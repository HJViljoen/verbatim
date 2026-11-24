import type { BillingProfile, Invoice, Issuer, Payment } from './types'

// TEST DATA ONLY, and made up: an issuer, a client and a year of invoices
// (a dollar invoice paid, four dollar invoices cancelled by credit notes and
// re-issued in rand, a month billed in advance) with invented names,
// addresses, bank lines, prices, rate and numbers: $150 a month at R17.50
// (R2,625), numbered from 0101. The tests in this folder and
// components/ops/costs read it; no runtime code imports it.

export const ISSUER: Issuer = {
  name: 'Jane Doe',
  addressLines: ['1 Test Street', 'Testville', 'Test Province, 0001', 'South Africa'],
  email: 'jane@example.test',
  bankLines: [
    { label: 'Account holder', value: 'MS J DOE' },
    { label: 'Bank', value: 'Example Bank' },
    { label: 'Account type', value: 'Savings' },
    { label: 'Account number', value: '0000000000' },
    { label: 'Branch code', value: '000000 (Example universal)' },
  ],
  emailFrom: 'Jane Doe <jane@verbatim.test>',
  replyTo: 'jane@example.test',
}

export const CLIENT = '00000000-0000-0000-0000-00000000c11e'

export const PROFILE: BillingProfile = {
  id: '00000000-0000-0000-0000-0000000000f1',
  clientId: CLIENT,
  active: true,
  billTo: 'Acme SA',
  currency: 'ZAR',
  fxRate: 17.5,
  lines: [
    { description: 'Widget hosting — platform & storage', unitUsd: 80, qty: 1 },
    { description: 'Data feeds — scraping & enrichment', unitUsd: 40, qty: 1 },
    { description: 'Automation — workflows & scheduling', unitUsd: 20, qty: 1 },
    { description: 'Model tokens — analysis inference', unitUsd: 10, qty: 1 },
  ],
  subjectLine: 'Analytics platform — monthly services & running costs',
  issueDay: 15,
  dueRule: 'end_of_prev_month',
  sendMode: 'auto',
  holdNext: true,
  emailTo: ['ap@acme.test'],
  emailCc: ['buyer@acme.test', 'finance@acme.test'],
  emailBcc: ['jane@example.test'],
  yourRef: 'John Smith',
  emailGreeting: 'Hi John',
  noteOnce: 'Invoices now come from my Verbatim address; the bank details are unchanged.',
}

let seq = 0
const id = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`

function lines(currency: 'USD' | 'ZAR', qty = 1) {
  const rate = currency === 'ZAR' ? 17.5 : 1
  return PROFILE.lines.map((l) => ({ description: l.description, qty, unit: 'month', unitPrice: l.unitUsd * rate, amount: l.unitUsd * rate * qty }))
}

export function invoice(over: Partial<Invoice> & Pick<Invoice, 'number'>): Invoice {
  return {
    id: id(),
    kind: 'invoice',
    clientId: CLIENT,
    profileId: null,
    billTo: 'Acme SA',
    subjectLine: PROFILE.subjectLine,
    yourRef: 'John Smith',
    periodLabel: 'September 2026',
    periodStart: '2026-09-01',
    issuedOn: '2026-09-02',
    dueOn: null,
    currency: 'USD',
    fxNote: null,
    lines: lines('USD'),
    total: 150,
    relatesTo: null,
    status: 'sent',
    expectedOn: null,
    sentAt: '2026-09-02T10:00:00.000Z',
    pdfPath: null,
    emailMessageId: null,
    sendError: null,
    sendClaimedAt: null,
    note: null,
    ...over,
  }
}

/** The made-up year, after the rand re-issue: 0106–0110 owed, R18,375. */
export function yearOfInvoices(): { invoices: Invoice[]; payments: Payment[] } {
  const usd = (number: string, period: string | null, label: string, issuedOn: string, total = 150, qty = 1) =>
    invoice({ number, periodStart: period, periodLabel: label, issuedOn, total, lines: lines('USD', qty), status: 'credited' })
  const i1 = invoice({ number: '0101', periodStart: '2026-06-01', periodLabel: 'June 2026', issuedOn: '2026-06-19' })
  const i2 = usd('0102', '2026-09-01', 'September 2026', '2026-09-02')
  const i3 = usd('0103', null, 'Past costs (prior to August 2026)', '2026-09-02', 450, 3)
  const i4 = usd('0104', '2026-10-01', 'October 2026', '2026-10-17')
  const i5 = usd('0105', '2026-11-01', 'November 2026', '2026-11-01')
  const credits = [i2, i3, i4, i5].map((c, n) => invoice({
    number: `CN-010${n + 1}`, kind: 'credit_note', relatesTo: c.id, periodStart: c.periodStart, periodLabel: c.periodLabel,
    issuedOn: '2026-11-17', total: c.total, lines: c.lines, subjectLine: '',
  }))
  const zar = (number: string, replaces: Invoice, total = 2625, qty = 1, dueOn: string | null = null, period = replaces.periodStart, label = replaces.periodLabel) =>
    invoice({
      number, currency: 'ZAR', total, lines: lines('ZAR', qty), issuedOn: '2026-11-17', dueOn, relatesTo: replaces.id,
      periodStart: period, periodLabel: label, fxNote: `Converted from USD ${(total / 17.5).toFixed(2)} at a fixed rate of R17.50 / USD 1.00.`,
      sentAt: '2026-11-17T17:02:00.000Z',
    })
  const zars = [zar('0106', i2), zar('0107', i3, 7875, 3), zar('0108', i4), zar('0109', i5)]
  const i10 = invoice({
    number: '0110', currency: 'ZAR', total: 2625, lines: lines('ZAR'), issuedOn: '2026-11-17', dueOn: '2026-11-30',
    periodStart: '2026-12-01', periodLabel: 'December 2026', fxNote: 'Converted from USD 150.00 at a fixed rate of R17.50 / USD 1.00.',
    sentAt: '2026-11-17T17:02:00.000Z',
  })
  const payments: Payment[] = [
    { id: id(), clientId: CLIENT, receivedOn: '2026-08-08', amount: 150, currency: 'USD', reference: 'INV-0101', note: null },
  ]
  return { invoices: [i1, i2, i3, i4, i5, ...credits, ...zars, i10], payments }
}
