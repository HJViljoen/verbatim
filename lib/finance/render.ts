import type { createAdminClient } from '@/lib/supabase-admin'
import { invoiceHtml, pdfStoragePath } from './html'
import { loadInvoiceContext, type InvoiceContext } from './load'
import { pdfPageCount, printInvoicePdf } from './pdf'
import type { InvoiceStatus } from './types'

// Printing an invoice and filing its PDF: the render route's body
// (app/api/admin/finance/invoices/[id]/render). Prints the page, refuses a PDF
// that is not one page, uploads it to the private `invoices` bucket at
// `<client_id>/<number>.pdf`, records the path, and moves a draft to `ready`.
// A sent, credited or void invoice is never printed again: what was sent is
// what the client holds.

type Admin = ReturnType<typeof createAdminClient>

export const BUCKET = 'invoices'

/** The statuses a print may run in. */
export const PRINTABLE: readonly InvoiceStatus[] = ['draft', 'ready']

export class RenderRefused extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function htmlFor(ctx: InvoiceContext): string {
  return invoiceHtml(ctx.invoice, { issuer: ctx.issuer, related: ctx.related, replacement: ctx.replacement })
}

export async function renderInvoice(admin: Admin, id: string): Promise<{ pdfPath: string; bytes: number; pages: number; status: InvoiceStatus }> {
  const ctx = await loadInvoiceContext(admin, id)
  if (!ctx) throw new RenderRefused('No such invoice.', 404)
  const inv = ctx.invoice
  if (!PRINTABLE.includes(inv.status)) throw new RenderRefused(`Invoice ${inv.number} is ${inv.status}; it is not printed again.`, 409)

  const pdf = await printInvoicePdf(htmlFor(ctx))
  const pages = pdfPageCount(pdf)
  if (pages !== 1) throw new RenderRefused(`Invoice ${inv.number} printed on ${pages} pages, not one.`, 422)

  const pdfPath = pdfStoragePath(inv)
  const up = await admin.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(`finance: upload ${pdfPath}: ${up.error.message}`)

  const now = new Date().toISOString()
  const next: InvoiceStatus = inv.status === 'draft' ? 'ready' : inv.status
  // Only while it is still printable: a send that started meanwhile wins.
  const { data, error } = await admin
    .from('fin_invoices')
    .update({ pdf_path: pdfPath, status: next, updated_at: now })
    .eq('id', id)
    .in('status', PRINTABLE as InvoiceStatus[])
    .select('status')
  if (error) throw new Error(`finance: record the PDF of ${inv.number}: ${error.message}`)
  return { pdfPath, bytes: pdf.length, pages, status: (data?.[0]?.status as InvoiceStatus | undefined) ?? next }
}
