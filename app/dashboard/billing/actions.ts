'use server'

import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { getBaseUrl } from '@/lib/site'
import { stripe, STRIPE_PRICE_ID } from '@/lib/stripe'

// Billing is owner-only — admins manage the product, not the money. Re-checked
// here because actions are POST-reachable regardless of what the UI renders.
export interface BillingActionState {
  ok: boolean
  message: string
}

// A platform admin viewing another tenant arrives with role 'owner', which is
// what makes the rest of the app usable from over there. Money is the one
// place that is wrong: a checkout attaches a card, and a portal session can
// cancel a live subscription — neither is something to do on a customer's
// behalf by accident, from a screen whose only cue is a small tag in the
// corner. Billing stays on your own workspace; that is deliberate, and the
// message says so rather than pretending the button failed.
const operatorElsewhere = (operator: { isHome: boolean } | null) =>
  operator !== null && !operator.isHome
const NOT_YOURS = 'You’re viewing another workspace. Switch back to your own to manage billing.'

// Start a Stripe Checkout subscription and redirect the owner to it. On success
// Stripe redirects back to /dashboard/billing; the webhook is what actually
// flips subscription_status (don't trust the return URL for entitlement).
export async function startCheckout(
  _prev: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const { clientId, role, email, operator } = await getSessionContext()
  if (operatorElsewhere(operator)) {
    return { ok: false, message: NOT_YOURS }
  }
  if (role !== 'owner') {
    return { ok: false, message: 'Only the workspace owner can manage billing.' }
  }
  if (!stripe || !STRIPE_PRICE_ID) {
    return { ok: false, message: 'Billing isn’t set up yet. Add the Stripe keys to enable it.' }
  }

  // Reuse the tenant's Stripe customer if it has one (avoids duplicate customers
  // across repeat checkouts). Read via the service role — clients carries no
  // SELECT policy exposing billing columns to members.
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('company_name, stripe_customer_id')
    .eq('id', clientId)
    .maybeSingle()

  const baseUrl = await getBaseUrl()
  let sessionUrl: string | null = null
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      // client_reference_id is how the webhook ties the checkout back to a tenant.
      client_reference_id: clientId,
      ...(client?.stripe_customer_id
        ? { customer: client.stripe_customer_id }
        : { customer_email: email }),
      success_url: `${baseUrl}/dashboard/billing?status=success`,
      cancel_url: `${baseUrl}/dashboard/billing?status=cancelled`,
      allow_promotion_codes: true,
    })
    sessionUrl = session.url
  } catch (err) {
    console.error('[stripe] checkout create failed:', err)
    return { ok: false, message: 'Could not start checkout. Please try again.' }
  }

  if (!sessionUrl) {
    return { ok: false, message: 'Stripe did not return a checkout URL.' }
  }
  redirect(sessionUrl) // throws NEXT_REDIRECT — control never returns past here
}

// Open the Stripe billing portal so an owner can update card / cancel / view
// invoices. Requires an existing Stripe customer (created at first checkout).
export async function openBillingPortal(
  _prev: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const { clientId, role, operator } = await getSessionContext()
  if (operatorElsewhere(operator)) {
    return { ok: false, message: NOT_YOURS }
  }
  if (role !== 'owner') {
    return { ok: false, message: 'Only the workspace owner can manage billing.' }
  }
  if (!stripe) {
    return { ok: false, message: 'Billing isn’t set up yet.' }
  }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('stripe_customer_id')
    .eq('id', clientId)
    .maybeSingle()

  if (!client?.stripe_customer_id) {
    return { ok: false, message: 'No billing account yet — subscribe first.' }
  }

  const baseUrl = await getBaseUrl()
  let portalUrl: string | null = null
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/billing`,
    })
    portalUrl = session.url
  } catch (err) {
    console.error('[stripe] portal create failed:', err)
    return { ok: false, message: 'Could not open the billing portal. Please try again.' }
  }

  redirect(portalUrl)
}
