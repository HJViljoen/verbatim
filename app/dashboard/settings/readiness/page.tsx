import { notFound, redirect } from 'next/navigation'

import { ReadinessTable } from '@/components/ops/readiness-table'
import { SettingsFrame } from '@/components/settings-frame'
import { Card } from '@/components/pages/studio/ui'
import { canManageTenant, getSessionContext } from '@/lib/auth'
import { appDay } from '@/lib/format'
import { gateAccessFor } from '@/lib/gate-record'
import { computeReadiness } from '@/lib/readiness/compute'
import { loadReadiness } from '@/lib/readiness/load'
import { CLIENT_NEXT_LABEL, clientReadiness, NOT_BUILT, READINESS_CONTACT } from '@/lib/settings/readiness-view'
import { adviceTally } from '@/lib/pages/market-surface'
import { CONFIG_CHANGES_TABLE } from '@/lib/config-log'
import { settingsBar } from '@/lib/settings/bar'
import { tenantLocked } from '@/lib/tenant-locks'
import type { Metadata } from 'next'
import { surface, tenantAway } from '@/lib/nav'
import { settingsSubPage } from '@/lib/settings/rail'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: `${settingsSubPage('readiness').label} · ${surface('settings').label}` }

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
  const session = await getSessionContext()
  // A tenant no longer reaches this page (lib/nav.ts TENANT_RETIRED, 1 Oct); the operator keeps it.
  const away = tenantAway(session, '/dashboard/settings/readiness')
  if (away) redirect(away)
  const { supabase, clientId, role, operator } = session
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

  // WHAT THE ROWS NEED TO BE TRUE FOR A CLIENT (sw-2 item 6): Your moves' own
  // advice count, and the day the search terms last changed. Two small reads,
  // each fail-soft (a row keeps its own words without its fact).
  const [advice, searchChangedAt] = await Promise.all([
    adviceTally(supabase, clientId),
    // THE WORDS, the row's own subject: an update's own rewrite of the
    // community list (a probe's figures) is not a change to what we search.
    supabase.from(CONFIG_CHANGES_TABLE).select('changed_at').eq('client_id', clientId)
      .eq('surface', 'terms')
      .order('changed_at', { ascending: false }).limit(1).maybeSingle()
      .then((r) => (r.error ? null : ((r.data?.changed_at as string | undefined) ?? null)), () => null),
  ])

  // Delivery reads "Set up with Heinrich" only where sending is his (the
  // tenant lock); any other tenant turns its own delivery on.
  const view = clientReadiness(all, {
    by: { retention: due },
    sendingLocked: tenantLocked(clientId, 'sends'),
    facts: { inputs, searchesHeld: tenantLocked(clientId, 'tracking'), searchChangedAt, advice },
  })
  const bar = await settingsBar(supabase, clientId, inputs.tenant, now.toISOString())
  // "Not built yet", grouped by page in the order the pages first come.
  const notBuiltByPage: [string, string[]][] = []
  for (const n of NOT_BUILT) {
    const group = notBuiltByPage.find(([page]) => page === n.page)
    if (group) group[1].push(n.what)
    else notBuiltByPage.push([n.page, [n.what]])
  }

  return (
    <SettingsFrame
      active="readiness"
      operator
      title="Settings"
      context={inputs.tenant}
      bar={bar}
      contentTitle="Readiness"
    >
      <div className="flex flex-col gap-5">
        <Card className="px-[30px] pt-[30px] pb-2 max-sm:px-[18px] max-sm:pt-[18px]">
          <ReadinessTable
            rows={view.rows}
            title="What each part of the product needs from this workspace"
            description={`Read ${appDay(now.toISOString())}. ${READINESS_CONTACT}`}
            nextLabel={CLIENT_NEXT_LABEL}
          />
        </Card>
        <Card className="p-[30px] max-sm:p-[18px]">
          <h2 className="m-0 text-[21px] font-semibold leading-[1.3]">Not built yet on the reading pages</h2>
          {/* Grouped by page, three to a row (the board's), each page's items
              a list in the order they come. */}
          <div className="mt-[18px] grid grid-cols-1 gap-7 md:grid-cols-3">
            {notBuiltByPage.map(([page, items]) => (
              <div key={page}>
                <h3 className="m-0 mb-2 text-[16px] font-semibold">{page}</h3>
                <ul className="m-0 flex list-disc flex-col gap-2 pl-[18px] text-[14.5px] leading-[1.6] text-secondary-foreground">
                  {items.map((what) => <li key={what}>{what}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </SettingsFrame>
  )
}
