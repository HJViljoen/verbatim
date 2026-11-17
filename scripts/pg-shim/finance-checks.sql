-- Checks for 20261115090000_finance.sql, run on a throwaway cluster after the
-- migration (scripts/pg-shim/finance-checks.sh runs this file, then races two
-- sessions for the numbers). Every check raises on a wrong answer, so the run
-- stops at the first one; the whole file is one transaction and rolls back.
-- Made-up names and figures only.
--
--   1. the seven tables are there and EMPTY (the migration carries no data),
--      RLS on, no policy; the invoices bucket is there and private;
--      cost_settings has its two new columns
--   2. no tenant reaches them: anon, a tenant member and a platform admin's
--      own session are all refused, tables and functions alike; the service
--      role is not
--   3. numbers: fin_take_number counts from 1 per kind with no seed row
--   4. a month is invoiced once: fin_issue_invoice returns the month's invoice
--      on a second call and burns no number; a direct second insert is
--      refused; a credited or void invoice gives the month back
--   5. the shapes the code relies on: a credit note relates to an invoice and
--      is numbered CN-; due is never before issue; a period starts on the 1st

begin;

-- ── 1. The tables, empty ────────────────────────────────────────────────────

do $$
declare
  t text;
  n int;
begin
  foreach t in array array['fin_issuer', 'fin_counters', 'fin_billing_profiles', 'fin_invoices',
                           'fin_payments', 'fin_notices', 'fin_vendor_usage'] loop
    if to_regclass('public.' || t) is null then raise exception 'no table public.%', t; end if;
    execute format('select count(*) from public.%I', t) into strict n;
    if n <> 0 then raise exception '% holds % rows; the migration must carry none', t, n; end if;
  end loop;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname like 'fin\_%' and c.relkind = 'r' and not c.relrowsecurity) then
    raise exception 'RLS is off on a finance table';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'fin\_%' and c.relkind = 'r') <> 7 then
    raise exception 'expected exactly seven fin_ tables';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'fin\_%') then
    raise exception 'a policy exists on a finance table; they answer the service role alone';
  end if;
  if not exists (select 1 from storage.buckets where id = 'invoices' and public = false) then
    raise exception 'no private invoices bucket';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'cost_settings'
      and column_name in ('fx_auto', 'fx_on')) <> 2 then
    raise exception 'cost_settings lacks fx_auto / fx_on';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'fin_invoices_one_per_month'
                 and indexdef like '%(client_id, period_start)%' and indexdef like '%credited%') then
    raise exception 'no month guard index';
  end if;
end $$;

-- A tenant and its profile, the fixture the rest reads. Made up.
insert into public.clients (id, company_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Example Ltd');
insert into public.fin_billing_profiles (id, client_id, bill_to, currency, fx_rate, lines, subject_line, send_mode, hold_next,
                                        email_to, your_ref, email_greeting)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA', 'ZAR', 18,
        '[{"description": "Widget service", "unit_usd": 100, "qty": 1}]', 'Monthly services', 'auto', true,
        array['ap@acme.test'], 'Jane Doe', 'Hi Jane');

-- ── 2. No tenant reaches them ───────────────────────────────────────────────

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000ff', 'operator@verbatim.test'),
  ('a0000000-0000-0000-0000-00000000000a', 'member@tenant.test');
insert into public.users (id, client_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-0000000000ff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Operator', 'operator@verbatim.test', 'owner'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Member', 'member@tenant.test', 'owner');
insert into public.platform_admins (user_id) values ('a0000000-0000-0000-0000-0000000000ff');

create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $f$;

create temp table refusals (who text, what text, refused boolean);
grant all on refusals to anon, authenticated;
grant execute on function pg_temp.refused(text) to anon, authenticated;

create temp table probes (s text);
insert into probes values
  ('select * from public.fin_issuer'),
  ('select * from public.fin_counters'),
  ('select * from public.fin_billing_profiles'),
  ('select * from public.fin_invoices'),
  ('select * from public.fin_payments'),
  ('select * from public.fin_notices'),
  ('select * from public.fin_vendor_usage'),
  ('insert into public.fin_payments (client_id, received_on, amount, currency) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''2026-01-01'', 1, ''ZAR'')'),
  ('update public.fin_billing_profiles set email_to = array[''attacker@evil.test'']'),
  ('delete from public.fin_invoices'),
  ('select public.fin_take_number(''invoice'')'),
  ('select * from public.fin_issue_invoice(''cccccccc-cccc-cccc-cccc-cccccccccccc'', ''2027-01-01'', ''January 2027'', ''2026-12-15'', ''2026-12-31'', ''[]'', 0, null, null)');
grant select on probes to anon, authenticated;

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
insert into refusals select 'anon', s, pg_temp.refused(s) from probes;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
insert into refusals select 'tenant', s, pg_temp.refused(s) from probes;
-- the platform admin's own browser session: the page goes through the
-- service role, so even the operator's JWT reaches nothing here
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000ff", "role": "authenticated"}';
insert into refusals select 'operator-jwt', s, pg_temp.refused(s) from probes;
reset role;

do $$
declare r record;
begin
  for r in select * from refusals where not refused loop
    raise exception 'not refused: % ran %', r.who, r.what;
  end loop;
  if (select count(*) from refusals) <> 36 then
    raise exception 'refusals: % rows, expected 36', (select count(*) from refusals);
  end if;
  if exists (select 1 from public.fin_counters) or exists (select 1 from public.fin_invoices) then
    raise exception 'a refused call left a row behind';
  end if;
end $$;

-- ── 3. Numbers ──────────────────────────────────────────────────────────────

set local role service_role;
do $$
begin
  if public.fin_take_number('credit_note') <> 1 then raise exception 'a first credit note is not number 1'; end if;
  if public.fin_take_number('credit_note') <> 2 then raise exception 'the second credit note is not number 2'; end if;
  if (select next_no from public.fin_counters where kind = 'credit_note') <> 3 then raise exception 'counter not at 3'; end if;
  -- a kind the table does not hold is refused, and creates nothing
  begin
    perform public.fin_take_number('receipt');
    raise exception 'an unknown kind was numbered';
  exception when check_violation then null;
  end;
  -- the backfill sets a counter past the hand-made invoices
  update public.fin_counters set next_no = 11 where kind = 'credit_note';
  if public.fin_take_number('credit_note') <> 11 then raise exception 'a set counter is not honoured'; end if;
end $$;

-- ── 4. A month is invoiced once ─────────────────────────────────────────────

do $$
declare
  a record;
  b record;
  c record;
begin
  update public.fin_counters set next_no = 1 where kind = 'credit_note';
  insert into public.fin_counters (kind, next_no) values ('invoice', 11);

  select * into a from public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-01-01', 'January 2027',
    '2026-12-15', '2026-12-31', '[{"description": "Widget service", "qty": 1, "unit": "month", "unit_price": 1800, "amount": 1800}]',
    1800, 'Converted from USD 100.00 at a fixed rate of R18.00 / USD 1.00.', null);
  if not a.created or a.invoice_number <> '0011' then raise exception 'first issue: % %', a.created, a.invoice_number; end if;

  select * into b from public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-01-01', 'January 2027',
    '2026-12-15', '2026-12-31', '[]', 1800, null, null);
  if b.created or b.invoice_id <> a.invoice_id or b.invoice_number <> '0011' then
    raise exception 'second issue for the month: created % number %', b.created, b.invoice_number;
  end if;
  if (select next_no from public.fin_counters where kind = 'invoice') <> 12 then
    raise exception 'the second call burned a number: next is %', (select next_no from public.fin_counters where kind = 'invoice');
  end if;
  if (select count(*) from public.fin_invoices) <> 1 then raise exception 'two invoices for one month'; end if;

  -- the issued row carries the profile's words and starts as a draft
  if not exists (select 1 from public.fin_invoices where id = a.invoice_id and status = 'draft' and bill_to = 'Acme SA'
                 and your_ref = 'Jane Doe' and currency = 'ZAR' and total = 1800.00 and due_on = '2026-12-31'
                 and profile_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') then
    raise exception 'the issued invoice does not carry the profile';
  end if;

  -- a direct second insert for the month is refused
  begin
    insert into public.fin_invoices (number, client_id, bill_to, period_label, period_start, issued_on, currency, total, status)
    values ('0099', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA', 'January 2027', '2027-01-01', '2026-12-20', 'USD', 100, 'sent');
    raise exception 'a second invoice for the month was taken';
  exception when unique_violation then null;
  end;

  -- the next month is its own
  select * into c from public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-02-01', 'February 2027',
    '2027-01-15', '2027-01-31', '[]', 1800, null, null);
  if not c.created or c.invoice_number <> '0012' then raise exception 'next month: % %', c.created, c.invoice_number; end if;

  -- another client's January is not this client's
  insert into public.fin_invoices (number, client_id, bill_to, period_label, period_start, issued_on, currency, total, status)
  values ('0050', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Example Ltd', 'January 2027', '2027-01-01', '2026-12-15', 'ZAR', 10, 'sent');

  -- a credit note cancels January: the month is free again, and the
  -- replacement relates to the invoice it replaces
  insert into public.fin_invoices (number, kind, client_id, bill_to, period_label, period_start, issued_on, currency, total,
                                   relates_to, status)
  values ('CN-0001', 'credit_note', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA', 'January 2027', '2027-01-01',
          '2026-12-20', 'ZAR', 1800, a.invoice_id, 'sent');
  update public.fin_invoices set status = 'credited' where id = a.invoice_id;
  insert into public.fin_invoices (number, client_id, bill_to, period_label, period_start, issued_on, currency, total,
                                   relates_to, status)
  values ('0901', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA', 'January 2027', '2027-01-01', '2026-12-20', 'ZAR', 1800,
          a.invoice_id, 'sent');
  -- …and fin_issue_invoice now answers with the replacement
  select * into b from public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-01-01', 'January 2027',
    '2026-12-15', '2026-12-31', '[]', 1800, null, null);
  if b.created or b.invoice_number <> '0901' then raise exception 'after the credit: % %', b.created, b.invoice_number; end if;

  -- a void invoice gives its month back as well
  update public.fin_invoices set status = 'void' where id = c.invoice_id;
  select * into c from public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-02-01', 'February 2027',
    '2027-01-15', '2027-01-31', '[]', 1800, null, null);
  if not c.created or c.invoice_number <> '0013' then
    raise exception 'after the void: % %', c.created, c.invoice_number;
  end if;

  -- a counter set too low clashes on the number: that is an error the caller
  -- sees, never a quiet "already billed", and it leaves nothing behind
  update public.fin_counters set next_no = 11 where kind = 'invoice';
  begin
    perform public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-03-01', 'March 2027',
      '2027-02-15', '2027-02-28', '[]', 1800, null, null);
    raise exception 'a taken number was issued again';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.fin_invoices where period_start = '2027-03-01') then raise exception 'a clash left a March row'; end if;
  update public.fin_counters set next_no = 14 where kind = 'invoice';

  -- a paused profile issues nothing
  update public.fin_billing_profiles set active = false where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  begin
    perform public.fin_issue_invoice('cccccccc-cccc-cccc-cccc-cccccccccccc', '2027-03-01', 'March 2027',
      '2027-02-15', '2027-02-28', '[]', 1800, null, null);
    raise exception 'an inactive profile issued';
  exception when raise_exception then
    if sqlerrm not like '%not active%' then raise; end if;
  end;
  update public.fin_billing_profiles set active = true where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
end $$;

-- ── 5. The shapes the code relies on ────────────────────────────────────────

create or replace function pg_temp.rejected(p_sql text) returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when check_violation or not_null_violation or unique_violation or foreign_key_violation then
  return true;
end $f$;

do $$
declare
  bad text;
  base text := 'insert into public.fin_invoices (number, kind, client_id, bill_to, period_label, period_start, issued_on, due_on, currency, total, relates_to, status) values ';
begin
  foreach bad in array array[
    -- a credit note relates to an invoice, and is numbered CN-
    base || '(''CN-0009'', ''credit_note'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-01'', null, ''ZAR'', 1, null, ''sent'')',
    base || '(''0098'', ''credit_note'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-01'', null, ''ZAR'', 1, (select id from public.fin_invoices where number = ''0011''), ''sent'')',
    base || '(''CN-0098'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-01'', null, ''ZAR'', 1, null, ''sent'')',
    -- a number is digits, four at least
    base || '(''11'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-01'', null, ''ZAR'', 1, null, ''sent'')',
    -- due never before issue; a period starts on the 1st; no negative total
    base || '(''0097'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-10'', ''2026-01-09'', ''ZAR'', 1, null, ''sent'')',
    base || '(''0096'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', ''2026-01-15'', ''2026-01-10'', null, ''ZAR'', 1, null, ''sent'')',
    base || '(''0095'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-10'', null, ''ZAR'', -1, null, ''sent'')',
    -- currencies and statuses the code knows
    base || '(''0094'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-10'', null, ''EUR'', 1, null, ''sent'')',
    base || '(''0093'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-10'', null, ''ZAR'', 1, null, ''paid'')',
    -- a number once, across both kinds
    base || '(''0011'', ''invoice'', ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme SA'', ''x'', null, ''2026-01-10'', null, ''ZAR'', 1, null, ''sent'')',
    -- a client that does not exist
    base || '(''0092'', ''invoice'', ''dddddddd-dddd-dddd-dddd-dddddddddddd'', ''Acme SA'', ''x'', null, ''2026-01-10'', null, ''ZAR'', 1, null, ''sent'')',
    -- payments: positive, dated, in a currency the code knows
    'insert into public.fin_payments (client_id, received_on, amount, currency) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''2026-01-01'', 0, ''ZAR'')',
    'insert into public.fin_payments (client_id, received_on, amount, currency) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', null, 10, ''ZAR'')',
    'insert into public.fin_payments (client_id, received_on, amount, currency) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''2026-01-01'', 10, ''GBP'')',
    -- a profile: one per client, an issue day a short month has
    'insert into public.fin_billing_profiles (client_id, bill_to) values (''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Acme again'')',
    'insert into public.fin_billing_profiles (client_id, bill_to, issue_day) values (''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'', ''Example'', 31)',
    -- one issuer row
    'insert into public.fin_issuer (id, name) values (false, ''Jane Doe'')'
  ] loop
    if not pg_temp.rejected(bad) then raise exception 'not refused: %', bad; end if;
  end loop;

  -- a client with invoices cannot be deleted out from under them
  if not pg_temp.rejected('delete from public.clients where id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''') then
    raise exception 'a client with invoices was deleted';
  end if;

  -- the service role writes the rest of the shapes the page writes
  insert into public.fin_issuer (name, address_lines, bank_lines, email_from, reply_to)
  values ('Jane Doe', array['1 Test Street', 'Testville'], '[{"label": "Bank", "value": "Example Bank"}]',
          'Jane Doe <jane@example.test>', 'jane@example.test');
  insert into public.fin_payments (client_id, received_on, amount, currency, reference)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-12-20', 1800.00, 'ZAR', 'INV-0901');
  insert into public.fin_vendor_usage (vendor, period_start, period_end, usd) values ('apify', '2026-11-09', '2026-12-08', 0.53);
  insert into public.fin_vendor_usage (vendor, period_start, period_end, usd) values ('apify', '2026-11-09', '2026-12-08', 0.71)
  on conflict (vendor, period_start) do update set usd = excluded.usd;
  if (select usd from public.fin_vendor_usage where vendor = 'apify') <> 0.71 then raise exception 'vendor usage upsert'; end if;
  insert into public.fin_notices (invoice_id, kind, on_day) select id, 'overdue', '2026-12-31' from public.fin_invoices where number = '0901';
  if pg_temp.rejected('insert into public.fin_notices (invoice_id, kind, on_day) select id, ''overdue'', ''2026-12-31'' from public.fin_invoices where number = ''0901''') is not true then
    raise exception 'a notice was claimed twice';
  end if;
end $$;
reset role;

select 'finance checks: ok' as result;

rollback;
