import { describe, expect, it } from 'vitest'
import type { InvoiceMail } from '@/lib/email'
import { invoiceEmail, longDate } from './email'
import { ISSUER, PROFILE, invoice } from './fixtures'
import { attentionLines, planSends } from './daily'
import { issueArgs } from './issue'
import type { InvoiceContext } from './load'
import { nextBillablePeriod } from './periods'
import { STALE_CLAIM_MS, mayHaveGone, sendInvoice, sendKey, type SendPort } from './send'
import { invoiceFailureIsDefinite } from '@/lib/email'
import type { BillingProfile, Invoice } from './types'

// Issuing and sending, with the database, storage and email as an in-memory
// port: the claim's compare-and-set, the rollback on a refused email, the
// hold and the one-off note. Made-up names (lib/finance/fixtures.ts).

const JAN: Invoice = invoice({
  id: '00000000-0000-0000-0000-0000000000aa',
  number: '0111', currency: 'ZAR', total: 2625, periodStart: '2027-01-01', periodLabel: 'January 2027',
  issuedOn: '2026-12-15', dueOn: '2026-12-31', status: 'ready', pdfPath: 'client/0111.pdf', profileId: PROFILE.id, sentAt: null,
})

/** A port over one invoice row and one profile, with the claim done the way
 *  the database does it: a check and a write with nothing in between. */
type EmailAnswer = { sent: true; id: string } | { sent: false; error: string; definite: boolean }

function fakePort(opts: { invoice?: Invoice; profile?: BillingProfile; email?: (m: InvoiceMail) => Promise<EmailAnswer>; now?: Date; operator?: string[] } = {}) {
  const row: Invoice = { ...(opts.invoice ?? JAN) }
  const profile: BillingProfile = { ...(opts.profile ?? PROFILE) }
  const sent: InvoiceMail[] = []
  let n = 0
  const port: SendPort = {
    load: async () => ({ invoice: { ...row }, issuer: ISSUER, related: null, replacement: null, profile: { ...profile } } satisfies InvoiceContext),
    claim: async (_id, claimedAt, { retakeUnsure, staleBefore }) => {
      const free = row.status === 'ready'
        || (retakeUnsure && (row.status === 'unconfirmed' || (row.status === 'sending' && row.sendClaimedAt !== null && row.sendClaimedAt < staleBefore)))
      if (!free) return false
      row.status = 'sending'
      row.sendClaimedAt = claimedAt
      return true
    },
    download: async () => Buffer.from('%PDF-1.4 test'),
    email: async (m) => {
      sent.push(m)
      return opts.email ? opts.email(m) : { sent: true, id: `msg-${++n}` }
    },
    markSent: async (_id, claimedAt, messageId, sentAt) => {
      if (row.status !== 'sending' || row.sendClaimedAt !== claimedAt) return
      Object.assign(row, { status: 'sent', emailMessageId: messageId, sentAt, sendError: null, sendClaimedAt: null })
    },
    release: async (_id, claimedAt, error) => {
      if (row.status !== 'sending' || row.sendClaimedAt !== claimedAt) return
      Object.assign(row, { status: 'ready', sendError: error, sendClaimedAt: null })
    },
    markUnsure: async (_id, claimedAt, error) => {
      if (row.status !== 'sending' || row.sendClaimedAt !== claimedAt) return
      Object.assign(row, { status: 'unconfirmed', sendError: error, sendClaimedAt: null })
    },
    afterSent: async (_pid, note) => {
      profile.holdNext = false
      if (note !== null && profile.noteOnce === note) profile.noteOnce = null
    },
    operator: () => opts.operator ?? ['operator@verbatim.test'],
    now: () => opts.now ?? new Date('2026-12-15T05:00:00.000Z'),
  }
  return { port, row, profile, sent }
}

describe('the invoice email', () => {
  it('says what it is in plain words, from the issuer, to the profile\'s list', () => {
    const m = invoiceEmail(JAN, ISSUER, PROFILE)
    expect(m.from).toBe('Jane Doe <jane@verbatim.test>')
    expect(m.replyTo).toBe('jane@example.test')
    expect(m.to).toEqual(['ap@acme.test'])
    expect(m.cc).toEqual(['buyer@acme.test', 'finance@acme.test'])
    expect(m.bcc).toEqual(['jane@example.test'])
    expect(m.subject).toBe('Invoice 0111 for January 2027')
    expect(m.text).toBe([
      'Hi John,',
      'Please find attached invoice 0111 for January 2027: R2,625.00, due by 31 December 2026. The details and the bank account are on the invoice.',
      'Invoices now come from my Verbatim address; the bank details are unchanged.',
      'Thank you,\nJane Doe',
    ].join('\n\n'))
    expect(m.html).toContain('<p style="margin:0 0 14px">Hi John,</p>')
    expect(m.html).toContain('Thank you,<br>Jane Doe')
    expect(m.filename).toBe('Invoice-0111-Acme-SA-ZAR-2026-12-15.pdf')
    expect(m.noteOnce).toBe('Invoices now come from my Verbatim address; the bank details are unchanged.')
  })

  it('leaves the one-off line out once it is cleared, and says "on receipt" with no due date', () => {
    const m = invoiceEmail({ ...JAN, dueOn: null }, ISSUER, { ...PROFILE, noteOnce: null, emailGreeting: null })
    expect(m.text).toBe('Hello,\n\nPlease find attached invoice 0111 for January 2027: R2,625.00, due on receipt. The details and the bank account are on the invoice.\n\nThank you,\nJane Doe')
    expect(m.noteOnce).toBeNull()
  })

  it('sends a test to the operator alone, no copies, marked', () => {
    const m = invoiceEmail(JAN, ISSUER, PROFILE, { test: true, operator: ['operator@verbatim.test'] })
    expect(m.to).toEqual(['operator@verbatim.test'])
    expect(m.cc).toEqual([])
    expect(m.bcc).toEqual([])
    expect(m.subject).toBe('[Test] Invoice 0111 for January 2027')
  })

  it('refuses to build an email with no sender or no recipient', () => {
    expect(() => invoiceEmail(JAN, { ...ISSUER, emailFrom: null }, PROFILE)).toThrow(/sending address/)
    expect(() => invoiceEmail(JAN, ISSUER, { ...PROFILE, emailTo: [] })).toThrow(/no To address/)
    expect(() => invoiceEmail(JAN, ISSUER, PROFILE, { test: true, operator: [] })).toThrow(/ALERT_EMAIL/)
    expect(longDate('2027-01-05')).toBe('5 January 2027')
  })
})

describe('issuing a month', () => {
  it('asks the database for January at R2,625, due 31 December, billed in advance', () => {
    const month = nextBillablePeriod(PROFILE, [], '2026-12-15')
    expect(month).not.toBeNull()
    const args = issueArgs(PROFILE, month as NonNullable<typeof month>)
    expect(args).toMatchObject({
      p_profile_id: PROFILE.id, p_period_start: '2027-01-01', p_period_label: 'January 2027', p_issued_on: '2026-12-15',
      p_due_on: '2026-12-31', p_total: 2625, p_fx_note: 'Converted from USD 150.00 at a fixed rate of R17.50 / USD 1.00.',
      p_note: 'Billed monthly in advance: payment is due by the last day of the month before the billing period.',
    })
    expect(args.p_lines).toEqual([
      { description: PROFILE.lines[0].description, qty: 1, unit: 'month', unit_price: 1400, amount: 1400 },
      { description: PROFILE.lines[1].description, qty: 1, unit: 'month', unit_price: 700, amount: 700 },
      { description: PROFILE.lines[2].description, qty: 1, unit: 'month', unit_price: 350, amount: 350 },
      { description: PROFILE.lines[3].description, qty: 1, unit: 'month', unit_price: 175, amount: 175 },
    ])
  })
})

describe('sending an invoice', () => {
  it('sends once, records the message, clears the hold and the one-off note', async () => {
    const { port, row, profile, sent } = fakePort()
    const r = await sendInvoice(port, JAN.id)
    expect(r).toMatchObject({ ok: true, messageId: 'msg-1' })
    expect(row).toMatchObject({ status: 'sent', emailMessageId: 'msg-1', sendError: null, sendClaimedAt: null })
    expect(row.sentAt).toBe('2026-12-15T05:00:00.000Z')
    expect(profile.holdNext).toBe(false)
    expect(profile.noteOnce).toBeNull()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: ['ap@acme.test'], cc: ['buyer@acme.test', 'finance@acme.test'], bcc: ['jane@example.test'] })
    expect(sent[0].attachments).toEqual([{ filename: 'Invoice-0111-Acme-SA-ZAR-2026-12-15.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }])
    expect(sent[0].idempotencyKey).toBe(`fin-invoice-${JAN.id}`)
  })

  it('refuses a second send: one email, whether the second comes after or during the first', async () => {
    const after = fakePort()
    await sendInvoice(after.port, JAN.id)
    const again = await sendInvoice(after.port, JAN.id)
    expect(again).toEqual({ ok: false, message: 'Invoice 0111 was sent already.' })
    expect(after.sent).toHaveLength(1)

    // Two at once: the email of the first is still in flight when the second
    // claims. The second loses the claim and sends nothing.
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const during = fakePort({ email: async () => { await gate; return { sent: true, id: 'msg-x' } } })
    const first = sendInvoice(during.port, JAN.id)
    await new Promise((r) => setTimeout(r, 0))
    const second = await sendInvoice(during.port, JAN.id)
    expect(second.ok).toBe(false)
    expect(second.message).toMatch(/already being sent/)
    release()
    expect((await first).ok).toBe(true)
    expect(during.sent).toHaveLength(1)
    expect(during.row.status).toBe('sent')
  })

  it('puts a send the service certainly refused back to ready with the reason, and keeps the hold and the note', async () => {
    const { port, row, profile } = fakePort({ email: async () => ({ sent: false, error: 'domain not verified', definite: true }) })
    const r = await sendInvoice(port, JAN.id)
    expect(r).toEqual({ ok: false, message: 'Invoice 0111 did not send: domain not verified' })
    expect(row).toMatchObject({ status: 'ready', sendError: 'domain not verified', sendClaimedAt: null, emailMessageId: null })
    expect(profile.holdNext).toBe(true)
    expect(profile.noteOnce).not.toBeNull()
  })

  it('marks a send with no clear answer unconfirmed: it may have gone, and it is not sent again without a person', async () => {
    // A timeout after the service accepted the email: the answer is lost.
    const timedOut = fakePort({ email: async () => { throw new Error('The operation timed out') } })
    const r = await sendInvoice(timedOut.port, JAN.id)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/may or may not have gone.*Check your Bcc copy/)
    expect(timedOut.row).toMatchObject({ status: 'unconfirmed', sendClaimedAt: null })
    expect(timedOut.row.sendError).toMatch(/it may have gone/)
    expect(timedOut.profile.holdNext).toBe(true)
    // a 5xx and a 409 say nothing either way
    const fiveHundred = fakePort({ email: async () => ({ sent: false, error: 'internal server error', definite: false }) })
    await sendInvoice(fiveHundred.port, JAN.id)
    expect(fiveHundred.row.status).toBe('unconfirmed')

    // Send again without the operator's confirmation: refused, nothing sent.
    const again = await sendInvoice(timedOut.port, JAN.id)
    expect(again).toEqual({ ok: false, message: 'Invoice 0111 may already have gone. Check your Bcc copy first; send it again only if it is not there.' })
    expect(timedOut.sent).toHaveLength(1)
  })

  it('after a timeout once the email was accepted, the next daily run sends nothing and alerts', async () => {
    const accepted: InvoiceMail[] = []
    const { port, row } = fakePort({
      profile: { ...PROFILE, holdNext: false },
      email: async (m) => { accepted.push(m); throw new Error('The operation timed out') },
    })
    await sendInvoice(port, JAN.id)
    expect(accepted).toHaveLength(1) // it reached the service; the answer was lost
    expect(row.status).toBe('unconfirmed')
    // the next morning: an auto profile, not held, and the job still leaves it alone
    const plan = planSends([row], [{ ...PROFILE, holdNext: false }])
    expect(plan.send).toEqual([])
    expect(attentionLines(plan.attention)).toEqual([
      expect.stringMatching(/^Invoice 0111 \(Acme SA, January 2027\) was not sent by the job: may have gone: .*Check your Bcc copy/),
    ])
  })

  it('sends an unconfirmed invoice again once the operator confirms, under the same idempotency key', async () => {
    const { port, row, sent } = fakePort({ invoice: { ...JAN, status: 'unconfirmed', sendError: 'No clear answer' } })
    const r = await sendInvoice(port, JAN.id, { confirmUnsure: true })
    expect(r.ok).toBe(true)
    expect(row).toMatchObject({ status: 'sent', sendError: null })
    expect(sent[0].idempotencyKey).toBe(sendKey(JAN.id))
  })

  it('treats a crashed send (a stale claim) as one that may have gone', async () => {
    const claimedAt = '2026-12-15T05:00:00.000Z'
    const stuck = { ...JAN, status: 'sending' as const, sendClaimedAt: claimedAt }
    const early = fakePort({ invoice: stuck, now: new Date(Date.parse(claimedAt) + STALE_CLAIM_MS - 1000) })
    expect((await sendInvoice(early.port, JAN.id, { confirmUnsure: true })).message).toMatch(/already being sent/)
    expect(early.sent).toHaveLength(0)
    const late = fakePort({ invoice: stuck, now: new Date(Date.parse(claimedAt) + STALE_CLAIM_MS + 1000) })
    expect(mayHaveGone(stuck, late.port.now())).toBe(true)
    expect((await sendInvoice(late.port, JAN.id)).message).toMatch(/may already have gone/)
    expect(late.sent).toHaveLength(0)
    expect((await sendInvoice(late.port, JAN.id, { confirmUnsure: true })).ok).toBe(true)
    expect(late.sent[0].idempotencyKey).toBe(`fin-invoice-${JAN.id}`)
  })

  it('reads a failure as definite only when the service refused before accepting', () => {
    for (const code of [400, 401, 403, 404, 422, 429]) expect(invoiceFailureIsDefinite({ statusCode: code })).toBe(true)
    for (const code of [409, 500, 502, 503]) expect(invoiceFailureIsDefinite({ statusCode: code })).toBe(false)
    expect(invoiceFailureIsDefinite({ statusCode: null })).toBe(false)
    expect(invoiceFailureIsDefinite(null)).toBe(false)
  })

  it('will not send a draft, an invoice with no PDF, or a void one', async () => {
    expect((await sendInvoice(fakePort({ invoice: { ...JAN, status: 'draft' } }).port, JAN.id)).message).toMatch(/Print it first/)
    expect((await sendInvoice(fakePort({ invoice: { ...JAN, pdfPath: null } }).port, JAN.id)).message).toMatch(/Print it first/)
    expect((await sendInvoice(fakePort({ invoice: { ...JAN, status: 'void' } }).port, JAN.id)).message).toMatch(/void/)
    expect((await sendInvoice(fakePort({ profile: { ...PROFILE, emailTo: [] } }).port, JAN.id)).message).toMatch(/no To address/)
  })

  it('sends a test to the operator only, and changes nothing', async () => {
    const { port, row, profile, sent } = fakePort({ invoice: { ...JAN, status: 'sent' } })
    const r = await sendInvoice(port, JAN.id, { test: true })
    expect(r).toMatchObject({ ok: true, message: 'Test sent to operator@verbatim.test.' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: ['operator@verbatim.test'], cc: [], bcc: [], subject: '[Test] Invoice 0111 for January 2027' })
    expect(sent[0].attachments).toHaveLength(1)
    expect(row.status).toBe('sent')
    expect(profile.holdNext).toBe(true)
    expect(profile.noteOnce).not.toBeNull()
  })
})
