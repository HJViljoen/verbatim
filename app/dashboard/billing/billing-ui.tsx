"use client"

import { useActionState } from "react"
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/v2/look"
import { cn } from "@/lib/utils"
import {
  startCheckout,
  openBillingPortal,
  type BillingActionState,
} from "./actions"

const idle: BillingActionState = { ok: true, message: "" }

// Owner-only billing controls. The page decides which of these to mount based on
// whether the tenant already has a Stripe customer; this component just wires the
// server actions (each redirects to Stripe on success, or returns a message).
// Since the audit design (7 Nov, Settings-Billing.dc.html): Manage billing the
// white button, Subscribe the yellow one; the Stripe keys named in sans.
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
      <p className="m-0 text-[15px] leading-[1.55] text-secondary-foreground">
        Billing isn’t set up yet. Add the Stripe keys (<span className="font-semibold">STRIPE_SECRET_KEY</span>,{" "}
        <span className="font-semibold">STRIPE_PRICE_ID</span>, <span className="font-semibold">STRIPE_WEBHOOK_SECRET</span>) to enable subscriptions.
      </p>
    )
  }

  const error = !checkoutState.ok ? checkoutState.message : !portalState.ok ? portalState.message : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {hasCustomer ? (
          <form action={portal}>
            <button type="submit" disabled={portalPending} className={cn(BTN_SECONDARY, "max-sm:h-11")}>
              {portalPending ? "Opening…" : "Manage billing"}
            </button>
          </form>
        ) : (
          <form action={checkout}>
            <button type="submit" disabled={checkoutPending} className={cn(BTN_PRIMARY, "max-sm:h-11")}>
              {checkoutPending ? "Starting…" : "Subscribe"}
            </button>
          </form>
        )}
      </div>
      {error && <p role="status" className="m-0 text-[14px] leading-[1.45] text-caution">{error}</p>}
    </div>
  )
}
