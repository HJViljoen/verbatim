// The finance vocabulary (operator only, Ops → Costs "Money in").
//
// Every enum here mirrors a CHECK in supabase/migrations/20261115090000_finance.sql
// (lib/finance/migration.test.ts holds them equal), so a value the code writes
// is one the database accepts. Pure: no I/O.

export const FIN_CURRENCIES = ['ZAR', 'USD'] as const
export type FinCurrency = (typeof FIN_CURRENCIES)[number]

export const INVOICE_KINDS = ['invoice', 'credit_note'] as const
export type InvoiceKind = (typeof INVOICE_KINDS)[number]

/** draft: issued, no PDF yet. ready: printed, not sent. sending: an email is
 *  in flight. sent. credited: a credit note cancels it. void: withdrawn. */
export const INVOICE_STATUSES = ['draft', 'ready', 'sending', 'sent', 'credited', 'void'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** end_of_prev_month: billed in advance, due by the last day of the month
 *  before the one billed. on_receipt: no due date. */
export const DUE_RULES = ['end_of_prev_month', 'on_receipt'] as const
export type DueRule = (typeof DUE_RULES)[number]

export const SEND_MODES = ['auto', 'review'] as const
export type SendMode = (typeof SEND_MODES)[number]

export const NOTICE_KINDS = ['ready', 'overdue', 'expected'] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]

export const SEND_MODE_LABEL: Record<SendMode, string> = {
  auto: 'Sends itself',
  review: 'Waits for a tap',
}

export const DUE_RULE_LABEL: Record<DueRule, string> = {
  end_of_prev_month: 'Last day of the month before',
  on_receipt: 'On receipt',
}

export interface BankLine {
  label: string
  value: string
}

/** The one `fin_issuer` row. */
export interface Issuer {
  name: string
  addressLines: string[]
  email: string | null
  bankLines: BankLine[]
  /** "Name <address>": the invoice email's From. */
  emailFrom: string | null
  replyTo: string | null
}

/** A month's line on a billing profile, priced in dollars. */
export interface ProfileLine {
  description: string
  unitUsd: number
  qty: number
}

/** One `fin_billing_profiles` row. */
export interface BillingProfile {
  id: string
  clientId: string
  active: boolean
  billTo: string
  currency: FinCurrency
  /** Rand per dollar the lines are invoiced at (fixed by agreement). */
  fxRate: number
  lines: ProfileLine[]
  subjectLine: string
  /** Day of the month BEFORE the one billed that its invoice is issued on. */
  issueDay: number
  dueRule: DueRule
  sendMode: SendMode
  holdNext: boolean
  emailTo: string[]
  emailCc: string[]
  emailBcc: string[]
  yourRef: string | null
  emailGreeting: string | null
  noteOnce: string | null
}

/** A printed line, in the invoice's own currency. */
export interface InvoiceLine {
  description: string
  qty: number
  unit: string
  unitPrice: number
  amount: number
}

/** One `fin_invoices` row: an invoice or a credit note. */
export interface Invoice {
  id: string
  number: string
  kind: InvoiceKind
  clientId: string
  profileId: string | null
  billTo: string
  subjectLine: string
  yourRef: string | null
  periodLabel: string
  /** The first of the month billed, or null for a span that is not a month. */
  periodStart: string | null
  issuedOn: string
  /** Null = on receipt. */
  dueOn: string | null
  currency: FinCurrency
  fxNote: string | null
  lines: InvoiceLine[]
  /** Always positive; the kind says which way it goes. */
  total: number
  /** A credit note: the invoice it cancels. An invoice: the one it replaces. */
  relatesTo: string | null
  status: InvoiceStatus
  expectedOn: string | null
  sentAt: string | null
  pdfPath: string | null
  emailMessageId: string | null
  sendError: string | null
  sendClaimedAt: string | null
  note: string | null
}

/** One `fin_payments` row. */
export interface Payment {
  id: string
  clientId: string
  receivedOn: string
  amount: number
  currency: FinCurrency
  reference: string | null
  note: string | null
}
