import { currencySentence, fmtMoney } from './money'
import { fmtInvoiceDate } from './periods'
import type { Invoice, Issuer } from './types'

// The invoice and the credit note as one A4 page of HTML, for Chromium to
// print (lib/finance/pdf.ts). A port of the hand-made invoices' layout: the
// same two style blocks, the same masthead, header columns, dotted key-value
// rows, line table and payment block. Every word that is not the layout's own
// comes from the rows (the issuer, the invoice, the invoice it relates to),
// escaped. Pure.

const CSS = `<style>
  @page { size: A4; margin: 15mm 15mm 12mm 15mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #1a1a1a;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- Masthead ---- */
  .masthead { text-align: right; margin-bottom: 4mm; }
  .masthead .name {
    font-size: 30pt;
    font-weight: 200;
    letter-spacing: 0.5px;
    color: #2b2b2b;
    line-height: 1.1;
    display: block;
  }
  .masthead .rule {
    border-bottom: 0.8pt solid #4a4a4a;
    margin-top: 2mm;
    width: 100%;
  }

  /* ---- Header columns ---- */
  .head { display: flex; gap: 10mm; margin-top: 7mm; }
  .head .from { width: 46%; }
  .head .meta { width: 54%; }

  .from .who { font-weight: bold; margin-bottom: 2.5mm; }
  .from .line { color: #1a1a1a; }
  .from .email { margin-top: 4mm; }

  .meta h1 {
    font-size: 20pt;
    font-weight: bold;
    letter-spacing: -0.3px;
    margin: 0 0 6mm 0;
  }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 0.9mm 0; vertical-align: bottom; white-space: nowrap; }
  table.kv td.k { width: 1%; padding-right: 2mm; }
  table.kv td.dots {
    width: 98%;
    border-bottom: 0.6pt dotted #9a9a9a;
    padding-right: 1mm;
    padding-bottom: 1mm;
  }
  table.kv td.v { width: 1%; text-align: right; }
  table.kv tr.gap td { padding-top: 4mm; }

  /* ---- Body ---- */
  .bodyrule {
    border-bottom: 2.4pt solid #111;
    width: 42%;
    margin: 11mm 0 5mm 0;
  }
  .billto { font-weight: bold; margin-bottom: 3.5mm; }
  .subject { margin-bottom: 0.5mm; }
  .period { margin-bottom: 6mm; }

  /* ---- Line items ---- */
  table.items { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.items th {
    font-weight: normal;
    color: #6b6b6b;
    text-align: right;
    padding: 0 0 2.5mm 0;
    border-bottom: 0.5pt solid #d5d5d5;
    white-space: nowrap;
  }
  table.items th.nr, table.items th.desc { text-align: left; }
  table.items td {
    padding: 2.9mm 0;
    border-bottom: 0.5pt solid #e3e3e3;
    text-align: right;
    white-space: nowrap;
  }
  table.items td.nr { text-align: left; width: 8mm; }
  table.items td.desc { text-align: left; white-space: normal; }
  table.items .qty { width: 15mm; }
  table.items .unit { width: 13mm; }
  table.items .price { width: 20mm; }
  table.items .amount { width: 20mm; }

  tr.total td {
    border-bottom: none;
    padding-top: 6mm;
    font-weight: bold;
    font-size: 10.5pt;
  }
  tr.total td.label { text-align: right; }

  .note { color: #8a8a8a; font-size: 8.5pt; margin-top: 6mm; }

  /* ---- Payment ---- */
  .payrule { border-bottom: 0.5pt solid #d5d5d5; margin: 10mm 0 6mm 0; }
  .payhead { font-weight: bold; margin-bottom: 4mm; }
  table.pay { width: 100%; border-collapse: collapse; }
  table.pay td { padding: 1.1mm 0; vertical-align: top; }
  table.pay td.lbl { color: #6b6b6b; width: 46mm; }
</style>
<style>
  .kvrow { display: flex; align-items: baseline; padding: 0.9mm 0; white-space: nowrap; }
  .kvrow.gap { padding-top: 4mm; }
  .kvrow .lead { flex: 1; border-bottom: 0.6pt dotted #9a9a9a; margin: 0 1mm 0 2mm; }
  .bodyrule { margin: 9mm 0 4.5mm 0; }
  .payrule { margin: 8mm 0 5mm 0; }
  table.settle td.amt { text-align: right; width: 30mm; }
  table.settle tr.bal td { font-weight: bold; border-top: 0.5pt solid #d5d5d5; padding-top: 2mm; }
</style>`

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const e = escapeHtml

/** What a page needs beyond the invoice row itself. */
export interface RenderContext {
  issuer: Issuer
  /** An invoice that replaces another: the one it replaces. A credit note:
   *  the invoice it cancels. */
  related?: Pick<Invoice, 'number' | 'currency' | 'issuedOn' | 'total'> | null
  /** A credit note: the invoice that replaced the one it cancels, if any. */
  replacement?: Pick<Invoice, 'number' | 'currency' | 'total'> | null
}

/** The payment reference an invoice asks for: "INV-0011". */
export const paymentReference = (number: string): string => `INV-${number}`

/** "Invoice 0011", "Credit note CN-0005". */
export const documentName = (i: Pick<Invoice, 'kind' | 'number'>): string =>
  `${i.kind === 'credit_note' ? 'Credit note' : 'Invoice'} ${i.number}`

/** The words under the lines: the currency, the conversion, the invoice's own. */
export function footnote(i: Pick<Invoice, 'currency' | 'fxNote' | 'note'>): string {
  return [currencySentence(i.currency), i.fxNote, i.note].filter((s): s is string => Boolean(s && s.trim())).join(' ')
}

function kvRows(rows: [string, string][], gapAt: number): string {
  return rows
    .map(([k, v], n) => `    <div class="kvrow${n === gapAt ? ' gap' : ''}"><span class="k">${k}</span><span class="lead"></span><span class="v">: ${e(v)}</span></div>`)
    .join('\n')
}

/**
 * The page for an invoice or a credit note. One A4 page: the layout holds up
 * to about eight lines on one page, which a month's bill never comes near.
 */
export function invoiceHtml(inv: Invoice, ctx: RenderContext): string {
  const { issuer } = ctx
  const credit = inv.kind === 'credit_note'
  const related = ctx.related ?? null
  const sign = credit ? -1 : 1

  const dated: [string, string][] = credit
    ? [['Credit note&nbsp;#', inv.number], ['Date', fmtInvoiceDate(inv.issuedOn)], ['Page', '1 of 1']]
    : [['Invoice&nbsp;#', inv.number], ['Invoice date', fmtInvoiceDate(inv.issuedOn)], ['Due date', inv.dueOn ? fmtInvoiceDate(inv.dueOn) : 'On receipt']]
  const refs: [string, string][] = [
    ...(related ? [[credit ? 'Credits invoice' : 'Replaces invoice', credit ? related.number : `${related.number} (${related.currency})`] as [string, string]] : []),
    ...(inv.yourRef ? [['Your ref.', inv.yourRef] as [string, string]] : []),
    ['Our ref.', issuer.name],
  ]

  const subject = inv.subjectLine.trim()
    || (credit && related ? `Credit note — cancels invoice ${related.number} (${related.currency}) in full` : '')

  const items = inv.lines
    .map((l, n) => `      <tr>
        <td class="nr">${n + 1}</td>
        <td class="desc">${e(l.description)}</td>
        <td class="qty">${l.qty}</td><td class="unit">${e(l.unit)}</td><td class="price">${fmtMoney(l.unitPrice, inv.currency)}</td><td class="amount">${fmtMoney(sign * l.amount, inv.currency)}</td>
      </tr>`)
    .join('\n')

  const pay = credit
    ? `  <div class="payhead">Settlement</div>
  <table class="pay settle">${related ? `
    <tr><td class="lbl">Invoice ${e(related.number)} (${fmtInvoiceDate(related.issuedOn)})</td><td class="amt">${fmtMoney(related.total, related.currency)}</td></tr>
    <tr><td class="lbl">Less: credit note ${e(inv.number)}</td><td class="amt">${fmtMoney(-inv.total, inv.currency)}</td></tr>
    <tr class="bal"><td class="lbl">Balance due on invoice ${e(related.number)}</td><td class="amt">${fmtMoney(Math.max(0, related.total - inv.total), related.currency)}</td></tr>` : ''}${ctx.replacement ? `
    <tr><td class="lbl" style="padding-top:4mm">Replaced by invoice ${e(ctx.replacement.number)} (${ctx.replacement.currency})</td><td class="amt" style="padding-top:4mm">${fmtMoney(ctx.replacement.total, ctx.replacement.currency)}</td></tr>` : ''}
  </table>`
    : `  <div class="payhead">Payment details</div>
  <table class="pay">
${[...issuer.bankLines.map((b) => [b.label, b.value]), ['Payment reference', paymentReference(inv.number)]]
    .map(([k, v]) => `    <tr><td class="lbl">${e(k)}</td><td>${e(v)}</td></tr>`)
    .join('\n')}
  </table>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(documentName(inv))} — ${e(inv.billTo)}</title>
${CSS}
</head>
<body>

  <div class="masthead">
    <span class="name">${e(issuer.name)}</span>
    <div class="rule"></div>
  </div>

  <div class="head">
    <div class="from">
      <div class="who">${e(issuer.name)}</div>
${issuer.addressLines.map((l) => `      <div class="line">${e(l)}</div>`).join('\n')}${issuer.email ? `
      <div class="email">${e(issuer.email)}</div>` : ''}
    </div>

    <div class="meta">
      <h1>${credit ? 'CREDIT NOTE' : 'INVOICE'}</h1>
${kvRows([...dated, ...refs], dated.length)}
    </div>
  </div>

  <div class="bodyrule"></div>
  <div class="billto">${e(inv.billTo)}</div>
  <div class="subject">${e(subject)}</div>
  <div class="period">Billing period: ${e(inv.periodLabel)}</div>

  <table class="items">
    <thead>
      <tr>
        <th class="nr">Nr.</th>
        <th class="desc">Tekst</th>
        <th class="qty">Quantity</th>
        <th class="unit">Unit</th>
        <th class="price">Unit price</th>
        <th class="amount">Price</th>
      </tr>
    </thead>
    <tbody>
${items}
      <tr class="total">
        <td colspan="5" class="label">${credit ? 'Total credit' : 'Total'} (${inv.currency})</td>
        <td class="amount">${fmtMoney(sign * inv.total, inv.currency)}</td>
      </tr>
    </tbody>
  </table>

  <div class="note">${e(footnote(inv))}</div>

  <div class="payrule"></div>

${pay}

</body>
</html>
`
}

/** The PDF's file name: "Invoice-0011-Acme-SA-ZAR-2026-12-15.pdf". */
export function pdfFileName(i: Pick<Invoice, 'kind' | 'number' | 'billTo' | 'currency' | 'issuedOn'>): string {
  const who = i.billTo.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${i.kind === 'credit_note' ? 'CreditNote' : 'Invoice'}-${i.number}-${who || 'client'}-${i.currency}-${i.issuedOn}.pdf`
}

/** Where its PDF lives in the private `invoices` bucket. */
export const pdfStoragePath = (i: Pick<Invoice, 'clientId' | 'number'>): string => `${i.clientId}/${i.number}.pdf`
