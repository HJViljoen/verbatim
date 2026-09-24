import { notFound } from 'next/navigation'

import { ReadinessTable } from '@/components/ops/readiness-table'
import { SettingsFrame } from '@/components/settings-frame'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { fullDate } from '@/lib/format'
import { gateAccessFor } from '@/lib/gate-record'
import { computeReadiness } from '@/lib/readiness/compute'
import { loadReadiness } from '@/lib/readiness/load'
import { clientReadiness, NOT_BUILT } from '@/lib/settings/readiness-view'

// Settings › Readiness (Phase 1 WP16, design ST1, decision V) — what each part
// of the product needs from THIS workspace, what is there, and who closes the
// gap. The same `computeReadiness` the operator page runs, filtered to the rows
// that are a measurement of the workspace rather than a line of our roadmap,
// and re-worded where the sentence was written for us.
//
// GATED canManageTenant, NOT NOTFOUND. The operator page 404s for a tenant
// because the existence of an operator console is not a tenant's business;
// this page is theirs, and a member who lands on it should be told it is for
// owners and admins rather than told it does not exist. The rows name money,
// coverage and what we have not built, which is the same line Billing and the
// settings form already draw.
//
// THE READ RUNS ON `session.supabase`. For a tenant owner that is their own
// client and RLS is the gate; for an operator standing in this workspace
// through the switcher it is already the service-role client (lib/auth.ts
// applyOperatorView). One code path, two regimes — which is only honest
// because M8 gave `gate_verdicts` a tenant policy: without it row 8's read
// comes back empty rather than forbidden, and the row would confidently print
// "what was looked at and set aside is not recorded at all" — so until M8 is
// applied the load is told which client it is on and row 8 withholds its
// discard half instead of measuring a silence.
export default async function SettingsReadinessPage() {
  const { supabase, clientId, role, operator } = await getSessionContext()
  if (!canManageTenant(role)) notFound()

  const now = new Date()
  // Which client `supabase` is. Row 8 reads the gate's record, and a tenant
  // session's read of it is emptied by RLS rather than refused until M8 lands
  // (lib/gate-record.ts) — the one row on this page whose answer depends on who
  // is asking.
  const inputs = await loadReadiness(supabase, clientId, now, { gate: gateAccessFor(operator) })
  const all = computeReadiness(inputs)

  // The one row with a date anybody can name: the next batch of comments falls
  // due `dueAfterDays` after it was last read. Everything else the product owes
  // this workspace has no date, and inventing one would be a promise nobody
  // made (`lib/settings/readiness-view.ts`).
  const cohort = inputs.retention.cohortDay
  const due = cohort
    ? new Date(Date.parse(`${cohort}T00:00:00Z`) + inputs.retention.dueAfterDays * 86_400_000)
      .toISOString().slice(0, 10)
    : null

  const view = clientReadiness(all, { by: { retention: due } })

  return (
    <SettingsFrame
      active="readiness"
      title="Settings"
      context={inputs.tenant}
      contentTitle="Readiness"
      contentMeta={view.summary.label}
    >
      <div className="flex flex-col gap-3">
        <ReadinessTable
          rows={view.rows}
          title="What each part of the product needs from this workspace"
          description={`Read ${fullDate(now.toISOString())}. A month counts when it carries ${inputs.floor} videos, the same floor the product compares on.`}
        />
        <section className="rounded-md bg-inner px-4 py-3.5">
          <h3 className="text-[14px] font-semibold">Not built yet on the reading pages</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {NOT_BUILT.map((n) => (
              <li key={n.what} className="flex gap-2 text-[12px] leading-[1.45] text-secondary-foreground">
                <span className="w-[84px] shrink-0 font-mono text-[11px] text-muted-foreground">{n.page}</span>
                {n.what}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SettingsFrame>
  )
}
