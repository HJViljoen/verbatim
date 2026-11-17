import { withBrowser } from '@/lib/render/chromium'

// An invoice's HTML (lib/finance/html.ts) printed to a PDF. The page's own
// `@page { size: A4 }` sets the paper; nothing is fetched (the HTML carries
// its CSS and uses system fonts), so `setContent` is the whole load.
//
// Chromium runs here only from a route or a script, never inside an Inngest
// step (AGENTS.md): the daily job fetches /api/admin/finance/invoices/[id]/render.

export async function printInvoicePdf(html: string): Promise<Buffer> {
  return withBrowser(async (page) => {
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
    return Buffer.from(pdf)
  })
}

/** How many pages a PDF holds: its page objects, counted. An invoice must be
 *  one; the render route refuses more rather than send a split invoice. */
export function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}
