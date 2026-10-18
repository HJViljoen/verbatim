import { fmtNative, fmtZar } from '@/lib/costs/money'

// Rand on the loan page: the Costs page's own formatters (lib/costs/money.ts,
// "R2,623" whole and "R848.70" with cents), held in whole cents here so a
// running balance never drifts. Pure.

/** A stored amount (numeric(12,2), as PostgREST hands it over) in cents. */
export function centsOf(amount: unknown): number {
  return Math.round(Number(amount) * 100)
}

/** Cents as the number the database stores: 125050 → 1250.5. */
export function randOf(cents: number): number {
  return cents / 100
}

/**
 * One formatter for a whole page: whole rand ("R5,000") while every figure on
 * it is whole, rand and cents ("R5,000.00", "R1,250.50") as soon as one is
 * not, so a column never mixes the two. Below zero prints a real minus.
 */
export function randFormatter(cents: readonly number[]): (cents: number) => string {
  const whole = cents.every((c) => c % 100 === 0)
  return whole ? (c) => fmtZar(c / 100) : (c) => fmtNative(c / 100, 'ZAR')
}

/** Cents as an edit form shows them, which parseRandCents reads back:
 *  500000 → "5000", 125050 → "1250.50". */
export function typedAmount(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

/** The largest amount one entry may hold: R10 million. */
export const MAX_ENTRY_CENTS = 10_000_000 * 100

/**
 * A typed amount in cents: null when blank, undefined when it cannot be read
 * as rand and cents. Takes what a person types in South Africa as well as the
 * app's own style:
 *   "2500", "R2 500", "2,500", "R2,500.00"      → 250000
 *   "1250.50", "1250,50", "1 250,5", ".50"      → 125050, 125050, 125050, 50
 * A comma or a point followed by one or two digits at the end is the decimal
 * mark; a comma followed by three is a thousands separator, and so is a
 * space. A point followed by three digits ("1.250") could be either, so it is
 * refused, as is anything past two decimals, a sign, or a letter.
 */
export function parseRandCents(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null
  let s = String(raw).trim()
  if (s === '') return null
  // \s takes the no-break spaces a pasted or formatted figure carries too.
  s = s.replace(/^R/i, '').replace(/\s/g, '')
  if (s === '') return undefined
  const decimal = /^(.*?)([.,])(\d{1,2})$/.exec(s)
  let whole = decimal ? decimal[1] : s
  const frac = decimal ? decimal[3] : ''
  if (whole === '' && decimal) whole = '0'
  if (!/^\d+$/.test(whole)) {
    // Commas as thousands separators, in threes, and never beside a decimal
    // comma ("1,250,50" is not a number).
    if (decimal?.[2] === ',' || !/^\d{1,3}(,\d{3})+$/.test(whole)) return undefined
    whole = whole.replace(/,/g, '')
  }
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : undefined
}
