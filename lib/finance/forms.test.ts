import { describe, expect, it } from 'vitest'
import { parseEmails, parseExpectedForm, parseMoneyCents, parsePaymentForm, parseProfileForm } from './forms'

// The Money in forms, read. Made-up names.

const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) })
const CLIENT = '00000000-0000-0000-0000-00000000c11e'

describe('a payment', () => {
  const ok = { clientId: CLIENT, receivedOn: '2026-11-28', amount: 'R29 520.00', currency: 'ZAR', reference: 'INV-0006' }

  it('reads what the bank statement says', () => {
    expect(parsePaymentForm(form(ok), '2026-11-28')).toEqual({
      ok: true, value: { clientId: CLIENT, receivedOn: '2026-11-28', amount: 29520, currency: 'ZAR', reference: 'INV-0006', note: null },
    })
    expect(parsePaymentForm(form({ ...ok, amount: '$205', currency: 'USD' }), '2026-11-28')).toMatchObject({ ok: true, value: { amount: 205, currency: 'USD' } })
    expect(parsePaymentForm(form({ ...ok, amount: '1 250,50' }), '2026-11-28')).toMatchObject({ ok: true, value: { amount: 1250.5 } })
  })

  it('refuses what is not a payment', () => {
    const msg = (o: Record<string, string>) => (parsePaymentForm(form({ ...ok, ...o }), '2026-11-28') as { message?: string }).message
    expect(msg({ clientId: 'x' })).toBe('Pick who paid.')
    expect(msg({ receivedOn: '' })).toBe('Give the day it came in.')
    expect(msg({ receivedOn: '2026-11-29' })).toMatch(/future/)
    expect(msg({ currency: 'EUR' })).toMatch(/currency/)
    expect(msg({ amount: '' })).toBe('Give the amount.')
    expect(msg({ amount: 'lots' })).toMatch(/number with cents/)
    expect(msg({ amount: '0' })).toMatch(/more than nothing/)
    expect(msg({ amount: '20000000' })).toMatch(/10 million/)
  })
})

describe('the other fields', () => {
  it('reads a promised day or a blank to clear it', () => {
    expect(parseExpectedForm(form({ expectedOn: '2026-12-05' }))).toEqual({ ok: true, value: { expectedOn: '2026-12-05' } })
    expect(parseExpectedForm(form({ expectedOn: '' }))).toEqual({ ok: true, value: { expectedOn: null } })
    expect(parseExpectedForm(form({ expectedOn: '2026-02-30' })).ok).toBe(false)
  })

  it('reads addresses split any way, and refuses one that is not an address', () => {
    expect(parseEmails('ap@acme.test, Buyer@Acme.test;finance@acme.test  ap@acme.test')).toEqual(['ap@acme.test', 'buyer@acme.test', 'finance@acme.test'])
    expect(parseEmails('')).toEqual([])
    expect(parseEmails('ap@acme.test, nobody')).toBeUndefined()
    expect(parseMoneyCents('$1,025.00')).toBe(102500)
  })
})

describe('a billing profile', () => {
  const ok = {
    billTo: 'Acme SA', currency: 'ZAR', fxRate: '18', issueDay: '15', dueRule: 'end_of_prev_month', sendMode: 'auto',
    'lines.0.description': 'Widget hosting', 'lines.0.unitUsd': '100', 'lines.0.qty': '1',
    'lines.1.description': 'Data feeds', 'lines.1.unitUsd': '30.50', 'lines.1.qty': '',
    'lines.2.description': '', 'lines.2.unitUsd': '', 'lines.2.qty': '1',
    emailTo: 'ap@acme.test', emailCc: 'buyer@acme.test', emailBcc: '', yourRef: 'John Smith', emailGreeting: 'Hi John',
    noteOnce: '', subjectLine: 'Monthly services', active: 'on', holdNext: 'on',
  }

  it('reads the editor', () => {
    const r = parseProfileForm(form(ok))
    expect(r).toEqual({
      ok: true,
      value: {
        active: true, billTo: 'Acme SA', currency: 'ZAR', fxRate: 18, subjectLine: 'Monthly services', issueDay: 15,
        dueRule: 'end_of_prev_month', sendMode: 'auto', holdNext: true,
        lines: [{ description: 'Widget hosting', unitUsd: 100, qty: 1 }, { description: 'Data feeds', unitUsd: 30.5, qty: 1 }],
        emailTo: ['ap@acme.test'], emailCc: ['buyer@acme.test'], emailBcc: [], yourRef: 'John Smith', emailGreeting: 'Hi John', noteOnce: null,
      },
    })
    expect(parseProfileForm(form({ ...ok, active: '', holdNext: '' }))).toMatchObject({ ok: true, value: { active: false, holdNext: false } })
  })

  it('refuses a profile that cannot invoice', () => {
    const msg = (o: Record<string, string>) => (parseProfileForm(form({ ...ok, ...o })) as { message?: string }).message
    expect(msg({ billTo: '' })).toMatch(/made out to/)
    expect(msg({ fxRate: '0' })).toMatch(/fixed rate/)
    expect(msg({ issueDay: '31' })).toMatch(/1 to 28/)
    expect(msg({ 'lines.0.description': '', 'lines.1.description': '' })).toMatch(/Line 1 has a price but no description/)
    expect(msg({ 'lines.0.unitUsd': 'free' })).toMatch(/line 1's price/)
    expect(msg({ 'lines.1.qty': '1.5' })).toMatch(/whole number/)
    expect(msg({ emailTo: '' })).toMatch(/at least one address/)
    expect(msg({ emailCc: 'not-an-address' })).toMatch(/not an email address/)
    expect(msg({ sendMode: 'sometimes' })).toMatch(/how it is sent/)
  })
})
