import type {
  BankLine, BillingProfile, DueRule, FinCurrency, Invoice, InvoiceKind, InvoiceLine, InvoiceStatus, Issuer, Payment,
  ProfileLine, SendMode,
} from './types'

// The finance tables' rows, between the database's snake_case and the code's
// types. PostgREST returns `numeric` as a number or a string depending on its
// size, so every figure goes through `num`. Pure.

type Row = Record<string, unknown>

const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v))
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const day = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).slice(0, 10))
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((s) => s.trim() !== '') : [])
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => typeof x === 'object' && x !== null) : [])

export function issuerFromRow(r: Row | null | undefined): Issuer | null {
  if (!r) return null
  return {
    name: String(r.name ?? ''),
    addressLines: strings(r.address_lines),
    email: str(r.email),
    bankLines: list(r.bank_lines).map((b): BankLine => ({ label: String(b.label ?? ''), value: String(b.value ?? '') })),
    emailFrom: str(r.email_from),
    replyTo: str(r.reply_to),
  }
}

export function issuerToRow(i: Issuer): Row {
  return {
    name: i.name,
    address_lines: i.addressLines,
    email: i.email,
    bank_lines: i.bankLines.map((b) => ({ label: b.label, value: b.value })),
    email_from: i.emailFrom,
    reply_to: i.replyTo,
  }
}

export function profileFromRow(r: Row): BillingProfile {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    active: r.active === undefined ? true : Boolean(r.active),
    billTo: String(r.bill_to ?? ''),
    currency: (r.currency as FinCurrency) ?? 'ZAR',
    fxRate: num(r.fx_rate) || 1,
    lines: list(r.lines).map((l): ProfileLine => ({ description: String(l.description ?? ''), unitUsd: num(l.unit_usd), qty: num(l.qty) || 1 })),
    subjectLine: String(r.subject_line ?? ''),
    issueDay: num(r.issue_day) || 15,
    dueRule: (r.due_rule as DueRule) ?? 'end_of_prev_month',
    sendMode: (r.send_mode as SendMode) ?? 'review',
    holdNext: Boolean(r.hold_next),
    emailTo: strings(r.email_to),
    emailCc: strings(r.email_cc),
    emailBcc: strings(r.email_bcc),
    yourRef: str(r.your_ref),
    emailGreeting: str(r.email_greeting),
    noteOnce: str(r.note_once),
  }
}

/** A profile's editable columns (the page's form). */
export function profileToRow(p: Omit<BillingProfile, 'id' | 'clientId'>): Row {
  return {
    active: p.active,
    bill_to: p.billTo,
    currency: p.currency,
    fx_rate: p.fxRate,
    lines: p.lines.map((l) => ({ description: l.description, unit_usd: l.unitUsd, qty: l.qty })),
    subject_line: p.subjectLine,
    issue_day: p.issueDay,
    due_rule: p.dueRule,
    send_mode: p.sendMode,
    hold_next: p.holdNext,
    email_to: p.emailTo,
    email_cc: p.emailCc,
    email_bcc: p.emailBcc,
    your_ref: p.yourRef,
    email_greeting: p.emailGreeting,
    note_once: p.noteOnce,
  }
}

export function invoiceFromRow(r: Row): Invoice {
  return {
    id: String(r.id),
    number: String(r.number ?? ''),
    kind: (r.kind as InvoiceKind) ?? 'invoice',
    clientId: String(r.client_id),
    profileId: str(r.profile_id),
    billTo: String(r.bill_to ?? ''),
    subjectLine: String(r.subject_line ?? ''),
    yourRef: str(r.your_ref),
    periodLabel: String(r.period_label ?? ''),
    periodStart: day(r.period_start),
    issuedOn: day(r.issued_on) ?? '',
    dueOn: day(r.due_on),
    currency: (r.currency as FinCurrency) ?? 'ZAR',
    fxNote: str(r.fx_note),
    lines: list(r.lines).map((l): InvoiceLine => ({
      description: String(l.description ?? ''),
      qty: num(l.qty),
      unit: String(l.unit ?? 'month'),
      unitPrice: num(l.unit_price),
      amount: num(l.amount),
    })),
    total: num(r.total),
    relatesTo: str(r.relates_to),
    status: (r.status as InvoiceStatus) ?? 'draft',
    expectedOn: day(r.expected_on),
    sentAt: str(r.sent_at),
    pdfPath: str(r.pdf_path),
    emailMessageId: str(r.email_message_id),
    sendError: str(r.send_error),
    sendClaimedAt: str(r.send_claimed_at),
    note: str(r.note),
  }
}

/** The jsonb an invoice's lines are stored as. */
export function linesToJson(lines: readonly InvoiceLine[]): Row[] {
  return lines.map((l) => ({ description: l.description, qty: l.qty, unit: l.unit, unit_price: l.unitPrice, amount: l.amount }))
}

export function paymentFromRow(r: Row): Payment {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    receivedOn: day(r.received_on) ?? '',
    amount: num(r.amount),
    currency: (r.currency as FinCurrency) ?? 'ZAR',
    reference: str(r.reference),
    note: str(r.note),
  }
}
