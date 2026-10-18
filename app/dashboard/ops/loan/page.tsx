import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { LoanBody } from '@/components/ops/loan/sections'
import { Card } from '@/components/pages/studio/ui'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { todayJhb } from '@/lib/costs/dates'
import { loanAdmin } from '@/lib/family-loan/access'
import { FamilyLoanTableMissing, loadFamilyLoan } from '@/lib/family-loan/load'
import type { LoanEntry } from '@/lib/family-loan/types'
import { createAdminClient } from '@/lib/supabase-admin'

export const metadata: Metadata = { title: 'Dad' }

// The family loan (operator only, 18 Oct 2026): what the operator borrowed
// from Dad, what has been paid back, and what is still owed.
//
// PLATFORM ADMIN ONLY, AND A 404 FOR EVERYONE ELSE, as Costs is: a client who
// guesses the address learns nothing from "there is no such page". It is a
// REAL 404, not a streamed 200: this folder has no loading.tsx and nothing
// above it does either (lib/dashboard-loading.test.ts, NO_LOADER), so
// notFound() runs before any byte of the page is sent. The sidebar row is the
// operator's alone (components/ops/ops-nav.tsx), every action checks again,
// and the table answers the service role only.
export default async function LoanPage() {
  if (!(await loanAdmin())) notFound()

  let entries: LoanEntry[]
  try {
    entries = await loadFamilyLoan(createAdminClient())
  } catch (e) {
    if (!(e instanceof FamilyLoanTableMissing)) throw e
    return (
      <PageFrame>
        <PageBar title="Dad" />
        <Card className="gap-2 px-[30px] py-[26px] text-[13px]">
          <p className="m-0 font-semibold">The loan table is not in this database yet.</p>
          <p className="m-0 text-muted-foreground">Apply supabase/migrations/20261111090000_family_loan.sql, then reload.</p>
        </Card>
      </PageFrame>
    )
  }

  return <LoanBody entries={entries} today={todayJhb(new Date())} />
}
