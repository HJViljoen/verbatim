-- Family loan (operator only, 2026-10-18): money the operator borrowed from a
-- family member, and what has been paid back.
--
-- The operator kept this tally by hand. This puts it beside the Costs page, on
-- /dashboard/ops/loan, for the platform admin alone (`platform_admins`, the
-- gate Readiness and Costs use; lib/family-loan/access.ts).
--
-- ONE TABLE, NOT A TENANT'S, AND PERSONAL. Each row is one movement of money:
-- `borrowed` (lent to the operator) or `repaid` (paid back), in rand. The
-- balance is never stored: the page sums the rows (lib/family-loan/ledger.ts),
-- so an edit or a delete can never leave a stale total behind. RLS is ON with
-- NO policy, so an anon or authenticated session reads and writes nothing, and
-- the grants are revoked as well, so PostgREST does not even list the table to
-- a tenant. The page reads and writes through the service role, on the server,
-- after `isPlatformAdmin`, exactly as the cost tables do
-- (20261108090000_costs.sql).
--
-- `source_ref` is a bank statement's own reference for the movement, so an
-- import of a statement can be run again without adding a row twice (unique;
-- many nulls are allowed). A row added on the page has none.
--
-- ADDITIVE ONLY, AND NO DATA. Nothing existing is touched and no row is
-- inserted: the repository is public, and the figures are entered on the page.
-- The pipeline does not read this, so the migration can be applied ahead of
-- the code deploy (the page says so until it is).

create table if not exists public.family_loan_entries (
  id uuid primary key default gen_random_uuid(),
  -- The day the money moved (a Johannesburg day).
  occurred_on date not null,
  kind text not null check (kind in ('borrowed', 'repaid')),
  -- Rand only, always positive: the kind says which way it went.
  amount numeric(12,2) not null check (amount > 0),
  note text,
  -- A bank statement's reference, so a re-run import adds nothing twice. Null
  -- for a row added on the page.
  source_ref text unique,
  created_at timestamptz not null default now()
);

comment on table public.family_loan_entries is
  'Money borrowed from family and paid back, one row per movement (operator only; /dashboard/ops/loan). RLS on with no policy: the service role alone reads or writes.';

-- The page reads every row in date order.
create index if not exists family_loan_entries_occurred_on_idx
  on public.family_loan_entries (occurred_on);

-- ── Lock it to the server ───────────────────────────────────────────────────

alter table public.family_loan_entries enable row level security;

revoke all on table public.family_loan_entries from anon, authenticated;
grant all on table public.family_loan_entries to service_role;
