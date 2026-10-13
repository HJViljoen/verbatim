-- Checks for 20261110090000_moves_role_gate.sql (decision 6a), run on a
-- throwaway cluster after the migration (scripts/pg-shim/throwaway.sh check
-- <dir> this-file). Every check raises on a wrong answer, so the run stops at
-- the first one; the whole file is one transaction and rolls back.
--
-- The world: tenant A with an owner, an admin, a member and the operator (a
-- platform admin whose own row in A is a MEMBER, so only the platform-admin
-- arm can let them through), and tenant B with its owner. Each of A's people
-- tries the four writes Your moves makes through PostgREST, as their JWT
-- would: declare a move, change a move's status, record a decision, set a
-- recommendation's status. Then the service role does, and every reader reads.
-- It proves four things:
--   1. a member is refused, on all four;
--   2. an owner and an admin are let through (and the operator, by the
--      platform-admin arm), each inside their own tenant only;
--   3. the service role is let through;
--   4. reads are unchanged: each person reads exactly their tenant's rows.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@a.test'),
  ('a0000000-0000-0000-0000-000000000002', 'admin@a.test'),
  ('a0000000-0000-0000-0000-000000000003', 'member@a.test'),
  ('a0000000-0000-0000-0000-0000000000ff', 'operator@verbatim.test'),
  ('b0000000-0000-0000-0000-000000000001', 'owner@b.test');
insert into public.clients (id, company_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B');
insert into public.users (id, client_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A owner', 'owner@a.test', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A admin', 'admin@a.test', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A member', 'member@a.test', 'member'),
  ('a0000000-0000-0000-0000-0000000000ff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Operator', 'operator@verbatim.test', 'member'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B owner', 'owner@b.test', 'owner');
insert into public.platform_admins (user_id) values ('a0000000-0000-0000-0000-0000000000ff');

insert into public.pipeline_runs (id, client_id, status) values
  ('70000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'completed'),
  ('70000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'completed');
insert into public.recommendations (id, client_id, run_id, type, title, reasoning, lineage_id) values
  ('7e000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000000-0000-0000-0000-00000000000a', 'help_desk', 'A help desk', 'r', '7e000000-0000-0000-0000-00000000000a'),
  ('7e000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '70000000-0000-0000-0000-00000000000b', 'repair', 'A repair programme', 'r', '7e000000-0000-0000-0000-00000000000b');
insert into public.moves (id, client_id, kind, lineage_id, title, declared_by) values
  ('30000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'advice', '7e000000-0000-0000-0000-00000000000a', 'A help desk', 'a0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'advice', '7e000000-0000-0000-0000-00000000000b', 'A repair programme', 'b0000000-0000-0000-0000-000000000001');
insert into public.rec_decisions (client_id, lineage_id, recommendation_id, status, decided_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '7e000000-0000-0000-0000-00000000000a', '7e000000-0000-0000-0000-00000000000a', 'acknowledged', 'a0000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '7e000000-0000-0000-0000-00000000000b', '7e000000-0000-0000-0000-00000000000b', 'acknowledged', 'b0000000-0000-0000-0000-000000000001');

-- The four writes, as one person, against tenant `c`: each returns whether it
-- landed. A refused INSERT raises 42501 (new row violates row-level security);
-- a refused UPDATE matches no row. Each write is undone by its own savepoint
-- (a subtransaction: the block's exception arm), so the next person sees the
-- world as seeded. SECURITY INVOKER: it runs as the role and JWT of the
-- caller, which is the point.
create function pg_temp.try_moves_writes(c uuid, as_user uuid)
returns table (what text, landed boolean)
language plpgsql as $$
declare n int;
begin
  begin
    insert into public.moves (client_id, kind, lineage_id, title, declared_by)
      values (c, 'advice', '7e000000-0000-0000-0000-00000000000a', 'Tried', as_user);
    what := 'declare a move'; landed := true; return next;
    raise exception using errcode = 'P0001', message = 'undo';
  exception
    when insufficient_privilege then what := 'declare a move'; landed := false; return next;
    when raise_exception then null;
  end;
  begin
    update public.moves set status = 'done', updated_at = now() where client_id = c;
    get diagnostics n = row_count;
    what := 'change a move''s status'; landed := n > 0; return next;
    raise exception using errcode = 'P0001', message = 'undo';
  exception
    when insufficient_privilege then what := 'change a move''s status'; landed := false; return next;
    when raise_exception then null;
  end;
  begin
    insert into public.rec_decisions (client_id, lineage_id, recommendation_id, status, decided_by)
      values (c, '7e000000-0000-0000-0000-00000000000a', '7e000000-0000-0000-0000-00000000000a', 'dismissed', as_user);
    what := 'record a decision'; landed := true; return next;
    raise exception using errcode = 'P0001', message = 'undo';
  exception
    when insufficient_privilege then what := 'record a decision'; landed := false; return next;
    when raise_exception then null;
  end;
  begin
    update public.recommendations set status = 'dismissed' where client_id = c;
    get diagnostics n = row_count;
    what := 'set a recommendation''s status'; landed := n > 0; return next;
    raise exception using errcode = 'P0001', message = 'undo';
  exception
    when insufficient_privilege then what := 'set a recommendation''s status'; landed := false; return next;
    when raise_exception then null;
  end;
end $$;
grant execute on function pg_temp.try_moves_writes(uuid, uuid) to authenticated, service_role;

-- What a person reads of the three tables: "moves|decisions|recommendations".
create function pg_temp.reads() returns text language sql as $$
  select (select count(*) from public.moves) || '|' || (select count(*) from public.rec_decisions) || '|' || (select count(*) from public.recommendations)
$$;
grant execute on function pg_temp.reads() to authenticated, service_role;

-- 0. The policies: the four write policies replaced, the reads untouched.
do $$ declare n int; begin
  select count(*) into n from pg_policies where schemaname = 'public'
    and policyname in ('Members declare their own moves', 'Members move their moves along',
                       'Members record their own decisions', 'Users can update own recommendations');
  if n <> 0 then raise exception 'an old write policy is still there (% left)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and roles = '{authenticated}'
    and ((tablename = 'moves' and policyname = 'Owners and admins declare moves' and cmd = 'INSERT')
      or (tablename = 'moves' and policyname = 'Owners and admins move moves along' and cmd = 'UPDATE')
      or (tablename = 'rec_decisions' and policyname = 'Owners and admins record decisions' and cmd = 'INSERT')
      or (tablename = 'recommendations' and policyname = 'Owners and admins update recommendations' and cmd = 'UPDATE'))
    and with_check like '%get_my_role()%' and with_check like '%is_superadmin()%' and with_check like '%get_my_client_id()%'
    and (cmd = 'INSERT' or (qual like '%get_my_role()%' and qual like '%get_my_client_id()%'));
  if n <> 4 then raise exception 'expected the four role-gated write policies, found %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public'
    and tablename in ('moves', 'rec_decisions', 'recommendations') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and policyname not in ('Owners and admins declare moves', 'Owners and admins move moves along',
                           'Owners and admins record decisions', 'Owners and admins update recommendations');
  if n <> 0 then raise exception 'another write policy on the three tables: %', n; end if;
  -- The reads: one SELECT policy each, as before.
  select count(*) into n from pg_policies where schemaname = 'public' and cmd = 'SELECT'
    and policyname in ('Members read their moves', 'Members read their decisions', 'Users can view own recommendations');
  if n <> 3 then raise exception 'the three SELECT policies are not as they were (% found)', n; end if;
  -- And no grant moved: the columns a writer may touch are what they were.
  if not has_column_privilege('authenticated', 'public.moves', 'status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.moves', 'title', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.moves', 'dated_on', 'INSERT')
     or not has_column_privilege('authenticated', 'public.rec_decisions', 'decided_by', 'INSERT')
     or has_table_privilege('authenticated', 'public.rec_decisions', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.recommendations', 'status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.recommendations', 'title', 'UPDATE') then
    raise exception 'a column grant on moves, rec_decisions or recommendations moved';
  end if;
end $$;

-- 1. A's member: refused on all four; reads A's rows, never B's.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated"}';
select what, landed from pg_temp.try_moves_writes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000003');
do $$ declare r record; n int := 0; begin
  for r in select * from pg_temp.try_moves_writes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000003') loop
    n := n + 1;
    if r.landed then raise exception 'A''s member could %', r.what; end if;
  end loop;
  if n <> 4 then raise exception 'the member tried % writes, expected 4', n; end if;
  if pg_temp.reads() <> '1|1|1' then raise exception 'A''s member reads [%], expected 1|1|1', pg_temp.reads(); end if;
end $$;

-- 2. A's owner and A's admin: all four land in A; none in B; the actor stays
--    pinned (no move or decision filed under someone else's id).
do $$ declare who uuid; r record; n int; begin
  foreach who in array array['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002']::uuid[] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    n := 0;
    for r in select * from pg_temp.try_moves_writes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', who) loop
      n := n + 1;
      if not r.landed then raise exception '% could not %', who, r.what; end if;
    end loop;
    if n <> 4 then raise exception '% made % writes, expected 4', who, n; end if;
    for r in select * from pg_temp.try_moves_writes('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', who) loop
      if r.landed then raise exception '% could % in tenant B', who, r.what; end if;
    end loop;
    for r in select * from pg_temp.try_moves_writes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000003') loop
      if r.landed and r.what in ('declare a move', 'record a decision') then raise exception '% could % under the member''s name', who, r.what; end if;
    end loop;
    if pg_temp.reads() <> '1|1|1' then raise exception '% reads [%], expected 1|1|1', who, pg_temp.reads(); end if;
  end loop;
end $$;

-- 3. The operator: a platform admin whose own row in A is a member. The
--    platform-admin arm lets them write in A, and only in A.
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000ff", "role": "authenticated"}';
do $$ declare r record; n int := 0; begin
  for r in select * from pg_temp.try_moves_writes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-0000000000ff') loop
    n := n + 1;
    if not r.landed then raise exception 'the operator could not %', r.what; end if;
  end loop;
  if n <> 4 then raise exception 'the operator made % writes, expected 4', n; end if;
  for r in select * from pg_temp.try_moves_writes('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a0000000-0000-0000-0000-0000000000ff') loop
    if r.landed then raise exception 'the operator''s own session could % in tenant B', r.what; end if;
  end loop;
end $$;

-- 4. B's owner: their own tenant's writes land; reads B's rows, never A's.
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
do $$ declare r record; begin
  for r in select * from pg_temp.try_moves_writes('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000000-0000-0000-0000-000000000001') loop
    if not r.landed then raise exception 'B''s owner could not %', r.what; end if;
  end loop;
  if pg_temp.reads() <> '1|1|1' then raise exception 'B''s owner reads [%], expected 1|1|1', pg_temp.reads(); end if;
  if exists (select 1 from public.moves where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then raise exception 'B''s owner reads A''s moves'; end if;
end $$;

-- 5. The service role (the pipeline, the scripts, the operator viewing a
--    tenant): every write lands, in either tenant, and it reads everything.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
do $$ declare r record; c uuid; begin
  foreach c in array array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[] loop
    for r in select * from pg_temp.try_moves_writes(c, null) loop
      if not r.landed then raise exception 'the service role could not % in %', r.what, c; end if;
    end loop;
  end loop;
  if pg_temp.reads() <> '2|2|2' then raise exception 'the service role reads [%], expected 2|2|2', pg_temp.reads(); end if;
end $$;
reset role;

select 'moves role gate: a member refused on all four writes; owner, admin, operator and service role through; reads unchanged' as ok;

rollback;
