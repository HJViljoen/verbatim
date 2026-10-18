import { describe, expect, it } from 'vitest'
import { NOTE_MAX, parseEntryForm } from './forms'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const TODAY = '2026-10-18'
const ENTRY = { kind: 'repaid', occurredOn: '2026-10-01', amount: '500', note: '' }
const message = (fields: Record<string, string>) => {
  const r = parseEntryForm(form(fields), TODAY)
  return r.ok ? null : r.message
}

describe('an entry form', () => {
  it('reads a whole entry, the note trimmed and a blank note null', () => {
    const r = parseEntryForm(form({ ...ENTRY, kind: 'borrowed', amount: 'R1 250,50', note: '  test note  ' }), TODAY)
    expect(r).toEqual({ ok: true, value: { kind: 'borrowed', occurredOn: '2026-10-01', amountCents: 125_050, note: 'test note' } })
    const blank = parseEntryForm(form({ ...ENTRY, note: '   ' }), TODAY)
    expect(blank.ok && blank.value.note).toBeNull()
  })

  it('takes today, and nothing after it', () => {
    expect(parseEntryForm(form({ ...ENTRY, occurredOn: TODAY }), TODAY).ok).toBe(true)
    expect(message({ ...ENTRY, occurredOn: '2026-10-19' })).toMatch(/future/)
  })

  it('needs a kind the table holds', () => {
    expect(message({ ...ENTRY, kind: '' })).toMatch(/Borrowed or Paid back/)
    expect(message({ ...ENTRY, kind: 'gift' })).toMatch(/Borrowed or Paid back/)
  })

  it('needs a real date, not too far back', () => {
    expect(message({ ...ENTRY, occurredOn: '' })).toMatch(/Give the date/)
    expect(message({ ...ENTRY, occurredOn: '2026-02-30' })).toMatch(/not a date/)
    expect(message({ ...ENTRY, occurredOn: '18/10/2026' })).toMatch(/not a date/)
    expect(message({ ...ENTRY, occurredOn: '0026-10-01' })).toMatch(/not a date/)
  })

  it('needs an amount above zero that reads as rand and cents', () => {
    expect(message({ ...ENTRY, amount: '' })).toMatch(/Give the amount/)
    expect(message({ ...ENTRY, amount: 'five hundred' })).toMatch(/rand and cents/)
    expect(message({ ...ENTRY, amount: '12.345' })).toMatch(/rand and cents/)
    expect(message({ ...ENTRY, amount: '-500' })).toMatch(/rand and cents/)
    expect(message({ ...ENTRY, amount: '0' })).toMatch(/more than R0/)
    expect(message({ ...ENTRY, amount: '0,00' })).toMatch(/more than R0/)
    expect(message({ ...ENTRY, amount: '10000000.01' })).toMatch(/more than R10,000,000/)
    expect(parseEntryForm(form({ ...ENTRY, amount: '10000000' }), TODAY).ok).toBe(true)
    expect(parseEntryForm(form({ ...ENTRY, amount: '0.01' }), TODAY).ok).toBe(true)
  })

  it('cuts a long note at its limit', () => {
    const r = parseEntryForm(form({ ...ENTRY, note: 'x'.repeat(NOTE_MAX + 50) }), TODAY)
    expect(r.ok && r.value.note?.length).toBe(NOTE_MAX)
  })
})
