import { addMonths, todayJhb } from '@/lib/costs/dates'
import { longDate } from './email'
import type { Ledger } from './ledger'
import { fmtMoney } from './money'
import { monthOf } from './periods'
import { PROD_REF } from './prod'
import type { BillingProfile, Invoice, NoticeKind } from './types'

// The daily job's decisions (inngest/functions/finance-daily.ts), pure: which
// day it is, which ready invoices send themselves and which wait for a tap,
// and what to tell the operator. Every message here goes to the operator
// (ALERT_EMAIL), never to a client.

/**
 * The day the run acts for: today in Johannesburg, or an injected day for a
 * rehearsal. An injected day is refused on the production deployment AND
 * wherever the database is production's (a dev server on .env.local reads
 * the real books), so a stray event can never bill a month early on them.
 */
export function runDay(
  now: Date,
  injected: unknown,
  env: { vercelEnv: string | undefined; supabaseUrl: string | undefined },
): { today: string; injected: boolean } {
  const ok = typeof injected === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(injected) && !Number.isNaN(Date.parse(`${injected}T00:00:00Z`))
  const realBooks = env.vercelEnv === 'production' || (env.supabaseUrl ?? '').includes(PROD_REF)
  if (ok && !realBooks) return { today: injected, injected: true }
  return { today: todayJhb(now), injected: false }
}

export interface SendPlan {
  /** The upcoming month's ready invoice of each profile that sends itself
   *  (D1: auto, not held). */
  send: Invoice[]
  /** Ready invoices waiting for the operator's tap: held, a review profile, a
   *  paused one, or any invoice that is not the upcoming month's. */
  hold: Invoice[]
  /** Invoices the job will not touch and the operator must look at: one that
   *  may have gone (unconfirmed, or a send that crashed), one in flight, and
   *  one whose last send failed. Listed in the run's alert, every run. */
  attention: { invoice: Invoice; why: string }[]
}

/**
 * Who sends what, on `today`. Only invoices the job issued (a profile's) are
 * considered, and ONLY THE UPCOMING MONTH'S INVOICE SENDS ITSELF: the one for
 * next month, which the job issues in the days before that month starts. Any
 * other ready invoice (an older month held and never sent, one printed too
 * late) waits for the operator's tap, however the profile is set, so a hold
 * lifted in March never sends January.
 *
 * NOTHING THAT MAY HAVE GONE IS SENT AGAIN BY THE JOB: an unconfirmed
 * invoice, a `sending` one (in flight, or crashed), and any invoice whose
 * last send failed wait for the operator, who checks the Bcc copy and taps
 * (lib/finance/send.ts). A paused profile's ready invoice waits too.
 */
export function planSends(invoices: readonly Invoice[], profiles: readonly BillingProfile[], today: string): SendPlan {
  const upcoming = addMonths(monthOf(today), 1)
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const out: SendPlan = { send: [], hold: [], attention: [] }
  for (const i of invoices) {
    if (i.kind !== 'invoice' || !i.profileId) continue
    if (i.status === 'unconfirmed') { out.attention.push({ invoice: i, why: `may have gone: ${i.sendError ?? 'no clear answer from the email service'}` }); continue }
    if (i.status === 'sending') { out.attention.push({ invoice: i, why: 'a send started and has not finished; if it is still so in ten minutes it may have gone' }); continue }
    if (i.status !== 'ready' || !i.pdfPath) continue
    if (i.sendError) { out.attention.push({ invoice: i, why: `its last send failed: ${i.sendError}` }); continue }
    const p = byId.get(i.profileId)
    if (!p) continue
    if (p.active && p.sendMode === 'auto' && !p.holdNext && i.periodStart === upcoming) out.send.push(i)
    else out.hold.push(i)
  }
  return out
}

/** The alert's lines for invoices that need the operator. */
export function attentionLines(attention: SendPlan['attention']): string[] {
  return attention.map(({ invoice: i, why }) =>
    `Invoice ${i.number} (${i.billTo}, ${i.periodLabel}) was not sent by the job: ${why}. Check your Bcc copy, then use Send on Ops → Costs if it did not go.`)
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
