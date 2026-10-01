import { getSessionContext } from '@/lib/auth'
import { settingsBar } from '@/lib/settings/bar'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { isStripeConfigured } from '@/lib/stripe'
import { SettingsFrame, SettingsCard, FactRow } from '@/components/settings-frame'
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
  none: 'No active plan',
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
  const accessLabel = byAgreement ? TRIAL_BY_AGREEMENT_LABEL : (REASON_LABEL[access.reason] ?? '—')

  const description =
    byAgreement ? TRIAL_BY_AGREEMENT_LINE
    : access.reason === 'comped' ? 'This workspace has complimentary full access and is never charged.'
    : access.reason === 'subscribed' ? 'Your subscription is active.'
    : access.reason === 'past_due' ? 'We couldn’t process your last payment. Update your card to keep access.'
    : access.reason === 'trialing' ? `Free trial: ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? '' : 's'} left.`
    : access.reason === 'suspended' ? 'This workspace is suspended. Contact support to reactivate.'
    : access.reason === 'pending' ? 'This workspace is set up but not yet switched on. You’ll hear from us.'
    : 'Subscribe to keep access to your dashboards and scheduled updates.'

  // THE ONE-LINE BAR (the 25 Sep rulings, market-first WP3.10), as on every
  // Settings sub-page.
  const bar = await settingsBar(supabase, clientId, client.company_name ?? 'Your workspace')
  return (
    <SettingsFrame active="billing" operator={operator != null} title="Settings" context={`${client.company_name ?? 'Your workspace'}${!isOwner ? ' · read-only' : ''}`} bar={bar} contentTitle="Plan & billing" contentMeta={byAgreement ? TRIAL_BY_AGREEMENT_LABEL : (REASON_LABEL[access.reason] ?? 'Plan')}>
      <div className="flex flex-col gap-3">
        {status === 'success' && (
          <p className="rounded-md bg-accent px-4 py-3 text-[12.5px] text-accent-foreground">Thanks. Your subscription is being activated. It may take a moment to reflect here.</p>
        )}
        {status === 'cancelled' && (
          <p className="rounded-md bg-inner px-4 py-3 text-[12.5px] text-muted-foreground">Checkout cancelled. No charge was made.</p>
        )}

        <SettingsCard title="Your plan" description={description}>
          <FactRow label="Plan">{byAgreement ? TRIAL_BY_AGREEMENT_LABEL : planLabel(client.plan)}</FactRow>
          <FactRow label="Access">{byAgreement ? 'Full access' : accessLabel}</FactRow>
          {client.trial_ends_at && access.reason === 'trialing' && <FactRow label="Trial ends">{new Date(client.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</FactRow>}
        </SettingsCard>

        <SettingsCard title="Billing" description={access.reason === 'comped' ? 'No billing action needed.' : isOwner ? 'Card, invoices and cancellation are handled by Stripe.' : 'Only the workspace owner can manage billing.'}>
          {byAgreement ? (
            <p className="text-[12.5px] text-muted-foreground">
              Nothing is charged here. To talk about pricing, write to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">{CONTACT_EMAIL}</a>.
            </p>
          ) : access.reason === 'comped' ? (
            <p className="text-[12.5px] text-muted-foreground">Nothing to do here.</p>
          ) : isOwner ? (
            <BillingControls stripeConfigured={isStripeConfigured} hasCustomer={hasCustomer} />
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Ask the owner if something needs changing.</p>
          )}
        </SettingsCard>

        <SettingsCard title="Invoices" description="Your invoice history lives in the Stripe billing portal (Manage billing). It will be listed here once billing is live for this workspace.">
          <p className="text-[12.5px] text-muted-foreground">{hasCustomer ? 'Open Manage billing to see them.' : 'No invoices yet.'}</p>
        </SettingsCard>
      </div>
    </SettingsFrame>
  )
}
