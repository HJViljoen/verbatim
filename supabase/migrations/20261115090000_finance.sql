-- Finance (operator only, 2026-11-17): invoices that make and send
-- themselves, the payments that settle them, and the cost side's live inputs.
--
-- Until now income was one scalar per client (cost_client_plans.unpaid_amount)
-- and every invoice was a hand-built PDF. This holds each invoice and credit
-- note as a row, each payment as a row, and a billing profile per client that
-- says what a month costs, when it is issued and who it goes to. The Costs
-- page (/dashboard/ops/costs) reads and writes it for the platform admin alone
-- (`platform_admins`, lib/costs/access.ts), and the finance-daily Inngest job
-- issues the month's invoice on the profile's day.
--
-- NOT A TENANT'S. RLS is ON with NO policy on every table, and the grants are
-- revoked as well, so an anon or authenticated session reads and writes
-- nothing and PostgREST does not even list the tables to a tenant (the cost
-- tables' posture, 20261108090000_costs.sql). The service role alone reads
-- and writes, on the server, after the admin check.
--
-- WHAT IS NEVER STORED: a balance. What an invoice still owes is derived on
-- every read (lib/finance/ledger.ts): a client's payments are applied to its
-- open invoices in the same currency, oldest due first, and a credit note
-- cancels the invoice it relates to. So an edited or deleted payment can never
-- leave a stale "paid" behind.
--
-- ADDITIVE ONLY, AND NO DATA. The repository is public: no name, address,
-- bank detail, amount or email address is in this file. The issuer, the
-- profiles and the invoices go in through scripts/finance-backfill.ts (its
-- seed file lives outside the repository) or the page. The one row inserted
-- here is the private storage bucket the PDFs live in. One existing table
-- gains two columns (cost_settings: whether the dollar rate refreshes itself).
-- The pipeline reads none of this, so the migration can be applied ahead of
-- the code deploy (the page says so until it is).

-- ── Who issues ──────────────────────────────────────────────────────────────
-- One row (id is always true): the name, address and bank lines printed on
-- every invoice, and the addresses the invoice email is sent from.

create table if not exists public.fin_issuer (
  id boolean primary key default true check (id),
  name text not null check (length(btrim(name)) > 0),
  address_lines text[] not null default '{}',
  email text,
  -- [{label, value}], printed in order under "Payment details".
  bank_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(bank_lines) = 'array'),
  -- The invoice email's From ("Name <address>") and Reply-To. Never in code.
  email_from text,
  reply_to text,
  updated_at timestamptz not null default now()
);

comment on table public.fin_issuer is
  'Who issues the invoices: name, address, bank lines, email sender (operator only). RLS on with no policy: the service role alone reads or writes.';

-- ── Numbers ─────────────────────────────────────────────────────────────────
-- The next number of each kind. No row is seeded: fin_take_number creates a
-- kind's row on its first call (number 1), and the backfill sets the counters
-- past the invoices already issued by hand.

create table if not exists public.fin_counters (
  kind text primary key check (kind in ('invoice', 'credit_note')),
  next_no int not null default 1 check (next_no >= 1),
  updated_at timestamptz not null default now()
);

comment on table public.fin_counters is
  'The next invoice and credit note numbers (operator only). Taken only through fin_take_number.';

-- ── Billing profiles ────────────────────────────────────────────────────────
-- One per client: what a month is billed at and when, and who receives it.

create table if not exists public.fin_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  active boolean not null default true,
  bill_to text not null check (length(btrim(bill_to)) > 0),
  currency text not null default 'ZAR' check (currency in ('ZAR', 'USD')),
  -- Rand per dollar the dollar-priced lines are invoiced at. Fixed by
  -- agreement, never the live rate (cost_settings.usd_zar is the cost side's).
  fx_rate numeric(8,4) not null default 18 check (fx_rate > 0),
  -- [{description, unit_usd, qty}]: a month's lines, priced in dollars.
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  subject_line text not null default '',
  -- The invoice for a month is issued on this day of the month BEFORE it
  -- (billed in advance), and is due by that month's last day.
  issue_day smallint not null default 15 check (issue_day between 1 and 28),
  due_rule text not null default 'end_of_prev_month' check (due_rule in ('end_of_prev_month', 'on_receipt')),
  -- auto: the daily job sends it. review: it waits as `ready` for a tap.
  send_mode text not null default 'review' check (send_mode in ('auto', 'review')),
  -- The next issued invoice waits for a tap even in auto; Send clears it.
  hold_next boolean not null default true,
  email_to text[] not null default '{}',
  email_cc text[] not null default '{}',
  email_bcc text[] not null default '{}',
  your_ref text,
  email_greeting text,
  -- A line the next email carries once, cleared after a successful send.
  note_once text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fin_billing_profiles is
  'Each client''s billing: lines, rate, issue day, recipients, send mode (operator only). RLS on with no policy: the service role alone reads or writes.';

-- ── Invoices and credit notes ───────────────────────────────────────────────
-- A credit note is a row of kind `credit_note` whose relates_to is the
-- invoice it cancels; that invoice's status is then `credited`. A replacement
-- invoice's relates_to is the invoice it replaces. Invoices are tax records:
-- a client row cannot be deleted while it has any (on delete restrict).

create table if not exists public.fin_invoices (
  id uuid primary key default gen_random_uuid(),
  -- '0011', 'CN-0005': zero-padded, unique across both kinds.
  number text not null unique check (number ~ '^(CN-)?[0-9]{4,}$'),
  kind text not null default 'invoice' check (kind in ('invoice', 'credit_note')),
  client_id uuid not null references public.clients(id) on delete restrict,
  profile_id uuid references public.fin_billing_profiles(id) on delete set null,
  bill_to text not null check (length(btrim(bill_to)) > 0),
  subject_line text not null default '',
  your_ref text,
  -- 'January 2027', or a label for a span that is not one month.
  period_label text not null,
  -- The first of the month billed; null for a span that is not one month.
  period_start date check (period_start is null or extract(day from period_start) = 1),
  issued_on date not null,
  -- Null = due on receipt.
  due_on date check (due_on is null or due_on >= issued_on),
  currency text not null check (currency in ('ZAR', 'USD')),
  -- The conversion sentence the invoice prints (at the profile's fixed rate).
  fx_note text,
  -- [{description, qty, unit, unit_price, amount}], in the invoice's currency.
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  -- Always positive; the kind says which way it goes.
  total numeric(12,2) not null check (total >= 0),
  relates_to uuid references public.fin_invoices(id) on delete restrict,
  -- draft: issued, no PDF yet. ready: PDF printed, not sent. sending: an
  -- email is in flight (claimed). sent. credited: a credit note cancels it.
  -- void: never sent and withdrawn.
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sending', 'sent', 'credited', 'void')),
  -- The day the client's accounts team said it would pay.
  expected_on date,
  sent_at timestamptz,
  pdf_path text,
  email_message_id text,
  -- The last send's failure, cleared by a successful one.
  send_error text,
  -- When the email in flight was claimed: a claim older than ten minutes is
  -- a crashed send, and Send may take it again.
  send_claimed_at timestamptz,
  -- Printed under the lines after the currency sentence and the fx note.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_invoices_number_kind check ((kind = 'credit_note') = (number like 'CN-%')),
  constraint fin_invoices_credit_relates check (kind <> 'credit_note' or relates_to is not null),
  constraint fin_invoices_not_self check (relates_to is null or relates_to <> id)
);

comment on table public.fin_invoices is
  'Invoices and credit notes, one row each (operator only). Balances are derived, never stored. RLS on with no policy: the service role alone reads or writes.';

-- A month is invoiced once per client. An invoice a credit note cancelled
-- (credited) or one withdrawn (void) gives the month back, so the replacement
-- can be issued for it.
create unique index if not exists fin_invoices_one_per_month
  on public.fin_invoices (client_id, period_start)
  where kind = 'invoice' and period_start is not null and status not in ('credited', 'void');

create index if not exists fin_invoices_client_issued_idx on public.fin_invoices (client_id, issued_on);
create index if not exists fin_invoices_relates_to_idx on public.fin_invoices (relates_to) where relates_to is not null;
create index if not exists fin_invoices_profile_idx on public.fin_invoices (profile_id) where profile_id is not null;

-- ── Payments ────────────────────────────────────────────────────────────────
-- Money received, as the bank statement shows it. Recorded on the page (no
-- bank feed), applied by the ledger oldest invoice first.

create table if not exists public.fin_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  received_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency in ('ZAR', 'USD')),
  reference text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fin_payments is
  'Payments received from clients, one row each (operator only). RLS on with no policy: the service role alone reads or writes.';

create index if not exists fin_payments_client_received_idx on public.fin_payments (client_id, received_on);

-- ── Notices to the operator ─────────────────────────────────────────────────
-- Each email to the operator about an invoice is claimed here first, so the
-- daily job sends it once: `ready` (a held invoice waits for a tap),
-- `overdue` (its due date passed unpaid), `expected` (the promised day came
-- and it is unpaid). on_day is the day the notice is about.

create table if not exists public.fin_notices (
  invoice_id uuid not null references public.fin_invoices(id) on delete cascade,
  kind text not null check (kind in ('ready', 'overdue', 'expected')),
  on_day date not null,
  sent_at timestamptz not null default now(),
  primary key (invoice_id, kind, on_day)
);

comment on table public.fin_notices is
  'Operator notices about invoices, claimed once each (operator only). RLS on with no policy: the service role alone reads or writes.';

-- ── What a vendor's own API says was spent ──────────────────────────────────

create table if not exists public.fin_vendor_usage (
  vendor text not null check (vendor in ('apify')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  usd numeric(12,4) not null check (usd >= 0),
  fetched_at timestamptz not null default now(),
  primary key (vendor, period_start)
);

comment on table public.fin_vendor_usage is
  'A vendor''s billing-cycle spend as its API reports it (operator only). RLS on with no policy: the service role alone reads or writes.';

-- ── The dollar rate refreshes itself (the cost side only) ───────────────────

alter table public.cost_settings add column if not exists fx_auto boolean not null default true;
alter table public.cost_settings add column if not exists fx_on date;

-- ── Lock them to the server ─────────────────────────────────────────────────

alter table public.fin_issuer enable row level security;
alter table public.fin_counters enable row level security;
alter table public.fin_billing_profiles enable row level security;
alter table public.fin_invoices enable row level security;
alter table public.fin_payments enable row level security;
alter table public.fin_notices enable row level security;
alter table public.fin_vendor_usage enable row level security;

revoke all on table public.fin_issuer, public.fin_counters, public.fin_billing_profiles, public.fin_invoices,
  public.fin_payments, public.fin_notices, public.fin_vendor_usage from anon, authenticated;
grant all on table public.fin_issuer, public.fin_counters, public.fin_billing_profiles, public.fin_invoices,
  public.fin_payments, public.fin_notices, public.fin_vendor_usage to service_role;

-- ── Numbers, taken atomically ───────────────────────────────────────────────
-- One statement: the row lock the upsert takes serialises two callers, so two
-- concurrent calls get two numbers and never the same one. Called inside a
-- transaction that fails, the number goes back with it.

create or replace function public.fin_take_number(p_kind text)
returns int
language sql volatile
set search_path = public, pg_temp
as $$
  insert into public.fin_counters as c (kind, next_no) values (p_kind, 2)
  on conflict (kind) do update set next_no = c.next_no + 1, updated_at = now()
  returning c.next_no - 1
$$;

-- ── Issuing a month, once ───────────────────────────────────────────────────
-- The caller (lib/finance/issue.ts) decides the month, the dates and the
-- lines; this takes the number and inserts, in one transaction, so a month
-- already billed returns the invoice that bills it and never burns a number.
-- The profile row is locked first, so two runs for one client queue, and the
-- second sees the first's invoice. The unique month index is the last word:
-- a race it catches rolls the number back with the insert.

create or replace function public.fin_issue_invoice(
  p_profile_id uuid,
  p_period_start date,
  p_period_label text,
  p_issued_on date,
  p_due_on date,
  p_lines jsonb,
  p_total numeric,
  p_fx_note text,
  p_note text
)
returns table (invoice_id uuid, invoice_number text, created boolean)
language plpgsql volatile
set search_path = public, pg_temp
as $$
declare
  prof public.fin_billing_profiles%rowtype;
  n int;
  new_id uuid;
  new_number text;
  hit text;
begin
  select * into prof from public.fin_billing_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'fin_issue_invoice: no billing profile %', p_profile_id;
  end if;
  if not prof.active then
    raise exception 'fin_issue_invoice: billing profile % is not active', p_profile_id;
  end if;

  return query
    select i.id, i.number, false from public.fin_invoices i
    where i.client_id = prof.client_id and i.kind = 'invoice' and i.period_start = p_period_start
      and i.status not in ('credited', 'void');
  if found then return; end if;

  begin
    n := public.fin_take_number('invoice');
    new_number := lpad(n::text, 4, '0');
    insert into public.fin_invoices
      (number, kind, client_id, profile_id, bill_to, subject_line, your_ref, period_label, period_start,
       issued_on, due_on, currency, fx_note, lines, total, status, note)
    values
      (new_number, 'invoice', prof.client_id, prof.id, prof.bill_to, prof.subject_line, prof.your_ref,
       p_period_label, p_period_start, p_issued_on, p_due_on, prof.currency, p_fx_note, p_lines, p_total,
       'draft', p_note)
    returning id into new_id;
  exception when unique_violation then
    -- Another run billed the month between the check and the insert: the
    -- number and the row go back with this block, and theirs is the answer.
    -- Any other clash (a number already taken: a counter set too low) is the
    -- caller's to see.
    get stacked diagnostics hit = constraint_name;
    if hit is distinct from 'fin_invoices_one_per_month' then raise; end if;
    return query
      select i.id, i.number, false from public.fin_invoices i
      where i.client_id = prof.client_id and i.kind = 'invoice' and i.period_start = p_period_start
        and i.status not in ('credited', 'void');
    return;
  end;

  return query select new_id, new_number, true;
end
$$;

revoke all on function public.fin_take_number(text) from public, anon, authenticated;
revoke all on function public.fin_issue_invoice(uuid, date, text, date, date, jsonb, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.fin_take_number(text) to service_role;
grant execute on function public.fin_issue_invoice(uuid, date, text, date, date, jsonb, numeric, text, text)
  to service_role;

-- ── Storage ─────────────────────────────────────────────────────────────────
-- One PRIVATE bucket, paths `<client_id>/<number>.pdf`. No storage policy for
-- anon or authenticated: the service role writes, and the page hands the
-- operator a signed link (the `artifacts` bucket's posture,
-- 20260829150000_report_snapshots_artifacts.sql).

insert into storage.buckets (id, name, public)
  values ('invoices', 'invoices', false)
  on conflict (id) do nothing;
