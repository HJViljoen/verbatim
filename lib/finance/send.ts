import { sendInvoiceEmail, type InvoiceMail } from '@/lib/email'
import { operatorEmails } from '@/lib/schedules/members'
import type { createAdminClient } from '@/lib/supabase-admin'
import { EmailNotReady, invoiceEmail } from './email'
import { loadInvoiceContext, type InvoiceContext } from './load'
import { INVOICE_BUCKET } from './html'
import { STALE_CLAIM_MS, mayHaveGone } from './types'

// Sending an invoice (D2: Resend from the issuer's own address, reply-to and
// Bcc as the rows say). CLAIM BEFORE SEND, the report_sends discipline:
//
//   ready ──claim──▶ sending ──email accepted──────────────▶ sent
//                        ├──refused, certainly not sent──▶ ready (+ send_error)
//                        └──no clear answer (a timeout, a 5xx, a throw)
//                                                       ──▶ unconfirmed (+ send_error)
//
// The claim is a compare-and-set on `status = 'ready'`, so a double click, a
// second tab or the daily job and a tap at once send ONE email: the loser's
// claim matches no row and it is told the invoice is already on its way.
//
// AN EMAIL THAT MAY HAVE GONE IS NEVER SENT AGAIN BY ITSELF. `unconfirmed`,
// and a `sending` claim older than ten minutes (a send that crashed between
// the claim and the answer), are taken again only with `confirmUnsure`: the
// page asks the operator to check the Bcc copy first. The daily job never
// sends either, nor any invoice with a send_error; it lists them for the
// operator (lib/finance/daily.ts). And every attempt at one invoice carries
// the SAME idempotency key, `fin-invoice-<id>`, so within Resend's 24 hours a
// retry of an email it did accept is answered, not sent twice.
//
// After a send: the profile's hold is cleared (D1: the held invoice's tap is
// the go-ahead for the months after) and its one-off note too, if the email
// carried it. A failed send changes neither.
//
// A TEST send (the page's "Send a test to me") is the same email and PDF to
// ALERT_EMAIL alone: no claim, no status, nothing cleared.

type Admin = ReturnType<typeof createAdminClient>

export { STALE_CLAIM_MS, mayHaveGone }

export type SendResult = { ok: true; messageId: string; message: string } | { ok: false; message: string }

/** Everything sendInvoice touches outside itself. */
export interface SendPort {
  load(id: string): Promise<InvoiceContext | null>
  /** ready → sending; with `retakeUnsure` also unconfirmed, or a sending
   *  claimed before `staleBefore`. True when this caller holds the claim. */
  claim(id: string, claimedAt: string, opts: { retakeUnsure: boolean; staleBefore: string }): Promise<boolean>
  download(path: string): Promise<Buffer>
  email(mail: InvoiceMail): Promise<{ sent: true; id: string } | { sent: false; error: string; definite: boolean }>
  /** sending → sent, while the claim is still this caller's. */
  markSent(id: string, claimedAt: string, messageId: string, sentAt: string): Promise<void>
  /** sending → ready with the reason (certainly not sent), while the claim
   *  is still this caller's. */
  release(id: string, claimedAt: string, error: string): Promise<void>
  /** sending → unconfirmed with the reason (it may have gone), while the
   *  claim is still this caller's. */
  markUnsure(id: string, claimedAt: string, error: string): Promise<void>
  /** Clear the profile's hold, and its one-off note if it is still the one sent. */
  afterSent(profileId: string, sentNote: string | null): Promise<void>
  operator(): string[]
  now(): Date
}

/** The one idempotency key every attempt at an invoice carries. */
export const sendKey = (id: string): string => `fin-invoice-${id}`

export async function sendInvoice(port: SendPort, id: string, opts: { test?: boolean; confirmUnsure?: boolean } = {}): Promise<SendResult> {
  const ctx = await port.load(id)
  if (!ctx) return { ok: false, message: 'No such invoice.' }
  const inv = ctx.invoice
  if (!inv.pdfPath) return { ok: false, message: `Invoice ${inv.number} has no PDF yet. Print it first.` }

  let mail
  try {
    mail = invoiceEmail(inv, ctx.issuer, ctx.profile, { test: opts.test, operator: port.operator() })
  } catch (e) {
    if (e instanceof EmailNotReady) return { ok: false, message: e.message }
    throw e
  }

  if (opts.test) {
    const pdf = await port.download(inv.pdfPath)
    const r = await port.email({ ...toMail(mail, pdf), idempotencyKey: `fin-test-${id}-${port.now().getTime()}` })
    return r.sent
      ? { ok: true, messageId: r.id, message: `Test sent to ${mail.to.join(', ')}.` }
      : { ok: false, message: `The test did not send: ${r.error}` }
  }

  if (inv.status === 'sent' || inv.status === 'credited') return { ok: false, message: `Invoice ${inv.number} was sent already.` }
  if (inv.status === 'draft') return { ok: false, message: `Invoice ${inv.number} has no PDF yet. Print it first.` }
  if (inv.status === 'void') return { ok: false, message: `Invoice ${inv.number} is void.` }

  const now = port.now()
  const unsure = mayHaveGone(inv, now)
  if (unsure && !opts.confirmUnsure) {
    return { ok: false, message: `Invoice ${inv.number} may already have gone. Check your Bcc copy first; send it again only if it is not there.` }
  }
  const claimedAt = now.toISOString()
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()
  if (!(await port.claim(id, claimedAt, { retakeUnsure: unsure, staleBefore }))) {
    return { ok: false, message: `Invoice ${inv.number} is already being sent, or was sent. Reload to see it.` }
  }

  // The PDF is read before anything is sent: a failure there sent nothing.
  let pdf: Buffer
  try {
    pdf = await port.download(inv.pdfPath)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'The PDF could not be read.'
    await port.release(id, claimedAt, error.slice(0, 500))
    return { ok: false, message: `Invoice ${inv.number} did not send: ${error}` }
  }
  let result: Awaited<ReturnType<SendPort['email']>>
  try {
    result = await port.email({ ...toMail(mail, pdf), idempotencyKey: sendKey(id) })
  } catch (e) {
    result = { sent: false, error: e instanceof Error ? e.message : 'The email service gave no answer.', definite: false }
  }
  if (!result.sent && result.definite) {
    await port.release(id, claimedAt, result.error.slice(0, 500))
    return { ok: false, message: `Invoice ${inv.number} did not send: ${result.error}` }
  }
  if (!result.sent) {
    await port.markUnsure(id, claimedAt, `No clear answer from the email service (${result.error}); it may have gone.`.slice(0, 500))
    return { ok: false, message: `Invoice ${inv.number} may or may not have gone: ${result.error}. Check your Bcc copy before sending it again.` }
  }
  await port.markSent(id, claimedAt, result.id, port.now().toISOString())
  // The stored note, not the trimmed one the email printed: the clear matches on it.
  if (inv.profileId) await port.afterSent(inv.profileId, mail.noteOnce ? (ctx.profile?.noteOnce ?? null) : null)
  return { ok: true, messageId: result.id, message: `Invoice ${inv.number} sent to ${[...mail.to, ...mail.cc].join(', ')}.` }
}

function toMail(m: ReturnType<typeof invoiceEmail>, pdf: Buffer): Omit<InvoiceMail, 'idempotencyKey'> {
  return {
    from: m.from,
    replyTo: m.replyTo,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    subject: m.subject,
    text: m.text,
    html: m.html,
    attachments: [{ filename: m.filename, content: pdf, contentType: 'application/pdf' }],
  }
}

/** The port over the real database, storage and email. */
export function supabaseSendPort(admin: Admin): SendPort {
  return {
    load: (id) => loadInvoiceContext(admin, id),
    async claim(id, claimedAt, { retakeUnsure, staleBefore }) {
      const query = admin
        .from('fin_invoices')
        .update({ status: 'sending', send_claimed_at: claimedAt, updated_at: new Date().toISOString() })
        .eq('id', id)
      const { data, error } = await (retakeUnsure
        ? query.or(`status.eq.ready,status.eq.unconfirmed,and(status.eq.sending,send_claimed_at.lt."${staleBefore}")`)
        : query.eq('status', 'ready')
      ).select('id')
      if (error) throw new Error(`finance: claim ${id}: ${error.message}`)
      return (data?.length ?? 0) > 0
    },
    async download(path) {
      const { data, error } = await admin.storage.from(INVOICE_BUCKET).download(path)
      if (error || !data) throw new Error(`The PDF could not be read (${error?.message ?? 'no file'}).`)
      return Buffer.from(await data.arrayBuffer())
    },
    email: sendInvoiceEmail,
    async markSent(id, claimedAt, messageId, sentAt) {
      const { error } = await admin
        .from('fin_invoices')
        .update({ status: 'sent', sent_at: sentAt, email_message_id: messageId, send_error: null, send_claimed_at: null, updated_at: sentAt })
        .eq('id', id)
        .eq('status', 'sending')
        .eq('send_claimed_at', claimedAt)
      if (error) throw new Error(`finance: the email went (${messageId}) but recording it failed: ${error.message}`)
    },
    async release(id, claimedAt, message) {
      const { error } = await admin
        .from('fin_invoices')
        .update({ status: 'ready', send_error: message, send_claimed_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'sending')
        .eq('send_claimed_at', claimedAt)
      if (error) console.error(`[finance] release ${id} failed:`, error.message)
    },
    async markUnsure(id, claimedAt, message) {
      const { error } = await admin
        .from('fin_invoices')
        .update({ status: 'unconfirmed', send_error: message, send_claimed_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'sending')
        .eq('send_claimed_at', claimedAt)
      if (error) console.error(`[finance] mark ${id} unconfirmed failed:`, error.message)
    },
    async afterSent(profileId, sentNote) {
      const at = new Date().toISOString()
      const hold = await admin.from('fin_billing_profiles').update({ hold_next: false, updated_at: at }).eq('id', profileId)
      if (hold.error) console.error(`[finance] clear hold on ${profileId} failed:`, hold.error.message)
      if (sentNote) {
        const note = await admin.from('fin_billing_profiles').update({ note_once: null, updated_at: at }).eq('id', profileId).eq('note_once', sentNote)
        if (note.error) console.error(`[finance] clear note on ${profileId} failed:`, note.error.message)
      }
    },
    operator: () => operatorEmails(),
    now: () => new Date(),
  }
}
