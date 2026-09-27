-- MF5 on the throwaway cluster (20261103091000_market_first_moves.sql): the
-- column, its window CHECK, and the member's grants on moves, run after the
-- file has been applied twice (after MF1, R12, MF2, MF4 and MF3):
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/mf5-checks.sql
--
-- Every check raises on failure, and everything happens inside one
-- transaction that is rolled back. The synthetic tenant is made up (ids and
-- words): nothing here is a claim about any tenant.
\set ON_ERROR_STOP 1

begin;

-- 1. The column, the CHECK, the grants ---------------------------------------------
do $$
begin
  if (select data_type || ':' || is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'moves' and column_name = 'dated_on') is distinct from 'date:YES' then
    raise exception 'column FAILED: moves.dated_on is not a nullable date';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.moves'::regclass and conname = 'moves_dated_on_window') then
    raise exception 'column FAILED: the window CHECK is missing';
  end if;
  if not has_column_privilege('authenticated', 'public.moves', 'dated_on', 'INSERT') then
    raise exception 'grants FAILED: a member cannot insert dated_on';
  end if;
  if has_column_privilege('authenticated', 'public.moves', 'dated_on', 'UPDATE')
     or has_column_privilege('anon', 'public.moves', 'dated_on', 'INSERT')
     or has_column_privilege('anon', 'public.moves', 'dated_on', 'UPDATE') then
    raise exception 'grants FAILED: a member can change dated_on, or anon can write it';
  end if;
  if (select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
       where table_schema = 'public' and table_name = 'moves' and grantee = 'authenticated' and privilege_type = 'UPDATE')
     is distinct from 'status, updated_at' then
    raise exception 'grants FAILED: the member''s UPDATE on moves is not (status, updated_at) alone';
  end if;
  if (select string_agg(column_name, ', ' order by column_name) from information_schema.role_column_grants
       where table_schema = 'public' and table_name = 'moves' and grantee = 'authenticated' and privilege_type = 'INSERT')
     is distinct from 'client_id, dated_on, declared_by, direction, kind, lineage_id, note, registry_ids, subject_id, title' then
    raise exception 'grants FAILED: the member''s INSERT on moves is not the nine columns plus dated_on';
  end if;
  if has_table_privilege('authenticated', 'public.moves', 'DELETE') or has_table_privilege('service_role', 'public.moves', 'DELETE') then
    raise exception 'grants FAILED: somebody can delete a move';
  end if;
  raise notice 'ok  column: a nullable date with its window CHECK; the member inserts it and never updates it; UPDATE stays (status, updated_at)';
end $$;

-- 2. A synthetic tenant, its owner and a subject -----------------------------------
insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-0000000005c1', 'MF5 check'),
  ('00000000-0000-4000-8000-0000000005c2', 'MF5 other tenant');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000005e1', 'owner@mf5.example');
insert into public.users (id, client_id, full_name, email, role)
  values ('00000000-0000-4000-8000-0000000005e1', '00000000-0000-4000-8000-0000000005c1', 'Owner', 'owner@mf5.example', 'owner');
insert into public.subjects (id, client_id, name, origin, status) values
  ('00000000-0000-4000-8000-0000000005f1', '00000000-0000-4000-8000-0000000005c1', 'Airline bag sizes', 'client', 'active');

-- 3. The member dates a move: today, earlier in the window, and not outside it ---------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-0000000005e1", "role": "authenticated"}';
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-0000000005c1';
  me constant uuid := '00000000-0000-4000-8000-0000000005e1';
  s constant uuid := '00000000-0000-4000-8000-0000000005f1';
  earliest constant date := (date_trunc('month', current_date) - interval '2 months')::date;
  n int;
begin
  -- A move with no day is dated when it is declared, as every move before MF5.
  insert into public.moves (client_id, kind, subject_id, title, declared_by)
    values (c, 'subject', s, 'Dated when declared', me);
  -- The first day of the window, and today, are both in it.
  insert into public.moves (client_id, kind, subject_id, title, declared_by, dated_on)
    values (c, 'subject', s, 'Dated at the window''s first day', me, earliest),
           (c, 'subject', s, 'Dated today', me, current_date);
  select count(*) into n from public.moves where client_id = c;
  if n <> 3 then raise exception 'dating FAILED: the member''s three moves did not land (%)', n; end if;
  if (select count(*) from public.moves where client_id = c and dated_on is null) <> 1 then
    raise exception 'dating FAILED: a move with no day did not stay null';
  end if;

  begin
    insert into public.moves (client_id, kind, subject_id, title, declared_by, dated_on)
      values (c, 'subject', s, 'Dated tomorrow', me, current_date + 1);
    raise exception 'dating FAILED: a move was dated after the day it was declared';
  exception when check_violation then null;
  end;
  begin
    insert into public.moves (client_id, kind, subject_id, title, declared_by, dated_on)
      values (c, 'subject', s, 'Dated before the window', me, earliest - 1);
    raise exception 'dating FAILED: a move was dated before the window opens';
  exception when check_violation then null;
  end;

  -- Insert-only: the day a move was given is kept, like declared_at.
  begin
    update public.moves set dated_on = current_date where client_id = c and dated_on is null;
    raise exception 'dating FAILED: the member changed a move''s day';
  exception when insufficient_privilege then null;
  end;
  -- The lifecycle is still the member's to move.
  update public.moves set status = 'done', updated_at = now() where client_id = c and title = 'Dated today';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'dating FAILED: the member could no longer mark a move done'; end if;

  -- Still pinned to the member's own tenant and name (the policy MF5 leaves alone).
  begin
    insert into public.moves (client_id, kind, subject_id, title, declared_by, dated_on)
      values ('00000000-0000-4000-8000-0000000005c2', 'subject', s, 'Another tenant''s', me, current_date);
    raise exception 'dating FAILED: a member dated a move into another tenant';
  exception when insufficient_privilege or check_violation or foreign_key_violation then null;
  end;
  raise notice 'ok  a member dates a move today, at the window''s first day, or not at all; never after its declaration or before the window; never changes the day; still marks it done';
end $$;
reset role;

-- 4. The service role (the operator's view) is held to the same window --------------
set local role service_role;
do $$
begin
  begin
    insert into public.moves (client_id, kind, subject_id, title, declared_by, dated_on, declared_at)
      values ('00000000-0000-4000-8000-0000000005c1', 'subject', '00000000-0000-4000-8000-0000000005f1',
              'Declared in June, dated in March', '00000000-0000-4000-8000-0000000005e1', date '2026-03-31', date '2026-06-15');
    raise exception 'window FAILED: the service role dated a move before the window';
  exception when check_violation then null;
  end;
  insert into public.moves (client_id, kind, subject_id, title, declared_by, dated_on, declared_at)
    values ('00000000-0000-4000-8000-0000000005c1', 'subject', '00000000-0000-4000-8000-0000000005f1',
            'Declared in June, dated in April', '00000000-0000-4000-8000-0000000005e1', date '2026-04-01', date '2026-06-15');
  raise notice 'ok  the window is the declaration''s month and the two before it, for the service role too (15 Jun: from 1 Apr)';
end $$;
reset role;

rollback;
