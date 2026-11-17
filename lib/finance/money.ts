import { fmtNative } from '@/lib/costs/money'
import type { BillingProfile, FinCurrency, InvoiceLine } from './types'

// Money on an invoice. Every sum is taken in whole cents, so a month's lines
// add up to the printed total to the cent and a ledger never drifts. The
// printed form is the Costs page's own (`fmtNative`: "R1,234.00", "$56.78",
// a real minus below zero). Pure.

/** A stored amount (numeric(12,2), as PostgREST hands it over) in cents. */
export function centsOf(amount: unknown): number {
  return Math.round(Number(amount) * 100)
}

/** "R1,234.00", "$56.78", "−$56.78". */
export function fmtMoney(amount: number, currency: FinCurrency): string {
  return fmtNative(amount, currency)
}

/** 1234 → "1,234.00": a dollar figure inside a sentence. */
function plain(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100)
  return `${Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(cents % 100).padStart(2, '0')}`
}

export interface PricedMonth {
  lines: InvoiceLine[]
  /** The invoice's total in its own currency. */
  total: number
  /** What the lines come to in dollars, before any conversion. */
  totalUsd: number
  /** The conversion sentence the invoice prints, or null for a dollar invoice. */
  fxNote: string | null
}

/**
 * A month's lines in the profile's currency. A rand invoice converts each
 * dollar price at the profile's FIXED rate (the agreed rate, never the live
 * one), rounded to the cent per unit, and each line is that unit price times
 * its quantity, so the printed unit price times the quantity is the printed
 * amount exactly.
 */
export function priceMonth(profile: Pick<BillingProfile, 'lines' | 'currency' | 'fxRate'>): PricedMonth {
  const rate = profile.currency === 'ZAR' ? profile.fxRate : 1
  let totalCents = 0
  let usdCents = 0
  const lines = profile.lines.map((l): InvoiceLine => {
    const unitCents = Math.round(l.unitUsd * rate * 100)
    const amountCents = unitCents * l.qty
    totalCents += amountCents
    usdCents += Math.round(l.unitUsd * 100) * l.qty
    return { description: l.description, qty: l.qty, unit: 'month', unitPrice: unitCents / 100, amount: amountCents / 100 }
  })
  return {
    lines,
    total: totalCents / 100,
    totalUsd: usdCents / 100,
    fxNote: profile.currency === 'ZAR' ? fxNote(usdCents / 100, profile.fxRate) : null,
  }
}

/** "Converted from USD 100.00 at a fixed rate of R17.50 / USD 1.00." */
export function fxNote(totalUsd: number, rate: number): string {
  return `Converted from USD ${plain(totalUsd)} at a fixed rate of R${plain(rate)} / USD 1.00.`
}

/** The sentence every invoice's footnote opens with. */
export function currencySentence(currency: FinCurrency): string {
  return currency === 'ZAR'
    ? 'All amounts in South African Rand (ZAR). VAT: not applicable.'
    : 'All amounts in US Dollars (USD). VAT: not applicable.'
}

/** The footnote a month billed in advance carries. */
export const IN_ADVANCE_NOTE =
  'Billed monthly in advance: payment is due by the last day of the month before the billing period.'

/** The sum of a set of amounts, taken in cents. */
export function sumMoney(amounts: readonly number[]): number {
  return amounts.reduce((s, a) => s + centsOf(a), 0) / 100
}
