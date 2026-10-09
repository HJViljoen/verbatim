import { describe, expect, it } from 'vitest'
import { fmtNative, fmtUsd, fmtZar, fmtZarUsd, parseAmount, toUsd, toZar } from './money'

const R = { usdZar: 16.62, eurZar: 18.63 }

describe('converting', () => {
  it('turns dollars and euros into rand at the set rates', () => {
    expect(toZar(205, 'USD', R)).toBeCloseTo(3407.1, 10)
    expect(toZar(14, 'EUR', R)).toBeCloseTo(260.82, 10)
    expect(toZar(3500, 'ZAR', R)).toBe(3500)
  })

  it('turns rand and euros into dollars', () => {
    expect(toUsd(3500, 'ZAR', R)).toBeCloseTo(3500 / 16.62, 10)
    expect(toUsd(14, 'EUR', R)).toBeCloseTo((14 * 18.63) / 16.62, 10)
    expect(toUsd(72.37, 'USD', R)).toBe(72.37)
  })
})

describe('printing money', () => {
  it('prints rand whole, grouped, with a real minus', () => {
    expect(fmtZar(2622.98)).toBe('R2,623')
    expect(fmtZar(35.36)).toBe('R35')
    expect(fmtZar(-1771.4)).toBe('−R1,771')
    expect(fmtZar(0)).toBe('R0')
  })

  it('prints dollars with cents below a thousand and whole above', () => {
    expect(fmtUsd(72.37)).toBe('$72.37')
    expect(fmtUsd(11.3)).toBe('$11.30')
    expect(fmtUsd(1025)).toBe('$1,025')
    expect(fmtUsd(-6.5)).toBe('−$6.50')
    expect(fmtUsd(-0.001)).toBe('$0.00')
  })

  it('prints an amount in its own currency', () => {
    expect(fmtNative(848.7, 'ZAR')).toBe('R848.70')
    expect(fmtNative(14, 'EUR')).toBe('€14.00')
    expect(fmtNative(1025, 'USD')).toBe('$1,025.00')
  })

  it('puts the rand first and the dollars alongside', () => {
    expect(fmtZarUsd(3407.1, R)).toBe('R3,407 · $205.00')
  })
})

describe('reading a typed amount', () => {
  it('takes symbols, spaces and thousands separators off', () => {
    expect(parseAmount('R3,500')).toBe(3500)
    expect(parseAmount('$72.37')).toBe(72.37)
    expect(parseAmount(' 1 025.00 ')).toBe(1025)
    expect(parseAmount('€14')).toBe(14)
  })

  it('reads blank as nothing and anything else as not a number', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount(null)).toBeNull()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('-5')).toBeNaN()
    expect(parseAmount('1.2.3')).toBeNaN()
  })
})
