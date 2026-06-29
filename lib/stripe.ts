// Stripe client. Like lib/email.ts, this stays fully optional: with no
// STRIPE_SECRET_KEY configured, `stripe` is null and the billing UI shows a
// "billing not set up yet" state instead of throwing — so the app builds and
// runs without a Stripe account, and lights up once the env vars exist.
//
//   STRIPE_SECRET_KEY=sk_...            # https://dashboard.stripe.com/apikeys
//   STRIPE_PRICE_ID=price_...           # the recurring price the plan subscribes to
//   STRIPE_WEBHOOK_SECRET=whsec_...     # from the webhook endpoint you create
//
// The webhook must point at /api/stripe/webhook (excluded from the auth proxy).

import Stripe from 'stripe'

const secretKey = process.env.STRIPE_SECRET_KEY

export const stripe = secretKey ? new Stripe(secretKey) : null
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID

// True only when both a key and a price exist — i.e. checkout can actually run.
export const isStripeConfigured = Boolean(secretKey && STRIPE_PRICE_ID)
