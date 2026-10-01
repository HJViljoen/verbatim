-- Checks for 20261105091000_held_snapshots_rls.sql, run on a throwaway cluster
-- after the migration (scripts/pg-shim/throwaway.sh check <dir> this-file).
-- Every check raises on a wrong answer, so the run stops at the first one;
-- the whole file is one transaction and rolls back.
--
-- The world: tenant A with a weekly-read review schedule and five builds, and
-- tenant B with one. A's member, the operator (a platform admin whose home is
-- A) and B's member each select `report_snapshots` through RLS, as PostgREST
-- would for their JWT.
--   held     carried by a `ready` send (built, held for review)
--   claimed  carried by a `claimed` send (built, not gone out)
--   sent     carried by a `sent` send
--   resent   carried by a `failed` send and then a `sent` one (heldOf: sent wins)
--   free     carried by no send (a page export)

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'member@a.test'),
  ('a0000000-0000-0000-0000-0000000000ff', 'operator@verbatim.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'member@b.test');
insert into public.clients (id, company_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B');
insert into public.users (id, client_id, full_name, email, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A member', 'member@a.test', 'owner'),
  ('a0000000-0000-0000-0000-0000000000ff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Operator', 'operator@verbatim.test', 'owner'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B member', 'member@b.test', 'owner');
insert into public.platform_admins (user_id) values ('a0000000-0000-0000-0000-0000000000ff');

insert into public.report_schedules (id, client_id, name, starter_key, artefact, review) values
  ('5c000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'This week in your market', 'weekly_read', 'weekly_read', true);

insert into public.report_snapshots (id, client_id, kind, ref, title, data) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'held', '{}'),
  ('50000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'claimed', '{}'),
  ('50000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'sent', '{}'),
  ('50000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'report', '{}', 'resent', '{}'),
  ('50000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'page', '{}', 'free', '{}'),
  ('50000000-0000-0000-0000-000000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'page', '{}', 'other tenant', '{}');

insert into public.report_sends (client_id, schedule_id, snapshot_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'ready'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002', 'claimed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000003', 'sent'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000004', 'failed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000004', 'sent');

-- One SELECT policy on the table, the rebuilt one.
do $$ declare n int; begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'report_snapshots';
  if n <> 1 then raise exception 'report_snapshots has % policies, expected 1', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'report_snapshots'
    and policyname = 'Users see their own report_snapshots' and cmd = 'SELECT' and qual like '%report_sends%';
  if n <> 1 then raise exception 'the held arm is not on the policy'; end if;
end $$;

-- A's member: the sent, the re-sent and the free build; never a held one,
-- never B's.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select string_agg(title, ', ' order by title) as tenant_a_member_sees from public.report_snapshots;
do $$ declare seen text; n int; begin
  select string_agg(title, ',' order by title) into seen from public.report_snapshots;
  if seen is distinct from 'free,resent,sent' then raise exception 'A''s member sees [%], expected [free,resent,sent]', seen; end if;
  -- Not by its id either, and not its data.
  select count(*) into n from public.report_snapshots where id = '50000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'A''s member reads the held build by its id'; end if;
  select count(*) into n from public.report_snapshots where id = '50000000-0000-0000-0000-000000000003' and data is not null;
  if n <> 1 then raise exception 'A''s member cannot read the sent build'; end if;
end $$;

-- The operator (a platform admin, home A): every build of A, held ones too.
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000ff", "role": "authenticated"}';
select string_agg(title, ', ' order by title) as operator_sees from public.report_snapshots;
do $$ declare seen text; begin
  select string_agg(title, ',' order by title) into seen from public.report_snapshots;
  if seen is distinct from 'claimed,free,held,resent,sent' then raise exception 'the operator sees [%]', seen; end if;
end $$;

-- B's member: B's own only.
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
do $$ declare seen text; begin
  select string_agg(title, ',' order by title) into seen from public.report_snapshots;
  if seen is distinct from 'other tenant' then raise exception 'B''s member sees [%]', seen; end if;
end $$;

-- Anonymous: nothing.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$ declare n int; begin
  select count(*) into n from public.report_snapshots;
  if n <> 0 then raise exception 'anon reads % snapshots', n; end if;
end $$;

-- Heinrich presses Send on the held build: from then on it is the workspace's.
reset role;
update public.report_sends set status = 'sent' where snapshot_id = '50000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select string_agg(title, ', ' order by title) as tenant_a_member_sees_after_send from public.report_snapshots;
do $$ declare seen text; begin
  select string_agg(title, ',' order by title) into seen from public.report_snapshots;
  if seen is distinct from 'free,held,resent,sent' then raise exception 'after the Send A''s member sees [%]', seen; end if;
end $$;

reset role;
select 'held-snapshots checks: all passed' as result;
rollback;
