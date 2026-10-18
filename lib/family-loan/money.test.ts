import { describe, expect, it } from 'vitest'
import { centsOf, parseRandCents, randFormatter, typedAmount } from './money'

describe('reading a typed amount', () => {
  it('reads plain rand, the app\'s own style and the South African one', () => {
    expect(parseRandCents('2500')).toBe(250_000)
    expect(parseRandCents('R2 500')).toBe(250_000)
    expect(parseRandCents('r 2 500')).toBe(250_000)
    expect(parseRandCents('2,500')).toBe(250_000)
    expect(parseRandCents('R2,500.00')).toBe(250_000)
    expect(parseRandCents('1,000,000')).toBe(100_000_000)
    expect(parseRandCents('R12\u00A0345,67')).toBe(1_234_567)
  })

  it('takes a comma or a point before one or two digits as the decimal mark', () => {
    expect(parseRandCents('1250.50')).toBe(125_050)
    expect(parseRandCents('1250,50')).toBe(125_050)
    expect(parseRandCents('1 250,5')).toBe(125_050)
    expect(parseRandCents('1,250.50')).toBe(125_050)
    expect(parseRandCents('0.29')).toBe(29)
    expect(parseRandCents('.50')).toBe(50)
    expect(parseRandCents('1,25')).toBe(125)
  })

  it('reads blank as nothing', () => {
    expect(parseRandCents('')).toBeNull()
    expect(parseRandCents('   ')).toBeNull()
    expect(parseRandCents(null)).toBeNull()
    expect(parseRandCents(undefined)).toBeNull()
  })

  it('refuses what it cannot read for certain: more than two decimals, a point before three digits, a sign, letters, loose separators', () => {
    for (const bad of ['1250.505', '1.250', '1.250,50', '1,250,50', '12,50,000', '-500', '+500', '5e3', 'abc', 'R', ',', '2500.', '1 2,3,4']) {
      expect(parseRandCents(bad), bad).toBeUndefined()
    }
  })

  it('refuses a space or comma that is not a thousands separator, rather than read a different amount', () => {
    // Each of these once stored a different figure: "12 50" R1,250, "5 00"
    // R500, "0,500" R500, "1 2 3" R123.
    for (const bad of ['12 50', '5 00', '2 50,00', '1 2 3', '1 2500', '0 500', '0,500', '01,000', '1,250 000', '1 250,000']) {
      expect(parseRandCents(bad), bad).toBeUndefined()
    }
  })

  it('still reads real spacing: groups of three, no-break and repeated spaces, a space after the R', () => {
    expect(parseRandCents('1 000 000')).toBe(100_000_000)
    expect(parseRandCents('2  500')).toBe(250_000)
    expect(parseRandCents('2 500,00')).toBe(250_000)
    expect(parseRandCents(' R 2 500 ')).toBe(250_000)
    expect(parseRandCents('1 250.50')).toBe(125_050)
    expect(parseRandCents('0,50')).toBe(50)
    expect(parseRandCents('0500')).toBe(50_000)
  })

  it('refuses a number too long to hold in cents exactly', () => {
    expect(parseRandCents('99999999999999999999')).toBeUndefined()
  })

  it('reads zero as zero, for the form to refuse', () => {
    expect(parseRandCents('0')).toBe(0)
    expect(parseRandCents('R0,00')).toBe(0)
  })
})

describe('cents', () => {
  it('reads a stored numeric without float drift', () => {
    expect(centsOf(1250.1)).toBe(125_010)
    expect(centsOf('1250.10')).toBe(125_010)
    expect(centsOf(0.29)).toBe(29)
    expect(centsOf(1000)).toBe(100_000)
  })

  it('shows an amount as the edit form types it, and reads it back the same', () => {
    expect(typedAmount(500_000)).toBe('5000')
    expect(typedAmount(125_050)).toBe('1250.50')
    expect(typedAmount(29)).toBe('0.29')
    for (const c of [500_000, 125_050, 29, 1, 999_999_999]) expect(parseRandCents(typedAmount(c))).toBe(c)
  })
})

describe('printing rand for a page', () => {
  it('prints whole rand while every figure is whole', () => {
    const fmt = randFormatter([500_000, 100_000])
    expect(fmt(500_000)).toBe('R5,000')
    expect(fmt(0)).toBe('R0')
    expect(fmt(-25_000)).toBe('−R250')
  })

  it('prints cents everywhere once one figure has them', () => {
    const fmt = randFormatter([500_000, 125_050])
    expect(fmt(500_000)).toBe('R5,000.00')
    expect(fmt(125_050)).toBe('R1,250.50')
  })
})
