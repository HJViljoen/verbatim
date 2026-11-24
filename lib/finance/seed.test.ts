import { describe, expect, it } from 'vitest'
import { checkSeed, insertOrder, lit, seedSql, seedUploads, type Seed, type SeedInvoice } from './seed'

// The backfill's seed, checked and written as SQL. A made-up seed: the real
// one lives outside the repository.

const C = '00000000-0000-0000-0000-00000000c11e'
const line = (description: string, unit: number, qty = 1) => ({ description, qty, unit_price: unit, amount: unit * qty })
const usd = [line('Widget hosting', 80), line('Data feeds', 70)]
const zar = [line('Widget hosting', 1400), line('Data feeds', 1225)]
const inv = (o: Partial<SeedInvoice> & Pick<SeedInvoice, 'number'>): SeedInvoice => ({
  client_id: C, bill_to: 'Acme SA', period_label: 'September 2026', period_start: '2026-09-01', issued_on: '2026-09-02',
  currency: 'USD', lines: usd, total: 150, status: 'sent', ...o,
})

const SEED: Seed = {
  issuer: { name: 'Jane Doe', address_lines: ['1 Test Street'], email: 'jane@example.test', bank_lines: [{ label: 'Bank', value: "Example Bank's branch" }], email_from: 'Jane Doe <jane@verbatim.test>', reply_to: 'jane@example.test' },
  profiles: [{
    client_id: C, bill_to: 'Acme SA', currency: 'ZAR', fx_rate: 17.5, lines: [{ description: 'Widget hosting', unit_usd: 80, qty: 1 }],
    issue_day: 15, due_rule: 'end_of_prev_month', send_mode: 'auto', hold_next: true, email_to: ['ap@acme.test'], note_once: 'One line.',
  }],
  invoices: [
    // out of order on purpose: the replacement and the credit note before what they relate to
    inv({ number: '0003', currency: 'ZAR', lines: zar, total: 2625, issued_on: '2026-11-17', relates_to: '0002', pdf_file: 'Invoice-0003.pdf' }),
    inv({ number: 'CN-0001', relates_to: '0002', issued_on: '2026-11-17', pdf_file: 'CN-0001.pdf' }),
    inv({ number: '0002', status: 'credited', pdf_file: 'Invoice-0002.pdf' }),
    inv({ number: '0001', period_start: '2026-06-01', period_label: 'June 2026', issued_on: '2026-06-19' }),
  ],
  payments: [{ client_id: C, received_on: '2026-08-08', amount: 150, currency: 'USD', reference: 'INV-0001' }],
  counters: { invoice: 4, credit_note: 2 },
}

describe('the seed', () => {
  it('passes a seed that holds together', () => {
    expect(checkSeed(SEED)).toEqual([])
  })

  it('names what does not hold together', () => {
    const broken: Seed = {
      ...SEED,
      invoices: [
        inv({ number: '0002', status: 'sent', total: 140 }),
        inv({ number: 'CN-0001', relates_to: '0002' }),
        inv({ number: '0004', relates_to: '0099', period_start: '2026-09-15' }),
        inv({ number: '0005', period_start: '2026-10-01' }),
        inv({ number: '0006', period_start: '2026-10-01' }),
      ],
      counters: { invoice: 6, credit_note: 1 },
    }
    expect(checkSeed(broken)).toEqual([
      'invoice 0002: lines come to 150, total says 140',
      'invoice 0004: period_start is not a first of the month',
      'invoice 0006: a second live invoice for 2026-10-01',
      'invoice 0002: credit note CN-0001 cancels it, so its status must be credited',
      'credit note CN-0001: does not cancel 0002 in full',
      'invoice 0004: relates to 0099, which is not in the seed',
      'counters: next invoice 6 is not past 6',
      'counters: next credit note 1 is not past 1',
    ])
  })

  it('writes what relates to something after it', () => {
    expect(insertOrder(SEED.invoices).map((i) => i.number)).toEqual(['0002', '0003', 'CN-0001', '0001'])
  })

  it('writes one idempotent script that leaves rows already there alone', () => {
    const sql = seedSql(SEED)
    const lines = sql.trim().split('\n').slice(1)
    expect(lines).toHaveLength(1 + 1 + 4 + 1 + 1)
    expect(lines[0]).toMatch(/^insert into public\.fin_issuer .* on conflict \(id\) do nothing;$/)
    expect(lines[0]).toContain("'[{\"label\":\"Bank\",\"value\":\"Example Bank''s branch\"}]'::jsonb")
    expect(lines[1]).toMatch(/^insert into public\.fin_billing_profiles .* on conflict \(client_id\) do nothing;$/)
    expect(lines[1]).toContain("array['ap@acme.test']::text[]")
    for (const l of lines.slice(2, 6)) expect(l).toMatch(/^insert into public\.fin_invoices .* on conflict \(number\) do nothing;$/)
    expect(lines[3]).toContain("(select id from public.fin_invoices where number = '0002')")
    expect(lines[3]).toContain(`'${C}/0003.pdf'`)
    expect(lines[4]).toContain("'credit_note'")
    expect(lines[5]).toMatch(/'0001', 'invoice', .* null, 'sent', null, null, null\) on conflict/)
    expect(lines[6]).toMatch(/^insert into public\.fin_payments .* where not exists \(.*reference is not distinct from 'INV-0001'\);$/)
    expect(lines[7]).toBe("insert into public.fin_counters (kind, next_no) values ('invoice', 4), ('credit_note', 2) on conflict (kind) do update set next_no = greatest(public.fin_counters.next_no, excluded.next_no), updated_at = now();")
    expect(sql).not.toMatch(/\b(update public\.fin_invoices|delete|truncate|drop)\b/i)
  })

  it('files each PDF at the path its row points to', () => {
    expect(seedUploads(SEED)).toEqual([
      { number: '0003', file: 'Invoice-0003.pdf', path: `${C}/0003.pdf` },
      { number: 'CN-0001', file: 'CN-0001.pdf', path: `${C}/CN-0001.pdf` },
      { number: '0002', file: 'Invoice-0002.pdf', path: `${C}/0002.pdf` },
    ])
  })

  it('quotes a literal safely', () => {
    expect(lit("O'Brien'); drop table x; --")).toBe("'O''Brien''); drop table x; --'")
    expect(lit(null)).toBe('null')
    expect(lit(17.5)).toBe('17.5')
    expect(() => lit(Number.NaN)).toThrow()
  })
})
