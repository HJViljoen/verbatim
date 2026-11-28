-- Checks for 20261128090000_provider_calls.sql, run on a throwaway cluster
-- after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer, so the run stops at the first one; the
-- whole file is one transaction and rolls back.
--
--   1. the service role writes a row and reads the run's sum back
--   2. an outcome outside the four is refused
--   3. anon and a signed-in tenant read and write nothing
--   4. deleting the run deletes its rows; deleting the client deletes the rest

begin;

insert into public.clients (id, company_name) values ('b0000000-0000-0000-0000-00000000000b', 'Acme SA');
insert into public.pipeline_runs (id, client_id) values ('b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000b');

-- ── 1. The service role writes and sums ────────────────────────────────────

set local role service_role;
insert into public.provider_calls (client_id, run_id, step, provider, transport, job, target, calls, cost_usd, items_seen, items, outcome, error, duration_ms) values
  ('b0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000a1', 'search:instagram:bag:reels', 'tikhub', 'treg', 'instagram.hashtag', 'bag:reels', 8, 0.016, 170, 41, 'ok', null, 92000),
  ('b0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000a1', 'search:instagram:bag:posts', 'tikhub', 'direct', 'instagram.hashtag', 'bag:recent', 3, 0.004, 50, 9, 'partial', 'TikHub answered HTTP 502', 30000),
  ('b0000000-0000-0000-0000-00000000000b', null, null, 'tikhub', 'treg', 'instagram.hashtag', 'bag:reels', 1, 0.002, 0, 0, 'empty', null, 9000);
do $$
begin
  if (select sum(cost_usd) from public.provider_calls where run_id = 'b0000000-0000-0000-0000-0000000000a1') <> 0.020 then
    raise exception 'sum: % for the run, expected 0.020', (select sum(cost_usd) from public.provider_calls where run_id = 'b0000000-0000-0000-0000-0000000000a1');
  end if;
  if (select calls from public.provider_calls where target = 'bag:recent') <> 3
     or (select created_at is not null and id is not null from public.provider_calls where target = 'bag:recent') is not true then
    raise exception 'defaults: id and created_at are filled';
  end if;
end $$;
reset role;

-- ── 2. The outcome is one of four ──────────────────────────────────────────

do $$
begin
  begin
    insert into public.provider_calls (client_id, provider, transport, job, outcome)
      values ('b0000000-0000-0000-0000-00000000000b', 'tikhub', 'treg', 'instagram.hashtag', 'fine');
    raise exception 'outcome: fine was accepted';
  exception when check_violation then
    null;
  end;
end $$;

-- ── 3. No tenant reaches the table ─────────────────────────────────────────

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

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
insert into refusals select 'anon', s, pg_temp.refused(s) from unnest(array[
  'select * from public.provider_calls',
  'insert into public.provider_calls (client_id, provider, transport, job, outcome) values (''b0000000-0000-0000-0000-00000000000b'', ''x'', ''x'', ''x'', ''ok'')'
]) s;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-0000000000cc", "role": "authenticated"}';
insert into refusals select 'tenant', s, pg_temp.refused(s) from unnest(array[
  'select * from public.provider_calls',
  'update public.provider_calls set cost_usd = 0',
  'delete from public.provider_calls'
]) s;
reset role;

do $$
declare r record;
begin
  for r in select * from refusals where not refused loop
    raise exception 'not refused: % ran %', r.who, r.what;
  end loop;
  if (select count(*) from refusals) <> 5 then
    raise exception 'refusals: % rows, expected 5', (select count(*) from refusals);
  end if;
end $$;

-- ── 4. The rows go with their run, then with their client ──────────────────

delete from public.pipeline_runs where id = 'b0000000-0000-0000-0000-0000000000a1';
do $$
begin
  if (select count(*) from public.provider_calls) <> 1 then
    raise exception 'run delete: % rows left, expected the one with no run', (select count(*) from public.provider_calls);
  end if;
end $$;
delete from public.clients where id = 'b0000000-0000-0000-0000-00000000000b';
do $$
begin
  if (select count(*) from public.provider_calls) <> 0 then
    raise exception 'client delete: % rows left', (select count(*) from public.provider_calls);
  end if;
end $$;

rollback;

\echo 'provider-calls-checks: all passed'
