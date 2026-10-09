import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { CostsBody } from '@/components/ops/costs/sections'
import { Card } from '@/components/pages/studio/ui'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { costsAdmin } from '@/lib/costs/access'
import { CostsTablesMissing, loadCosts, type CostsData } from '@/lib/costs/load'
import { createAdminClient } from '@/lib/supabase-admin'

export const metadata: Metadata = { title: 'Costs' }

// Costs (operator only, 9 Oct 2026): what Verbatim costs to run, and the
// month ahead. Bills on dates, the variable spend read live from the
// database, and a plan: what each client pays against what its runs cost.
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

  let data: CostsData
  try {
    data = await loadCosts(createAdminClient(), new Date())
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

  return <CostsBody data={data} />
}
