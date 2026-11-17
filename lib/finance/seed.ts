import { pdfStoragePath } from './html'
import { centsOf } from './money'
import { DUE_RULES, FIN_CURRENCIES, INVOICE_STATUSES, SEND_MODES } from './types'

// The backfill's seed (scripts/finance-backfill.ts): the issuer, the billing
// profiles, the invoices and credit notes made by hand, the payments and the
// counters, read from a JSON file that lives OUTSIDE the repository (the
// repository is public; the seed holds names, addresses, bank lines and
// amounts). This module checks it and turns it into one idempotent SQL
// script. Pure: no file, no database.
//
// RE-RUNNABLE AND NEVER DESTRUCTIVE. Each row is keyed (the issuer's one row,
// a profile's client, an invoice's number, a payment's day, amount, currency
// and reference) and a row already there is LEFT ALONE: a re-run never
// resets what the page or the daily job changed since (a cleared hold, a
// cleared one-off note, a sent status). Counters only ever move forward.

export interface SeedLine { description: string; qty: number; unit?: string; unit_price: number; amount: number }

export interface SeedInvoice {
  number: string
  kind?: 'invoice' | 'credit_note'
  client_id: string
  bill_to: string
  subject_line?: string
  your_ref?: string | null
  period_label: string
  period_start?: string | null
  issued_on: string
  due_on?: string | null
  currency: 'ZAR' | 'USD'
  fx_note?: string | null
  lines: SeedLine[]
  total: number
  /** The number of the invoice it cancels (a credit note) or replaces. */
  relates_to?: string | null
  status: (typeof INVOICE_STATUSES)[number]
  sent_at?: string | null
  note?: string | null
  /** The PDF already sent, a file name inside the PDF folder. */
  pdf_file?: string | null
}

export interface Seed {
  issuer: {
    name: string
    address_lines: string[]
    email?: string | null
    bank_lines: { label: string; value: string }[]
    email_from?: string | null
    reply_to?: string | null
  }
  profiles: {
    client_id: string
    active?: boolean
    bill_to: string
    currency: 'ZAR' | 'USD'
    fx_rate: number
    lines: { description: string; unit_usd: number; qty: number }[]
    subject_line?: string
    issue_day: number
    due_rule: (typeof DUE_RULES)[number]
    send_mode: (typeof SEND_MODES)[number]
    hold_next: boolean
    email_to: string[]
    email_cc?: string[]
    email_bcc?: string[]
    your_ref?: string | null
    email_greeting?: string | null
    note_once?: string | null
  }[]
  invoices: SeedInvoice[]
  payments: { client_id: string; received_on: string; amount: number; currency: 'ZAR' | 'USD'; reference?: string | null; note?: string | null }[]
  counters: { invoice: number; credit_note: number }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const kindOf = (i: SeedInvoice) => i.kind ?? (i.number.startsWith('CN-') ? 'credit_note' : 'invoice')

/** Every problem with a seed, in words; an empty list is a seed to write. */
export function checkSeed(seed: Seed): string[] {
  const bad: string[] = []
  if (!seed.issuer?.name?.trim()) bad.push('issuer: no name')
  if (!Array.isArray(seed.issuer?.bank_lines) || seed.issuer.bank_lines.length === 0) bad.push('issuer: no bank lines')
  for (const p of seed.profiles ?? []) {
    const at = `profile ${p.client_id}`
    if (!UUID.test(p.client_id)) bad.push(`${at}: client_id is not a uuid`)
    if (!(FIN_CURRENCIES as readonly string[]).includes(p.currency)) bad.push(`${at}: currency`)
    if (!(p.fx_rate > 0)) bad.push(`${at}: fx_rate`)
    if (!Number.isInteger(p.issue_day) || p.issue_day < 1 || p.issue_day > 28) bad.push(`${at}: issue_day`)
    if (!(DUE_RULES as readonly string[]).includes(p.due_rule)) bad.push(`${at}: due_rule`)
    if (!(SEND_MODES as readonly string[]).includes(p.send_mode)) bad.push(`${at}: send_mode`)
    if (!p.lines?.length) bad.push(`${at}: no lines`)
    if (!p.email_to?.length) bad.push(`${at}: no email_to`)
  }
  const numbers = new Set<string>()
  const months = new Set<string>()
  for (const i of seed.invoices ?? []) {
    const at = `invoice ${i.number}`
    const kind = kindOf(i)
    if (numbers.has(i.number)) bad.push(`${at}: number twice`)
    numbers.add(i.number)
    if (!/^(CN-)?\d{4,}$/.test(i.number) || (kind === 'credit_note') !== i.number.startsWith('CN-')) bad.push(`${at}: number does not fit its kind`)
    if (!UUID.test(i.client_id)) bad.push(`${at}: client_id is not a uuid`)
    if (!DAY.test(i.issued_on)) bad.push(`${at}: issued_on`)
    if (i.due_on && (!DAY.test(i.due_on) || i.due_on < i.issued_on)) bad.push(`${at}: due_on`)
    if (i.period_start && (!DAY.test(i.period_start) || !i.period_start.endsWith('-01'))) bad.push(`${at}: period_start is not a first of the month`)
    if (!(FIN_CURRENCIES as readonly string[]).includes(i.currency)) bad.push(`${at}: currency`)
    if (!(INVOICE_STATUSES as readonly string[]).includes(i.status)) bad.push(`${at}: status`)
    const lineCents = i.lines.reduce((s, l) => s + centsOf(l.amount), 0)
    if (lineCents !== centsOf(i.total)) bad.push(`${at}: lines come to ${lineCents / 100}, total says ${i.total}`)
    for (const l of i.lines) if (centsOf(l.unit_price) * l.qty !== centsOf(l.amount)) bad.push(`${at}: "${l.description}" ${l.qty} × ${l.unit_price} is not ${l.amount}`)
    if (kind === 'credit_note' && !i.relates_to) bad.push(`${at}: a credit note must name the invoice it cancels`)
    if (kind === 'invoice' && i.period_start && i.status !== 'credited' && i.status !== 'void') {
      const key = `${i.client_id}|${i.period_start}`
      if (months.has(key)) bad.push(`${at}: a second live invoice for ${i.period_start}`)
      months.add(key)
    }
  }
  const byNumber = new Map((seed.invoices ?? []).map((i) => [i.number, i]))
  for (const i of seed.invoices ?? []) {
    if (!i.relates_to) continue
    const r = byNumber.get(i.relates_to)
    if (!r) { bad.push(`invoice ${i.number}: relates to ${i.relates_to}, which is not in the seed`); continue }
    if (kindOf(i) === 'credit_note') {
      if (r.status !== 'credited') bad.push(`invoice ${r.number}: credit note ${i.number} cancels it, so its status must be credited`)
      if (centsOf(r.total) !== centsOf(i.total) || r.currency !== i.currency) bad.push(`credit note ${i.number}: does not cancel ${r.number} in full`)
    }
  }
  const top = (prefix: 'CN-' | '') => Math.max(0, ...[...numbers].filter((n) => (prefix ? n.startsWith('CN-') : !n.startsWith('CN-'))).map((n) => Number(n.replace('CN-', ''))))
  if (!(seed.counters?.invoice > top(''))) bad.push(`counters: next invoice ${seed.counters?.invoice} is not past ${top('')}`)
  if (!(seed.counters?.credit_note > top('CN-'))) bad.push(`counters: next credit note ${seed.counters?.credit_note} is not past ${top('CN-')}`)
  for (const p of seed.payments ?? []) {
    if (!UUID.test(p.client_id) || !DAY.test(p.received_on) || !(p.amount > 0) || !(FIN_CURRENCIES as readonly string[]).includes(p.currency)) {
      bad.push(`payment ${p.received_on} ${p.amount}: not a payment`)
    }
  }
  return bad
}

/** A SQL literal: text quoted with '' doubled, null, numbers, booleans. */
export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`not a number: ${v}`)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

const textArray = (a: readonly string[] | undefined) => `array[${(a ?? []).map(lit).join(', ')}]::text[]`
const jsonb = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`

/** Invoices in an order a relates_to always finds its target already in. */
export function insertOrder(invoices: readonly SeedInvoice[]): SeedInvoice[] {
  const left = [...invoices]
  const done = new Set<string>()
  const out: SeedInvoice[] = []
  while (left.length) {
    const i = left.findIndex((x) => !x.relates_to || done.has(x.relates_to) || !left.some((y) => y.number === x.relates_to))
    if (i < 0) throw new Error('seed: relates_to goes round in a circle')
    const [x] = left.splice(i, 1)
    out.push(x)
    done.add(x.number)
  }
  return out
}

/** The whole seed as one SQL script, for psql --single-transaction. */
export function seedSql(seed: Seed): string {
  const s = seed.issuer
  const out: string[] = [
    '-- finance backfill: generated by scripts/finance-backfill.ts; rows already there are left alone',
    `insert into public.fin_issuer (id, name, address_lines, email, bank_lines, email_from, reply_to) values (true, ${lit(s.name)}, ${textArray(s.address_lines)}, ${lit(s.email)}, ${jsonb(s.bank_lines)}, ${lit(s.email_from)}, ${lit(s.reply_to)}) on conflict (id) do nothing;`,
  ]
  for (const p of seed.profiles) {
    out.push(`insert into public.fin_billing_profiles (client_id, active, bill_to, currency, fx_rate, lines, subject_line, issue_day, due_rule, send_mode, hold_next, email_to, email_cc, email_bcc, your_ref, email_greeting, note_once) values (${[
      lit(p.client_id), lit(p.active ?? true), lit(p.bill_to), lit(p.currency), lit(p.fx_rate), jsonb(p.lines), lit(p.subject_line ?? ''), lit(p.issue_day),
      lit(p.due_rule), lit(p.send_mode), lit(p.hold_next), textArray(p.email_to), textArray(p.email_cc), textArray(p.email_bcc), lit(p.your_ref),
      lit(p.email_greeting), lit(p.note_once),
    ].join(', ')}) on conflict (client_id) do nothing;`)
  }
  for (const i of insertOrder(seed.invoices)) {
    const kind = kindOf(i)
    const relates = i.relates_to ? `(select id from public.fin_invoices where number = ${lit(i.relates_to)})` : 'null'
    out.push(`insert into public.fin_invoices (number, kind, client_id, bill_to, subject_line, your_ref, period_label, period_start, issued_on, due_on, currency, fx_note, lines, total, relates_to, status, sent_at, pdf_path, note) values (${[
      lit(i.number), lit(kind), lit(i.client_id), lit(i.bill_to), lit(i.subject_line ?? ''), lit(i.your_ref), lit(i.period_label),
      i.period_start ? `${lit(i.period_start)}::date` : 'null', `${lit(i.issued_on)}::date`, i.due_on ? `${lit(i.due_on)}::date` : 'null',
      lit(i.currency), lit(i.fx_note), jsonb(i.lines.map((l) => ({ description: l.description, qty: l.qty, unit: l.unit ?? 'month', unit_price: l.unit_price, amount: l.amount }))),
      lit(i.total), relates, lit(i.status), i.sent_at ? `${lit(i.sent_at)}::timestamptz` : 'null',
      i.pdf_file ? lit(pdfStoragePath({ clientId: i.client_id, number: i.number })) : 'null', lit(i.note),
    ].join(', ')}) on conflict (number) do nothing;`)
  }
  for (const p of seed.payments) {
    out.push(`insert into public.fin_payments (client_id, received_on, amount, currency, reference, note) select ${lit(p.client_id)}, ${lit(p.received_on)}::date, ${lit(p.amount)}, ${lit(p.currency)}, ${lit(p.reference)}, ${lit(p.note)} where not exists (select 1 from public.fin_payments where client_id = ${lit(p.client_id)} and received_on = ${lit(p.received_on)}::date and amount = ${lit(p.amount)} and currency = ${lit(p.currency)} and reference is not distinct from ${lit(p.reference)});`)
  }
  out.push(`insert into public.fin_counters (kind, next_no) values ('invoice', ${lit(seed.counters.invoice)}), ('credit_note', ${lit(seed.counters.credit_note)}) on conflict (kind) do update set next_no = greatest(public.fin_counters.next_no, excluded.next_no), updated_at = now();`)
  return `${out.join('\n')}\n`
}

/** The PDFs to file, each at the path its row points to. */
export function seedUploads(seed: Seed): { number: string; file: string; path: string }[] {
  return seed.invoices.flatMap((i) => (i.pdf_file ? [{ number: i.number, file: i.pdf_file, path: pdfStoragePath({ clientId: i.client_id, number: i.number }) }] : []))
}
