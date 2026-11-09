import { getSessionContext } from '@/lib/auth'
import { appDay } from '@/lib/format'
import { settingsBar } from '@/lib/settings/bar'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { isStripeConfigured } from '@/lib/stripe'
import type { ReactNode } from 'react'
import { SettingsFrame } from '@/components/settings-frame'
import { Card } from '@/components/pages/studio/ui'
import { EmptyBox, STAT_STRIP_COLS, StatStripCell, type StatItem } from '@/components/v2/ui'
import { cn } from '@/lib/utils'
import { planLabel, TRIAL_BY_AGREEMENT, TRIAL_BY_AGREEMENT_LABEL, TRIAL_BY_AGREEMENT_LINE } from '@/lib/billing-copy'
import { CONTACT_EMAIL } from '@/lib/legal'
import { BillingControls } from './billing-ui'
import type { Metadata } from 'next'
import { surface } from '@/lib/nav'

// The tab's title is the page's own name (finish-list item 25 polish; the root
// layout's template adds ' · Verbatim').
export const metadata: Metadata = { title: `Plan & billing · ${surface('settings').label}` }

// Billing — current plan + subscription state. Owners get the Stripe controls;
// everyone else sees a read-only summary (billing is owner-only). Entitlement is
// driven by billingAccess() so the comp bypass (partners / Ossur) is consistent
// with the rest of the app.
//
// SINCE THE AUDIT DESIGN (7 Nov, Settings-Billing.dc.html): "Your plan" a
// white tile with its line and a figures row (Plan, Access, and Trial ends
// while on trial) in place of the fact rows; Billing and Invoices side by
// side from 1024, each with its state in the dashed box where there is
// nothing to do; the access shown once (no meta beside the title). No render
// test covers this page: it is checked on the dev server.

interface ClientBillingRow extends BillingClient {
  company_name?: string | null
  plan?: string | null
  stripe_customer_id?: string | null
}

const REASON_LABEL: Record<string, string> = {
  comped: 'Complimentary access',
  subscribed: 'Active subscription',
  past_due: 'Payment past due',
  trialing: 'Free trial',
  suspended: 'Suspended',
  pending: 'Not switched on yet',
  none: 'No active plan',
}

/** A tile on this page: its 18px title, its line, then what it holds. */
function Tile({ title, line, muted = false, children }: { title: string; line: ReactNode; muted?: boolean; children?: ReactNode }) {
  return (
    <Card className="gap-3 p-[26px] max-sm:p-[18px]">
      <h3 className="m-0 text-[18px] font-semibold leading-[1.3]">{title}</h3>
      <p className={cn('m-0 text-[15px] leading-[1.55]', muted && 'text-secondary-foreground')}>{line}</p>
      {children}
    </Card>
  )
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const { supabase, clientId, role, operator } = await getSessionContext()
  const status = (await searchParams)?.status

  // RLS lets a member read their own client row; billing columns ride along on it.
  // select('*') so this still renders before the Phase 6 migration is applied
  // (the new columns are simply absent → treated as no comp / no subscription).
  //
  // NO "Updates" ROW (27 Sep, Heinrich: "remove cadence from settings, and
  // always have it weekly on sunday"). It printed the stored cadence, "Weekly ·
  // Sundays" or "Paused"; every workspace is now weekly, on Sunday, and the
  // pause is the operator's (lib/update-rhythm.ts), so Settings shows neither.
  const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
  const client = (data ?? {}) as ClientBillingRow

  const access = billingAccess(client)
  const isOwner = role === 'owner'
  const hasCustomer = Boolean(client.stripe_customer_id)
  // A FREE TRIAL PRICED WITH HEINRICH (lib/billing-copy.ts, a default): the
  // comp stays in the database and in `billingAccess`; only the words change.
  const byAgreement = TRIAL_BY_AGREEMENT.has(clientId)
  const accessLabel = byAgreement ? TRIAL_BY_AGREEMENT_LABEL : (REASON_LABEL[access.reason] ?? 'Not set')

  const description =
    byAgreement ? TRIAL_BY_AGREEMENT_LINE
    : access.reason === 'comped' ? 'This workspace has complimentary full access and is never charged.'
    : access.reason === 'subscribed' ? 'Your subscription is active.'
    : access.reason === 'past_due' ? 'We couldn’t process your last payment. Update your card to keep access.'
    : access.reason === 'trialing' ? `Free trial: ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? '' : 's'} left.`
    : access.reason === 'suspended' ? 'This workspace is suspended. Contact support to reactivate.'
    : access.reason === 'pending' ? 'This workspace is set up but not yet switched on. You’ll hear from us.'
    : 'Subscribe to keep access to your dashboards and scheduled updates.'

  // The plan's figures row: Plan, Access, and while on trial the day it ends.
  const plan: StatItem[] = [
    { key: 'plan', term: 'Plan', value: byAgreement ? TRIAL_BY_AGREEMENT_LABEL : planLabel(client.plan) },
    { key: 'access', term: 'Access', value: byAgreement ? 'Full access' : accessLabel },
    ...(client.trial_ends_at && access.reason === 'trialing'
      ? [{ key: 'trial', term: 'Trial ends', value: appDay(client.trial_ends_at) }]
      : []),
  ]

  // THE ONE-LINE BAR (the 25 Sep rulings, market-first WP3.10), as on every
  // Settings sub-page.
  const bar = await settingsBar(supabase, clientId, client.company_name ?? 'Your workspace')
  return (
    <SettingsFrame active="billing" operator={operator != null} title="Settings" context={`${client.company_name ?? 'Your workspace'}${!isOwner ? ', read-only' : ''}`} bar={bar} contentTitle="Plan & billing">
      <div className="flex max-w-[1060px] flex-col gap-5">
        {status === 'success' && (
          <p role="status" className="m-0 rounded-[10px] bg-accent px-4 py-3 text-[14px] text-accent-foreground">Thanks. Your subscription is being activated. It may take a moment to reflect here.</p>
        )}
        {status === 'cancelled' && (
          <p role="status" className="m-0 rounded-[10px] bg-inner px-4 py-3 text-[14px] text-secondary-foreground">Checkout cancelled. No charge was made.</p>
        )}

        <Card className="p-[26px] max-sm:p-[18px]">
          <h3 className="m-0 text-[18px] font-semibold leading-[1.3]">Your plan</h3>
          <p className="m-0 mt-1.5 text-[15px] leading-[1.55] text-secondary-foreground">{description}</p>
          <dl className={cn('m-0 mt-5 grid grid-cols-1 gap-6 border-t border-border pt-[18px]', STAT_STRIP_COLS[plan.length])}>
            {plan.map((item) => <StatStripCell key={item.key} item={item} />)}
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Tile title="Billing" line={access.reason === 'comped' ? 'No billing action needed.' : isOwner ? 'Card, invoices and cancellation are handled by Stripe.' : 'Only the workspace owner can manage billing.'}>
            {byAgreement ? (
              <EmptyBox>
                Nothing is charged here. To talk about pricing, write to{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline decoration-control underline-offset-4 hover:decoration-foreground">{CONTACT_EMAIL}</a>.
              </EmptyBox>
            ) : access.reason === 'comped' ? (
              <EmptyBox>Nothing to do here.</EmptyBox>
            ) : isOwner ? (
              <BillingControls stripeConfigured={isStripeConfigured} hasCustomer={hasCustomer} />
            ) : (
              <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">Ask the owner if something needs changing.</p>
            )}
          </Tile>

          <Tile title="Invoices" muted line="Your invoice history lives in the Stripe billing portal (Manage billing). It will be listed here once billing is live for this workspace.">
            {hasCustomer ? (
              <p className="m-0 text-[15px] leading-[1.55]">Open Manage billing to see them.</p>
            ) : (
              <EmptyBox>No invoices yet.</EmptyBox>
            )}
          </Tile>
        </div>
      </div>
    </SettingsFrame>
  )
}
