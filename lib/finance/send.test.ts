import { describe, expect, it } from 'vitest'
import type { InvoiceMail } from '@/lib/email'
import { invoiceEmail, longDate } from './email'
import { ISSUER, PROFILE, invoice } from './fixtures'
import { issueArgs } from './issue'
import type { InvoiceContext } from './load'
import { nextBillablePeriod } from './periods'
import { STALE_CLAIM_MS, sendInvoice, type SendPort } from './send'
import type { BillingProfile, Invoice } from './types'

// Issuing and sending, with the database, storage and email as an in-memory
// port: the claim's compare-and-set, the rollback on a refused email, the
// hold and the one-off note. Made-up names (lib/finance/fixtures.ts).

const JAN: Invoice = invoice({
  id: '00000000-0000-0000-0000-0000000000aa',
  number: '0011', currency: 'ZAR', total: 3690, periodStart: '2027-01-01', periodLabel: 'January 2027',
  issuedOn: '2026-12-15', dueOn: '2026-12-31', status: 'ready', pdfPath: 'client/0011.pdf', profileId: PROFILE.id, sentAt: null,
})

/** A port over one invoice row and one profile, with the claim done the way
 *  the database does it: a check and a write with nothing in between. */
function fakePort(opts: { invoice?: Invoice; profile?: BillingProfile; email?: (m: InvoiceMail) => Promise<{ sent: true; id: string } | { sent: false; error: string }>; now?: Date; operator?: string[] } = {}) {
  const row: Invoice = { ...(opts.invoice ?? JAN) }
  const profile: BillingProfile = { ...(opts.profile ?? PROFILE) }
  const sent: InvoiceMail[] = []
  let n = 0
  const port: SendPort = {
    load: async () => ({ invoice: { ...row }, issuer: ISSUER, related: null, replacement: null, profile: { ...profile } } satisfies InvoiceContext),
    claim: async (_id, claimedAt, staleBefore) => {
      const free = row.status === 'ready' || (row.status === 'sending' && row.sendClaimedAt !== null && row.sendClaimedAt < staleBefore)
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
    expect(m.subject).toBe('Invoice 0011 for January 2027')
    expect(m.text).toBe([
      'Hi John,',
      'Please find attached invoice 0011 for January 2027: R3,690.00, due by 31 December 2026. The details and the bank account are on the invoice.',
      'Invoices now come from my Verbatim address; the bank details are unchanged.',
      'Thank you,\nJane Doe',
    ].join('\n\n'))
    expect(m.html).toContain('<p style="margin:0 0 14px">Hi John,</p>')
    expect(m.html).toContain('Thank you,<br>Jane Doe')
    expect(m.filename).toBe('Invoice-0011-Acme-SA-ZAR-2026-12-15.pdf')
    expect(m.noteOnce).toBe('Invoices now come from my Verbatim address; the bank details are unchanged.')
  })

  it('leaves the one-off line out once it is cleared, and says "on receipt" with no due date', () => {
    const m = invoiceEmail({ ...JAN, dueOn: null }, ISSUER, { ...PROFILE, noteOnce: null, emailGreeting: null })
    expect(m.text).toBe('Hello,\n\nPlease find attached invoice 0011 for January 2027: R3,690.00, due on receipt. The details and the bank account are on the invoice.\n\nThank you,\nJane Doe')
    expect(m.noteOnce).toBeNull()
  })

  it('sends a test to the operator alone, no copies, marked', () => {
    const m = invoiceEmail(JAN, ISSUER, PROFILE, { test: true, operator: ['operator@verbatim.test'] })
    expect(m.to).toEqual(['operator@verbatim.test'])
    expect(m.cc).toEqual([])
    expect(m.bcc).toEqual([])
    expect(m.subject).toBe('[Test] Invoice 0011 for January 2027')
  })

  it('refuses to build an email with no sender or no recipient', () => {
    expect(() => invoiceEmail(JAN, { ...ISSUER, emailFrom: null }, PROFILE)).toThrow(/sending address/)
    expect(() => invoiceEmail(JAN, ISSUER, { ...PROFILE, emailTo: [] })).toThrow(/no To address/)
    expect(() => invoiceEmail(JAN, ISSUER, PROFILE, { test: true, operator: [] })).toThrow(/ALERT_EMAIL/)
    expect(longDate('2027-01-05')).toBe('5 January 2027')
  })
})

describe('issuing a month', () => {
  it('asks the database for January at R3,690, due 31 December, billed in advance', () => {
    const month = nextBillablePeriod(PROFILE, [], '2026-12-15')
    expect(month).not.toBeNull()
    const args = issueArgs(PROFILE, month as NonNullable<typeof month>)
    expect(args).toMatchObject({
      p_profile_id: PROFILE.id, p_period_start: '2027-01-01', p_period_label: 'January 2027', p_issued_on: '2026-12-15',
      p_due_on: '2026-12-31', p_total: 3690, p_fx_note: 'Converted from USD 205.00 at a fixed rate of R18.00 / USD 1.00.',
      p_note: 'Billed monthly in advance: payment is due by the last day of the month before the billing period.',
    })
    expect(args.p_lines).toEqual([
      { description: PROFILE.lines[0].description, qty: 1, unit: 'month', unit_price: 1800, amount: 1800 },
      { description: PROFILE.lines[1].description, qty: 1, unit: 'month', unit_price: 540, amount: 540 },
      { description: PROFILE.lines[2].description, qty: 1, unit: 'month', unit_price: 450, amount: 450 },
      { description: PROFILE.lines[3].description, qty: 1, unit: 'month', unit_price: 900, amount: 900 },
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
    expect(sent[0].attachments).toEqual([{ filename: 'Invoice-0011-Acme-SA-ZAR-2026-12-15.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }])
    expect(sent[0].idempotencyKey).toBe(`fin-invoice-${JAN.id}-2026-12-15T05:00:00.000Z`)
  })

  it('refuses a second send: one email, whether the second comes after or during the first', async () => {
    const after = fakePort()
    await sendInvoice(after.port, JAN.id)
    const again = await sendInvoice(after.port, JAN.id)
    expect(again).toEqual({ ok: false, message: 'Invoice 0011 was sent already.' })
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

  it('puts a refused send back to ready with the reason, and keeps the hold and the note', async () => {
    const { port, row, profile } = fakePort({ email: async () => ({ sent: false, error: 'domain not verified' }) })
    const r = await sendInvoice(port, JAN.id)
    expect(r).toEqual({ ok: false, message: 'Invoice 0011 did not send: domain not verified' })
    expect(row).toMatchObject({ status: 'ready', sendError: 'domain not verified', sendClaimedAt: null, emailMessageId: null })
    expect(profile.holdNext).toBe(true)
    expect(profile.noteOnce).not.toBeNull()
  })

  it('puts a send that threw back to ready too', async () => {
    const { port, row } = fakePort({ email: async () => { throw new Error('socket hang up') } })
    expect((await sendInvoice(port, JAN.id)).ok).toBe(false)
    expect(row).toMatchObject({ status: 'ready', sendError: 'socket hang up' })
  })

  it('takes a crashed send again only once it is stale, under the same key', async () => {
    const claimedAt = '2026-12-15T05:00:00.000Z'
    const stuck = { ...JAN, status: 'sending' as const, sendClaimedAt: claimedAt }
    const early = fakePort({ invoice: stuck, now: new Date(Date.parse(claimedAt) + STALE_CLAIM_MS - 1000) })
    expect((await sendInvoice(early.port, JAN.id)).ok).toBe(false)
    expect(early.sent).toHaveLength(0)
    const late = fakePort({ invoice: stuck, now: new Date(Date.parse(claimedAt) + STALE_CLAIM_MS + 1000) })
    expect((await sendInvoice(late.port, JAN.id)).ok).toBe(true)
    expect(late.sent[0].idempotencyKey).toBe(`fin-invoice-${JAN.id}-${claimedAt}`)
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
    expect(sent[0]).toMatchObject({ to: ['operator@verbatim.test'], cc: [], bcc: [], subject: '[Test] Invoice 0011 for January 2027' })
    expect(sent[0].attachments).toHaveLength(1)
    expect(row.status).toBe('sent')
    expect(profile.holdNext).toBe(true)
    expect(profile.noteOnce).not.toBeNull()
  })
})
