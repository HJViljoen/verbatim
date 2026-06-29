"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import {
  startCheckout,
  openBillingPortal,
  type BillingActionState,
} from "./actions"

const idle: BillingActionState = { ok: true, message: "" }

// Owner-only billing controls. The page decides which of these to mount based on
// whether the tenant already has a Stripe customer; this component just wires the
// server actions (each redirects to Stripe on success, or returns a message).
export function BillingControls({
  stripeConfigured,
  hasCustomer,
}: {
  stripeConfigured: boolean
  hasCustomer: boolean
}) {
  const [checkoutState, checkout, checkoutPending] = useActionState(startCheckout, idle)
  const [portalState, portal, portalPending] = useActionState(openBillingPortal, idle)

  if (!stripeConfigured) {
    return (
      <p className="text-sm text-muted-foreground">
        Billing isn’t set up yet. Add the Stripe keys (<code>STRIPE_SECRET_KEY</code>,{" "}
        <code>STRIPE_PRICE_ID</code>, <code>STRIPE_WEBHOOK_SECRET</code>) to enable subscriptions.
      </p>
    )
  }

  const error = !checkoutState.ok ? checkoutState.message : !portalState.ok ? portalState.message : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {hasCustomer ? (
          <form action={portal}>
            <Button type="submit" variant="outline" disabled={portalPending}>
              {portalPending ? "Opening…" : "Manage billing"}
            </Button>
          </form>
        ) : (
          <form action={checkout}>
            <Button type="submit" disabled={checkoutPending}>
              {checkoutPending ? "Starting…" : "Subscribe"}
            </Button>
          </form>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
