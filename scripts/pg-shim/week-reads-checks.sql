-- week_reads on the throwaway cluster (20261104090000_week_reads.sql), run
-- after the file has been applied twice:
--
--   bash scripts/pg-shim/throwaway.sh check <dir> scripts/pg-shim/week-reads-checks.sql
--
-- Every check raises on failure, and everything happens inside one
-- transaction that is rolled back. The synthetic tenants are made up (ids and
-- words): nothing here is a claim about any tenant.
\set ON_ERROR_STOP 1

begin;

-- 1. Grants -------------------------------------------------------------------------
do $$
begin
  -- Service role only (L2): a tenant's session may not even read it.
  if has_table_privilege('authenticated', 'public.week_reads', 'SELECT') then
    raise exception 'grants FAILED: a member can read week_reads';
  end if;
  if has_table_privilege('authenticated', 'public.week_reads', 'INSERT')
     or has_table_privilege('authenticated', 'public.week_reads', 'UPDATE')
     or has_table_privilege('authenticated', 'public.week_reads', 'DELETE')
     or has_table_privilege('authenticated', 'public.week_reads', 'TRUNCATE')
     or has_table_privilege('anon', 'public.week_reads', 'SELECT')
     or has_table_privilege('anon', 'public.week_reads', 'INSERT') then
    raise exception 'grants FAILED: a member can write week_reads, or anon can touch it';
  end if;
  if not (has_table_privilege('service_role', 'public.week_reads', 'SELECT')
          and has_table_privilege('service_role', 'public.week_reads', 'INSERT')
          and has_table_privilege('service_role', 'public.week_reads', 'UPDATE')) then
    raise exception 'grants FAILED: the service role cannot upsert a read';
  end if;
  if has_table_privilege('service_role', 'public.week_reads', 'DELETE')
     or has_table_privilege('service_role', 'public.week_reads', 'TRUNCATE') then
    raise exception 'grants FAILED: the service role can delete a read';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'week_reads') <> 0 then
    raise exception 'policy FAILED: week_reads should carry no policy';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.week_reads'::regclass) then
    raise exception 'rls FAILED: week_reads should have row level security on';
  end if;
  raise notice 'ok  grants: no member or anon access, the service role reads, inserts and updates, nobody deletes; RLS on, no policy';
end $$;

-- 2. Two tenants, a member of the first, a run each ------------------------------------
insert into public.clients (id, company_name) values
  ('00000000-0000-4000-8000-00000000a0c1', 'Week reads check'),
  ('00000000-0000-4000-8000-00000000a0c2', 'Week reads other tenant');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000a0e1', 'owner@week-reads.example');
insert into public.users (id, client_id, full_name, email, role)
  values ('00000000-0000-4000-8000-00000000a0e1', '00000000-0000-4000-8000-00000000a0c1', 'Owner', 'owner@week-reads.example', 'owner');
insert into public.pipeline_runs (id, client_id, status) values
  ('00000000-0000-4000-8000-00000000a0a1', '00000000-0000-4000-8000-00000000a0c1', 'running'),
  ('00000000-0000-4000-8000-00000000a0a2', '00000000-0000-4000-8000-00000000a0c2', 'running');

-- 3. The service role writes, and an upsert replaces the run's row -------------------------
set local role service_role;
insert into public.week_reads (client_id, run_id, kind, month, window_start, window_end, data, status, cost_usd) values
  ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1', 'week', '2026-09-01',
   '2026-09-20T04:18:00Z', '2026-09-27T04:03:00Z', '{"version": 1, "findings": []}', 'thin', 0),
  ('00000000-0000-4000-8000-00000000a0c2', '00000000-0000-4000-8000-00000000a0a2', 'week', '2026-09-01',
   '2026-09-20T04:18:00Z', '2026-09-27T04:03:00Z', '{"version": 1, "findings": []}', 'ready', 0.21);
insert into public.week_reads (client_id, run_id, kind, month, window_start, window_end, data, status, cost_usd) values
  ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1', 'week', '2026-09-01',
   '2026-09-20T04:18:00Z', '2026-09-27T04:03:00Z', '{"version": 1, "findings": [{"headline": "x"}]}', 'ready', 0.2)
  on conflict (run_id, kind) do update set data = excluded.data, status = excluded.status, cost_usd = excluded.cost_usd;
do $$
begin
  if (select count(*) from public.week_reads where run_id = '00000000-0000-4000-8000-00000000a0a1') <> 1
     or (select status from public.week_reads where run_id = '00000000-0000-4000-8000-00000000a0a1') <> 'ready' then
    raise exception 'upsert FAILED: the run''s row was not replaced in place';
  end if;
  -- The month row of the same run sits beside it.
  insert into public.week_reads (client_id, run_id, kind, month, window_start, window_end, data, status)
    values ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1', 'month', '2026-09-01',
            '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', '{"version": 1}', 'ready');
  -- A failed row may say nothing else.
  insert into public.week_reads (client_id, run_id, kind, status)
    values ('00000000-0000-4000-8000-00000000a0c2', '00000000-0000-4000-8000-00000000a0a2', 'month', 'failed');
  raise notice 'ok  writes: an upsert replaces the run''s row in place; week and month sit side by side; a failed row needs nothing else';
end $$;

-- 4. The checks refuse what is not a read ---------------------------------------------------
do $$
begin
  begin
    insert into public.week_reads (client_id, run_id, kind, status)
      values ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1', 'quarter', 'failed');
    raise exception 'check FAILED: a third kind was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_reads (client_id, run_id, kind, status)
      values ('00000000-0000-4000-8000-00000000a0c2', '00000000-0000-4000-8000-00000000a0a2', 'week', 'ready');
    raise exception 'check FAILED: a ready row with no data was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_reads (client_id, run_id, kind, month, window_start, window_end, data, status)
      values ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1', 'week', '2026-09-01',
              '2026-09-20T04:18:00Z', '2026-09-27T04:03:00Z', '{}', 'sent');
    raise exception 'check FAILED: a fourth status was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.week_reads (client_id, run_id, kind, month, window_start, window_end, data, status)
      values ('00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000a0a1', 'week', '2026-09-01',
              '2026-09-20T04:18:00Z', '2026-09-27T04:03:00Z', '{}', 'ready');
    raise exception 'unique FAILED: a second week row for one run was accepted';
  exception when unique_violation then null;
  end;
  begin
    delete from public.week_reads where run_id = '00000000-0000-4000-8000-00000000a0a1';
    raise exception 'grants FAILED: the service role deleted a read';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  checks: a third kind, a ready row with no data, a fourth status and a second week row are refused; delete is refused';
end $$;
reset role;

-- 5. A member reads nothing, their own client's rows included, and writes none --------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a0e1", "role": "authenticated"}';
do $$
begin
  begin
    perform count(*) from public.week_reads;
    raise exception 'grants FAILED: a member read week_reads';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.week_reads set status = 'thin';
    raise exception 'grants FAILED: a member updated a read';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  access: a member reads no read, their own client''s included, and cannot write';
end $$;
reset role;

-- 6. The cascades ------------------------------------------------------------------------------
do $$
begin
  delete from public.pipeline_runs where id = '00000000-0000-4000-8000-00000000a0a2';
  if exists (select 1 from public.week_reads where run_id = '00000000-0000-4000-8000-00000000a0a2') then
    raise exception 'cascade FAILED: deleting a run left its reads';
  end if;
  delete from public.pipeline_runs where client_id = '00000000-0000-4000-8000-00000000a0c1';
  if exists (select 1 from public.week_reads where client_id = '00000000-0000-4000-8000-00000000a0c1') then
    raise exception 'cascade FAILED: deleting a client''s runs left its reads';
  end if;
  raise notice 'ok  cascades: a read goes with its run, week and month alike';
end $$;

rollback;
