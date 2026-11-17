import { day, text, type FormLike, type Parsed } from '@/lib/costs/forms'
import { parseRandCents } from '@/lib/family-loan/money'
import {
  DUE_RULES, FIN_CURRENCIES, SEND_MODES,
  type BillingProfile, type DueRule, type FinCurrency, type ProfileLine, type SendMode,
} from './types'

// What the Money in forms post, read and checked before anything is written
// (lib/finance/forms.test.ts). Every enum is the migration's CHECK and every
// amount its `> 0`, so a value that passes here is one the database takes.
// Pure.

export interface PaymentFields {
  clientId: string
  receivedOn: string
  amount: number
  currency: FinCurrency
  reference: string | null
  note: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/

/** The largest single payment the form takes: R10 million. */
export const MAX_PAYMENT_CENTS = 10_000_000 * 100

/** A typed amount in cents: "R29 520", "29,520.00", "$205" → cents; blank
 *  null; unreadable undefined. The rand reader (lib/family-loan/money.ts),
 *  with a leading dollar sign taken off too. */
export function parseMoneyCents(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().replace(/^\$ ?/, '')
  return parseRandCents(s)
}

/** A payment as Heinrich records it from the bank statement. */
export function parsePaymentForm(f: FormLike, today: string): Parsed<PaymentFields> {
  const clientId = String(f.get('clientId') ?? '').trim()
  if (!UUID.test(clientId)) return { ok: false, message: 'Pick who paid.' }
  const receivedOn = day(f, 'receivedOn')
  if (receivedOn === null) return { ok: false, message: 'Give the day it came in.' }
  if (receivedOn === undefined || receivedOn < '2020-01-01') return { ok: false, message: 'The date is not a date.' }
  if (receivedOn > today) return { ok: false, message: 'The date is in the future. Record it on the day it arrives.' }
  const currency = String(f.get('currency') ?? '')
  if (!(FIN_CURRENCIES as readonly string[]).includes(currency)) return { ok: false, message: 'Pick the currency it came in.' }
  const cents = parseMoneyCents(f.get('amount'))
  if (cents === null) return { ok: false, message: 'Give the amount.' }
  if (cents === undefined) return { ok: false, message: 'The amount must be a number with cents, like 29520 or 3690.00.' }
  if (cents <= 0) return { ok: false, message: 'The amount must be more than nothing.' }
  if (cents > MAX_PAYMENT_CENTS) return { ok: false, message: 'That is more than 10 million. Check the amount.' }
  return {
    ok: true,
    value: { clientId, receivedOn, amount: cents / 100, currency: currency as FinCurrency, reference: text(f, 'reference', 200), note: text(f, 'note', 500) },
  }
}

/** The day the client's accounts team said it would pay: a day, or blank to clear. */
export function parseExpectedForm(f: FormLike): Parsed<{ expectedOn: string | null }> {
  const d = day(f, 'expectedOn')
  if (d === undefined) return { ok: false, message: 'The date is not a date.' }
  return { ok: true, value: { expectedOn: d } }
}

/** Addresses typed with commas, semicolons or spaces between them. */
export function parseEmails(raw: unknown): string[] | undefined {
  const list = String(raw ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  return list.every((e) => EMAIL.test(e)) ? [...new Set(list.map((e) => e.toLowerCase()))] : undefined
}

/** The profile's lines: rows `lines.<n>.description|unitUsd|qty`, a row with
 *  no description dropped. */
function parseLines(f: FormLike, max = 12): ProfileLine[] | string {
  const out: ProfileLine[] = []
  for (let n = 0; n < max; n++) {
    const description = text(f, `lines.${n}.description`, 200)
    const rawUnit = String(f.get(`lines.${n}.unitUsd`) ?? '').trim()
    const rawQty = String(f.get(`lines.${n}.qty`) ?? '').trim()
    if (!description) {
      if (rawUnit || (rawQty && rawQty !== '1')) return `Line ${n + 1} has a price but no description.`
      continue
    }
    const cents = parseMoneyCents(rawUnit)
    if (cents === null || cents === undefined || cents <= 0) return `Give line ${n + 1}'s price in dollars, like 100 or 25.50.`
    const qty = rawQty === '' ? 1 : Number(rawQty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 120) return `Line ${n + 1}'s quantity must be a whole number from 1.`
    out.push({ description, unitUsd: cents / 100, qty })
  }
  return out
}

export type ProfileFields = Omit<BillingProfile, 'id' | 'clientId'>

/** The billing profile editor. */
export function parseProfileForm(f: FormLike): Parsed<ProfileFields> {
  const billTo = text(f, 'billTo', 200)
  if (!billTo) return { ok: false, message: 'Say who the invoice is made out to.' }
  const currency = String(f.get('currency') ?? '')
  if (!(FIN_CURRENCIES as readonly string[]).includes(currency)) return { ok: false, message: 'Pick the currency it is invoiced in.' }
  const fxRate = Number(String(f.get('fxRate') ?? '').trim().replace(/^R ?/i, '').replace(',', '.'))
  if (!Number.isFinite(fxRate) || fxRate <= 0 || fxRate >= 1000) return { ok: false, message: 'Give the fixed rate in rand per dollar, like 18.' }
  const lines = parseLines(f)
  if (typeof lines === 'string') return { ok: false, message: lines }
  if (lines.length === 0) return { ok: false, message: 'Add at least one line.' }
  const issueDay = Number(String(f.get('issueDay') ?? '').trim())
  if (!Number.isInteger(issueDay) || issueDay < 1 || issueDay > 28) return { ok: false, message: 'The issue day must be from 1 to 28.' }
  const dueRule = String(f.get('dueRule') ?? '')
  if (!(DUE_RULES as readonly string[]).includes(dueRule)) return { ok: false, message: 'Pick when it is due.' }
  const sendMode = String(f.get('sendMode') ?? '')
  if (!(SEND_MODES as readonly string[]).includes(sendMode)) return { ok: false, message: 'Pick how it is sent.' }
  const emailTo = parseEmails(f.get('emailTo'))
  const emailCc = parseEmails(f.get('emailCc'))
  const emailBcc = parseEmails(f.get('emailBcc'))
  if (!emailTo || !emailCc || !emailBcc) return { ok: false, message: 'One of the addresses is not an email address.' }
  if (emailTo.length === 0) return { ok: false, message: 'Give at least one address to send it to.' }
  const flag = (k: string) => ['on', 'true', '1'].includes(String(f.get(k) ?? ''))
  return {
    ok: true,
    value: {
      active: flag('active'),
      billTo,
      currency: currency as FinCurrency,
      fxRate: Math.round(fxRate * 10000) / 10000,
      lines,
      subjectLine: text(f, 'subjectLine', 300) ?? '',
      issueDay,
      dueRule: dueRule as DueRule,
      sendMode: sendMode as SendMode,
      holdNext: flag('holdNext'),
      emailTo,
      emailCc,
      emailBcc,
      yourRef: text(f, 'yourRef', 200),
      emailGreeting: text(f, 'emailGreeting', 200),
      noteOnce: text(f, 'noteOnce', 1000),
    },
  }
}
