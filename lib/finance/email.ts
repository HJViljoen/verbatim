import { escapeHtml, documentName, pdfFileName } from './html'
import { fmtMoney } from './money'
import type { BillingProfile, Invoice, Issuer } from './types'

// The invoice email: short, in plain words, the PDF attached. Who it is from
// and who it goes to come from the rows (fin_issuer, the billing profile),
// never from code. Pure: lib/finance/send.ts sends it.

export interface InvoiceEmail {
  from: string
  replyTo: string | null
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  text: string
  html: string
  filename: string
  /** The one-off line this email carries (cleared once it is sent), if any. */
  noteOnce: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-12-31' → '31 December 2026'. */
export function longDate(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}

export class EmailNotReady extends Error {}

/**
 * The email for an invoice. `test` sends the same email and PDF to the
 * operator alone (`operator`: ALERT_EMAIL's addresses), no copies, the
 * subject marked; the real one goes To / Cc / Bcc as the profile says.
 */
export function invoiceEmail(
  inv: Invoice,
  issuer: Issuer,
  profile: Pick<BillingProfile, 'emailTo' | 'emailCc' | 'emailBcc' | 'emailGreeting' | 'noteOnce'> | null,
  opts: { test?: boolean; operator?: string[] } = {},
): InvoiceEmail {
  if (!issuer.emailFrom) throw new EmailNotReady('The issuer has no sending address (fin_issuer.email_from).')
  const to = opts.test ? (opts.operator ?? []) : (profile?.emailTo ?? [])
  if (to.length === 0) {
    throw new EmailNotReady(opts.test ? 'ALERT_EMAIL is not set, so there is nowhere to send the test.' : 'The billing profile has no To address.')
  }
  const name = documentName(inv)
  const amount = fmtMoney(inv.total, inv.currency)
  const greeting = `${(profile?.emailGreeting ?? '').trim() || 'Hello'},`
  const note = profile?.noteOnce?.trim() || null
  const lead = inv.kind === 'credit_note'
    ? `Please find attached credit note ${inv.number} for ${inv.periodLabel}: ${amount}.`
    : `Please find attached invoice ${inv.number} for ${inv.periodLabel}: ${amount}, due ${inv.dueOn ? `by ${longDate(inv.dueOn)}` : 'on receipt'}.`
  const details = inv.kind === 'credit_note'
    ? 'The details are on the credit note.'
    : 'The details and the bank account are on the invoice.'
  const paragraphs = [greeting, lead + ' ' + details, ...(note ? [note] : []), `Thank you,\n${issuer.name}`]
  const text = paragraphs.join('\n\n')
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a">
${paragraphs.map((p) => `    <p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
  </body>
</html>`
  return {
    from: issuer.emailFrom,
    replyTo: issuer.replyTo,
    to,
    cc: opts.test ? [] : (profile?.emailCc ?? []),
    bcc: opts.test ? [] : (profile?.emailBcc ?? []),
    subject: `${opts.test ? '[Test] ' : ''}${name} — ${inv.periodLabel}`,
    text,
    html,
    filename: pdfFileName(inv),
    noteOnce: note,
  }
}
