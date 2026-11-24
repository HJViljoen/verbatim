import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { CostsPageBody } from '@/components/ops/costs/page-body'
import { Card } from '@/components/pages/studio/ui'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { costsAdmin } from '@/lib/costs/access'
import { CostsTablesMissing, loadCosts, type CostsData } from '@/lib/costs/load'
import { FinanceTablesMissing, loadFinance } from '@/lib/finance/load'
import { INVOICE_BUCKET } from '@/lib/finance/html'
import type { FinanceRows } from '@/lib/finance/view'
import { createAdminClient } from '@/lib/supabase-admin'

export const metadata: Metadata = { title: 'Costs' }

// Costs (operator only, 9 Oct 2026): what Verbatim costs to run, and the
// month ahead. Bills on dates, the variable spend read live from the
// database, and a plan: what each client pays against what its runs cost.
// Money in (17 Nov 2026) sits on top: invoices, payments, billing.
//
// PLATFORM ADMIN ONLY, AND A 404 FOR EVERYONE ELSE, as Readiness is: a client
// who guesses the address learns nothing from "there is no such page". It is
// a REAL 404, not a streamed 200: this folder has no loading.tsx and nothing
// above it does either (lib/dashboard-loading.test.ts, NO_LOADER), so
// notFound() runs before any byte of the page is sent. The sidebar row is the
// operator's alone (components/ops/ops-nav.tsx), every action checks again,
// and the tables answer the service role only.
export default async function CostsPage() {
  if (!(await costsAdmin())) notFound()

  const admin = createAdminClient()
  const now = new Date()
  let data: CostsData
  try {
    data = await loadCosts(admin, now)
  } catch (e) {
    if (!(e instanceof CostsTablesMissing)) throw e
    return (
      <PageFrame>
        <PageBar title="Costs" />
        <Card className="gap-2 px-[30px] py-[26px] text-[13px]">
          <p className="m-0 font-semibold">The costs tables are not in this database yet.</p>
          <p className="m-0 text-muted-foreground">Apply supabase/migrations/20261108090000_costs.sql, then reload.</p>
        </Card>
      </PageFrame>
    )
  }

  let finance: FinanceRows | null = null
  try {
    finance = await loadFinance(admin)
  } catch (e) {
    if (!(e instanceof FinanceTablesMissing)) throw e
  }

  // One signed link per printed invoice, an hour each, in one call.
  const paths = finance ? finance.invoices.flatMap((i) => (i.pdfPath ? [i.pdfPath] : [])) : []
  const pdfUrls = new Map<string, string>()
  if (paths.length) {
    const { data: signed, error } = await admin.storage.from(INVOICE_BUCKET).createSignedUrls(paths, 3600)
    if (error) console.error('costs: sign invoice PDFs:', error.message)
    for (const s of signed ?? []) if (s.path && s.signedUrl) pdfUrls.set(s.path, s.signedUrl)
  }

  return <CostsPageBody data={data} finance={finance} pdfUrls={pdfUrls} now={now} />
}
