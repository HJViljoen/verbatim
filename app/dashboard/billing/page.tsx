import { CreditCard } from 'lucide-react'
import { getSessionContext } from '@/lib/auth'
import { billingAccess, type BillingClient } from '@/lib/billing'
import { isStripeConfigured } from '@/lib/stripe'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BillingControls } from './billing-ui'

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
  const { supabase, clientId, role } = await getSessionContext()
  const status = (await searchParams)?.status

  // RLS lets a member read their own client row; billing columns ride along on it.
  // select('*') so this still renders before the Phase 6 migration is applied
  // (the new columns are simply absent → treated as no comp / no subscription).
  const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
  const client = (data ?? {}) as ClientBillingRow

  const access = billingAccess(client)
  const isOwner = role === 'owner'
  const hasCustomer = Boolean(client.stripe_customer_id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          {client.company_name ?? 'Your workspace'}
          {!isOwner && ' · read-only'}
        </p>
      </div>

      {status === 'success' && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4 text-sm">
            Thanks — your subscription is being activated. It may take a moment to reflect here.
          </CardContent>
        </Card>
      )}
      {status === 'cancelled' && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Checkout cancelled — no charge was made.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="size-4 text-primary" aria-hidden /> {REASON_LABEL[access.reason] ?? 'Plan'}</CardTitle>
          <CardDescription>
            {access.reason === 'comped' &&
              'This workspace has complimentary full access and is never charged.'}
            {access.reason === 'subscribed' && 'Your subscription is active.'}
            {access.reason === 'past_due' &&
              'We couldn’t process your last payment. Update your card to keep access.'}
            {access.reason === 'trialing' &&
              `Free trial — ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? '' : 's'} left.`}
            {access.reason === 'suspended' &&
              'This workspace is suspended. Contact support to reactivate.'}
            {access.reason === 'none' &&
              'Subscribe to keep access to your dashboards and scheduled runs.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {access.reason === 'comped' ? (
            <p className="text-sm text-muted-foreground">No billing action needed.</p>
          ) : isOwner ? (
            <BillingControls stripeConfigured={isStripeConfigured} hasCustomer={hasCustomer} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only the workspace owner can manage billing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
