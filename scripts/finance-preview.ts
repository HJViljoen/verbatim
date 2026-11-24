import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { invoiceEmail } from '../lib/finance/email'
import { invoiceHtml, pdfFileName } from '../lib/finance/html'
import { issueArgs } from '../lib/finance/issue'
import { nextBillablePeriod } from '../lib/finance/periods'
import { pdfPageCount, printInvoicePdf } from '../lib/finance/pdf'
import { profileFromRow } from '../lib/finance/rows'
import type { Seed, SeedInvoice } from '../lib/finance/seed'
import type { Invoice, Issuer } from '../lib/finance/types'

/**
 * Print an invoice from the finance seed, locally, with the product's own
 * page and Chromium (CHROME_PATH, else the Mac's Chrome). Connects to
 * nothing and sends nothing.
 *
 *   # the invoice the daily job would issue on a day, numbered from the seed's counter
 *   node --import tsx scripts/finance-preview.ts --seed <seed> --day 2026-12-15 --out <dir>
 *   # one already in the seed (a credit note, a replacement), printed again
 *   node --import tsx scripts/finance-preview.ts --seed <seed> --number CN-0001 --out <dir>
 *
 * Writes the PDF and its HTML to --out, says how many pages it printed on,
 * and prints the email that would carry it (the issued one).
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const die = (msg: string): never => {
  console.error(`finance-preview: ${msg}`)
  process.exit(1)
}

const fromSeed = (i: SeedInvoice, byNumber: Map<string, SeedInvoice>): Invoice => ({
  id: `seed:${i.number}`, number: i.number, kind: i.kind ?? (i.number.startsWith('CN-') ? 'credit_note' : 'invoice'),
  clientId: i.client_id, profileId: null, billTo: i.bill_to, subjectLine: i.subject_line ?? '', yourRef: i.your_ref ?? null,
  periodLabel: i.period_label, periodStart: i.period_start ?? null, issuedOn: i.issued_on, dueOn: i.due_on ?? null, currency: i.currency,
  fxNote: i.fx_note ?? null, lines: i.lines.map((l) => ({ description: l.description, qty: l.qty, unit: l.unit ?? 'month', unitPrice: l.unit_price, amount: l.amount })),
  total: i.total, relatesTo: i.relates_to && byNumber.has(i.relates_to) ? `seed:${i.relates_to}` : null, status: i.status, expectedOn: null,
  sentAt: i.sent_at ?? null, pdfPath: null, emailMessageId: null, sendError: null, sendClaimedAt: null, note: i.note ?? null,
})

async function main() {
  const seed = JSON.parse(readFileSync(resolve(arg('--seed') ?? die('--seed <path> is required')), 'utf8')) as Seed
  const out = resolve(arg('--out') ?? die('--out <dir> is required'))
  mkdirSync(out, { recursive: true })
  const issuer: Issuer = {
    name: seed.issuer.name, addressLines: seed.issuer.address_lines, email: seed.issuer.email ?? null,
    bankLines: seed.issuer.bank_lines, emailFrom: seed.issuer.email_from ?? null, replyTo: seed.issuer.reply_to ?? null,
  }
  const byNumber = new Map(seed.invoices.map((i) => [i.number, i]))

  let inv: Invoice
  let related: Invoice | null = null
  let replacement: Invoice | null = null
  let profile = null
  const day = arg('--day')
  const number = arg('--number')
  if (day) {
    const p = seed.profiles[0] ?? die('the seed has no billing profile')
    profile = profileFromRow({ ...p, id: 'seed:profile' })
    const billed = seed.invoices.filter((i) => (i.kind ?? 'invoice') === 'invoice' && i.client_id === p.client_id && i.period_start && i.status !== 'credited' && i.status !== 'void').map((i) => i.period_start as string)
    const month = nextBillablePeriod(profile, billed, day) ?? die(`nothing is issued on ${day}`)
    const a = issueArgs(profile, month)
    inv = {
      id: 'preview', number: String(seed.counters.invoice).padStart(4, '0'), kind: 'invoice', clientId: p.client_id, profileId: profile.id,
      billTo: profile.billTo, subjectLine: profile.subjectLine, yourRef: profile.yourRef, periodLabel: month.periodLabel, periodStart: month.periodStart,
      issuedOn: month.issuedOn, dueOn: month.dueOn, currency: profile.currency, fxNote: a.p_fx_note as string | null,
      lines: (a.p_lines as { description: string; qty: number; unit: string; unit_price: number; amount: number }[]).map((l) => ({ description: l.description, qty: l.qty, unit: l.unit, unitPrice: l.unit_price, amount: l.amount })),
      total: a.p_total as number, relatesTo: null, status: 'ready', expectedOn: null, sentAt: null, pdfPath: 'preview',
      emailMessageId: null, sendError: null, sendClaimedAt: null, note: a.p_note as string | null,
    }
  } else if (number) {
    const s = byNumber.get(number) ?? die(`${number} is not in the seed`)
    inv = fromSeed(s, byNumber)
    if (s.relates_to && byNumber.has(s.relates_to)) related = fromSeed(byNumber.get(s.relates_to) as SeedInvoice, byNumber)
    if (inv.kind === 'credit_note' && s.relates_to) {
      const r = seed.invoices.find((x) => (x.kind ?? 'invoice') === 'invoice' && x.relates_to === s.relates_to && x.number !== s.relates_to)
      if (r) replacement = fromSeed(r, byNumber)
    }
  } else {
    return die('--day <YYYY-MM-DD> or --number <number>')
  }

  const html = invoiceHtml(inv, { issuer, related, replacement })
  const pdf = await printInvoicePdf(html)
  const base = pdfFileName(inv).replace(/\.pdf$/, '')
  writeFileSync(join(out, `${base}.html`), html)
  writeFileSync(join(out, `${base}.pdf`), pdf)
  console.log(`${inv.number}: ${inv.periodLabel}, ${inv.currency} ${inv.total.toFixed(2)}, issued ${inv.issuedOn}, due ${inv.dueOn ?? 'on receipt'}`)
  console.log(`printed on ${pdfPageCount(pdf)} page(s): ${join(out, `${base}.pdf`)}`)
  if (profile) {
    const mail = invoiceEmail(inv, issuer, profile)
    console.log(`\nthe email it would carry (not sent):\nfrom ${mail.from}  reply-to ${mail.replyTo}\nto ${mail.to.join(', ')}  cc ${mail.cc.join(', ')}  bcc ${mail.bcc.join(', ')}\nsubject ${mail.subject}\nattachment ${mail.filename}\n\n${mail.text}`)
  }
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)))
