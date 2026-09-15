import { notFound } from 'next/navigation'

import { ReadinessTable } from '@/components/ops/readiness-table'
import { PageBar, PageFrame } from '@/components/shell/page-grid'
import { PaneBody, PaneHeader } from '@/components/shell/master-list'
import { getSessionContext } from '@/lib/auth'
import { fullDate } from '@/lib/format'
import { computeReadiness, summarise } from '@/lib/readiness/compute'
import { loadReadiness } from '@/lib/readiness/load'
import { createAdminClient } from '@/lib/supabase-admin'

// Readiness (Phase 0 WP10, design item 18, decision D9) — for the workspace the
// switcher is currently viewing, one row per block of the product: the inputs
// it needs, which exist, who fixes it, and the one act that closes the gap.
// The build gate: no engineering day is spent on a block whose row is red for
// the workspace it is being built for.
//
// PLATFORM ADMIN ONLY, and 404 for everyone else. The design puts Readiness
// inside per-tenant Settings; that is Phase 1, behind `canManageTenant`. In
// Phase 0 it is an operator page, because half of what it prints is about work
// that has not shipped and every row that reads "not recorded yet" would be a
// promise to a client rather than a measurement.
//
// `notFound()` rather than a redirect: a tenant owner who guesses the URL
// should learn nothing from the answer, and "there is no such page" is the
// only reply that says nothing.
//
// The tenant is whichever workspace the switcher is on — `clientId` already IS
// the viewed workspace (`lib/auth.ts` applyOperatorView), so there is no second
// notion of "which tenant" to get out of step with the rest of the session.
export default async function ReadinessPage() {
  const { operator, clientId } = await getSessionContext()
  if (!operator) notFound()

  // Service role: the discard record is superadmin-only by policy, and the
  // change log and the decision ledger are closed to a session that is not
  // inside the workspace it is reading.
  const now = new Date()
  const inputs = await loadReadiness(createAdminClient(), clientId, now)
  const rows = computeReadiness(inputs)
  const summary = summarise(rows)

  return (
    <PageFrame>
      <PageBar
        title="Readiness"
        context={inputs.tenant}
        subtitle="What each block of the product needs from this workspace, what is there, and who can close the gap."
      >
        <span className="font-mono text-[11px] text-muted-foreground">{summary.label}</span>
      </PageBar>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-tile shadow-tile">
        <PaneHeader
          title="Inputs, block by block"
          meta={`${summary.exists} in place · ${summary.partial} partly · ${summary.missing} missing`}
        />
        <PaneBody className="px-5 py-4">
          <ReadinessTable
            rows={rows}
            title="This workspace"
            description={`Read ${fullDate(now.toISOString())}. A month counts when it carries ${inputs.floor} videos — the same floor the product compares on; comments are shown beside it because the two do not agree.`}
          />
        </PaneBody>
      </section>
    </PageFrame>
  )
}
