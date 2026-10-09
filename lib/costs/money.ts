import type { Currency } from './types'

// Money on the Costs page: rand first, dollars alongside (Heinrich, 9 Oct).
//
// Formatted by hand, like lib/format.ts and for the same reason: Intl reads
// ICU data that differs between the server and the browser. Pure.

export interface Rates {
  /** Rand per US dollar. */
  usdZar: number
  /** Rand per euro. */
  eurZar: number
}

/** An amount in its own currency, in rand. */
export function toZar(amount: number, currency: Currency, rates: Rates): number {
  if (currency === 'ZAR') return amount
  return amount * (currency === 'USD' ? rates.usdZar : rates.eurZar)
}

/** An amount in its own currency, in dollars. */
export function toUsd(amount: number, currency: Currency, rates: Rates): number {
  if (currency === 'USD') return amount
  return toZar(amount, currency, rates) / rates.usdZar
}

const MINUS = '−'

function grouped(whole: number): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 2623.4 → "R2,623"; whole rand, a real minus sign below zero. */
export function fmtZar(n: number): string {
  const r = Math.round(n)
  return `${r < 0 ? MINUS : ''}R${grouped(Math.abs(r))}`
}

/** 72.37 → "$72.37"; 1025 → "$1,025". Cents below a thousand dollars, where
 *  they still say something. */
export function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 && Math.round(abs * 100) > 0 ? MINUS : ''
  if (abs >= 1000) return `${sign}$${grouped(Math.round(abs))}`
  const cents = Math.round(abs * 100)
  return `${sign}$${grouped(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
}

const SYMBOL: Record<Currency, string> = { ZAR: 'R', USD: '$', EUR: '€' }

/** An amount as it is billed: "R848.70", "$72.37", "€14.00". */
export function fmtNative(n: number, currency: Currency): string {
  const cents = Math.round(Math.abs(n) * 100)
  return `${n < 0 && cents > 0 ? MINUS : ''}${SYMBOL[currency]}${grouped(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
}

/** Rand first, dollars alongside: "R2,623 · $157.84". */
export function fmtZarUsd(zar: number, rates: Rates): string {
  return `${fmtZar(zar)} · ${fmtUsd(zar / rates.usdZar)}`
}

/**
 * A number typed into a form: "R3,500", "1 025.00", "$72.37" → a number;
 * blank → null. Anything that is not a plain non-negative number after the
 * symbols and separators come off is NaN, which the form refuses.
 */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (s === '') return null
  const cleaned = s.replace(/[R$€\s,]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN
  return Number(cleaned)
}
