-- Checks for 20261111090000_family_loan.sql, run on a throwaway cluster after
-- the migration (scripts/pg-shim/throwaway.sh check <dir> this-file). Every
-- check raises on a wrong answer, so the run stops at the first one; the whole
-- file is one transaction and rolls back. Made-up figures only.
--
--   1. the table is there and EMPTY (the migration carries no data), with its
--      index, RLS on and no policy
--   2. the table refuses what the page refuses: a kind other than the two, an
--      amount of zero or below, a missing date; a bank reference once only,
--      and any number of rows with none
--   3. no tenant reaches it: anon, a tenant member and a platform admin's own
--      session are all refused, reading or writing; the service role is not

begin;

-- ── 1. The table, empty ─────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.family_loan_entries') is null then
    raise exception 'no table public.family_loan_entries';
  end if;
  if (select count(*) from public.family_loan_entries) <> 0 then
    raise exception 'the migration inserted % rows; it must carry none', (select count(*) from public.family_loan_entries);
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.family_loan_entries'::regclass) then
    raise exception 'RLS is off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_loan_entries') then
    raise exception 'a policy exists; the table must answer the service role alone';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'family_loan_entries'
                 and indexname = 'family_loan_entries_occurred_on_idx' and indexdef like '%(occurred_on)') then
    raise exception 'no index on family_loan_entries (occurred_on)';
  end if;
  if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
      where table_schema = 'public' and table_name = 'family_loan_entries')
     <> array['id', 'occurred_on', 'kind', 'amount', 'note', 'source_ref', 'created_at'] then
    raise exception 'columns: %', (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
      where table_schema = 'public' and table_name = 'family_loan_entries');
  end if;
end $$;

-- ── 2. What the table refuses ───────────────────────────────────────────────

create or replace function pg_temp.rejected(p_sql text) returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when check_violation or not_null_violation or unique_violation then
  return true;
end $f$;

do $$
declare
  bad text;
begin
  foreach bad in array array[
    'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''gift'', 100)',
    'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''borrowed'', 0)',
    'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''repaid'', -100)',
    'insert into public.family_loan_entries (occurred_on, kind, amount) values (null, ''borrowed'', 100)',
    'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', null, 100)',
    'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''borrowed'', null)'
  ] loop
    if not pg_temp.rejected(bad) then raise exception 'not refused: %', bad; end if;
  end loop;

  -- a bank reference once only; any number with none
  insert into public.family_loan_entries (occurred_on, kind, amount, source_ref) values ('2026-01-01', 'borrowed', 1000, 'TEST-REF-1');
  if not pg_temp.rejected('insert into public.family_loan_entries (occurred_on, kind, amount, source_ref) values (''2026-02-01'', ''repaid'', 100, ''TEST-REF-1'')') then
    raise exception 'a bank reference was taken twice';
  end if;
  insert into public.family_loan_entries (occurred_on, kind, amount) values ('2026-02-01', 'repaid', 100), ('2026-02-01', 'repaid', 100);

  -- a statement import run again adds nothing, keyed on its references
  insert into public.family_loan_entries (occurred_on, kind, amount, source_ref)
  values ('2026-01-01', 'borrowed', 1000, 'TEST-REF-1')
  on conflict (source_ref) do nothing;

  if (select count(*) from public.family_loan_entries) <> 3 then
    raise exception 'rows: %, expected 3', (select count(*) from public.family_loan_entries);
  end if;
  -- cents survive the round trip; defaults fill in
  if (select sum(case kind when 'borrowed' then amount else -amount end) from public.family_loan_entries) <> 800.00 then
    raise exception 'balance: %, expected 800.00', (select sum(case kind when 'borrowed' then amount else -amount end) from public.family_loan_entries);
  end if;
  if exists (select 1 from public.family_loan_entries where id is null or created_at is null) then
    raise exception 'id or created_at not defaulted';
  end if;
end $$;

-- ── 3. No tenant reaches it ─────────────────────────────────────────────────

insert into public.clients (id, company_name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A');
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

-- anon
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
insert into refusals select 'anon', s, pg_temp.refused(s) from unnest(array[
  'select * from public.family_loan_entries',
  'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''borrowed'', 1)',
  'update public.family_loan_entries set amount = 1',
  'delete from public.family_loan_entries'
]) s;
reset role;

-- a tenant owner, and the platform admin's own browser session: the page goes
-- through the service role, so even the operator's JWT reads nothing here
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
insert into refusals select 'tenant', s, pg_temp.refused(s) from unnest(array[
  'select * from public.family_loan_entries',
  'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''borrowed'', 1)',
  'update public.family_loan_entries set amount = 1',
  'delete from public.family_loan_entries'
]) s;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000ff", "role": "authenticated"}';
insert into refusals select 'operator-jwt', s, pg_temp.refused(s) from unnest(array[
  'select * from public.family_loan_entries',
  'insert into public.family_loan_entries (occurred_on, kind, amount) values (''2026-01-01'', ''borrowed'', 1)'
]) s;
reset role;

do $$
declare r record;
begin
  for r in select * from refusals where not refused loop
    raise exception 'not refused: % ran %', r.who, r.what;
  end loop;
  if (select count(*) from refusals) <> 10 then
    raise exception 'refusals: % rows, expected 10', (select count(*) from refusals);
  end if;
end $$;

-- the service role reads and writes all of it
set local role service_role;
do $$
begin
  if (select count(*) from public.family_loan_entries) <> 3 then raise exception 'service role: read'; end if;
  insert into public.family_loan_entries (occurred_on, kind, amount, note) values ('2026-03-01', 'repaid', 12.34, 'test');
  update public.family_loan_entries set note = 'edited' where note = 'test';
  delete from public.family_loan_entries where note = 'edited';
  if (select count(*) from public.family_loan_entries) <> 3 then raise exception 'service role: write'; end if;
end $$;
reset role;

select 'family loan checks: ok' as result;

rollback;
