import { describe, expect, it } from 'vitest'
import { CLIENT, ISSUER, PROFILE, invoice, yearOfInvoices } from './fixtures'
import { documentName, footnote, invoiceHtml, pdfFileName, pdfStoragePath } from './html'
import { applyPayments, effectiveDue } from './ledger'
import { IN_ADVANCE_NOTE, fmtMoney, fxNote, priceMonth } from './money'
import { dueDateFor, fmtInvoiceDate, issueDateFor, nextBillablePeriod, periodLabel } from './periods'
import { invoiceFromRow, linesToJson, paymentFromRow, profileFromRow, profileToRow } from './rows'
import { summarise } from './summary'
import type { Invoice } from './types'

// The finance logic (lib/finance), pure. Made-up names throughout
// (lib/finance/fixtures.ts); the amounts and dates are a real year's shape.

describe('a month, priced', () => {
  it('converts each dollar line at the fixed rate, to the cent', () => {
    const m = priceMonth(PROFILE)
    expect(m.lines.map((l) => [l.unitPrice, l.amount])).toEqual([[1800, 1800], [540, 540], [450, 450], [900, 900]])
    expect(m.total).toBe(3690)
    expect(m.totalUsd).toBe(205)
    expect(m.fxNote).toBe('Converted from USD 205.00 at a fixed rate of R18.00 / USD 1.00.')
    expect(m.lines.every((l) => l.unit === 'month')).toBe(true)
  })

  it('keeps a dollar invoice in dollars, with no conversion sentence', () => {
    const m = priceMonth({ ...PROFILE, currency: 'USD' })
    expect(m.total).toBe(205)
    expect(m.fxNote).toBeNull()
  })

  it('multiplies the rounded unit price by the quantity, so the printed figures agree', () => {
    const m = priceMonth({ currency: 'ZAR', fxRate: 16.9327, lines: [{ description: 'x', unitUsd: 33.33, qty: 4 }] })
    // 33.33 × 16.9327 = 564.366891 → R564.37 a unit, R2,257.48 for four
    expect(m.lines[0].unitPrice).toBe(564.37)
    expect(m.lines[0].amount).toBe(2257.48)
    expect(m.total).toBe(2257.48)
    expect(fxNote(1025, 18)).toBe('Converted from USD 1,025.00 at a fixed rate of R18.00 / USD 1.00.')
  })

  it('prints money the invoice way', () => {
    expect(fmtMoney(3690, 'ZAR')).toBe('R3,690.00')
    expect(fmtMoney(14760, 'ZAR')).toBe('R14,760.00')
    expect(fmtMoney(-205, 'USD')).toBe('−$205.00')
  })
})

describe('when a month is billed', () => {
  it('issues January on 15 December and makes it due on 31 December', () => {
    expect(issueDateFor('2027-01-01', 15)).toBe('2026-12-15')
    expect(dueDateFor('2027-01-01', 'end_of_prev_month')).toBe('2026-12-31')
    expect(dueDateFor('2026-03-01', 'end_of_prev_month')).toBe('2026-02-28')
    expect(dueDateFor('2027-01-01', 'on_receipt')).toBeNull()
    expect(periodLabel('2027-01-01')).toBe('January 2027')
    expect(fmtInvoiceDate('2026-12-31')).toBe('31.12.2026')
  })

  it('bills next month once its issue day has come, and not before', () => {
    expect(nextBillablePeriod(PROFILE, [], '2026-12-14')).toBeNull()
    expect(nextBillablePeriod(PROFILE, [], '2026-12-15')).toEqual({
      periodStart: '2027-01-01', periodLabel: 'January 2027', issuedOn: '2026-12-15', dueOn: '2026-12-31',
    })
  })

  it('bills it once: a month already billed gives nothing', () => {
    expect(nextBillablePeriod(PROFILE, ['2026-12-01', '2027-01-01'], '2026-12-15')).toBeNull()
  })

  it('catches up a missed issue day on any run before the month starts, dated that day', () => {
    expect(nextBillablePeriod(PROFILE, [], '2026-12-20')?.issuedOn).toBe('2026-12-20')
    expect(nextBillablePeriod(PROFILE, [], '2026-12-31')?.periodStart).toBe('2027-01-01')
  })

  it('never back-fills a month that has started', () => {
    // 1 January: January has begun; February's day is the 15th
    expect(nextBillablePeriod(PROFILE, [], '2027-01-01')).toBeNull()
    expect(nextBillablePeriod(PROFILE, ['2026-10-01'], '2027-01-15')?.periodStart).toBe('2027-02-01')
  })

  it('bills nothing for a paused profile or one with no lines', () => {
    expect(nextBillablePeriod({ ...PROFILE, active: false }, [], '2026-12-15')).toBeNull()
    expect(nextBillablePeriod({ ...PROFILE, lines: [] }, [], '2026-12-15')).toBeNull()
  })
})

describe('the ledger', () => {
  const { invoices, payments } = yearOfInvoices()
  const byNumber = (l: ReturnType<typeof applyPayments>, n: string) =>
    [...l.byId.values()].find((b) => b.number === n) as NonNullable<ReturnType<typeof l.byId.get>>

  it('reproduces the year: 0001 paid, 0002–0005 credited, 0006–0010 owed, R29,520 in all', () => {
    const l = applyPayments(invoices, payments, '2026-11-17')
    expect(byNumber(l, '0001')).toMatchObject({ state: 'paid', paidCents: 20500, balanceCents: 0, paidOn: '2026-08-08' })
    for (const n of ['0002', '0003', '0004', '0005']) expect(byNumber(l, n)).toMatchObject({ state: 'credited', balanceCents: 0 })
    for (const n of ['CN-0001', 'CN-0002', 'CN-0003', 'CN-0004']) expect(byNumber(l, n)).toMatchObject({ state: 'credited', balanceCents: 0 })
    // due on receipt and issued 17 Nov: due that day, not late on it
    for (const n of ['0006', '0008', '0009']) expect(byNumber(l, n)).toMatchObject({ state: 'open', balanceCents: 369000, dueOn: '2026-11-17' })
    expect(byNumber(l, '0007')).toMatchObject({ state: 'open', balanceCents: 1476000 })
    expect(byNumber(l, '0010')).toMatchObject({ state: 'open', balanceCents: 369000, dueOn: '2026-11-30' })
    const owed = [...l.byId.values()].reduce((s, b) => s + b.balanceCents, 0)
    expect(owed).toBe(2952000)
    expect(l.credit).toEqual([])
  })

  it('turns an unpaid invoice overdue the day after it is due', () => {
    const l = applyPayments(invoices, payments, '2026-11-18')
    expect(byNumber(l, '0006').state).toBe('overdue')
    expect(byNumber(l, '0010').state).toBe('open')
    expect(byNumber(applyPayments(invoices, payments, '2026-12-01'), '0010').state).toBe('overdue')
  })

  it('pays R29,520 off oldest due first, all five', () => {
    const paid = [...payments, { id: 'p-zar', clientId: CLIENT, receivedOn: '2026-11-28', amount: 29520, currency: 'ZAR' as const, reference: null, note: null }]
    const l = applyPayments(invoices, paid, '2026-11-28')
    for (const n of ['0006', '0007', '0008', '0009', '0010']) expect(byNumber(l, n)).toMatchObject({ state: 'paid', balanceCents: 0, paidOn: '2026-11-28' })
    expect(l.credit).toEqual([])
  })

  it('applies a part payment oldest due first, and the invoice it stops in reads part-paid', () => {
    // 0006, 0007, 0008, 0009 are due 17 Nov (on receipt), 0010 on 30 Nov; the
    // number breaks the tie. R20,000 clears 0006 (3,690) and 0007 (14,760)
    // and leaves 1,550 on 0008.
    const part = [...payments, { id: 'p-part', clientId: CLIENT, receivedOn: '2026-11-17', amount: 20000, currency: 'ZAR' as const, reference: null, note: null }]
    const l = applyPayments(invoices, part, '2026-11-17')
    expect(byNumber(l, '0006').state).toBe('paid')
    expect(byNumber(l, '0007').state).toBe('paid')
    expect(byNumber(l, '0008')).toMatchObject({ state: 'part', partPaid: true, paidCents: 155000, balanceCents: 214000 })
    expect(byNumber(l, '0009')).toMatchObject({ state: 'open', paidCents: 0 })
    // a day later 0008 is late as well as part-paid
    expect(byNumber(applyPayments(invoices, part, '2026-11-18'), '0008')).toMatchObject({ state: 'overdue', partPaid: true })
  })

  it('applies a payment only to invoices in its own currency, and keeps what is left over as credit', () => {
    const extra = [...payments, { id: 'p-usd', clientId: CLIENT, receivedOn: '2026-11-20', amount: 50, currency: 'USD' as const, reference: null, note: null }]
    const l = applyPayments(invoices, extra, '2026-11-20')
    expect(byNumber(l, '0006').paidCents).toBe(0)
    expect(l.credit).toEqual([{ clientId: CLIENT, currency: 'USD', cents: 5000 }])
  })

  it('applies a payment to its own client only', () => {
    const other = [{ id: 'p-x', clientId: 'someone-else', receivedOn: '2026-11-20', amount: 3690, currency: 'ZAR' as const, reference: null, note: null }]
    const l = applyPayments(invoices, [...payments, ...other], '2026-11-20')
    expect(byNumber(l, '0006').paidCents).toBe(0)
    expect(l.credit).toEqual([{ clientId: 'someone-else', currency: 'ZAR', cents: 369000 }])
  })

  it('owes nothing on an invoice not yet sent, and cancels one a credit note relates to whatever its status', () => {
    const ready = invoice({ number: '0011', status: 'ready', currency: 'ZAR', total: 3690, periodStart: '2027-01-01', issuedOn: '2026-12-15', dueOn: '2026-12-31' })
    const sentButCredited = invoice({ number: '0012', status: 'sent', currency: 'ZAR', total: 100, periodStart: '2027-02-01', issuedOn: '2027-01-15' })
    const cn = invoice({ number: 'CN-0005', kind: 'credit_note', relatesTo: sentButCredited.id, currency: 'ZAR', total: 100, issuedOn: '2027-01-16' })
    const l = applyPayments([ready, sentButCredited, cn], [], '2027-01-20')
    expect(l.byId.get(ready.id)).toMatchObject({ state: 'unsent', balanceCents: 0 })
    expect(l.byId.get(sentButCredited.id)).toMatchObject({ state: 'credited', balanceCents: 0 })
    expect(effectiveDue(ready)).toBe('2026-12-31')
  })
})

describe('the summary', () => {
  it('reads the year as R29,520 owed, rand at the cost side\'s rate for a dollar balance', () => {
    const { invoices, payments } = yearOfInvoices()
    const s = summarise(applyPayments(invoices, payments, '2026-11-18'), payments, {
      today: '2026-11-18', usdZar: 17, costsThisMonthZar: 2500, clientsWithInvoices: [CLIENT],
    })
    expect(s.owedToYouZar).toBe(29520)
    expect(s.overdueZar).toBe(25830) // 0006–0009, due on receipt on the 17th
    expect(s.dueNext30Zar).toBe(29520)
    expect(s.receivedThisMonthZar).toBe(0)
    expect(s.receivedThisYearZar).toBe(205 * 17)
    expect(s.leftOverZar).toBe(-2500)
    expect(s.owedByClientZar.get(CLIENT)).toBe(29520)
  })

  it('counts a payment this month and what it leaves over', () => {
    const { invoices, payments } = yearOfInvoices()
    const all = [...payments, { id: 'p', clientId: CLIENT, receivedOn: '2026-11-28', amount: 29520, currency: 'ZAR' as const, reference: null, note: null }]
    const s = summarise(applyPayments(invoices, all, '2026-11-28'), all, {
      today: '2026-11-28', usdZar: 17, costsThisMonthZar: 2500, clientsWithInvoices: [CLIENT],
    })
    expect(s.owedToYouZar).toBe(0)
    expect(s.receivedThisMonthZar).toBe(29520)
    expect(s.leftOverZar).toBe(27020)
    expect(s.owedByClientZar.get(CLIENT)).toBe(0)
  })
})

describe('the page', () => {
  const { invoices } = yearOfInvoices()
  const i10 = invoices.find((i) => i.number === '0010') as Invoice
  const tenth = { ...i10, note: IN_ADVANCE_NOTE }

  it('prints every field of a month billed in advance', () => {
    const html = invoiceHtml(tenth, { issuer: ISSUER })
    for (const s of [
      '<title>Invoice 0010 — Acme SA</title>', '@page { size: A4;', '<span class="name">Jane Doe</span>', '<div class="who">Jane Doe</div>',
      '<div class="line">1 Test Street</div>', '<div class="line">South Africa</div>', '<div class="email">jane@example.test</div>',
      '<h1>INVOICE</h1>', 'Invoice&nbsp;#', ': 0010', ': 17.11.2026', 'Due date', ': 30.11.2026',
      '<div class="kvrow gap"><span class="k">Your ref.</span><span class="lead"></span><span class="v">: John Smith</span></div>',
      ': Jane Doe</span>', '<div class="billto">Acme SA</div>', 'Analytics platform — monthly services &amp; running costs',
      'Billing period: December 2026', 'Widget hosting — platform &amp; storage', '<td class="price">R1,800.00</td><td class="amount">R1,800.00</td>',
      '<td class="price">R540.00</td>', '<td class="price">R450.00</td>', '<td class="price">R900.00</td>',
      'Total (ZAR)</td>', '<td class="amount">R3,690.00</td>',
      'All amounts in South African Rand (ZAR). VAT: not applicable. Converted from USD 205.00 at a fixed rate of R18.00 / USD 1.00. Billed monthly in advance: payment is due by the last day of the month before the billing period.',
      'Payment details', '<td class="lbl">Account holder</td><td>MS J DOE</td>', '<td>Example Bank</td>', '<td class="lbl">Branch code</td>',
      '<td class="lbl">Payment reference</td><td>INV-0010</td>',
    ]) expect(html).toContain(s)
    expect(html.match(/<td class="nr">/g)).toHaveLength(4)
    expect(html).not.toContain('Replaces invoice')
  })

  it('prints "On receipt" and the invoice a replacement replaces', () => {
    const six = invoices.find((i) => i.number === '0006') as Invoice
    const html = invoiceHtml(six, { issuer: ISSUER, related: invoices.find((i) => i.number === '0002') })
    expect(html).toContain(': On receipt')
    expect(html).toContain('<div class="kvrow gap"><span class="k">Replaces invoice</span><span class="lead"></span><span class="v">: 0002 (USD)</span></div>')
    expect(html).toContain('<div class="kvrow"><span class="k">Your ref.</span>')
  })

  it('prints a credit note: negative amounts, the invoice it cancels, the settlement', () => {
    const cn = invoices.find((i) => i.number === 'CN-0001') as Invoice
    const two = invoices.find((i) => i.number === '0002') as Invoice
    const six = invoices.find((i) => i.number === '0006') as Invoice
    const html = invoiceHtml(cn, { issuer: ISSUER, related: two, replacement: six })
    for (const s of [
      '<title>Credit note CN-0001 — Acme SA</title>', '<h1>CREDIT NOTE</h1>', 'Credit note&nbsp;#', ': CN-0001', ': 1 of 1',
      '<div class="kvrow gap"><span class="k">Credits invoice</span><span class="lead"></span><span class="v">: 0002</span></div>',
      'Credit note — cancels invoice 0002 (USD) in full', '<td class="price">$100.00</td><td class="amount">−$100.00</td>',
      'Total credit (USD)', '<td class="amount">−$205.00</td>', 'Settlement',
      'Invoice 0002 (02.09.2026)</td><td class="amt">$205.00</td>', 'Less: credit note CN-0001</td><td class="amt">−$205.00</td>',
      'Balance due on invoice 0002</td><td class="amt">$0.00</td>', 'Replaced by invoice 0006 (ZAR)', 'R3,690.00',
    ]) expect(html).toContain(s)
    expect(html).not.toContain('Payment reference')
  })

  it('escapes what the rows hold', () => {
    const html = invoiceHtml(invoice({ number: '0099', billTo: '<script>x</script>' }), { issuer: ISSUER })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
  })

  it('names and files the PDF', () => {
    expect(pdfFileName({ ...tenth, billTo: 'Ünïcode Co (Pty) Ltd' })).toBe('Invoice-0010-Unicode-Co-Pty-Ltd-ZAR-2026-11-17.pdf')
    expect(pdfFileName({ ...tenth, kind: 'credit_note', number: 'CN-0001' })).toBe('CreditNote-CN-0001-Acme-SA-ZAR-2026-11-17.pdf')
    expect(pdfStoragePath(tenth)).toBe(`${CLIENT}/0010.pdf`)
    expect(documentName(tenth)).toBe('Invoice 0010')
    expect(footnote({ currency: 'USD', fxNote: null, note: null })).toBe('All amounts in US Dollars (USD). VAT: not applicable.')
  })
})

describe('the rows', () => {
  it('reads PostgREST\'s shapes: numeric strings, jsonb lines, text arrays', () => {
    const p = profileFromRow({
      id: 'p', client_id: CLIENT, active: true, bill_to: 'Acme SA', currency: 'ZAR', fx_rate: '18.0000',
      lines: [{ description: 'x', unit_usd: '100', qty: 1 }], subject_line: 's', issue_day: 15, due_rule: 'end_of_prev_month',
      send_mode: 'auto', hold_next: true, email_to: ['a@acme.test', ''], email_cc: null, email_bcc: [], your_ref: null,
      email_greeting: 'Hi', note_once: null,
    })
    expect(p).toMatchObject({ fxRate: 18, lines: [{ description: 'x', unitUsd: 100, qty: 1 }], emailTo: ['a@acme.test'], emailCc: [] })
    expect(profileToRow(p)).toMatchObject({ fx_rate: 18, lines: [{ description: 'x', unit_usd: 100, qty: 1 }] })
    const i = invoiceFromRow({ id: 'i', number: '0011', client_id: CLIENT, total: '3690.00', issued_on: '2026-12-15', due_on: null,
      lines: linesToJson([{ description: 'x', qty: 1, unit: 'month', unitPrice: 1800, amount: 1800 }]), period_start: '2027-01-01' })
    expect(i).toMatchObject({ total: 3690, dueOn: null, lines: [{ unitPrice: 1800, amount: 1800 }], status: 'draft', kind: 'invoice' })
    expect(paymentFromRow({ id: 'x', client_id: CLIENT, received_on: '2026-11-28', amount: '29520.00', currency: 'ZAR' }).amount).toBe(29520)
  })
})
