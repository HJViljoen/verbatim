-- Phase 6 — Stripe billing.
--
-- The clients table already carries plan / is_active / trial_ends_at /
-- stripe_customer_id. This adds the two fields needed to track a live Stripe
-- subscription, plus an explicit comp flag so design partners and the Ossur
-- delivery client get full access without ever being charged (billing for Ossur
-- is handled out-of-band via monthly invoicing, not Stripe).
--
-- Apply with: supabase db push  (or the Supabase MCP apply_migration tool).
-- NOT yet applied to the live DB — production migrations are gated on Heinrich.

alter table public.clients
  add column if not exists is_comped boolean not null default false,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text;

comment on column public.clients.is_comped is
  'Complimentary full access — never billed via Stripe (design partners, Ossur). Bypasses the subscription gate.';
comment on column public.clients.subscription_status is
  'Mirror of the Stripe subscription status (active / trialing / past_due / canceled), synced by the Stripe webhook.';

-- Comp the known partner / test tenants so they keep full access once the
-- subscription gate goes live. (client_ids from the vault.)
update public.clients set is_comped = true
  where id in (
    'e52cac94-30e1-426a-9a36-31b11e0b30b6',  -- Ossur (paying delivery; invoiced out-of-band)
    'ac16988e-c4f3-4baf-b388-73895852a554',  -- Sealand (product-evaluation test tenant)
    '337d97fe-b8ac-414e-a64c-6ef2d17b700c'   -- WHOOP (test tenant)
  );

-- No new RLS policy needed: billing columns live on clients, which is already
-- tenant-scoped (members read their own row; only the Stripe webhook, running
-- through the service role, writes subscription state).
