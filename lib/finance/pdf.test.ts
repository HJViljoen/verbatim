import { describe, expect, it } from 'vitest'
import { pdfPageCount } from './pdf'

// The one-page guard the render route applies. Synthetic PDF bodies; the
// real print is checked by hand (a two-page print counted 2, pdfinfo agreed
// on the one-page invoice, 17 Nov).

describe('pdfPageCount', () => {
  it('counts page objects, not the page tree', () => {
    const one = Buffer.from('%PDF-1.4\n1 0 obj <</Type /Pages /Kids [2 0 R] /Count 1>> endobj\n2 0 obj <</Type /Page /Parent 1 0 R>> endobj\n')
    const two = Buffer.from('<</Type/Pages/Count 2>> <</Type/Page>> <</Type /Page /MediaBox [0 0 595 842]>>')
    expect(pdfPageCount(one)).toBe(1)
    expect(pdfPageCount(two)).toBe(2)
    expect(pdfPageCount(Buffer.from('no pages'))).toBe(0)
  })
})
