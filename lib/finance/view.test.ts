import { describe, expect, it } from 'vitest'
import { CLIENT, ISSUER, PROFILE, invoice, yearOfInvoices } from './fixtures'
import { upcomingIssue } from './periods'
import { buildMoneyView } from './view'

// Money in, decided for the page. Made-up names; a real year's amounts.

const names = new Map([[CLIENT, 'Acme']])

describe('the money view', () => {
  it('reads the year: R29,520 owed, the next invoice on 15 December, and what comes in', () => {
    const { invoices, payments } = yearOfInvoices()
    const v = buildMoneyView({ issuer: ISSUER, profiles: [PROFILE], invoices, payments }, {
      today: '2026-11-18', usdZar: 17, costsThisMonthZar: 2000, clientNames: names, pdfUrls: new Map(),
    })
    expect(v.summary.owedToYouZar).toBe(29520)
    expect(v.invoices.map((r) => r.invoice.number).slice(0, 6)).toEqual(['CN-0004', 'CN-0003', 'CN-0002', 'CN-0001', '0010', '0009'])
    expect(v.invoices.find((r) => r.invoice.number === '0006')?.relatedNumber).toBe('0002')
    expect(v.invoices.find((r) => r.invoice.number === 'CN-0001')?.relatedNumber).toBe('0002')
    expect(v.profiles[0]).toMatchObject({ clientName: 'Acme', monthTotal: 3690, next: { periodStart: '2027-01-01', issueOn: '2026-12-15', dueOn: '2026-12-31' } })
    expect(v.comingUp.map((m) => [m.date, m.label, m.zar, m.late])).toEqual([
      ['2026-11-17', 'Invoice 0006 due (Acme SA)', 3690, true],
      ['2026-11-17', 'Invoice 0007 due (Acme SA)', 14760, true],
      ['2026-11-17', 'Invoice 0008 due (Acme SA)', 3690, true],
      ['2026-11-17', 'Invoice 0009 due (Acme SA)', 3690, true],
      ['2026-11-30', 'Invoice 0010 due (Acme SA)', 3690, false],
      ['2026-12-15', 'Invoice for January 2027 issues (Acme SA)', 3690, false],
    ])
    expect(v.payers).toEqual([{ id: CLIENT, name: 'Acme', currency: 'ZAR' }])
  })

  it('marks a ready invoice held while the profile holds it, and sending by itself once it does not', () => {
    const ready = invoice({ number: '0011', status: 'ready', currency: 'ZAR', total: 3690, periodStart: '2027-01-01', issuedOn: '2026-12-15', dueOn: '2026-12-31', profileId: PROFILE.id, pdfPath: 'c/0011.pdf' })
    const opts = { today: '2026-12-15', usdZar: 17, costsThisMonthZar: 0, clientNames: names, pdfUrls: new Map([['c/0011.pdf', 'https://signed.test/0011']]) }
    const held = buildMoneyView({ issuer: ISSUER, profiles: [PROFILE], invoices: [ready], payments: [] }, opts).invoices[0]
    expect(held).toMatchObject({ waiting: true, autoSends: false, pdfUrl: 'https://signed.test/0011' })
    const auto = buildMoneyView({ issuer: ISSUER, profiles: [{ ...PROFILE, holdNext: false }], invoices: [ready], payments: [] }, opts).invoices[0]
    expect(auto).toMatchObject({ waiting: false, autoSends: true })
  })

  it('names the next month past one already billed, and none for a paused profile', () => {
    expect(upcomingIssue(PROFILE, ['2027-01-01'], '2026-12-16')).toMatchObject({ periodStart: '2027-02-01', issueOn: '2027-01-15' })
    expect(upcomingIssue(PROFILE, [], '2026-12-20')).toMatchObject({ periodStart: '2027-01-01', issueOn: '2026-12-20' })
    expect(upcomingIssue({ ...PROFILE, active: false }, [], '2026-12-16')).toBeNull()
  })
})
