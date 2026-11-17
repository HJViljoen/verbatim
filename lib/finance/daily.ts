import { todayJhb } from '@/lib/costs/dates'
import { longDate } from './email'
import type { Ledger } from './ledger'
import { fmtMoney } from './money'
import type { BillingProfile, Invoice, NoticeKind } from './types'

// The daily job's decisions (inngest/functions/finance-daily.ts), pure: which
// day it is, which ready invoices send themselves and which wait for a tap,
// and what to tell the operator. Every message here goes to the operator
// (ALERT_EMAIL), never to a client.

/**
 * The day the run acts for: today in Johannesburg, or an injected day for a
 * rehearsal. An injected day is honoured everywhere BUT production, so a
 * stray event can never bill a month early on the real books.
 */
export function runDay(now: Date, injected: unknown, vercelEnv: string | undefined): { today: string; injected: boolean } {
  const ok = typeof injected === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(injected) && !Number.isNaN(Date.parse(`${injected}T00:00:00Z`))
  if (ok && vercelEnv !== 'production') return { today: injected, injected: true }
  return { today: todayJhb(now), injected: false }
}

export interface SendPlan {
  /** Ready invoices of profiles that send themselves (D1: auto, not held). */
  send: Invoice[]
  /** Ready invoices waiting for the operator's tap: held, or a review profile. */
  hold: Invoice[]
}

/**
 * Who sends what. Only invoices the job issued (a profile's) are considered;
 * a `sending` one whose claim went stale is retried like a ready one. A
 * paused profile's ready invoice waits.
 */
export function planSends(invoices: readonly Invoice[], profiles: readonly BillingProfile[]): SendPlan {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const out: SendPlan = { send: [], hold: [] }
  for (const i of invoices) {
    if (i.kind !== 'invoice' || !i.profileId || !i.pdfPath) continue
    if (i.status !== 'ready' && i.status !== 'sending') continue
    const p = byId.get(i.profileId)
    if (!p) continue
    if (p.active && p.sendMode === 'auto' && !p.holdNext) out.send.push(i)
    else if (i.status === 'ready') out.hold.push(i)
  }
  return out
}

export interface Notice {
  invoiceId: string
  number: string
  kind: NoticeKind
  /** The day the notice is about: issue day, due day or promised day. */
  onDay: string
  line: string
}

/** "0123 (Acme, March 2027): R1,234.00, due 28 February 2027". */
function describe(i: Invoice, balance?: number): string {
  const owed = balance !== undefined && balance !== i.total ? `${fmtMoney(balance, i.currency)} of ${fmtMoney(i.total, i.currency)}` : fmtMoney(i.total, i.currency)
  return `${i.number} (${i.billTo}, ${i.periodLabel}): ${owed}, due ${i.dueOn ? longDate(i.dueOn) : `on receipt (issued ${longDate(i.issuedOn)})`}`
}

/** The held invoices, one notice each, claimed on the day they were issued. */
export function holdNotices(held: readonly Invoice[]): Notice[] {
  return held.map((i) => ({ invoiceId: i.id, number: i.number, kind: 'ready', onDay: i.issuedOn, line: describe(i) }))
}

/**
 * The nudges: an invoice past its due date and unpaid (once per due date),
 * and one whose promised payment day has come and is unpaid (once per
 * promised day).
 */
export function nudgeNotices(invoices: readonly Invoice[], ledger: Ledger, today: string): Notice[] {
  const out: Notice[] = []
  for (const i of invoices) {
    const b = ledger.byId.get(i.id)
    if (!b || b.balanceCents <= 0) continue
    if (b.state === 'overdue') out.push({ invoiceId: i.id, number: i.number, kind: 'overdue', onDay: b.dueOn, line: describe(i, b.balanceCents / 100) })
    if (i.expectedOn && i.expectedOn <= today) {
      out.push({ invoiceId: i.id, number: i.number, kind: 'expected', onDay: i.expectedOn, line: `${describe(i, b.balanceCents / 100)}; promised for ${longDate(i.expectedOn)}` })
    }
  }
  return out
}

/** The operator's email for a set of notices (they were claimed first). */
export function noticeEmail(kind: 'hold' | 'nudge', notices: readonly Notice[], costsUrl: string): { subject: string; text: string } {
  if (kind === 'hold') {
    const n = notices.length
    return {
      subject: n === 1 ? `Invoice ${notices[0].number} is ready and waiting for you` : `${n} invoices are ready and waiting for you`,
      text: [
        `${n === 1 ? 'This invoice is' : 'These invoices are'} printed and held. Nothing goes to the client until you press Send on Ops → Costs.`,
        '',
        ...notices.map((x) => `• ${x.line}`),
        '',
        `Open it: ${costsUrl}`,
        '',
        'There you can read the PDF, send a test to yourself, then Send.',
      ].join('\n'),
    }
  }
  const overdue = notices.filter((x) => x.kind === 'overdue')
  const promised = notices.filter((x) => x.kind === 'expected')
  return {
    subject: `Money owed: ${notices.length === 1 ? `invoice ${notices[0].number}` : `${notices.length} invoices`} unpaid`,
    text: [
      ...(overdue.length ? ['Past their due date and not paid yet:', ...overdue.map((x) => `• ${x.line}`), ''] : []),
      ...(promised.length ? ['The day the client said it would pay has come, and it is not recorded as paid:', ...promised.map((x) => `• ${x.line}`), ''] : []),
      `Record a payment, or set the date they promise, on Ops → Costs: ${costsUrl}`,
      '',
      'This goes to you only, never to the client.',
    ].join('\n'),
  }
}
